import { NextRequest, NextResponse } from "next/server";
import {
  verifyPRForBounty,
  scoreContribution,
  analyzeDispute,
  analyzeIssue,
  agentDecideNextAction,
} from "@/lib/venice/client";

// ── POST /api/venice/verify ──────────────────────────────────────────────
/**
 * Body:
 *   {
 *     action: "verify-pr" | "score" | "dispute" | "analyze-issue" | "next-action",
 *     ...action-specific params
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ── Verify PR for Bounty ────────────────────────────────────────
      case "verify-pr": {
        const { issueDescription, prDescription, prDiff, repoName } = body;

        if (!issueDescription || !prDescription || !prDiff || !repoName) {
          return NextResponse.json(
            {
              error:
                "issueDescription, prDescription, prDiff, and repoName are required",
            },
            { status: 400 }
          );
        }

        const result = await verifyPRForBounty(
          issueDescription,
          prDescription,
          prDiff,
          repoName
        );

        return NextResponse.json({
          verification: result,
          timestamp: new Date().toISOString(),
        });
      }

      // ── Score Contribution ──────────────────────────────────────────
      case "score": {
        const { issueDescription, prDescription, prDiff } = body;

        if (!issueDescription || !prDescription || !prDiff) {
          return NextResponse.json(
            {
              error: "issueDescription, prDescription, and prDiff are required",
            },
            { status: 400 }
          );
        }

        const score = await scoreContribution(
          issueDescription,
          prDescription,
          prDiff
        );

        return NextResponse.json({ score });
      }

      // ── Analyze Dispute ─────────────────────────────────────────────
      case "dispute": {
        const {
          issueDescription,
          prDescription,
          contributorReason,
          creatorReason,
        } = body;

        if (
          !issueDescription ||
          !prDescription ||
          !contributorReason ||
          !creatorReason
        ) {
          return NextResponse.json(
            {
              error:
                "issueDescription, prDescription, contributorReason, and creatorReason are required",
            },
            { status: 400 }
          );
        }

        const resolution = await analyzeDispute(
          issueDescription,
          prDescription,
          contributorReason,
          creatorReason
        );

        return NextResponse.json({ resolution });
      }

      // ── Analyze Issue ───────────────────────────────────────────────
      case "analyze-issue": {
        const { issueTitle, issueBody } = body;

        if (!issueTitle) {
          return NextResponse.json(
            { error: "issueTitle is required" },
            { status: 400 }
          );
        }

        const analysis = await analyzeIssue(issueTitle, issueBody || "");

        return NextResponse.json({ analysis });
      }

      // ── Decide Next Action ──────────────────────────────────────────
      case "next-action": {
        const { bountyId, status, hasPR, prMerged, contestPeriodEnded, hasDispute } =
          body;

        if (bountyId === undefined || !status) {
          return NextResponse.json(
            { error: "bountyId and status are required" },
            { status: 400 }
          );
        }

        const decision = await agentDecideNextAction({
          bountyId,
          status,
          hasPR: !!hasPR,
          prMerged: !!prMerged,
          contestPeriodEnded: !!contestPeriodEnded,
          hasDispute: !!hasDispute,
        });

        return NextResponse.json({ decision });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("Venice API error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Venice AI request failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// ── GET /api/venice/verify ───────────────────────────────────────────────
/**
 * Health check and available models.
 */
export async function GET() {
  try {
    const { listModels } = await import("@/lib/venice/client");
    const models = await listModels("text");
    return NextResponse.json({
      service: "PRaise Venice AI Verification",
      status: "operational",
      availableModels: models.slice(0, 5).map((m) => ({
        id: m.id,
        name: m.model_spec.name,
        pricing: m.model_spec.pricing,
      })),
    });
  } catch (err) {
    return NextResponse.json({
      service: "PRaise Venice AI Verification",
      status: "checking_config",
      error: "Configure VENICE_API_KEY in your .env file",
    });
  }
}
