//! Milestone 1 checks, written as an engine API client: a scripted Fighter plays the `duel`
//! scene through typed contract requests, and the audit checks the transcript against the
//! session log (the demo's pass criterion). The game loop in `game/` replaces the scripted
//! Fighter with agents; the audit stays, and `nat20-audit` runs it on a game run's files with
//! the leak scan (Milestone 6 step 6, decision 0033).

pub mod audit;
pub mod balance;
pub mod client;
pub mod digest;
pub mod duel;
pub mod game_audit;
pub mod leak_scan;
pub mod trail;
