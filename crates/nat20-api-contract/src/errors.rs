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
    /// `place_creature` names a stat block the registry doesn't have.
    UnknownStatBlock,
    /// A world command (`travel`) before `start_campaign`.
    NoCampaign,
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
    /// `new_session` with a roster this engine cannot read (another format, a pregen it has no
    /// file for), or a scene whose roster character cannot be rebuilt. Nothing changed.
    BadRoster,
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
    /// The area option's aim catches no creature, so nothing is cast and nothing is spent.
    AreaEmpty,
    /// The creature does not carry that item, or carries it only worn or wielded.
    NotCarried,
    /// The purse holds less than the coins asked for, counted in copper with change.
    InsufficientFunds,
    /// `loot` of a creature that is neither down nor surrendered.
    NotFallen,
    /// `loot` of a creature that carries nothing.
    NothingCarried,
    /// `place_creature` finds no free spot within 10 feet of where it was asked to place.
    NoRoom,
    /// `travel` by someone who doesn't drive the caravan: not its owner, or not in the party
    /// when an NPC owns it.
    NotDriver,
    /// `travel` to a place or road no road from here leads to, or, without `to`, an NPC
    /// owner's route with no next place.
    NoRoad,
    /// `travel` at a pace faster than the road or the party allows; the message names the
    /// fastest.
    PaceTooFast,
    /// `travel` after the day's distance is spent; a night's rest starts a new day.
    DayOver,
    /// `travel` while a wagon carries more than its limit.
    Overloaded,
    /// `rest_night{where: inn}` where the caravan is not at a place with an inn.
    NoInn,
    /// `travel`, `rest_night`, `pass_time` or `scout` while a road card waits for its
    /// decision, or while a draw's cards wait for the DM's pick (API-53).
    CardPending,
    /// `choose_card` or `own_move` with no card on the table, also while a draw's cards wait
    /// for the DM's pick.
    NoCard,
    /// `pick_card` when no cards are offered, or with a card that is not one of them (API-53),
    /// or a fallback pick of any card but the first offered (ENG-42).
    CardNotOffered,
    /// `choose_card` by a creature with no say on this card, `own_move` for one, `scout` by a creature that is
    /// not a Hired Blade, or `choose_card`, `scout`, `level_up` or `answer_level_up` not sent
    /// as the actor itself.
    NoSay,
    /// `choose_card` by a seat that already spoke on this card, or `own_move` for one.
    AlreadySpoke,
    /// `choose_card` or `own_move` by a player owner before every Hired Blade advised.
    WaitingForAdvice,
    /// `choose_card` with a choice the card does not have, or `own_move` naming a success or
    /// failure the card does not offer.
    UnknownChoice,
    /// `level_up` by a character without the Experience Points for its next level.
    NotEnoughXp,
    /// `level_up` while another character's level-up is open (one levels up at a time), a
    /// `load_scene` that leaves the open level-up's character behind, or a `travel` or
    /// `rest_night` while a level-up is open.
    LevelUpOpen,
    /// `answer_level_up` with no level-up open for the actor.
    NoLevelUp,
    /// `pass_time` that would run past midnight: the day ends with `rest_night` (API-50).
    NightFalls,
    /// `answer_level_up` with picks that are not the choice's options, repeat one, or are not
    /// as many as it asks; the message lists the options.
    BadPicks,
    /// `own_move` on a card that already carries an own move (API-56): one per card.
    OwnMoveTaken,
    /// `own_move` whose success and failure are the same choice, or whose failure breaks a
    /// custom (API-56); the message says which, so the DM can correct it.
    BadOwnMove,
}
