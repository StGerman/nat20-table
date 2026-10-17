//! The `visibility` CI job (design §5.3, `contract/protocol.md` §5): replays every
//! `contract/fixtures/*.jsonl` and, after each step, asks for `get_state` and `events since 0` as
//! every party creature's player viewer. Nothing a player may not know may appear in what that
//! player receives: another creature's HP, max HP, temp HP or AC; any roll target (`against`,
//! `dc`, `dc_source`) or roll modifiers; a DM-only or another owner's event; another creature's
//! `hit_points` event; an AC or DC number in free text.
//!
//! The probes are read-only, so the replay follows the fixture's own path. Run alone:
//! `cargo test --locked -p nat20-api-server --test visibility`.

use std::{collections::BTreeSet, fs, path::PathBuf};

use nat20_api_server::Server;
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

/// True when `text` carries a number right after "AC" or "DC", as in "vs AC 15" or "DC 12".
fn names_a_target_number(text: &str) -> bool {
    ["AC ", "DC "].iter().any(|word| {
        text.match_indices(word).any(|(at, _)| {
            let before = text[..at].chars().next_back();
            let after = text[at + word.len()..].chars().next();
            !before.is_some_and(char::is_alphanumeric) && after.is_some_and(|c| c.is_ascii_digit())
        })
    })
}

/// Every leak of hidden data in `response` as seen by player `viewer`; empty when clean.
fn leaks(viewer: &str, response: &Value) -> Vec<String> {
    let mut found = Vec::new();
    scan(viewer, response, "$", &mut found);
    found
}

fn scan(viewer: &str, node: &Value, path: &str, found: &mut Vec<String>) {
    match node {
        Value::Object(map) => {
            let handle = map.get("handle").and_then(Value::as_str);
            if handle.is_some_and(|handle| handle != viewer) {
                for hidden in ["hp", "hp_max", "temp_hp", "ac"] {
                    if map.contains_key(hidden) {
                        found.push(format!("{path}.{hidden} of {}", handle.unwrap()));
                    }
                }
            }
            for hidden in ["against", "dc", "dc_source"] {
                if map.contains_key(hidden) {
                    found.push(format!("{path}.{hidden}"));
                }
            }
            if let Some(view) = map.get("view").and_then(Value::as_str) {
                if view != "player" {
                    found.push(format!("{path}.view is {view:?}"));
                }
                if map.contains_key("modifiers") {
                    found.push(format!("{path}.modifiers"));
                }
            }
            if let Some(visibility) = map.get("visibility") {
                let scope = visibility.get("scope").and_then(Value::as_str);
                let owner = visibility.get("handle").and_then(Value::as_str);
                if scope == Some("dm") || (scope == Some("owner") && owner != Some(viewer)) {
                    found.push(format!("{path} has visibility {visibility}"));
                }
            }
            if map.get("kind").and_then(Value::as_str) == Some("hit_points")
                && map.get("target").and_then(Value::as_str) != Some(viewer)
            {
                found.push(format!("{path} is another creature's hit_points event"));
            }
            for (key, value) in map {
                scan(viewer, value, &format!("{path}.{key}"), found);
            }
        }
        Value::Array(items) => {
            for (index, value) in items.iter().enumerate() {
                scan(viewer, value, &format!("{path}[{index}]"), found);
            }
        }
        Value::String(text) if names_a_target_number(text) => {
            found.push(format!("{path} names a target number: {text:?}"));
        }
        _ => {}
    }
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

#[test]
fn target_numbers_in_text_are_recognised() {
    assert!(names_a_target_number("Bren hits: 18 vs AC 15."));
    assert!(names_a_target_number("DC 12 Wisdom (Perception)"));
    assert!(!names_a_target_number("Bren hits the goblin for 7 damage."));
    assert!(!names_a_target_number("ABC 12"));
}
