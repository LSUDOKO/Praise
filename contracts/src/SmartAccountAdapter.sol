// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IBounty.sol";

/**
 * @title SmartAccountAdapter
 * @notice Bridge contract for MetaMask Smart Accounts integration.
 *
 * Features:
 *   - ERC-7702 account upgrade coordination
 *   - ERC-7715 advanced permissions delegation
 *   - ERC-7710 delegation validation
 *   - Session key management
 *   - Permission scope enforcement
 *
 * Integration Points:
 *   - Bounty creators get Smart Accounts with delegation permissions
 *   - Agent gets scoped authority to release specific bounties
 *   - Contributors can receive payments gaslessly via 1Shot relayer
 */
contract SmartAccountAdapter is Ownable {
    // ── State ────────────────────────────────────────────────────────────

    // Permission model for delegation
    struct Permission {
        address delegator;        // Bounty creator
        address delegatee;        // Agent (AgentDelegation contract)
        address bountyAddress;
        uint256 maxAmount;        // Max USDC that can be released
        uint256 expiresAt;        // Permission expiration
        bool active;
    }

    mapping(bytes32 => Permission) public permissions; // permission ID => details
    mapping(address => bytes32[]) public delegatorPermissions;   // delegator => permission IDs
    mapping(address => bytes32[]) public bountyPermissions;      // bounty => permission IDs

    // Session keys for agent automation
    struct SessionKey {
        address sessionKey;       // Public key or address
        address delegator;
        uint256 expiresAt;
        uint256 maxReleasesPerDay;
        uint256 releaseCount;
        uint256 lastReleaseDay;
        bool active;
    }

    mapping(bytes32 => SessionKey) public sessionKeys; // session ID => details
    mapping(address => bytes32[]) public delegatorSessions;

    // Smart Account tracking
    mapping(address => address) public userSmartAccount;     // EOA => Smart Account
    mapping(address => address) public smartAccountOwner;    // Smart Account => EOA
    mapping(address => bool) public isSmartAccount;

    // Configuration
    address public metaMaskSmartAccountFactory;
    address public oneShotRelayer;
    uint256 public defaultPermissionDuration = 90 days;

    // ── Events ───────────────────────────────────────────────────────────

    event PermissionGranted(
        bytes32 indexed permissionId,
        address indexed delegator,
        address indexed delegatee,
        address bountyAddress,
        uint256 maxAmount,
        uint256 expiresAt
    );

    event PermissionRevoked(
        bytes32 indexed permissionId,
        address indexed delegator
    );

    event PermissionExecuted(
        bytes32 indexed permissionId,
        address indexed bountyAddress,
        uint256 amount,
        address contributor
    );

    event SessionKeyCreated(
        bytes32 indexed sessionId,
        address indexed delegator,
        address sessionKey,
        uint256 expiresAt
    );

    event SessionKeyRevoked(
        bytes32 indexed sessionId,
        address indexed delegator
    );

    event SmartAccountCreated(
        address indexed userAddress,
        address indexed smartAccount
    );

    // ── Errors ───────────────────────────────────────────────────────────

    error ZeroAddress();
    error PermissionNotFound();
    error PermissionExpired();
    error ExceedsMaxAmount();
    error PermissionInactive();
    error SessionKeyNotFound();
    error SessionKeyExpired();
    error DailyLimitExceeded();
    error NotAuthorized();
    error InvalidAmount();

    // ── Constructor ──────────────────────────────────────────────────────

    constructor(address _factory, address _relayer) Ownable(msg.sender) {
        if (_factory == address(0) || _relayer == address(0)) revert ZeroAddress();
        metaMaskSmartAccountFactory = _factory;
        oneShotRelayer = _relayer;
    }

    // ── Permission Management ────────────────────────────────────────────

    /**
     * @notice Grant delegation permission for bounty releases.
     * Called by bounty creator (via MetaMask UI flow).
     *
     * ERC-7715 Permission Scope:
     *   - Can only release up to maxAmount USDC
     *   - Can only target this bounty
     *   - Expires after duration
     *   - Requires creator's approval
     */
    function grantPermission(
        address delegatee,      // AgentDelegation contract
        address bountyAddress,
        uint256 maxAmount,
        uint256 durationSeconds
    ) external returns (bytes32 permissionId) {
        if (delegatee == address(0) || bountyAddress == address(0)) revert ZeroAddress();
        if (maxAmount == 0) revert InvalidAmount();

        IBounty bounty = IBounty(bountyAddress);
        if (msg.sender != bounty.creator()) revert NotAuthorized();

        uint256 expiresAt = block.timestamp + durationSeconds;
        
        permissionId = keccak256(
            abi.encodePacked(msg.sender, delegatee, bountyAddress, block.timestamp)
        );

        permissions[permissionId] = Permission({
            delegator: msg.sender,
            delegatee: delegatee,
            bountyAddress: bountyAddress,
            maxAmount: maxAmount,
            expiresAt: expiresAt,
            active: true
        });

        delegatorPermissions[msg.sender].push(permissionId);
        bountyPermissions[bountyAddress].push(permissionId);

        emit PermissionGranted(
            permissionId,
            msg.sender,
            delegatee,
            bountyAddress,
            maxAmount,
            expiresAt
        );
    }

    /**
     * @notice Revoke a previously granted permission.
     */
    function revokePermission(bytes32 permissionId) external {
        Permission storage perm = permissions[permissionId];
        if (perm.delegator != msg.sender && msg.sender != owner()) revert NotAuthorized();

        perm.active = false;
        emit PermissionRevoked(permissionId, perm.delegator);
    }

    /**
     * @notice Execute a release under an active permission.
     * Called by agent or 1Shot relayer on behalf of agent.
     */
    function executePermission(
        bytes32 permissionId,
        address contributor,
        uint256 amount
    ) external {
        Permission storage perm = permissions[permissionId];
        
        if (perm.delegator == address(0)) revert PermissionNotFound();
        if (!perm.active) revert PermissionInactive();
        if (block.timestamp > perm.expiresAt) revert PermissionExpired();
        if (amount > perm.maxAmount) revert ExceedsMaxAmount();

        IBounty bounty = IBounty(perm.bountyAddress);
        if (msg.sender != perm.delegatee && msg.sender != perm.delegatee) revert NotAuthorized();

        // Execute release
        bounty.release(contributor);

        emit PermissionExecuted(permissionId, perm.bountyAddress, amount, contributor);
    }

    /**
     * @notice Check if a permission is valid.
     */
    function isPermissionValid(bytes32 permissionId) external view returns (bool) {
        Permission memory perm = permissions[permissionId];
        return perm.active && block.timestamp <= perm.expiresAt;
    }

    // ── Session Key Management ───────────────────────────────────────────

    /**
     * @notice Create a session key for automated releases.
     * Agent/delegator can pre-authorize a session for batch operations.
     */
    function createSessionKey(
        address sessionKey,
        uint256 durationSeconds,
        uint256 maxReleasesPerDay
    ) external returns (bytes32 sessionId) {
        if (sessionKey == address(0)) revert ZeroAddress();
        if (maxReleasesPerDay == 0) revert InvalidAmount();

        uint256 expiresAt = block.timestamp + durationSeconds;

        sessionId = keccak256(
            abi.encodePacked(msg.sender, sessionKey, block.timestamp)
        );

        sessionKeys[sessionId] = SessionKey({
            sessionKey: sessionKey,
            delegator: msg.sender,
            expiresAt: expiresAt,
            maxReleasesPerDay: maxReleasesPerDay,
            releaseCount: 0,
            lastReleaseDay: 0,
            active: true
        });

        delegatorSessions[msg.sender].push(sessionId);

        emit SessionKeyCreated(sessionId, msg.sender, sessionKey, expiresAt);
    }

    /**
     * @notice Revoke a session key.
     */
    function revokeSessionKey(bytes32 sessionId) external {
        SessionKey storage session = sessionKeys[sessionId];
        if (session.delegator != msg.sender && msg.sender != owner()) revert NotAuthorized();

        session.active = false;
        emit SessionKeyRevoked(sessionId, session.delegator);
    }

    // ── Smart Account Integration ────────────────────────────────────────

    /**
     * @notice Register that a user has a Smart Account (post-7702 upgrade).
     * Called after wallet connects and SmartAccount is created.
     */
    function registerSmartAccount(address userAddress, address smartAccount) external {
        if (userAddress == address(0) || smartAccount == address(0)) revert ZeroAddress();
        
        userSmartAccount[userAddress] = smartAccount;
        smartAccountOwner[smartAccount] = userAddress;
        isSmartAccount[smartAccount] = true;

        emit SmartAccountCreated(userAddress, smartAccount);
    }

    /**
     * @notice Get user's Smart Account address.
     */
    function getUserSmartAccount(address userAddress) external view returns (address) {
        return userSmartAccount[userAddress];
    }

    /**
     * @notice Get EOA owner of a Smart Account.
     */
    function getSmartAccountOwner(address smartAccount) external view returns (address) {
        return smartAccountOwner[smartAccount];
    }

    // ── Configuration ────────────────────────────────────────────────────

    /**
     * @notice Update default permission duration.
     */
    function setDefaultPermissionDuration(uint256 newDuration) external onlyOwner {
        if (newDuration == 0) revert InvalidAmount();
        defaultPermissionDuration = newDuration;
    }

    /**
     * @notice Update 1Shot relayer address.
     */
    function setOneShotRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        oneShotRelayer = newRelayer;
    }

    // ── View Functions ───────────────────────────────────────────────────

    /**
     * @notice Get all permissions for a delegator.
     */
    function getDelegatorPermissions(address delegator) 
        external 
        view 
        returns (bytes32[] memory) 
    {
        return delegatorPermissions[delegator];
    }

    /**
     * @notice Get all permissions for a bounty.
     */
    function getBountyPermissions(address bountyAddress) 
        external 
        view 
        returns (bytes32[] memory) 
    {
        return bountyPermissions[bountyAddress];
    }

    /**
     * @notice Get permission details.
     */
    function getPermission(bytes32 permissionId) 
        external 
        view 
        returns (Permission memory) 
    {
        if (permissions[permissionId].delegator == address(0)) revert PermissionNotFound();
        return permissions[permissionId];
    }

    /**
     * @notice Get session key details.
     */
    function getSessionKey(bytes32 sessionId) 
        external 
        view 
        returns (SessionKey memory) 
    {
        if (sessionKeys[sessionId].delegator == address(0)) revert SessionKeyNotFound();
        return sessionKeys[sessionId];
    }

    /**
     * @notice Get all session keys for a delegator.
     */
    function getDelegatorSessions(address delegator) 
        external 
        view 
        returns (bytes32[] memory) 
    {
        return delegatorSessions[delegator];
    }
}
