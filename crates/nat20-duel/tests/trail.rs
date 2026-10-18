//! Milestone 3's exit run: the five scenes of `m3_trail` end to end through the engine API, with
//! every roll, explore-mode checks and saves included, audited against the engine log.

use nat20_api_contract::{EventKind, RollView};
use nat20_duel::{
    audit::{audit_transcript, check_roll_arithmetic},
    trail::run_trail,
};
use serde_json::Value;

/// The log as JSON, so tests can read event and roll kinds by name.
fn json_log(log: &[nat20_api_contract::Event]) -> Vec<Value> {
    log.iter()
        .map(|e| serde_json::to_value(e).unwrap())
        .collect()
}

fn count(log: &[Value], kind: &str) -> usize {
    log.iter().filter(|e| e["kind"] == kind).count()
}

#[test]
fn every_trail_roll_is_cited_and_adds_up() {
    for run in 0..20 {
        let (transcript, log) = run_trail(Some(run));

        for event in &log {
            if let EventKind::Roll { roll } = &event.kind {
                assert!(matches!(roll, RollView::Full { .. }), "run {run}: {roll:?}");
                check_roll_arithmetic(roll)
                    .unwrap_or_else(|e| panic!("run {run}: {e}\n{transcript}"));
            }
        }
        let report = audit_transcript(&transcript, &log, true);
        assert!(
            report.passed(),
            "run {run}: audit failed: {:?}\n{transcript}",
            report.problems
        );
        assert_eq!(report.rolls_cited, report.rolls_in_log, "run {run}");

        // Either the party reaches the cellar or Bren falls in the yard fight.
        let log = json_log(&log);
        let fell = transcript.contains("the trail ends here");
        assert_eq!(
            count(&log, "scene_loaded"),
            if fell { 3 } else { 5 },
            "run {run}\n{transcript}"
        );
        assert_eq!(
            count(&log, "combat_over"),
            if fell { 1 } else { 2 },
            "run {run}\n{transcript}"
        );
    }
}

#[test]
fn the_seeded_trail_shows_every_milestone_3_feature() {
    // Seed 4 is the one `contract/fixtures/m3_trail.jsonl` records.
    let (transcript, log) = run_trail(Some(4));
    let log = json_log(&log);
    let rolls: Vec<&Value> = log
        .iter()
        .filter(|e| e["kind"] == "roll")
        .map(|e| &e["roll"])
        .collect();
    let rolled = |kind: &str| rolls.iter().filter(|r| r["kind"] == kind).count();

    assert_eq!(count(&log, "scene_loaded"), 5, "{transcript}");
    // Checks against scenario DCs, and the snare's save after a failed Survival check
    assert_eq!(rolled("skill_check"), 4, "{transcript}");
    assert_eq!(count(&log, "hazard_triggered"), 1, "{transcript}");
    assert_eq!(rolled("saving_throw"), 1, "{transcript}");
    // Spotting the lookouts surprises them: both roll Initiative with Disadvantage
    let surprised: Vec<&str> = rolls
        .iter()
        .filter(|r| r["kind"] == "initiative" && r["advantage"] == "disadvantage")
        .map(|r| r["roller"].as_str().unwrap())
        .collect();
    assert_eq!(surprised, ["goblin_1", "goblin_2"], "{transcript}");
    // The yard fight ends in a surrender, and the prisoner is carried into the storeroom
    assert_eq!(count(&log, "surrendered"), 1, "{transcript}");
    assert!(
        transcript.contains(r#""party":["bren","goblin_2"],"scene_id":"m3_s4_prisoner""#),
        "{transcript}"
    );
    // A short rest spends a Hit Point Die
    assert_eq!(count(&log, "rest"), 1, "{transcript}");
    assert!(
        rolls.iter().any(|r| r["label"] == "a d10 Hit Point Die"),
        "{transcript}"
    );
    // The cellar fight's spawns: at its start, the DM's reserve and round 3
    assert_eq!(count(&log, "spawned"), 3, "{transcript}");
    let over: Vec<&str> = log
        .iter()
        .filter(|e| e["kind"] == "combat_over")
        .map(|e| e["reason"].as_str().unwrap())
        .collect();
    assert_eq!(over, ["surrender", "scenario"], "{transcript}");
}
