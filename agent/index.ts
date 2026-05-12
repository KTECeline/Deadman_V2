/**
 * Dead Man's Switch — AI Agent
 *
 * Startup sequence:
 *   1. Load all active Switch accounts from the program
 *   2. For each switch, open a Helius websocket on the owner's wallet (heartbeat monitor)
 *   3. Every 60s, evaluate time conditions and execute any expired switches
 *
 * Run: npx ts-node agent/index.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import WebSocket from "ws";

import { SwitchAccount } from "./types";
import { loadProgram } from "./program";
import { startHeartbeatMonitor } from "./monitor";
import { evaluateTimeCondition, formatDeadline } from "./conditions";
import { executeSwitch, recordHeartbeat } from "./executor";
import {
  sendWarning,
  sendExecutionNotice,
  sendResetConfirmation,
  checkForAliveSignal,
  processBotCommands,
  resolveChatId,
} from "./telegram";
import { createClaimCode } from "./bot-state";
import { sendClaimEmail } from "./email";
import { lookupSolName, resolveSolName } from "./sns";
import {
  startGracePeriod,
  getGracePeriod,
  clearGracePeriod,
  isGraceExpired,
} from "./grace-period";

const POLL_INTERVAL_MS = 60_000; // check conditions every 60 seconds

// Grace period before execution — default 7 days, override via env for demo
const GRACE_PERIOD_MS =
  parseInt(process.env.GRACE_PERIOD_SECONDS ?? "604800") * 1000;
const GRACE_PERIOD_DAYS = Math.round(GRACE_PERIOD_MS / 86_400_000) || 1;


// ── Agent keypair (the authorized watcher) ──────────────────────────────────
function loadAgentKeypair(): Keypair {
  // Accept raw JSON array via env (for Railway/cloud deployments)
  if (process.env.AGENT_KEYPAIR_JSON) {
    const json = JSON.parse(process.env.AGENT_KEYPAIR_JSON);
    return Keypair.fromSecretKey(new Uint8Array(json));
  }
  const walletPath =
    process.env.AGENT_KEYPAIR_PATH ??
    path.join(process.env.HOME!, ".config/solana/id.json");
  const json = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(json));
}

// ── Fetch all active switches from the program ───────────────────────────────
async function fetchActiveSwitches(program: anchor.Program): Promise<SwitchAccount[]> {
  const raw = await (program.account as any).switch.all();

  return raw.map((item: any) => {
    const a = item.account;
    return {
      publicKey: item.publicKey as PublicKey,
      owner: a.owner as PublicKey,
      beneficiary: a.beneficiary as PublicKey,
      checkInInterval: a.checkInInterval.toNumber(),
      lastCheckIn: a.lastCheckIn.toNumber(),
      lockedAmount: BigInt(a.lockedAmount.toString()),
      switchId: BigInt(a.switchId.toString()),
      watcher: a.watcher as PublicKey,
      cnftAssetId: a.cnftAssetId as PublicKey,
      lastActivityType: Buffer.from(a.lastActivityType).toString("utf8").replace(/\0/g, ""),
    } as SwitchAccount;
  });
}

// ── Condition check loop ─────────────────────────────────────────────────────
async function runConditionLoop(
  program: anchor.Program,
  agentKeypair: Keypair,
  executedSwitches: Set<string>
) {
  await processBotCommands();

  const switches = await fetchActiveSwitches(program);
  console.log(`\n[agent] Checking ${switches.length} active switch(es)...`);

  for (const sw of switches) {
    const key = sw.publicKey.toBase58();
    if (executedSwitches.has(key)) continue;

    // Only act on switches where this agent is the authorized watcher
    if (sw.watcher.toBase58() !== agentKeypair.publicKey.toBase58()) continue;

    const result = evaluateTimeCondition(sw);
    console.log(`[agent] Switch ${sw.switchId}: ${result.reason}`);

    if (result.shouldExecute) {
      const grace = getGracePeriod(sw.switchId);
      const chatId = resolveChatId(sw.owner.toBase58());

      if (!grace) {
        // First expiry — send warning and start grace period
        if (chatId) await sendWarning(chatId, sw.switchId, GRACE_PERIOD_DAYS);
        startGracePeriod(sw.switchId, chatId ?? "");
        console.log(
          `[agent] ⚠️  Switch ${sw.switchId} expired — grace period started ` +
          `(${GRACE_PERIOD_DAYS}d). Telegram warning sent.`
        );
      } else if (isGraceExpired(grace, GRACE_PERIOD_MS)) {
        // Grace period over — execute
        console.log(`[agent] 🔴 Executing switch ${sw.switchId} (grace period elapsed)...`);
        try {
          const sig = await executeSwitch(sw, agentKeypair);
          executedSwitches.add(key);
          if (chatId) await sendExecutionNotice(chatId, sw.switchId, sig, sw.lockedAmount);
          clearGracePeriod(sw.switchId);
          console.log(`[agent] ✅ Switch ${sw.switchId} executed. Sig: ${sig}`);

          // If beneficiary had no wallet, read email from cNFT URI and send claim email
          const beneficiaryIsUnset =
            sw.beneficiary.toBase58() === anchor.web3.PublicKey.default.toBase58();
          if (beneficiaryIsUnset && process.env.RESEND_API_KEY) {
            const beneficiaryEmail = await readEmailFromCnft(sw.cnftAssetId.toBase58());
            if (beneficiaryEmail) {
              const claimCode = createClaimCode(sw.switchId.toString(), beneficiaryEmail);
              await sendClaimEmail(
                beneficiaryEmail,
                sw.owner.toBase58().slice(0, 8),
                Number(sw.lockedAmount) / 1e9,
                claimCode
              );
              console.log(`[agent] 📧 Claim email sent to ${beneficiaryEmail}`);
            }
          }
        } catch (err: any) {
          console.error(`[agent] ❌ Execute failed for switch ${sw.switchId}:`, err.message);
        }
      } else {
        // Inside grace period — check for Telegram alive signal
        const aliveSignal = await checkForAliveSignal(grace.startedAt);
        if (aliveSignal) {
          try {
            await recordHeartbeat(sw, "telegram_reply", agentKeypair);
            clearGracePeriod(sw.switchId);
            if (chatId) await sendResetConfirmation(chatId, sw.switchId);
            console.log(`[agent] ✅ Switch ${sw.switchId} — alive signal received, timer reset.`);
          } catch (err: any) {
            console.error(`[agent] ❌ Heartbeat failed for switch ${sw.switchId}:`, err.message);
          }
        } else {
          const elapsed = Date.now() - grace.startedAt;
          const remainingMs = GRACE_PERIOD_MS - elapsed;
          const remainingHours = Math.ceil(remainingMs / 3_600_000);
          console.log(
            `[agent] ⏳ Switch ${sw.switchId} in grace period — ` +
            `${remainingHours}h remaining before execution.`
          );
        }
      }
    } else {
      console.log(`[agent] Switch ${sw.switchId} deadline: ${formatDeadline(sw)}`);
    }
  }
}

// ── Read beneficiary email from cNFT on-chain metadata ───────────────────────
async function readEmailFromCnft(assetId: string): Promise<string | null> {
  if (!assetId || assetId === anchor.web3.PublicKey.default.toBase58()) return null;
  try {
    const heliusUrl = `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    const res = await fetch(heliusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: "get-asset", method: "getAsset",
        params: { id: assetId },
      }),
    });
    const json = await res.json();
    const uri: string = json?.result?.content?.json_uri ?? "";
    if (!uri) return null;

    // URI is a data: base64 blob we encoded ourselves
    if (uri.startsWith("data:application/json;base64,")) {
      const decoded = JSON.parse(Buffer.from(uri.slice(29), "base64").toString("utf-8"));
      return decoded?.properties?.beneficiary_email || null;
    }

    // Or a real https URI
    const metaRes = await fetch(uri);
    const meta = await metaRes.json();
    return meta?.properties?.beneficiary_email || null;
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔐 Dead Man's Switch Agent starting...");

  if (!process.env.HELIUS_API_KEY) {
    console.error("HELIUS_API_KEY not set in .env.local");
    process.exit(1);
  }

  const agentKeypair = loadAgentKeypair();
  const program = loadProgram(agentKeypair);
  const connection = program.provider.connection;

  console.log(`[agent] Wallet: ${agentKeypair.publicKey.toBase58()}`);
  console.log(`[agent] Program: ${program.programId.toBase58()}`);

  // Resolve agent .sol identity
  const agentDomain = await lookupSolName(agentKeypair.publicKey, connection);
  if (agentDomain) {
    console.log(`[agent] Identity: ${agentDomain} (${agentKeypair.publicKey.toBase58()})`);
  } else if (process.env.AGENT_SOL_NAME) {
    const resolved = await resolveSolName(process.env.AGENT_SOL_NAME, connection);
    if (resolved?.toBase58() === agentKeypair.publicKey.toBase58()) {
      console.log(`[agent] Identity: ${process.env.AGENT_SOL_NAME} ✓`);
    } else {
      console.log(`[agent] Identity: ${agentKeypair.publicKey.toBase58()} (no .sol domain yet)`);
    }
  } else {
    console.log(`[agent] Identity: ${agentKeypair.publicKey.toBase58()} (no .sol domain yet)`);
  }

  // Fetch initial switches and start a websocket monitor for each
  const switches = await fetchActiveSwitches(program);
  console.log(`[agent] Found ${switches.length} active switch(es)`);

  const activeSockets = new Map<string, WebSocket>();
  const executedSwitches = new Set<string>();

  for (const sw of switches) {
    if (sw.watcher.toBase58() !== agentKeypair.publicKey.toBase58()) continue;
    const ws = startHeartbeatMonitor(sw, agentKeypair);
    activeSockets.set(sw.publicKey.toBase58(), ws);
  }

  // Run condition check immediately, then on interval
  await runConditionLoop(program, agentKeypair, executedSwitches);

  setInterval(async () => {
    await runConditionLoop(program, agentKeypair, executedSwitches);

    // Start monitors for any newly created switches
    const latest = await fetchActiveSwitches(program);
    for (const sw of latest) {
      const key = sw.publicKey.toBase58();
      if (activeSockets.has(key)) continue;
      if (sw.watcher.toBase58() !== agentKeypair.publicKey.toBase58()) continue;
      const ws = startHeartbeatMonitor(sw, agentKeypair);
      activeSockets.set(key, ws);
      console.log(`[agent] Started monitor for new switch ${sw.switchId}`);
    }
  }, POLL_INTERVAL_MS);

  console.log(`[agent] Running. Checking conditions every ${POLL_INTERVAL_MS / 1000}s.`);
}

main().catch((err) => {
  console.error("Fatal agent error:", err);
  process.exit(1);
});
