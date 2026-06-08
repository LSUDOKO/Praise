import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import { randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db/client";
import { challengeStore } from "@/lib/db/redis";
import { eq } from "drizzle-orm";

const rpID = process.env.RP_ID || "localhost";
const rpName = process.env.RP_NAME || "PRaise Bounties";
const publicOrigin = process.env.PUBLIC_ORIGIN || "http://localhost:3000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. If credential is not present, generate registration options
    if (!body.credential) {
      const { username } = body;
      if (!username) {
        return NextResponse.json({ error: "Username is required" }, { status: 400 });
      }

      // Check if user already exists
      const existingUser = await db.query.users.findFirst({
        where: eq(schema.users.username, username),
      });

      if (existingUser) {
        return NextResponse.json({ error: "Username is already taken" }, { status: 400 });
      }

      const prfSaltBytes = randomBytes(32);
      const prfSaltBase64url = prfSaltBytes
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: username,
        timeout: 60_000,
        attestationType: "none",
        excludeCredentials: [],
        authenticatorSelection: {
          userVerification: "required",
          requireResidentKey: false,
        },
        supportedAlgorithmIDs: [-7, -257], // ES256, RS256
        extensions: {
          credBlob: true,
          largeBlob: { support: "preferred" },
          prf: { eval: { first: prfSaltBase64url } },
        } as any,
      });

      const challengeId = randomUUID();
      await challengeStore.set(`challenge:${challengeId}`, options.challenge, 60);

      return NextResponse.json({ ...options, challengeId });
    }

    // 2. If credential is present, verify the registration response
    const { credential, challengeId, username } = body;
    if (!credential || !challengeId || !username) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const storedChallenge = await challengeStore.get(`challenge:${challengeId}`);
    if (!storedChallenge) {
      return NextResponse.json({ error: "Challenge expired or invalid" }, { status: 400 });
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: storedChallenge,
      expectedOrigin: publicOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Registration verification failed" }, { status: 400 });
    }

    // Determine credential type based on extensions support
    const cer = credential.clientExtensionResults || {};
    const hasCredBlob = "credBlob" in cer;
    const hasLargeBlobSupport =
      typeof cer.largeBlob === "object" &&
      cer.largeBlob !== null &&
      "supported" in cer.largeBlob &&
      (cer.largeBlob as any).supported === true;
    const hasLongBlob = hasCredBlob || hasLargeBlobSupport;
    const hasPRF = typeof cer.prf === "object" && cer.prf !== null && (cer.prf as any).enabled === true;

    if (!hasLongBlob && !hasPRF) {
      return NextResponse.json(
        { error: "Authenticator must support PRF or LongBlob" },
        { status: 400 }
      );
    }

    const credentialType = hasLongBlob ? "LongBlob" : "PRF";
    const info = verification.registrationInfo;

    // Save user and credential in database
    const userId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(schema.users).values({
        id: userId,
        username,
      });

      await tx.insert(schema.credentials).values({
        id: info.credentialID,
        userId,
        publicKey: Buffer.from(info.credentialPublicKey).toString("base64"),
        credentialType,
        counter: info.counter || 0,
      });
    });

    await challengeStore.del(`challenge:${challengeId}`);

    // Create session token and set in cookie
    const sessionToken = randomUUID();
    await challengeStore.set(`session:${sessionToken}`, userId, 86400 * 30); // 30 days session

    const res = NextResponse.json({ success: true, user: { id: userId, username } });
    res.cookies.set("praise_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400 * 30,
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("Registration route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
