//! Records the pinned nat20_core revision (from Cargo.lock) so `hello` can report it.

use std::{env, fs, path::Path};

fn main() {
    let lock = Path::new(&env::var("CARGO_MANIFEST_DIR").unwrap()).join("../../Cargo.lock");
    println!("cargo:rerun-if-changed={}", lock.display());
    let text = fs::read_to_string(&lock).unwrap_or_default();
    let rev = text
        .split("[[package]]")
        .find(|block| block.contains("name = \"nat20_core\""))
        .and_then(|block| block.lines().find(|line| line.starts_with("source = ")))
        .and_then(|source| source.trim_end_matches('"').rsplit('#').next())
        .unwrap_or("unknown")
        .to_string();
    println!("cargo:rustc-env=NAT20_CORE_REV={rev}");
}
