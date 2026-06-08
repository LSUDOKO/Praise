import { NextRequest, NextResponse } from "next/server";
import {
  getCapabilities,
  getFeeData,
  estimateTransaction,
  sendTransaction,
  getStatus,
  waitForCompletion,
} from "@/lib/relayer/client";
import { CONTRACT_ADDRESSES } from "@/lib/contracts/client";
import { Interface } from "ethers";

// ── Arbitrum Sepolia Configuration ────────────────────────────────────────
const CHAIN_ID = CONTRACT_ADDRESSES.chainId;
const PAYMENT_TOKEN = CONTRACT_ADDRESSES.usdc;

// Use ethers Interface for ABI-encoded calldata
const BOUNTY_INTERFACE = new Interface(["function release(address contributor)"]);

// ── POST /api/relayer ─────────────────────────────────────────────────────
/**
 * Body:
 *   {
 *     action: "capabilities" | "fee" | "estimate" | "send" | "status",
 *     ...action-specific params
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ── Capabilities Discovery ──────────────────────────────────────
      case "capabilities": {
        const chainIds = body.chainIds || [String(CHAIN_ID)];
        const caps = await getCapabilities(chainIds.map(Number));
        return NextResponse.json({ capabilities: caps });
      }

      // ── Fee Data ────────────────────────────────────────────────────
      case "fee": {
        const feeData = await getFeeData(CHAIN_ID, PAYMENT_TOKEN);
        return NextResponse.json({
          feeData: {
            ...feeData,
            chainId: CHAIN_ID,
            paymentToken: PAYMENT_TOKEN,
          },
        });
      }

      // ── Estimate Transaction ────────────────────────────────────────
      case "estimate": {
        const { transactions, memo } = body;
        if (!transactions || !Array.isArray(transactions)) {
          return NextResponse.json(
            { error: "transactions array is required" },
            { status: 400 }
          );
        }

        const estimate = await estimateTransaction(CHAIN_ID, {
          chainId: CHAIN_ID,
          transactions,
          memo,
        });

        return NextResponse.json({ estimate });
      }

      // ── Send Transaction ────────────────────────────────────────────
      case "send": {
        const {
          transactions,
          context,
          destinationUrl,
          memo,
          authorizationList,
        } = body;

        if (!transactions || !context) {
          return NextResponse.json(
            { error: "transactions and context are required" },
            { status: 400 }
          );
        }

        const taskId = await sendTransaction(CHAIN_ID, {
          chainId: CHAIN_ID,
          transactions,
          context,
          destinationUrl,
          memo,
          authorizationList,
        });

        return NextResponse.json({ taskId });
      }

      // ── Check Status ────────────────────────────────────────────────
      case "status": {
        const { taskId, logs } = body;
        if (!taskId) {
          return NextResponse.json(
            { error: "taskId is required" },
            { status: 400 }
          );
        }

        const status = await getStatus(taskId, logs ?? false);
        return NextResponse.json({ status });
      }

      // ── Wait for Completion ─────────────────────────────────────────
      case "wait": {
        const { taskId, pollIntervalMs, maxAttempts } = body;
        if (!taskId) {
          return NextResponse.json(
            { error: "taskId is required" },
            { status: 400 }
          );
        }

        const status = await waitForCompletion(
          taskId,
          pollIntervalMs,
          maxAttempts
        );
        return NextResponse.json({ status });
      }

      // ── Build Release Transaction ───────────────────────────────────
      case "build-release": {
        const { bountyAddress, contributorAddress, permissionContext } = body;

        if (!bountyAddress || !contributorAddress || !permissionContext) {
          return NextResponse.json(
            {
              error:
                "bountyAddress, contributorAddress, and permissionContext are required",
            },
            { status: 400 }
          );
        }

        // Encode release(contributor) call using ethers Interface
        const releaseData = BOUNTY_INTERFACE.encodeFunctionData("release", [contributorAddress]);

        const transactions = [
          {
            permissionContext: [permissionContext],
            executions: [
              {
                to: bountyAddress,
                value: "0x0",
                data: releaseData,
              },
            ],
          },
        ];

        return NextResponse.json({
          chainId: CHAIN_ID,
          transactions,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("Relayer API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Relayer request failed" },
      { status: 500 }
    );
  }
}

// ── GET /api/relayer ──────────────────────────────────────────────────────
/**
 * Health check and status.
 */
export async function GET() {
  return NextResponse.json({
    service: "1Shot Public Relayer",
    chainId: CHAIN_ID,
    network: "Arbitrum Sepolia",
    paymentToken: PAYMENT_TOKEN,
    docs: "https://relayer.1shotapi.dev/relayers",
  });
}
