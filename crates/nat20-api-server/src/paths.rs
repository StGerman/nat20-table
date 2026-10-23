//! Where the engine reads its content at run time (TASKS.md API-18, contract/protocol.md §2.1).
//!
//! Each directory comes from an environment variable when it is set and not empty, so the binary
//! runs outside the checkout it was built in: the game spawns it with a scenario pack as its data
//! directory. Unset, each falls back to its place in the build checkout, as before.

use std::{ffi::OsString, path::PathBuf};

/// The data directory: `scenes/<scene_id>.json` is read from it. A scenario pack is one.
pub const DATA_DIR_VAR: &str = "NAT20_DATA_DIR";
/// The directory of pregen files, `<id>.json` (protocol §2.2).
pub const PREGENS_DIR_VAR: &str = "NAT20_PREGENS_DIR";
/// The directory of terrain meshes, `<map>.obj`.
pub const MAPS_DIR_VAR: &str = "NAT20_MAPS_DIR";

/// The data directory: `$NAT20_DATA_DIR`, else this crate's `data/`.
pub fn data_dir() -> PathBuf {
    resolve(
        std::env::var_os(DATA_DIR_VAR),
        checkout().join("crates/nat20-api-server/data"),
    )
}

/// The pregen directory: `$NAT20_PREGENS_DIR`, else `pregens/` at the repository root.
pub fn pregens_dir() -> PathBuf {
    resolve(
        std::env::var_os(PREGENS_DIR_VAR),
        checkout().join("pregens"),
    )
}

/// The terrain directory: `$NAT20_MAPS_DIR`, else `maps/` at the repository root.
pub fn maps_dir() -> PathBuf {
    resolve(std::env::var_os(MAPS_DIR_VAR), checkout().join("maps"))
}

/// The repository root this binary was built in.
fn checkout() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn resolve(value: Option<OsString>, fallback: PathBuf) -> PathBuf {
    match value {
        Some(value) if !value.is_empty() => PathBuf::from(value),
        _ => fallback,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_set_variable_wins_and_an_empty_one_falls_back() {
        let fallback = PathBuf::from("/checkout/maps");
        assert_eq!(
            resolve(Some("/pack".into()), fallback.clone()),
            PathBuf::from("/pack")
        );
        assert_eq!(resolve(Some("".into()), fallback.clone()), fallback);
        assert_eq!(resolve(None, fallback.clone()), fallback);
    }

    #[test]
    fn the_fallbacks_are_the_checkout_directories() {
        assert!(
            checkout()
                .join("crates/nat20-api-server/data/scenes")
                .is_dir()
        );
        assert!(checkout().join("pregens").is_dir());
        assert!(checkout().join("maps").is_dir());
    }
}
