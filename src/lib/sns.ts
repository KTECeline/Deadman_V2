import { clusterApiUrl, Connection } from "@solana/web3.js";

function getConnection(): Connection {
  const rpc =
    process.env.NEXT_PUBLIC_HELIUS_RPC_URL ??
    (process.env.NEXT_PUBLIC_NETWORK === "mainnet-beta"
      ? clusterApiUrl("mainnet-beta")
      : clusterApiUrl("devnet"));
  return new Connection(rpc, "confirmed");
}

// Forward lookup: "alice.sol" → base58 address, null if not found
export async function resolveSolName(name: string): Promise<string | null> {
  try {
    const { resolve } = await import("@bonfida/spl-name-service");
    const domain = name.toLowerCase().replace(/\.sol$/, "");
    const pubkey = await resolve(getConnection(), domain);
    return pubkey.toBase58();
  } catch {
    return null;
  }
}

// Reverse lookup: base58 address → "alice.sol", null if no domain registered
export async function lookupSolName(address: string): Promise<string | null> {
  try {
    const { reverseLookup } = await import("@bonfida/spl-name-service");
    const { PublicKey } = await import("@solana/web3.js");
    const domain = await reverseLookup(getConnection(), new PublicKey(address));
    return domain ? `${domain}.sol` : null;
  } catch {
    return null;
  }
}

// If input ends with ".sol" resolve it; otherwise return as-is
export async function resolveOrPassthrough(input: string): Promise<string> {
  if (input.toLowerCase().endsWith(".sol")) {
    const resolved = await resolveSolName(input);
    if (!resolved) throw new Error(`Could not resolve .sol name: ${input}`);
    return resolved;
  }
  return input;
}
