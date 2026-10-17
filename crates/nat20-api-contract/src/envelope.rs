//! The request and response envelope, every command and the typed result of each.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    Ability, ApiError, Awaiting, Event, Handle, OptionId, PointFt, PromptId, RollId, Sheet, Skill,
    State, V1, Viewer,
    state::{ActionOption, UnavailableOption},
};

/// One request line sent to the engine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Request {
    /// Protocol major version.
    pub v: V1,
    /// Client-unique request id. A repeated id returns the stored response and does not execute again.
    pub id: String,
    /// Who the response is for: `dm` or a creature handle. Selects the projection of every state,
    /// sheet and event in the response (`contract/protocol.md` §5). A player agent's tools bind it
    /// to that agent's own handle.
    pub viewer: Viewer,
    /// The command and its fields, tagged by `cmd`.
    #[serde(flatten)]
    pub command: Command,
}

/// Every command the engine accepts, tagged by `cmd`.
///
/// Variants are unit or struct variants, never newtype variants (CLAUDE.md Rule 1).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum Command {
    /// Handshake: protocol name, versions and the schema hash. Clients refuse to start on a hash mismatch.
    Hello,
    /// Starts a session: an empty log and no scene. Replaces any running session.
    NewSession {
        /// Dice seed. The same seed and the same request stream give an identical log. When
        /// omitted, the engine picks one and logs it in `session_started`; replaying with that
        /// seed reproduces the session. Every value, 0 included, is a real seed.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        seed: Option<u32>,
    },
    /// Loads a scene from the scenario and enters explore mode, in the session's one engine.
    /// Creatures in `party` carry over; every other creature of the previous scene leaves.
    /// Refused with `wrong_mode` while a fight is running.
    LoadScene {
        /// Scene id from the scenario file.
        scene_id: String,
        /// Creatures carried in from the previous scene, with their HP, resources and conditions,
        /// placed at the scene's `party_start` anchors in order (the last anchor takes any extra).
        /// Empty for a scene that places its own creatures; required by a scene that places none.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        party: Vec<Handle>,
    },
    /// The current state, projected for the request's `viewer`.
    GetState,
    /// A creature's full sheet. Only its owner and `dm` may ask; anyone else gets `not_visible`.
    /// Read-only: it rolls nothing and logs no event.
    GetSheet {
        /// Whose sheet.
        actor: Handle,
    },
    /// The options the actor can take at the pending action prompt.
    /// Returns `not_your_turn` when the engine is waiting on someone else.
    LegalActions {
        /// The creature whose options are listed.
        actor: Handle,
    },
    /// Takes one option at the pending action prompt.
    Submit {
        /// The acting creature; must be `awaiting.actor`.
        actor: Handle,
        /// The pending prompt's id. An old id is rejected with `stale_prompt` and changes nothing.
        prompt_id: PromptId,
        /// One of the option ids `legal_actions` returned for this prompt.
        option_id: OptionId,
        /// Targets, for options whose `targeting` is `single` or `multiple`.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        targets: Vec<Handle>,
        /// Target point, for options whose `targeting` is `point`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        point: Option<PointFt>,
        /// One of the option's `variants`, when it has any (e.g. a spell's casting level).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        variant: Option<String>,
    },
    /// Answers the pending reaction prompt.
    React {
        /// The reacting creature; must be `awaiting.actor`.
        actor: Handle,
        /// The pending prompt's id.
        prompt_id: PromptId,
        /// The `choice` of one of the prompt's options, or absent to decline.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        choice: Option<u32>,
    },
    /// Ends the actor's turn.
    EndTurn {
        /// The acting creature; must be `awaiting.actor`.
        actor: Handle,
        /// The pending prompt's id.
        prompt_id: PromptId,
    },
    /// Moves a creature along a route on the map. In explore mode the walk costs no movement
    /// and provokes nobody. In combat it is a decision at the actor's action prompt: the whole
    /// route must fit in the movement left, and an opportunity attack stops the creature where
    /// it provoked one. No route answers `rejected` with `no_path`.
    Move {
        /// The creature that moves.
        actor: Handle,
        /// Where to.
        to: MoveTarget,
        /// The pending prompt's id. Required in combat, ignored in explore mode.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        prompt_id: Option<PromptId>,
    },
    /// Asks the engine to roll an ability check or saving throw in explore mode. The engine rolls
    /// and decides success, and applies the scenario check's consequences. Each scenario check is
    /// rolled at most once per scene, by anyone; a second request answers `rejected` with
    /// `already_attempted`. Advantage comes only from what the engine knows, never from the caller.
    RequestCheck {
        /// The creature that makes the check.
        actor: Handle,
        /// Which check.
        check: CheckSpec,
    },
    /// A short rest. Each participant may spend Hit Point Dice.
    ShortRest {
        /// The creatures that rest.
        participants: Vec<Handle>,
        /// Hit Point Dice to spend per creature. A creature not listed spends none.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        hit_dice: Vec<HitDiceSpend>,
    },
    /// Starts one of the scene's encounters: rolls initiative for its participants and enters
    /// combat mode. Participants, surprise, surrender and end reasons come from the scene file,
    /// never from the caller (decision D4).
    StartCombat {
        /// Encounter id from the scene file.
        encounter_id: String,
    },
    /// Ends the running fight early, only for a reason its encounter allows: `surrender` while
    /// its surrender condition holds, `scenario` when it lists that end reason. A fight that ends
    /// by itself (a side is down) needs no `end_combat`: the scene is already back in explore mode.
    EndCombat {
        /// Why combat ends.
        reason: EndCombatReason,
    },
    /// Places creatures the scene declares under a spawn id.
    Spawn {
        /// Spawn id from the scene file.
        spawn_id: String,
    },
    /// Log entries after `since`, projected for the request's `viewer`.
    Events {
        /// The `seq` to read after; `0` reads from the start.
        since: u64,
    },
}

/// Where a `move` goes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MoveTarget {
    /// A named landmark the scene defines, e.g. `millwheel`.
    Anchor {
        /// Anchor id from the scene.
        anchor: String,
    },
    /// Within 5 feet of a creature.
    Creature {
        /// The creature to move next to.
        handle: Handle,
    },
    /// An exact point.
    Point {
        /// The point, in feet.
        point: PointFt,
    },
}

/// Which check `request_check` rolls.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CheckSpec {
    /// A check the scenario defines, with its skill or saving throw and its DC. Rolled at most
    /// once per scene.
    Scenario {
        /// Check id from the scene.
        check_id: String,
    },
    /// A check the DM picks from the SRD DC ladder (5 very easy to 30 nearly impossible) when no
    /// scenario check fits. Not limited per scene.
    Ladder {
        /// The ability; it must be the skill's own ability.
        ability: Ability,
        /// The skill. A check without one answers `not_implemented`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        skill: Option<Skill>,
        /// The DC: one of 5, 10, 15, 20, 25, 30; anything else is a `bad_request`.
        dc: u8,
    },
}

/// Hit Point Dice one creature spends on a short rest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct HitDiceSpend {
    /// The creature.
    pub handle: Handle,
    /// How many dice to spend.
    pub count: u32,
}

/// Why the DM ends combat early.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EndCombatReason {
    /// The encounter's surrender condition holds and the DM calls the surrender. Its surrendering
    /// creatures that are still conscious become `neutral` and stay in the scene.
    Surrender,
    /// The other side fled. Not served yet (`not_implemented`).
    Fled,
    /// The story ends the fight; the encounter must list `scenario` in its `end_reasons`.
    Scenario,
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
    /// The log entries this request produced, projected for the request's `viewer`. Empty on error.
    pub events: Vec<Event>,
    /// Who the engine waits on next. Never projected away: everyone may know whose turn it is.
    pub awaiting: Awaiting,
    /// The session log length after this request; pass it to `events.since` to read on from here.
    pub log_head: u64,
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
        /// SHA-256 over `generated/nat20-api.schema.json` followed by `generated/nat20-scene.schema.json`.
        /// Clients compare it with the hash they were generated from.
        schema_sha256: String,
    },
    /// The new session.
    NewSession {
        /// Session id, logged in `session_started`.
        session_id: String,
        /// The dice seed in use, given or picked.
        seed: u32,
    },
    /// The state after the scene loaded.
    LoadScene {
        /// Projected for the request's `viewer`.
        state: State,
    },
    /// The current state.
    GetState {
        /// Projected for the request's `viewer`.
        state: State,
    },
    /// A full sheet.
    GetSheet {
        /// The sheet.
        sheet: Sheet,
    },
    /// The actor's options at the pending prompt.
    LegalActions {
        /// The prompt these options belong to; echo it in `submit` and `end_turn`.
        prompt_id: PromptId,
        /// Options the actor can take now.
        options: Vec<ActionOption>,
        /// Options the actor has but cannot take now, with the reason.
        unavailable: Vec<UnavailableOption>,
        /// Whether `end_turn` is accepted now.
        can_end_turn: bool,
    },
    /// The option was taken; its rolls and effects are in `events`.
    Submit {},
    /// The reaction was taken or declined; its rolls and effects are in `events`.
    React {},
    /// The turn ended; the next prompt is in `awaiting`.
    EndTurn {},
    /// The move happened.
    Move {
        /// Distance moved, in feet; less than the route when an opportunity attack stopped it.
        moved_ft: f32,
        /// Creatures that got an opportunity attack prompt from this move, in prompt order.
        provoked: Vec<Handle>,
    },
    /// The check's roll and outcome.
    RequestCheck {
        /// The roll, also in `events`.
        roll_id: RollId,
        /// The check total.
        total: i32,
        /// Whether the check succeeded. The engine decides, never the caller.
        success: bool,
    },
    /// Hit Points regained on the short rest.
    ShortRest {
        /// One entry per participant.
        healed: Vec<HitPointsRegained>,
    },
    /// The state after initiative, in combat mode.
    StartCombat {
        /// Projected for the request's `viewer`.
        state: State,
    },
    /// The state after combat ended, in explore mode.
    EndCombat {
        /// Projected for the request's `viewer`.
        state: State,
    },
    /// The state after the spawn.
    Spawn {
        /// Projected for the request's `viewer`.
        state: State,
        /// Handles of the creatures placed.
        handles: Vec<Handle>,
    },
    /// Log entries after `since`.
    Events {
        /// Projected for the request's `viewer`. Entries the viewer may not see are left out.
        events: Vec<Event>,
        /// Pass as `since` to read on from here.
        next: u64,
    },
}

/// Hit Points one creature regained.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct HitPointsRegained {
    /// The creature.
    pub handle: Handle,
    /// Hit Points regained.
    pub amount: u32,
}
