//! Milestone 4's exit run, `contract/fixtures/m4_party.jsonl`: the four level 2 pregens read
//! their sheets, then fight three Goblin Warriors and a Wolf (`m4_party_yard`) with healing,
//! Shield and an area spell in the fight, take a short rest, and heal out of combat with a Potion
//! of Healing and Cure Wounds. Last, the Cleric walks to the Fighter to cast Guidance (the walk
//! logged as `moved` right before the action, API-32), and a rotten stair hurts her while she
//! concentrates on it, so she makes a Concentration save. The conformance test replays the
//! fixture byte for byte; this test checks the exit criterion against it and audits the DM log it
//! ends with, so an uncited healing roll, spell save, Concentration save or potion roll fails here.

use std::path::Path;

use nat20_api_contract::{CommandResult, Event, EventKind, Response, RollView};
use nat20_duel::audit::{audit_transcript, check_roll_arithmetic};
use serde_json::Value;

/// The fixture's lines as request/response pairs.
fn lines() -> Vec<Value> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../contract/fixtures/m4_party.jsonl");
    std::fs::read_to_string(path)
        .unwrap()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect()
}

/// The fixture's last line: the DM's view of the whole session log.
fn dm_log() -> Vec<Event> {
    let last = lines().pop().unwrap();
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

#[test]
fn every_roll_in_the_party_run_is_cited_and_adds_up() {
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
fn the_four_pregens_load_with_their_ac_and_hp() {
    // Milestone 4 spec §3: AC and HP of each pregen at level 2.
    let expected = [
        ("bren", 19, 20),
        ("torva", 13, 23),
        ("maren", 18, 17),
        ("ilsa", 11, 14),
    ];
    let sheets: Vec<Value> = lines()
        .into_iter()
        .filter(|l| l["request"]["cmd"] == "get_sheet")
        .take(4)
        .map(|l| l["response"]["result"]["sheet"].clone())
        .collect();
    for ((handle, ac, hp), sheet) in expected.iter().zip(&sheets) {
        assert_eq!(sheet["handle"], *handle);
        assert_eq!(sheet["ac"], *ac, "{handle} AC");
        assert_eq!(sheet["hp"], *hp, "{handle} HP");
        assert_eq!(sheet["hp_max"], *hp, "{handle} HP max");
    }
}

#[test]
fn the_cleric_heals_in_and_out_of_combat_and_shield_and_an_area_spell_resolve() {
    let log: Vec<Value> = dm_log()
        .iter()
        .map(|e| serde_json::to_value(e).unwrap())
        .collect();
    let at = |kind: &str| log.iter().position(|e| e["kind"] == kind).unwrap();
    let (start, over, rest) = (at("combat_started"), at("combat_over"), at("rest"));
    assert!(start < over && over < rest);
    assert_eq!(log[over]["winner"], "party");
    let fight = &log[start..over];
    let after_rest = &log[rest..];

    let acted = |events: &[Value], option: &str| {
        events
            .iter()
            .any(|e| e["kind"] == "action" && e["option_id"] == option)
    };
    let healed = |events: &[Value]| events.iter().any(|e| e["kind"] == "healed");

    // In the fight: Healing Word, Shield taken as a reaction, an area spell on two creatures.
    assert!(acted(fight, "cast/healing_word/1") && healed(fight));
    assert!(
        fight.iter().any(|e| e["kind"] == "effect_started"
            && e["name"] == "Shield"
            && e["target"] == "ilsa")
    );
    assert!(fight.iter().any(|e| {
        e["kind"] == "action"
            && ["cast/burning_hands/1", "cast/thunderwave/1"]
                .contains(&e["option_id"].as_str().unwrap())
            && e["targets"].as_array().unwrap().len() >= 2
    }));
    // The area spell's saves are against the Wizard's spell save DC.
    assert!(fight.iter().any(|e| e["kind"] == "roll"
        && e["roll"]["kind"] == "saving_throw"
        && e["roll"]["dc_source"] == "spell_save_dc"));

    // After the short rest: Cure Wounds and a Potion of Healing, each with its healing roll.
    assert!(acted(after_rest, "cast/cure_wounds/1"));
    assert!(acted(after_rest, "use/potion_of_healing"));
    let heals_after = after_rest.iter().filter(|e| e["kind"] == "healed").count();
    assert!(heals_after >= 2, "{heals_after} heals after the rest");
    assert!(
        log.iter()
            .any(|e| e["kind"] == "roll" && e["roll"]["kind"] == "healing")
    );

    // Guidance on the Fighter walks the Cleric to him first, and the log shows the walk right
    // before the action. (Until ENG-18 the Fighter stood inside the Barbarian's space here, so
    // the walk found no free spot in reach and Guidance was dropped; `dropped_action.jsonl`
    // covers `action_dropped`.)
    let guidance = after_rest
        .iter()
        .position(|e| e["kind"] == "action" && e["option_id"] == "cast/guidance")
        .expect("Maren casts Guidance");
    assert_eq!(after_rest[guidance - 1]["kind"], "moved");
    assert_eq!(after_rest[guidance - 1]["actor"], "maren");

    // Damage out of combat costs the concentrating Cleric a Concentration save.
    assert!(after_rest.iter().any(|e| {
        e["kind"] == "roll"
            && e["roll"]["roller"] == "maren"
            && e["roll"]["kind"] == "saving_throw"
            && e["roll"]["label"]
                .as_str()
                .unwrap()
                .contains("Concentration")
    }));
    assert!(after_rest.iter().any(|e| e["kind"] == "concentration_ended"
        && e["actor"] == "maren"
        && e["reason"] == "failed_save"));
}
