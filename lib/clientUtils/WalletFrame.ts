import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { Wallet } from "ethers";
import type { Model } from "postmate";
import { prfToValidEthPrivKey } from "./ClientCrypto";
import { ETH_KEY_DERIVATION_LABEL } from "./constants";

const RPC_CALLBACK_EVENT = "rpc:callback";

export interface UserModel {
  id: string;
  username: string;
  accountAddress: string | null;
}

export interface AuthResult {
  success: boolean;
  user?: UserModel;
  walletUnlocked: boolean;
  error?: string;
  canRetry?: boolean;
}

export interface FullAuthResult extends AuthResult {
  wallet?: Wallet;
}

interface PrfExtensionResults {
  prf?: { results?: { first?: unknown } };
}

type PrfRequestOptions = PublicKeyCredentialRequestOptionsJSON & {
  challengeId: string;
  extensions?: AuthenticationExtensionsClientInputs & {
    prf?: { eval: { first: Uint8Array } };
  };
};

interface RpcEnvelope<T> {
  callbackNonce: number;
  params: T;
}

interface RpcReturn {
  success: boolean;
  callbackNonce: number;
  result: string;
}

function decodeBase64URLOrBase64ToUint8Array(value: string): Uint8Array | null {
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (!/^[A-Za-z0-9+/_=-]+$/.test(normalized)) return null;

  const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
  if (base64.length % 4 === 1) return null;
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  try {
    const binaryString = atob(padded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

function uint8ArrayFromByteNumberArray(arr: readonly unknown[]): Uint8Array | null {
  const len = arr.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const v = arr[i];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 255) {
      return null;
    }
    out[i] = v;
  }
  return out;
}

function normalizePrfOutput(prfOutput: unknown): ArrayBuffer | null {
  if (prfOutput instanceof ArrayBuffer) {
    return prfOutput;
  }
  if (ArrayBuffer.isView(prfOutput)) {
    const view = prfOutput as ArrayBufferView;
    return bytesToArrayBuffer(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  }
  if (Array.isArray(prfOutput)) {
    const bytes = uint8ArrayFromByteNumberArray(prfOutput);
    return bytes ? bytesToArrayBuffer(bytes) : null;
  }
  if (typeof prfOutput === "string") {
    const decoded = decodeBase64URLOrBase64ToUint8Array(prfOutput);
    return decoded ? bytesToArrayBuffer(decoded) : null;
  }
  return null;
}

export class WalletFrame {
  private authResult: FullAuthResult | null = null;
  private ceremonyPromise: Promise<FullAuthResult> | null = null;

  constructor(private postmateModel: Model) {}

  getAuthResultSync(): FullAuthResult | null {
    return this.authResult;
  }

  clearAuthResult() {
    this.authResult = null;
  }

  async getStatus(): Promise<AuthResult> {
    try {
      const res = await fetch("/api/user");
      if (!res.ok) return { success: false, walletUnlocked: false };
      const { user } = await res.json();
      if (!user) return { success: false, walletUnlocked: false };

      this.authResult = {
        success: true,
        user,
        walletUnlocked: false,
        wallet: undefined,
      };
      return { success: true, user, walletUnlocked: false };
    } catch {
      return {
        success: false,
        walletUnlocked: false,
        error: "Failed to check session",
      };
    }
  }

  async assureWallet(): Promise<Wallet> {
    if (this.authResult?.walletUnlocked && this.authResult.wallet) {
      return this.authResult.wallet;
    }
    if (!this.authResult?.user?.username) {
      throw new Error("Not authenticated; cannot unlock wallet");
    }
    const result = await this.authenticateWithPasskey(this.authResult.user.username);
    if (!result.success || !result.wallet) {
      throw new Error(result.error ?? "Unlock failed");
    }
    return result.wallet;
  }

  async authenticateWithPasskey(username: string): Promise<FullAuthResult> {
    if (this.ceremonyPromise) return this.ceremonyPromise;

    const ceremony = (async (): Promise<FullAuthResult> => {
      const optionsRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!optionsRes.ok) {
        return {
          success: false,
          walletUnlocked: false,
          error: "Failed to fetch authentication options",
          canRetry: true,
        };
      }
      const authOptions = (await optionsRes.json()) as PrfRequestOptions;

      const infoLabel = new TextEncoder().encode(ETH_KEY_DERIVATION_LABEL);
      authOptions.extensions = {
        ...authOptions.extensions,
        prf: { eval: { first: infoLabel } },
      };

      let credential;
      try {
        credential = await startAuthentication(authOptions);
      } catch (e) {
        return {
          success: false,
          walletUnlocked: false,
          error: "Passkey authentication cancelled or timed out.",
          canRetry: true,
        };
      }

      const rawPrfOutput = (credential.clientExtensionResults as PrfExtensionResults).prf?.results?.first;
      const prfOutput = normalizePrfOutput(rawPrfOutput);
      if (!prfOutput) {
        return {
          success: false,
          walletUnlocked: false,
          error: "Passkey does not support PRF. Make sure your browser/authenticator supports it.",
          canRetry: false,
        };
      }

      let privateKey;
      try {
        privateKey = await prfToValidEthPrivKey(prfOutput, infoLabel);
      } catch (e) {
        return {
          success: false,
          walletUnlocked: false,
          error: "Failed to derive wallet key from PRF output",
        };
      }
      const wallet = new Wallet(privateKey);

      const verifyRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential,
          challengeId: authOptions.challengeId,
          accountAddress: wallet.address,
        }),
      });
      if (!verifyRes.ok) {
        return {
          success: false,
          walletUnlocked: false,
          error: "Server rejected authentication",
        };
      }
      const { user } = (await verifyRes.json()) as { user: UserModel };

      this.authResult = { success: true, user, walletUnlocked: true, wallet };
      return this.authResult;
    })();

    this.ceremonyPromise = ceremony;
    try {
      return await ceremony;
    } finally {
      this.ceremonyPromise = null;
    }
  }

  getAccountAddress(): string | null {
    return this.authResult?.user?.accountAddress ?? null;
  }

  async rpcWrapper<TParams, TReturn>(
    paramString: string,
    handler: (params: TParams) => Promise<TReturn>
  ): Promise<void> {
    let envelope: RpcEnvelope<TParams>;
    try {
      envelope = JSON.parse(paramString) as RpcEnvelope<TParams>;
    } catch {
      return;
    }

    const { callbackNonce, params } = envelope;

    try {
      const result = await handler(params);
      this.postmateModel.emit(
        RPC_CALLBACK_EVENT,
        JSON.stringify({
          success: true,
          callbackNonce,
          result: JSON.stringify(result),
        } satisfies RpcReturn)
      );
    } catch (err) {
      this.postmateModel.emit(
        RPC_CALLBACK_EVENT,
        JSON.stringify({
          success: false,
          callbackNonce,
          result: JSON.stringify({
            message: err instanceof Error ? err.message : String(err),
          }),
        } satisfies RpcReturn)
      );
    }
  }
}
