"use client";

import { BrowserProvider, JsonRpcProvider, Contract, formatUnits, parseUnits, solidityPackedKeccak256 } from "ethers";
import {
  BOUNTY_ABI,
  BOUNTY_FACTORY_ABI,
  AGENT_DELEGATION_ABI,
  BOUNTY_REGISTRY_ABI,
  DISPUTE_RESOLVER_ABI,
  SMART_ACCOUNT_ADAPTER_ABI,
  ERC20_ABI,
  CONTRACT_ADDRESSES,
} from "./abis";

export { CONTRACT_ADDRESSES };

// ── Provider ────────────────────────────────────────────────────────────

export function getReadProvider(): JsonRpcProvider {
  return new JsonRpcProvider(CONTRACT_ADDRESSES.rpcUrl, CONTRACT_ADDRESSES.chainId);
}

export async function getSignerProvider(): Promise<BrowserProvider> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask or Web3Auth wallet not available");
  }
  return new BrowserProvider(window.ethereum as any);
}

// ── Contract Instances ───────────────────────────────────────────────────

export function getFactoryContract(signer?: any) {
  const provider = signer ? signer : getReadProvider();
  return new Contract(CONTRACT_ADDRESSES.bountyFactory, BOUNTY_FACTORY_ABI, provider);
}

export function getBountyContract(bountyAddress: string, signer?: any) {
  const provider = signer ? signer : getReadProvider();
  return new Contract(bountyAddress, BOUNTY_ABI, provider);
}

export function getRegistryContract(signer?: any) {
  const provider = signer ? signer : getReadProvider();
  return new Contract(CONTRACT_ADDRESSES.bountyRegistry, BOUNTY_REGISTRY_ABI, provider);
}

export function getUSDCContract(signer?: any) {
  const provider = signer ? signer : getReadProvider();
  return new Contract(CONTRACT_ADDRESSES.usdc, ERC20_ABI, provider);
}

export function getAgentDelegationContract(signer?: any) {
  const provider = signer ? signer : getReadProvider();
  return new Contract(CONTRACT_ADDRESSES.agentDelegation, AGENT_DELEGATION_ABI, provider);
}

// ── Balance & Formatting ─────────────────────────────────────────────────

export async function getUSDCBalance(address: string): Promise<string> {
  try {
    const contract = getUSDCContract();
    const decimals = await contract.decimals();
    const balance = await contract.balanceOf(address);
    return formatUnits(balance, decimals);
  } catch (error) {
    console.error("Error fetching USDC balance:", error);
    return "0";
  }
}

export async function approveUSDC(
  spenderAddress: string,
  amount: string,
  signer?: any
): Promise<string> {
  const provider = signer || await getSignerProvider();
  const signerObj = await provider.getSigner();
  const contract = getUSDCContract(signerObj);
  const decimals = await contract.decimals();
  const parsedAmount = parseUnits(amount, decimals);
  const tx = await contract.approve(spenderAddress, parsedAmount);
  const receipt = await tx.wait();
  return receipt?.hash || tx.hash;
}

export async function getUSDCAllowance(
  ownerAddress: string,
  spenderAddress: string
): Promise<string> {
  const contract = getUSDCContract();
  const decimals = await contract.decimals();
  const allowance = await contract.allowance(ownerAddress, spenderAddress);
  return formatUnits(allowance, decimals);
}

// ── Bounty Factory ───────────────────────────────────────────────────────

export interface CreateBountyResult {
  bountyId: number;
  bountyAddress: string;
}

export async function createBountyOnChain(
  agentAddress: string,
  contestPeriodSeconds: number,
  repoName: string,
  issueNumber: number,
  signer?: any
): Promise<CreateBountyResult> {
  const provider = signer || await getSignerProvider();
  const signerObj = await provider.getSigner();
  const contract = getFactoryContract(signerObj);
  const usdcAddress = CONTRACT_ADDRESSES.usdc;

  const tx = await contract.createBounty(
    agentAddress,
    usdcAddress,
    contestPeriodSeconds,
    repoName,
    issueNumber
  );
  const receipt = await tx.wait();

  // Parse event logs to get bountyId and bountyAddress
  let bountyId = 0;
  let bountyAddress = "";

  if (receipt?.logs) {
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "BountyCreated") {
          bountyId = Number(parsed.args.bountyId);
          bountyAddress = parsed.args.bountyAddress;
          break;
        }
      } catch {
        // Skip non-matching logs
      }
    }
  }

  if (!bountyAddress) {
    throw new Error("Could not find BountyCreated event in transaction logs");
  }

  return { bountyId, bountyAddress };
}

// ── Bounty Registry ──────────────────────────────────────────────────────

export interface BountyInfo {
  bountyId: number;
  bountyAddress: string;
  repo: string;
  issueNumber: number;
  status: string;
  amount: string;
  creator: string;
  contributor: string;
}

/**
 * Fetch all bounties from the registry contract.
 * First gets the list of bounty addresses, then fetches metadata for each.
 */
export async function fetchAllBounties(): Promise<BountyInfo[]> {
  try {
    const registry = getRegistryContract();
    const total = await registry.getTotalBounties();
    if (total === 0n || total === 0) return [];

    const limit = total > 50n ? 50n : total;
    const addresses = await registry.getAllBounties(0, limit);
    if (!addresses || addresses.length === 0) return [];

    const bounties = await Promise.all(
      addresses.map(async (addr: string) => {
        try {
          const meta = await registry.getBountyMetadata(addr);
          const bountyContract = getBountyContract(addr);
          const [details, statusResult] = await Promise.all([
            bountyContract.getDetails(),
            bountyContract.getStatus(),
          ]);

          // Get USDC balance for this bounty
          const usdcContract = getUSDCContract();
          const decimals = await usdcContract.decimals();
          const bal = await usdcContract.balanceOf(addr);
          const amount = formatUnits(bal, decimals);

          // Determine status string
          let status = meta.status;
          if (!status || status === "") {
            if (statusResult.rel) status = "released";
            else if (statusResult.recl) status = "reclaimed";
            else if (statusResult.disp) status = "disputed";
            else if (statusResult.pau) status = "paused";
            else if (statusResult.active) status = "open";
            else status = "unknown";
          }

          return {
            bountyId: Number(details._bountyId),
            bountyAddress: addr,
            repo: meta.repoName,
            issueNumber: Number(meta.issueNumber),
            status,
            amount,
            creator: details._creator,
            contributor: details._contributor,
          };
        } catch (err) {
          console.warn("Error fetching bounty metadata for", addr, err);
          return null;
        }
      })
    );

    return bounties.filter((b): b is BountyInfo => b !== null);
  } catch (err) {
    console.error("fetchAllBounties error:", err);
    return [];
  }
}

/**
 * Fetch bounties created by a specific user.
 */
export async function fetchBountiesByCreator(creatorAddress: string): Promise<BountyInfo[]> {
  try {
    const registry = getRegistryContract();
    const addresses = await registry.getBountiesByCreator(creatorAddress);
    if (!addresses || addresses.length === 0) return [];

    const bounties = await Promise.all(
      addresses.map(async (addr: string) => {
        try {
          const meta = await registry.getBountyMetadata(addr);
          const bountyContract = getBountyContract(addr);
          const details = await bountyContract.getDetails();
          const usdcContract = getUSDCContract();
          const decimals = await usdcContract.decimals();
          const bal = await usdcContract.balanceOf(addr);
          const amount = formatUnits(bal, decimals);

          return {
            bountyId: Number(details._bountyId),
            bountyAddress: addr,
            repo: meta.repoName,
            issueNumber: Number(meta.issueNumber),
            status: meta.status || "open",
            amount,
            creator: details._creator,
            contributor: details._contributor,
          };
        } catch {
          return null;
        }
      })
    );

    return bounties.filter((b): b is BountyInfo => b !== null);
  } catch (err) {
    console.error("fetchBountiesByCreator error:", err);
    return [];
  }
}

// ── Direct Bounty Interactions ───────────────────────────────────────────

export async function depositToBounty(
  bountyAddress: string,
  amount: string,
  signer?: any
): Promise<string> {
  const provider = signer || await getSignerProvider();
  const signerObj = await provider.getSigner();
  const contract = getBountyContract(bountyAddress, signerObj);

  const usdcContract = getUSDCContract(signerObj);
  const decimals = await usdcContract.decimals();
  const parsedAmount = parseUnits(amount, decimals);

  const tx = await contract.deposit(parsedAmount);
  const receipt = await tx.wait();
  return receipt?.hash || tx.hash;
}

// ── Agent Delegation (Venice AI Verified Releases) ────────────────────────

/**
 * Verify a bounty release via the AgentDelegation contract.
 * The Venice AI agent signs a verification, then this calls the contract
 * to release funds to the contributor.
 */
export async function agentReleaseBounty(
  bountyAddress: string,
  contributor: string,
  score: number,
  prMergeHash: string,
  nonce: number,
  signature: string,
  signer?: any
): Promise<string> {
  const provider = signer || (await getSignerProvider());
  const signerObj = await provider.getSigner();
  const contract = getAgentDelegationContract(signerObj);

  const tx = await contract.verifyAndRelease(
    bountyAddress,
    contributor,
    score,
    prMergeHash,
    nonce,
    signature
  );
  const receipt = await tx.wait();
  return receipt?.hash || tx.hash;
}

/**
 * Check if an attestation hash has already been used (prevents replay).
 */
export async function isAttestationUsed(attestationHash: string): Promise<boolean> {
  const contract = getAgentDelegationContract();
  return contract.isAttestationUsed(attestationHash);
}

/**
 * Get the timestamp when an attestation was created.
 */
export async function getAttestationTime(attestationHash: string): Promise<number> {
  const contract = getAgentDelegationContract();
  const time = await contract.getAttestationTime(attestationHash);
  return Number(time);
}

/**
 * Compute the attestation hash for a verification.
 */
export function computeAttestationHash(
  bountyAddress: string,
  contributor: string,
  score: number,
  prMergeHash: string,
  nonce: number
): string {
  // The Solidity contract uses keccak256(abi.encodePacked(...)):
  // keccak256(abi.encodePacked(bountyAddress, contributor, score, prMergeHash, nonce))
  return solidityPackedKeccak256(
    ["address", "address", "uint256", "bytes32", "uint256"],
    [bountyAddress, contributor, score, prMergeHash, nonce]
  );
}

/**
 * Poll for new bounties. It's a helper for the bounties list page
 * to get bounties created after the last refresh.
 */
export async function pollNewBounties(lastKnownCount: number): Promise<BountyInfo[]> {
  const registry = getRegistryContract();
  const total = await registry.getTotalBounties();
  if (total <= lastKnownCount) return [];
  return fetchAllBounties();
}
