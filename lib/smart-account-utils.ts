"use client";

import { JsonRpcSigner, JsonRpcProvider, Contract } from "ethers";
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

// ── Read-only Provider (for view functions, no signer needed) ────────────

export function getReadProvider(): JsonRpcProvider {
  return new JsonRpcProvider(CONTRACT_ADDRESSES.rpcUrl, CONTRACT_ADDRESSES.chainId);
}

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
 * @param signer - ethers JsonRpcSigner wrapping Web3Auth's provider (from Web3Auth context)
 */
export async function getOrCreateSmartAccount(
  userAddress: string,
  signer?: JsonRpcSigner
): Promise<string> {
  try {
    const provider = getReadProvider();
    const adapterAddress = CONTRACT_ADDRESSES.smartAccountAdapter;
    const SMART_ACCOUNT_ADAPTER_ABI = [
      "function getUserSmartAccount(address user) view returns (address)",
      "function registerSmartAccount(address user, address smartAccount)",
    ];

    const adapter = new Contract(adapterAddress, SMART_ACCOUNT_ADAPTER_ABI, provider);

    // Check if user already has a Smart Account registered
    let smartAccount = await adapter.getUserSmartAccount(userAddress);

    if (smartAccount === "0x0000000000000000000000000000000000000000") {
      // Register the user's EOA as their Smart Account
      // In production, this would use EIP-7702 to upgrade the EOA
      if (!signer) throw new Error("Signer needed to register Smart Account");
      const adapterWithSigner = new Contract(adapterAddress, SMART_ACCOUNT_ADAPTER_ABI, signer);
      const tx = await adapterWithSigner.registerSmartAccount(userAddress, userAddress);
      await tx.wait();
      smartAccount = userAddress;
      console.log("Smart Account registered:", smartAccount);
    }

    return smartAccount;
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
 * @param signer - ethers JsonRpcSigner wrapping Web3Auth's provider (from Web3Auth context)
 */
export async function createBountyWithFunding(
  repoName: string,
  issueNumber: number,
  amount: string,
  contestPeriodSeconds: number = 7 * 24 * 60 * 60,
  signer: JsonRpcSigner,
  agentAddress: string = CONTRACT_ADDRESSES.agentDelegation
): Promise<{ bountyId: number; bountyAddress: string; txHashes: string[] }> {
  const txHashes: string[] = [];

  // Step 1: Create the bounty on-chain
  const { bountyId, bountyAddress } = await createBountyOnChain(
    agentAddress,
    contestPeriodSeconds,
    repoName,
    issueNumber,
    signer
  );

  // Step 2: Approve USDC
  const approveTxHash = await approveUSDC(bountyAddress, amount, signer);
  txHashes.push(approveTxHash);

  // Step 3: Deposit USDC into the bounty
  const depositTxHash = await depositToBounty(bountyAddress, amount, signer);
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
