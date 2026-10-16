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
//! Status: contract v1 under construction. CON-1 ships the envelope, `hello` and the error
//! model; CON-2 backfills the remaining v1 commands from the accepted v1 draft.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Protocol name returned by `hello`.
pub const PROTOCOL_NAME: &str = "nat20-api";
/// Protocol major version; every request carries it as `v`.
pub const PROTOCOL_MAJOR: u8 = 1;
/// Full contract version (semver). Bump with every change and log it in `contract/CHANGELOG.md`.
pub const CONTRACT_VERSION: &str = "1.0.0-dev.1";

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

/// One request line sent to the engine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Request {
    /// Protocol major version.
    pub v: V1,
    /// Client-unique request id. A repeated id returns the stored response and does not execute again.
    pub id: String,
    /// The command and its fields, tagged by `cmd`.
    #[serde(flatten)]
    pub command: Command,
}

/// Every command the engine accepts, tagged by `cmd`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum Command {
    /// Handshake: protocol name, versions and the schema hash. Clients refuse to start on a hash mismatch.
    Hello,
}

/// One response line written by the engine, answering exactly one [`Request`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Response {
    /// Protocol major version.
    pub v: V1,
    /// The request id this answers; `null` only when the request line was too malformed to read an id.
    pub id: Option<String>,
    /// `true` when the command succeeded and `result` is set; `false` when `error` is set.
    pub ok: bool,
    /// The command's result, tagged by the same `cmd` as the request. Set when `ok` is true.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<CommandResult>,
    /// Why the command failed. Set when `ok` is false.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ApiError>,
}

/// The typed result of each command, tagged by `cmd`.
///
/// Variants are struct variants, never newtype variants: schemars renders a tagged newtype variant
/// as `$ref` plus sibling keywords, which the TS generator drops, losing the tag.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum CommandResult {
    /// What the engine says about itself on `hello`.
    Hello {
        /// Always `nat20-api`.
        protocol: String,
        /// Full contract version (semver), e.g. `1.0.0`.
        version: String,
        /// The `nat20_core` revision the engine was built against.
        engine_rev: String,
        /// SHA-256 of `generated/nat20-api.schema.json`. Clients compare it with the hash they were generated from.
        schema_sha256: String,
    },
}

/// A failed request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ApiError {
    /// Machine-readable failure class.
    pub code: ErrorCode,
    /// Finer reason for `rejected`; absent for other codes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<RejectReason>,
    /// One plain sentence written for a model or a human. Never Rust debug output.
    pub message: String,
    /// Whether the same request can succeed after the caller changes its input or waits.
    pub retryable: bool,
}

/// Machine-readable failure classes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    /// Malformed JSON, a missing or wrongly typed field, or an unknown `cmd`.
    BadRequest,
    /// `v` is not a version this engine speaks.
    UnsupportedVersion,
    /// The command needs a session and none exists.
    NoSession,
    /// The command needs a loaded scene and none is loaded.
    NoScene,
    /// The creature handle is not in this scene.
    UnknownCreature,
    /// The option id is not offered by the current prompt.
    UnknownOption,
    /// The check id is not defined by the scene.
    UnknownCheck,
    /// The anchor id is not defined by the scene.
    UnknownAnchor,
    /// The spawn id is not declared by the scene.
    UnknownSpawn,
    /// The actor is not the one the engine is waiting on.
    NotYourTurn,
    /// The prompt id does not match the pending prompt.
    StalePrompt,
    /// The viewer may not see what it asked for.
    NotVisible,
    /// A combat command in explore mode, or the reverse.
    WrongMode,
    /// The engine refused a well-formed decision; see `reason`.
    Rejected,
    /// An engine bug. The request did nothing; details go to stderr.
    Internal,
}

/// Why the engine refused a well-formed decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RejectReason {
    /// The target is beyond the option's range.
    OutOfRange,
    /// No creature can be targeted by this option.
    NoValidTarget,
    /// The chosen target cannot be targeted by this option.
    InvalidTarget,
    /// The actor lacks the resource (slot, use, movement) the option costs.
    InsufficientResource,
    /// The action type has already been used this turn.
    ActionAlreadyUsed,
    /// A condition on the actor prevents the option.
    ConditionPrevents,
    /// The actor does not know this spell or feature.
    NotKnown,
    /// The option needs a target.
    NeedsTarget,
    /// The option needs a point.
    NeedsPoint,
    /// The option needs a variant.
    NeedsVariant,
}

/// Schema root: every type that crosses the wire. Exported by `export-schema`; not itself sent.
///
/// Its fields carry no doc comments on purpose: a description next to a `$ref` makes the TS
/// generator emit duplicate types (`Request1`, `Response1`).
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
        let line = r#"{"v":1,"id":"c-1","cmd":"hello"}"#;
        let request: Request = serde_json::from_str(line).unwrap();
        assert_eq!(request.command, Command::Hello);
        assert_eq!(serde_json::to_string(&request).unwrap(), line);
    }

    #[test]
    fn wrong_version_is_rejected_by_type() {
        let error =
            serde_json::from_str::<Request>(r#"{"v":2,"id":"c-1","cmd":"hello"}"#).unwrap_err();
        assert!(
            error.to_string().contains("unsupported protocol version 2"),
            "{error}"
        );
    }

    #[test]
    fn unknown_command_names_the_known_ones() {
        let error =
            serde_json::from_str::<Request>(r#"{"v":1,"id":"c-1","cmd":"helo"}"#).unwrap_err();
        assert!(
            error.to_string().contains("unknown variant `helo`"),
            "{error}"
        );
    }
}
