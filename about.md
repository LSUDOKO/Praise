# PRaise — Complete Product Specification

> **Open source bounties that pay themselves.**
> GitHub bounties, settled by AI agents, released by Smart Accounts, gasless in stablecoins.

---

## 1. The Pitch

**PRaise** is an autonomous bounty platform for open source software. A maintainer funds a Smart Account with USDC, attaches a bounty to a GitHub issue, and an AI agent watches the repository. The moment a pull request closes the issue and passes multi-agent verification, the Smart Account automatically releases payment to the contributor — gasless, non-custodial, with no platform taking a cut.

The funds live in smart contract code the entire time, not in someone's database. There is no one to trust except the code.

---

## 2. Why This Wins the Market

The current open source bounty industry is broken on every dimension:

- **Gitcoin** and **Bountysource** take 5–15% of every payout
- **Polar** and **OnlyDust** are invite-only and biased toward Web3 repositories
- **Every existing competitor is custodial** — your money sits in their hot wallet
- **None of them are smart-account native** — they cannot enforce rules onchain
- **None of them are agentic** — humans still manually release every payment
- **None of them are gasless** — contributors must hold ETH before they can receive USDC
- **None of them verify work with AI** — maintainers waste hours triaging low-quality pull requests

**PRaise is the first non-custodial, agentic, AI-verified, gasless bounty platform.** The maintainer sets the rules once, the agent handles the rest, and the Smart Account enforces the rules mathematically.

---

## 3. User Personas

| Persona | Goal | Pain Today |
|---------|------|------------|
| **Maya — OSS maintainer** | Get her issue fixed, fairly compensated | Spent 6 hours triaging low-quality PRs for a $200 bounty; previous platform took 10% and the contributor never got paid on time |
| **Dev — Contributor** | Get paid for OSS work and build reputation | Got ghosted after merging; payment was "pending" for 3 weeks; needed ETH for gas; had to sign up for a custodial platform |
| **Acme Corp — Sponsor** | Fund OSS they depend on, get tax-deductible receipts | Cannot match community bounties automatically; no analytics; manual tracking via spreadsheets |

---

## 4. Core User Flows

### Flow A — Maintainer Posts a Bounty (90 seconds)

1. Install the PRaise GitHub App on a repository
2. Connect wallet — Smart Account is auto-created (or use an existing one)
3. Pick an issue from a dropdown populated by the GitHub API
4. Set the bounty terms in a guided form:
   - **Amount:** `100 USDC`
   - **Auto-release conditions:** `on merge, after 1 approval, AI confidence ≥ 80%`
   - **Contest period:** `7 days` (no PRs accepted in the first 7 days — anti-spam)
   - **Anti-grief rule:** `if 3 low-quality PRs from same author, lock the bounty`
5. Fund the escrow — USDC is transferred to the Bounty Smart Account
6. The PRaise bot comments on the issue:
   > 🏆 **Bounty #42 — 100 USDC** — Submit a PR that closes this issue. Auto-pays on merge.

### Flow B — Contributor Submits Work

1. The contributor sees the bounty in the GitHub comment and on the PRaise public board
2. They fork the repo, write code, open a PR
3. The PR description is auto-detected by the GitHub App
4. The bot comments on the PR:
   > 🎯 Linked to bounty #42. Status: in review. AI confidence: 78%.

### Flow C — Auto-Release on Merge (The Magic Moment)

1. The PR is merged by the maintainer
2. The PRaise agent kicks off the verification pipeline:
   - **Verifier Agent (Venice AI)** performs a code review and scores the PR against the issue
   - **CI Agent** waits for all green checks
   - **Approver Agent** checks if all release conditions are met (contest period elapsed, confidence threshold, scope match)
3. If green: the Smart Account releases USDC to the contributor's wallet
4. **1Shot Permissionless Relayer** executes the transaction — gas is paid in USDC, the contributor needs 0 ETH
5. Both parties are notified, the dashboard updates, reputation points are awarded

### Flow D — Dispute / Edge Case

- If the AI misjudges, either maintainer or contributor can pause and raise a dispute
- The dispute goes to **onchain arbitration** (Kleros-style or maintainer-selected judge)
- If the contributor is at fault, the bounty rolls to the next qualifying PR or refunds to the maintainer
- If the AI is at fault, the agent's reputation is slashed and the contributor is paid

---

## 5. MetaMask Smart Accounts Kit — Deep Integration

The Smart Accounts Kit is the **core of the trust model** of PRaise.

### 5.1 Components Used

| Component | Role in PRaise |
|-----------|----------------|
| **MetaMask Smart Accounts** (kernel-based, EIP-7702 compatible) | Each bounty is held in a Smart Account; each user has a Smart Account; the agent has a Smart Account |
| **EIP-7702 (Smart Account Upgrade)** | First-time users with plain EOAs get upgraded to Smart Accounts in one click on signup — no seed phrase migration |
| **Advanced Permissions (ERC-7715)** | The maintainer grants the agent time-bounded, scope-bounded, amount-bounded authority over their bounty |
| **Delegation Framework (ERC-7710)** | The agent uses 7710 to actually execute the release transaction on behalf of the maintainer |
| **Gator SDK / Permission Utils** | Handles the request, grant, and revoke lifecycle of permissions |
| **Session Keys** | Maintainer can create a session key for the bot to use, expiring in 90 days |

### 5.2 The Actual Permission Grants

When a maintainer funds a bounty, they grant this permission via Advanced Permissions (ERC-7715):

```
Permission: "Release up to 100 USDC from Bounty #42 to address X,
             IF and ONLY IF:
               - PR #Y is merged on repo Z
               - Contest period (7 days) has elapsed
               - Venice AI review score ≥ 80
               - Maintainer has not paused"
Scope:     Bounty #42 only
Time:      Expires in 90 days
```

The agent **cannot**:
- Touch any other USDC
- Change the recipient address (it is bound to the verified contributor's address)
- Exceed the bounty amount
- Release before the contest period
- Act after the permission expires

This is the killer use case for Advanced Permissions: you can give an AI agent real authority, but with mathematically enforceable limits.

### 5.3 Smart Contract Architecture

```
BountyFactory.sol
   ├── creates → Bounty.sol (one per bounty, holds USDC)
   ├── creates → AgentDelegation.sol (one per agent, holds delegated authority)
   └── reads  → BountyRegistry.sol (lookup bounties by repo/issue/PR)

Bounty.sol
   ├── deposit(usdcAmount)             // maintainer funds
   ├── release(to, amount)             // called only by AgentDelegation
   ├── reclaim()                        // maintainer reclaims unclaimed
   ├── pause() / unpause()              // maintainer pauses
   └── isReleasable() → (bool, reason)  // conditions check

AgentDelegation.sol
   ├── executeRelease(bountyId, to)    // called by relayer, validates permission
   ├── attest(prMerged, aiScore)       // called by oracle + Venice
   └── revoke()                         // maintainer revokes

GitHubOracle.sol
   └── accepts signed attestations from the offchain PRaise agent
```

### 5.4 The User Experience in MetaMask

The maintainer sees this in their wallet when granting permission:

> 🛡️ **PRaise Permission Request**
>
> PRaise is requesting permission to release up to **100 USDC** from **Bounty #42** to a verified contributor.
>
> ✅ Can: release funds when PR is merged and AI score is high
> ❌ Cannot: touch other USDC
> ❌ Cannot: send to a different address
> ❌ Cannot: act after 90 days
>
> [Reject] [Approve]

The contributor sees a similar prompt when granting **read-only** permission for the agent to verify their GitHub identity.

---

## 6. 1Shot Permissionless Relayer — Deep Integration

The 1Shot Relayer is **the reason PRaise is gasless for everyone**.

### 6.1 What 1Shot Does Here

- **Relays all EIP-7710 transactions** from the agent Smart Account
- **Pays gas in USDC, USDT, USDG, or MUSD** — no ETH required
- **Webhooks** drive frontend status updates ("bounty released", "tx confirmed")
- **Public relayer** means no signup, no business dev calls, no pre-funding
- **7702 authorizations** upgrade accounts to Smart Accounts through the 1Shot relayer

### 6.2 The 1Shot Moment in the Demo

The contributor is a first-time Web3 user. They only have USDC. When the agent releases payment:

- **Traditional flow:** contributor needs ETH for gas → either loses $5 to a swap or abandons the payout entirely
- **PRaise flow:** 1Shot relays the release transaction → gas is paid in USDC from the released amount → contributor receives net 99.4 USDC, no ETH needed, no friction

This is the **single most important UX moment** in the product.

### 6.3 Bonus: Webhook-Driven Status

1Shot transaction webhooks power:

- "Payment sent" toast notifications
- Dashboard updates without polling
- "Gas paid in 1.2 USDC" transparency line on every release
- Push notifications to both maintainer and contributor
- Real-time status on the public bounty board

### 6.4 EIP-7702 Account Upgrade via 1Shot

When a new user connects to PRaise, the agent needs them to have a Smart Account. The 7702 upgrade transaction is itself relayed through 1Shot — the user pays for the upgrade in USDC. **They never have to think about gas, ever.**

---

## 7. Venice AI — Deep Integration

Venice is used in **three different roles** — text reasoning, code review, and image analysis.

### 7.1 Use Case 1 — PR Code Review

```
Prompt to Venice (code-llama or similar):
  "Review this PR diff for:
   - Correctness vs the linked issue
   - Code quality (naming, structure, tests)
   - Security issues (XSS, reentrancy, OWASP top 10)
   - Spam indicators (AI-generated slop, copy-paste, off-topic)
   Return: { score: 0-100, issues: [...], summary: '...' }"
```

### 7.2 Use Case 2 — Spam and Sybil Detection

A multi-agent check:

- **Pattern Agent** — does the contributor's commit history show real work or burst accounts?
- **Similarity Agent** — is this PR a duplicate or near-duplicate of a prior one?
- **Identity Agent** — is the GitHub account of reasonable age? Verified email? Linked Smart Account has transaction history?

### 7.3 Use Case 3 — Maintainer-Facing Summaries

Venice generates plain-English weekly digests:

> "3 PRs submitted to your bountied issues this week. 2 are high quality, 1 is spam (auto-flagged). Estimated release queue: 250 USDC. Maintainer action needed on 0."

### 7.4 Use Case 4 — Plain-English Disputes

When a dispute is raised, Venice explains to both parties in plain language what the AI saw, why it scored the PR the way it did, and what the likely correct outcome is.

### 7.5 Why Venice and Not OpenAI

The privacy angle is a **product feature** for OSS maintainers who are paranoid about their private repos and contributor lists. We pitch this hard:

> "Your repo strategy stays private — only the AI sees the diff, and Venice does not train on it."

This is also regulatory: code under NDA, security-sensitive diffs, and pre-release features can be analyzed by Venice without leaking to a hyperscaler.

---

## 8. x402 — Deep Integration

x402 is the HTTP 402 "Payment Required" protocol. It is used in **three places** in PRaise.

### 8.1 Place 1 — Bounty Payment Itself

The release transaction can be modeled as an x402 flow: the contributor's wallet endpoint returns `402 Payment Required`, the maintainer's agent pays via x402, the contributor receives a signed receipt.

### 8.2 Place 2 — Pay-Per-Call AI Services

When the Verifier Agent calls a third-party service — a static analyzer, a security scanner, or even premium Venice endpoints — it pays via x402. **No API keys, no monthly subscription, pay per scan.** This is the literal use case of x402.

### 8.3 Place 3 — x402 Endpoint for Other AI Agents

Other AI agents (e.g., a security scanner that finds a bug) can `POST /bounties` to PRaise with a 402 payment attached — fully autonomous, no human in the loop. This is the killer **A2A (Agent-to-Agent)** angle. A security agent finds a bug, posts a bounty to PRaise via x402, and the Smart Account handles the rest.

---

## 9. Full System Architecture

```
┌─────────────────┐
│  GitHub Webhook │ → triggers on PR/issue events
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│         PRaise Agent Service                │
│  ┌──────────────┐  ┌──────────────────┐    │
│  │ PR Watcher   │→ │ Venice Code      │    │
│  │              │  │ Reviewer         │    │
│  └──────────────┘  └──────────────────┘    │
│  ┌──────────────┐  ┌──────────────────┐    │
│  │ CI Waiter    │→ │ Sybil Detector   │    │
│  └──────────────┘  └──────────────────┘    │
│  ┌──────────────┐  ┌──────────────────┐    │
│  │ Approver     │→ │ Notification     │    │
│  │ (rule engine)│  │ Service          │    │
│  └──────────────┘  └──────────────────┘    │
└────────┬────────────────────────────────────┘
         │ (when conditions met)
         ▼
┌─────────────────────────────────────────────┐
│   Smart Account Release (ERC-7710 call)     │
│   Bounty.sol → release(contributor, amt)    │
└────────┬────────────────────────────────────┘
         │ (relayed)
         ▼
┌─────────────────────────────────────────────┐
│      1Shot Permissionless Relayer           │
│      Gas paid in USDC, webhooks back        │
└────────┬────────────────────────────────────┘
         │
         ▼
    Contributor gets USDC ✅
```

---

## 10. Market-Ready Features (Tiered Roadmap)

### Tier 1 — Ship with MVP (1 weekend)

- Bounty creation, funding, auto-release
- Multi-agent verification (Venice + CI + Approver)
- Gasless via 1Shot
- ERC-7715 advanced permissions
- GitHub App (one-click install)
- Web dashboard for maintainers and contributors
- Email + GitHub comment notifications
- Public bounty board at `/explore`
- Onchain reputation per contributor

### Tier 2 — Polish (1 week)

- **Public bounty board** — page showing all open bounties across GitHub
- **Contributor profiles** — onchain reputation, payout history, specialties
- **Org-level pools** — "MetaMask OSS Fund" with monthly budget across all repos
- **Slack/Discord notifications** — webhook integrations
- **Bounty templates** — bug, feature, doc, test, security
- **Mobile-responsive PWA** — works on phone for contributors
- **Bounty matching** — corporate sponsors match community funds at 2:1
- **Anti-grief controls** — maintainer can lock, pause, or refund with one click
- **Audit trail** — every decision stored onchain for transparency

### Tier 3 — Growth Features (1 month)

- **Multi-token bounties** — USDC, USDT, DAI, native ETH
- **Recurring bounties** — "$500/month for whoever maintains `lib/x.ts`"
- **Time-weighted bounties** — bounty grows if no solution in 30 days
- **Auto-split bounties** — multiple contributors share fairly
- **Bounty expiration** — reclaim unclaimed funds
- **Skill verification** — onchain badges ("shipped 10 Rust PRs")
- **Public leaderboard** — gamification for top contributors
- **x402 endpoint** — agents can post bounties autonomously
- **Tax reports** — generate 1099-MISC for US contributors
- **Insurance pool** — slashable agent stakes, slash insurance for contributors
- **GitLab and Bitbucket support**
- **API for third parties** — let GitHub clones integrate
- **Webhook integrations** — CI/CD, Slack, Discord, Telegram, email
- **Multi-sig bounties** — multiple sponsors pool a bounty
- **Bounty expiration with grace period** — fair to contributors

### Tier 4 — Enterprise and Moat Features (3 months)

- **Cross-chain** — Base, Optimism, Arbitrum, Polygon, Linea
- **Compliance mode** — KYC for bounties above $10,000
- **Custom AI agents** — bring your own reviewer, plug in via API
- **DAO governance** — protocol owned by the PRaise DAO
- **White-label** — sell to foundations, Layer 1s, protocols
- **Bug bounty integration** — Immunefi, HackerOne import
- **Translation bounties** — DeepL / Google Translate API integration
- **Test coverage bounties** — pay per % coverage increase
- **Documentation bounties** — pay for doc improvements
- **Auto-triage** — AI triages incoming issues, suggests bounty amounts
- **Bounty recommendations** — "this issue is similar to past $500 bounties, suggest $400"
- **Skill-based routing** — auto-assign bounties to contributors with matching badges

---

## 11. Business Model

**Core insight:** the Smart Account is non-custodial, so PRaise cannot take a cut of the bounty itself. So we charge for **value-add services** that the Smart Account cannot provide alone.

| Revenue Stream | Pricing |
|----------------|---------|
| **Free tier** | 3 active bounties, $500/mo total cap, 2% fee on bounty release |
| **Pro tier (maintainer)** | $49/mo — unlimited bounties, 0% fee, priority AI review |
| **Org tier** | $499/mo — multi-repo, team permissions, analytics, SLA |
| **Agent API** | $0.10/release for third-party agents using PRaise infrastructure |
| **Premium AI reviewers** | $0.50/PR for human-in-the-loop review fallback |
| **x402 facilitator fees** | 0.1% on payments routed through our endpoint |
| **Bounty matching** | 5% on corporate matching fund transactions |
| **Bounty templates marketplace** | $99 one-time for premium templates (security, audits, etc.) |
| **Insurance premium** | 0.5% of insured bounty for slash insurance |

**Target customers:**

- OSS foundations (Rust, Python, Linux Foundation)
- Layer 1 and Layer 2 protocols funding their SDKs
- Web3 companies funding their dependencies
- AI companies funding their training infrastructure
- Security firms running bug bounty programs

**Market size:** Open Collective processed $40M+ in OSS funding in 2023. Gitcoin Grants has done $50M+. PRaise targets the **bounty specifically** (currently $5–10M/year and growing) and the **per-PR micro-payment** market that is currently not served at all.

---

## 12. Competitive Positioning

| Feature | PRaise | Gitcoin | Bountysource | OnlyDust | Polar |
|---------|--------|---------|--------------|----------|-------|
| **Non-custodial** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Agentic** | ✅ | ❌ | ❌ | Partial | ❌ |
| **Gasless for contributors** | ✅ (1Shot) | ❌ | ❌ | ❌ | ❌ |
| **AI-verified** | ✅ (Venice) | ❌ | ❌ | ❌ | ❌ |
| **Smart Account native** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Bounded permissions** | ✅ (ERC-7715) | ❌ | ❌ | ❌ | ❌ |
| **Public, open source** | ✅ | Partial | ❌ | ❌ | ❌ |
| **Multi-chain** | ✅ (planned) | ✅ | ❌ | ❌ | Partial |
| **x402 endpoint** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Privacy-first AI** | ✅ (Venice) | ❌ | ❌ | ❌ | ❌ |

We win on **trust + UX + automation**. The non-custodial + gasless combination is the moat.

---

## 13. User Personas and Jobs-to-be-Done

### Persona 1 — Maya (OSS Maintainer)

- **Job:** Get her issue fixed, fairly compensated
- **Pains:** Triage fatigue, low-quality PRs, no compensation, slow payouts
- **Gains:** Auto-verified PRs, instant payout, no platform cut
- **Willingness to pay:** $49/mo for Pro tier

### Persona 2 — Dev (Contributor)

- **Job:** Get paid for OSS work, build reputation
- **Pains:** Ghosted after merging, payment "pending" for weeks, needs ETH for gas
- **Gains:** Instant USDC payout, onchain reputation, no ETH needed
- **Willingness to pay:** $0 (free tier is enough, but reputation drives earnings)

### Persona 3 — Acme Corp (Sponsor)

- **Job:** Fund OSS they depend on, get tax-deductible receipts
- **Pains:** Cannot match community bounties, no analytics, manual tracking
- **Gains:** 2:1 matching, onchain reporting, audit trail
- **Willingness to pay:** $499/mo for Org tier

### Persona 4 — AI Agent (A2A)

- **Job:** Post bounties autonomously for issues it finds
- **Pains:** Most platforms require human signup
- **Gains:** x402 endpoint, agent-native, no human in loop
- **Willingness to pay:** $0.10/release for API access

---

## 14. The 3-Minute Demo Script (Hackathon Version)

> **[0:00] Hook:** "1.4 million open issues sit on GitHub right now. Maintainers do not have time to triage. Contributors do not trust the payout. We built PRaise to make bounties pay themselves."

> **[0:30] Setup:** Show the GitHub issue with the PRaise bot comment: "🏆 100 USDC bounty". Show the maintainer dashboard with the funded Smart Account.

> **[1:00] The Action:** Open a PR from a fake contributor account. Watch the bot comment: "🎯 Linked to bounty #42. AI confidence 82%."

> **[1:30] The Merge:** Merge the PR. Cut to the PRaise agent pipeline: "Venice review passed (89/100). CI green. Contest period elapsed. Conditions met. Releasing…"

> **[2:00] The Money Moment:** Show the **onchain transaction** — `Bounty.sol → release() → contributor address`. Highlight: "Gas: 0.0001 ETH equivalent in USDC. 1Shot relayed it. Contributor netted 99.4 USDC. Zero ETH required."

> **[2:30] Close:** "PRaise. Non-custodial. AI-verified. Gasless. The bounty board that trusts the code, not the platform."

---

## 15. Hackathon Prize Breakdown

| Track | How We Hit It | Prize |
|-------|---------------|-------|
| **Best x402 + ERC-7710** | Core flow uses both — 7710 delegation for release, x402 for AI service payment | $3,000 |
| **Best Agent** | Multi-agent verification pipeline, agent is the protagonist | $3,000 |
| **Best A2A coordination** | The x402 endpoint lets OTHER agents post bounties autonomously | $3,000 |
| **Best use of Venice AI** | Code review, spam detection, summaries — three Venice calls per bounty | $3,000 |
| **Best Use of 1Shot Relayer** | Every release goes through 1Shot, gas in USDC | $1,000 |
| **Best Social Media Presence** | "Watch an AI agent pay a developer for an OSS PR" — that is the tweet | $100 |
| **Best Feedback** | Post detailed feedback about the hackathon experience | $100 |

**Conservative:** $7,000. **Stretch:** $13,000+.

---

## 16. Why This Could Be a Real Company

1. **Strong wedge:** "bounties that pay themselves" is a story that markets itself
2. **Massive market:** every OSS project is a potential customer; every contributor is a potential user
3. **Multiple monetization paths:** subscription + fees + B2B + data + API
4. **Strong moat:** the more agents query PRaise, the better its classifications get (network effect)
5. **OSS-native brand:** aligns with the future of work, ownership, and money
6. **Composability:** x402 endpoint makes it a primitive other apps build on
7. **Defensible by architecture:** non-custodial + permissioned + gasless is hard to replicate

---

## 17. Technical Stack Summary

| Layer | Technology |
|-------|------------|
| **Smart Accounts** | MetaMask Smart Accounts Kit (kernel, EIP-7702, ERC-7715, ERC-7710, Gator SDK) |
| **Relayer** | 1Shot Permissionless Relayer (gas in USDC/USDT/USDG/MUSD) |
| **AI** | Venice AI (text, image, code, audio) |
| **Payment Protocol** | x402 (HTTP 402) |
| **Stablecoin** | USDC primary, USDT/USDG/MUSD optional |
| **Chains** | Linea, Base, Optimism, Arbitrum, Polygon |
| **Storage** | IPFS for PR diffs and form artifacts |
| **Oracle** | GitHub webhooks + signed attestations onchain |
| **Frontend** | Next.js, RainbowKit, Wagmi, Viem |
| **Backend** | Node.js or Bun, PostgreSQL, Redis, BullMQ |
| **Indexer** | The Graph or Ponder |
| **Notifications** | Knock or Novu |
| **Auth** | GitHub OAuth + Sign-In with Ethereum (SIWE) |

---

## 18. Security and Compliance Considerations

- **Non-custodial by design:** funds never leave the Smart Account
- **Permission scope enforced by code:** agent can only do what the permission allows
- **Time-bounded:** every permission expires
- **Revocable:** maintainer can revoke at any time
- **Audit trail:** every decision and attestation stored onchain
- **Dispute resolution:** Kleros-style arbitration for edge cases
- **Slashing:** agent reputation is slashable for bad calls
- **Insurance:** optional slash insurance for contributors
- **KYC for high-value bounties:** >$10k requires identity verification
- **Sanctions screening:** OFAC check on every payout
- **Privacy:** Venice AI is privacy-first, no training on user data

---

## 19. Glossary

| Term | Definition |
|------|------------|
| **Smart Account** | A contract wallet that can enforce rules, delegate authority, and pay gas in tokens other than ETH |
| **EIP-7702** | An Ethereum standard that lets EOAs temporarily execute smart contract code |
| **ERC-7715** | Advanced Permissions — a standard for dApps to request fine-grained permissions from users |
| **ERC-7710** | Delegated execution — a standard for delegated authority to perform actions on behalf of a user |
| **x402** | HTTP 402 "Payment Required" — a protocol for machine-to-machine payments |
| **1Shot Relayer** | A permissionless relayer that pays gas in stablecoins |
| **Venice AI** | A privacy-first AI platform with 200+ models |
| **Bounty** | A reward for completing a specific task (e.g., fixing a bug) |
| **Maintainer** | The person who owns the repo and posts the bounty |
| **Contributor** | The person who completes the work and receives the bounty |
| **Agent** | An AI process that performs verification or executes transactions |
| **Session Key** | A time-bounded key that allows limited operations |

---

## 20. Next Steps

1. **Choose a chain** — recommendation: Linea or Base (cheapest gas, best MetaMask support)
2. **Get API keys** — Venice AI, Covalent, 1Shot, GitHub App
3. **Build the MVP** — bounty creation, GitHub App, multi-agent verification, auto-release
4. **Record a 3-minute demo** — following the script above
5. **Post on X** — tag `@MetaMaskDev`, show the agent paying a developer
6. **Submit to all relevant tracks** — x402+7710, Best Agent, A2A, Venice, 1Shot

---

## 21. Appendix — Full Code Examples

### 21.1 Smart Contract — Bounty.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Bounty is Ownable {
    IERC20 public immutable usdc;
    address public agent;
    uint256 public amount;
    bool public paused;
    uint256 public contestPeriodEnd;
    uint256 public createdAt;

    event Deposited(address indexed from, uint256 amount);
    event Released(address indexed to, uint256 amount);
    event Reclaimed(address indexed to, uint256 amount);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    constructor(
        address _usdc,
        address _agent,
        uint256 _contestPeriod
    ) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        agent = _agent;
        contestPeriodEnd = block.timestamp + _contestPeriod;
        createdAt = block.timestamp;
    }

    function deposit(uint256 _amount) external onlyOwner {
        usdc.transferFrom(msg.sender, address(this), _amount);
        amount += _amount;
        emit Deposited(msg.sender, _amount);
    }

    function release(address to, uint256 releaseAmount) external {
        require(msg.sender == agent, "only agent");
        require(!paused, "paused");
        require(block.timestamp >= contestPeriodEnd, "contest period");
        require(releaseAmount <= amount, "insufficient");

        amount -= releaseAmount;
        usdc.transfer(to, releaseAmount);
        emit Released(to, releaseAmount);
    }

    function reclaim() external onlyOwner {
        require(block.timestamp > contestPeriodEnd + 365 days, "too early");
        uint256 bal = amount;
        amount = 0;
        usdc.transfer(owner(), bal);
        emit Reclaimed(owner(), bal);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function isReleasable() external view returns (bool, string memory) {
        if (paused) return (false, "paused");
        if (block.timestamp < contestPeriodEnd) return (false, "contest period");
        if (amount == 0) return (false, "no funds");
        return (true, "ok");
    }
}
```

### 21.2 Advanced Permission Grant (ERC-7715)

```typescript
import { createPermission, PermissionType } from "@metamask/smart-accounts-kit";

const permission = createPermission({
  type: PermissionType.NativeTokenStreamAmount,
  data: {
    justification: "PRaise Bounty #42 release on PR merge",
    account: bountySmartAccount.address,
    signer: agentSmartAccount.address,
    amount: parseUnits("100", 6), // 100 USDC
    token: USDC_ADDRESS,
    startTime: Math.floor(Date.now() / 1000),
    endTime: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days
  },
  rules: [
    {
      condition: "pr_merged",
      value: true,
    },
    {
      condition: "contest_period_elapsed",
      value: true,
    },
    {
      condition: "ai_confidence_gte",
      value: 80,
    },
    {
      condition: "maintainer_not_paused",
      value: true,
    },
  ],
});

const grant = await walletClient.requestExecutionPermissions([permission]);
```

### 21.3 1Shot Relayer Call

```typescript
import { OneShotRelayer } from "@1shot/api";

const relayer = new OneShotRelayer({
  apiKey: process.env.ONESHOT_API_KEY,
});

const result = await relayer.relayExecution({
  chainId: 59144, // Linea
  authorization: erc7702Auth, // EIP-7702 authorization
  execution: {
    target: bountyAddress,
    value: 0n,
    callData: bountyContract.interface.encodeFunctionData("release", [
      contributorAddress,
      parseUnits("100", 6),
    ]),
  },
  gasToken: USDC_ADDRESS, // pay gas in USDC
  webhookUrl: "https://api.praise.xyz/webhooks/1shot",
});

console.log("Bounty released:", result.txHash);
```

### 21.4 Venice Code Review Prompt

```typescript
import { Venice } from "@venice/api";

const venice = new Venice({ apiKey: process.env.VENICE_API_KEY });

const review = await venice.code.createCompletion({
  model: "venice-code-large",
  messages: [
    {
      role: "system",
      content: "You are a senior code reviewer. Be terse, accurate, and skeptical.",
    },
    {
      role: "user",
      content: `
Review this PR diff for the linked issue.

Issue: ${issue.title}
${issue.body}

PR Diff:
${diff}

Return JSON: { "score": 0-100, "issues": [...], "summary": "...", "spam": bool, "aiSlop": bool }
      `,
    },
  ],
  response_format: { type: "json_object" },
});
```

### 21.5 x402 Endpoint for AI Agents

```typescript
// POST /bounties — paid via x402
app.post("/bounties", x402Middleware(0.10), async (req, res) => {
  const { repo, issueNumber, amount, agentIdentity } = req.body;

  // Verify x402 payment
  const payment = req.headers["x-402-payment"];
  if (!payment) return res.status(402).json({ error: "Payment required" });

  // Create bounty
  const bounty = await bountyFactory.create(
    repo,
    issueNumber,
    amount,
    agentIdentity,
  );

  return res.json({ bountyId: bounty.id, txHash: bounty.txHash });
});
```

---

## 22. Final Note

PRaise is more than a hackathon project. It is a **protocol primitive** for autonomous work-and-pay. The same architecture can power:

- Research bounties (write a paper, get paid)
- Design bounties (design a logo, get paid)
- Translation bounties (translate a doc, get paid)
- Audit bounties (audit a smart contract, get paid)
- Data bounties (label a dataset, get paid)
- Bug bounties (find a vuln, get paid)

The maintainer, the contributor, and the AI agent all become first-class participants in a non-custodial work marketplace. **PRaise is the bounty board that trusts the code, not the platform.**

---

*Built for the MetaMask Smart Accounts Kit × 1Shot API Hackathon, 2026.*
