import { NextRequest, NextResponse } from "next/server";
import { validateWebhook } from "@1shotapi/client-sdk";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";

/**
 * POST /api/webhooks/1shot
 *
 * Receives webhook deliveries from 1Shot API for transaction status updates.
 * Verifies the webhook signature using the endpoint's public key,
 * then updates the bounty status in the database.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const signature = body.signature;

    if (!signature) {
      return NextResponse.json({ error: "Signature missing" }, { status: 400 });
    }

    // Verify the webhook signature
    const publicKey = process.env.ONESHOT_WEBHOOK_PUBLIC_KEY;
    if (!publicKey) {
      console.error("ONESHOT_WEBHOOK_PUBLIC_KEY not configured");
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 },
      );
    }

    const isValid = await validateWebhook(body, publicKey);

    if (!isValid) {
      console.warn("1Shot webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    // Process webhook event. 1Shot API webhooks use eventName/content;
    // public relayer webhooks use numeric type and data.
    const { eventName, content, type, data } = body;
    const relayerStatus = typeof type === "number" ? type : null;
    const memoSource = content?.memo || data?.memo;

    if (eventName === "TransactionExecutionSuccess" || relayerStatus === 0) {
      const memo = memoSource;
      if (memo) {
        try {
          const memoData = JSON.parse(memo);
          if (memoData.bountyId) {
            await db
              .update(schema.bounties)
              .set({ status: "paid" })
              .where(eq(schema.bounties.id, memoData.bountyId));
            console.log(`Bounty ${memoData.bountyId} marked as paid`);
          }
        } catch {
          // memo may not be JSON — that's fine, log it
          console.log("Transaction success with non-JSON memo:", memo);
        }
      }
    } else if (
      eventName === "TransactionExecutionFailure" ||
      relayerStatus === 1
    ) {
      const memo = memoSource;
      if (memo) {
        try {
          const memoData = JSON.parse(memo);
          if (memoData.bountyId) {
            // Revert status to live so it can be retried
            await db
              .update(schema.bounties)
              .set({ status: "live" })
              .where(eq(schema.bounties.id, memoData.bountyId));
            console.error(
              `Transaction failed for bounty ${memoData.bountyId}:`,
              content?.error || data?.message || data?.data,
            );
          }
        } catch {
          console.error("Transaction failure with non-JSON memo:", memo);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("1Shot webhook processing error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
