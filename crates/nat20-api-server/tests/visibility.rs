//! The `visibility` CI job (design §5.3, `contract/protocol.md` §5): replays every
//! `contract/fixtures/*.jsonl` and, after each step, asks for `get_state` and `events since 0` as
//! every party creature's player viewer. Nothing a player may not know may appear in what that
//! player receives. What counts as a leak is listed in `nat20_api_server::leaks`, which the game's
//! leak scan (M6 step 6) shares.
//!
//! The probes are read-only, so the replay follows the fixture's own path. Run alone:
//! `cargo test --locked -p nat20-api-server --test visibility`.

use std::{collections::BTreeSet, fs, path::PathBuf};

use nat20_api_server::{
    Server,
    leaks::{json_leaks, names_a_target_number},
};
use serde_json::{Value, json};

fn fixtures() -> Vec<PathBuf> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../contract/fixtures");
    let mut files: Vec<PathBuf> = fs::read_dir(&dir)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", dir.display()))
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
        .collect();
    files.sort();
    files
}

/// Fixture requests in order, as raw lines (a `request_raw` line is sent as written).
fn requests(path: &PathBuf) -> Vec<String> {
    fs::read_to_string(path)
        .unwrap()
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let step: Value = serde_json::from_str(line).unwrap();
            match (step.get("request"), step.get("request_raw")) {
                (Some(request), None) => request.to_string(),
                (None, Some(Value::String(raw))) => raw.clone(),
                _ => panic!(
                    "{}: needs exactly one of `request` or `request_raw`",
                    path.display()
                ),
            }
        })
        .collect()
}

/// Party handles named in a response: `side: "party"` creatures in a DM view, `me` in a player view.
fn party_handles(response: &Value, out: &mut BTreeSet<String>) {
    match response {
        Value::Object(map) => {
            if map.get("side").and_then(Value::as_str) == Some("party")
                && let Some(handle) = map.get("handle").and_then(Value::as_str)
            {
                out.insert(handle.to_string());
            }
            map.values().for_each(|value| party_handles(value, out));
        }
        Value::Array(items) => items.iter().for_each(|value| party_handles(value, out)),
        _ => {}
    }
}

/// Every leak of hidden data in `response` as seen by player `viewer`; empty when clean.
fn leaks(viewer: &str, response: &Value) -> Vec<String> {
    json_leaks(viewer, response)
}

fn call(server: &mut Server, request: Value) -> Value {
    serde_json::from_str(&server.handle_line(&request.to_string())).unwrap()
}

#[test]
fn no_fixture_step_leaks_hidden_data_to_a_player() {
    let mut probes = 0;
    for path in fixtures() {
        let name = path.file_stem().unwrap().to_string_lossy().to_string();
        let mut server = Server::new();
        let mut party = BTreeSet::new();
        for (index, request) in requests(&path).iter().enumerate() {
            let response: Value = serde_json::from_str(&server.handle_line(request)).unwrap();
            party_handles(&response, &mut party);
            let sent_as = serde_json::from_str::<Value>(request)
                .ok()
                .and_then(|request| request["viewer"].as_str().map(str::to_string));
            if let Some(viewer) = sent_as.filter(|viewer| viewer != "dm") {
                let found = leaks(&viewer, &response);
                assert!(
                    found.is_empty(),
                    "{name}:{}: {viewer} sees {found:#?}",
                    index + 1
                );
            }
            for viewer in &party {
                for probe in [
                    json!({"cmd": "get_state"}),
                    json!({"cmd": "events", "since": 0}),
                ] {
                    let mut request = probe.clone();
                    request["v"] = json!(1);
                    request["id"] = json!(format!("visibility-{name}-{index}-{viewer}-{probes}"));
                    request["viewer"] = json!(viewer);
                    let response = call(&mut server, request);
                    let found = leaks(viewer, &response);
                    assert!(
                        found.is_empty(),
                        "{name}:{} then {probe} as {viewer}: {found:#?}",
                        index + 1
                    );
                    probes += 1;
                }
            }
        }
    }
    assert!(probes > 0, "no fixture has a party creature to probe as");
}

/// The scan is not vacuous: the DM's view of the same duel trips it.
#[test]
fn the_scan_catches_the_dm_view() {
    let duel = fixtures()
        .into_iter()
        .find(|path| path.file_stem().is_some_and(|stem| stem == "duel"))
        .expect("contract/fixtures/duel.jsonl");
    let mut server = Server::new();
    let mut party = BTreeSet::new();
    for request in requests(&duel) {
        let response: Value = serde_json::from_str(&server.handle_line(&request)).unwrap();
        party_handles(&response, &mut party);
    }
    let viewer = party
        .first()
        .expect("the duel has a party creature")
        .clone();
    let state = call(
        &mut server,
        json!({"v": 1, "id": "dm-state", "viewer": "dm", "cmd": "get_state"}),
    );
    let events = call(
        &mut server,
        json!({"v": 1, "id": "dm-events", "viewer": "dm", "cmd": "events", "since": 0}),
    );
    let state_leaks = leaks(&viewer, &state);
    let event_leaks = leaks(&viewer, &events);
    assert!(
        state_leaks
            .iter()
            .any(|leak| leak.ends_with(".hp of goblin")),
        "{state_leaks:#?}"
    );
    assert!(
        event_leaks.iter().any(|leak| leak.ends_with(".against")),
        "{event_leaks:#?}"
    );
    assert!(
        event_leaks
            .iter()
            .any(|leak| leak.contains("names a target number")),
        "{event_leaks:#?}"
    );
}

/// Every `summary` on an option, wherever it occurs in a response.
fn summaries(value: &Value, out: &mut BTreeSet<String>) {
    match value {
        Value::Object(map) => {
            if map.contains_key("option_id")
                && let Some(summary) = map.get("summary").and_then(Value::as_str)
            {
                out.insert(summary.to_string());
            }
            map.values().for_each(|value| summaries(value, out));
        }
        Value::Array(items) => items.iter().for_each(|value| summaries(value, out)),
        _ => {}
    }
}

/// An option's `summary` is the rule's own text and reaches players as it is (protocol.md §5), so
/// it may carry no DC, no odds and no target number (Rule 3): checked on every summary the
/// fixtures make the engine send.
#[test]
fn option_summaries_name_no_dc_odds_or_target_number() {
    let mut found = BTreeSet::new();
    for path in fixtures() {
        let mut server = Server::new();
        for request in requests(&path) {
            let response: Value = serde_json::from_str(&server.handle_line(&request)).unwrap();
            summaries(&response, &mut found);
        }
    }
    assert!(found.len() >= 30, "summaries sent: {}", found.len());
    for summary in &found {
        assert!(!names_a_target_number(summary), "{summary}");
        for banned in ["DC", "%", "average", "chance"] {
            assert!(!summary.contains(banned), "{banned} in {summary}");
        }
    }
}
