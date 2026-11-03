//! The only module that may `use nat20_core` (CLAUDE.md Rule 5). Upstream churn stays here.

pub mod conditions;
pub mod events;
pub mod game;
pub mod monster;
pub mod names;
pub mod pregen;
pub mod sheet;

use nat20_core::{components::rng, registry::registry::ClassesRegistry};

/// The `nat20_core` git revision this binary was built against, read from Cargo.lock at build time.
pub fn engine_rev() -> &'static str {
    env!("NAT20_CORE_REV")
}

/// Number of classes in core's registry. Forces the registry to load, so a broken pin or a
/// missing asset folder fails at startup instead of on the first real command.
pub fn loaded_class_count() -> usize {
    ClassesRegistry::keys().count()
}

/// Rolls one die with `sides` sides on core's seeded dice, for a world table (API-43): a
/// world roll replays with the session seed like every other roll. `None` for a die core
/// does not have.
pub fn roll_world_die(sides: u32) -> Option<u32> {
    use nat20_core::components::dice::{DiceSet, DieSize};
    let size = match sides {
        4 => DieSize::D4,
        6 => DieSize::D6,
        8 => DieSize::D8,
        10 => DieSize::D10,
        12 => DieSize::D12,
        20 => DieSize::D20,
        100 => DieSize::D100,
        _ => return None,
    };
    DiceSet::new(1, size).roll().rolls().first().copied()
}

/// Seeds core's dice for this thread. Every roll after the call follows from `seed`, so the same
/// seed and the same request stream replay the same session. Core keeps one generator per thread;
/// the server handles every request on one thread.
pub fn seed_dice(seed: u32) {
    rng::seed(u64::from(seed));
}
