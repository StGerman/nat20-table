//! Prints the JSON Schema bundle for the whole wire contract to stdout.
//! `npm run gen` writes it to `generated/nat20-api.schema.json`.

use nat20_api_contract::{CONTRACT_VERSION, Nat20Api, PROTOCOL_MAJOR, PROTOCOL_NAME};

fn main() {
    let mut schema = schemars::schema_for!(Nat20Api);
    schema.insert("title".into(), "Nat20Api".into());
    schema.insert(
        "x-nat20-protocol".into(),
        serde_json::json!({ "name": PROTOCOL_NAME, "major": PROTOCOL_MAJOR, "version": CONTRACT_VERSION }),
    );
    println!(
        "{}",
        serde_json::to_string_pretty(&schema).expect("schema serializes")
    );
}
