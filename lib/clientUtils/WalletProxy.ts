import Postmate, { ParentAPI } from "postmate";

export function prepareIframeForWebAuthn(frame: HTMLIFrameElement) {
  const container = frame.parentElement;

  const originalContainerStyle = container
    ? {
        display: container.style.display,
        position: container.style.position,
        width: container.style.width,
        height: container.style.height,
        opacity: container.style.opacity,
        zIndex: container.style.zIndex,
        pointerEvents: container.style.pointerEvents,
      }
    : null;

  const originalFrameStyle = {
    display: frame.style.display,
    width: frame.style.width,
    height: frame.style.height,
    opacity: frame.style.opacity,
    pointerEvents: frame.style.pointerEvents,
    zIndex: frame.style.zIndex,
  };

  const originalContainerClasses = container ? container.className : "";
  const originalFrameClasses = frame.className;

  // Make container rendered but invisible
  if (container) {
    container.classList.remove("hidden");
    container.style.setProperty("display", "block", "important");
    container.style.setProperty("position", "fixed", "important");
    container.style.setProperty("width", "1px", "important");
    container.style.setProperty("height", "1px", "important");
    container.style.setProperty("opacity", "0", "important");
    container.style.setProperty("z-index", "-1", "important");
    container.style.setProperty("pointer-events", "none", "important");
  }

  // Make iframe rendered but invisible
  frame.classList.remove("hidden");
  frame.style.setProperty("display", "block", "important");
  frame.style.setProperty("width", "1px", "important");
  frame.style.setProperty("height", "1px", "important");
  frame.style.setProperty("opacity", "0", "important");
  frame.style.setProperty("pointer-events", "none", "important");
  frame.style.setProperty("z-index", "-1", "important");

  // Focus iframe to preserve user activation
  frame.contentWindow?.focus();
  frame.focus();

  return {
    restore: () => {
      if (container) {
        container.className = originalContainerClasses;
        if (originalContainerStyle) {
          container.style.display = originalContainerStyle.display;
          container.style.position = originalContainerStyle.position;
          container.style.width = originalContainerStyle.width;
          container.style.height = originalContainerStyle.height;
          container.style.opacity = originalContainerStyle.opacity;
          container.style.zIndex = originalContainerStyle.zIndex;
          container.style.pointerEvents = originalContainerStyle.pointerEvents;
        }
      }
      frame.className = originalFrameClasses;
      frame.style.display = originalFrameStyle.display;
      frame.style.width = originalFrameStyle.width;
      frame.style.height = originalFrameStyle.height;
      frame.style.opacity = originalFrameStyle.opacity;
      frame.style.pointerEvents = originalFrameStyle.pointerEvents;
      frame.style.zIndex = originalFrameStyle.zIndex;
    },
  };
}

export class WalletProxy {
  private child: ParentAPI | null = null;
  private rpcNonce = 0;
  private rpcCallbacks = new Map<number, (result: any) => void>();

  async initialize(containerId: string, walletUrl: string): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);

    const handshake = new Postmate({
      container,
      url: walletUrl,
      name: "wallet-iframe",
    });

    const child = await handshake;
    this.child = child;

    // Attach WebAuthn credentials policy
    if (child.frame instanceof HTMLIFrameElement) {
      child.frame.setAttribute("allow", "publickey-credentials-get publickey-credentials-create");
    }

    // Listen for responses
    child.on("rpc:callback", (data: string) => {
      try {
        const parsed = JSON.parse(data);
        const cb = this.rpcCallbacks.get(parsed.callbackNonce);
        if (cb) {
          this.rpcCallbacks.delete(parsed.callbackNonce);
          cb(parsed);
        }
      } catch (e) {
        console.error("Failed to parse RPC callback data", e);
      }
    });
  }

  async signIn(username: string): Promise<any> {
    return this.rpcCall("signIn", { username });
  }

  async signMessage(message: string): Promise<string> {
    return this.rpcCall<string, { message: string }>("signMessage", { message });
  }

  async getAccountAddress(): Promise<{ accountAddress: string }> {
    return this.rpcCall<{ accountAddress: string }, {}>("getAccountAddress", {});
  }

  async signOut(): Promise<any> {
    return this.rpcCall("signOut", {});
  }

  async signDelegation(delegation: any): Promise<any> {
    return this.rpcCall("signDelegation", { delegation });
  }

  private rpcCall<TReturn, TParams>(name: string, params: TParams): Promise<TReturn> {
    if (!this.child) throw new Error("WalletProxy is not initialized");

    const frame = this.child.frame;
    const { restore } = prepareIframeForWebAuthn(frame);

    return new Promise<TReturn>((resolve, reject) => {
      const nonce = this.rpcNonce++;
      this.rpcCallbacks.set(nonce, (res) => {
        restore();
        if (!res.success) {
          const err = typeof res.result === "string" ? JSON.parse(res.result) : res.result;
          reject(new Error(err.message || "RPC call failed"));
        } else {
          resolve(JSON.parse(res.result));
        }
      });
      this.child!.call(name, JSON.stringify({ callbackNonce: nonce, params }));
    });
  }
}
