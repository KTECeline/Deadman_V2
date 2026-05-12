Revised Flow (post-clarification)
  
  Owner onboarding:
  1. Owner sends /start to bot → Claude asks conversational questions (use case, grace period, amount, beneficiary name + email)
  2. Bot shows a personalized deep link: yourapp.com/create?prefill=<base64-encoded-data>&tgCode=<one-time-code>
  3. Owner opens link, connects Phantom, signs the create_switch transaction — switch is created with a temporary placeholder PDA for beneficiary (since no wallet address yet)
  4. Website calls back to confirm the switch is live and link chat_id ↔ wallet

  Monitoring:
  - TG warnings during grace period (already built — just needs multi-user routing)

  Execution:
  5. When the switch fires, agent sends beneficiary an email: "X SOL has been left for you — claim at yourapp.com/claim?code=<claim-code>"
  6. Email also contains: "Map to Telegram: message our bot with /claim <code>"
  7. Beneficiary visits website OR messages bot with code
  8. Bot asks: "Do you have a Solana wallet?" → if no → redirects to Privy/Magic.link wallet creation on site → then executes → if yes → bot asks for address → executes

  ---
  What needs to be built
  
  ┌──────────────────────────────┬─────────┬───────────────────────────────────────────────────────────────────┐
  │          Component           │ Status  │                            Work needed                            │
  ├──────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────┤
  │ Multi-user state store       │ Missing │ JSON/SQLite file: chat_id → {wallet, conversationState, switchId}   │
  ├──────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────┤
  │ Claude conversation in TG    │ Missing │ Replace static /start reply with Claude-driven Q&A                  │
  ├──────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────┤
  │ Owner auth handshake         │ Missing │ TG code → website links chat_id ↔ wallet                            │
  ├──────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────┤
  │ Deep link prefill            │ Missing │ Encode conversation output → website prefills form                  │
  ├──────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────┤
  │ Beneficiary email field      │ Missing │ Add to cNFT metadata + agent state                                  │
  ├──────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────┤
  │ Email service                │ Missing │ Resend/SendGrid for claim notifications                             │
  ├──────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────┤
  │ Claim code system            │ Missing │ Generate, store, verify one-time claim codes                        │
  ├──────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────┤
  │ Unclaimed PDA beneficiary    │ Missing │ Contract change: beneficiary can be a system PDA until claimed      │
  ├──────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────┤
  │ Privy/Magic.link integration │ Missing │ Email-based wallet creation on website                              │
  ├──────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────┤
  │ Multi-user Telegram routing  │ Partial │ Bot hardcoded to single TELEGRAM_CHAT_ID — needs per-switch routing │
  └──────────────────────────────┴─────────┴─────────────────────────────────────────────────────────────────────┘

  ---
  Two more things I need to confirm before planning the implementation:

⏺ User answered Claude's questions:
  ⎿  · The 'unclaimed beneficiary' case requires a smart contract change: the PDA vault can't release funds to a beneficiary address that doesn't exist yet at creation time. For the hackathon 
     demo, how do you want to handle this? → Add an unclaimed PDA to the contract
     · How do you want to store the multi-user bot state (conversation progress, wallet links, claim codes)? → SQLite via better-sqlite3
     
⏺ Perfect. Here's the complete aligned picture of everything — the full implementation plan before I write a single line.
    
  ---
  Full Aligned Architecture

  Phase A — Smart Contract changes

  - Add optional beneficiary: Option<Pubkey> to create_switch — when None, funds go to an intermediary PDA (the "unclaimed vault")
  - Add claim_beneficiary instruction — beneficiary signs with their keypair to register their address on the unclaimed PDA and release funds

  Phase B — Agent bot (SQLite + Claude conversation)

  - State store (agent/bot-state.ts) — SQLite DB with tables: owners (chat_id, wallet_pubkey, auth_code), conversations (chat_id, step, partial_data), claim_codes (code, switch_id, 
  beneficiary_email, expires_at)
  - Claude conversation (agent/bot-conversation.ts) — replaces the static /start handler. Claude drives a multi-turn Q&A: use case → grace period → amount → beneficiary name + email →
  confirmation → generates deep link
  - Owner auth handshake — bot generates a tgCode, owner pastes it on the website while wallet is connected, website calls /api/tg-auth to link chat_id ↔ wallet_pubkey
  - Multi-user warning routing — agent looks up chat_id from SQLite per switch instead of the hardcoded env var
  - Claim code + email (agent/email.ts) — when switch executes, generates a one-time code, stores it in SQLite, sends email to beneficiary via Resend with claim link + bot /claim <code>
  instruction
  - Beneficiary TG flow — /claim <code> verifies code, asks "do you have a Solana wallet?", if yes → collect address → trigger contract's claim_beneficiary → execute, if no → send
  Privy/Magic.link wallet creation URL

  Phase C — Frontend

  - /api/tg-auth — receives {tgCode, walletPubkey, signature}, verifies wallet ownership, writes to SQLite
  - /claim?code=<code> page — beneficiary web claim alternative (for those who skip the bot flow)
  - Create form prefill via ?prefill=<base64> query param — bot-collected data auto-fills the form fields

  ---
  Build order (each phase unblocks the next)
  
  1. Contract → claim_beneficiary instruction + unclaimed PDA
  2. SQLite state store + bot-state module
  3. Claude conversation handler (replaces static /start)
  4. Owner auth handshake (TG code ↔ wallet link)
  5. Deep link generation + frontend prefill
  6. Multi-user warning routing in agent loop
  7. Email service + claim code generation on execution
  8. Beneficiary Telegram /claim flow
  9. /claim page on frontend

  ---
  This is a large but clean build — each step is independent and testable. Before I start, confirm: do you want me to begin implementation in this order, and is there any piece you want to 
  tackle differently or skip for the hackathon demo?