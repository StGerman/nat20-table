//! The request and response envelope, every command and the typed result of each.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    Ability, ApiError, Awaiting, Event, Handle, OptionId, PointFt, PromptId, RollId, Sheet, Skill,
    State, V1, Viewer,
    state::{ActionOption, TurnBudget, UnavailableOption},
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
    /// The options the actor can take at the pending action prompt. Only its owner and `dm` may
    /// ask; anyone else gets `not_visible`. Returns `not_your_turn` when the engine is waiting on
    /// someone else.
    LegalActions {
        /// The creature whose options are listed. In explore mode any creature of the scene:
        /// the options it could take on a turn of its own, as if that turn began now.
        actor: Handle,
    },
    /// Takes one option at the pending action prompt, or, in explore mode, as a turn of the
    /// actor's own.
    Submit {
        /// The acting creature; in combat it must be `awaiting.actor`.
        actor: Handle,
        /// In combat, the pending prompt's id: required, and an old id is rejected with
        /// `stale_prompt` and changes nothing. In explore mode leave it out; a submit that carries
        /// one there is a late combat decision and answers `wrong_mode`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        prompt_id: Option<PromptId>,
        /// One of the option ids `legal_actions` returned for this prompt.
        option_id: OptionId,
        /// Targets, for options whose `targeting` is `single` or `multiple`.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        targets: Vec<Handle>,
        /// Target point, for options whose `targeting` is `point`. For an `area` option it means
        /// the same as `aim: {kind: point}`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        point: Option<PointFt>,
        /// Where an `area` option is aimed. Required for one; an aim that catches no creature is
        /// rejected with `area_empty` and spends nothing.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        aim: Option<Aim>,
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
    /// route must fit in the movement left, unless `partial` is set, and an opportunity attack
    /// pauses the creature where it provoked one; it walks on once the reaction is resolved
    /// (protocol §4.1). No route answers `rejected` with `no_path`.
    Move {
        /// The creature that moves.
        actor: Handle,
        /// Where to.
        to: MoveTarget,
        /// The pending prompt's id. Required in combat, ignored in explore mode.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        prompt_id: Option<PromptId>,
        /// Walk as far as movement allows: a route longer than the movement left is walked to
        /// the last free spot the movement reaches, and the result's `reached` says it stopped
        /// short. Without it (the default) such a move is refused with `insufficient_resource`
        /// and changes nothing; so is a partial move that can't get anywhere.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        partial: bool,
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
    /// A Short Rest, in explore mode only (rolling Initiative interrupts a rest, so combat
    /// answers `wrong_mode`). Every participant needs at least 1 Hit Point (`rejected` with
    /// `condition_prevents` otherwise). Each one spends the Hit Point Dice `hit_dice` gives it,
    /// then short-rest resources recharge. A refused rest changes nothing.
    ShortRest {
        /// The creatures that rest, each listed once.
        participants: Vec<Handle>,
        /// Hit Point Dice to spend per participant, declared up front. A participant not listed
        /// spends none.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        hit_dice: Vec<HitDiceSpend>,
    },
    /// Starts one of the scene's encounters: rolls initiative for its participants and enters
    /// combat mode. Participants, surprise, surrender and end reasons come from the scene file,
    /// never from the caller (decision D4). When the encounter's surprise flag is set, the
    /// surprised side rolls initiative with Disadvantage.
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
    /// Places the creatures of a spawn the scene declares `when: dm`, each at its own placement.
    /// A spawn is placed at most once per scene (`rejected` / `already_spawned`); one the engine
    /// places on its own trigger answers `rejected` / `automatic`. During a fight the creatures
    /// join it: each rolls initiative and acts at its place in the order, this round if its
    /// count has not come up yet, otherwise from the next. A pending prompt keeps its id. After a
    /// fight they join a later one only if its encounter lists them.
    Spawn {
        /// Spawn id from the scene file.
        spawn_id: String,
    },
    /// The Help action in explore mode; in combat Help is one of the `legal_actions` options.
    /// The helper must be conscious and within 5 feet of the other creature (`rejected` /
    /// `out_of_range` otherwise; `move` there first). The `action` event, the Medicine roll of a
    /// stabilize and any `life_state` change are in `events`. Combat answers `wrong_mode`.
    Help {
        /// The helper.
        actor: Handle,
        /// What kind of help, and for whom.
        help: HelpSpec,
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

/// Where an area is aimed: its centre, or for an area that starts at the actor, the direction it
/// points.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Aim {
    /// At a creature, where it stands.
    Creature {
        /// The creature.
        handle: Handle,
    },
    /// At a named landmark the scene defines.
    Anchor {
        /// Anchor id from the scene.
        anchor: String,
    },
    /// At an exact point.
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

/// What a `help` does (SRD 5.2.1, Rules Glossary, Help).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum HelpSpec {
    /// Gives `ally` Advantage on their next ability check with `skill`. The helper needs
    /// proficiency in the skill (`rejected` / `not_proficient` otherwise). The benefit is spent by
    /// that check and ends at the start of the helper's next turn; out of combat that is the
    /// helper's first turn in a fight, or the next scene.
    AssistCheck {
        /// The creature that gets Advantage; not the helper.
        ally: Handle,
        /// The skill of the check.
        skill: Skill,
    },
    /// A DC 10 Wisdom (Medicine) check to make `target`, a creature at 0 Hit Points, Stable.
    /// A target that is not dying answers `rejected` / `invalid_target`.
    Stabilize {
        /// The creature at 0 Hit Points.
        target: Handle,
    },
}

/// Hit Point Dice one creature spends on a short rest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct HitDiceSpend {
    /// The creature: one of the rest's participants, listed once.
    pub handle: Handle,
    /// How many dice to spend. More than it has left answers `rejected` with
    /// `insufficient_resource`. The largest die size it has left goes first; each die rolls
    /// plus the Constitution modifier, and regains at least 1 Hit Point.
    pub count: u32,
}

/// Why the DM ends combat early.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EndCombatReason {
    /// The encounter's surrender condition holds and the DM calls the surrender. Its surrendering
    /// creatures that are still conscious become `neutral` and stay in the scene.
    Surrender,
    /// The other side fled; the encounter must list `fled` in its `end_reasons`. Its conscious
    /// creatures leave the scene and the party's side wins.
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
        /// The prompt these options belong to; echo it in `submit` and `end_turn`. Empty in
        /// explore mode, where nothing is pending.
        prompt_id: PromptId,
        /// Options the actor can take now.
        options: Vec<ActionOption>,
        /// Options the actor has but cannot take now, with the reason.
        unavailable: Vec<UnavailableOption>,
        /// Whether `end_turn` is accepted now; always false in explore mode.
        can_end_turn: bool,
        /// What the actor has left of its turn, in combat mode. Absent in explore mode, where
        /// there is no turn.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        budget: Option<TurnBudget>,
    },
    /// The option was taken; its rolls and effects are in `events`.
    Submit {},
    /// The reaction was taken or declined; its rolls and effects are in `events`.
    React {},
    /// The turn ended; the next prompt is in `awaiting`.
    EndTurn {},
    /// The move happened.
    Move {
        /// Distance moved by the time of the response, in feet; less than the route while an
        /// opportunity attack holds the creature where it provoked, or when the attack stopped it.
        moved_ft: f32,
        /// Creatures that got an opportunity attack prompt from this move, in prompt order.
        provoked: Vec<Handle>,
        /// Whether the walk set out to end where the creature was sent (next to the creature, at
        /// the anchor or the point). False only for a `partial` move that the movement left cut
        /// short; a creature an opportunity attack holds on the way is still on a walk that
        /// reaches.
        reached: bool,
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
        /// One entry per participant, in `participants` order; `amount` is 0 for one that spent
        /// no dice. Each die's roll and `healed` event are in `events`.
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
    /// The help was given; what it rolled and changed is in `events`.
    Help {},
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
