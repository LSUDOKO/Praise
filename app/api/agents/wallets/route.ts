import { NextRequest, NextResponse } from "next/server";
import { oneshotClient, getBusinessId } from "@/lib/oneshot/client";

/**
 * GET  /api/agents/wallets — List all server wallets for this business.
 * POST /api/agents/wallets — Create a new server wallet.
 */
export async function GET(req: NextRequest) {
  try {
    const businessId = getBusinessId();
    const searchParams = req.nextUrl.searchParams;
    const chainId = searchParams.get("chainId")
      ? Number(searchParams.get("chainId"))
      : undefined;

    const result = await oneshotClient.wallets.list(businessId, {
      chainId,
      page: 1,
      pageSize: 50,
    });

    return NextResponse.json({
      wallets: result.response,
      page: result.page,
      totalResults: result.totalResults,
    });
  } catch (err) {
    console.error("List wallets error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list wallets" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const businessId = getBusinessId();
    const body = await req.json();

    const { chainId, name, description } = body;
    if (!chainId) {
      return NextResponse.json({ error: "chainId is required" }, { status: 400 });
    }

    const wallet = await oneshotClient.wallets.create(businessId, {
      chainId: Number(chainId),
      name: name || "PRaise Agent Wallet",
      description: description || "Server wallet for PRaise bounty agent operations",
    });

    return NextResponse.json({ wallet });
  } catch (err) {
    console.error("Create wallet error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create wallet" },
      { status: 500 }
    );
  }
}
