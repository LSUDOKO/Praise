"use client";

import { JsonRpcProvider, Contract, formatUnits, parseUnits, solidityPackedKeccak256, Interface } from "ethers";
import {
  BOUNTY_ABI,
  BOUNTY_FACTORY_ABI,
  AGENT_DELEGATION_ABI,
  BOUNTY_REGISTRY_ABI,
  ERC20_ABI,
  CONTRACT_ADDRESSES,
} from "./abis";

export { CONTRACT_ADDRESSES };

// ── Provider ────────────────────────────────────────────────────────────

export function getReadProvider(): JsonRpcProvider {
  return new JsonRpcProvider(CONTRACT_ADDRESSES.rpcUrl, CONTRACT_ADDRESSES.chainId);
}

// ── Raw Transaction Sender (for Web3Auth Sapphire provider) ──────────────
//
// Web3Auth's Sapphire provider bundles transactions as UserOps via ERC-4337.
// It does NOT support standard ethers BrowserProvider wrapping because its
// internal RPC routing doesn't handle eth_blockNumber/eth_chainId calls for
// Arbitrum Sepolia. Instead, we use the direct JsonRpcProvider for all reads
// and send raw eth_sendTransaction through the Web3Auth provider for writes.

/**
 * Send a raw transaction through the Web3Auth provider.
 * - Uses direct JsonRpcProvider for nonce, gas estimate, and chain ID
 * - Only uses Web3Auth's provider for eth_sendTransaction (signing)
 * - Waits for the receipt using the direct JsonRpcProvider
 */
export async function sendTxViaProvider(
  provider: any,          // Web3Auth's EIP-1193 provider
  from: string,
  to: string,
  data: string,
  value: string = "0x0"
): Promise<string> {
  const readProvider = getReadProvider();

  // Send the transaction through Web3Auth's provider (handles AA bundling).
  // We only pass from/to/data/value — the AA bundler manages nonce, gas, and
  // chainId internally. Passing them explicitly could conflict with the
  // bundler's own accounting (AA nonces are tracked by the entry point).
  const txHash: string = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data, value }],
  });

  // Wait for the receipt using the direct provider
  const receipt = await readProvider.waitForTransaction(txHash);
  return receipt?.hash || txHash;
}

// ── Contract Instances ───────────────────────────────────────────────────

export function getFactoryContract() {
  return new Contract(CONTRACT_ADDRESSES.bountyFactory, BOUNTY_FACTORY_ABI, getReadProvider());
}

export function getBountyContract(bountyAddress: string) {
  return new Contract(bountyAddress, BOUNTY_ABI, getReadProvider());
}

export function getRegistryContract() {
  return new Contract(CONTRACT_ADDRESSES.bountyRegistry, BOUNTY_REGISTRY_ABI, getReadProvider());
}

export function getUSDCContract() {
  return new Contract(CONTRACT_ADDRESSES.usdc, ERC20_ABI, getReadProvider());
}

export function getAgentDelegationContract() {
  return new Contract(CONTRACT_ADDRESSES.agentDelegation, AGENT_DELEGATION_ABI, getReadProvider());
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

// ── USDC Approve ─────────────────────────────────────────────────────────

/**
 * Approve USDC spending.
 * Sends the transaction through the Web3Auth raw provider (handles AA bundling).
 */
export async function approveUSDC(
  spenderAddress: string,
  amount: string,
  provider: any,      // Web3Auth raw EIP-1193 provider
  from: string         // user's address
): Promise<string> {
  const contract = getUSDCContract();
  const decimals = await contract.decimals();
  const parsedAmount = parseUnits(amount, decimals);

  const iface = new Interface(ERC20_ABI);
  const data = iface.encodeFunctionData("approve", [spenderAddress, parsedAmount]);

  return sendTxViaProvider(provider, from, CONTRACT_ADDRESSES.usdc, data);
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

/**
 * Create a bounty on chain via the Factory.
 * Uses the raw Web3Auth provider for signing (AA bundling).
 */
export async function createBountyOnChain(
  agentAddress: string,
  contestPeriodSeconds: number,
  repoName: string,
  issueNumber: number,
  provider: any,
  from: string
): Promise<CreateBountyResult> {
  const factoryInterface = new Interface(BOUNTY_FACTORY_ABI);
  const data = factoryInterface.encodeFunctionData("createBounty", [
    agentAddress,
    CONTRACT_ADDRESSES.usdc,
    contestPeriodSeconds,
    repoName,
    issueNumber,
  ]);

  const txHash = await sendTxViaProvider(provider, from, CONTRACT_ADDRESSES.bountyFactory, data);

  // Parse the receipt to extract the BountyCreated event
  const readProvider = getReadProvider();
  const receipt = await readProvider.getTransactionReceipt(txHash);

  const factoryContract = new Contract(
    CONTRACT_ADDRESSES.bountyFactory,
    BOUNTY_FACTORY_ABI,
    readProvider
  );

  let bountyId = 0;
  let bountyAddress = "";

  if (receipt?.logs) {
    for (const log of receipt.logs) {
      try {
        const parsed = factoryContract.interface.parseLog({
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

/**
 * Deposit USDC into a bounty contract.
 * Uses the raw Web3Auth provider for signing (AA bundling).
 */
export async function depositToBounty(
  bountyAddress: string,
  amount: string,
  provider: any,
  from: string
): Promise<string> {
  const usdcContract = getUSDCContract();
  const decimals = await usdcContract.decimals();
  const parsedAmount = parseUnits(amount, decimals);

  const bountyInterface = new Interface(BOUNTY_ABI);
  const data = bountyInterface.encodeFunctionData("deposit", [parsedAmount]);

  return sendTxViaProvider(provider, from, bountyAddress, data);
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
  provider: any,
  from: string
): Promise<string> {
  const delegationInterface = new Interface(AGENT_DELEGATION_ABI);
  const data = delegationInterface.encodeFunctionData("verifyAndRelease", [
    bountyAddress,
    contributor,
    score,
    prMergeHash,
    nonce,
    signature,
  ]);

  return sendTxViaProvider(provider, from, CONTRACT_ADDRESSES.agentDelegation, data);
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
