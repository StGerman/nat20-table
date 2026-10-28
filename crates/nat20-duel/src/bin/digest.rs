//! `nat20-digest`: the narration check's state digest of a game run (M7 design §3.4, AGT-9).
//!
//! Usage: `nat20-digest --pack <scenario-pack> [--pregens <dir>] <run-dir>`
//!
//! Replays the run's `engine-log.jsonl` through an in-process engine over the pack, and at each DM
//! narration in `transcript.jsonl` writes what the engine held (`nat20_duel::digest`). Writes
//! `narration-digest.jsonl` to the run directory: a `run` record first (the party, how many
//! narrations, how many requests replayed, where the replay diverged if it did), then one
//! `narration` record per digested line.
//!
//! Exits 1 when the replay diverged from the recorded responses (an engine row: the engine is
//! meant to be deterministic), 2 when it can't read its input.

use std::{fs, path::PathBuf, process::exit};

use nat20_api_server::paths::pregens_dir;
use nat20_duel::{
    digest::{digest_run, pack_party},
    game_audit::read_transcript,
};
use serde_json::json;

const USAGE: &str = "usage: nat20-digest --pack <scenario-pack> [--pregens <dir>] <run-dir>";

/// The file the digest writes in the run directory.
const OUT: &str = "narration-digest.jsonl";

fn main() {
    let mut pack = None;
    let mut pregens = None;
    let mut run = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--pack" => pack = args.next().map(PathBuf::from),
            "--pregens" => pregens = args.next().map(PathBuf::from),
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
    let party =
        pack_party(&pack, &pregens.unwrap_or_else(pregens_dir)).unwrap_or_else(|e| fail(&e));
    let digest = digest_run(&pack, party, &read("engine-log.jsonl"), &transcript)
        .unwrap_or_else(|e| fail(&e));

    let mut out = vec![
        json!({
            "kind": "run",
            "party": digest.party,
            "narrations": digest.narrations,
            "requests_replayed": digest.requests_replayed,
            "diverged": digest.diverged,
        })
        .to_string(),
    ];
    for d in &digest.digests {
        let mut record = serde_json::to_value(d).expect("a digest serializes");
        record["kind"] = json!("narration");
        out.push(record.to_string());
    }
    let path = run.join(OUT);
    fs::write(&path, out.join("\n") + "\n")
        .unwrap_or_else(|error| fail(&format!("cannot write {}: {error}", path.display())));
    println!(
        "Digest: {} of {} narrations, {} requests replayed{}. Written to {}.",
        digest.digests.len(),
        digest.narrations,
        digest.requests_replayed,
        digest
            .diverged
            .as_deref()
            .map(|d| format!("; the replay diverged at {d}"))
            .unwrap_or_default(),
        path.display()
    );
    if digest.diverged.is_some() {
        exit(1);
    }
}

fn fail(message: &str) -> ! {
    eprintln!("{message}");
    exit(2)
}
