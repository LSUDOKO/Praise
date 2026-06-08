# PRaise — Hackathon Build Todo List & Technical Roadmap

> **Goal:** Ship a fully functional, market-ready, professional open-source bounty platform with real MetaMask Smart Accounts, WebAuthn PRF Embedded Wallets, 1Shot Relayer, Venice AI, x402, and GitHub integrations.

---

## 📋 How To Use This File

- **P0** = Must-have for the hackathon demo (ship these first)
- **P1** = Must-have for market-ready launch
- **P2** = Nice-to-have for v1
- **P3** = Future / v2

Each task has: **what to build**, **target files**, **relevant APIs**, **acceptance criteria**, and **time estimate**.
Additionally, follow the **Commit Boundaries** and **Integration Checkpoints** at the end of each phase.

---

## 🛠️ Tech Stack (Locked Decisions)

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) + TypeScript (React 19) |
| **Styling** | Vanilla CSS (Maximum flexibility, custom design system, no Tailwind placeholders) |
| **Web3** | Wagmi v2 + Viem + RainbowKit |
| **Embedded Wallet** | WebAuthn PRF-first wallet (Iframe-isolated, Postmate, Bowser) |
| **Smart Accounts** | @metamask/smart-accounts-kit (EIP-7702, EIP-7715, ERC-7710) |
| **Backend** | Next.js App Router API Routes |
| **Database** | PostgreSQL (Neon) + Drizzle ORM |
| **Cache/Queue** | Redis + BullMQ (for background agent tasks) |
| **AI** | Venice AI SDK / REST API (Terse code reviews, Sybil/spam checks, digests) |
| **Relayer** | 1Shot Public Relayer (JSON-RPC) + 1Shot API Node SDK |
| **Auth** | NextAuth.js (GitHub OAuth + SIWE) |
| **Smart Contracts** | Solidity 0.8.24 + Foundry |
| **Testing** | Vitest + Playwright + Foundry tests |
| **Deployment** | Vercel (Frontend) + Linea/Base (Smart Contracts) |

---

## 📁 Target Project Structure

```
praise/
├── app/                              # Next.js App Router (Pages & API Routes)
│   ├── (marketing)/                  # Public pages
│   │   ├── page.tsx                  # Landing page (High-aesthetic Hero, Features, How It Works)
│   │   └── explore/page.tsx          # Public bounty board
│   ├── (app)/                        # Authenticated dashboards
│   │   ├── dashboard/page.tsx        # Maintainer Dashboard
│   │   ├── dashboard/bounties/new/page.tsx # Create bounty wizard
│   │   ├── dashboard/bounties/[id]/page.tsx # Bounty detail & agent timeline page
│   │   └── contributor/page.tsx      # Contributor Dashboard
│   ├── wallet/local/page.tsx         # Iframe-isolated wallet (Postmate Model)
│   └── api/                          # Next.js API Routes
│       ├── auth/register/route.ts    # Passkey Registration endpoints (SimpleWebAuthn)
│       ├── auth/login/route.ts       # Passkey Authentication endpoints (SimpleWebAuthn)
│       ├── webhooks/github/route.ts  # GitHub events webhook (PR open/merge)
│       ├── webhooks/1shot/route.ts   # 1Shot relayer events webhook (Ed25519 verification)
│       ├── bounties/route.ts         # Bounty CRUD endpoints
│       ├── bounties/[id]/release/route.ts # Release trigger endpoint
│       ├── agents/review/route.ts    # Venice AI Code Review Agent endpoint
│       └── x402/lookup/route.ts      # x402 protected resource / lookup endpoint
├── components/                       # UI Components (Vanilla CSS modules)
│   ├── ui/                           # Base UI elements
│   ├── wallet/
│   │   ├── WalletConnect.tsx         # RainbowKit integration
│   │   ├── SmartAccountStatus.tsx    # Wallet state, balances, SA type
│   │   └── PermissionGrantModal.tsx  # ERC-7715 permissions approval modal
│   ├── bounty/
│   │   ├── BountyCard.tsx            # Card on public explore board
│   │   ├── BountyStatus.tsx          # Status badge (Live, In Review, Paid)
│   │   ├── BountyTimeline.tsx        # Vertical event log
│   │   └── ReleaseProgress.tsx       # USDC gas relay visual status
│   └── agent/
│       ├── AgentActivity.tsx         # Real-time multi-agent streaming view
│       └── AIReviewCard.tsx          # Code review card with Venice score
├── lib/                              # Logic, clients, utilities
│   ├── clientUtils/                  # Client-side crypto & iframe proxy helpers
│   │   ├── WalletProxy.ts            # Parent-side Postmate RPC proxy
│   │   ├── WalletFrame.ts            # Iframe-side Postmate model helper
│   │   ├── ClientCrypto.ts           # HKDF -> secp256k1 key derivation and signing
│   │   └── platformSupport.ts        # Browser/OS platform capability check
│   ├── contracts/                    # Solidity ABIs, Deployments, and addresses
│   ├── oneshot/                      # 1Shot public relayer client wrapper
│   │   └── client.ts                 # discover caps, quote, estimate, relay EIP-7710 txs
│   ├── venice/                       # Venice AI SDK wrapper
│   ├── github/                       # GitHub App client wrappers
│   ├── db/                           # Drizzle schema, connection, queries
│   ├── x402/                         # x402 protocol helper
│   └── agents/                       # Off-chain multi-agent service (CI, Spam, Approver)
├── contracts/                        # Foundry Solidity Project
│   ├── src/
│   │   ├── Bounty.sol                # Escrow contract
│   │   ├── BountyFactory.sol         # Escrow factory
│   │   └── AgentDelegation.sol       # ERC-7710 Delegated execution verifier
│   ├── test/                         # Foundry tests
│   └── script/                       # Deployment scripts
├── README.md
├── TODO.md                           # This file
└── package.json
```

---

# 🚀 PHASE 0 — Project Infrastructure Setup (Day 1)

### [P0] T001 — Dependencies Installation
- **What:** Install required packages for all integrations.
- **Libs:** `@simplewebauthn/browser`, `@simplewebauthn/server`, `postmate`, `bowser`, `ethers`, `viem`, `wagmi`, `@tanstack/react-query`, `@metamask/smart-accounts-kit`, `@1shot/api`, `pg`, `drizzle-orm`, `redis`, `bullmq`, `safe-stable-stringify`, `@noble/ed25519`.
- **Files:** [package.json](file:///home/arpit/Desktop/hackathon_projects/praise/package.json)
- **Acceptance:** `npm install` runs cleanly without dependency conflicts.
- **Time:** 30 min

### [P0] T002 — Environment Config (.env)
- **What:** Define and document all required API keys, RPCs, and secrets.
- **Keys:** `DATABASE_URL`, `REDIS_URL`, `ONESHOT_API_KEY`, `VENICE_API_KEY`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NEXTAUTH_SECRET`.
- **Files:** `.env.example`, `.env`
- **Acceptance:** App loads and logs missing keys gracefully on startup.
- **Time:** 15 min

### [P0] T003 — Design System & Vanilla CSS Setup
- **What:** Establish typography, custom dark/light theme tokens, and global styles without Tailwind placeholders.
- **Files:** [app/globals.css](file:///home/arpit/Desktop/hackathon_projects/praise/app/globals.css)
- **Acceptance:** CSS variables for rich visual hierarchy, glassmorphism, and responsive scales are available.
- **Time:** 1 hour

### [P0] T004 — Database & Drizzle Schema Initialization
- **What:** Setup tables for `users`, `bounties`, `agents`, `transactions`, `reviews`, and `github_installs`.
- **Files:** `lib/db/schema.ts`, `lib/db/client.ts`
- **Acceptance:** Migrations push successfully to Postgres.
- **Time:** 2 hours

---

# 🔐 PHASE 1 — WebAuthn PRF Embedded Wallet (Day 2)
*Skill: webauthn-prf-wallet*

### [P0] T101 — Platform Support Check
- **What:** Create a helper using `bowser` to detect WebAuthn PRF support, gating out incompatible devices and in-app webviews.
- **Files:** `lib/clientUtils/platformSupport.ts`
- **Acceptance:** Correctly identifies PRF capability and blocks webviews.
- **Time:** 1 hour

### [P0] T102 — Client Cryptography & Derivation
- **What:** Implement deterministic key derivation `prfToValidEthPrivKey` (HKDF -> secp256k1) using browser SubtleCrypto, using a permanent versioned info label (`"com.praise.eth-key-v1"`).
- **Files:** `lib/clientUtils/ClientCrypto.ts`
- **Acceptance:** Generates valid, reproducible secp256k1 private keys from PRF output bytes.
- **Time:** 2 hours

### [P0] T103 — Iframe-Isolated Wallet Page
- **What:** Create a same-origin route `/wallet/local` that hosts a Postmate `Model` to keep keys strictly in-memory.
- **Files:** `app/wallet/local/page.tsx`
- **Acceptance:** Page loads silently, implements `signMessage` and `signDelegation` RPC hooks.
- **Time:** 3 hours

### [P0] T104 — Parent Wallet Proxy Client
- **What:** Build the `WalletProxy` wrapper that establishes connection with the Postmate iframe, temporarily styling and focusing the iframe during WebAuthn ceremonies.
- **Files:** `lib/clientUtils/WalletProxy.ts`
- **Acceptance:** Initiates Postmate handshake; triggers user-activation correctly.
- **Time:** 2 hours

### [P0] T105 — SimpleWebAuthn Server Options & Verification
- **What:** Build register/login routes fetching challenge parameters and verifying signatures on the backend. Store challenges in Redis with a 60s TTL.
- **Files:** `app/api/auth/register/route.ts`, `app/api/auth/login/route.ts`
- **Acceptance:** Options generated with proper base64url-encoded PRF salts; verification parses response successfully.
- **Time:** 3 hours

### [P0] T106 — LongBlob Fallback & Recovery hooks
- **What:** Implement fallback using `credBlob`/`largeBlob` for browsers without PRF; generate recovery phrase (PBKDF2-SHA256, AES-256-GCM) stored server-side.
- **Files:** `lib/clientUtils/ClientCrypto.ts`, `app/api/auth/recover/route.ts`
- **Acceptance:** Fallback triggers on unsupported browsers; wallet is recoverable via phrase.
- **Time:** 3 hours

---
### 🏁 Integration Checkpoint & Commit Boundary 1
- **Status:** Complete Phase 1 and commit as `feat: webauthn-prf-embedded-wallet`.
- **Test Checkpoint:** Register a user using a passkey. Lock and unlock the wallet. Confirm that:
  1. The private key never leaks to the parent page's console/scope.
  2. The derived EVM address is identical across logins.
  3. The iframe is dynamically styled to visible size only during the fingerprint prompt.

---

# 🤖 PHASE 2 — Server Wallets & Direct Execution (Day 3)
*Skill: 1shot-api*

### [P0] T201 — 1Shot SDK Setup
- **What:** Configure the 1Shot Node SDK client to manage backend agent wallets.
- **Files:** `lib/oneshot/client.ts`
- **Acceptance:** Client instantiates and authenticates using the API Key.
- **Time:** 30 min

### [P0] T202 — Server Wallet Management
- **What:** Implement endpoint to create and fetch secure server wallets for AI agent review/orchestrator operations.
- **Files:** `app/api/agents/wallets/route.ts`
- **Acceptance:** Creates secure, managed server-side wallets for the agents.
- **Time:** 1.5 hours

### [P0] T203 — Direct Transaction Execution Endpoint
- **What:** Implement a backend service that submits on-chain reads, contract simulations, and direct transaction calls (e.g., attestation updates) via the 1Shot API.
- **Files:** `app/api/agents/execute/route.ts`
- **Acceptance:** Simulates and submits transaction, returning the pending tx receipt.
- **Time:** 2 hours

### [P0] T204 — 1Shot Webhook Status Receiver
- **What:** Create a webhook endpoint that receives transaction updates from 1Shot and verifies Ed25519 signatures using public keys from `/.well-known/jwks.json`.
- **Files:** `app/api/webhooks/1shot/route.ts`
- **Acceptance:** Correctly rejects invalid signatures; updates transaction status in DB to terminal state on success.
- **Time:** 2.5 hours

---
### 🏁 Integration Checkpoint & Commit Boundary 2
- **Status:** Complete Phase 2 and commit as `feat: oneshot-server-wallets-and-execution`.
- **Test Checkpoint:** Execute a test transaction using a server wallet via the 1Shot API endpoint. Verify that:
  1. The transaction is parsed and simulated correctly.
  2. The webhook successfully receives the receipt, verifies the signature, and updates the database.

---

# 📜 PHASE 3 — Smart Escrow Contracts (Day 4)
*Skills: metamask-smart-account, delegations, advance-permission-erc-7715*

### [P0] T301 — Solidity Contracts Implementation
- **What:** Write Solidity contracts:
  1. `Bounty.sol` — holds USDC escrow, only lets owner reclaim after grace period, releases to contributor via AgentDelegation.
  2. `BountyFactory.sol` — deploys individual Bounty escrows.
  3. `AgentDelegation.sol` — verifier checking EIP-7710 delegation scopes and agent rules.
- **Files:** `contracts/src/Bounty.sol`, `contracts/src/BountyFactory.sol`, `contracts/src/AgentDelegation.sol`
- **Acceptance:** Compilation succeeds using Foundry (`forge build`).
- **Time:** 4 hours

### [P0] T302 — Escrow Contract Tests
- **What:** Write robust Foundry unit tests for deposits, paused states, reclaims, and delegated releases.
- **Files:** `contracts/test/Bounty.t.sol`
- **Acceptance:** `forge test` runs successfully with >95% code coverage.
- **Time:** 3 hours

### [P0] T303 — Deployment & ABI Export
- **What:** Deploy contracts to Linea / Base testnet, verify them on the explorer, and copy ABIs to the Next.js app.
- **Files:** `contracts/script/Deploy.s.sol`, `lib/contracts/`
- **Acceptance:** Contracts deployed; TS interfaces and addresses exported.
- **Time:** 2 hours

---

# 💸 PHASE 4 — 1Shot Public Relayer (Day 5)
*Skill: public-relayer*

### [P0] T401 — Discover Capabilities & Fee Data
- **What:** Fetch `relayer_getCapabilities` to obtain the relayer's `targetAddress` (redemption wallet) and `feeCollector`, and retrieve token pricing with `relayer_getFeeData`.
- **Files:** `lib/oneshot/client.ts`
- **Acceptance:** Returns accepted stablecoins (USDC) and current pricing fee data.
- **Time:** 1 hour

### [P0] T402 — EIP-7702 Smart Account Upgrade
- **What:** Upgrade EOA to a MetaMask `7702StatelessDelegator` smart account. Sign the authorization using the WebAuthn wallet or connected MetaMask client.
- **Files:** `lib/clientUtils/WalletProxy.ts`, `components/wallet/SmartAccountStatus.tsx`
- **Acceptance:** Returns valid EIP-7702 authorization payload for the relayer.
- **Time:** 2 hours

### [P0] T403 — ERC-7715 / ERC-7710 Delegation Creation
- **What:** Implement signing flow:
  1. Use `requestExecutionPermissions` (EIP-7715) to request authority from the user to release bounty funds (capped at bounty amount + fee) to `targetAddress`.
  2. Decode the granted context with `decodeDelegations` and convert to 1Shot JSON format.
- **Files:** `lib/clientUtils/WalletProxy.ts`, `hooks/usePermissions.ts`
- **Acceptance:** User signs the permission scope; delegation context is serialized.
- **Time:** 3 hours

### [P0] T404 — Quote Fee & Price-Lock Quote
- **What:** Build the execution bundle containing a mock fee payment. Call `relayer_estimate7710Transaction` to retrieve the exact `requiredPaymentAmount` and a signed quote `context`.
- **Files:** `lib/oneshot/client.ts`
- **Acceptance:** Retrieves price-locked quote `context` valid for 45s. Re-signs delegation if fee estimate changes.
- **Time:** 2 hours

### [P0] T405 — Submit Relayed EIP-7710 Transaction
- **What:** Call `relayer_send7710Transaction` with the final bundle, the signed quote `context`, a unique `memo`, and the callback `destinationUrl` (pointing to the 1Shot webhook).
- **Files:** `lib/oneshot/client.ts`
- **Acceptance:** Relayer responds with a `TaskId`, executes transaction, and fires webhooks.
- **Time:** 2 hours

---
### 🏁 Integration Checkpoint & Commit Boundary 3
- **Status:** Complete Phase 3 and Phase 4 and commit as `feat: smart-account-delegation-and-relayer`.
- **Test Checkpoint:** Initiate a test bounty release. Verify that:
  1. The user's EOA is upgraded to EIP-7702 Stateless Delegator.
  2. The delegation is successfully scoped to `targetAddress`.
  3. The transaction executes gaslessly, and gas fees are paid in USDC from the escrow.

---

# 🧠 PHASE 5 — Venice AI Multi-Agent Pipeline (Day 6)

### [P0] T501 — Venice AI Client Setup
- **What:** Integrate Venice AI SDK using the `venice-code-large` and `llama-3` models. Setup prompt templates that review PR diffs against GitHub issues.
- **Files:** `lib/venice/client.ts`
- **Acceptance:** Returns structured JSON containing `{ score, issues, summary, spam, aiSlop }`.
- **Time:** 2 hours

### [P0] T502 — CI Waiter & Approver Agents
- **What:** Build agents that monitor CI checks status and a rules-engine Approver checking AI score thresholds (e.g. >=80) and contest periods.
- **Files:** `lib/agents/ci-waiter.ts`, `lib/agents/approver.ts`
- **Acceptance:** Evaluates rules correctly, determining if a PR is releasable.
- **Time:** 2 hours

### [P0] T503 — Multi-Agent Orchestrator
- **What:** Create a queue-driven orchestrator (BullMQ) that triggers on PR merges, runs the review process, outputs audit logs, and initiates 1Shot releases.
- **Files:** `lib/agents/orchestrator.ts`
- **Acceptance:** Merged PR starts job, reviews code, and triggers release if parameters are met.
- **Time:** 4 hours

---
### 🏁 Integration Checkpoint & Commit Boundary 4
- **Status:** Complete Phase 5 and commit as `feat: venice-ai-multi-agent-orchestrator`.
- **Test Checkpoint:** Trigger a mock PR merge. Verify that:
  1. Venice reviews the diff and responds with structured data.
  2. The orchestrator receives the score, determines validity, and initiates the on-chain payout.

---

# 💸 PHASE 6 — x402 Payment Protocol (Day 7)
*Skill: x402*

### [P0] T601 — Seller-Side Protection (Facilitator integration)
- **What:** Create a middleware that intercepts calls to `/api/bounties` (post bounty). If no proof of a 0.10 USDC fee exists in headers, returns HTTP `402 Payment Required` with details.
- **Files:** `lib/x402/middleware.ts`, `app/api/bounties/route.ts`
- **Acceptance:** Blocks calls without payment proof; returns 402 with correct headers.
- **Time:** 2.5 hours

### [P0] T602 — Buyer-Side Client Auto-Payment
- **What:** Write a wrapper for fetching paid endpoints. If a 402 is returned, it executes the payment transaction (0.10 USDC via 1Shot) and retries with the tx hash.
- **Files:** `lib/x402/client.ts`
- **Acceptance:** Auto-detects 402, executes payment transaction, and retries request.
- **Time:** 2.5 hours

---
### 🏁 Integration Checkpoint & Commit Boundary 5
- **Status:** Complete Phase 6 and commit as `feat: x402-payment-protocol`.
- **Test Checkpoint:** Call the `POST /api/bounties` endpoint. Verify that it prompts a 402, executes the payment gaslessly via the 1Shot relayer, and then succeeds.

---

# 🎨 PHASE 7 — Dashboards & GitHub Webhooks (Days 8-10)

### [P0] T701 — GitHub OAuth & App Handlers
- **What:** Implement NextAuth GitHub logins, repository listings, issue listings, and webhook routes.
- **Files:** `app/api/auth/[...nextauth]/route.ts`, `app/api/webhooks/github/route.ts`
- **Acceptance:** OAuth succeeds; Github App parses `pull_request.closed` (merged) events.
- **Time:** 4 hours

### [P0] T702 — High-Aesthetic Marketing Landing Page
- **What:** Build page using Google fonts (Outfit, Inter), vibrant dark colors, glassmorphism UI, smooth scroll, and Framer Motion.
- **Files:** `app/(marketing)/page.tsx`
- **Acceptance:** Visual excellence, mobile responsive, and fully optimized SEO tags.
- **Time:** 4 hours

### [P0] T703 — Maintainer & Contributor Dashboards
- **What:** Build dashboard interface showing open bounties, active agent streams, and status logs.
- **Files:** `app/(app)/dashboard/page.tsx`, `app/(app)/contributor/page.tsx`
- **Acceptance:** Displays current status of escrows, reputation points, and earnings.
- **Time:** 5 hours

### [P0] T704 — Bounty Creator Wizard
- **What:** Multi-step wizard allowing maintainers to select repo/issue, configure rules, and deploy smart account escrows.
- **Files:** `app/(app)/dashboard/bounties/new/page.tsx`
- **Acceptance:** Validates each step, prompting Smart Account permission setup at the end.
- **Time:** 5 hours

---

# 🧪 PHASE 8 — Testing, QA, and Auditing (Day 11)

### [P0] T801 — Vitest Unit Tests
- **What:** Write unit tests for client-side crypto, 1Shot clients, and Venice AI prompt parsers.
- **Acceptance:** `npm run test` passes with >75% coverage.
- **Time:** 3 hours

### [P0] T802 — Playwright E2E Flow Checks
- **What:** E2E tests for WebAuthn registration, bounty funding, and agent release flows.
- **Acceptance:** Playwright checks run successfully.
- **Time:** 4 hours

---

# 🚀 PHASE 9 — Deployments & Marketing Launch (Day 12)

### [P0] T901 — Production Deployment
- **What:** Deploy frontend to Vercel, setup SSL, and register webhooks on GitHub and 1Shot.
- **Acceptance:** Main site is live and securely receives callbacks.
- **Time:** 2 hours

### [P0] T902 — Demo & Submission Prep
- **What:** Record 3-minute demo script showing EIP-7702 upgrade, gasless USDC payment, Venice review, and final release.
- **Acceptance:** Video submitted to Devpost tracks.
- **Time:** 3 hours
