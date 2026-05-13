# Dead Man's Switch — Autonomous On-chain Executor
 Website: https://deadman-v2.vercel.app/

> *"If I don't check in for 90 days, send my SOL to my daughter's wallet."*

An AI agent that holds your assets and executes your future instructions when conditions are met — with no middleman, no subscription, no single point of failure.

---

## The Idea

Most people have no plan for their crypto if something happens to them. Wallets get forgotten. Seeds get lost. Families get nothing.

Dead Man's Switch is a trustless executor built on Solana. You define a condition — inactivity for 90 days — and a consequence — send my SOL to this address. A smart contract holds your assets. An AI agent watches your wallet around the clock. If you go quiet, it acts.

**The killer feature:** you never have to open the app. Any on-chain activity from your wallet — a DEX swap, a transfer, a stake vote — automatically resets your timer. Your last transaction is your heartbeat.

---

## What It Does

### For the owner
- Lock SOL in a PDA vault with a beneficiary and a trigger condition
- Set up entirely through a Telegram bot — no app needed until the final wallet signature
- Any on-chain activity resets the timer automatically (no manual check-ins required)
- Receive a Telegram warning + email before the switch fires, with a grace period to respond
- Cancel or modify at any time

### For the beneficiary
- Receive an email when the switch triggers
- If they have a Solana wallet: funds are sent directly
- If they don't: they get a claim link — they can provide a wallet address later and collect

### Demo mode
- Try the full flow without a wallet or devnet SOL
- Creates a mock switch that immediately "executes" and generates a real claim link
- Useful for showing the product without on-chain setup

---

## How It Works

```
[Telegram bot] Owner chats with the AI bot
    ↓
Groq-powered conversation collects: trigger days, amount, beneficiary name + email
    ↓
Bot generates a deep-link → owner opens in browser, form pre-fills
    ↓
Owner connects Phantom, signs one transaction
    ↓
Anchor program locks SOL in a PDA vault
cNFT minted as an on-chain "instruction scroll" (the will)
    ↓
AI agent monitors owner's wallet via Helius WebSocket (free, real-time)
    ↓
Any on-chain activity → agent calls heartbeat → timer resets
    ↓
[Timer expires] → Telegram warning + email → grace period starts
    ↓
[No response] → Agent calls execute → SOL moves to beneficiary
    ↓
Beneficiary gets email with claim link (or direct transfer if address was set)
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Smart Contract | Rust + Anchor Framework |
| Chain | Solana Devnet |
| Wallet Monitoring | Helius WebSocket subscriptions |
| Price Oracles | Pyth Network via x402 |
| Agent Payments | x402 Protocol — agent self-funds oracle queries |
| Bot AI | Groq (llama-3.1-8b-instant) |
| Email | Resend |
| Frontend | Next.js 14 + TypeScript |
| Wallet | Solana Wallet Adapter (Phantom) |
| Styling | Tailwind CSS + Framer Motion |
| Agent DB | better-sqlite3 |

---

## Why Solana

This product is only viable on Solana.

**Helius WebSocket subscriptions are free.** The agent subscribes to the owner's wallet and gets notified of every transaction in real time, at no cost. On Ethereum, you'd need a paid keeper network (Gelato, Chainlink Automation) that charges per trigger — making the economics of small transfers absurd.

**~$0.00025 per transaction** makes 1000-lamport oracle micropayments viable. The agent pays for each Pyth price query using x402, from the vault's operating budget, per-use instead of a flat subscription.

**PDA vaults** give custodian-free escrow. No multisig, no third party, no trust required. The owner's conditions are enforced by the program itself.

**Bubblegum cNFTs** store the "instruction scroll" — the will — on-chain for roughly $0.001. It's a permanent, verifiable record that the user's intent existed before execution.

---

## Smart Contract

The Anchor program deployed on Solana Devnet exposes these instructions:

| Instruction | Signer | What it does |
|---|---|---|
| `create_switch` | Owner | Initialize PDA vault, lock SOL, register watcher |
| `check_in` | Owner | Manually reset the inactivity timer |
| `heartbeat` | Watcher (agent) | Reset timer from detected wallet activity |
| `execute` | Watcher (agent) | Release SOL to beneficiary wallet |
| `execute_to_vault` | Watcher (agent) | Release SOL to unclaimed vault (no address yet) |
| `claim_beneficiary` | Anyone | Beneficiary claims SOL with a claim code |
| `link_cnft` | Owner | Attach the cNFT instruction scroll to the switch |
| `cancel` | Owner | Close vault, return all SOL to owner |

```
Program ID: 5VTjU3UxdPuXCgEes3BZHKU1AXYCnTU2YFF5LdWqTXJx
```

---

## Agent Architecture

The agent is a persistent Node.js process that runs independently of the frontend.

- **Condition loop** — polls all active switches every 60s, compares `now - lastCheckIn` against the on-chain `checkInInterval`
- **Helius WebSocket monitor** — per-switch subscription to the owner's wallet; any transaction fires a `heartbeat` instruction on-chain
- **Grace period** — persisted to disk (`grace-periods.json`); survives agent restarts
- **Multi-user** — each switch is isolated by `switchId`; Telegram chats and emails are keyed per owner wallet
- **x402 oracle** — agent pays per Pyth price query rather than subscribing upfront

---

## Project Structure

```
├── programs/dead-mans-switch/   ← Rust/Anchor smart contract
├── src/app/                     ← Next.js pages (create, dashboard, claim, switches)
├── src/app/api/                 ← API routes (claim, demo-claim, tg-auth, kirapay, email)
├── src/lib/                     ← Anchor client hooks, on-chain state store
├── agent/                       ← AI agent (monitor, executor, Telegram bot, email, cNFT)
└── x402/                        ← Mock price oracle server with 402 payment gate
```

---
