import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db/client";
import { challengeStore } from "@/lib/db/redis";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * Helper: get authenticated user from session cookie.
 */
async function getAuthUser(req: NextRequest) {
  const sessionToken = req.cookies.get("praise_session")?.value;
  if (!sessionToken) return null;

  const userId = await challengeStore.get(`session:${sessionToken}`);
  if (!userId) return null;

  return db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
}

/**
 * GET /api/bounties — List all bounties (public).
 */
export async function GET() {
  try {
    const allBounties = await db.select().from(schema.bounties);
    return NextResponse.json({ bounties: allBounties });
  } catch (err) {
    console.error("List bounties error:", err);
    return NextResponse.json(
      { error: "Failed to list bounties" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bounties — Create a new bounty (authenticated).
 *
 * Body:
 *   {
 *     repo: string,
 *     issueNumber: number,
 *     amount: string,
 *     agentAddress: string,
 *     contestPeriod: number, // seconds
 *     bountyAddress?: string, // on-chain address if already deployed
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.accountAddress) {
      return NextResponse.json(
        { error: "Wallet not connected. Please sign in with your passkey first." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { repo, issueNumber, amount, agentAddress, contestPeriod, bountyAddress } = body;

    if (!repo || !issueNumber || !amount || !agentAddress || !contestPeriod) {
      return NextResponse.json(
        { error: "Missing required fields: repo, issueNumber, amount, agentAddress, contestPeriod" },
        { status: 400 }
      );
    }

    const bountyId = randomUUID();

    await db.insert(schema.bounties).values({
      id: bountyId,
      repo,
      issueNumber: Number(issueNumber),
      amount: String(amount),
      bountyAddress: bountyAddress || null,
      creatorAddress: user.accountAddress,
      agentAddress,
      contestPeriod: Number(contestPeriod),
      status: bountyAddress ? "live" : "pending",
    });

    const created = await db.query.bounties.findFirst({
      where: eq(schema.bounties.id, bountyId),
    });

    return NextResponse.json({ bounty: created }, { status: 201 });
  } catch (err) {
    console.error("Create bounty error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create bounty" },
      { status: 500 }
    );
  }
}
