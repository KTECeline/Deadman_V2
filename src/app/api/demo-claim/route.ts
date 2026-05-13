import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { sendClaimEmail } from "../../../../agent/email";

/**
 * POST /api/demo-claim
 * Body: { switchId, amount, beneficiaryEmail, beneficiaryName, ownerName }
 * Creates a claim code and emails it to the beneficiary.
 */
export async function POST(req: NextRequest) {
  try {
    const { switchId, amount, beneficiaryEmail, beneficiaryName, ownerName } = await req.json();

    const { default: Database } = await import("better-sqlite3");
    const dbPath = path.join(process.cwd(), "agent", "bot-state.db");

    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 });
    }

    const db = new Database(dbPath);

    // Ensure amount column exists
    try {
      db.prepare("ALTER TABLE claim_codes ADD COLUMN amount REAL").run();
    } catch {
      // Column already exists
    }

    const code = crypto.randomBytes(12).toString("hex");
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

    db.prepare(
      "INSERT INTO claim_codes (code, switch_id, beneficiary_email, expires_at, amount) VALUES (?, ?, ?, ?, ?)"
    ).run(code, String(switchId), beneficiaryEmail || "demo@test.com", expiresAt, amount || 0);

    db.close();

    // Send claim email to beneficiary
    let emailSent = false;
    if (beneficiaryEmail) {
      try {
        await sendClaimEmail(
          beneficiaryEmail,
          ownerName || "Someone",
          amount || 0,
          code
        );
        emailSent = true;
      } catch (err: any) {
        console.error("[demo-claim] Email failed:", err.message);
      }
    }

    return NextResponse.json({
      code,
      claimUrl: `/claim?code=${code}`,
      emailSent,
    });
  } catch (err: any) {
    console.error("[demo-claim]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
