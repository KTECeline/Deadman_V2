import { Connection, PublicKey } from "@solana/web3.js";
import { resolve, reverseLookup } from "@bonfida/spl-name-service";

// Forward lookup: "alice.sol" → PublicKey, null if not found
export async function resolveSolName(
  name: string,
  connection: Connection
): Promise<PublicKey | null> {
  try {
    const domain = name.toLowerCase().replace(/\.sol$/, "");
    const pubkey = await resolve(connection, domain);
    return pubkey;
  } catch {
    return null;
  }
}

// Reverse lookup: PublicKey → "alice.sol", null if no domain registered
export async function lookupSolName(
  pubkey: PublicKey,
  connection: Connection
): Promise<string | null> {
  try {
    const domain = await reverseLookup(connection, pubkey);
    return domain ? `${domain}.sol` : null;
  } catch {
    return null;
  }
}

// If input ends with ".sol" resolve it; otherwise parse as raw base58 address
export async function resolveOrPassthrough(
  input: string,
  connection: Connection
): Promise<PublicKey> {
  if (input.toLowerCase().endsWith(".sol")) {
    const resolved = await resolveSolName(input, connection);
    if (!resolved) throw new Error(`Could not resolve .sol name: ${input}`);
    return resolved;
  }
  return new PublicKey(input);
}
