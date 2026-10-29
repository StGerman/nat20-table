//! The narration check's digest (M7 design §3.4, TASKS.md AGT-9) on the planted game fixture
//! `m7_narration`: the engine log replays with no divergence, every narration gets a digest, and
//! the digest shows the engine state that makes each planted line a contradiction. The judge reads
//! the same records; CI never calls it.

use std::{fs, path::PathBuf};

use nat20_duel::{
    digest::{RunDigest, digest_run, pack_party},
    game_audit::read_transcript,
};

fn repo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn fixture(file: &str) -> String {
    let path = repo().join(format!("game/test/fixtures/m7_narration.{file}"));
    fs::read_to_string(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}

fn digest(engine_log: &str) -> RunDigest {
    let pack = repo().join("scenarios/the_silent_mill");
    let party = pack_party(&pack, &repo().join("pregens")).unwrap();
    let transcript = read_transcript(&fixture("transcript.jsonl")).unwrap();
    digest_run(&pack, party, engine_log, &transcript).unwrap()
}

#[test]
fn the_planted_fixture_replays_and_its_digest_shows_both_contradictions() {
    let log = fixture("engine-log.jsonl");
    let run = digest(&log);
    assert_eq!(run.diverged, None);
    assert_eq!(run.requests_replayed, log.lines().count());
    assert_eq!(run.digests.len(), run.narrations);

    // The party as the pack names it, with coins from the pregens and the pack's pronouns.
    let torva = run.party.iter().find(|m| m.handle == "torva").unwrap();
    assert_eq!(torva.pronouns.as_deref(), Some("she/her"));
    assert!(
        torva.names.contains(&"Torva".to_owned()),
        "{:?}",
        torva.names
    );
    assert_eq!(run.party[0].coins.as_deref(), Some("54 GP"));

    // Planted 1: Bren "toe to toe" with a goblin the engine has 20 ft or more away.
    let adjacent = run
        .digests
        .iter()
        .find(|d| d.text.contains("toe to toe"))
        .unwrap();
    let goblin = adjacent
        .text
        .split_whitespace()
        .nth(6)
        .unwrap()
        .trim_end_matches(',');
    let feet = adjacent.foes_ft["bren"][goblin];
    assert!(feet >= 20.0, "{goblin} is {feet} ft from bren");
    assert!(
        !adjacent
            .adjacent
            .iter()
            .any(|p| p.contains(&"bren".to_owned()) && p.contains(&goblin.to_owned()))
    );

    // Planted 2: a goblin "begs for mercy" with no surrender in the engine, and attacks afterwards.
    let at = run
        .digests
        .iter()
        .position(|d| d.text.contains("begs for mercy"))
        .unwrap();
    let archer = run.digests[at]
        .text
        .split_whitespace()
        .next()
        .unwrap()
        .to_owned();
    let creature = run.digests[at]
        .creatures
        .iter()
        .find(|c| c["handle"] == archer.as_str())
        .unwrap();
    assert_eq!(creature["life_state"], "conscious");
    assert!(
        creature.get("surrendered").is_none() && creature.get("offered_surrender").is_none(),
        "{creature}"
    );
    let attacks = format!("{archer} uses");
    assert!(
        run.digests[at + 1..]
            .iter()
            .any(|d| d.engine_lines.iter().any(|l| l.contains(&attacks))),
        "{archer} attacks after the line"
    );

    // Every digest carries the party's sheets once the party is in the scene.
    assert!(run.digests.iter().all(|d| d.inventory.len() == 4));
    assert!(
        adjacent.inventory[0]
            .1
            .iter()
            .any(|i| i["name"] == "Potion of Healing" && i["quantity"] == 1),
        "{:?}",
        adjacent.inventory[0]
    );
}

#[test]
fn a_replay_that_diverges_stops_there_and_says_where() {
    // A recorded response edited after the fact: the replay notices and digests no further.
    let log = fixture("engine-log.jsonl");
    let mut lines: Vec<String> = log.lines().map(str::to_owned).collect();
    let at = lines
        .iter()
        .position(|l| l.contains("\"cmd\":\"submit\""))
        .unwrap();
    let mut entry: serde_json::Value = serde_json::from_str(&lines[at]).unwrap();
    entry["response"]["events"][0]["text"] = "something else happened.".into();
    lines[at] = entry.to_string();
    let run = digest(&(lines.join("\n") + "\n"));
    let diverged = run.diverged.expect("the edit is noticed");
    assert!(
        diverged.starts_with(&format!("engine log line {} (submit)", at + 1)),
        "{diverged}"
    );
    assert_eq!(run.requests_replayed, at + 1);
    assert!(run.digests.len() < run.narrations);
}

#[test]
fn a_session_started_without_a_seed_replays_with_the_seed_it_was_given() {
    // `play:full` sends `new_session` without a seed, so the engine picks one and names it in the
    // response; the replay must ask for that seed or diverge at once (the first M7 run did).
    let log = fixture("engine-log.jsonl");
    let mut lines: Vec<String> = log.lines().map(str::to_owned).collect();
    let at = lines
        .iter()
        .position(|l| l.contains("\"cmd\":\"new_session\""))
        .unwrap();
    let mut entry: serde_json::Value = serde_json::from_str(&lines[at]).unwrap();
    entry["request"].as_object_mut().unwrap().remove("seed");
    lines[at] = entry.to_string();
    let run = digest(&(lines.join("\n") + "\n"));
    assert_eq!(run.diverged, None);
    assert_eq!(run.digests.len(), run.narrations);
}

#[test]
fn a_log_cut_short_digests_no_line_said_after_its_end() {
    // The run's engine log ends early (a crash mid-write): the lines said later have no state.
    let log = fixture("engine-log.jsonl");
    let lines: Vec<&str> = log.lines().collect();
    let cut = lines[..lines.len() / 2].join("\n");
    let run = digest(&cut);
    let reason = run.diverged.expect("an incomplete replay says so");
    assert!(
        reason.starts_with("the engine log ends at log head "),
        "{reason}"
    );
    assert!(run.digests.len() < run.narrations);
    let last: serde_json::Value = serde_json::from_str(lines[lines.len() / 2 - 1]).unwrap();
    let reached = last["response"]["log_head"].as_u64().unwrap();
    assert!(run.digests.iter().all(|d| d.log_head <= reached));
}
