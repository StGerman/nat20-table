//! The nat20-table engine server. Wire types come from `nat20_api_contract`; rules come from
//! `nat20_core`, reached only through [`adapter`] (CLAUDE.md Rule 5).

// Every command returns `Result<_, ApiError>`, and `ApiError` carries an optional hint with the
// pending prompt. Errors happen at most once per request, so its size does not matter.
#![allow(clippy::result_large_err)]

pub mod adapter;
pub mod errors;
pub mod projection;
pub mod render;
pub mod server;
pub mod session;

pub use server::Server;
