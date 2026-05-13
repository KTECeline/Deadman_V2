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

type TgUpdate = {
  update_id?: number;
  message?: {
    chat?: { id?: number };
    text?: string;
    date?: number;
    from?: { username?: string; id?: number };
  };
};

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

function esc(s: string): string {
  return String(s).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function htmlEsc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendWarning(
  chatId: string | number,
  switchId: string | bigint,
  graceDays: number,
  opts?: { amountSol?: number; beneficiaryName?: string }
): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const daysLabel = htmlEsc(`${graceDays} day${graceDays === 1 ? "" : "s"}`);
  const amountLine = opts?.amountSol
    ? `💰 <b>${htmlEsc(opts.amountSol.toFixed(4))} SOL</b> will transfer to ${htmlEsc(opts.beneficiaryName ?? "your beneficiary")}\n`
    : "";

  const text =
    `⚠️ <b>Dead Man's Switch — Warning</b>\n\n` +
    `Switch <b>#${htmlEsc(String(switchId))}</b> has expired — no wallet activity detected.\n\n` +
    amountLine +
    `⏳ You have <b>${daysLabel}</b> to respond before funds are sent.\n\n` +
    `<b>Reply with anything</b> (e.g. &quot;I'm alive&quot;) to reset the timer.`;

  const replyMarkup = {
    inline_keyboard: [[{ text: "🔍 Open Dashboard", url: `${appBase}/switches` }]],
  };

  try {
    const res = await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup: replyMarkup }),
    });
    const responseText = await res.text();
    if (!res.ok) {
      throw new Error(`Telegram sendMessage failed (${res.status}): ${responseText}`);
    }
    console.log(`[telegram] ⚠️  Warning sent to chat ${chatId} for switch ${switchId}`);
  } catch (err: unknown) {
    console.error("[telegram] Failed to send warning:", err instanceof Error ? err.message : err);
  }
}

export async function sendExecutionNotice(
  chatId: string | number,
  switchId: string | bigint,
  sig: string,
  lamports: bigint,
  opts?: { beneficiaryName?: string; beneficiaryEmail?: string }
): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const sol = esc((Number(lamports) / 1e9).toFixed(4));
  const explorerUrl = `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  const recipientLine = opts?.beneficiaryName
    ? `👤 *Recipient:* ${esc(opts.beneficiaryName)}\n`
    : "";
  const emailLine = opts?.beneficiaryEmail
    ? `📧 Notification sent to ${esc(opts.beneficiaryEmail)}\n`
    : "";

  const text =
    `🔴 *Switch Executed*\n\n` +
    `Switch *\\#${esc(String(switchId))}* has fired — no check\\-in received\\.\n\n` +
    `💰 *${sol} SOL* transferred to beneficiary\n` +
    recipientLine +
    emailLine +
    `\n[View on Solana Explorer](${explorerUrl})`;

  try {
    await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2" }),
    });
    console.log(`[telegram] 🔴 Execution notice sent for switch ${switchId}`);
  } catch (err: unknown) {
    console.error("[telegram] Failed to send execution notice:", err instanceof Error ? err.message : err);
  }
}

export async function sendResetConfirmation(
  chatId: string | number,
  switchId: string | bigint
): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const text =
    `✅ *Timer Reset*\n\n` +
    `Got your signal\\. Switch *\\#${esc(String(switchId))}* is back to active monitoring\\.\n\n` +
    `Stay alive out there\\.`;

  try {
    await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2" }),
    });
  } catch (err: unknown) {
    console.error("[telegram] Failed to send reset confirmation:", err instanceof Error ? err.message : err);
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
    const maybe = (await res.json()) as { ok?: boolean; result?: TgUpdate[] } | null;

    if (!maybe?.ok || !maybe?.result?.length) return;

    for (const update of maybe.result) {
      offset = Math.max(offset, (update.update_id ?? 0) + 1);
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[telegram] Failed to process bot commands:", msg);
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
    const maybe = (await res.json()) as { ok?: boolean; result?: TgUpdate[] } | null;

    if (!maybe?.ok || !maybe?.result?.length) return false;

    for (const update of maybe.result) {
      offset = Math.max(offset, (update.update_id ?? 0) + 1);
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[telegram] Failed to poll updates:", msg);
  }

  return found;
}
