import { NextResponse } from "next/server";
import { CONTRACT_ADDRESSES } from "@/lib/contracts/abis";
import { getCapabilities, getFeeData } from "@/lib/relayer/client";
import { getX402PaymentRequirements, isX402Enabled } from "@/lib/x402/server";

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export async function GET() {
  const chainId = CONTRACT_ADDRESSES.chainId;
  const checks = {
    web3auth: {
      configured: present(process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID),
      network: process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || "sapphire_devnet",
    },
    venice: {
      configured: present(process.env.VENICE_API_KEY) || present(process.env.VENEICE_API),
    },
    oneshotApi: {
      configured:
        present(process.env.ONESHOT_API_KEY) &&
        present(process.env.ONESHOT_API_SECRET) &&
        present(process.env.ONESHOT_BUSINESS_ID),
    },
    x402: {
      enabled: isX402Enabled(),
      configured: present(process.env.X402_PAY_TO) || present(process.env.NEXT_PUBLIC_X402_PAY_TO) || present(process.env.TRUSTED_SIGNER),
      requirements: null as ReturnType<typeof getX402PaymentRequirements> | null,
    },
    contracts: {
      chainId,
      usdc: CONTRACT_ADDRESSES.usdc,
      bountyFactory: CONTRACT_ADDRESSES.bountyFactory,
      bountyRegistry: CONTRACT_ADDRESSES.bountyRegistry,
      agentDelegation: CONTRACT_ADDRESSES.agentDelegation,
      smartAccountAdapter: CONTRACT_ADDRESSES.smartAccountAdapter,
    },
    relayer: {
      configured: true,
      reachable: false,
      capabilities: null as unknown,
      feeData: null as unknown,
      error: null as string | null,
    },
  };

  try {
    if (checks.x402.enabled && checks.x402.configured) {
      checks.x402.requirements = getX402PaymentRequirements();
    }
  } catch {
    checks.x402.configured = false;
  }

  try {
    const capabilities = await getCapabilities([chainId]);
    checks.relayer.capabilities = capabilities[String(chainId)] || null;
    checks.relayer.reachable = Boolean(checks.relayer.capabilities);

    const token = capabilities[String(chainId)]?.tokens.find(
      (candidate) => candidate.address.toLowerCase() === CONTRACT_ADDRESSES.usdc.toLowerCase() || candidate.symbol === "USDC",
    );
    if (token) checks.relayer.feeData = await getFeeData(chainId, token.address);
  } catch (error) {
    checks.relayer.error = error instanceof Error ? error.message : "Relayer check failed";
  }

  return NextResponse.json({ service: "PRaise integrations", checks });
}
