// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IBounty.sol";

/**
 * @title AgentDelegation
 * @notice Production-grade on-chain verifier for AI review attestations.
 *
 * Features:
 *   - Signature verification with signer tracking
 *   - Score threshold enforcement (AI quality gate)
 *   - Replay attack prevention with per-attestation tracking
 *   - Time-based expiration for attestations
 *   - Signer revocation mechanism
 *   - Event-based audit trail for attestations
 *
 * Flow:
 *   1. Off-chain: Venice AI reviews PR, produces score + digest
 *   2. Off-chain: Server wallet signs attestation
 *   3. On-chain: Agent calls verifyAndRelease() with attestation
 *   4. On-chain: This contract verifies signature, checks score, calls Bounty.release()
 */
contract AgentDelegation is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ── State ────────────────────────────────────────────────────────────

    address public immutable trustedSigner; // Server wallet address
    uint256 public immutable scoreThreshold; // Minimum Venice AI score (e.g., 80)
    
    // Attestation tracking
    mapping(bytes32 => bool) public usedAttestations; // prevent replay
    mapping(bytes32 => uint256) public attestationTimestamp; // when issued
    
    // Signer management
    mapping(address => bool) public revokedSigners;
    
    // Attestation expiration (default 30 days)
    uint256 public attestationTTL = 30 days;
    
    // Rate limiting: bounty => (time window => count)
    mapping(address => uint256) public releaseCount;
    mapping(address => uint256) public lastReleaseTime;
    uint256 public releaseRateLimit = 10; // max 10 releases per time window
    uint256 public rateLimitWindow = 1 hours; // per hour

    // ── Events ───────────────────────────────────────────────────────────

    event AttestationVerified(
        address indexed bounty,
        address indexed contributor,
        uint256 score,
        bytes32 attestationHash,
        uint256 timestamp
    );
    
    event SignerRevoked_(address indexed signer, uint256 timestamp);
    event AttestationTTLUpdated(uint256 newTTL);
    event RateLimitUpdated(uint256 maxReleases, uint256 windowSeconds);

    // ── Errors ───────────────────────────────────────────────────────────

    error InvalidSignature();
    error ScoreBelowThreshold(uint256 score, uint256 threshold);
    error AttestationAlreadyUsed();
    error AttestationExpired();
    error NotBountyAgent();
    error ZeroAddress();
    error SignerRevokedError();
    error RateLimitExceeded();

    // ── Constructor ──────────────────────────────────────────────────────

    constructor(address _trustedSigner, uint256 _scoreThreshold) Ownable(msg.sender) {
        if (_trustedSigner == address(0)) revert ZeroAddress();
        trustedSigner = _trustedSigner;
        scoreThreshold = _scoreThreshold;
    }

    // ── External Functions ───────────────────────────────────────────────

    /**
     * @notice Verify an AI review attestation and release bounty funds.
     * @param bountyAddress  Address of the Bounty escrow contract.
     * @param contributor    Address to receive the payout.
     * @param score          AI review score (0-100).
     * @param prMergeHash    Hash of the merged PR (e.g. keccak256(repo + PR number)).
     * @param nonce          Unique nonce to prevent replay.
     * @param signature      ECDSA signature from the trusted signer.
     */
    function verifyAndRelease(
        address bountyAddress,
        address contributor,
        uint256 score,
        bytes32 prMergeHash,
        uint256 nonce,
        bytes calldata signature
    ) external {
        if (contributor == address(0) || bountyAddress == address(0))
            revert ZeroAddress();

        // Check this contract is the agent on the bounty
        IBounty bounty = IBounty(bountyAddress);
        if (bounty.agent() != address(this)) revert NotBountyAgent();

        // Build attestation hash
        bytes32 attestationHash = keccak256(
            abi.encodePacked(bountyAddress, contributor, score, prMergeHash, nonce)
        );

        // Prevent replay
        if (usedAttestations[attestationHash]) revert AttestationAlreadyUsed();

        // Check attestation not expired
        uint256 issuedTime = attestationTimestamp[attestationHash];
        if (issuedTime == 0) {
            // First time seeing this attestation - record time
            attestationTimestamp[attestationHash] = block.timestamp;
        } else if (block.timestamp > issuedTime + attestationTTL) {
            revert AttestationExpired();
        }

        // Verify signature from trusted signer
        bytes32 ethSignedHash = attestationHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(signature);
        
        if (recovered != trustedSigner) revert InvalidSignature();
        if (revokedSigners[recovered]) revert SignerRevokedError();

        // Check score meets threshold
        if (score < scoreThreshold) 
            revert ScoreBelowThreshold(score, scoreThreshold);

        // Check rate limiting
        _checkRateLimit(bountyAddress);

        // Mark as used and execute release
        usedAttestations[attestationHash] = true;
        bounty.release(contributor);

        emit AttestationVerified(
            bountyAddress, 
            contributor, 
            score, 
            attestationHash, 
            block.timestamp
        );
    }

    /**
     * @notice Owner updates attestation time-to-live (expiration window).
     */
    function setAttestationTTL(uint256 newTTL) external onlyOwner {
        if (newTTL == 0) revert ZeroAddress();
        attestationTTL = newTTL;
        emit AttestationTTLUpdated(newTTL);
    }

    /**
     * @notice Owner revokes a signer (for compromised keys).
     */
    function revokeSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        revokedSigners[signer] = true;
        emit SignerRevoked_(signer, block.timestamp);
    }

    /**
     * @notice Owner updates rate limiting parameters.
     */
    function setRateLimit(uint256 maxReleases, uint256 windowSeconds) external onlyOwner {
        if (maxReleases == 0 || windowSeconds == 0) revert ZeroAddress();
        releaseRateLimit = maxReleases;
        rateLimitWindow = windowSeconds;
        emit RateLimitUpdated(maxReleases, windowSeconds);
    }

    // ── Internal Functions ───────────────────────────────────────────────

    /**
     * @notice Check rate limiting for bounty releases (prevent spam).
     */
    function _checkRateLimit(address bountyAddress) internal {
        uint256 currentTime = block.timestamp;
        uint256 lastTime = lastReleaseTime[bountyAddress];
        
        // Reset counter if outside window
        if (currentTime > lastTime + rateLimitWindow) {
            releaseCount[bountyAddress] = 0;
            lastReleaseTime[bountyAddress] = currentTime;
        }
        
        // Check limit
        if (releaseCount[bountyAddress] >= releaseRateLimit)
            revert RateLimitExceeded();
        
        releaseCount[bountyAddress]++;
    }

    // ── View Functions ───────────────────────────────────────────────────

    /**
     * @notice Check if attestation has been used (prevent double-spending).
     */
    function isAttestationUsed(bytes32 attestationHash) external view returns (bool) {
        return usedAttestations[attestationHash];
    }

    /**
     * @notice Check if signer is revoked.
     */
    function isSignerRevoked(address signer) external view returns (bool) {
        return revokedSigners[signer];
    }

    /**
     * @notice Get attestation issue time.
     */
    function getAttestationTime(bytes32 attestationHash) external view returns (uint256) {
        return attestationTimestamp[attestationHash];
    }

    /**
     * @notice Check if attestation is still valid (not expired).
     */
    function isAttestationValid(bytes32 attestationHash) external view returns (bool) {
        uint256 issuedTime = attestationTimestamp[attestationHash];
        if (issuedTime == 0) return true; // Never seen before
        return block.timestamp <= issuedTime + attestationTTL;
    }
}
