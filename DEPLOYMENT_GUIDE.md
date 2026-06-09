# PRaise — Deployment & Webhook Setup Guide

## 1. Deploy to Vercel (one-time)

### A) CLI deploy (recommended)

```bash
npm i -g vercel
vercel login
vercel --prod
```

Vercel will print your URL, e.g. `https://praise-xyz.vercel.app`

### B) GitHub integration

1. Push the repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) → Import the repository.
3. Vercel auto-detects Next.js — click **Deploy**.

---

## 2. Environment Variables on Vercel

Go to **Project → Settings → Environment Variables** and add all of these:

| Variable | Example value | Notes |
|---|---|---|
| `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` | `BPi5Pwo...` | From [developer.metamask.io](https://developer.metamask.io) |
| `NEXT_PUBLIC_WEB3AUTH_NETWORK` | `sapphire_devnet` | Use `sapphire_mainnet` for production (don't change after users exist) |
| `NEXT_PUBLIC_RPC_URL` | `https://sepolia-rollup.arbitrum.io/rpc` | Arbitrum Sepolia RPC |
| `NEXT_PUBLIC_CHAIN_ID` | `421614` | Arbitrum Sepolia chain ID |
| `NEXT_PUBLIC_CHAIN_NAME` | `Arbitrum Sepolia` | |
| `NEXT_PUBLIC_BLOCK_EXPLORER_URL` | `https://sepolia.arbiscan.io` | |
| `DATABASE_URL` | `postgresql://...` | Postgres connection string (Supabase/Neon free tier works) |
| `REDIS_URL` | `redis://...` | Optional — in-memory fallback used without it |
| `ONESHOT_API_KEY` | `...` | From 1Shot API dashboard |
| `ONESHOT_API_SECRET` | `...` | From 1Shot API dashboard |
| `ONESHOT_BUSINESS_ID` | `...` | Your 1Shot business UUID |
| `ONESHOT_WEBHOOK_PUBLIC_KEY` | `SBLzVF0d...` | **Copied from the 1Shot webhook form** (see step 3 below) |
| `VENICE_API_KEY` | `...` | From [venice.ai/settings/api](https://venice.ai/settings/api) |
| `X402_ENABLED` | `true` | Set `false` to disable payment gating for demos |
| `X402_PAY_TO` | `0xYourAddress` | EVM address that receives bounty creation fees |
| `X402_BOUNTY_CREATE_PRICE_USDC` | `0.10` | Platform fee per bounty creation |
| `TRUSTED_SIGNER` | `0xYourAgentKey` | Agent signing key address (used as fallback for X402_PAY_TO) |
| `RP_ID` | `praise-xyz.vercel.app` | WebAuthn relying party ID — **must match your actual domain** |
| `PUBLIC_ORIGIN` | `https://praise-xyz.vercel.app` | Full origin URL — **must match your actual domain** |
| `RP_NAME` | `PRaise` | Display name for passkey prompts |

---

## 3. Create the 1Shot Webhook (fill out the form)

After deploying, create a webhook at [app.1shotapi.com](https://app.1shotapi.com) (or your 1Shot dashboard).

The form asks for three fields:

### Name
```
PRaise Bounty Status
```
(Any label — helps you identify it later)

### Destination URL
```
https://YOUR-VERCEL-DOMAIN.vercel.app/api/webhooks/1shot
```
Replace `YOUR-VERCEL-DOMAIN` with your actual Vercel project URL.

> **Local dev alternative**: run `npx ngrok http 3000` and use the ngrok HTTPS URL instead.  
> e.g. `https://abc123.ngrok-free.app/api/webhooks/1shot`

### Description (optional)
```
Receives transaction status updates for bounty releases. Used to mark bounties as paid or retry on failure.
```

### After saving the webhook

1Shot will show you a **public key** (base64 string, looks like `SBLzVF0dHNo/6tXo3+UOsYnCJ3Brq/SNxAFOAMWxTVo=`).

Copy it and set it as the `ONESHOT_WEBHOOK_PUBLIC_KEY` environment variable on Vercel, then redeploy.

---

## 4. Test the Webhook

```bash
# Quick smoke test — should return 200 { received: true } for empty bodies
# (will return 400 because signature is missing, which proves the endpoint is live)
curl -X POST https://YOUR-VERCEL-DOMAIN.vercel.app/api/webhooks/1shot \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: {"error":"Signature missing"}  ← 400, endpoint is reachable ✓

# Integration health check
curl https://YOUR-VERCEL-DOMAIN.vercel.app/api/integrations
```

---

## 5. Relayer Webhook URL (for gasless bounty releases)

When building a gasless relayed transaction (via `/api/relayer`), pass your deployed webhook URL as the `destinationUrl`:

```json
{
  "action": "send",
  "transactions": [...],
  "context": "...",
  "destinationUrl": "https://YOUR-VERCEL-DOMAIN.vercel.app/api/webhooks/1shot",
  "memo": "{\"bountyId\":\"<uuid>\"}"
}
```

The relayer will POST signed status updates to that URL on every state change.

---

## 6. Free Database Options

If you don't have a Postgres DB yet:

- **[Neon](https://neon.tech)** — free serverless Postgres, `DATABASE_URL` is on the dashboard
- **[Supabase](https://supabase.com)** — free Postgres + Redis, connection string under Settings → Database

After setting `DATABASE_URL`, push the schema:

```bash
npm run db:push
```
