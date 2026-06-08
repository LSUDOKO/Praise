// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";
import "../src/AgentDelegation.sol";
import "../src/BountyFactory.sol";
import "../src/BountyRegistry.sol";
import "../src/DisputeResolver.sol";
import "../src/SmartAccountAdapter.sol";

/**
 * @title Deploy
 * @notice Deploys all PRaise smart contracts to a target chain.
 *
 * Usage:
 *   forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
 *   
 * For Arbitrum Sepolia (REAL USDC):
 *   export USDC_ADDRESS=0x75Cc4fDf07DA32FD5A00f8B922e7d51DDA4e50b9
 *   forge script script/Deploy.s.sol:Deploy --rpc-url https://sepolia-rollup.arbitrum.io/rpc --private-key $PRIVATE_KEY --broadcast
 *
 * Environment variables:
 *   TRUSTED_SIGNER           - Address of the 1Shot server wallet that signs attestations
 *   SCORE_THRESHOLD          - Minimum Venice AI score to allow release (default: 80)
 *   USDC_ADDRESS             - Real USDC address (optional; deploys MockUSDC if not set)
 *   METAMASK_FACTORY         - MetaMask Smart Account Factory address (optional)
 *   ONESHOT_RELAYER          - 1Shot Relayer address (optional)
 */
contract Deploy is Script {
    function run() external {
        address trustedSigner = vm.envAddress("TRUSTED_SIGNER");
        uint256 scoreThreshold = vm.envOr("SCORE_THRESHOLD", uint256(80));
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        address metaMaskFactory = vm.envOr("METAMASK_FACTORY", address(0));
        address oneShotRelayer = vm.envOr("ONESHOT_RELAYER", address(0));

        vm.startBroadcast();

        // Deploy or use real USDC
        address usdc;
        if (usdcAddress == address(0)) {
            // Deploy MockUSDC for testing
            MockUSDC mockUsdc = new MockUSDC();
            usdc = address(mockUsdc);
            console.log("MockUSDC deployed at:", usdc);
        } else {
            // Use real USDC (e.g., on Arbitrum Sepolia)
            usdc = usdcAddress;
            console.log("Using real USDC at:", usdc);
        }

        // Deploy core bounty contracts
        AgentDelegation agentDelegation = new AgentDelegation(trustedSigner, scoreThreshold);
        console.log("AgentDelegation deployed at:", address(agentDelegation));

        BountyFactory factory = new BountyFactory();
        console.log("BountyFactory deployed at:", address(factory));

        // Deploy registry and resolver
        BountyRegistry registry = new BountyRegistry();
        console.log("BountyRegistry deployed at:", address(registry));

        DisputeResolver disputeResolver = new DisputeResolver();
        console.log("DisputeResolver deployed at:", address(disputeResolver));

        // Wire the Dispute Resolver into the BountyFactory so new bounties
        // allow it to raise and resolve disputes.
        factory.setDisputeResolver(address(disputeResolver));
        console.log("DisputeResolver wired into BountyFactory:", address(disputeResolver));

        // Deploy Smart Account integration
        SmartAccountAdapter smartAccountAdapter = new SmartAccountAdapter(
            metaMaskFactory != address(0) ? metaMaskFactory : address(factory),
            oneShotRelayer != address(0) ? oneShotRelayer : msg.sender
        );
        console.log("SmartAccountAdapter deployed at:", address(smartAccountAdapter));

        vm.stopBroadcast();

        // Log summary
        console.log("\n=== PRaise Deployment Summary ===");
        console.log("USDC:", usdc);
        console.log("AgentDelegation:", address(agentDelegation));
        console.log("BountyFactory:", address(factory));
        console.log("BountyRegistry:", address(registry));
        console.log("DisputeResolver:", address(disputeResolver));
        console.log("SmartAccountAdapter:", address(smartAccountAdapter));
        console.log("Trusted Signer:", trustedSigner);
        console.log("Score Threshold:", scoreThreshold);
        console.log("================================");
    }
}

