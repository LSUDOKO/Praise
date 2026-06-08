"use client";

import { useEffect } from "react";
import Postmate from "postmate";
import { WalletFrame } from "@/lib/clientUtils/WalletFrame";

let walletFrame: WalletFrame | null = null;

function initialize() {
  if (typeof window === "undefined") return;
  if (walletFrame) return;

  const model = new Postmate.Model({
    getStatus: async (paramString: string) => {
      walletFrame!.rpcWrapper(paramString, () => walletFrame!.getStatus());
    },
    signIn: async (paramString: string) => {
      walletFrame!.rpcWrapper(paramString, ({ username }: { username: string }) => {
        return walletFrame!.authenticateWithPasskey(username);
      });
    },
    getAccountAddress: async (paramString: string) => {
      walletFrame!.rpcWrapper(paramString, async () => {
        return { accountAddress: walletFrame!.getAccountAddress() };
      });
    },
    signMessage: async (paramString: string) => {
      walletFrame!.rpcWrapper(paramString, async ({ message }: { message: string }) => {
        const wallet = await walletFrame!.assureWallet();
        return await wallet.signMessage(message);
      });
    },
    signDelegation: async (paramString: string) => {
      walletFrame!.rpcWrapper(paramString, async ({ domain, types, value }: { domain: any; types: any; value: any }) => {
        const wallet = await walletFrame!.assureWallet();
        // Sign using EIP-712 typed data signing
        return await wallet.signTypedData(domain, types, value);
      });
    },
    signOut: async (paramString: string) => {
      walletFrame!.rpcWrapper(paramString, async () => {
        walletFrame!.clearAuthResult();
        return {};
      });
    },
  });

  walletFrame = new WalletFrame(model);
}

if (typeof window !== "undefined") initialize();

export default function WalletLocalPage() {
  useEffect(() => {
    if (!walletFrame) initialize();
  }, []);
  return <div style={{ display: "none" }} />;
}
