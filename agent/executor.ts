import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { SwitchAccount } from "./types";
import { agentTxCache } from "./agent-tx-cache";
import { loadProgram } from "./program";

const DEFAULT_PUBKEY = PublicKey.default.toBase58();

/**
 * Execute a switch. If the beneficiary is unset (Pubkey::default), calls
 * execute_to_vault so funds stay in the PDA pending a claim email flow.
 * Otherwise calls execute directly to transfer funds immediately.
 */
export async function executeSwitch(
  switchAccount: SwitchAccount,
  agentKeypair: Keypair
): Promise<string> {
  const program = loadProgram(agentKeypair);
  const switchId = new anchor.BN(switchAccount.switchId.toString());

  const beneficiaryIsUnset =
    !switchAccount.beneficiary ||
    switchAccount.beneficiary.toBase58() === DEFAULT_PUBKEY;

  if (beneficiaryIsUnset) {
    return executeToVault(switchAccount, agentKeypair);
  }

  const sig = await (program.methods as any)
    .execute(switchId)
    .accounts({
      switch: switchAccount.publicKey,
      beneficiary: switchAccount.beneficiary,
      owner: switchAccount.owner,
      caller: agentKeypair.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  agentTxCache.add(sig);
  console.log(`[executor] Switch ${switchAccount.switchId} executed. Sig: ${sig}`);
  return sig;
}

/**
 * Fires the switch when beneficiary is not yet set.
 * Funds stay in the PDA; agent sends claim email to beneficiary.
 */
export async function executeToVault(
  switchAccount: SwitchAccount,
  agentKeypair: Keypair
): Promise<string> {
  const program = loadProgram(agentKeypair);
  const switchId = new anchor.BN(switchAccount.switchId.toString());

  const sig = await (program.methods as any)
    .executeToVault(switchId)
    .accounts({
      switch: switchAccount.publicKey,
      caller: agentKeypair.publicKey,
    })
    .rpc();

  agentTxCache.add(sig);
  console.log(
    `[executor] Switch ${switchAccount.switchId} executed to vault (beneficiary unset). Sig: ${sig}`
  );
  return sig;
}

/**
 * Called after the beneficiary provides their wallet address via the claim flow.
 * Transfers locked funds to the beneficiary and closes the switch account.
 */
export async function claimBeneficiary(
  switchAccount: SwitchAccount,
  beneficiaryPubkey: PublicKey,
  agentKeypair: Keypair
): Promise<string> {
  const program = loadProgram(agentKeypair);
  const switchId = new anchor.BN(switchAccount.switchId.toString());

  const sig = await (program.methods as any)
    .claimBeneficiary(switchId)
    .accounts({
      switch: switchAccount.publicKey,
      beneficiary: beneficiaryPubkey,
      owner: switchAccount.owner,
      watcher: agentKeypair.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  agentTxCache.add(sig);
  console.log(
    `[executor] Beneficiary claimed switch ${switchAccount.switchId}. Sent to ${beneficiaryPubkey.toBase58()}. Sig: ${sig}`
  );
  return sig;
}

export async function recordHeartbeat(
  switchAccount: SwitchAccount,
  activityType: string,
  agentKeypair: Keypair
): Promise<string> {
  const program = loadProgram(agentKeypair);

  const switchId = new anchor.BN(switchAccount.switchId.toString());

  const sig = await (program.methods as any)
    .heartbeat(switchId, activityType)
    .accounts({
      switch: switchAccount.publicKey,
      watcher: agentKeypair.publicKey,
    })
    .rpc();

  agentTxCache.add(sig);
  console.log(
    `[executor] Heartbeat recorded for switch ${switchAccount.switchId}. Activity: ${activityType}. Sig: ${sig}`
  );
  return sig;
}
