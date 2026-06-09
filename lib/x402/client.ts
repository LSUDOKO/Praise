"use client";

import { Interface } from "ethers";
import { ERC20_ABI } from "@/lib/contracts/abis";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export type X402ClientOptions = {
  provider: Eip1193Provider;
  from: string;
  waitForReceipt?: (txHash: string) => Promise<void>;
};

type X402PaymentRequirements = {
  status: 402;
  token: string;
  amountAtomic: string;
  payee: string;
  proofHeader?: string;
};

function cloneInit(init: RequestInit = {}, extraHeaders: HeadersInit): RequestInit {
  const headers = new Headers(init.headers || {});
  const extra = new Headers(extraHeaders);
  extra.forEach((value, key) => headers.set(key, value));
  return { ...init, headers };
}

async function sendPayment(provider: Eip1193Provider, from: string, payment: X402PaymentRequirements): Promise<string> {
  const iface = new Interface(ERC20_ABI);
  const data = iface.encodeFunctionData("transfer", [payment.payee, BigInt(payment.amountAtomic)]);

  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: payment.token, data, value: "0x0" }],
  });

  if (typeof txHash !== "string" || !txHash.startsWith("0x")) {
    throw new Error("Wallet did not return a transaction hash for x402 payment");
  }
  return txHash;
}

export async function fetchWithX402(input: RequestInfo | URL, init: RequestInit = {}, options: X402ClientOptions): Promise<Response> {
  const firstResponse = await fetch(input, init);
  if (firstResponse.status !== 402) return firstResponse;

  const payment = (await firstResponse.json()) as X402PaymentRequirements;
  if (payment.status !== 402 || !payment.token || !payment.payee || !payment.amountAtomic) {
    throw new Error("Endpoint returned an invalid x402 payment request");
  }

  const txHash = await sendPayment(options.provider, options.from, payment);
  if (options.waitForReceipt) await options.waitForReceipt(txHash);

  return fetch(
    input,
    cloneInit(init, {
      [payment.proofHeader || "x-payment-proof"]: txHash,
    }),
  );
}
