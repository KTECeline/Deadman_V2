pub mod create_switch;
pub mod check_in;
pub mod execute;
pub mod execute_to_vault;
pub mod claim_beneficiary;
pub mod cancel;
pub mod link_cnft;
pub mod heartbeat;

// Full wildcard re-exports are required — Anchor's #[program] macro needs the
// internally generated __client_accounts_* types to be accessible at crate level.
pub use create_switch::*;
pub use check_in::*;
pub use execute::*;
pub use execute_to_vault::*;
pub use claim_beneficiary::*;
pub use cancel::*;
pub use link_cnft::*;
pub use heartbeat::*;
