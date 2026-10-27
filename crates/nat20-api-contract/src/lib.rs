//! Engine API contract: the wire types of the nat20-table engine protocol.
//!
//! This crate is the source of truth for the wire (CLAUDE.md Rule 1). It holds types and their
//! doc comments only: no logic, no `nat20_core` types. `npm run gen` exports the JSON Schema
//! bundle from [`Nat20Api`] and generates the TypeScript client types from it.
//!
//! Transport: one JSON object per line on the engine's stdin (a [`Request`]) answered by one
//! JSON object per line on its stdout (a [`Response`]). Ordering, idempotency, lifecycle and
//! visibility rules that a schema cannot express live in `contract/protocol.md`.
//!
//! Modules:
//! - [`envelope`]: requests, responses, every command and its result.
//! - [`state`]: state and sheet views, legal action options, what the engine is waiting on.
//! - [`events`]: the session log and the roll views.
//! - [`errors`]: error codes, reject reasons and hints.
//! - [`scene`]: the scene file the engine and the DM agent both read. Not sent on the wire; it
//!   has its own schema root, [`SceneFile`].
//! - [`pregen`]: the pregenerated character file a scene names. Not sent on the wire; it has its
//!   own schema root, [`PregenFile`].
//! - [`vocab`]: identifiers, geometry and the rules enums the other modules share.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub mod envelope;
pub mod errors;
pub mod events;
pub mod pregen;
pub mod scene;
pub mod state;
pub mod vocab;

pub use envelope::*;
pub use errors::*;
pub use events::*;
pub use pregen::*;
pub use scene::*;
pub use state::*;
pub use vocab::*;

/// Protocol name returned by `hello`.
pub const PROTOCOL_NAME: &str = "nat20-api";
/// Protocol major version; every request carries it as `v`.
pub const PROTOCOL_MAJOR: u8 = 1;
/// Full contract version (semver). Bump with every change and log it in `contract/CHANGELOG.md`.
pub const CONTRACT_VERSION: &str = "1.0.0-dev.35";

/// The protocol major version. Only `1` exists; any other value is rejected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "u8", into = "u8")]
pub struct V1(u8);

impl V1 {
    /// The only valid value.
    pub const CURRENT: V1 = V1(PROTOCOL_MAJOR);
}

impl TryFrom<u8> for V1 {
    type Error = String;
    fn try_from(v: u8) -> Result<Self, String> {
        if v == PROTOCOL_MAJOR {
            Ok(V1(v))
        } else {
            Err(format!(
                "unsupported protocol version {v}; this engine speaks {PROTOCOL_MAJOR}"
            ))
        }
    }
}

impl From<V1> for u8 {
    fn from(v: V1) -> u8 {
        v.0
    }
}

impl JsonSchema for V1 {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "V1".into()
    }
    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        schemars::json_schema!({
            "description": "Protocol major version. Only 1 exists.",
            "type": "integer",
            "const": 1
        })
    }
}

/// Schema root: every type that crosses the wire. Exported by `export-schema`; not itself sent.
#[derive(JsonSchema)]
#[allow(dead_code, missing_docs)]
pub struct Nat20Api {
    pub request: Request,
    pub response: Response,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hello_round_trips() {
        let line = r#"{"v":1,"id":"c-1","viewer":"dm","cmd":"hello"}"#;
        let request: Request = serde_json::from_str(line).unwrap();
        assert_eq!(request.command, Command::Hello);
        assert_eq!(serde_json::to_string(&request).unwrap(), line);
    }

    #[test]
    fn wrong_version_is_rejected_by_type() {
        let error =
            serde_json::from_str::<Request>(r#"{"v":2,"id":"c-1","viewer":"dm","cmd":"hello"}"#)
                .unwrap_err();
        assert!(
            error.to_string().contains("unsupported protocol version 2"),
            "{error}"
        );
    }

    #[test]
    fn unknown_command_names_the_known_ones() {
        let error =
            serde_json::from_str::<Request>(r#"{"v":1,"id":"c-1","viewer":"dm","cmd":"helo"}"#)
                .unwrap_err();
        assert!(
            error.to_string().contains("unknown variant `helo`"),
            "{error}"
        );
    }

    #[test]
    fn submit_round_trips_without_empty_optionals() {
        let line = r#"{"v":1,"id":"c-7","viewer":"bren","cmd":"submit","actor":"bren","prompt_id":"p3","option_id":"melee_attack/longsword","targets":["goblin_1"]}"#;
        let request: Request = serde_json::from_str(line).unwrap();
        let Command::Submit { targets, point, .. } = &request.command else {
            panic!("expected submit, got {:?}", request.command);
        };
        assert_eq!(targets, &[Handle("goblin_1".into())]);
        assert_eq!(point, &None);
        assert_eq!(serde_json::to_string(&request).unwrap(), line);
    }

    #[test]
    fn events_flatten_their_kind() {
        let line = r#"{"seq":4,"round":1,"scene":"mill_yard","visibility":{"scope":"public"},"text":"Bren hits the goblin.","kind":"damage_taken","target":"goblin_1","amount":7,"damage_type":"slashing","source_roll":"r3"}"#;
        let event: Event = serde_json::from_str(line).unwrap();
        assert!(matches!(
            event.kind,
            EventKind::DamageTaken { amount: 7, .. }
        ));
        assert_eq!(serde_json::to_string(&event).unwrap(), line);
    }

    /// CLAUDE.md Rule 3: the player-facing view types do not have hidden fields at all.
    #[test]
    fn player_views_have_no_hidden_fields() {
        let schema = serde_json::to_value(schemars::schema_for!(Nat20Api)).unwrap();
        let keys = |def: &serde_json::Value| -> Vec<String> {
            def["properties"]
                .as_object()
                .unwrap_or_else(|| panic!("no properties in {def}"))
                .keys()
                .cloned()
                .collect()
        };
        let named = |name: &str| keys(&schema["$defs"][name]);
        let variant = |name: &str, tag: &str, value: &str| -> Vec<String> {
            let variants = schema["$defs"][name]["oneOf"]
                .as_array()
                .unwrap_or_else(|| panic!("{name} is not a tagged enum"));
            let found = variants
                .iter()
                .find(|v| v["properties"][tag]["const"] == value)
                .unwrap_or_else(|| panic!("{name} has no {tag}={value} variant"));
            keys(found)
        };
        let hidden = [
            "hp",
            "hp_max",
            "temp_hp",
            "ac",
            "against",
            "modifiers",
            "dc",
            "dc_source",
            "hp_after",
            "flags",
            "checks",
            "encounters",
            "surrender_available",
            "advantage_sources",
        ];
        let player_views = [
            ("CreatureObserved", named("CreatureObserved")),
            ("RollView::Player", variant("RollView", "view", "player")),
            ("State::Player", variant("State", "view", "player")),
        ];
        for (name, fields) in &player_views {
            for field in hidden {
                assert!(
                    !fields.iter().any(|f| f == field),
                    "{name} carries hidden field {field}"
                );
            }
        }
        for field in ["hp", "hp_max", "ac"] {
            assert!(named("CreatureFull").iter().any(|f| f == field));
        }
        assert!(
            variant("RollView", "view", "full")
                .iter()
                .any(|f| f == "against")
        );
    }
}
