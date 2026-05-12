/**
 * Mints a cNFT "instruction scroll" for a switch via Metaplex Bubblegum,
 * then calls link_cnft to record the asset ID on the PDA.
 *
 * Usage (called by the agent after create_switch succeeds):
 *   import { mintSwitchNft } from "./mint-cnft";
 *   const assetId = await mintSwitchNft({ switchId, switchPda, owner, beneficiary, checkInInterval, createdAt });
 */
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplBubblegum,
  mintV1,
  findLeafAssetIdPda,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  keypairIdentity,
  publicKey as umiPublicKey,
  none,
} from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair, toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

export interface SwitchNftParams {
  switchId: bigint;
  switchPda: string;
  owner: string;
  beneficiary: string;
  beneficiaryEmail?: string; // stored on-chain in cNFT URI — agent reads this on execution
  beneficiaryName?: string;
  checkInInterval: number;   // seconds
  createdAt: number;         // unix timestamp
}

function buildMetadataUri(params: SwitchNftParams): string {
  const metadata = {
    name: `Dead Man's Switch #${params.switchId}`,
    symbol: "DMS",
    description: "An autonomous on-chain executor — this NFT is the instruction scroll for a Dead Man's Switch vault.",
    image: "https://raw.githubusercontent.com/your-repo/dead-mans-switch/main/assets/logo.png",
    attributes: [
      { trait_type: "Switch ID",                value: params.switchId.toString() },
      { trait_type: "PDA Address",              value: params.switchPda },
      { trait_type: "Beneficiary",              value: params.beneficiary },
      { trait_type: "Beneficiary Email",        value: params.beneficiaryEmail ?? "" },
      { trait_type: "Beneficiary Name",         value: params.beneficiaryName ?? "" },
      { trait_type: "Check-in Interval (sec)",  value: params.checkInInterval },
      { trait_type: "Trigger Type",             value: "time-based" },
      { trait_type: "Created At",               value: new Date(params.createdAt * 1000).toISOString() },
    ],
    properties: {
      category: "utility",
      // beneficiary_email stored here for agent to read on execution
      beneficiary_email: params.beneficiaryEmail ?? "",
      beneficiary_name: params.beneficiaryName ?? "",
    },
  };

  return (
    "data:application/json;base64," +
    Buffer.from(JSON.stringify(metadata)).toString("base64")
  );
}

export async function mintSwitchNft(params: SwitchNftParams): Promise<string> {
  const merkleTreeAddress = process.env.MERKLE_TREE_ADDRESS;
  if (!merkleTreeAddress) throw new Error("MERKLE_TREE_ADDRESS not set in env");

  // --- Umi setup ---
  const umi = createUmi("https://api.devnet.solana.com").use(mplBubblegum());
  const walletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const walletJson = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(new Uint8Array(walletJson));
  umi.use(keypairIdentity(fromWeb3JsKeypair(keypair)));

  // --- Mint cNFT ---
  const uri = buildMetadataUri(params);

  const { signature, result } = await mintV1(umi, {
    leafOwner: umiPublicKey(params.owner),
    merkleTree: umiPublicKey(merkleTreeAddress),
    metadata: {
      name: `Dead Man's Switch #${params.switchId}`,
      symbol: "DMS",
      uri,
      sellerFeeBasisPoints: 0,
      collection: none(),
      creators: [],
    },
  }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

  // Derive the asset ID from the noop inner instruction.
  // SPL Account Compression emits the change log via the noop program;
  // the leaf index is a u64 at bytes 40-47 of the noop instruction data
  // (after 8-byte discriminator, 32-byte root).
  const noopProgramId = "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV";
  const innerInstructions = (result as any)?.value?.meta?.innerInstructions ?? [];
  let leafIndex: bigint = BigInt(0);
  outer: for (const group of innerInstructions) {
    for (const ix of group.instructions ?? []) {
      if (ix.programId?.toString() === noopProgramId && ix.data) {
        const buf = Buffer.from(ix.data, "base64");
        if (buf.length >= 48) {
          leafIndex = buf.readBigUInt64LE(40) as unknown as bigint;
          break outer;
        }
      }
    }
  }

  const [assetIdPda] = findLeafAssetIdPda(umi, {
    merkleTree: umiPublicKey(merkleTreeAddress),
    leafIndex,
  });
  const assetId = assetIdPda.toString();
  console.log(`cNFT minted. Asset ID: ${assetId}`);

  // --- Link cNFT to PDA via Anchor ---
  await linkCnftToPda(params, assetId, keypair);

  return assetId;
}

async function linkCnftToPda(
  params: SwitchNftParams,
  assetId: string,
  keypair: Keypair
): Promise<void> {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const idl = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../target/idl/dead_mans_switch.json"),
      "utf-8"
    )
  );

  const programId = new PublicKey(
    process.env.PROGRAM_ID ?? idl.address
  );
  const program = new anchor.Program(idl, provider);

  await (program.methods as any)
    .linkCnft(new anchor.BN(params.switchId.toString()), new PublicKey(assetId))
    .accounts({
      switch: new PublicKey(params.switchPda),
      owner: keypair.publicKey,
    })
    .rpc();

  console.log(`PDA ${params.switchPda} linked to cNFT ${assetId}`);
}
