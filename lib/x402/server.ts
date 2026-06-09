import { Interface, JsonRpcProvider, getAddress, isAddress, parseUnits } from "ethers";
import { CONTRACT_ADDRESSES, ERC20_ABI } from "@/lib/contracts/abis";

export type X402PaymentRequirements = {
  status: 402;
  title: "Payment Required";
  scheme: "exact";
  network: `eip155:${number}`;
  chainId: number;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  amount: string;
  amountAtomic: string;
  payee: string;
  description: string;
  proofHeader: "x-payment-proof";
};

export type X402VerificationResult =
  | { ok: true; txHash: string; payer?: string }
  | { ok: false; reason: string };

const TRANSFER_TOPIC = new Interface(ERC20_ABI).getEvent("Transfer")!.topicHash;
const PAYMENT_DESCRIPTION = "PRaise bounty creation platform fee";

function configuredPayee(): string {
  const payee = process.env.X402_PAY_TO || process.env.NEXT_PUBLIC_X402_PAY_TO || process.env.TRUSTED_SIGNER;
  if (!payee || !isAddress(payee)) {
    throw new Error("X402_PAY_TO or TRUSTED_SIGNER must be configured to a valid EVM address");
  }
  return getAddress(payee);
}

export function isX402Enabled(): boolean {
  return (process.env.X402_ENABLED || "true").toLowerCase() !== "false";
}

export function getX402PaymentRequirements(): X402PaymentRequirements {
  const amount = process.env.X402_BOUNTY_CREATE_PRICE_USDC || "0.10";
  const tokenDecimals = 6;
  return {
    status: 402,
    title: "Payment Required",
    scheme: "exact",
    network: `eip155:${CONTRACT_ADDRESSES.chainId}`,
    chainId: CONTRACT_ADDRESSES.chainId,
    token: process.env.X402_TOKEN_ADDRESS || CONTRACT_ADDRESSES.usdc,
    tokenSymbol: "USDC",
    tokenDecimals,
    amount,
    amountAtomic: parseUnits(amount, tokenDecimals).toString(),
    payee: configuredPayee(),
    description: PAYMENT_DESCRIPTION,
    proofHeader: "x-payment-proof",
  };
}

export function paymentRequiredResponse(init?: ResponseInit): Response {
  return Response.json(getX402PaymentRequirements(), {
    status: 402,
    headers: {
      "Cache-Control": "no-store",
      "X-Payment-Required": "x402",
      ...(init?.headers || {}),
    },
  });
}

export async function verifyX402PaymentProof(txHash: string | null): Promise<X402VerificationResult> {
  if (!txHash) return { ok: false, reason: "Missing x-payment-proof header" };
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) return { ok: false, reason: "Invalid payment proof transaction hash" };

  const requirements = getX402PaymentRequirements();
  const provider = new JsonRpcProvider(
    process.env.X402_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || CONTRACT_ADDRESSES.rpcUrl,
    requirements.chainId,
  );

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return { ok: false, reason: "Payment transaction not found yet" };
  if (receipt.status !== 1) return { ok: false, reason: "Payment transaction failed" };

  const token = getAddress(requirements.token);
  const payee = getAddress(requirements.payee);
  const requiredAmount = BigInt(requirements.amountAtomic);
  const erc20Interface = new Interface(ERC20_ABI);

  for (const log of receipt.logs) {
    if (getAddress(log.address) !== token) continue;
    if (log.topics[0] !== TRANSFER_TOPIC) continue;

    const parsed = erc20Interface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed || parsed.name !== "Transfer") continue;

    const from = getAddress(parsed.args.from as string);
    const to = getAddress(parsed.args.to as string);
    const value = BigInt(parsed.args.value.toString());

    if (to === payee && value >= requiredAmount) {
      return { ok: true, txHash, payer: from };
    }
  }

  return { ok: false, reason: "Payment transaction does not satisfy x402 requirements" };
}
