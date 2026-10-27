//! `nat20-balance`: the fight-balance sweep (M7 design §3.6, TASKS.md MON-10). A competent scripted
//! party plays The Silent Mill's chain of fights, one seed after another, in process; the Markdown
//! report goes to stdout, and `--json` writes every seed's result for a later re-check.
//!
//! Usage: nat20-balance [--pack DIR] [--from N] [--seeds N] [--json results.json]
//!
//! `--pack` defaults to `scenarios/the_silent_mill`; seeds run from `--from` (1) for `--seeds` (100).

use std::{fs, path::PathBuf};

use nat20_duel::balance::{report, run_chain};

fn main() {
    let mut pack =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../scenarios/the_silent_mill");
    let mut from = 1u32;
    let mut seeds = 100u32;
    let mut json = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        let mut value = || args.next().unwrap_or_else(|| panic!("{arg} needs a value"));
        match arg.as_str() {
            "--pack" => pack = PathBuf::from(value()),
            "--from" => from = value().parse().expect("--from takes a seed"),
            "--seeds" => seeds = value().parse().expect("--seeds takes a count"),
            "--json" => json = Some(value()),
            other => panic!(
                "unknown argument {other}; usage: nat20-balance [--pack DIR] [--from N] [--seeds N] [--json FILE]"
            ),
        }
    }
    let results: Vec<_> = (from..from + seeds)
        .map(|seed| {
            let result = run_chain(&pack, seed);
            eprintln!(
                "seed {seed}: {}",
                result
                    .fights
                    .iter()
                    .map(|f| format!(
                        "{} {}{}",
                        f.encounter,
                        if f.won { "won" } else { "lost" },
                        if f.stalemate { " (stalemate)" } else { "" }
                    ))
                    .collect::<Vec<_>>()
                    .join(", ")
            );
            result
        })
        .collect();
    print!("{}", report(&results));
    if let Some(path) = json {
        fs::write(
            &path,
            serde_json::to_string_pretty(&results).expect("results serialize") + "\n",
        )
        .unwrap_or_else(|error| panic!("{path}: {error}"));
    }
}
