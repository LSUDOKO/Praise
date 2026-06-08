// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IBounty.sol";

/**
 * @title DisputeResolver
 * @notice Arbitration contract for resolving bounty disputes.
 *
 * Features:
 *   - Admin arbitration (quick resolution)
 *   - Multi-sig arbitrator support (decentralized governance)
 *   - Dispute evidence collection (IPFS hashes)
 *   - Appeal mechanism
 *   - Time-based auto-resolution if no arbitrator acts
 */
contract DisputeResolver is Ownable {
    // ── State ────────────────────────────────────────────────────────────

    // Dispute details
    struct Dispute {
        address bounty;
        address raiser;           // Who raised the dispute
        string reason;            // Reason for dispute
        uint256 createdAt;
        uint256 resolvedAt;
        address arbitrator;       // Who resolved it
        bool contributorWins;
        bool isResolved;
        bool isAppealed;
        uint256 appealedAt;
        string evidence;          // IPFS hash of evidence
    }

    mapping(address => Dispute) public disputes; // bounty => dispute
    address[] public allDisputes;
    
    // Arbitrators (multi-sig governance)
    mapping(address => bool) public arbitrators;
    uint256 public arbitratorCount;
    
    // Configuration
    uint256 public disputeResolutionWindow = 7 days;   // Time for arbitrator to resolve
    uint256 public appealWindow = 3 days;              // Time to appeal resolution
    uint256 public autoResolutionTime = 14 days;       // Auto-resolve as contributor win if unresolved
    uint256 public arbitratorFee = 1e6;                // Fee for arbitration (1 USDC)

    // ── Events ───────────────────────────────────────────────────────────

    event DisputeCreated(
        address indexed bounty,
        address indexed raiser,
        string reason,
        uint256 timestamp
    );
    
    event DisputeResolved(
        address indexed bounty,
        address indexed arbitrator,
        bool contributorWins,
        uint256 timestamp
    );
    
    event DisputeAppealed(
        address indexed bounty,
        address indexed appellant,
        uint256 timestamp
    );
    
    event DisputeAutoResolved(
        address indexed bounty,
        uint256 timestamp
    );
    
    event ArbitratorAdded(address indexed arbitrator);
    event ArbitratorRemoved(address indexed arbitrator);
    event ConfigUpdated(uint256 resolutionWindow, uint256 appealWindow, uint256 autoResolution);

    // ── Errors ───────────────────────────────────────────────────────────

    error ZeroAddress();
    error DisputeNotFound();
    error NotAuthorized();
    error DisputeAlreadyResolved();
    error AppealWindowClosed();
    error ResolutionWindowNotExpired();
    error OnlyArbitrator();
    error NoDisputeToResolve();

    // ── Constructor ──────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {
        arbitrators[msg.sender] = true;
        arbitratorCount = 1;
    }

    // ── External Functions ───────────────────────────────────────────────

    /**
     * @notice Create a new dispute for a bounty.
     * Called by Bounty contract or creator/contributor directly.
     */
    function createDispute(
        address bountyAddress,
        string calldata reason,
        string calldata evidenceHash
    ) external {
        if (bountyAddress == address(0)) revert ZeroAddress();
        if (disputes[bountyAddress].createdAt != 0) revert DisputeAlreadyResolved();

        IBounty bounty = IBounty(bountyAddress);
        
        // Verify caller is creator, agent, or contributor
        if (msg.sender != bounty.creator() && 
            msg.sender != bounty.agent() && 
            msg.sender != bounty.contributor()) {
            revert NotAuthorized();
        }

        disputes[bountyAddress] = Dispute({
            bounty: bountyAddress,
            raiser: msg.sender,
            reason: reason,
            createdAt: block.timestamp,
            resolvedAt: 0,
            arbitrator: address(0),
            contributorWins: false,
            isResolved: false,
            isAppealed: false,
            appealedAt: 0,
            evidence: evidenceHash
        });

        allDisputes.push(bountyAddress);

        bounty.raiseDispute(reason);

        emit DisputeCreated(bountyAddress, msg.sender, reason, block.timestamp);
    }

    /**
     * @notice Arbitrator resolves a dispute.
     */
    function resolveDispute(address bountyAddress, bool contributorWins) 
        external 
    {
        if (bountyAddress == address(0)) revert ZeroAddress();
        if (!arbitrators[msg.sender]) revert OnlyArbitrator();
        
        Dispute storage dispute = disputes[bountyAddress];
        if (dispute.createdAt == 0) revert DisputeNotFound();
        if (dispute.isResolved) revert DisputeAlreadyResolved();

        dispute.isResolved = true;
        dispute.resolvedAt = block.timestamp;
        dispute.arbitrator = msg.sender;
        dispute.contributorWins = contributorWins;

        IBounty(bountyAddress).resolveDispute(contributorWins);

        emit DisputeResolved(bountyAddress, msg.sender, contributorWins, block.timestamp);
    }

    /**
     * @notice Appeal a dispute resolution within appeal window.
     */
    function appealDispute(address bountyAddress, string calldata appealReason) 
        external 
    {
        if (bountyAddress == address(0)) revert ZeroAddress();
        
        Dispute storage dispute = disputes[bountyAddress];
        if (dispute.createdAt == 0) revert DisputeNotFound();
        if (!dispute.isResolved) revert NoDisputeToResolve();
        if (block.timestamp > dispute.resolvedAt + appealWindow) revert AppealWindowClosed();

        // Only original raiser or owner can appeal
        if (msg.sender != dispute.raiser && msg.sender != owner()) revert NotAuthorized();

        dispute.isAppealed = true;
        dispute.appealedAt = block.timestamp;
        dispute.isResolved = false;
        dispute.arbitrator = address(0);
        dispute.evidence = appealReason;

        emit DisputeAppealed(bountyAddress, msg.sender, block.timestamp);
    }

    /**
     * @notice Auto-resolve dispute if arbitrator didn't act within window.
     * Defaults to contributor win (more lenient for contributors).
     */
    function autoResolveDispute(address bountyAddress) external {
        if (bountyAddress == address(0)) revert ZeroAddress();
        
        Dispute storage dispute = disputes[bountyAddress];
        if (dispute.createdAt == 0) revert DisputeNotFound();
        if (dispute.isResolved) revert DisputeAlreadyResolved();
        if (block.timestamp < dispute.createdAt + autoResolutionTime) 
            revert ResolutionWindowNotExpired();

        dispute.isResolved = true;
        dispute.resolvedAt = block.timestamp;
        dispute.arbitrator = address(this);
        dispute.contributorWins = true;

        IBounty(bountyAddress).resolveDispute(true);

        emit DisputeAutoResolved(bountyAddress, block.timestamp);
    }

    /**
     * @notice Owner adds an arbitrator (multi-sig member).
     */
    function addArbitrator(address arbitrator) external onlyOwner {
        if (arbitrator == address(0)) revert ZeroAddress();
        if (!arbitrators[arbitrator]) {
            arbitrators[arbitrator] = true;
            arbitratorCount++;
            emit ArbitratorAdded(arbitrator);
        }
    }

    /**
     * @notice Owner removes an arbitrator.
     */
    function removeArbitrator(address arbitrator) external onlyOwner {
        if (arbitrator == address(0)) revert ZeroAddress();
        if (arbitrators[arbitrator]) {
            arbitrators[arbitrator] = false;
            arbitratorCount--;
            emit ArbitratorRemoved(arbitrator);
        }
    }

    /**
     * @notice Owner updates configuration parameters.
     */
    function updateConfig(
        uint256 newResolutionWindow,
        uint256 newAppealWindow,
        uint256 newAutoResolutionTime
    ) external onlyOwner {
        if (newResolutionWindow == 0 || newAppealWindow == 0 || newAutoResolutionTime == 0)
            revert ZeroAddress();

        disputeResolutionWindow = newResolutionWindow;
        appealWindow = newAppealWindow;
        autoResolutionTime = newAutoResolutionTime;

        emit ConfigUpdated(newResolutionWindow, newAppealWindow, newAutoResolutionTime);
    }

    // ── View Functions ───────────────────────────────────────────────────

    /**
     * @notice Get dispute details.
     */
    function getDispute(address bountyAddress) 
        external 
        view 
        returns (Dispute memory) 
    {
        if (disputes[bountyAddress].createdAt == 0) revert DisputeNotFound();
        return disputes[bountyAddress];
    }

    /**
     * @notice Check if bounty has an open dispute.
     */
    function hasOpenDispute(address bountyAddress) external view returns (bool) {
        return disputes[bountyAddress].createdAt != 0 && !disputes[bountyAddress].isResolved;
    }

    /**
     * @notice Get all disputes (paginated).
     */
    function getAllDisputes(uint256 offset, uint256 limit) 
        external 
        view 
        returns (address[] memory) 
    {
        if (limit == 0 || limit > 100) revert ZeroAddress();
        if (offset >= allDisputes.length) return new address[](0);

        uint256 remaining = allDisputes.length - offset;
        uint256 length = remaining < limit ? remaining : limit;
        
        address[] memory result = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = allDisputes[offset + i];
        }
        return result;
    }

    /**
     * @notice Count total disputes.
     */
    function getTotalDisputes() external view returns (uint256) {
        return allDisputes.length;
    }

    /**
     * @notice Check if address is an arbitrator.
     */
    function isArbitrator(address account) external view returns (bool) {
        return arbitrators[account];
    }

    /**
     * @notice Get time until auto-resolution.
     */
    function getTimeToAutoResolution(address bountyAddress) 
        external 
        view 
        returns (uint256) 
    {
        Dispute storage dispute = disputes[bountyAddress];
        if (dispute.createdAt == 0) revert DisputeNotFound();
        if (dispute.isResolved) return 0;

        uint256 expirationTime = dispute.createdAt + autoResolutionTime;
        if (block.timestamp >= expirationTime) return 0;

        return expirationTime - block.timestamp;
    }

    /**
     * @notice Get time remaining in appeal window.
     */
    function getTimeToAppealExpiration(address bountyAddress) 
        external 
        view 
        returns (uint256) 
    {
        Dispute storage dispute = disputes[bountyAddress];
        if (dispute.createdAt == 0) revert DisputeNotFound();
        if (!dispute.isResolved) return 0;

        uint256 appealDeadline = dispute.resolvedAt + appealWindow;
        if (block.timestamp >= appealDeadline) return 0;

        return appealDeadline - block.timestamp;
    }
}
