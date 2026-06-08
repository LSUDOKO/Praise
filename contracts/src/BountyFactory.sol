// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Bounty.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BountyFactory
 * @notice Production-grade factory for deploying and managing Bounty contracts.
 *
 * Features:
 *   - Deploy bounties with unique IDs
 *   - Track bounties by ID, address, or GitHub reference
 *   - Admin pause mechanism for emergency lockdown
 *   - Event emissions for indexing
 */
contract BountyFactory is Ownable {
    // ── State ────────────────────────────────────────────────────────────

    uint256 public bountyCount;
    mapping(uint256 => address) public bounties;  // bountyId => Bounty address
    mapping(address => uint256) public bountyIds; // Bounty address => bountyId
    
    // GitHub tracking: repo (owner/name) => issue ID => bounty ID
    mapping(string => mapping(uint256 => uint256)) public repoIssueToBounty;
    
    // Pause state
    bool public paused;

    // ── Events ───────────────────────────────────────────────────────────

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed bountyAddress,
        address indexed creator,
        address agent,
        address token,
        uint256 contestPeriod,
        string repoName,
        uint256 issueNumber
    );
    
    event FactoryPausedEvent(bool isPaused);

    // ── Errors ───────────────────────────────────────────────────────────

    error FactoryIsPaused();
    error ZeroAddress();

    // ── Constructor ──────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ── Modifiers ────────────────────────────────────────────────────────

    modifier notPaused() {
        if (paused) revert FactoryIsPaused();
        _;
    }

    // ── External Functions ───────────────────────────────────────────────

    /**
     * @notice Deploy a new Bounty escrow with GitHub reference.
     * @param agent          Address authorized to release funds (AgentDelegation contract).
     * @param token          ERC-20 token used for payment (e.g. USDC).
     * @param contestPeriod  Seconds before creator can reclaim unclaimed funds.
     * @param repoName       GitHub repo name (owner/repo).
     * @param issueNumber    GitHub issue number.
     * @return bountyId      The unique ID assigned to this bounty.
     * @return bountyAddress The deployed Bounty contract address.
     */
    function createBounty(
        address agent,
        address token,
        uint256 contestPeriod,
        string calldata repoName,
        uint256 issueNumber
    ) external notPaused returns (uint256 bountyId, address bountyAddress) {
        if (agent == address(0) || token == address(0)) revert ZeroAddress();
        
        bountyId = bountyCount++;

        Bounty bounty = new Bounty(
            msg.sender,  // creator
            agent,
            token,
            contestPeriod,
            bountyId
        );

        bountyAddress = address(bounty);
        bounties[bountyId] = bountyAddress;
        bountyIds[bountyAddress] = bountyId;
        
        // Track by GitHub reference
        if (bytes(repoName).length > 0) {
            repoIssueToBounty[repoName][issueNumber] = bountyId;
        }

        emit BountyCreated(
            bountyId,
            bountyAddress,
            msg.sender,
            agent,
            token,
            contestPeriod,
            repoName,
            issueNumber
        );
    }

    /**
     * @notice Emergency pause factory deployments.
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit FactoryPausedEvent(_paused);
    }

    // ── View Functions ───────────────────────────────────────────────────

    /**
     * @notice Get bounty address by ID.
     */
    function getBounty(uint256 _bountyId) external view returns (address) {
        return bounties[_bountyId];
    }

    /**
     * @notice Get bounty ID by GitHub reference.
     */
    function getBountyByIssue(string calldata repoName, uint256 issueNumber) 
        external 
        view 
        returns (uint256) 
    {
        return repoIssueToBounty[repoName][issueNumber];
    }

    /**
     * @notice Get bounty ID from contract address.
     */
    function getBountyId(address bountyAddress) external view returns (uint256) {
        return bountyIds[bountyAddress];
    }
}
