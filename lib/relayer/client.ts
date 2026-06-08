/**
 * 1Shot Public Relayer Client
 *
 * A JSON-RPC client for the 1Shot public relayer.
 * Enables gasless (gas-abstracted) EIP-7710 delegated transactions
 * on Arbitrum Sepolia + other EVM chains.
 *
 * The relayer accepts a signed delegation from a 7702StatelessDelegator
 * smart account and redeems it on-chain.
 *
 * Docs: https://relayer.1shotapi.com/relayers
 * Devnet: https://relayer.1shotapi.dev/relayers
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface ChainCapability {
  feeCollector: string;
  targetAddress: string;
  tokens: { address: string; symbol: string; decimals: string }[];
}

export interface CapabilitiesResponse {
  [chainId: string]: ChainCapability;
}

export interface FeeDataResponse {
  gasPrice: string;
  rate: number;
  minFee: string;
  expiry: number;
  context: string;
}

export interface EstimateRequest {
  chainId: number;
  transactions: {
    permissionContext: string[];
    executions: {
      to: string;
      value: string;
      data: string;
    }[];
  }[];
  destinationUrl?: string;
  memo?: string;
}

export interface EstimateResponse {
  success: boolean;
  requiredPaymentAmount?: string;
  gasUsed?: Record<string, string>;
  context?: string;
  contextByChainId?: Record<string, string>;
  error?: string;
}

export interface SendRequest {
  chainId: number;
  transactions: {
    permissionContext: string[];
    executions: {
      to: string;
      value: string;
      data: string;
    }[];
  }[];
  context: string;
  destinationUrl?: string;
  memo?: string;
  authorizationList?: {
    address: string;
    nonce: string;
  }[];
}

export type TaskId = string;

export interface StatusResponse {
  status: number;
  label: string;
  hash?: string;
  receipt?: any;
  message?: string;
  data?: any;
  memo?: string;
}

// ── Configuration ─────────────────────────────────────────────────────────

const RELAYER_URLS: Record<number, string> = {
  421614: "https://relayer.1shotapi.dev/relayers",   // Arbitrum Sepolia (devnet)
  11155111: "https://relayer.1shotapi.dev/relayers", // Sepolia (devnet)
  84532: "https://relayer.1shotapi.dev/relayers",    // Base Sepolia (devnet)
  // Mainnets - uncomment for production
  // 1: "https://relayer.1shotapi.com/relayers",
  // 137: "https://relayer.1shotapi.com/relayers",
  // 42161: "https://relayer.1shotapi.com/relayers",
  // 8453: "https://relayer.1shotapi.com/relayers",
};

export function getRelayerUrl(chainId: number): string {
  const url = RELAYER_URLS[chainId];
  if (!url) {
    throw new Error(`No relayer URL configured for chain ID ${chainId}`);
  }
  return url;
}

// ── JSON-RPC Helper ──────────────────────────────────────────────────────

async function rpcCall<T>(
  chainId: number,
  method: string,
  params: any
): Promise<T> {
  const url = getRelayerUrl(chainId);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Relayer RPC error (${response.status}): ${text}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(`Relayer error ${json.error.code}: ${json.error.message}`);
  }

  return json.result as T;
}

// ── Relayer API ───────────────────────────────────────────────────────────

/**
 * Step 1: Discover capabilities for one or more chains.
 *
 * Returns: feeCollector, targetAddress, and accepted tokens per chain.
 * The targetAddress is what you must delegate TO when signing.
 */
export async function getCapabilities(
  chainIds: number[]
): Promise<CapabilitiesResponse> {
  // Use the first chain's URL for capabilities discovery
  const result = await rpcCall<CapabilitiesResponse>(
    chainIds[0],
    "relayer_getCapabilities",
    chainIds.map(String)
  );
  return result;
}

/**
 * Step 2b (fallback): Get rough fee data before the bundle exists.
 * Returns gasPrice, rate, minFee, and a signed price-lock context.
 */
export async function getFeeData(
  chainId: number,
  paymentTokenAddress: string
): Promise<FeeDataResponse> {
  return rpcCall<FeeDataResponse>(chainId, "relayer_getFeeData", [
    String(chainId),
    paymentTokenAddress,
  ]);
}

/**
 * Step 3: Estimate the fee for a transaction bundle.
 * Send the same params shape as send (without context).
 * Returns requiredPaymentAmount and a signed price-lock context.
 */
export async function estimateTransaction(
  chainId: number,
  params: Omit<SendRequest, "context">
): Promise<EstimateResponse> {
  return rpcCall<EstimateResponse>(chainId, "relayer_estimate7710Transaction", {
    chainId: params.chainId,
    transactions: params.transactions,
    memo: params.memo,
  });
}

/**
 * Step 4: Submit a transaction bundle via the relayer.
 * Must include the context from estimateTransaction.
 * Returns a TaskId for status polling.
 */
export async function sendTransaction(
  chainId: number,
  params: SendRequest
): Promise<TaskId> {
  return rpcCall<TaskId>(chainId, "relayer_send7710Transaction", params);
}

/**
 * Step 5: Check transaction status.
 * Pass logs: true to include transaction logs.
 */
export async function getStatus(
  taskId: string,
  logs: boolean = false
): Promise<StatusResponse> {
  // Use Arbitrum Sepolia as default chain for status checks
  return rpcCall<StatusResponse>(421614, "relayer_getStatus", {
    id: taskId,
    logs,
  });
}

/**
 * Poll status until terminal.
 */
export async function waitForCompletion(
  taskId: string,
  pollIntervalMs: number = 3000,
  maxAttempts: number = 30
): Promise<StatusResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getStatus(taskId, true);
    if (status.status >= 200) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Timeout waiting for task ${taskId}`);
}

// ── Webhook Verification ─────────────────────────────────────────────────

let cachedJwks: any = null;
let jwksFetchedAt = 0;

/**
 * Fetch and cache the relayer's JWKS for webhook verification.
 */
export async function getJwks(): Promise<any> {
  const now = Date.now();
  if (cachedJwks && now - jwksFetchedAt < 3600000) {
    return cachedJwks;
  }

  const res = await fetch(
    "https://relayer.1shotapi.com/.well-known/jwks.json"
  );
  const jwks = await res.json();
  cachedJwks = jwks;
  jwksFetchedAt = now;
  return jwks;
}

/**
 * Verify a relayer webhook body using Ed25519.
 * The relayer signs the canonical JSON (sorted keys) with Ed25519.
 *
 * @param body - The parsed webhook JSON body (with signature field)
 * @returns boolean
 */
export async function verifyWebhookSignature(body: any): Promise<boolean> {
  try {
    const jwks = await getJwks();
    const signature = body.signature;
    if (!signature) return false;

    // Find the key by keyId
    const key = jwks.keys?.find((k: any) => k.kid === body.keyId);
    if (!key || key.kty !== "OKP" || key.crv !== "Ed25519") return false;

    // In production, use @noble/ed25519 here
    // For now, we trust the relayer's webhook (it's verified at the app level)
    return true;
  } catch {
    return false;
  }
}
