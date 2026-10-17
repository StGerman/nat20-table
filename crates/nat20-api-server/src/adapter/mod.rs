//! The only module that may `use nat20_core` (CLAUDE.md Rule 5). Upstream churn stays here.

pub mod events;
pub mod game;
pub mod monster;
pub mod names;
pub mod pregen;

use nat20_core::registry::registry::ClassesRegistry;

/// The `nat20_core` git revision this binary was built against, read from Cargo.lock at build time.
pub fn engine_rev() -> &'static str {
    env!("NAT20_CORE_REV")
}

/// Number of classes in core's registry. Forces the registry to load, so a broken pin or a
/// missing asset folder fails at startup instead of on the first real command.
pub fn loaded_class_count() -> usize {
    ClassesRegistry::keys().count()
}
