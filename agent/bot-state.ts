import Database from "better-sqlite3";
import * as path from "path";
import * as crypto from "crypto";

const DB_PATH = path.join(process.env.DATA_DIR ?? __dirname, "bot-state.db");
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS activated_switches (
    switch_id    TEXT PRIMARY KEY,
    owner_wallet TEXT NOT NULL,
    activated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS owners (
    chat_id     TEXT PRIMARY KEY,
    wallet      TEXT NOT NULL,
    auth_code   TEXT,
    code_expiry INTEGER,
    created_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_owners_wallet ON owners(wallet);

  CREATE TABLE IF NOT EXISTS conversations (
    chat_id TEXT PRIMARY KEY,
    step    TEXT NOT NULL,
    data    TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS claim_codes (
    code              TEXT PRIMARY KEY,
    switch_id         TEXT NOT NULL,
    beneficiary_email TEXT NOT NULL,
    expires_at        INTEGER NOT NULL,
    used              INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS switch_emails (
    switch_id         TEXT PRIMARY KEY,
    beneficiary_email TEXT NOT NULL,
    beneficiary_name  TEXT,
    registered_at     INTEGER NOT NULL
  );
`);

// ── Owners ───────────────────────────────────────────────────────────────────

export function linkWallet(chatId: string, wallet: string) {
  db.prepare(`
    INSERT INTO owners (chat_id, wallet, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET wallet = excluded.wallet
  `).run(chatId, wallet, Date.now());
}

export function getChatIdByWallet(wallet: string): string | null {
  const row = db.prepare("SELECT chat_id FROM owners WHERE wallet = ?").get(wallet) as any;
  return row?.chat_id ?? null;
}

export function getWalletByChatId(chatId: string): string | null {
  const row = db.prepare("SELECT wallet FROM owners WHERE chat_id = ?").get(chatId) as any;
  return row?.wallet ?? null;
}

export function generateAuthCode(chatId: string): string {
  const code = crypto.randomBytes(8).toString("hex");
  const expiry = Date.now() + 15 * 60 * 1000; // 15 min
  db.prepare(`
    INSERT INTO owners (chat_id, wallet, auth_code, code_expiry, created_at)
    VALUES (?, '', ?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET auth_code = excluded.auth_code, code_expiry = excluded.code_expiry
  `).run(chatId, code, expiry, Date.now());
  return code;
}

export function verifyAuthCode(code: string, walletPubkey: string): string | null {
  const row = db.prepare(
    "SELECT chat_id FROM owners WHERE auth_code = ? AND code_expiry > ?"
  ).get(code, Date.now()) as any;
  if (!row) return null;
  db.prepare(
    "UPDATE owners SET wallet = ?, auth_code = NULL, code_expiry = NULL WHERE chat_id = ?"
  ).run(walletPubkey, row.chat_id);
  return row.chat_id;
}

// ── Conversations ─────────────────────────────────────────────────────────────

export type ConversationStep =
  | "use_case"
  | "grace_period"
  | "amount"
  | "beneficiary_name"
  | "beneficiary_email"
  | "confirm"
  | "claim_wallet"
  | "idle";

export interface ConversationData {
  useCase?: string;
  graceDays?: number;
  amountSol?: number;
  beneficiaryName?: string;
  beneficiaryEmail?: string;
  // claim flow
  claimCode?: string;
  switchId?: string;
}

export function getConversation(chatId: string): { step: ConversationStep; data: ConversationData } | null {
  const row = db.prepare("SELECT step, data FROM conversations WHERE chat_id = ?").get(chatId) as any;
  if (!row) return null;
  return { step: row.step as ConversationStep, data: JSON.parse(row.data) };
}

export function setConversation(chatId: string, step: ConversationStep, data: ConversationData) {
  db.prepare(`
    INSERT INTO conversations (chat_id, step, data)
    VALUES (?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET step = excluded.step, data = excluded.data
  `).run(chatId, step, JSON.stringify(data));
}

export function clearConversation(chatId: string) {
  db.prepare("DELETE FROM conversations WHERE chat_id = ?").run(chatId);
}

// ── Claim codes ───────────────────────────────────────────────────────────────

export function createClaimCode(switchId: string, beneficiaryEmail: string): string {
  const code = crypto.randomBytes(12).toString("hex");
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  db.prepare(
    "INSERT INTO claim_codes (code, switch_id, beneficiary_email, expires_at) VALUES (?, ?, ?, ?)"
  ).run(code, switchId, beneficiaryEmail, expiresAt);
  return code;
}

export function verifyClaimCode(code: string): { switchId: string; beneficiaryEmail: string } | null {
  const row = db.prepare(
    "SELECT switch_id, beneficiary_email FROM claim_codes WHERE code = ? AND used = 0 AND expires_at > ?"
  ).get(code, Date.now()) as any;
  if (!row) return null;
  db.prepare("UPDATE claim_codes SET used = 1 WHERE code = ?").run(code);
  return { switchId: row.switch_id, beneficiaryEmail: row.beneficiary_email };
}

// ── Activated switches ────────────────────────────────────────────────────────

export function activateSwitch(switchId: string, ownerWallet: string): void {
  db.prepare(`
    INSERT INTO activated_switches (switch_id, owner_wallet, activated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(switch_id) DO NOTHING
  `).run(switchId, ownerWallet, Date.now());
}

export function isSwitchActivated(switchId: string): boolean {
  const row = db.prepare(
    "SELECT 1 FROM activated_switches WHERE switch_id = ?"
  ).get(switchId) as any;
  return !!row;
}

// ── Switch email registry ─────────────────────────────────────────────────────

export function registerSwitchEmail(
  switchId: string,
  beneficiaryEmail: string,
  beneficiaryName?: string
): void {
  db.prepare(`
    INSERT INTO switch_emails (switch_id, beneficiary_email, beneficiary_name, registered_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(switch_id) DO UPDATE SET
      beneficiary_email = excluded.beneficiary_email,
      beneficiary_name  = excluded.beneficiary_name
  `).run(switchId, beneficiaryEmail, beneficiaryName ?? null, Date.now());
}

export function getSwitchEmail(
  switchId: string
): { email: string; name: string | null } | null {
  const row = db.prepare(
    "SELECT beneficiary_email, beneficiary_name FROM switch_emails WHERE switch_id = ?"
  ).get(switchId) as any;
  if (!row) return null;
  return { email: row.beneficiary_email, name: row.beneficiary_name };
}
