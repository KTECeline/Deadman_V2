import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

export function loadProgram(keypair: Keypair): anchor.Program {
  const connection = new Connection(
    process.env.HELIUS_RPC_URL ?? clusterApiUrl("devnet"),
    "confirmed"
  );
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    { commitment: "confirmed" }
  );
  const idl = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "src/idl/dead_mans_switch.json"),
      "utf-8"
    )
  );
  return new anchor.Program(idl, provider);
}
