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
import { createClaimCode, getSwitchEmail } from "./bot-state";
import { sendClaimEmail, sendExecutionEmail } from "./email";
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
  const switches = await fetchActiveSwitches(program);
  console.log(`\n[agent] Checking ${switches.length} active switch(es)...`);

  for (const sw of switches) {
    const key = sw.publicKey.toBase58();
    if (executedSwitches.has(key)) continue;

    // Only act on switches where this agent is the authorized watcher
    if (sw.watcher.toBase58() !== agentKeypair.publicKey.toBase58()) {
      console.log(`[agent] Switch ${sw.switchId}: skipping — watcher ${sw.watcher.toBase58()} !== agent ${agentKeypair.publicKey.toBase58()}`);
      continue;
    }

    const result = evaluateTimeCondition(sw);
    console.log(`[agent] Switch ${sw.switchId}: ${result.reason}`);

    if (result.shouldExecute) {
      const grace = getGracePeriod(sw.switchId);
      const chatId = resolveChatId(sw.owner.toBase58());

      if (!grace) {
        // First expiry — send warning and start grace period
        const emailRec = getSwitchEmail(sw.switchId.toString());
        if (chatId) {
          await sendWarning(chatId, sw.switchId, GRACE_PERIOD_DAYS, {
            amountSol: Number(sw.lockedAmount) / 1e9,
            beneficiaryName: emailRec?.name ?? undefined,
          });
        } else {
          console.warn(
            `[agent] ⚠️  Switch ${sw.switchId} expired but no Telegram chat is linked for owner ${sw.owner.toBase58()}`
          );
        }
        startGracePeriod(sw.switchId, chatId ?? "");
        console.log(
          `[agent] ⚠️  Switch ${sw.switchId} expired — grace period started ` +
          `(${GRACE_PERIOD_DAYS}d).${chatId ? " Telegram warning sent." : " Telegram warning skipped."}`
        );
      } else if (isGraceExpired(grace, GRACE_PERIOD_MS)) {
        // Grace period over — execute
        console.log(`[agent] 🔴 Executing switch ${sw.switchId} (grace period elapsed)...`);
        try {
          const sig = await executeSwitch(sw, agentKeypair);
          executedSwitches.add(key);
          const emailRec2 = getSwitchEmail(sw.switchId.toString());
          if (chatId) await sendExecutionNotice(chatId, sw.switchId, sig, sw.lockedAmount, {
            beneficiaryName: emailRec2?.name ?? undefined,
            beneficiaryEmail: emailRec2?.email,
          });
          clearGracePeriod(sw.switchId);
          console.log(`[agent] ✅ Switch ${sw.switchId} executed. Sig: ${sig}`);

          // Email the beneficiary using address stored at switch creation time
          if (process.env.RESEND_API_KEY) {
            const emailRecord = getSwitchEmail(sw.switchId.toString());
            if (emailRecord) {
              const amountSol = Number(sw.lockedAmount) / 1e9;
              const ownerShort = sw.owner.toBase58().slice(0, 8);
              const beneficiaryIsUnset =
                sw.beneficiary.toBase58() === anchor.web3.PublicKey.default.toBase58();

              if (beneficiaryIsUnset) {
                const claimCode = createClaimCode(sw.switchId.toString(), emailRecord.email);
                await sendClaimEmail(emailRecord.email, ownerShort, amountSol, claimCode);
                console.log(`[agent] 📧 Claim email sent to ${emailRecord.email}`);
              } else {
                await sendExecutionEmail(emailRecord.email, ownerShort, amountSol, sig);
                console.log(`[agent] 📧 Execution notice sent to ${emailRecord.email}`);
              }
            } else {
              console.log(`[agent] No email registered for switch ${sw.switchId} — skipping email`);
            }
          }
        } catch (err: any) {
          if (err.message?.includes("SwitchNotExpired")) {
            // On-chain interval hasn't elapsed yet (e.g. DEMO_TRIGGER_SECONDS shorter than real interval)
            // Clear the grace period so we don't retry until the switch naturally expires on-chain
            clearGracePeriod(sw.switchId);
            console.warn(
              `[agent] ⚠️  Switch ${sw.switchId} — on-chain interval not yet elapsed. ` +
              `Grace period cleared. Delete and recreate with NEXT_PUBLIC_DEMO_TRIGGER_SECONDS set.`
            );
          } else {
            console.error(`[agent] ❌ Execute failed for switch ${sw.switchId}:`, err.message);
          }
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

  console.log(`[agent] Wallet: ${agentKeypair.publicKey.toBase58()}`);
  console.log(`[agent] Program: ${program.programId.toBase58()}`);


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

  // Dedicated bot polling loop — 2s interval, guarded to prevent concurrent runs
  let botBusy = false;
  setInterval(async () => {
    if (botBusy) return;
    botBusy = true;
    try { await processBotCommands(); } catch (e) { console.error("[bot] processBotCommands error:", e); }
    finally { botBusy = false; }
  }, 2_000);

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
