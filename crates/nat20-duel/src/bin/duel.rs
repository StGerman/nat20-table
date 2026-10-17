//! `nat20-duel`: plays the `duel` scene (Fighter vs Goblin Warrior) through
//! the JSON API with a scripted Fighter, then audits the transcript against
//! the engine log.
//!
//! Usage: nat20-duel [transcript.txt] [log.json]

use std::fs;

use nat20_duel::{audit::audit_transcript, duel::run_duel};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (transcript, log) = run_duel();

    let report = audit_transcript(&transcript, &log, true);
    let summary = format!(
        "\nAudit: {} engine rolls, {} cited in transcript, {} problems.\n",
        report.rolls_in_log,
        report.rolls_cited,
        report.problems.len()
    );

    match args.get(1) {
        Some(path) => fs::write(path, format!("{transcript}{summary}")).expect("write transcript"),
        None => print!("{transcript}{summary}"),
    }
    if let Some(path) = args.get(2) {
        fs::write(path, serde_json::to_string_pretty(&log).unwrap()).expect("write log");
    }
    for problem in &report.problems {
        eprintln!("audit: {problem}");
    }
    if !report.passed() {
        std::process::exit(1);
    }
}
