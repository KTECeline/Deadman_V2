use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::Switch;
use crate::errors::SwitchError;

#[derive(Accounts)]
#[instruction(switch_id: u64)]
pub struct CreateSwitch<'info> {
    #[account(
        init,
        payer = owner,
        space = Switch::LEN,
        seeds = [b"switch", owner.key().as_ref(), &switch_id.to_le_bytes()],
        bump,
    )]
    pub switch: Account<'info, Switch>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateSwitch>,
    switch_id: u64,
    check_in_interval: i64,
    locked_amount: u64,
    beneficiary: Pubkey,
    watcher: Pubkey,
) -> Result<()> {
    require!(check_in_interval > 0, SwitchError::InvalidInterval);
    require!(locked_amount > 0, SwitchError::InvalidAmount);

    let clock = Clock::get()?;
    let switch = &mut ctx.accounts.switch;

    switch.owner = ctx.accounts.owner.key();
    switch.beneficiary = beneficiary;
    switch.check_in_interval = check_in_interval;
    switch.last_check_in = clock.unix_timestamp;
    switch.locked_amount = locked_amount;
    switch.switch_id = switch_id;
    switch.bump = ctx.bumps.switch;
    switch.cnft_asset_id = Pubkey::default(); // set after minting via link_cnft
    switch.watcher = watcher;
    switch.last_activity_type = [0u8; 32];
    switch.is_executed = false;

    // Transfer locked_amount from owner into the switch account.
    // system_program::transfer can send to any account (including program-owned PDAs)
    // as long as the sender is the signer.
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.switch.to_account_info(),
            },
        ),
        locked_amount,
    )?;

    msg!(
        "Switch {} created. Beneficiary: {}. Interval: {}s. Locked: {} lamports. Watcher: {}.",
        switch_id,
        beneficiary,
        check_in_interval,
        locked_amount,
        watcher
    );

    Ok(())
}
