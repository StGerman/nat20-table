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
    /// The ids the scene does define, after an unknown id (`unknown_anchor`, `unknown_check`,
    /// `unknown_encounter`). Sent to the DM only, because ids are scenario data.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub known_ids: Vec<String>,
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
    /// The encounter id is not declared by the scene.
    UnknownEncounter,
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
    /// `end_combat{surrender}` while the running encounter's surrender condition does not hold,
    /// or for an encounter that declares none. Nothing changed. Not retryable as it stands; the
    /// condition may hold later in the fight.
    SurrenderNotAvailable,
    /// The command is in the contract but this engine build does not implement it yet.
    NotImplemented,
    /// The scene file, or a pregen or stat block it names, is missing or invalid. Nothing changed.
    BadScene,
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
    /// The actor lacks the resource (slot, use, movement) the option costs, or the Hit Point Dice
    /// a short rest would spend.
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
    /// No route leads to the anchor, creature or point a `move` names.
    NoPath,
    /// The scenario check was already rolled in this scene, by anyone.
    AlreadyAttempted,
    /// The running encounter does not allow this way to end it (`end_combat{scenario}` for an
    /// encounter that does not list `scenario` in its `end_reasons`).
    ConditionNotMet,
    /// The spawn is placed by the engine on its own trigger (a flag at combat start, or a
    /// round); `spawn` places only spawns declared `when: dm`.
    Automatic,
    /// The spawn's creatures are already placed in this scene.
    AlreadySpawned,
    /// The actor lacks the skill proficiency the option needs (Help with a check).
    NotProficient,
    /// The option uses up an item the actor no longer carries (a `use/<item>` option after the
    /// last one is gone).
    NoItemLeft,
}
