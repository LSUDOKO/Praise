import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db/client";
import { challengeStore } from "@/lib/db/redis";
import { eq } from "drizzle-orm";

const rpID = process.env.RP_ID || "localhost";
const publicOrigin = process.env.PUBLIC_ORIGIN || "http://localhost:3000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. If credential is not present, generate authentication options
    if (!body.credential) {
      const { username } = body;
      if (!username) {
        return NextResponse.json({ error: "Username is required" }, { status: 400 });
      }

      // Look up user
      const user = await db.query.users.findFirst({
        where: eq(schema.users.username, username),
      });

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 400 });
      }

      // Get credentials
      const userCredentials = await db
        .select()
        .from(schema.credentials)
        .where(eq(schema.credentials.userId, user.id));

      if (userCredentials.length === 0) {
        return NextResponse.json({ error: "No passkeys registered for this user" }, { status: 400 });
      }

      const options = await generateAuthenticationOptions({
        rpID,
        timeout: 60_000,
        userVerification: "required",
        allowCredentials: userCredentials.map((c) => ({
          id: c.id,
          type: "public-key",
        })),
      });

      const challengeId = randomUUID();
      await challengeStore.set(`challenge:${challengeId}`, options.challenge, 60);

      return NextResponse.json({ ...options, challengeId });
    }

    // 2. If credential is present, verify the authentication response
    const { credential, challengeId, accountAddress } = body;
    if (!credential || !challengeId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const storedChallenge = await challengeStore.get(`challenge:${challengeId}`);
    if (!storedChallenge) {
      return NextResponse.json({ error: "Challenge expired or invalid" }, { status: 400 });
    }

    // Look up the credential from DB
    const userCredential = await db.query.credentials.findFirst({
      where: eq(schema.credentials.id, credential.id),
    });

    if (!userCredential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 400 });
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: storedChallenge,
      expectedOrigin: publicOrigin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: userCredential.id,
        credentialPublicKey: Buffer.from(userCredential.publicKey, "base64"),
        counter: userCredential.counter,
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Authentication verification failed" }, { status: 400 });
    }

    // Update credential counter
    await db
      .update(schema.credentials)
      .set({ counter: verification.authenticationInfo.newCounter })
      .where(eq(schema.credentials.id, credential.id));

    // Save account address if provided and not set already
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userCredential.userId),
    });

    if (user && accountAddress && !user.accountAddress) {
      await db
        .update(schema.users)
        .set({ accountAddress })
        .where(eq(schema.users.id, user.id));
    }

    await challengeStore.del(`challenge:${challengeId}`);

    // Create session token and set cookie
    const sessionToken = randomUUID();
    await challengeStore.set(`session:${sessionToken}`, userCredential.userId, 86400 * 30); // 30 days session

    const res = NextResponse.json({
      success: true,
      user: {
        id: userCredential.userId,
        username: user?.username,
        accountAddress: accountAddress || user?.accountAddress,
      },
    });

    res.cookies.set("praise_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400 * 30,
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("Login route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
