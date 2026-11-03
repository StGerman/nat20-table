//! Replays every `contract/fixtures/*.jsonl` against a fresh `Server` and requires exact responses.
//!
//! Fixture line: `{"request": {...}, "response": {...}}`, or `"request_raw": "..."` for a line that
//! is not valid JSON. `$SCHEMA_SHA256`, `$ENGINE_REV` and `$CONTRACT_VERSION` in a response are
//! replaced with this build's values. Run one fixture: `cargo test --test conformance -- <name>`.

use std::{fs, path::PathBuf};

use nat20_api_contract::{CONTRACT_VERSION, events::Event};
use nat20_api_server::{Server, adapter, server::SCHEMA_SHA256};
use serde_json::Value;

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

fn substitute(expected: &str) -> String {
    expected
        .replace("$SCHEMA_SHA256", SCHEMA_SHA256.trim())
        .replace("$ENGINE_REV", adapter::engine_rev())
        .replace("$CONTRACT_VERSION", CONTRACT_VERSION)
}

#[test]
fn fixtures_replay_exactly() {
    let filter = std::env::args().skip(1).find(|arg| !arg.starts_with('-'));
    let mut ran = 0;
    for path in fixtures() {
        let name = path.file_stem().unwrap().to_string_lossy().to_string();
        if filter
            .as_deref()
            .is_some_and(|wanted| !name.contains(wanted))
        {
            continue;
        }
        let mut server = Server::new();
        for (index, line) in fs::read_to_string(&path).unwrap().lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }
            let step: Value = serde_json::from_str(line).unwrap_or_else(|error| {
                panic!("{name}:{}: fixture line is not JSON: {error}", index + 1)
            });
            let request = match (step.get("request"), step.get("request_raw")) {
                (Some(request), None) => request.to_string(),
                (None, Some(Value::String(raw))) => raw.clone(),
                _ => panic!(
                    "{name}:{}: needs exactly one of `request` or `request_raw`",
                    index + 1
                ),
            };
            let expected: Value =
                serde_json::from_str(&substitute(&step["response"].to_string())).unwrap();
            let actual: Value = serde_json::from_str(&server.handle_line(&request)).unwrap();
            assert_eq!(
                actual,
                expected,
                "{name}:{}: response differs for request {request}",
                index + 1
            );
            // The coin trial balance holds after every step (AGT-78).
            assert_eq!(
                server.ledger_mismatches(),
                Vec::<String>::new(),
                "{name}:{}: the ledger and the purses disagree",
                index + 1
            );
        }
        ran += 1;
    }
    assert!(ran > 0, "no fixture matched");
}

/// Every event a fixture expects reads into the contract's `Event`. A variant field that shares a
/// name with one of `Event`'s own (`seq`, `round`, `scene`, `visibility`, `text`) would be one JSON
/// key, because `EventKind` is flattened into `Event`: the line would replay, but no client could
/// read it (`card_drawn` once had a `text` of its own, and the game audit failed on it).
#[test]
fn fixture_events_read_into_events() {
    let mut read = 0;
    for path in fixtures() {
        let text = fs::read_to_string(&path).unwrap();
        for (index, line) in text
            .lines()
            .enumerate()
            .filter(|(_, l)| !l.trim().is_empty())
        {
            let fixture: Value = serde_json::from_str(line).unwrap();
            let Some(events) = fixture
                .pointer("/response/events")
                .and_then(Value::as_array)
            else {
                continue;
            };
            for event in events {
                let parsed: Event = serde_json::from_value(event.clone()).unwrap_or_else(|error| {
                    panic!("{} line {}: {error}: {event}", path.display(), index + 1)
                });
                assert_eq!(
                    Some(parsed.text.as_str()),
                    event.get("text").and_then(Value::as_str),
                    "{} line {}: the event's text did not survive",
                    path.display(),
                    index + 1
                );
                read += 1;
            }
        }
    }
    assert!(read > 0, "no fixture events read");
}

#[test]
fn core_registries_load_through_the_adapter() {
    assert!(adapter::loaded_class_count() > 0);
}
