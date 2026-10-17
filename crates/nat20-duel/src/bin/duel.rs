//! `nat20-duel`: plays the `duel` scene (Fighter vs Goblin Warrior) through
//! the JSON API with a scripted Fighter, then audits the transcript against
//! the engine log.
//!
//! Usage: nat20-duel [--seed N] [transcript.txt] [log.json]
//!        nat20-duel --seed N --fixture contract/fixtures/duel.jsonl
//!
//! `--fixture` writes the seeded duel as a conformance fixture instead.

use std::fs;

use nat20_duel::{
    audit::audit_transcript,
    duel::{record_fixture, run_duel},
};

fn main() {
    let mut seed = None;
    let mut fixture = None;
    let mut paths = Vec::new();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--seed" => {
                let value = args.next().expect("--seed needs a value");
                seed = Some(value.parse::<u32>().expect("--seed takes a u32"));
            }
            "--fixture" => fixture = Some(args.next().expect("--fixture needs a path")),
            _ => paths.push(arg),
        }
    }

    if let Some(path) = fixture {
        let seed = seed.expect("--fixture needs --seed, so the fixture replays");
        fs::write(&path, record_fixture(seed)).expect("write fixture");
        return;
    }

    let (transcript, log) = run_duel(seed);

    let report = audit_transcript(&transcript, &log, true);
    let summary = format!(
        "\nAudit: {} engine rolls, {} cited in transcript, {} problems.\n",
        report.rolls_in_log,
        report.rolls_cited,
        report.problems.len()
    );

    match paths.first() {
        Some(path) => fs::write(path, format!("{transcript}{summary}")).expect("write transcript"),
        None => print!("{transcript}{summary}"),
    }
    if let Some(path) = paths.get(1) {
        fs::write(path, serde_json::to_string_pretty(&log).unwrap()).expect("write log");
    }
    for problem in &report.problems {
        eprintln!("audit: {problem}");
    }
    if !report.passed() {
        std::process::exit(1);
    }
}
