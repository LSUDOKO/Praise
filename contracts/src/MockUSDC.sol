// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice A simple ERC-20 token mimicking USDC for testnet usage.
 *         6 decimals, open mint for testing purposes.
 */
contract MockUSDC is ERC20 {
    uint8 private constant DECIMALS = 6;

    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice Anyone can mint tokens for testing.
     * @param to   Recipient address
     * @param amount Token amount (in 6-decimal units)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
