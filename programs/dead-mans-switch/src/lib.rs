use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

// Placeholder ID — run `anchor keys sync` after `anchor build` to update this automatically
declare_id!("E1iZrmw5sykSVijJ91bzV7z9dLtGR9j7sSWbbYUPe18F");

#[program]
pub mod dead_mans_switch {
    use super::*;

    pub fn create_switch(
        ctx: Context<CreateSwitch>,
        switch_id: u64,
        check_in_interval: i64,
        locked_amount: u64,
        beneficiary: Pubkey,
        watcher: Pubkey,
    ) -> Result<()> {
        instructions::create_switch::handler(ctx, switch_id, check_in_interval, locked_amount, beneficiary, watcher)
    }

    pub fn check_in(ctx: Context<CheckIn>, switch_id: u64) -> Result<()> {
        instructions::check_in::handler(ctx, switch_id)
    }

    pub fn execute(ctx: Context<Execute>, switch_id: u64) -> Result<()> {
        instructions::execute::handler(ctx, switch_id)
    }

    pub fn cancel(ctx: Context<Cancel>, switch_id: u64) -> Result<()> {
        instructions::cancel::handler(ctx, switch_id)
    }

    pub fn link_cnft(ctx: Context<LinkCnft>, switch_id: u64, asset_id: Pubkey) -> Result<()> {
        instructions::link_cnft::handler(ctx, switch_id, asset_id)
    }

    pub fn heartbeat(ctx: Context<Heartbeat>, switch_id: u64, activity_type: String) -> Result<()> {
        instructions::heartbeat::handler(ctx, switch_id, activity_type)
    }

    pub fn execute_to_vault(ctx: Context<ExecuteToVault>, switch_id: u64) -> Result<()> {
        instructions::execute_to_vault::handler(ctx, switch_id)
    }

    pub fn claim_beneficiary(ctx: Context<ClaimBeneficiary>, switch_id: u64) -> Result<()> {
        instructions::claim_beneficiary::handler(ctx, switch_id)
    }
}
