import { NextRequest, NextResponse } from "next/server";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { verifyClaimCode } from "../../../../agent/bot-state";
import idl from "../../../idl/dead_mans_switch.json";

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID ?? "E1iZrmw5sykSVijJ91bzV7z9dLtGR9j7sSWbbYUPe18F"
);
const RPC = process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";

function loadAgentKeypair(): Keypair {
  if (process.env.AGENT_KEYPAIR_JSON) {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(process.env.AGENT_KEYPAIR_JSON)));
  }
  const walletPath =
    process.env.AGENT_KEYPAIR_PATH ??
    path.join(process.env.HOME!, ".config/solana/id.json");
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));
}

/**
 * GET /api/claim?code=<claimCode>
 * Returns switch details for the claim page without marking the code used.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  // Peek without consuming — query directly
  const { default: Database } = await import("better-sqlite3");
  const dbPath = path.join(process.cwd(), "agent", "bot-state.db");

  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: "Claim database not found" }, { status: 404 });
  }

  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare(
    "SELECT switch_id, beneficiary_email, expires_at, used FROM claim_codes WHERE code = ?"
  ).get(code) as any;
  db.close();

  if (!row) return NextResponse.json({ error: "Invalid claim code" }, { status: 404 });
  if (row.used) return NextResponse.json({ error: "This claim code has already been used" }, { status: 410 });
  if (row.expires_at < Date.now()) return NextResponse.json({ error: "Claim code has expired" }, { status: 410 });

  return NextResponse.json({
    switchId: row.switch_id,
    beneficiaryEmail: row.beneficiary_email,
    expiresAt: row.expires_at,
  });
}

/**
 * POST /api/claim
 * Body: { code, walletAddress }
 * Verifies the claim code, calls claim_beneficiary on-chain, marks code used.
 */
export async function POST(req: NextRequest) {
  try {
    const { code, walletAddress } = await req.json();

    if (!code || !walletAddress) {
      return NextResponse.json({ error: "code and walletAddress are required" }, { status: 400 });
    }

    const claim = verifyClaimCode(code);
    if (!claim) {
      return NextResponse.json({ error: "Invalid, expired, or already-used claim code" }, { status: 401 });
    }

    const agentKeypair = loadAgentKeypair();
    const connection = new Connection(RPC, "confirmed");
    const provider = new anchor.AnchorProvider(
      connection,
      { publicKey: agentKeypair.publicKey, signTransaction: async (tx: any) => { tx.partialSign(agentKeypair); return tx; }, signAllTransactions: async (txs: any[]) => txs.map(tx => { tx.partialSign(agentKeypair); return tx; }) } as any,
      { commitment: "confirmed" }
    );
    const program = new anchor.Program(idl as any, provider);

    const beneficiaryPubkey = new PublicKey(walletAddress);
    const switchId = new anchor.BN(claim.switchId);

    // Derive the switch PDA — we need the owner pubkey for this
    // Fetch from chain by scanning switches owned by this program
    const allSwitches = await (program.account as any).switch.all();
    const sw = allSwitches.find(
      (s: any) => s.account.switchId.toString() === claim.switchId
    );

    if (!sw) {
      return NextResponse.json({ error: "Switch not found on-chain" }, { status: 404 });
    }

    const sig = await (program.methods as any)
      .claimBeneficiary(switchId)
      .accounts({
        switch: sw.publicKey,
        beneficiary: beneficiaryPubkey,
        owner: sw.account.owner,
        watcher: agentKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([agentKeypair])
      .rpc();

    return NextResponse.json({
      success: true,
      signature: sig,
      explorerUrl: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    });
  } catch (err: any) {
    console.error("[claim]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
