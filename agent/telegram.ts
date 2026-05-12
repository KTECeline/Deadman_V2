/**
 * Telegram bot client — warning + alive-signal detection.
 *
 * No npm package needed: uses the Telegram Bot HTTP API directly.
 * Long-polls getUpdates on each agent cycle; persists the last offset
 * to disk so replayed messages on restart aren't treated as new replies.
 *
 * Setup:
 *   1. Message @BotFather on Telegram → /newbot → copy token to TELEGRAM_BOT_TOKEN
 *   2. Start a chat with your bot → send any message
 *   3. Visit https://api.telegram.org/bot<TOKEN>/getUpdates → copy "chat"."id"
 *   4. Add both to .env.local as TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
 */
import * as fs from "fs";
import * as path from "path";
import { getChatIdByWallet } from "./bot-state";
import {
  startConversation,
  handleConversationMessage,
  startClaimConversation,
} from "./bot-conversation";

const OFFSET_FILE = path.join(__dirname, "telegram-offset.json");

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
}

function loadOffset(): number {
  try {
    return JSON.parse(fs.readFileSync(OFFSET_FILE, "utf-8")).offset ?? 0;
  } catch {
    return 0;
  }
}

function saveOffset(offset: number): void {
  fs.writeFileSync(OFFSET_FILE, JSON.stringify({ offset }));
}

/**
 * Look up the Telegram chat_id for a given owner wallet.
 * Falls back to TELEGRAM_CHAT_ID env var for single-user / legacy setups.
 */
export function resolveChatId(ownerWallet: string): string | null {
  const fromDb = getChatIdByWallet(ownerWallet);
  if (fromDb) return fromDb;
  return process.env.TELEGRAM_CHAT_ID || null;
}

export async function sendWarning(
  chatId: string | number,
  switchId: string | bigint,
  graceDays: number
): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const text =
    `⚠️ *Dead Man's Switch — Warning*\n\n` +
    `Switch \\#${switchId} has been inactive and is scheduled to execute\\.\n\n` +
    `You have *${graceDays} day${graceDays === 1 ? "" : "s"}* to respond\\.\n\n` +
    `Reply with anything \\(e\\.g\\. "I'm alive"\\) to reset the timer\\.`;

  try {
    await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2" }),
    });
    console.log(`[telegram] ⚠️  Warning sent to chat ${chatId} for switch ${switchId}`);
  } catch (err: any) {
    console.error("[telegram] Failed to send warning:", err.message);
  }
}

export async function sendExecutionNotice(
  chatId: string | number,
  switchId: string | bigint,
  sig: string,
  lamports: bigint
): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const sol = (Number(lamports) / 1e9).toFixed(4);
  const text =
    `🔴 *Dead Man's Switch Executed*\n\n` +
    `Switch \\#${switchId} — no response received within the grace period\\.\n\n` +
    `*${sol} SOL* transferred to beneficiary\\.\n` +
    `Tx: \`${sig}\``;

  try {
    await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2" }),
    });
    console.log(`[telegram] 🔴 Execution notice sent for switch ${switchId}`);
  } catch (err: any) {
    console.error("[telegram] Failed to send execution notice:", err.message);
  }
}

export async function sendResetConfirmation(
  chatId: string | number,
  switchId: string | bigint
): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const text =
    `✅ *Timer Reset*\n\n` +
    `Got your message\\. Switch \\#${switchId} timer has been reset — you're good\\.`;

  try {
    await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2" }),
    });
  } catch (err: any) {
    console.error("[telegram] Failed to send reset confirmation:", err.message);
  }
}

/**
 * Always-on poll — responds to /start and any bot commands regardless of switch state.
 * Call this every agent loop cycle.
 */
export async function processBotCommands(): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  let offset = loadOffset();

  try {
    const res = await fetch(`${apiUrl("getUpdates")}?offset=${offset}&limit=100&timeout=0`);
    const data = (await res.json()) as any;

    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      offset = Math.max(offset, update.update_id + 1);
      const chatId = update.message?.chat?.id;
      const text = (update.message?.text ?? "").trim();

      if (!chatId) continue;

      if (text === "/start" || text.startsWith("/start ")) {
        const reply = await startConversation(String(chatId));
        await fetch(apiUrl("sendMessage"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: reply, parse_mode: "MarkdownV2" }),
        });
        console.log(`[telegram] Started onboarding conversation for chat ${chatId}`);
        continue;
      }

      if (text.startsWith("/claim ")) {
        const code = text.slice(7).trim();
        const reply = await startClaimConversation(String(chatId), code);
        if (reply) {
          await fetch(apiUrl("sendMessage"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: reply, parse_mode: "MarkdownV2" }),
          });
        }
        continue;
      }

      // Try to route to an active conversation
      const convReply = await handleConversationMessage(String(chatId), text);
      if (convReply) {
        // Internal signal for claim wallet — handled by agent caller
        if (!convReply.startsWith("__CLAIM_WALLET__")) {
          await fetch(apiUrl("sendMessage"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: convReply, parse_mode: "MarkdownV2" }),
          });
        }
      }
    }

    saveOffset(offset);
  } catch (err: any) {
    console.error("[telegram] Failed to process bot commands:", err.message);
  }
}

/**
 * Polls for new Telegram messages since `sinceMs` (unix milliseconds).
 * Returns true if any message arrived — we treat ANY message as "I'm alive."
 */
export async function checkForAliveSignal(sinceMs: number): Promise<boolean> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return false;

  let offset = loadOffset();
  let found = false;

  try {
    const res = await fetch(`${apiUrl("getUpdates")}?offset=${offset}&limit=100&timeout=0`);
    const data = (await res.json()) as any;

    if (!data.ok || !data.result?.length) return false;

    for (const update of data.result) {
      offset = Math.max(offset, update.update_id + 1);
      const text = update.message?.text ?? "";
      const msgDate = (update.message?.date ?? 0) * 1000;

      if (msgDate >= sinceMs) {
        found = true;
        console.log(
          `[telegram] Alive signal received: "${text}" ` +
          `from ${update.message?.from?.username ?? update.message?.from?.id}`
        );
      }
    }

    saveOffset(offset);
  } catch (err: any) {
    console.error("[telegram] Failed to poll updates:", err.message);
  }

  return found;
}
