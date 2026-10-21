//! Milestone 5's exit run, `contract/fixtures/m5_fights.jsonl`: the four pregens fight Scene 3
//! (four Goblin Warriors and three Wolves) and Scene 5 (the Goblin Boss, three Warriors, two
//! Wolves and the round-3 rats) in one seeded session. The conformance test replays the fixture
//! byte for byte; this test audits the DM log it ends with, so an uncited monster roll, rider
//! die included, fails here. The rider itself is shown by `monsters.jsonl` and `pack.jsonl`: in
//! this run the goblins shoot from range and never attack with Advantage.

use std::path::Path;

use nat20_api_contract::{CommandResult, Event, EventKind, Response, RollView};
use nat20_duel::audit::{audit_transcript, check_roll_arithmetic};
use serde_json::Value;

/// The fixture's last line: the DM's view of the whole session log.
fn dm_log() -> Vec<Event> {
    let path =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../contract/fixtures/m5_fights.jsonl");
    let text = std::fs::read_to_string(path).unwrap();
    let last: Value = serde_json::from_str(text.lines().last().unwrap()).unwrap();
    assert_eq!(last["request"]["cmd"], "events");
    assert_eq!(last["request"]["viewer"], "dm");
    let response: Response = serde_json::from_value(last["response"].clone()).unwrap();
    match response.result {
        Some(CommandResult::Events { events, .. }) => events,
        other => panic!("not an events result: {other:?}"),
    }
}

/// The engine's own narration of the log, one event per line, each roll cited by its id: what
/// the DM agent reads.
fn transcript(log: &[Event]) -> String {
    log.iter()
        .map(|e| match &e.kind {
            EventKind::Roll {
                roll: RollView::Full { id, .. },
            } => format!("[{}] {}\n", id.0, e.text),
            _ => format!("{}\n", e.text),
        })
        .collect()
}

fn json_log(log: &[Event]) -> Vec<Value> {
    log.iter()
        .map(|e| serde_json::to_value(e).unwrap())
        .collect()
}

#[test]
fn every_roll_in_both_fights_is_cited_and_adds_up() {
    let log = dm_log();
    for event in &log {
        if let EventKind::Roll { roll } = &event.kind {
            assert!(matches!(roll, RollView::Full { .. }), "{roll:?}");
            check_roll_arithmetic(roll).unwrap_or_else(|e| panic!("{e}"));
        }
    }
    let report = audit_transcript(&transcript(&log), &log, true);
    assert!(report.passed(), "audit failed: {:?}", report.problems);
    assert_eq!(report.rolls_cited, report.rolls_in_log);
}

#[test]
fn the_exit_run_shows_both_fights_won_with_the_real_monsters() {
    let log = json_log(&dm_log());
    let kinds = |kind: &'static str| log.iter().filter(move |e| e["kind"] == kind);

    let scenes: Vec<&str> = kinds("scene_loaded")
        .map(|e| e["scene_id"].as_str().unwrap())
        .collect();
    assert_eq!(scenes, ["m5_s3_yard", "m5_s5_cellar"]);
    let winners: Vec<&str> = kinds("combat_over")
        .map(|e| e["winner"].as_str().unwrap_or("none"))
        .collect();
    assert_eq!(winners, ["party", "party"]);

    let rolls: Vec<&Value> = kinds("roll").map(|e| &e["roll"]).collect();
    let rolled_by = |prefix: &str| {
        rolls
            .iter()
            .any(|r| r["roller"].as_str().unwrap().starts_with(prefix))
    };
    for monster in ["goblin_", "wolf_", "boss"] {
        assert!(rolled_by(monster), "no roll by {monster}");
    }
    // Pack Tactics gives a Wolf Advantage, and the DM log names the source.
    assert!(
        rolls
            .iter()
            .any(|r| r["roller"].as_str().unwrap().starts_with("wolf_")
                && r["advantage"] == "advantage"
                && r.to_string().contains("pack_tactics")),
        "no Pack Tactics roll"
    );
    // The round-3 rats arrive: no one in the party was Bloodied when round 3 began.
    let spawned: Vec<&str> = kinds("spawned")
        .flat_map(|e| e["handles"].as_array().unwrap())
        .map(|h| h.as_str().unwrap())
        .collect();
    assert!(spawned.ends_with(&["rat_1", "rat_2"]), "{spawned:?}");
}
