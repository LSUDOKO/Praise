"use client";

import { Contract } from "ethers";
import {
  getUSDCBalance,
  approveUSDC,
  createBountyOnChain,
  depositToBounty,
  fetchAllBounties,
  fetchBountiesByCreator,
  getUSDCAllowance,
  agentReleaseBounty,
  isAttestationUsed,
  getAttestationTime,
  computeAttestationHash,
  getReadProvider,
  CONTRACT_ADDRESSES,
} from "@/lib/contracts/client";
import type { BountyInfo } from "@/lib/contracts/client";

// ── Exports ─────────────────────────────────────────────────────────────

export {
  getUSDCBalance,
  approveUSDC,
  createBountyOnChain,
  depositToBounty,
  fetchAllBounties,
  fetchBountiesByCreator,
  getUSDCAllowance,
  agentReleaseBounty,
  isAttestationUsed,
  getAttestationTime,
  computeAttestationHash,
};
export type { BountyInfo };
export { CONTRACT_ADDRESSES };

// ── Smart Account Functions ──────────────────────────────────────────────

/**
 * Check if an address is a Smart Account (has contract code).
 * Uses the read-only provider to avoid wallet connection issues.
 */
export async function isSmartAccount(address: string): Promise<boolean> {
  try {
    const provider = getReadProvider();
    const code = await provider.getCode(address);
    return code !== "0x";
  } catch (error) {
    console.error("Error checking Smart Account:", error);
    return false;
  }
}

/**
 * Get or create a Smart Account for the user.
 *
 * Checks if the user already has a Smart Account registered on-chain via
 * the SmartAccountAdapter. If so, returns it. If not, returns the user's
 * EOA address directly — the on-chain registration is skipped because
 * Web3Auth's Sapphire provider (AA/ERC-4337) does not support the
 * standard eth_sendTransaction RPC method needed to write to the contract.
 *
 * The registerSmartAccount function on the contract has no access control
 * and is purely informational (maps user -> smart account). Skipping it
 * does not affect any core functionality — permissions and delegations
 * work with the user's EOA address directly.
 *
 * @param userAddress - The user's wallet address
 */
export async function getOrCreateSmartAccount(
  userAddress: string
): Promise<string> {
  try {
    const readProvider = getReadProvider();
    const adapterAddress = CONTRACT_ADDRESSES.smartAccountAdapter;
    const SMART_ACCOUNT_ADAPTER_ABI = [
      "function getUserSmartAccount(address user) view returns (address)",
    ];

    const adapter = new Contract(adapterAddress, SMART_ACCOUNT_ADAPTER_ABI, readProvider);

    // Check if user already has a Smart Account registered on-chain
    const smartAccount: string = await adapter.getUserSmartAccount(userAddress);

    if (smartAccount !== "0x0000000000000000000000000000000000000000") {
      console.log("Found existing Smart Account:", smartAccount);
      return smartAccount;
    }

    // No on-chain registration — return the user's EOA as their smart account.
    // The registerSmartAccount function is purely informational and has no
    // access control. Skipping it doesn't affect any core functionality.
    console.log("Using EOA as Smart Account:", userAddress);
    return userAddress;
  } catch (error) {
    console.error("Error getting/creating Smart Account:", error);
    throw error;
  }
}

/**
 * Check if the bounty factory is currently paused.
 */
export async function isFactoryPaused(): Promise<boolean> {
  try {
    const provider = getReadProvider();
    const factory = new Contract(
      CONTRACT_ADDRESSES.bountyFactory,
      ["function paused() view returns (bool)"],
      provider
    );
    return await factory.paused();
  } catch {
    return false;
  }
}

/**
 * Create a bounty with full funding flow:
 * 1. Deploy the bounty via BountyFactory
 * 2. Approve USDC spending to the bounty contract
 * 3. Deposit USDC into the new bounty
 *
 * @param provider - Raw Web3Auth EIP-1193 provider (from Web3Auth context)
 * @param from     - User's wallet address
 */
export async function createBountyWithFunding(
  repoName: string,
  issueNumber: number,
  amount: string,
  contestPeriodSeconds: number,
  provider: any,
  from: string,
  agentAddress: string = CONTRACT_ADDRESSES.agentDelegation
): Promise<{ bountyId: number; bountyAddress: string; txHashes: string[] }> {
  const txHashes: string[] = [];

  // Step 1: Create the bounty on-chain
  const { bountyId, bountyAddress } = await createBountyOnChain(
    agentAddress,
    contestPeriodSeconds,
    repoName,
    issueNumber,
    provider,
    from
  );

  // Step 2: Approve USDC
  const approveTxHash = await approveUSDC(bountyAddress, amount, provider, from);
  txHashes.push(approveTxHash);

  // Step 3: Deposit USDC into the bounty
  const depositTxHash = await depositToBounty(bountyAddress, amount, provider, from);
  txHashes.push(depositTxHash);

  return { bountyId, bountyAddress, txHashes };
}

// ── Contract Addresses for Display ───────────────────────────────────────

export const NETWORK_INFO = {
  name: "Arbitrum Sepolia",
  chainId: CONTRACT_ADDRESSES.chainId,
  rpcUrl: CONTRACT_ADDRESSES.rpcUrl,
  usdcAddress: CONTRACT_ADDRESSES.usdc,
  explorer: "https://sepolia.arbiscan.io",
} as const;
