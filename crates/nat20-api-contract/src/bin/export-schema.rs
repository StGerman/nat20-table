//! Prints one JSON Schema bundle to stdout: the wire contract (`api`, the default), the scene
//! file (`scene`) or the pregen file (`pregen`). `npm run gen` writes them to
//! `generated/nat20-api.schema.json`, `generated/nat20-scene.schema.json` and
//! `generated/nat20-pregen.schema.json`.

use nat20_api_contract::{
    CONTRACT_VERSION, Nat20Api, PROTOCOL_MAJOR, PROTOCOL_NAME, PregenFile, SceneFile,
};

fn main() {
    let which = std::env::args().nth(1).unwrap_or_else(|| "api".into());
    let (mut schema, title) = match which.as_str() {
        "api" => (schemars::schema_for!(Nat20Api), "Nat20Api"),
        "scene" => (schemars::schema_for!(SceneFile), "SceneFile"),
        "pregen" => (schemars::schema_for!(PregenFile), "PregenFile"),
        other => {
            eprintln!("unknown schema {other:?}; expected `api`, `scene` or `pregen`");
            std::process::exit(2);
        }
    };
    schema.insert("title".into(), title.into());
    schema.insert(
        "x-nat20-protocol".into(),
        serde_json::json!({ "name": PROTOCOL_NAME, "major": PROTOCOL_MAJOR, "version": CONTRACT_VERSION }),
    );
    println!(
        "{}",
        serde_json::to_string_pretty(&schema).expect("schema serializes")
    );
}
