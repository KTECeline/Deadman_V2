use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
pub struct Switch {
    pub owner: Pubkey,          // 32
    pub beneficiary: Pubkey,    // 32
    pub check_in_interval: i64, // 8  — seconds between required check-ins
    pub last_check_in: i64,     // 8  — unix timestamp of last check-in
    pub locked_amount: u64,     // 8  — lamports held for beneficiary
    pub switch_id: u64,         // 8  — allows multiple switches per owner
    pub bump: u8,               // 1
    pub cnft_asset_id: Pubkey,  // 32 — cNFT asset ID (Pubkey::default if not yet linked)
    pub watcher: Pubkey,        // 32 — agent authorized to call heartbeat on behalf of owner
    pub last_activity_type: [u8; 32], // 32 — last heartbeat activity label (e.g. "dex_swap")
    pub is_executed: bool,            // 1  — set when execute_to_vault fires (unset beneficiary flow)
}

impl Switch {
    pub const LEN: usize = 8   // discriminator
        + 32   // owner
        + 32   // beneficiary
        + 8    // check_in_interval
        + 8    // last_check_in
        + 8    // locked_amount
        + 8    // switch_id
        + 1    // bump
        + 32   // cnft_asset_id
        + 32   // watcher
        + 32   // last_activity_type
        + 1;   // is_executed
}
