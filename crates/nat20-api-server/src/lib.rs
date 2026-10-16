//! The nat20-table engine server. Wire types come from `nat20_api_contract`; rules come from
//! `nat20_core`, reached only through [`adapter`] (CLAUDE.md Rule 5).

pub mod adapter;
pub mod server;

pub use server::Server;
