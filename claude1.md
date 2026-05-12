# Dead Man's Switch — Full Architecture

An autonomous on-chain executor built on Solana. Users define conditional instructions
and a smart contract + AI agent ensures those instructions execute exactly as written —
no middleman, no manual trigger, no one in the loop.

---

## Hackathon Target

**Superteam Malaysia × Colosseum Frontier Hackathon**

| | |
|---|---|
| Main track | Open-ended — Consumer App + AI + Payments |
| Primary bonus | **KIRAPAY Payments Track** — practical payments, real-world adoption |
| Secondary bonus | **SNS Identity Track** — add `.sol` name resolution for beneficiary input (small lift, ticks the track) |
| Skip | MagicBlock Privacy — no privacy features in scope |

**Why this project wins the KIRAPAY track:**
The entire product is about sending money to family automatically. "$2 weekly to my kid's wallet",
"Send SOL to my daughter if I'm gone 90 days" — that is real-world payment adoption. The Telegram
bot makes it accessible to people who have never touched crypto. The beneficiary only needs an email
address to receive funds. That is payments with real-world reach.

**Judging criteria mapped to the project:**

| Criterion | How We Hit It |
|---|---|
| Product Quality + User Value | Solves inheritance / asset safety — universally understood problem |
| Technical Execution | Anchor program + Helius WS + Pyth + x402 + Claude + Telegram — full stack |
| Use of Solana | Helius WS heartbeat detection only works on Solana. PDAs, cNFTs, sub-cent fees make $2 transfers viable |
| Founder Potential | Shipping fast, extending with bot, clear roadmap beyond hackathon |
| Demo Quality | Live execution on devnet, SOL moving on Explorer, email claim, cNFT on-chain |

> Submit on both Colosseum portal AND Superteam Earn. Select "Malaysia" on Colosseum.
> Also submit directly to the KIRAPAY partner track link to be considered for the bonus.

---

## What Is This

A trustless "will + trading bot + safety net" on Solana. The owner locks SOL into a PDA
vault and defines a condition — usually an inactivity timeout. An AI agent watches the
owner's wallet via Helius websockets. Any on-chain activity (swap, transfer, stake) resets
the timer automatically. If the owner goes silent past the deadline, the agent executes
the switch and funds move to the beneficiary.

The new Telegram AI bot layer adds a full conversational onboarding flow: owners set up
their switch by chatting with the bot, and beneficiaries claim their inheritance through
the same bot — no crypto knowledge required to receive funds.

### Core Use Cases

| Use Case | How It Works | Track Fit |
|---|---|---|
| Inheritance | Transfer SOL to family if inactive 90 days | KIRAPAY |
| Recurring Payments | Agent calls execute on a schedule — "$2 weekly to my kid's wallet" | KIRAPAY |
| Travel Safety | Pause DeFi positions if no check-in | Consumer |
| Automated Trading | Sell on portfolio drop — price trigger via Pyth | DeFi |
| DAO Donation | Donate to a DAO wallet on inactivity | Consumer |

---

## Tech Stack

| Layer | Tech | Status |
|---|---|---|
| Smart Contract | Rust + Anchor Framework | Live on devnet |
| Chain | Solana Devnet | Active |
| Compressed NFTs | Metaplex Bubblegum | Built |
| Price Oracles | Pyth Network via x402 | Built |
| RPC / Websockets | Helius | Built |
| Agent Payments | x402 Protocol (agent self-funds oracle queries) | Built |
| Frontend | Next.js 14 + TypeScript | Built |
| Wallet | Solana Wallet Adapter (Phantom) | Built |
| Styling | Tailwind CSS + Framer Motion | Built |
| Anchor Client | `@coral-xyz/anchor` | Built |
| AI (form + chat) | Claude API (`@anthropic-ai/sdk`) | Partial (form only) |
| Telegram Bot | Telegram Bot HTTP API (raw fetch) | Partial (single-user) |
| Bot State Store | `better-sqlite3` | **TODO** |
| Email Service | Resend | **TODO** |
| Email Wallet | Privy / Magic.link | **TODO** |

---

## Important Commands

```bash
# Install JS deps
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Run AI agent
npx ts-node agent/index.ts

# Build Anchor program
anchor build

# Run Anchor tests
anchor test

# Deploy to devnet ONLY
anchor deploy --provider.cluster devnet

# Airdrop devnet SOL
solana airdrop 2

# Check wallet balance
solana balance

# Set CLI to devnet
solana config set --url devnet
```

### Do NOT

- **Deploy to mainnet** — devnet only during hackathon
- **Commit `.env.local`** — add to `.gitignore`, keep private keys out of git
- **Use polling for condition checks** — only Helius websockets, polling burns RPC credits
- **Hardcode wallet addresses** — all addresses come from user input or contract state
- **Use `TELEGRAM_CHAT_ID` env var for new multi-user code** — use SQLite lookup per switch
- **Store private keys in env files that get committed** — use `.env.local`

---

## Environment Variables

```bash
# .env.local
ANTHROPIC_API_KEY=           # Claude API — used by /api/parse-switch and bot conversation
HELIUS_API_KEY=              # Helius RPC + websocket
TELEGRAM_BOT_TOKEN=          # BotFather token
TELEGRAM_CHAT_ID=            # LEGACY — single owner only, being phased out by SQLite
AGENT_KEYPAIR_JSON=          # Agent wallet as JSON array (for Railway/cloud)
AGENT_KEYPAIR_PATH=          # Or local path to keypair .json file
PROGRAM_ID=                  # Deployed Anchor program ID
GRACE_PERIOD_SECONDS=604800  # Default 7 days, set low (e.g. 60) for demo
RESEND_API_KEY=              # TODO — email service for beneficiary notifications
```

---

## Full Workflow (Step by Step)

```
OWNER ONBOARDING
─────────────────
1.  Owner sends /start to Telegram bot
      ↓
2.  Claude asks conversational questions:
      use case → inactivity period → amount → beneficiary name + email
      ↓
3.  Bot shows summary + sends deep link:
      yourapp.com/create?prefill=<base64>&tgCode=<one-time-code>
      ↓
4.  Owner opens link, connects Phantom wallet, reviews pre-filled form
      ↓
5.  Website calls /api/tg-auth with tgCode + wallet pubkey + signature
      Agent DB links: chat_id ↔ wallet_pubkey
      ↓
6.  Owner signs create_switch transaction on-site
      PDA vault created, SOL locked, beneficiary stored (or set to unset if email-only)
      ↓
7.  Agent mints cNFT — stores switch metadata including beneficiary email in URI


MONITORING
──────────
8.  Agent opens Helius websocket on owner's wallet
      ANY on-chain activity (swap, transfer, stake, vote) fires heartbeat
      Timer resets — owner never pressed anything
      ↓
9.  Agent checks time condition every 60s
      If deadline not reached: log remaining time, continue
      ↓
10. If deadline passed:
      Agent sends Telegram warning to owner's chat_id (looked up from SQLite)
      Grace period starts (default 7 days)
      ↓
11. During grace period:
      Any Telegram reply from owner → agent calls heartbeat("telegram_reply") → timer reset
      Any on-chain activity → Helius websocket fires → timer reset automatically


EXECUTION
─────────
12. Grace period expires with no reply:
      Agent calls execute instruction on Anchor program
      SOL transfers from PDA vault to beneficiary address
      ↓
13. Agent generates one-time claim code, stores in SQLite
      Sends email to beneficiary:
        "X SOL left for you by [owner]. Claim at yourapp.com/claim?code=<code>
         Or message our Telegram bot: /claim <code>"
      Sends execution notice to owner's Telegram chat


BENEFICIARY CLAIM (Telegram path)
──────────────────────────────────
14. Beneficiary messages bot: /claim <code>
      Agent verifies code in SQLite, marks as used
      ↓
15. Bot asks: "Do you have a Solana wallet address?"
      ↓
      YES → Bot asks for address
             Agent calls claim_beneficiary(switch_id, address) on contract
             Execute proceeds, SOL sent to their wallet
             Bot confirms with tx link
      ↓
      NO  → Bot sends: "Create a free wallet at yourapp.com/wallet
             Sign in with email — takes 30 seconds"
             On wallet created → user returns, provides address → execute proceeds


BENEFICIARY CLAIM (Web path)
─────────────────────────────
16. Beneficiary visits yourapp.com/claim?code=<code>
      Page verifies code, shows switch details (who, how much, from whom)
      Connect wallet or create one with email (Privy)
      Claim button calls claim_beneficiary then execute on-chain
```

---

## Task Breakdown

Each task is independent and shippable. Work in the order listed — each group unblocks the next.

---

### Group 1 — Contract Updates

> Files: `programs/dead-mans-switch/src/`

| # | Task | File |
|---|---|---|
| C1 | Add `beneficiary_claimed: bool` flag to `Switch` state | `src/state/switch.rs` |
| C2 | Update `create_switch` to accept `Pubkey::default()` as "no beneficiary yet" sentinel | `src/instructions/create_switch.rs` |
| C3 | Update `execute` — if beneficiary is default, send to claim vault PDA instead | `src/instructions/execute.rs` |
| C4 | Add `claim_vault` PDA account seeded by `[b"claim", switch.key()]` | new: `src/state/claim_vault.rs` |
| C5 | Add `claim_beneficiary(switch_id, new_beneficiary)` instruction — called by agent after off-chain code verify | new: `src/instructions/claim_beneficiary.rs` |
| C6 | Update `mod.rs` to export new instruction | `src/instructions/mod.rs` |
| C7 | Rebuild and redeploy to devnet | `anchor build && anchor deploy --provider.cluster devnet` |

---

### Group 2 — Agent State Store (SQLite)

> New file: `agent/bot-state.ts`
> Install: `npm install better-sqlite3 @types/better-sqlite3`

| # | Task | Details |
|---|---|---|
| A1 | Install `better-sqlite3` | `npm install better-sqlite3 @types/better-sqlite3` |
| A2 | Create `agent/bot-state.ts` with three tables | `owners`, `conversations`, `claim_codes` — see schema below |
| A3 | Migrate `agent/grace-period.ts` to use SQLite | Replace JSON file reads/writes with DB calls |

**SQLite Schema**

```sql
-- Links Telegram identity to Solana wallet
CREATE TABLE owners (
  chat_id     TEXT PRIMARY KEY,
  wallet      TEXT NOT NULL,
  auth_code   TEXT,              -- one-time code for /api/tg-auth handshake
  code_expiry INTEGER,           -- unix ms
  created_at  INTEGER
);

-- Per-user conversation state for bot Q&A
CREATE TABLE conversations (
  chat_id   TEXT PRIMARY KEY,
  step      TEXT NOT NULL,       -- 'use_case' | 'grace_period' | 'amount' | 'beneficiary_name' | 'beneficiary_email' | 'confirm'
  data      TEXT NOT NULL        -- JSON blob of collected answers so far
);

-- One-time codes sent to beneficiaries via email
CREATE TABLE claim_codes (
  code        TEXT PRIMARY KEY,
  switch_id   TEXT NOT NULL,
  beneficiary_email TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,  -- unix ms
  used        INTEGER DEFAULT 0
);
```

---

### Group 3 — Multi-User Telegram Routing

> Files: `agent/telegram.ts`, `agent/index.ts`, `agent/grace-period.ts`

| # | Task | Details |
|---|---|---|
| A4 | Update `sendWarning`, `sendExecutionNotice`, `sendResetConfirmation` to look up `chat_id` from SQLite per-switch | Remove hardcoded `TELEGRAM_CHAT_ID` usage |
| A5 | Update `agent/index.ts` condition loop — get `chat_id` from DB using `switch.owner.toBase58()` | Replace `TELEGRAM_CHAT_ID` env var fallback |
| A6 | Update `grace-period.ts` — `startGracePeriod` already stores `chatId`, just route through SQLite now | Verify per-switch isolation works |

---

### Group 4 — Claude Conversation Handler

> New file: `agent/bot-conversation.ts`

| # | Task | Details |
|---|---|---|
| A7 | Create `agent/bot-conversation.ts` — step-by-step Q&A powered by Claude | Conversation steps listed below |
| A8 | Replace static `/start` handler in `telegram.ts` with `startConversation(chatId)` call | |
| A9 | Handle each step's user reply: parse with Claude, store partial data, advance to next step | |
| A10 | On `confirm` step: encode collected data as base64, generate `tgCode`, send deep link to owner | |

**Conversation Steps**

```
step: 'use_case'        → "What's this switch for? (e.g. send SOL to my daughter if I'm inactive)"
step: 'grace_period'    → "How many days of inactivity before it triggers? (e.g. 90 days)"
step: 'amount'          → "How much SOL do you want to lock? (check your balance first)"
step: 'beneficiary_name'→ "Who is the beneficiary? (just a name for your reference)"
step: 'beneficiary_email'→ "What's their email address? We'll notify them when the switch fires."
step: 'confirm'         → Show full summary, ask "Confirm? (yes/no)", then send deep link
```

---

### Group 5 — Owner Auth Handshake

| # | Task | File |
|---|---|---|
| A11 | Add `generateAuthCode(chatId)` to `bot-state.ts` — stores code + expiry in `owners` table | `agent/bot-state.ts` |
| F1 | Create `src/app/api/tg-auth/route.ts` — receives `{tgCode, walletPubkey}`, verifies code not expired, writes `owners` row | new API route |
| F2 | Add TG link step to create page or dashboard — small UI showing the code and a "Link Telegram" button that hits `/api/tg-auth` | `src/app/create/page.tsx` or `src/app/dashboard/page.tsx` |

---

### Group 6 — Email Service

> New file: `agent/email.ts`
> Install: `npm install resend`

| # | Task | Details |
|---|---|---|
| E1 | Install `resend` | `npm install resend` |
| E2 | Create `agent/email.ts` — `sendClaimEmail(to, ownerName, amountSol, claimCode, claimUrl)` | Uses Resend API |
| E3 | In `agent/index.ts` execution block: generate claim code → insert into SQLite → call `sendClaimEmail` | After `executeSwitch` succeeds |

---

### Group 7 — Beneficiary Telegram Claim Flow

> Files: `agent/telegram.ts`, `agent/bot-conversation.ts`

| # | Task | Details |
|---|---|---|
| A12 | Add `/claim <code>` command handler in `processBotCommands` | Verify code in SQLite, mark used |
| A13 | Start beneficiary conversation after valid `/claim`: ask "Do you have a Solana wallet?" | New conversation branch in `bot-conversation.ts` |
| A14 | YES path: ask for address → agent calls `claim_beneficiary` instruction → then `execute` → send tx confirmation | |
| A15 | NO path: send Privy/Magic.link wallet creation URL → poll until they return with an address | |

---

### Group 8 — Frontend Claim Page

| # | Task | File |
|---|---|---|
| F3 | Create `src/app/claim/page.tsx` — shows switch details from code, connect wallet or create with email, claim button | new page |
| F4 | Add `?prefill=<base64>` query param support to create page — parse and pre-fill form fields on load | `src/app/create/page.tsx` |

---

### Group 9 — cNFT Metadata Update

| # | Task | File |
|---|---|---|
| M1 | Update `agent/mint-cnft.ts` cNFT URI to include `beneficiary_email` field | `agent/mint-cnft.ts` |

---

## Folder Structure

```
dead-mans-switch/
│
├── programs/dead-mans-switch/src/
│   ├── lib.rs
│   ├── errors.rs
│   ├── state/
│   │   ├── switch.rs              ← C1: add beneficiary_claimed flag
│   │   ├── claim_vault.rs         ← C4: NEW — unclaimed PDA
│   │   └── mod.rs
│   └── instructions/
│       ├── create_switch.rs       ← C2: allow unset beneficiary
│       ├── execute.rs             ← C3: route to claim vault if unset
│       ├── claim_beneficiary.rs   ← C5: NEW — agent sets beneficiary after claim
│       ├── check_in.rs
│       ├── heartbeat.rs
│       ├── cancel.rs
│       ├── link_cnft.rs
│       └── mod.rs                 ← C6: export new instruction
│
├── agent/
│   ├── index.ts                   ← A5: multi-user chat_id routing
│   ├── telegram.ts                ← A4, A8, A12: multi-user + Claude conv + /claim
│   ├── bot-conversation.ts        ← A7–A10, A13–A15: NEW — Claude Q&A engine
│   ├── bot-state.ts               ← A2: NEW — SQLite state store
│   ├── email.ts                   ← E2: NEW — Resend email client
│   ├── conditions.ts
│   ├── executor.ts
│   ├── monitor.ts
│   ├── grace-period.ts            ← A3, A6: migrated to SQLite
│   ├── mint-cnft.ts               ← M1: add email to cNFT URI
│   ├── pyth-oracle.ts
│   ├── x402-client.ts
│   ├── program.ts
│   ├── types.ts
│   └── agent-tx-cache.ts
│
├── src/app/
│   ├── page.tsx                   ← Landing
│   ├── create/page.tsx            ← F2, F4: TG link UI + prefill support
│   ├── dashboard/page.tsx
│   ├── claim/page.tsx             ← F3: NEW — beneficiary web claim
│   ├── switches/
│   └── api/
│       ├── parse-switch/route.ts  ← Claude form parser (existing)
│       └── tg-auth/route.ts       ← F1: NEW — owner auth handshake
│
├── Anchor.toml
├── package.json
├── .env.local                     ← NEVER commit
├── CLAUDE.md
└── ARCHITECTURE.md                ← this file
```

---

## Key File Reference

| File | What It Does |
|---|---|
| `programs/.../state/switch.rs` | On-chain Switch account struct — all fields stored per switch |
| `programs/.../instructions/create_switch.rs` | Creates PDA vault, locks SOL, sets beneficiary + watcher |
| `programs/.../instructions/execute.rs` | Releases locked SOL to beneficiary when called by agent |
| `programs/.../instructions/heartbeat.rs` | Resets timer, records activity type — called by agent on wallet activity |
| `agent/index.ts` | Main agent loop — loads switches, runs monitors, evaluates conditions |
| `agent/monitor.ts` | Helius websocket — watches owner wallet, fires heartbeat on any tx |
| `agent/conditions.ts` | Evaluates `lastCheckIn + checkInInterval < now` |
| `agent/executor.ts` | Calls Anchor `execute` and `heartbeat` instructions |
| `agent/telegram.ts` | Sends warnings, execution notices, polls for alive signals |
| `agent/grace-period.ts` | Tracks grace period state between agent cycles |
| `agent/x402-client.ts` | Pays for Pyth oracle queries per-use via x402 |
| `agent/mint-cnft.ts` | Mints Bubblegum cNFT storing switch metadata on-chain |
| `src/app/api/parse-switch/route.ts` | Claude API — parses natural language → structured switch params |
| `src/app/create/page.tsx` | Create switch form — AI input, beneficiary, amount, Telegram setup |

---

## Links

**Hackathon Submission**

| Resource | URL |
|---|---|
| Colosseum Frontier Hackathon | https://arena.colosseum.org/frontier |
| Superteam Earn Submission | https://earn.superteam.fun |
| KIRAPAY Payments Track | https://kirapay.xyz (submit here for bonus) |
| SNS Identity Track | https://sns.id (submit here for bonus) |
| Superteam Malaysia | https://my.superteam.fun |

**Technical Docs**

| Resource | URL |
|---|---|
| Anchor Framework Docs | https://www.anchor-lang.com |
| Anchor PDA Guide | https://www.anchor-lang.com/docs/pdas |
| Solana Cookbook | https://solanacookbook.com |
| Helius RPC + Websockets | https://docs.helius.dev |
| Pyth Oracle | https://pyth.network/developers |
| Metaplex Bubblegum (cNFTs) | https://developers.metaplex.com/bubblegum |
| x402 Protocol | https://x402.org |
| x402 GitHub | https://github.com/coinbase/x402 |
| Solana Name Service (SNS) | https://sns.id/developers |
| Solana Wallet Adapter | https://github.com/solana-labs/wallet-adapter |
| Claude API Docs | https://docs.anthropic.com |
| Resend (email) | https://resend.com/docs |
| Privy (email wallets) | https://docs.privy.io |
| better-sqlite3 | https://github.com/WiseLibs/better-sqlite3 |
| Solana Devnet Faucet | https://faucet.solana.com |
| Solana Explorer (devnet) | https://explorer.solana.com/?cluster=devnet |
| Telegram Bot API | https://core.telegram.org/bots/api |

---

## Demo Script

**Open with the payments story** (KIRAPAY angle):
> *"My mum doesn't have a crypto wallet. She never will. But if I go silent for 90 days,
> she gets my SOL — all she needs is her email and a Telegram account. That's the product."*

1. Open Telegram, send `/start` — show Claude asking natural language questions live
2. Confirm the switch, open the deep link, connect Phantom — show form pre-filled
3. Sign the transaction — show Solana Explorer with the PDA vault locked
4. Set `GRACE_PERIOD_SECONDS=60` for demo mode — fast execution for the room
5. Show the Telegram warning arriving to the owner — ignore it deliberately
6. Watch the switch auto-execute — show SOL leaving the vault on Explorer
7. Show the beneficiary email arriving with the claim link (non-crypto person flow)
8. Open the claim page, create a wallet with email (Privy) or paste an address, claim
9. Show SOL arriving in the beneficiary's wallet — the full payment completed
10. Open Solana Explorer on the cNFT asset — the "will" is stored on-chain, permanent record
11. Show agent terminal — x402 logs showing agent self-funded its own oracle queries

**KIRAPAY talking point:** Every step from owner setup to beneficiary payout happens
without the recipient ever needing to know what Solana is. That is real-world payment adoption.

**SNS Identity talking point (if asked):** Beneficiary input accepts `.sol` names —
type `daughter.sol` instead of a base58 address.
