import { NextRequest, NextResponse } from "next/server";
import { oneshotClient } from "@/lib/oneshot/client";

/**
 * POST /api/agents/execute
 *
 * Executes a smart contract method via 1Shot API.
 * Supports both direct execution and delegated execution.
 *
 * Body:
 *   {
 *     contractMethodId: string (UUID),
 *     params: Record<string, string>,
 *     walletId?: string,
 *     memo?: string,
 *     // For delegated execution:
 *     delegated?: boolean,
 *     delegatorAddress?: string,
 *     delegationId?: string,
 *     delegationData?: string[],
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      contractMethodId,
      params,
      walletId,
      memo,
      delegated,
      delegatorAddress,
      delegationId,
      delegationData,
    } = body;

    if (!contractMethodId) {
      return NextResponse.json(
        { error: "contractMethodId is required" },
        { status: 400 }
      );
    }

    if (!params || typeof params !== "object") {
      return NextResponse.json(
        { error: "params object is required" },
        { status: 400 }
      );
    }

    let transaction;

    if (delegated) {
      // Delegated execution — exactly one identity must be provided
      const identities = [delegatorAddress, delegationId, delegationData].filter(Boolean);
      if (identities.length !== 1) {
        return NextResponse.json(
          {
            error:
              "Exactly one of delegatorAddress, delegationId, or delegationData must be provided for delegated execution",
          },
          { status: 400 }
        );
      }

      transaction = await oneshotClient.contractMethods.executeAsDelegator(
        contractMethodId,
        params,
        {
          walletId,
          memo: memo || "PRaise delegated bounty operation",
          ...(delegatorAddress && { delegatorAddress }),
          ...(delegationId && { delegationId }),
          ...(delegationData && { delegationData }),
        }
      );
    } else {
      // Direct execution
      transaction = await oneshotClient.contractMethods.execute(
        contractMethodId,
        params,
        {
          walletId,
          memo: memo || "PRaise bounty operation",
        }
      );
    }

    return NextResponse.json({ transaction });
  } catch (err) {
    console.error("Execute error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Execution failed" },
      { status: 500 }
    );
  }
}
