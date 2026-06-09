/**
 * 1Shot Public Relayer Client
 *
 * JSON-RPC client for 1Shot's gas-abstracted ERC-7710 relayer.
 * It supports capability discovery, rough fee quotes, estimate-first sends,
 * status polling, and JSON-safe delegation serialization.
 */

import { bytesToHex } from "viem/utils";

export type Hex = `0x${string}`;

export interface ChainCapability {
  feeCollector: Hex;
  targetAddress: Hex;
  tokens: {
    address: Hex;
    symbol?: string;
    name?: string;
    decimals: number | string;
  }[];
}

export type CapabilitiesResponse = Record<string, ChainCapability>;

export interface FeeDataResponse {
  chainId: string;
  token: { address: Hex; decimals: number; symbol?: string; name?: string };
  gasPrice: Hex;
  rate: number;
  minFee: string;
  expiry: number;
  context?: string;
  feeCollector: Hex;
  targetAddress?: Hex;
}

export interface Execution7710 {
  target: Hex;
  value: string;
  data: Hex;
}

export interface DelegatedTransaction7710 {
  permissionContext: unknown[];
  executions: Execution7710[];
}

export interface AuthorizationListEntry {
  address: Hex;
  chainId: number | string;
  nonce: number | string;
  r: Hex;
  s: Hex;
  yParity: number | string;
}

export interface EstimateRequest {
  chainId: number | string;
  transactions: DelegatedTransaction7710[];
  authorizationList?: AuthorizationListEntry[];
  destinationUrl?: string;
  memo?: string;
}

export interface EstimateResponse {
  success: boolean;
  paymentTokenAddress?: Hex;
  paymentChain?: number;
  requiredPaymentAmount?: string;
  gasUsed?: Record<string, string>;
  context?: string;
  contextByChainId?: Record<string, string>;
  error?: string;
}

export interface SendRequest extends EstimateRequest {
  context: string;
  taskId?: Hex;
}

export type TaskId = Hex;

export interface StatusResponse {
  status: number;
  label: string;
  hash?: Hex;
  receipt?: unknown;
  message?: string;
  data?: unknown;
  memo?: string;
}

type JsonRpcResponse<T> =
  | { jsonrpc: "2.0"; id: number | string; result: T }
  | {
      jsonrpc: "2.0";
      id: number | string;
      error: { code: number; message: string; data?: unknown };
    };

const DEVNET_RELAYER_URL = "https://relayer.1shotapi.dev/relayers";
const MAINNET_RELAYER_URL = "https://relayer.1shotapi.com/relayers";

const DEVNET_CHAIN_IDS = new Set([11155111, 84532, 421614]);

export function getRelayerUrl(chainId: number | string): string {
  const id = Number(chainId);
  return DEVNET_CHAIN_IDS.has(id) ? DEVNET_RELAYER_URL : MAINNET_RELAYER_URL;
}

export function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (Array.isArray(value)) return value.map(toRelayerJson);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value))
      out[key] = toRelayerJson(nested);
    return out;
  }
  return value;
}

async function rpcCall<T>(
  chainId: number | string,
  method: string,
  params: unknown,
): Promise<T> {
  const response = await fetch(getRelayerUrl(chainId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: toRelayerJson(params),
    }),
  });

  const json = (await response.json()) as JsonRpcResponse<T>;
  if (!response.ok)
    throw new Error(
      `Relayer RPC HTTP ${response.status}: ${JSON.stringify(json)}`,
    );
  if ("error" in json) {
    throw new Error(`Relayer error ${json.error.code}: ${json.error.message}`);
  }

  return json.result;
}

export async function getCapabilities(
  chainIds: Array<number | string>,
): Promise<CapabilitiesResponse> {
  if (chainIds.length === 0)
    throw new Error("At least one chain ID is required");
  return rpcCall<CapabilitiesResponse>(
    chainIds[0],
    "relayer_getCapabilities",
    chainIds.map(String),
  );
}

export async function getFeeData(
  chainId: number | string,
  paymentTokenAddress: string,
): Promise<FeeDataResponse> {
  return rpcCall<FeeDataResponse>(chainId, "relayer_getFeeData", {
    chainId: String(chainId),
    token: paymentTokenAddress,
  });
}

export async function estimateTransaction(
  chainId: number | string,
  params: EstimateRequest,
): Promise<EstimateResponse> {
  return rpcCall<EstimateResponse>(chainId, "relayer_estimate7710Transaction", {
    ...params,
    chainId: String(params.chainId),
  });
}

export async function sendTransaction(
  chainId: number | string,
  params: SendRequest,
): Promise<TaskId> {
  return rpcCall<TaskId>(chainId, "relayer_send7710Transaction", {
    ...params,
    chainId: String(params.chainId),
  });
}

export async function getStatus(
  taskId: string,
  logs = false,
  chainId: number | string = 421614,
): Promise<StatusResponse> {
  return rpcCall<StatusResponse>(chainId, "relayer_getStatus", {
    id: taskId,
    logs,
  });
}

export async function waitForCompletion(
  taskId: string,
  pollIntervalMs = 3000,
  maxAttempts = 30,
  chainId: number | string = 421614,
): Promise<StatusResponse> {
  for (let i = 0; i < maxAttempts; i += 1) {
    const status = await getStatus(taskId, true, chainId);
    if (status.status >= 200) return status;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Timeout waiting for relayer task ${taskId}`);
}

export function relayerWebhookJwksUrl(chainId: number | string): string {
  return `${getRelayerUrl(chainId).replace(/\/relayers$/, "")}/.well-known/jwks.json`;
}
