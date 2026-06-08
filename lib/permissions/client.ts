/**
 * ERC-7715 Advanced Permissions Client
 *
 * Manages permission-based execution for MetaMask Smart Accounts.
 * Uses @metamask/smart-accounts-kit for:
 * - ERC-7715 execution permissions (request from wallet)
 * - ERC-7710 delegation creation and management
 * - Redelegation chains (delegate → sub-agent)
 * - Caveats/enforcers for scoped authority
 *
 * Connected to the SmartAccountAdapter contract for on-chain registration
 * and the AgentDelegation contract for AI-agent-verified releases.
 */

import {
  createDelegation,
  ScopeType,
  getSmartAccountsEnvironment,
  CaveatType,
} from "@metamask/smart-accounts-kit";
import { BrowserProvider, Contract, parseUnits } from "ethers";
import { CONTRACT_ADDRESSES, getUSDCContract } from "@/lib/contracts/client";

// ── Types ─────────────────────────────────────────────────────────────────

export type DelegationScope = {
  type: number; // ScopeType enum
  tokenAddress?: string;
  maxAmount?: bigint;
  to?: string;
  selector?: string;
  periodAmount?: bigint;
  periodDuration?: number;
};

export type Caveat = {
  type: number; // CaveatType enum
  tokenAddress?: string;
  maxAmount?: bigint;
  contractAddress?: string;
  selector?: string;
};

export interface DelegationParams {
  delegateAddress: string;
  delegatorAddress: string;
  salt: string;
  scope: DelegationScope;
  caveats?: Caveat[];
}

export interface PermissionContext {
  delegation: any;
  signatures: any[];
}

export interface SessionKey {
  sessionId: string;
  sessionKey: string;
  durationSeconds: number;
  maxReleasesPerDay: number;
}

// ── Environment ───────────────────────────────────────────────────────────

/**
 * Get the Smart Accounts environment for a chain.
 */
export function getSAEnvironment(chainId: number = CONTRACT_ADDRESSES.chainId) {
  return getSmartAccountsEnvironment(chainId);
}

// ── Delegation Creation ───────────────────────────────────────────────────

/**
 * Create an ERC-7710 delegation for USDC transfer amount.
 * This delegates authority to transfer up to `maxAmount` USDC
 * from the delegator to the delegate.
 */
export function createUSDCDelegation(params: {
  toAddress: string;
  fromAddress: string;
  tokenAddress: string;
  maxAmount: string;
  decimals?: number;
  salt?: string;
}) {
  const { toAddress, fromAddress, tokenAddress, maxAmount } = params;
  const decimals = params.decimals || 6;
  const salt: `0x${string}` =
    (params.salt as `0x${string}`) ||
    ("0x" +
      Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, "0")
      ).join("") as `0x${string}`);

  const environment = getSAEnvironment(CONTRACT_ADDRESSES.chainId);

  return createDelegation({
    to: toAddress as `0x${string}`,
    from: fromAddress as `0x${string}`,
    environment,
    salt,
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: tokenAddress as `0x${string}`,
      maxAmount: parseUnits(maxAmount, decimals),
    },
  });
}

/**
 * Create a function-call scoped delegation for a specific contract method.
 * Used for granting permission to call specific functions like `release()`.
 */
export function createFunctionCallDelegation(params: {
  toAddress: string;
  fromAddress: string;
  contractAddress: string;
  selector: string;
  salt?: string;
}) {
  const { toAddress, fromAddress, contractAddress, selector } = params;
  const salt: `0x${string}` =
    (params.salt as `0x${string}`) ||
    ("0x" +
      Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, "0")
      ).join("") as `0x${string}`);

  const environment = getSAEnvironment(CONTRACT_ADDRESSES.chainId);

  return createDelegation({
    to: toAddress as `0x${string}`,
    from: fromAddress as `0x${string}`,
    environment,
    salt,
    scope: {
      type: ScopeType.FunctionCall,
      targets: [contractAddress as `0x${string}`],
      selectors: [selector as `0x${string}`],
    },
  });
}

// ── Permission Management (SmartAccountAdapter) ──────────────────────────

/**
 * Grant permission on the SmartAccountAdapter contract on-chain.
 * This creates an on-chain permission record linking a delegatee
 * to a specific bounty with a max amount and duration.
 */
export async function grantBountyPermission(
  signer: any,
  delegateeAddress: string,
  bountyAddress: string,
  maxAmount: string,
  durationSeconds: number = 86400 * 30 // 30 days default
): Promise<string> {
  const adapterABI = [
    "function grantPermission(address delegatee, address bountyAddress, uint256 maxAmount, uint256 durationSeconds) returns (bytes32 permissionId)",
  ];
  const adapter = new Contract(
    CONTRACT_ADDRESSES.smartAccountAdapter,
    adapterABI,
    signer
  );

  const decimals = 6; // USDC
  const parsedAmount = parseUnits(maxAmount, decimals);

  const tx = await adapter.grantPermission(
    delegateeAddress,
    bountyAddress,
    parsedAmount,
    durationSeconds
  );
  const receipt = await tx.wait();

  // Parse permissionId from event logs
  for (const log of receipt.logs) {
    try {
      const parsed = adapter.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed?.name === "PermissionGranted") {
        return parsed.args.permissionId;
      }
    } catch {
      // skip
    }
  }
  throw new Error("PermissionGranted event not found in logs");
}

/**
 * Revoke an on-chain permission.
 */
export async function revokePermission(
  signer: any,
  permissionId: string
): Promise<void> {
  const adapterABI = [
    "function revokePermission(bytes32 permissionId)",
  ];
  const adapter = new Contract(
    CONTRACT_ADDRESSES.smartAccountAdapter,
    adapterABI,
    signer
  );
  const tx = await adapter.revokePermission(permissionId);
  await tx.wait();
}

/**
 * Check if a permission is still valid.
 */
export async function isPermissionValid(
  permissionId: string
): Promise<boolean> {
  const adapterABI = [
    "function isPermissionValid(bytes32 permissionId) view returns (bool)",
  ];
  const provider = new BrowserProvider(window.ethereum as any);
  const adapter = new Contract(
    CONTRACT_ADDRESSES.smartAccountAdapter,
    adapterABI,
    provider
  );
  return adapter.isPermissionValid(permissionId);
}

/**
 * Get all permission IDs for a delegator.
 */
export async function getDelegatorPermissions(
  delegatorAddress: string
): Promise<string[]> {
  const adapterABI = [
    "function getDelegatorPermissions(address delegator) view returns (bytes32[])",
  ];
  const provider = new BrowserProvider(window.ethereum as any);
  const adapter = new Contract(
    CONTRACT_ADDRESSES.smartAccountAdapter,
    adapterABI,
    provider
  );
  return adapter.getDelegatorPermissions(delegatorAddress);
}

// ── Session Keys ─────────────────────────────────────────────────────────

/**
 * Create a session key for automated execution with daily limits.
 */
export async function createSessionKey(
  signer: any,
  sessionKeyAddress: string,
  durationSeconds: number = 86400 * 7, // 7 days
  maxReleasesPerDay: number = 10
): Promise<string> {
  const adapterABI = [
    "function createSessionKey(address sessionKey, uint256 durationSeconds, uint256 maxReleasesPerDay) returns (bytes32 sessionId)",
  ];
  const adapter = new Contract(
    CONTRACT_ADDRESSES.smartAccountAdapter,
    adapterABI,
    signer
  );

  const tx = await adapter.createSessionKey(
    sessionKeyAddress,
    durationSeconds,
    maxReleasesPerDay
  );
  const receipt = await tx.wait();

  for (const log of receipt.logs) {
    try {
      const parsed = adapter.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed?.name === "SessionKeyCreated") {
        return parsed.args.sessionId;
      }
    } catch {
      // skip
    }
  }
  throw new Error("SessionKeyCreated event not found in logs");
}

/**
 * Revoke a session key.
 */
export async function revokeSessionKey(
  signer: any,
  sessionId: string
): Promise<void> {
  const adapterABI = [
    "function revokeSessionKey(bytes32 sessionId)",
  ];
  const adapter = new Contract(
    CONTRACT_ADDRESSES.smartAccountAdapter,
    adapterABI,
    signer
  );
  const tx = await adapter.revokeSessionKey(sessionId);
  await tx.wait();
}

// ── Relayer Delegation Flow ──────────────────────────────────────────────

/**
 * Prepare a delegation for submission to the 1Shot public relayer.
 * Formats the delegation into the JSON format the relayer expects.
 */
export function delegationToRelayerJson(
  delegation: any,
  signature: string
): string {
  return JSON.stringify({
    delegation: {
      from: delegation.from,
      to: delegation.to,
      salt: delegation.salt,
      scope: delegation.scope,
      caveats: delegation.caveats || [],
    },
    signature,
  });
}

// ── ERC-7715 Browser Extension Flow ──────────────────────────────────────

/**
 * Request execution permissions from MetaMask extension via EIP-7715.
 * This opens the MetaMask permission dialog for the user.
 *
 * Requires MetaMask Flask >=13.5 or production >=13.23,
 * and the user must have an EIP-7702 upgraded Smart Account.
 */
export async function requestExecutionPermissions(
  walletClient: any,
  targetAddress: string,
  tokenAddress: string,
  maxAmount: bigint,
  expiry: number
): Promise<any> {
  const currentTime = Math.floor(Date.now() / 1000);

  const grantedPermissions = await walletClient.requestExecutionPermissions([
    {
      chainId: BigInt(CONTRACT_ADDRESSES.chainId),
      expiry,
      // Delegate authority to the relayer's target address
      to: targetAddress,
      permission: {
        type: "erc20-token-periodic",
        data: {
          tokenAddress,
          periodAmount: maxAmount,
          periodDuration: 86400, // 1 day
          justification: "PRaise bounty payouts",
        },
        isAdjustmentAllowed: true,
      },
    },
  ]);

  return grantedPermissions;
}

// ── Redelegation Chain ───────────────────────────────────────────────────

/**
 * Create a redelegation (delegation chain) from a granted permission context.
 * The agent (delegate) passes on narrowed authority to a sub-agent.
 *
 * Example: Swap agent receives authority to spend 5 USDC/day
 * (down from the original 10 USDC/day granted to the dapp).
 */
export function createRedelegation(
  sessionAccount: any,
  subAgentAddress: string,
  tokenAddress: string,
  maxAmount: bigint,
  originalPermissionContext: string
) {
  const environment = getSAEnvironment(CONTRACT_ADDRESSES.chainId);

  return sessionAccount.redelegatePermissionContext({
    to: subAgentAddress,
    environment,
    permissionContext: originalPermissionContext,
    caveats: [
      {
        type: CaveatType.Erc20TransferAmount,
        tokenAddress,
        maxAmount,
      },
    ],
  });
}

// ── SmartAccountAdapter On-Chain Permission Interaction ─────────────────

/**
 * Execute a permission on-chain via the SmartAccountAdapter.
 * Used by agents to release funds after AI verification.
 */
export async function executePermission(
  signer: any,
  permissionId: string,
  contributor: string,
  amount: string
): Promise<string> {
  const adapterABI = [
    "function executePermission(bytes32 permissionId, address contributor, uint256 amount)",
  ];
  const adapter = new Contract(
    CONTRACT_ADDRESSES.smartAccountAdapter,
    adapterABI,
    signer
  );

  const decimals = 6; // USDC
  const parsedAmount = parseUnits(amount, decimals);

  const tx = await adapter.executePermission(
    permissionId,
    contributor,
    parsedAmount
  );
  const receipt = await tx.wait();
  return receipt.hash;
}

// ── Ethereum Address Validation ──────────────────────────────────────────

export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
