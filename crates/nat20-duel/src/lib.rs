//! Milestone 1 checks, written as an engine API client: a scripted Fighter plays the `duel`
//! scene through typed contract requests, and the audit checks the transcript against the
//! session log (the demo's pass criterion). The game loop in `game/` replaces the scripted
//! Fighter with agents; the audit stays.

pub mod audit;
pub mod client;
pub mod duel;
pub mod trail;
