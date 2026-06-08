"use client";

import { BrowserProvider, Contract } from "ethers";
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

// ── Legacy / Compatibility Functions ─────────────────────────────────────

/**
 * Check if an address is a Smart Account (has contract code).
 */
export async function isSmartAccount(
  address: string,
  rpcUrl?: string
): Promise<boolean> {
  try {
    const provider = new BrowserProvider(window.ethereum as any);
    const code = await provider.getCode(address);
    // Smart Accounts have contract code, EOAs don't
    return code !== "0x";
  } catch (error) {
    console.error("Error checking Smart Account:", error);
    return false;
  }
}

/**
 * Get or create a Smart Account for the user.
 * Uses the SmartAccountAdapter contract.
 */
export async function getOrCreateSmartAccount(
  userAddress: string,
  _rpcUrl?: string,
  _factoryAddress?: string
): Promise<string> {
  try {
    const provider = new BrowserProvider(window.ethereum as any);
    const signer = await provider.getSigner();

    // Check the SmartAccountAdapter for an existing registered Smart Account
    const adapterAddress = CONTRACT_ADDRESSES.smartAccountAdapter;
    const SMART_ACCOUNT_ADAPTER_ABI = [
      "function getUserSmartAccount(address user) view returns (address)",
      "function registerSmartAccount(address user, address smartAccount)",
    ];
    const adapter = new Contract(adapterAddress, SMART_ACCOUNT_ADAPTER_ABI, provider);

    // Check if user already has a Smart Account
    let smartAccount = await adapter.getUserSmartAccount(userAddress);

    if (smartAccount === "0x0000000000000000000000000000000000000000") {
      // If no Smart Account yet, the user's EOA itself acts as the
      // "smart account" for now. In production, use EIP-7702 upgrade.
      // For the hackathon MVP, the EOA address IS the smart account.
      const eoaAsSmartAccount = userAddress;

      // Register it — create a new contract with signer
      const adapterWithSigner = new Contract(adapterAddress, SMART_ACCOUNT_ADAPTER_ABI, signer);
      const tx = await adapterWithSigner.registerSmartAccount(
        userAddress,
        eoaAsSmartAccount
      );
      await tx.wait();

      smartAccount = eoaAsSmartAccount;
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
    const provider = new BrowserProvider(window.ethereum as any);
    const FACTORY_ABI = ["function paused() view returns (bool)"];
    const factory = new Contract(
      CONTRACT_ADDRESSES.bountyFactory,
      FACTORY_ABI,
      provider
    );
    return await factory.paused();
  } catch {
    return false;
  }
}

/**
 * Create a bounty with full funding flow:
 * 1. Approve USDC spending to the bounty contract
 * 2. Deploy the bounty via BountyFactory
 * 3. Deposit USDC into the new bounty
 */
export async function createBountyWithFunding(
  repoName: string,
  issueNumber: number,
  amount: string,
  contestPeriodSeconds: number = 7 * 24 * 60 * 60, // 7 days default
  agentAddress: string = CONTRACT_ADDRESSES.agentDelegation
): Promise<{ bountyId: number; bountyAddress: string; txHashes: string[] }> {
  const provider = new BrowserProvider(window.ethereum as any);
  const signer = await provider.getSigner();
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
