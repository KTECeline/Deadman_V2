use anchor_lang::prelude::*;
use crate::state::Switch;
use crate::errors::SwitchError;

/// Fires the switch when the beneficiary wallet is not yet known (Pubkey::default).
/// Funds stay locked in the PDA; is_executed is set so the agent knows to send
/// the claim email. Once the beneficiary provides a wallet, the agent calls
/// claim_beneficiary to complete the transfer and close the account.
#[derive(Accounts)]
#[instruction(switch_id: u64)]
pub struct ExecuteToVault<'info> {
    #[account(
        mut,
        seeds = [b"switch", switch.owner.as_ref(), &switch_id.to_le_bytes()],
        bump = switch.bump,
    )]
    pub switch: Account<'info, Switch>,

    pub caller: Signer<'info>,
}

pub fn handler(ctx: Context<ExecuteToVault>, _switch_id: u64) -> Result<()> {
    let clock = Clock::get()?;
    let switch = &mut ctx.accounts.switch;

    require!(!switch.is_executed, SwitchError::AlreadyExecuted);
    require!(
        switch.beneficiary == Pubkey::default(),
        SwitchError::BeneficiaryAlreadySet
    );

    let elapsed = clock.unix_timestamp - switch.last_check_in;
    require!(elapsed >= switch.check_in_interval, SwitchError::SwitchNotExpired);

    switch.is_executed = true;

    msg!(
        "Switch {} executed to vault. {} lamports held pending beneficiary claim.",
        switch.switch_id,
        switch.locked_amount,
    );

    Ok(())
}
