//! Replays every `contract/fixtures/*.jsonl` against a fresh `Server` and requires exact responses.
//!
//! Fixture line: `{"request": {...}, "response": {...}}`, or `"request_raw": "..."` for a line that
//! is not valid JSON. `$SCHEMA_SHA256`, `$ENGINE_REV` and `$CONTRACT_VERSION` in a response are
//! replaced with this build's values. Run one fixture: `cargo test --test conformance -- <name>`.

use std::{fs, path::PathBuf};

use nat20_api_contract::CONTRACT_VERSION;
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
        }
        ran += 1;
    }
    assert!(ran > 0, "no fixture matched");
}

#[test]
fn core_registries_load_through_the_adapter() {
    assert!(adapter::loaded_class_count() > 0);
}
