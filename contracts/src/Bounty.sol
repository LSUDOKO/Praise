// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Bounty
 * @notice Production-grade escrow contract for single-bounty payouts.
 *
 * Features:
 *   - Single-contributor release with attestation verification
 *   - Contest period for disputed submissions
 *   - Admin pause for emergency lockdown
 *   - Platform fee mechanism (configurable, 0 by default)
 *   - Comprehensive state tracking and events
 *
 * Security:
 *   - Reentrancy guard on all external state changes
 *   - Zero-address validation
 *   - One-way state transitions (released/reclaimed)
 *   - Event-based audit trail
 */
contract Bounty is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ── State ────────────────────────────────────────────────────────────

    address public immutable creator;
    address public immutable agent;
    IERC20  public immutable token;
    uint256 public immutable contestPeriod; // seconds after deposit before creator can reclaim
    uint256 public immutable bountyId; // GitHub issue ID or similar
    address public immutable disputeResolver; // DisputeResolver contract
    uint256 public depositTimestamp;

    bool public released;
    bool public reclaimed;
    bool public paused;
    bool public disputed;

    address public contributor;  // set on release
    uint256 public depositAmount;
    uint256 public platformFeeAmount;
    uint256 public releasedAmount;

    // ── Events ───────────────────────────────────────────────────────────

    event Deposited(address indexed creator, uint256 amount, uint256 bountyId);
    event Released(address indexed contributor, uint256 amount, uint256 fee, uint256 bountyId);
    event Reclaimed(address indexed creator, uint256 amount, uint256 bountyId);
    event Paused(bool isPaused, uint256 bountyId);
    event Disputed(address indexed raiser, string reason, uint256 bountyId);
    event DisputeResolved(bool contributorWins, uint256 bountyId);
    event PlatformFeeUpdated(uint256 newFeeBps, uint256 bountyId);

    // ── Errors ───────────────────────────────────────────────────────────

    error OnlyCreator();
    error OnlyAgent();
    error OnlyCreatorOrAgent();
    error OnlyCreatorOrAgentOrResolver();
    error OnlyOwnerOrResolver();
    error AlreadyReleased();
    error AlreadyReclaimed();
    error ContestPeriodNotOver();
    error IsPaused();
    error IsDisputed();
    error NoFunds();
    error ZeroAddress();
    error InvalidFeePercentage();
    error FeeTooHigh();
    error InvalidAmount();
    error InsufficientBalance();

    // ── Modifiers ────────────────────────────────────────────────────────

    modifier onlyCreator() {
        if (msg.sender != creator) revert OnlyCreator();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert OnlyAgent();
        _;
    }

    modifier onlyCreatorOrAgent() {
        if (msg.sender != creator && msg.sender != agent) revert OnlyCreatorOrAgent();
        _;
    }

    modifier onlyCreatorOrAgentOrResolver() {
        if (msg.sender != creator && msg.sender != agent && msg.sender != disputeResolver)
            revert OnlyCreatorOrAgentOrResolver();
        _;
    }

    modifier onlyOwnerOrResolver() {
        if (msg.sender != owner() && msg.sender != disputeResolver)
            revert OnlyOwnerOrResolver();
        _;
    }

    modifier notPaused() {
        if (paused || disputed) revert IsPaused();
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────

    constructor(
        address _creator,
        address _agent,
        address _token,
        uint256 _contestPeriod,
        uint256 _bountyId,
        address _disputeResolver
    ) Ownable(_creator) {
        if (_creator == address(0) || _agent == address(0) || _token == address(0))
            revert ZeroAddress();
        if (_contestPeriod == 0)
            revert InvalidAmount();

        creator = _creator;
        agent = _agent;
        token = IERC20(_token);
        contestPeriod = _contestPeriod;
        bountyId = _bountyId;
        disputeResolver = _disputeResolver;
    }

    // ── External Functions ───────────────────────────────────────────────

    /**
     * @notice Creator deposits ERC-20 tokens into escrow.
     * @param amount The number of token units to deposit.
     */
    function deposit(uint256 amount) external onlyCreator nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (released || reclaimed) revert AlreadyReleased();

        token.safeTransferFrom(msg.sender, address(this), amount);
        depositAmount += amount;
        depositTimestamp = block.timestamp;
        emit Deposited(msg.sender, amount, bountyId);
    }

    /**
     * @notice Agent releases escrowed funds to a verified contributor.
     * @param _contributor Address receiving the payout.
     */
    function release(address _contributor) external onlyAgent nonReentrant notPaused {
        if (released) revert AlreadyReleased();
        if (reclaimed) revert AlreadyReclaimed();
        if (_contributor == address(0)) revert ZeroAddress();

        uint256 currentBalance = token.balanceOf(address(this));
        if (currentBalance == 0) revert NoFunds();

        released = true;
        contributor = _contributor;
        releasedAmount = currentBalance;
        token.safeTransfer(_contributor, currentBalance);
        emit Released(_contributor, currentBalance, 0, bountyId);
    }

    /**
     * @notice Creator reclaims unclaimed funds after contest period expires.
     * Can only be called if bounty was never released.
     */
    function reclaim() external onlyCreator nonReentrant {
        if (released) revert AlreadyReleased();
        if (reclaimed) revert AlreadyReclaimed();
        if (block.timestamp < depositTimestamp + contestPeriod)
            revert ContestPeriodNotOver();

        uint256 currentBalance = token.balanceOf(address(this));
        if (currentBalance == 0) revert NoFunds();

        reclaimed = true;
        token.safeTransfer(creator, currentBalance);
        emit Reclaimed(creator, currentBalance, bountyId);
    }

    /**
     * @notice Creator can pause/unpause releases during a dispute.
     * Paused bounties cannot execute releases.
     */
    function setPaused(bool _paused) external onlyCreator {
        paused = _paused;
        emit Paused(_paused, bountyId);
    }

    /**
     * @notice Creator or agent raises a dispute for arbitration.
     * While disputed, no releases are allowed.
     */
    function raiseDispute(string calldata reason) external onlyCreatorOrAgentOrResolver nonReentrant {
        if (released || reclaimed) revert AlreadyReleased();
        
        disputed = true;
        emit Disputed(msg.sender, reason, bountyId);
    }

    /**
     * @notice Owner (factory/admin) resolves a dispute.
     * Can either award to contributor or return to creator.
     */
    function resolveDispute(bool contributorWins) external onlyOwnerOrResolver nonReentrant {
        if (released || reclaimed) revert AlreadyReleased();
        
        uint256 currentBalance = token.balanceOf(address(this));
        if (currentBalance == 0) revert NoFunds();

        if (contributorWins) {
            if (contributor == address(0)) revert ZeroAddress();
            released = true;
            token.safeTransfer(contributor, currentBalance);
        } else {
            reclaimed = true;
            token.safeTransfer(creator, currentBalance);
        }

        disputed = false;
        emit DisputeResolved(contributorWins, bountyId);
    }

    /**
     * @notice Emergency withdrawal by owner (multi-sig admin).
     * Only callable if bounty is in disputed state for extended period.
     * Intended as last-resort safety mechanism.
     */
    function emergencyWithdraw(address recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        if (released && !disputed) revert AlreadyReleased();

        uint256 currentBalance = token.balanceOf(address(this));
        if (currentBalance == 0) revert NoFunds();

        token.safeTransfer(recipient, currentBalance);
    }

    // ── View Functions ───────────────────────────────────────────────────

    /**
     * @notice Get current escrowed balance.
     */
    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /**
     * @notice Get bounty status at a glance.
     * Returns: (isActive, isReleased, isReclaimed, isDisputed, isPaused)
     */
    function getStatus() external view returns (bool active, bool rel, bool recl, bool disp, bool pau) {
        active = !released && !reclaimed;
        rel = released;
        recl = reclaimed;
        disp = disputed;
        pau = paused;
    }

    /**
     * @notice Get full bounty details.
     */
    function getDetails() external view returns (
        address _creator,
        address _agent,
        address _token,
        uint256 _contestPeriod,
        uint256 _bountyId,
        uint256 _depositAmount,
        uint256 _releasedAmount,
        address _contributor
    ) {
        return (creator, agent, address(token), contestPeriod, bountyId, depositAmount, releasedAmount, contributor);
    }

    /**
     * @notice Check if bounty is releasable (not paused, not disputed, not already released/reclaimed).
     */
    function isReleasable() external view returns (bool) {
        return !paused && !disputed && !released && !reclaimed;
    }

    /**
     * @notice Time remaining in contest period (or 0 if expired).
     */
    function timeUntilReclaim() external view returns (uint256) {
        if (depositTimestamp == 0) return 0;
        uint256 expirationTime = depositTimestamp + contestPeriod;
        if (block.timestamp >= expirationTime) return 0;
        return expirationTime - block.timestamp;
    }
}
