/**
 * Helius websocket monitor — subscribes to the owner's wallet address.
 * Any confirmed transaction fires a heartbeat on the associated switch.
 *
 * This is the killer Solana feature: real on-chain activity (swaps, transfers,
 * staking) automatically resets the dead man's timer. No button press needed.
 */
import WebSocket from "ws";
import { Keypair } from "@solana/web3.js";
import { SwitchAccount } from "./types";
import { recordHeartbeat } from "./executor";
import { agentTxCache, agentIsBusy } from "./agent-tx-cache";

const HELIUS_WS_URL = `wss://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const DMS_PROGRAM_ID = process.env.PROGRAM_ID ?? "5VTjU3UxdPuXCgEes3BZHKU1AXYCnTU2YFF5LdWqTXJx";

// Maps owner address → activity type label heuristic
function inferActivityType(logs: string[]): string {
  const logStr = logs.join(" ").toLowerCase();
  if (logStr.includes("swap") || logStr.includes("raydium") || logStr.includes("orca")) return "dex_swap";
  if (logStr.includes("stake") || logStr.includes("delegate")) return "stake";
  if (logStr.includes("vote")) return "governance_vote";
  if (logStr.includes("transfer")) return "transfer";
  return "on_chain_activity";
}

export function startHeartbeatMonitor(
  switchAccount: SwitchAccount,
  agentKeypair: Keypair
): WebSocket {
  const ownerAddress = switchAccount.owner.toBase58();
  console.log(
    `[monitor] Watching wallet ${ownerAddress} for switch ${switchAccount.switchId}`
  );

  const ws = new WebSocket(HELIUS_WS_URL);

  ws.on("open", () => {
    // Subscribe to all transactions involving the owner's wallet
    const subscribeMsg = {
      jsonrpc: "2.0",
      id: 1,
      method: "logsSubscribe",
      params: [
        { mentions: [ownerAddress] },
        { commitment: "confirmed" },
      ],
    };
    ws.send(JSON.stringify(subscribeMsg));
    console.log(`[monitor] Subscribed to wallet ${ownerAddress}`);
  });

  ws.on("message", async (raw: WebSocket.Data) => {
    try {
      const text = raw.toString();
      if (!text.startsWith("{")) return; // ignore plain-text connection state messages
      const msg = JSON.parse(text);

      // Skip subscription confirmation messages
      if (!msg.params?.result?.value) return;

      const { logs, err, signature } = msg.params.result.value;

      // Ignore failed transactions — only real activity counts
      if (err) return;

      // Skip DMS program transactions (heartbeat, execute, check_in, etc.)
      if (logs?.some((log: string) => log.includes(DMS_PROGRAM_ID))) return;

      // Skip any transaction the agent itself sent (x402 payments, etc.)
      if (agentTxCache.has(signature)) return;

      // Skip if the agent is mid-transaction (race: ws fires before cache is populated)
      if (agentIsBusy) return;

      const activityType = inferActivityType(logs ?? []);
      console.log(
        `[monitor] Activity detected for switch ${switchAccount.switchId}: ${activityType} (tx: ${signature})`
      );

      await recordHeartbeat(switchAccount, activityType, agentKeypair);
    } catch (err) {
      console.error("[monitor] Error processing message:", err);
    }
  });

  ws.on("error", (err) => {
    console.error(`[monitor] WebSocket error for switch ${switchAccount.switchId}:`, err.message);
  });

  ws.on("close", () => {
    // Reconnect after 5s if the connection drops
    console.log(`[monitor] Connection closed for switch ${switchAccount.switchId}. Reconnecting in 5s...`);
    setTimeout(() => startHeartbeatMonitor(switchAccount, agentKeypair), 5000);
  });

  return ws;
}
