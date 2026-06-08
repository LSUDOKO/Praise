import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db/client";
import { challengeStore } from "@/lib/db/redis";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get("praise_session")?.value;
    if (!sessionToken) {
      return NextResponse.json({ user: null });
    }

    const userId = await challengeStore.get(`session:${sessionToken}`);
    if (!userId) {
      return NextResponse.json({ user: null });
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        accountAddress: user.accountAddress,
      },
    });
  } catch (err) {
    console.error("User session route error:", err);
    return NextResponse.json({ user: null });
  }
}
