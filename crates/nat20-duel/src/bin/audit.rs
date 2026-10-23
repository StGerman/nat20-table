//! `nat20-audit`: checks a game run's files (M6 step 6, decision 0033).
//!
//! Usage: `nat20-audit --pack <scenario-pack> <run-dir>`
//!
//! Reads, from the run directory the game wrote:
//! - `transcript.jsonl` and `session-log.jsonl`: the transcript audit. Every channel is checked
//!   against the session log projected for whoever hears it, and every roll in the log must be
//!   cited on some channel (`nat20_duel::game_audit`).
//! - `inputs.jsonl`: the leak scan. Nothing a player agent or the human's seat was given may carry
//!   what that player may not know, including the DM-only ids of the scenario pack the run played
//!   (`nat20_duel::leak_scan`).
//!
//! Prints a short report and exits 1 on any problem or leak, 2 when it can't read its input.

use std::{fs, path::PathBuf, process::exit};

use nat20_duel::{
    game_audit::{audit_game, read_session_log, read_transcript},
    leak_scan::{Secrets, scan_inputs},
};

const USAGE: &str = "usage: nat20-audit --pack <scenario-pack> <run-dir>";

fn main() {
    let mut pack = None;
    let mut run = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--pack" => pack = args.next().map(PathBuf::from),
            "-h" | "--help" => {
                println!("{USAGE}");
                return;
            }
            _ if run.is_none() => run = Some(PathBuf::from(arg)),
            _ => fail(USAGE),
        }
    }
    let (Some(pack), Some(run)) = (pack, run) else {
        fail(USAGE)
    };
    let read = |name: &str| {
        let path = run.join(name);
        fs::read_to_string(&path)
            .unwrap_or_else(|error| fail(&format!("cannot read {}: {error}", path.display())))
    };

    let transcript = read_transcript(&read("transcript.jsonl")).unwrap_or_else(|e| fail(&e));
    let log = read_session_log(&read("session-log.jsonl")).unwrap_or_else(|e| fail(&e));
    let audit = audit_game(&transcript, &log, true);
    println!(
        "Audit: {} transcript lines, {} engine rolls, {} cited, {} problems.",
        transcript.len(),
        audit.rolls_in_log,
        audit.rolls_cited,
        audit.problems.len()
    );
    for problem in &audit.problems {
        println!("  audit: {problem}");
    }

    let secrets = Secrets::of_pack(&pack).unwrap_or_else(|e| fail(&e));
    let scan = scan_inputs(&read("inputs.jsonl"), &secrets).unwrap_or_else(|e| fail(&e));
    println!(
        "Leak scan: {} inputs to {}, {} typed by the human and skipped, {} DM-only ids, {} leaks.",
        scan.inputs,
        scan.seats.iter().cloned().collect::<Vec<_>>().join(", "),
        scan.human_lines,
        secrets.ids.len(),
        scan.leaks.len()
    );
    if !secrets.not_scanned.is_empty() {
        let words: Vec<_> = secrets.not_scanned.iter().cloned().collect();
        println!("  not scanned (plain words): {}", words.join(", "));
    }
    for leak in &scan.leaks {
        println!("  leak: {leak}");
    }

    if !audit.passed() || !scan.passed() {
        exit(1);
    }
}

fn fail(message: &str) -> ! {
    eprintln!("nat20-audit: {message}");
    exit(2)
}
