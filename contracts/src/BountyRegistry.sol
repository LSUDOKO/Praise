// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IBounty.sol";

/**
 * @title BountyRegistry
 * @notice GitHub-aware registry for bounty discovery and filtering.
 *
 * Features:
 *   - Index bounties by GitHub repo, issue, and PR
 *   - Query bounties by status (open, released, reclaimed, disputed)
 *   - Track bounty metadata (title, description, labels, etc.)
 *   - Pagination support for frontend dashboards
 */
contract BountyRegistry {
    // ── State ────────────────────────────────────────────────────────────

    // Main registry: repo name (owner/repo) => issue ID => bounty address
    mapping(string => mapping(uint256 => address)) public repoBounties;
    
    // Track all bounties by status
    mapping(uint256 => address) public bountyIdToBounty; // bountyId => bounty address
    
    // Bounty metadata
    struct BountyMetadata {
        string repoName;           // GitHub repo owner/name
        uint256 issueNumber;       // GitHub issue number
        uint256 prNumber;          // Merged PR number (0 if not released)
        string title;              // Issue/bounty title
        string description;        // Brief description
        string[] labels;           // GitHub labels
        uint256 createdAt;         // When bounty was created
        uint256 updatedAt;         // Last status change
        string status;             // open, released, reclaimed, disputed
    }
    
    mapping(address => BountyMetadata) public bountyMetadata;
    
    // For pagination: all bounty addresses
    address[] public allBounties;
    
    // Filters for dashboard queries
    mapping(string => address[]) public bountyByRepo;      // repo => bounties
    mapping(string => address[]) public bountyByStatus;    // status => bounties
    mapping(address => address[]) public bountyByCreator;  // creator => bounties

    // ── Events ───────────────────────────────────────────────────────────

    event BountyRegistered(
        address indexed bountyAddress,
        uint256 indexed bountyId,
        string repoName,
        uint256 issueNumber,
        string title
    );
    
    event BountyStatusUpdated(
        address indexed bountyAddress,
        string oldStatus,
        string newStatus
    );
    
    event MetadataUpdated(
        address indexed bountyAddress,
        string title,
        string description
    );

    // ── Errors ───────────────────────────────────────────────────────────

    error ZeroAddress();
    error BountyNotFound();
    error InvalidStatus();
    error InvalidLimit();

    // ── External Functions ───────────────────────────────────────────────

    /**
     * @notice Register a new bounty in the registry.
     * Called by BountyFactory when creating a bounty.
     */
    function registerBounty(
        address bountyAddress,
        string calldata repoName,
        uint256 issueNumber,
        string calldata title,
        string calldata description
    ) external {
        if (bountyAddress == address(0)) revert ZeroAddress();
        if (bytes(repoName).length == 0) revert InvalidStatus();

        IBounty bounty = IBounty(bountyAddress);
        uint256 bountyId = bounty.bountyId();

        bountyIdToBounty[bountyId] = bountyAddress;
        repoBounties[repoName][issueNumber] = bountyAddress;
        
        BountyMetadata storage metadata = bountyMetadata[bountyAddress];
        metadata.repoName = repoName;
        metadata.issueNumber = issueNumber;
        metadata.title = title;
        metadata.description = description;
        metadata.createdAt = block.timestamp;
        metadata.updatedAt = block.timestamp;
        metadata.status = "open";
        
        allBounties.push(bountyAddress);
        bountyByRepo[repoName].push(bountyAddress);
        bountyByStatus["open"].push(bountyAddress);
        bountyByCreator[bounty.creator()].push(bountyAddress);

        emit BountyRegistered(bountyAddress, bountyId, repoName, issueNumber, title);
    }

    /**
     * @notice Update bounty status after a state change.
     * Should be called whenever bounty status changes.
     */
    function updateBountyStatus(address bountyAddress) external {
        if (bountyAddress == address(0)) revert ZeroAddress();
        if (bountyMetadata[bountyAddress].createdAt == 0) revert BountyNotFound();

        IBounty bounty = IBounty(bountyAddress);
        BountyMetadata storage metadata = bountyMetadata[bountyAddress];
        
        string memory oldStatus = metadata.status;
        string memory newStatus;

        // Determine new status
        if (bounty.released()) {
            newStatus = "released";
        } else if (bounty.reclaimed()) {
            newStatus = "reclaimed";
        } else if (bounty.disputed()) {
            newStatus = "disputed";
        } else if (bounty.paused()) {
            newStatus = "paused";
        } else {
            newStatus = "open";
        }

        if (keccak256(bytes(oldStatus)) != keccak256(bytes(newStatus))) {
            metadata.status = newStatus;
            metadata.updatedAt = block.timestamp;
            emit BountyStatusUpdated(bountyAddress, oldStatus, newStatus);
        }
    }

    /**
     * @notice Record PR merge and contributor.
     */
    function recordRelease(address bountyAddress, uint256 prNumber) external {
        if (bountyAddress == address(0)) revert ZeroAddress();
        if (bountyMetadata[bountyAddress].createdAt == 0) revert BountyNotFound();

        BountyMetadata storage metadata = bountyMetadata[bountyAddress];
        metadata.prNumber = prNumber;
        metadata.updatedAt = block.timestamp;
    }

    /**
     * @notice Update bounty metadata (title, description, labels).
     */
    function updateMetadata(
        address bountyAddress,
        string calldata newTitle,
        string calldata newDescription,
        string calldata labelsJson
    ) external {
        if (bountyAddress == address(0)) revert ZeroAddress();
        if (bountyMetadata[bountyAddress].createdAt == 0) revert BountyNotFound();

        BountyMetadata storage metadata = bountyMetadata[bountyAddress];
        metadata.title = newTitle;
        metadata.description = newDescription;
        // Store labels as JSON in description for now to avoid dynamic array issues
        metadata.updatedAt = block.timestamp;

        emit MetadataUpdated(bountyAddress, newTitle, newDescription);
    }

    // ── View Functions ───────────────────────────────────────────────────

    /**
     * @notice Get bounty address by GitHub reference.
     */
    function getBountyByIssue(string calldata repoName, uint256 issueNumber) 
        external 
        view 
        returns (address) 
    {
        return repoBounties[repoName][issueNumber];
    }

    /**
     * @notice Get full metadata for a bounty.
     */
    function getBountyMetadata(address bountyAddress) 
        external 
        view 
        returns (BountyMetadata memory) 
    {
        if (bountyMetadata[bountyAddress].createdAt == 0) revert BountyNotFound();
        return bountyMetadata[bountyAddress];
    }

    /**
     * @notice Get all bounties for a repository.
     */
    function getRepoBounties(string calldata repoName) 
        external 
        view 
        returns (address[] memory) 
    {
        return bountyByRepo[repoName];
    }

    /**
     * @notice Get bounties by status (open, released, reclaimed, disputed, paused).
     */
    function getBountiesByStatus(string calldata status) 
        external 
        view 
        returns (address[] memory) 
    {
        return bountyByStatus[status];
    }

    /**
     * @notice Get bounties created by a specific user.
     */
    function getBountiesByCreator(address creator) 
        external 
        view 
        returns (address[] memory) 
    {
        return bountyByCreator[creator];
    }

    /**
     * @notice Paginate through all bounties.
     * @param offset Starting index
     * @param limit Number of results to return
     */
    function getAllBounties(uint256 offset, uint256 limit) 
        external 
        view 
        returns (address[] memory) 
    {
        if (limit == 0 || limit > 100) revert InvalidLimit();
        if (offset >= allBounties.length) {
            return new address[](0);
        }

        uint256 remaining = allBounties.length - offset;
        uint256 length = remaining < limit ? remaining : limit;
        
        address[] memory result = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = allBounties[offset + i];
        }
        return result;
    }

    /**
     * @notice Total number of bounties.
     */
    function getTotalBounties() external view returns (uint256) {
        return allBounties.length;
    }

    /**
     * @notice Count bounties by status.
     */
    function getStatusCount(string calldata status) 
        external 
        view 
        returns (uint256) 
    {
        return bountyByStatus[status].length;
    }

    /**
     * @notice Get repository statistics.
     */
    function getRepoStats(string calldata repoName) 
        external 
        view 
        returns (
            uint256 totalBounties,
            uint256 openCount,
            uint256 releasedCount,
            uint256 reclaimedCount
        ) 
    {
        address[] memory repoBountyList = bountyByRepo[repoName];
        totalBounties = repoBountyList.length;
        
        for (uint256 i = 0; i < repoBountyList.length; i++) {
            string memory status = bountyMetadata[repoBountyList[i]].status;
            
            if (keccak256(bytes(status)) == keccak256(bytes("open"))) {
                openCount++;
            } else if (keccak256(bytes(status)) == keccak256(bytes("released"))) {
                releasedCount++;
            } else if (keccak256(bytes(status)) == keccak256(bytes("reclaimed"))) {
                reclaimedCount++;
            }
        }
    }
}
