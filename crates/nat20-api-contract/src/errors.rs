//! Error codes, reject reasons and the hint that tells an agent what to do instead.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{Awaiting, OptionId};

/// A failed request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ApiError {
    /// Machine-readable failure class.
    pub code: ErrorCode,
    /// Finer reason for `rejected`; absent for other codes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<RejectReason>,
    /// One plain sentence written for a model or a human. Never Rust debug output, and never a
    /// number the request's `viewer` may not see (CLAUDE.md Rule 3).
    pub message: String,
    /// Whether the same request can succeed after the caller changes its input or waits.
    pub retryable: bool,
    /// What the caller can do instead, when the engine knows.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hint: Option<ErrorHint>,
}

/// What the caller can do instead of the failed request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ErrorHint {
    /// Option ids the actor can take at the pending prompt.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub legal_option_ids: Vec<OptionId>,
    /// The pending prompt, e.g. with the current `prompt_id` after `stale_prompt`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub awaiting: Option<Awaiting>,
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
    /// The command is in the contract but this engine build does not implement it yet.
    NotImplemented,
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
