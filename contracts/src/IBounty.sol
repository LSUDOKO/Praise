// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IBounty
 * @notice Shared interface for bounty contracts used across PRaise
 */
interface IBounty {
    function release(address contributor) external;
    function agent() external view returns (address);
    function creator() external view returns (address);
    function contributor() external view returns (address);
    function token() external view returns (address);
    function released() external view returns (bool);
    function reclaimed() external view returns (bool);
    function disputed() external view returns (bool);
    function paused() external view returns (bool);
    function depositAmount() external view returns (uint256);
    function bountyId() external view returns (uint256);
    function raiseDispute(string calldata reason) external;
    function resolveDispute(bool contributorWins) external;
}
