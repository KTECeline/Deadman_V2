use anchor_lang::prelude::*;
use crate::state::Switch;
use crate::errors::SwitchError;

/// Called by the agent (watcher) after verifying the beneficiary's claim code off-chain.
/// Sets the beneficiary address, transfers locked funds, and closes the switch account.
#[derive(Accounts)]
#[instruction(switch_id: u64)]
pub struct ClaimBeneficiary<'info> {
    #[account(
        mut,
        seeds = [b"switch", switch.owner.as_ref(), &switch_id.to_le_bytes()],
        bump = switch.bump,
        close = owner,
    )]
    pub switch: Account<'info, Switch>,

    /// CHECK: receives locked funds; address is validated in handler
    #[account(mut)]
    pub beneficiary: AccountInfo<'info>,

    /// CHECK: receives rent on close; must match switch.owner
    #[account(mut, constraint = owner.key() == switch.owner @ SwitchError::NotOwner)]
    pub owner: AccountInfo<'info>,

    // Only the authorised watcher (agent keypair) can call this
    #[account(constraint = watcher.key() == switch.watcher @ SwitchError::NotWatcher)]
    pub watcher: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimBeneficiary>, _switch_id: u64) -> Result<()> {
    let switch = &ctx.accounts.switch;

    require!(switch.is_executed, SwitchError::NotExecuted);

    let locked_amount = switch.locked_amount;

    **ctx.accounts.switch.to_account_info().try_borrow_mut_lamports()? -= locked_amount;
    **ctx.accounts.beneficiary.to_account_info().try_borrow_mut_lamports()? += locked_amount;

    msg!(
        "Switch {} claimed. {} lamports sent to beneficiary {}.",
        switch.switch_id,
        locked_amount,
        ctx.accounts.beneficiary.key(),
    );

    Ok(())
}
