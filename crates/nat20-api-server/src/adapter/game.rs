//! The engine side of a session: an `EngineState`, the loaded scene, and the log entries the
//! engine produced since the session last took them.
//!
//! The game owns the clock. Nat20 resolves actions over simulated time (`EngineState::update`),
//! so after every decision the session ticks the engine until nothing is moving or acting,
//! copies new engine events into the log, and runs scripted creatures until a client decision
//! is needed.

use std::collections::{BTreeSet, HashMap, HashSet};

use nat20_api_contract::{
    ActionCost, ActionOption, Aim, Anchor, ApiError, AreaAim, AreaShape as WireAreaShape,
    CheckSpec, CheckTest, CheckView, CombatOverReason, ConcentrationEndReason, Condition,
    Consequence, Control, CreatureFull, DcSource, Encounter, EncounterView, EndCombatReason,
    ErrorCode, ErrorHint, EventKind, Handle, Hazard, HealthBand, HelpSpec, HitDiceSpend,
    HitPointsRegained, Mode, MoveTarget, OptionArea, OptionId, OptionVariant, Placement, PointFt,
    PregenFile, ReactionOption, RejectReason, RollId, ScenarioCheck, SceneFile, Sheet, Side, Spawn,
    SpawnUnless, SpawnView, SpawnWhen, SurrenderCondition, SurrenderTrigger, TargetCandidate,
    Targeting, TurnBudget, UnavailableOption, Visibility,
};
use nat20_core::hecs::{self, Entity};
use nat20_core::parry3d::{na::Point3, query::PointQuery};
use nat20_core::{
    components::{
        actions::{
            action::ActionCooldownMap,
            action_builder::{ActionBuilder, ActionBuilderState, ReactionBuilder},
            targeting::{AreaShape, LineOfSight, TargetInstance, TargetingKind},
        },
        activity::{Activity, ActivityState},
        d20::D20CheckDC,
        damage::DamageRoll,
        dice::DiceSet,
        faction::{Attitude, AttitudeOverride, FactionSet},
        health::{hit_point_dice::HitPointDice, hit_points::HitPoints, life_state::LifeState},
        id::{
            ActionId, ActionVariantId, EffectId, EntityIdentifier, FactionId, ItemId, ResourceId,
        },
        modifier::{FlatModifiable, ModifierMap, ModifierSource},
        resource::{RechargeRule, ResourceAmount, ResourceBudgetKind, ResourceMap},
        saving_throw::SavingThrowKind,
        time::{TimeMode, TimeStep, TurnBoundary},
    },
    engine::{
        action_prompt::{ActionData, ActionPromptKind},
        encounter::EncounterId,
        engine_state::EngineState,
        event::{Event as EngineEvent, EventKind as EngineKind},
        geometry::{WorldGeometry, WorldPath},
        prompt::PromptScopeId,
    },
    registry::registry::ItemsRegistry,
    systems::{
        self,
        movement::{MovementError, TargetPathFindingResult},
        time::RestKind,
    },
};
use nat20_core::{rerecast, uom};

use crate::{
    adapter::{
        conditions,
        events::{
            HpTracker, LogWriter, Pending, RollKeys, combat_over, concentrating_on, wire_life_state,
        },
        monster, names, pregen, sheet,
    },
    errors::{error, rejected},
    scene,
};

/// Simulated seconds per engine tick while settling.
const TICK_SECONDS: f32 = 0.1;
/// Upper bound on ticks per settle; a single action or move finishes far sooner, so hitting
/// this means the engine is stuck.
const MAX_TICKS: usize = 2_000;
/// Upper bound on scripted decisions in one `advance`.
const MAX_SCRIPTED_STEPS: usize = 200;
/// Scripted creatures take at most this many actions per turn before ending it.
const MAX_SCRIPTED_ACTIONS_PER_TURN: usize = 4;

const METERS_PER_FOOT: f32 = 0.3048;

struct SceneCreature {
    handle: String,
    entity: Entity,
    side: Side,
    control: Control,
}

/// A target the monster policy weighs.
struct Candidate {
    entity: Entity,
    handle: String,
    distance_m: f32,
    prone: bool,
    /// A creature friendly to the attacker, conscious and not Incapacitated, is beside it.
    engaged: bool,
}

struct Scene {
    id: String,
    creatures: Vec<SceneCreature>,
    handles: HashMap<Entity, String>,
    anchors: Vec<Anchor>,
    checks: Vec<ScenarioCheck>,
    hazards: Vec<Hazard>,
    encounters: Vec<Encounter>,
    /// Scenario checks already rolled in this scene; each is rolled at most once (decision D3).
    attempted: HashSet<String>,
    spawns: Vec<Spawn>,
    /// Spawns already placed in this scene; each is placed at most once.
    placed: BTreeSet<String>,
    /// Pregen files of the spawns' characters, read with the scene.
    pregens: HashMap<String, PregenFile>,
}

/// What `request_check` returns: the roll's local key, its total and whether it succeeded.
pub struct CheckOutcome {
    pub key: String,
    pub total: i32,
    pub success: bool,
}

/// The SRD DC ladder: very easy to nearly impossible.
const DC_LADDER: [u8; 6] = [5, 10, 15, 20, 25, 30];

/// What the engine waits on, in API terms. The session adds prompt ids.
#[derive(Debug, Clone, PartialEq)]
pub enum Wait {
    /// Explore mode, or nothing pending.
    Idle,
    /// A client-controlled creature's action prompt.
    Action { actor: String },
    /// A client-controlled creature's reaction prompt.
    Reaction {
        actor: String,
        options: Vec<ReactionOption>,
        trigger: String,
        /// The logged event the reaction answers, found by the session in its log.
        cause: Option<TriggerCause>,
    },
    /// Combat ended with this side standing.
    CombatOver { winner: Option<Side> },
}

/// The logged event a reaction answers: the mover's `moved` (an Opportunity Attack), or else
/// the trigger creature's latest `action` (an attack that Shield answers). Core triggers Shield
/// on the attack roll itself, but the roll is logged only once it is resolved, after the
/// reaction, so the log never shows a hit that Shield then turned into a miss.
#[derive(Debug, Clone, PartialEq)]
pub enum TriggerCause {
    /// The creature moving out of reach.
    Moved(String),
    /// The creature whose action triggered the reaction.
    Acted(String),
}

/// One option at an action prompt and the engine action behind it.
/// What `pick_option` finds: the option, its variant, the targets' entities (for an area, the
/// creatures it catches) and an area option's aim.
type Picked = (
    OptionEntry,
    Option<ActionVariantId>,
    Vec<Entity>,
    Option<TargetInstance>,
);

/// An option a client's `submit` takes at the end of a walk, because its target was out of reach
/// or sight (API-31).
struct WalkThenAct {
    entity: Entity,
    actor: Handle,
    option_id: OptionId,
    name: String,
    targets: Vec<Handle>,
}

impl WalkThenAct {
    fn of(entity: Entity, actor: &str, option: &ActionOption, targets: &[String]) -> Self {
        Self {
            entity,
            actor: Handle(actor.to_owned()),
            option_id: option.option_id.clone(),
            name: option.name.clone(),
            targets: targets.iter().map(|t| Handle(t.clone())).collect(),
        }
    }
}

/// A walk core makes on its own: to reach an option's target (`MoveAndAct`), or toward a target it
/// can't reach this turn (`Move`, a scripted monster's approach), or on from where a move provoked
/// an opportunity attack (ENG-22). Logged as `moved` once the walker stops (API-32).
struct Walk {
    entity: Entity,
    from: Point3<f32>,
    /// It goes on after a reaction the walker provoked, so it is logged after that reaction's
    /// entries, not before them.
    after_reaction: bool,
    /// The anchor a `move` was walking to, and where its route ends: the `moved` that gets there
    /// names it (protocol §4.1).
    anchor: Option<(String, Point3<f32>)>,
}

#[derive(Clone)]
struct OptionEntry {
    option: ActionOption,
    action_id: ActionId,
    context: usize,
    /// The engine variants behind `option.variants`, in the same order.
    variants: Vec<ActionVariantId>,
}

/// What the engine needs next.
#[derive(Debug, Clone)]
enum Awaiting {
    CombatOver {
        winner: Option<Side>,
    },
    Action {
        actor: Entity,
    },
    Reaction {
        reactor: Entity,
        trigger: Option<Entity>,
        /// Whether the trigger is the `trigger` creature moving out of reach.
        moving: bool,
        options: Vec<ActionData>,
    },
    Nothing,
}

/// Rounds of 6 seconds that pass between two scenes: ten minutes (decision D9).
const ROUNDS_BETWEEN_SCENES: usize = 100;

/// Core's Prone condition (SRD 5.2.1 Rules Glossary › Prone).
const PRONE: &str = "effect.condition.prone";
/// Core's Incapacitated condition.
const INCAPACITATED: &str = "effect.condition.incapacitated";
/// The Wolf's and Giant Rat's trait: Advantage when an ally is within 5 feet of the target.
const PACK_TACTICS: &str = "effect.monster.pack_tactics";
/// The goblins' Bonus Action Disengage.
const NIMBLE_ESCAPE: &str = "nat20_core::action.monster.nimble_escape";
/// 5 feet, and a little over for creatures standing on a slope.
const REACH_M: f32 = 5.0 * METERS_PER_FOOT + 0.05;

/// A loaded scene and its engine.
pub struct Game {
    engine: EngineState,
    /// The terrain the engine's geometry was built from; `None` is the default map.
    map: Option<String>,
    scene: Scene,
    /// The running or finished combat, if any.
    encounter: Option<EncounterId>,
    /// The scene encounter `encounter` was started from.
    scene_encounter: Option<String>,
    /// Entries not yet taken by the session; it assigns `seq` and roll ids.
    pending: Vec<Pending>,
    /// Hit Points per creature as of the last logged event.
    hp: HpTracker,
    keys: RollKeys,
    global_seen: usize,
    encounter_seen: usize,
    /// Set when combat ended by itself: the side left standing, if any.
    winner: Option<Option<Side>>,
    scripted_turn: Option<(usize, Entity, usize)>,
    /// Scene flags set this session; they outlive the scene that set them.
    flags: BTreeSet<String>,
    /// The spell each creature concentrated on when the log last caught up, so a Concentration
    /// that ends without an engine event (its spell ran out) is still logged.
    concentrating: HashMap<Entity, String>,
    /// Each creature's conditions and lasting effects when the log last caught up, so their
    /// changes are logged though core logs none.
    shown: HashMap<Entity, conditions::Snapshot>,
    /// The creatures the area option being submitted catches, so its `action` entry names them
    /// even when the area kills some before the log is written.
    area_caught: Vec<Entity>,
    /// The option a client's walk is on its way to take, until the log shows it taken or the
    /// walker stops without it; then the log says so with `action_dropped` (API-31).
    walk_then_act: Option<WalkThenAct>,
    /// Walks core is making for an option, not yet logged (API-32).
    walks: Vec<Walk>,
    /// While a `move` runs: the mover, and every creature its walk gave an opportunity attack
    /// window so far, in prompt order (`provoked`, protocol §4.1).
    provokers: Option<(Entity, Vec<Entity>)>,
    /// The highest round of this scene's fights whose round spawns were looked at, so each
    /// round spawn is placed or cancelled once per scene.
    spawn_round: u32,
    /// How many times the engine did not settle this session; each is a bug, reported on stderr.
    stalls: usize,
    /// The option list the last `legal_actions` built, kept for the `submit` that follows it
    /// (API-17): building it probes a path for every option and target. The server drops it on
    /// every command that can change the game ([`Game::forget_options`]), and a `submit` uses
    /// it up.
    listed: Option<Listed>,
    /// Set while [`Game::as_if_next_turn`] runs, so a kept option list says which it was.
    next_turn: bool,
}

/// One creature's option list, as built now or as if its next turn began (explore mode).
struct Listed {
    entity: Entity,
    next_turn: bool,
    options: Vec<OptionEntry>,
}

impl Game {
    /// Loads `scene` in explore mode. The first scene gets a new engine; every later scene
    /// reuses the previous one, so the creatures in `party` keep everything the engine tracks
    /// (Hit Points, resources, spell slots, life state). They are placed at the scene's
    /// `party_start` anchors in party order, the last anchor taking any extra creatures. Every
    /// other creature of the previous scene is removed, and a running fight is abandoned.
    ///
    /// The scene has been read and checked by [`crate::scene::read`], and the session has
    /// checked that every party handle is a creature of `previous`. If loading fails, `previous`
    /// comes back unchanged in the error, so a refused load changes nothing.
    pub fn load(
        previous: Option<Game>,
        scene: &SceneFile,
        party: &[Handle],
    ) -> Result<Self, (Option<Game>, ApiError)> {
        let fail = |previous, e| Err((previous, e));
        if scene.creatures.is_empty() && party.is_empty() {
            return fail(
                previous,
                if scene.party_start.is_empty() {
                    error(ErrorCode::BadScene, "A scene needs at least one creature.")
                } else {
                    error(
                        ErrorCode::BadRequest,
                        format!(
                            "Scene {} places no creature of its own; carry its party in with load_scene{{party}}.",
                            scene.id
                        ),
                    )
                },
            );
        }
        if !party.is_empty() && scene.party_start.is_empty() {
            return fail(
                previous,
                error(
                    ErrorCode::BadRequest,
                    format!("Scene {} takes no party (it has no party_start).", scene.id),
                ),
            );
        }
        // Carried creatures share the scene's handle space, spawn creatures included.
        let scene_defs = || {
            scene
                .creatures
                .iter()
                .chain(scene.spawns.iter().flat_map(|s| &s.creatures))
        };
        if let Some(clash) = party.iter().find(|h| scene_defs().any(|c| c.handle == **h)) {
            return fail(
                previous,
                error(
                    ErrorCode::BadScene,
                    format!(
                        "{} is carried in and also defined by scene {}.",
                        clash.0, scene.id
                    ),
                ),
            );
        }
        // Pregen files are read and stat block ids checked before anything is spawned, the
        // spawns' with the scene's own.
        let mut pregens = HashMap::new();
        for def in scene_defs() {
            if let Some(id) = &def.pregen
                && !pregens.contains_key(id)
            {
                match pregen::read(id) {
                    Ok(file) => pregens.insert(id.clone(), file),
                    Err(m) => return fail(previous, error(ErrorCode::BadScene, m)),
                };
            }
            if let Some(monster) = &def.monster
                && let Err(m) = monster::check(monster)
            {
                return fail(previous, error(ErrorCode::BadScene, m));
            }
        }

        let had_previous = previous.is_some();
        let (mut game, carried) = match previous {
            Some(mut game) => {
                let carried: Vec<SceneCreature> = party
                    .iter()
                    .map(|h| {
                        let c = game
                            .scene
                            .creatures
                            .iter()
                            .find(|c| c.handle == h.0)
                            .expect("the session checks party handles");
                        SceneCreature {
                            handle: c.handle.clone(),
                            entity: c.entity,
                            side: c.side,
                            control: c.control,
                        }
                    })
                    .collect();
                game.keys = RollKeys::default();
                (game, carried)
            }
            None => (
                Self::empty(scene.id.clone(), scene.map.as_deref()),
                Vec::new(),
            ),
        };

        // Spawn the scene's own creatures. On any failure they are removed again.
        let mut spawned: Vec<SceneCreature> = Vec::new();
        let rollback = |game: &mut Game, spawned: &[SceneCreature]| {
            for c in spawned {
                let _ = game.engine.despawn(c.entity);
            }
            game.global_seen = game.engine.event_log.events.len();
        };
        for def in &scene.creatures {
            match spawn_creature(&mut game.engine, def, &pregens) {
                Ok(entity) => spawned.push(SceneCreature {
                    handle: def.handle.0.clone(),
                    entity,
                    side: def.side,
                    control: def.control,
                }),
                Err(e) => {
                    rollback(&mut game, &spawned);
                    return fail(had_previous.then_some(game), e);
                }
            }
        }

        // Spawn creatures are placed later. Spawning each one now, and removing it again, runs
        // every check placing it will, so a scene that loads can always place its spawns.
        let mut trial: Vec<SceneCreature> = Vec::new();
        let mut failed = None;
        for def in scene.spawns.iter().flat_map(|s| &s.creatures) {
            match spawn_creature(&mut game.engine, def, &pregens) {
                Ok(entity) => trial.push(SceneCreature {
                    handle: def.handle.0.clone(),
                    entity,
                    side: def.side,
                    control: def.control,
                }),
                Err(e) => {
                    failed = Some(e);
                    break;
                }
            }
        }

        let creatures: Vec<SceneCreature> = carried.into_iter().chain(spawned).collect();
        if failed.is_none() {
            let all: Vec<SceneCreature> = creatures
                .iter()
                .chain(&trial)
                .map(|c| SceneCreature {
                    handle: c.handle.clone(),
                    entity: c.entity,
                    side: c.side,
                    control: c.control,
                })
                .collect();
            failed = check_sides(&game.engine, &all).err();
        }
        rollback(&mut game, &trial);
        if let Some(e) = failed {
            let new: Vec<SceneCreature> = creatures
                .into_iter()
                .filter(|c| !party.iter().any(|h| h.0 == c.handle))
                .collect();
            rollback(&mut game, &new);
            return fail(had_previous.then_some(game), e);
        }

        // Commit: nothing below can fail.
        if let Some(id) = game.encounter.take()
            && game.engine.encounter(&id).is_some()
        {
            game.engine.end_encounter(&id);
        }
        game.stand_up();
        // Ten minutes pass between scenes (decision D9): a round of turns for every 6 seconds,
        // counted on the turns of the scene being left, helpers the new scene leaves behind
        // included. Whatever lasts until someone's next turn (a Help's Advantage) ends, and so
        // does every spell of ten minutes or less (Bless, Guidance, Shield of Faith) with the
        // Concentration holding it. Time passes for the creatures left behind too, so a spell
        // they shared with a carried creature ends on both sides.
        let turns: Vec<Entity> = game.scene.creatures.iter().map(|c| c.entity).collect();
        for _ in 0..ROUNDS_BETWEEN_SCENES {
            for &turn in &turns {
                for boundary in [TurnBoundary::Start, TurnBoundary::End] {
                    for &entity in &turns {
                        systems::effects::effects_mut(&mut game.engine.world, entity).advance_time(
                            TimeStep::TurnBoundary {
                                entity: turn,
                                boundary,
                            },
                        );
                    }
                }
            }
        }
        // The update sweeps what expired, and what ran out is logged while the old scene's
        // casters still have their handles, before anyone leaves.
        game.engine.update(0.0);
        game.log_unseen_changes();
        for old in &game.scene.creatures {
            if !creatures.iter().any(|c| c.entity == old.entity) {
                let _ = game.engine.despawn(old.entity);
                game.hp.remove(&old.entity);
            }
        }
        if game.map != scene.map {
            game.engine.geometry = load_geometry(scene.map.as_deref());
            game.map = scene.map.clone();
        }
        for (i, c) in creatures.iter().enumerate() {
            let at = if i < party.len() {
                Placement::Anchor {
                    anchor: scene.party_start[i.min(scene.party_start.len() - 1)].clone(),
                }
            } else {
                scene
                    .creatures
                    .iter()
                    .find(|d| d.handle.0 == c.handle)
                    .expect("every new creature comes from the scene")
                    .at
                    .clone()
            };
            systems::geometry::teleport_to_ground(
                &mut game.engine.world,
                &game.engine.geometry,
                c.entity,
                &to_core_point(scene::position(scene, &at)),
            );
            game.hp
                .entry(c.entity)
                .or_insert_with(|| hit_points(&game.engine, c.entity));
        }
        game.scene = Scene {
            id: scene.id.clone(),
            handles: creatures
                .iter()
                .map(|c| (c.entity, c.handle.clone()))
                .collect(),
            creatures,
            anchors: scene.anchors.clone(),
            checks: scene.checks.clone(),
            hazards: scene.hazards.clone(),
            encounters: scene.encounters.clone(),
            attempted: HashSet::new(),
            spawns: scene.spawns.clone(),
            placed: BTreeSet::new(),
            pregens,
        };
        game.scene_encounter = None;
        game.encounter_seen = 0;
        game.winner = None;
        game.scripted_turn = None;
        game.spawn_round = 0;
        // Spawning, despawning and ending a fight write nothing the log shows; skip them.
        game.global_seen = game.engine.event_log.events.len();
        Ok(game)
    }

    /// A game with a new engine and no creatures, before its first scene is placed.
    fn empty(scene_id: String, map: Option<&str>) -> Self {
        Self {
            engine: EngineState::new(load_geometry(map)),
            map: map.map(str::to_owned),
            scene: Scene {
                id: scene_id,
                creatures: Vec::new(),
                handles: HashMap::new(),
                anchors: Vec::new(),
                checks: Vec::new(),
                hazards: Vec::new(),
                encounters: Vec::new(),
                attempted: HashSet::new(),
                spawns: Vec::new(),
                placed: BTreeSet::new(),
                pregens: HashMap::new(),
            },
            encounter: None,
            scene_encounter: None,
            pending: Vec::new(),
            hp: HpTracker::new(),
            keys: RollKeys::default(),
            global_seen: 0,
            encounter_seen: 0,
            winner: None,
            scripted_turn: None,
            flags: BTreeSet::new(),
            concentrating: HashMap::new(),
            shown: HashMap::new(),
            area_caught: Vec::new(),
            walk_then_act: None,
            walks: Vec::new(),
            provokers: None,
            spawn_round: 0,
            stalls: 0,
            listed: None,
            next_turn: false,
        }
    }

    /// Drops the option list `legal_actions` kept (API-17). The server calls it before every
    /// command that can change the game, so a `submit` only ever reuses a list built on the
    /// state it acts on.
    pub fn forget_options(&mut self) {
        self.listed = None;
    }

    /// The options `entity` can take now: the list `legal_actions` kept, when it was built for
    /// the same creature, both now or both as if its next turn began; else built afresh.
    fn options_now(&mut self, entity: Entity) -> Vec<OptionEntry> {
        match self.listed.take() {
            Some(listed) if listed.entity == entity && listed.next_turn == self.next_turn => {
                listed.options
            }
            _ => self.options(entity),
        }
    }

    /// Log entries produced since the last call, in order, without `seq`.
    pub fn take_entries(&mut self) -> Vec<Pending> {
        self.log_unseen_changes();
        // A walk paused by a reaction that a scripted creature settled inside the same command
        // logs two `moved` with nothing between them; the reader sees one walk (ENG-22).
        let mut entries: Vec<Pending> = Vec::with_capacity(self.pending.len());
        for entry in std::mem::take(&mut self.pending) {
            if let (
                Some(Pending {
                    kind:
                        EventKind::Moved {
                            actor: walker,
                            to: paused_at,
                            anchor: paused_anchor @ None,
                            ..
                        },
                    ..
                }),
                EventKind::Moved {
                    actor,
                    from,
                    to,
                    anchor,
                },
            ) = (entries.last_mut(), &entry.kind)
                && walker == actor
                && paused_at == from
            {
                *paused_at = *to;
                paused_anchor.clone_from(anchor);
                continue;
            }
            entries.push(entry);
        }
        entries
    }

    /// Logs what changed with no engine event of its own: Concentration that ran out, then
    /// conditions and lasting effects.
    fn log_unseen_changes(&mut self) {
        self.log_expired_concentration();
        self.log_condition_changes();
    }

    /// Logs `condition_added` / `condition_removed` (public) and `effect_started` /
    /// `effect_ended` (owner and DM) for each change since the log last caught up, found against
    /// a snapshot since core logs neither. Each goes right after the entry that explains it, when
    /// there is one: Unconscious after the creature's `life_state`; an effect that ran out at a
    /// turn boundary after that `turn_start` or `turn_end`; a spell's effect after its caster's
    /// `concentration_ended` for that spell. Anything else goes at the end of the entries so far,
    /// after the action that caused it.
    fn log_condition_changes(&mut self) {
        let mut now = HashMap::new();
        let creatures: Vec<(Entity, String)> = self
            .scene
            .creatures
            .iter()
            .map(|c| (c.entity, c.handle.clone()))
            .collect();
        for (entity, handle) in creatures {
            let snap = conditions::Snapshot {
                conditions: conditions::conditions_of(&self.engine, entity),
                effects: conditions::effects_of(&self.engine, entity, &self.scene.handles),
            };
            let before = self.shown.remove(&entity).unwrap_or_default();
            let target = Handle(handle.clone());
            let owner = Visibility::Owner {
                handle: target.clone(),
            };
            for old in &before.effects {
                if snap.effects.iter().any(|e| e.instance == old.instance) {
                    continue;
                }
                let anchor = self.effect_end_anchor(old);
                self.insert_after(
                    anchor,
                    owner.clone(),
                    EventKind::EffectEnded {
                        target: target.clone(),
                        effect: old.line.id.clone(),
                        name: old.line.name.clone(),
                    },
                );
            }
            for &condition in &before.conditions {
                if snap.conditions.contains(&condition) {
                    continue;
                }
                let anchor = self.condition_anchor(&handle, condition);
                self.insert_after(
                    anchor,
                    Visibility::Public,
                    EventKind::ConditionRemoved {
                        target: target.clone(),
                        condition,
                        source: None,
                    },
                );
            }
            for new in &snap.effects {
                if before.effects.iter().any(|e| e.instance == new.instance) {
                    continue;
                }
                self.insert_after(
                    None,
                    owner.clone(),
                    EventKind::EffectStarted {
                        target: target.clone(),
                        effect: new.line.id.clone(),
                        name: new.line.name.clone(),
                        source: new.line.source.clone(),
                    },
                );
            }
            for &condition in &snap.conditions {
                if before.conditions.contains(&condition) {
                    continue;
                }
                let anchor = self.condition_anchor(&handle, condition);
                self.insert_after(
                    anchor,
                    Visibility::Public,
                    EventKind::ConditionAdded {
                        target: target.clone(),
                        condition,
                        source: None,
                    },
                );
            }
            now.insert(entity, snap);
        }
        self.shown = now;
    }

    /// Where an effect's end goes: after the turn entry that ran it out, or after its caster's
    /// `concentration_ended` for its spell.
    fn effect_end_anchor(&self, effect: &conditions::EffectSnap) -> Option<usize> {
        if let Some(spell) = &effect.spell {
            let ended = self.pending.iter().rposition(|e| {
                matches!(&e.kind, EventKind::ConcentrationEnded { actor, spell: s, .. }
                    if *actor == effect.line.source && s == spell)
            });
            if ended.is_some() {
                return ended;
            }
        }
        let (entity, boundary) = effect.ends_at?;
        let handle = self.scene.handles.get(&entity)?;
        self.pending
            .iter()
            .rposition(|e| match (&e.kind, boundary) {
                (EventKind::TurnStart { actor }, TurnBoundary::Start)
                | (EventKind::TurnEnd { actor }, TurnBoundary::End) => actor.0 == *handle,
                _ => false,
            })
    }

    /// Where a condition's change goes: Unconscious after the creature's last `life_state`.
    fn condition_anchor(&self, handle: &str, condition: Condition) -> Option<usize> {
        if condition != Condition::Unconscious {
            return None;
        }
        self.pending.iter().rposition(
            |e| matches!(&e.kind, EventKind::LifeState { target, .. } if target.0 == handle),
        )
    }

    /// Inserts an entry right after `anchor`, or at the end of the entries so far, in the
    /// anchor's round (else the round now).
    fn insert_after(&mut self, anchor: Option<usize>, visibility: Visibility, kind: EventKind) {
        let round = match anchor {
            Some(i) => self.pending[i].round,
            None => self.pending.last().map_or(self.round(), |e| e.round),
        };
        let entry = Pending {
            round,
            visibility,
            kind,
        };
        match anchor {
            // After whatever this function already put behind the anchor, so the order of a
            // batch is the order of the code above.
            Some(i) => {
                let mut at = i + 1;
                while at < self.pending.len() && self.inserted_here(at) {
                    at += 1;
                }
                self.pending.insert(at, entry)
            }
            None => self.pending.push(entry),
        }
    }

    /// Whether the entry at `at` is one `log_condition_changes` inserted.
    fn inserted_here(&self, at: usize) -> bool {
        matches!(
            self.pending[at].kind,
            EventKind::ConditionAdded { .. }
                | EventKind::ConditionRemoved { .. }
                | EventKind::EffectStarted { .. }
                | EventKind::EffectEnded { .. }
        )
    }

    /// Logs `concentration_ended{expired}` for each creature that stopped concentrating with no
    /// entry saying why. Core ends Concentration with the spell's last effect and logs nothing
    /// (ENG-13), so the end is found here, against what the log last showed: right after the
    /// caster's `turn_start` when it ran out at that turn boundary in a fight, else at the end of
    /// the entries so far. Runs on every `take_entries`, and also where a spell can run out and
    /// be cast again before the next one: between scenes (before the old scene's creatures
    /// leave) and at an explore turn's boundary.
    fn log_expired_concentration(&mut self) {
        let mut now = HashMap::new();
        for c in &self.scene.creatures {
            let Some(spell) = self.concentrating.get(&c.entity) else {
                continue;
            };
            let current = concentrating_on(&self.engine, c.entity);
            let logged = self.pending.iter().any(|e| {
                matches!(&e.kind, EventKind::ConcentrationEnded { actor, spell: s, .. }
                    if actor.0 == c.handle && s == spell)
            });
            if current.as_ref() == Some(spell) || logged {
                continue;
            }
            let turn_start = self.pending.iter().rposition(
                |e| matches!(&e.kind, EventKind::TurnStart { actor } if actor.0 == c.handle),
            );
            let round = turn_start.and_then(|i| self.pending[i].round);
            let entry = Pending::public(
                round,
                EventKind::ConcentrationEnded {
                    actor: Handle(c.handle.clone()),
                    spell: spell.clone(),
                    reason: ConcentrationEndReason::Expired,
                },
            );
            match turn_start {
                Some(i) => self.pending.insert(i + 1, entry),
                None => self.pending.push(entry),
            }
        }
        for c in &self.scene.creatures {
            if let Some(spell) = concentrating_on(&self.engine, c.entity) {
                now.insert(c.entity, spell);
            }
        }
        self.concentrating = now;
    }

    /// Whether `handle` is a creature in the scene.
    pub fn has_creature(&self, handle: &str) -> bool {
        self.scene.creatures.iter().any(|c| c.handle == handle)
    }

    pub fn scene_id(&self) -> &str {
        &self.scene.id
    }

    /// Combat while an encounter runs and has not ended by itself; explore otherwise.
    pub fn mode(&self) -> Mode {
        if self.running_encounter().is_some() {
            Mode::Combat
        } else {
            Mode::Explore
        }
    }

    /// The combat round, in combat mode.
    pub fn round(&self) -> Option<u32> {
        self.running_encounter()
            .and_then(|id| self.engine.encounter(&id))
            .map(|e| e.round() as u32)
    }

    /// Handles in initiative order, in combat mode.
    pub fn initiative(&self) -> Vec<Handle> {
        self.running_encounter()
            .and_then(|id| self.engine.encounter(&id))
            .map(|e| {
                e.initiative_order()
                    .iter()
                    .map(|(entity, _)| Handle(self.handle_of(*entity)))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Every creature in full form, in scene order.
    pub fn creatures(&self) -> Vec<CreatureFull> {
        let engine = &self.engine;
        self.scene
            .creatures
            .iter()
            .map(|c| {
                let (hp, hp_max, temp_hp) = hit_points(engine, c.entity);
                let position_ft = systems::geometry::get_foot_position(&engine.world, c.entity)
                    .map(from_core_point)
                    .unwrap_or(PointFt {
                        x_ft: 0.0,
                        y_ft: 0.0,
                        z_ft: 0.0,
                    });
                let speed_m: f32 = systems::movement::speed(engine, c.entity)
                    .total_speed()
                    .get::<uom::si::length::meter>();
                CreatureFull {
                    handle: Handle(c.handle.clone()),
                    name: EntityIdentifier::from_world(&engine.world, c.entity)
                        .name()
                        .as_str()
                        .to_string(),
                    side: c.side,
                    position_ft,
                    hp,
                    hp_max,
                    temp_hp,
                    ac: systems::loadout::armor_class(engine, c.entity)
                        .total()
                        .max(0) as u32,
                    speed_ft: (speed_m / METERS_PER_FOOT).round() as u32,
                    conditions: conditions::conditions_of(engine, c.entity),
                    // The core has no exhaustion model yet.
                    exhaustion: 0,
                    life_state: life_state_of(engine, c.entity),
                    health: health_band(hp, hp_max),
                    effects: conditions::effects_of(engine, c.entity, &self.scene.handles)
                        .into_iter()
                        .map(|e| e.line)
                        .collect(),
                    concentration: sheet::concentration(engine, c.entity),
                }
            })
            .collect()
    }

    /// The full sheet of `handle`, for its owner or the DM. Reads only; rolls nothing.
    pub fn sheet(&self, handle: &str) -> Result<Sheet, ApiError> {
        let entity = self.entity(handle)?;
        let side = self
            .scene
            .creatures
            .iter()
            .find(|c| c.entity == entity)
            .map_or(Side::Neutral, |c| c.side);
        Ok(sheet::sheet(
            &self.engine,
            entity,
            handle,
            side,
            &self.scene.handles,
        ))
    }

    /// The scene's anchors, in scene file order.
    pub fn anchors(&self) -> &[Anchor] {
        &self.scene.anchors
    }

    /// Session flags, sorted.
    pub fn flags(&self) -> Vec<String> {
        self.flags.iter().cloned().collect()
    }

    /// The scene's checks, in scene file order, with whether each was rolled.
    pub fn checks(&self) -> Vec<CheckView> {
        self.scene
            .checks
            .iter()
            .map(|c| CheckView {
                id: c.id.clone(),
                test: c.test.clone(),
                dc: c.dc,
                rolled: self.scene.attempted.contains(&c.id),
            })
            .collect()
    }

    // ---- commands -------------------------------------------------------

    /// Rolls an ability check or saving throw for `actor` in explore mode and applies a scenario
    /// check's consequences in order. The roll entry comes first, then `check_resolved`, then
    /// what the consequences log.
    pub fn request_check(
        &mut self,
        actor: &str,
        check: &CheckSpec,
    ) -> Result<CheckOutcome, ApiError> {
        if self.mode() == Mode::Combat {
            return Err(error(
                ErrorCode::NotImplemented,
                "In combat a check is an action; request_check serves explore mode only for now.",
            ));
        }
        let entity = self.entity(actor)?;
        let (test, dc, dc_source, scenario) = match check {
            CheckSpec::Scenario { check_id } => {
                let Some(found) = self.scene.checks.iter().find(|c| c.id == *check_id) else {
                    let mut e = error(
                        ErrorCode::UnknownCheck,
                        format!("Scene {} has no check {check_id}.", self.scene.id),
                    );
                    let known_ids: Vec<String> =
                        self.scene.checks.iter().map(|c| c.id.clone()).collect();
                    if !known_ids.is_empty() {
                        e.hint = Some(ErrorHint {
                            legal_option_ids: Vec::new(),
                            awaiting: None,
                            known_ids,
                        });
                    }
                    return Err(e);
                };
                if self.scene.attempted.contains(check_id) {
                    return Err(rejected(
                        RejectReason::AlreadyAttempted,
                        format!(
                            "{check_id} was already rolled in this scene; each scenario check is rolled once per scene."
                        ),
                    ));
                }
                (
                    found.test.clone(),
                    found.dc,
                    DcSource::Scenario,
                    Some(found.clone()),
                )
            }
            CheckSpec::Ladder { ability, skill, dc } => {
                if !DC_LADDER.contains(dc) {
                    return Err(error(
                        ErrorCode::BadRequest,
                        format!("A ladder DC is one of 5, 10, 15, 20, 25 or 30, not {dc}."),
                    ));
                }
                let Some(skill) = skill else {
                    return Err(error(
                        ErrorCode::NotImplemented,
                        "A ladder check without a skill is not served yet; name the skill.",
                    ));
                };
                if sheet::core_ability(*ability) != sheet::core_skill(*skill).ability() {
                    return Err(error(
                        ErrorCode::NotImplemented,
                        format!(
                            "{} checks with another ability than {:?} are not served yet.",
                            sheet::skill_word(*skill),
                            sheet::core_skill(*skill).ability(),
                        ),
                    ));
                }
                (
                    CheckTest::Skill { skill: *skill },
                    *dc,
                    DcSource::Ladder,
                    None,
                )
            }
        };
        if !systems::health::is_alive(&self.engine.world, entity)
            || life_state_name(&self.engine, entity) != "normal"
        {
            return Err(rejected(
                RejectReason::ConditionPrevents,
                format!("{actor} is down and cannot make a check."),
            ));
        }

        // An explore command that acts closes a finished fight's `combat_over`, as `move` does.
        self.close_finished_fight();
        if let Some(scenario) = &scenario {
            self.scene.attempted.insert(scenario.id.clone());
        }
        let (key, total, success) = self.roll_check(entity, &test, dc, dc_source);
        self.pending.push(Pending {
            round: None,
            visibility: Visibility::Dm,
            kind: EventKind::CheckResolved {
                check_id: scenario.as_ref().map(|c| c.id.clone()),
                actor: Handle(actor.to_owned()),
                roll_id: RollId(key.clone()),
                success,
            },
        });
        if let Some(scenario) = scenario {
            let consequences = if success {
                &scenario.on_success
            } else {
                &scenario.on_failure
            };
            self.apply(entity, consequences);
        }
        // Anything the engine logged on its own (a concentration save after damage).
        self.drain();
        Ok(CheckOutcome {
            key,
            total,
            success,
        })
    }

    /// Rolls `test` against `dc` for `entity` and logs the roll. Returns the roll's local key,
    /// its total and whether it succeeded.
    fn roll_check(
        &mut self,
        entity: Entity,
        test: &CheckTest,
        dc: u8,
        dc_source: DcSource,
    ) -> (String, i32, bool) {
        let dc_value = ModifierMap::from(ModifierSource::Base, dc as i32).evaluate();
        let (dc, label) = match test {
            CheckTest::Skill { skill } => (
                D20CheckDC::Skill {
                    skill: sheet::core_skill(*skill),
                    dc: dc_value,
                },
                format!(
                    "a {:?} ({}) check",
                    sheet::core_skill(*skill).ability(),
                    sheet::skill_word(*skill)
                ),
            ),
            CheckTest::Save { ability } => (
                D20CheckDC::SavingThrow {
                    saving_throw: SavingThrowKind::Ability(sheet::core_ability(*ability)),
                    dc: dc_value,
                },
                format!("a {} saving throw", sheet::ability_word(*ability)),
            ),
        };
        // The check goes through the engine's event handling, so whatever waits on it acts: the
        // Advantage of a Help is spent by the check it was for.
        self.drain();
        let event = systems::d20::check(&mut self.engine, entity, &dc);
        let EngineKind::D20CheckPerformed { result, .. } = &event.kind else {
            unreachable!("a check makes a D20CheckPerformed event");
        };
        let mut result = result.clone();
        self.engine.process_event(event);
        self.decline_explore_reactions();
        // The roll is logged below with its DC's source, so the engine's own record of it is
        // left out; anything else the check set off is logged as usual.
        let mut writer = LogWriter {
            engine: &self.engine,
            handles: &self.scene.handles,
            round: None,
            hp: &mut self.hp,
            keys: &mut self.keys,
            initiative: Vec::new(),
            concentration: Default::default(),
            area_targets: &self.area_caught,
            rule_dc: false,
        };
        let mut entries = Vec::new();
        for event in self.engine.event_log.events.iter().skip(self.global_seen) {
            match &event.kind {
                EngineKind::D20CheckResolved {
                    result: resolved, ..
                } => result = resolved.clone(),
                _ => entries.extend(writer.entries(event)),
            }
        }
        self.global_seen = self.engine.event_log.events.len();
        self.pending.extend(entries);
        let success = result.is_success(&dc);
        let roller = self.handle_of(entity);
        let mut writer = self.writer();
        let (entry, key) = writer.explore_check(&roller, label, &result, &dc, dc_source);
        self.pending.push(entry);
        (key, result.total(), success)
    }

    /// Applies consequences to `entity`, in order.
    fn apply(&mut self, entity: Entity, consequences: &[Consequence]) {
        for consequence in consequences {
            match consequence {
                Consequence::Flag { flag } => {
                    if self.flags.insert(flag.clone()) {
                        self.pending.push(Pending {
                            round: None,
                            visibility: Visibility::Dm,
                            kind: EventKind::FlagSet { flag: flag.clone() },
                        });
                    }
                }
                Consequence::Hazard { hazard_id } => {
                    let hazard = self
                        .scene
                        .hazards
                        .iter()
                        .find(|h| h.id == *hazard_id)
                        .cloned()
                        .expect("scene::read checks hazard ids");
                    self.pending.push(Pending {
                        round: None,
                        visibility: Visibility::Dm,
                        kind: EventKind::HazardTriggered {
                            hazard_id: hazard.id.clone(),
                            actor: Handle(self.handle_of(entity)),
                        },
                    });
                    let (_, _, saved) = self.roll_check(
                        entity,
                        &CheckTest::Save {
                            ability: hazard.save.ability,
                        },
                        hazard.save.dc,
                        DcSource::Scenario,
                    );
                    // scene::read refuses a hazard that sets off another hazard, so this ends.
                    let next = if saved {
                        &hazard.on_success
                    } else {
                        &hazard.on_failure
                    };
                    self.apply(entity, next);
                }
                Consequence::Damage { dice, damage_type } => {
                    let (count, size, bonus) =
                        scene::parse_dice(dice).expect("scene::read checks damage dice");
                    let mut damage = ModifierMap::default();
                    let source = ModifierSource::Custom("Hazard".into());
                    damage.add_modifier(
                        source.clone(),
                        format!("{count}d{size}")
                            .parse::<DiceSet>()
                            .expect("scene::read allows only dice the engine rolls"),
                    );
                    damage.add_modifier(source, bonus as i32);
                    let mut roll =
                        DamageRoll::new(damage, names::core_damage_type(*damage_type)).roll(false);
                    let (taken, new_life_state) =
                        systems::health::damage(&mut self.engine, entity, &mut roll, None, None);
                    let roller = self.handle_of(entity);
                    let mut writer = self.writer();
                    let entries = writer.plain_damage(
                        &roller,
                        entity,
                        &roll,
                        taken.as_ref(),
                        new_life_state.as_ref(),
                    );
                    self.pending.extend(entries);
                }
            }
        }
    }

    /// The Help action out of combat: `actor` assists `ally`'s next check with a skill, or tries
    /// to stabilize a creature at 0 Hit Points. The engine runs its own Help action, so the
    /// range, the proficiency and the Medicine check are its rules.
    pub fn help(&mut self, actor: &str, help: &HelpSpec) -> Result<(), ApiError> {
        if self.mode() == Mode::Combat {
            return Err(error(
                ErrorCode::WrongMode,
                "In combat, Help is one of the options legal_actions lists.",
            ));
        }
        let entity = self.entity(actor)?;
        if !systems::health::is_alive(&self.engine.world, entity)
            || life_state_name(&self.engine, entity) != "normal"
        {
            return Err(rejected(
                RejectReason::ConditionPrevents,
                format!("{actor} is down and cannot help."),
            ));
        }
        let (action, variant, other) = match help {
            HelpSpec::AssistCheck { ally, skill } => {
                let word = serde_json::to_value(skill).expect("a skill serializes");
                let word = word.as_str().expect("a skill serializes as a string");
                (
                    "nat20_core::action.help.assist_ability_check",
                    Some(format!("nat20_core::variant.help.{word}")),
                    ally,
                )
            }
            HelpSpec::Stabilize { target } => ("nat20_core::action.help.stabilize", None, target),
        };
        let other_entity = self.entity(&other.0)?;
        if other_entity == entity {
            return Err(rejected(
                RejectReason::InvalidTarget,
                format!("{actor} cannot help itself."),
            ));
        }
        let action: ActionId = action.parse().expect("core has the Help actions");
        let variant: Option<ActionVariantId> =
            variant.map(|v| v.parse().expect("every skill has a Help variant"));
        let goal = (other_entity, other.0.as_str());
        // Everything is checked before the helper's turn moves on, so a refused help changes
        // nothing. The check runs as if the new turn had begun: the action a fight or an earlier
        // help spent is back for it, and taken away again after.
        self.as_if_next_turn(entity, |game| {
            game.check_help(entity, actor, &action, variant.as_ref(), goal)
        })?;
        self.next_explore_turn(entity);
        let builder = self.help_builder(entity, actor, &action, variant.as_ref(), goal)?;
        let engine = &mut self.engine;
        let activity = builder.build(engine).map_err(|e| refusal(&e))?;
        engine.submit_activity(activity).map_err(|e| refusal(&e))?;
        // An explore command that acts closes a finished fight's `combat_over`, as `move` does.
        self.close_finished_fight();
        self.settle();
        self.decline_explore_reactions();
        self.drain();
        Ok(())
    }

    /// A Short Rest for `participants` in explore mode: each spends the Hit Point Dice
    /// `hit_dice` gives it (largest die first), then the engine finishes the rest and recharges
    /// short-rest resources. Everything is checked before anything changes. Returns the Hit
    /// Points each participant regained, in `participants` order.
    pub fn short_rest(
        &mut self,
        participants: &[Handle],
        hit_dice: &[HitDiceSpend],
    ) -> Result<Vec<HitPointsRegained>, ApiError> {
        if self.mode() == Mode::Combat {
            return Err(error(
                ErrorCode::WrongMode,
                "Nobody can take a short rest during combat: rolling Initiative interrupts a rest.",
            ));
        }
        if participants.is_empty() {
            return Err(error(
                ErrorCode::BadRequest,
                "A short rest needs at least one participant.",
            ));
        }
        let mut entities = Vec::new();
        for handle in participants {
            let entity = self.entity(&handle.0)?;
            if entities.contains(&entity) {
                return Err(error(
                    ErrorCode::BadRequest,
                    format!("{} is listed twice in participants.", handle.0),
                ));
            }
            entities.push(entity);
        }
        for (handle, entity) in participants.iter().zip(&entities) {
            // SRD 5.2.1 Short Rest: you need at least 1 Hit Point to start one.
            if !systems::health::is_alive(&self.engine.world, *entity)
                || life_state_name(&self.engine, *entity) != "normal"
            {
                return Err(rejected(
                    RejectReason::ConditionPrevents,
                    format!(
                        "{} is at 0 Hit Points and cannot take a short rest.",
                        handle.0
                    ),
                ));
            }
        }
        let mut spends: HashMap<Entity, u32> = HashMap::new();
        for spend in hit_dice {
            let Some(entity) = participants
                .iter()
                .position(|h| *h == spend.handle)
                .map(|i| entities[i])
            else {
                return Err(error(
                    ErrorCode::BadRequest,
                    format!(
                        "{} spends Hit Point Dice but is not among the participants.",
                        spend.handle.0
                    ),
                ));
            };
            if spends.insert(entity, spend.count).is_some() {
                return Err(error(
                    ErrorCode::BadRequest,
                    format!("{} is listed twice in hit_dice.", spend.handle.0),
                ));
            }
            // The message names only the count asked for: dice left are on the owner's sheet.
            if spend.count > hit_dice_left(&self.engine, entity) {
                return Err(rejected(
                    RejectReason::InsufficientResource,
                    format!(
                        "{} does not have {} Hit Point Dice left to spend.",
                        spend.handle.0, spend.count
                    ),
                ));
            }
        }

        // Whatever happened before the rest is already in the log.
        self.drain();
        // An explore command that acts closes a finished fight's `combat_over`.
        self.close_finished_fight();
        systems::time::start_rest(&mut self.engine, entities.clone(), &RestKind::Short)
            .expect("explore mode: nobody is in combat");
        let mut healed = Vec::new();
        for (handle, entity) in participants.iter().zip(&entities) {
            let mut regained_total = 0;
            for _ in 0..spends.get(entity).copied().unwrap_or(0) {
                let die = self
                    .engine
                    .world
                    .get::<&HitPointDice>(*entity)
                    .ok()
                    .and_then(|dice| {
                        dice.pools()
                            .filter(|(_, remaining, _)| *remaining > 0)
                            .map(|(die, _, _)| die)
                            .max()
                    })
                    .expect("checked above: enough dice left");
                let before = hit_points(&self.engine, *entity).0;
                let result = systems::health::spend_hit_point_die(&mut self.engine, *entity, die)
                    .expect("checked above: resting, out of combat, a die left");
                let regained = hit_points(&self.engine, *entity).0.saturating_sub(before);
                regained_total += regained;
                let mut writer = self.writer();
                let entries = writer.hit_point_die(*entity, die as u8, &result, regained);
                self.pending.extend(entries);
            }
            healed.push(HitPointsRegained {
                handle: handle.clone(),
                amount: regained_total,
            });
        }
        systems::time::finish_rest(&mut self.engine, entities)
            .expect("every participant started this short rest");
        self.drain();
        Ok(healed)
    }

    /// A log writer for entries made outside the engine's own event log.
    fn writer(&mut self) -> LogWriter<'_> {
        LogWriter {
            engine: &self.engine,
            handles: &self.scene.handles,
            round: None,
            hp: &mut self.hp,
            keys: &mut self.keys,
            initiative: Vec::new(),
            concentration: Default::default(),
            area_targets: &[],
            rule_dc: false,
        }
    }

    /// Moves `actor` and returns the feet it moved, who it provoked, and whether its walk
    /// reaches where it was sent. In explore mode the creature walks the whole route at no
    /// movement cost and provokes nobody, since nobody is fighting. In combat the session has
    /// checked the prompt: the route must fit in the movement left, or with `partial` it is
    /// walked as far as the movement goes, to the last free spot (API-35); an opportunity attack
    /// holds the creature where it was provoked until the reaction is resolved.
    pub fn move_to(
        &mut self,
        actor: &str,
        to: &MoveTarget,
        partial: bool,
    ) -> Result<(f32, Vec<Handle>, bool), ApiError> {
        let entity = self.entity(actor)?;
        let combat = self.mode() == Mode::Combat;
        // Explore mode has no movement to run out of, so every walk there goes the whole way.
        let partial = partial && combat;
        if combat {
            self.require_action_prompt(entity)?;
        } else if !systems::health::is_alive(&self.engine.world, entity)
            || life_state_name(&self.engine, entity) != "normal"
        {
            return Err(rejected(
                RejectReason::ConditionPrevents,
                format!("{actor} is down and cannot move."),
            ));
        }
        let (goal, anchor, goal_in_reach) = self.goal(entity, to, combat, partial)?;
        let from = systems::geometry::get_foot_position(&self.engine.world, entity)
            .expect("scene creatures have a position");
        let route = systems::movement::path(&self.engine, entity, &goal, partial, combat).map_err(
            |e| match e {
                MovementError::NoPathFound => rejected(
                    RejectReason::NoPath,
                    format!("There is no route for {actor} to get there."),
                ),
                MovementError::InsufficientSpeed => rejected(
                    RejectReason::InsufficientResource,
                    format!(
                        "{actor} has {} ft of movement left this turn, not enough to get there.",
                        round_ft(
                            systems::movement::speed(&self.engine, entity)
                                .remaining_movement()
                                .get::<uom::si::length::meter>()
                        )
                    ),
                ),
                other => refusal(&other),
            },
        )?;
        let full_end = *route.full_path.points.last().unwrap_or(&from);
        // A partial walk ends where the movement runs out, stepped back to the last free spot:
        // a creature can't end its move in another's space (SRD 5.2.1, Moving Around Other
        // Creatures). With none along the way, nothing moves and the move is refused.
        let end = if route.reaches_goal() || route.taken_path.points.is_empty() {
            full_end
        } else {
            self.last_free_spot(entity, &route.taken_path)
                .unwrap_or(from)
        };
        // A creature goal can itself fall short of the creature: core cuts a partial path to a
        // creature back to a free spot, and that spot is the goal then (`goal`).
        let reached = (end - full_end).norm() < 0.05 && goal_in_reach;
        if (end - from).norm() < 0.05 && !reached {
            return Err(rejected(
                RejectReason::InsufficientResource,
                format!("{actor} has no movement left this turn to get any closer."),
            ));
        }
        let anchor = anchor.filter(|_| reached);

        let round = self.round();
        let before = remaining_movement_m(&self.engine, entity);
        let moved_m = if combat {
            self.engine
                .submit_activity(Activity::Move { entity, goal: end })
                .map_err(|e| refusal(&e))?;
            self.provokers = Some((entity, Vec::new()));
            self.settle();
            self.note_provoker();
            before - remaining_movement_m(&self.engine, entity)
        } else {
            // Nobody is fighting, so the creature is simply placed at the end of its route.
            systems::geometry::teleport_to(&mut self.engine.world, entity, &end);
            // An explore command that acts closes a finished fight's `combat_over`.
            self.close_finished_fight();
            route.full_path.length.get::<uom::si::length::meter>()
        };
        let landed = systems::geometry::get_foot_position(&self.engine.world, entity)
            .expect("scene creatures have a position");
        // A creature that provoked is still walking: once the reaction is settled it walks on
        // to its goal (ENG-22), and that walk is logged as `moved` when it stops (API-32).
        let walking_on = self
            .engine
            .world
            .get::<&ActivityState>(entity)
            .is_ok_and(|s| !s.is_idle());
        if walking_on {
            self.walks.push(Walk {
                entity,
                from: landed,
                after_reaction: true,
                anchor: anchor.clone().map(|anchor| (anchor, end)),
            });
        }
        let arrived = (landed - end).norm() < 0.05;
        self.pending.push(Pending::public(
            round,
            EventKind::Moved {
                actor: Handle(actor.to_owned()),
                from: from_core_point(from),
                to: from_core_point(landed),
                anchor: anchor.filter(|_| arrived),
            },
        ));
        self.drain();
        if combat {
            self.advance();
            self.note_provoker();
        }
        // Every window the walk opened in this command, the ones a scripted creature settled
        // inside it included (protocol §4.1).
        let provoked = self
            .provokers
            .take()
            .map(|(_, reactors)| reactors)
            .unwrap_or_default()
            .into_iter()
            .map(|reactor| Handle(self.handle_of(reactor)))
            .collect();
        // A scripted reaction settled inside this command lets the creature walk on before the
        // response (ENG-22), and that walk counts too. Movement left only grows again at the
        // creature's next turn, which `max` keeps out.
        let moved_m = if combat {
            moved_m.max(before - remaining_movement_m(&self.engine, entity))
        } else {
            moved_m
        };
        Ok((round_ft(moved_m), provoked, reached))
    }

    /// While a `move` runs, records the creature a pending opportunity attack window on the
    /// mover belongs to, once.
    fn note_provoker(&mut self) {
        let Some((mover, _)) = self.provokers else {
            return;
        };
        if let Awaiting::Reaction {
            reactor,
            trigger: Some(trigger),
            moving: true,
            ..
        } = self.awaiting()
            && trigger == mover
            && let Some((_, reactors)) = &mut self.provokers
            && !reactors.contains(&reactor)
        {
            reactors.push(reactor);
        }
    }

    /// Where a move ends, in core coordinates, and the anchor it names.
    fn goal(
        &mut self,
        entity: Entity,
        to: &MoveTarget,
        combat: bool,
        partial: bool,
    ) -> Result<(Point3<f32>, Option<String>, bool), ApiError> {
        match to {
            MoveTarget::Point { point } => Ok((to_core_point(*point), None, true)),
            MoveTarget::Anchor { anchor } => {
                let found = self.scene.anchors.iter().find(|a| a.id == *anchor);
                let Some(found) = found else {
                    let mut e = error(
                        ErrorCode::UnknownAnchor,
                        format!("Scene {} has no anchor {anchor}.", self.scene.id),
                    );
                    let known_ids: Vec<String> =
                        self.scene.anchors.iter().map(|a| a.id.clone()).collect();
                    if !known_ids.is_empty() {
                        e.hint = Some(ErrorHint {
                            legal_option_ids: Vec::new(),
                            awaiting: None,
                            known_ids,
                        });
                    }
                    return Err(e);
                };
                Ok((to_core_point(found.position_ft), Some(anchor.clone()), true))
            }
            MoveTarget::Creature { handle } => {
                let target = self.entity(&handle.0)?;
                if target == entity {
                    return Err(error(
                        ErrorCode::BadRequest,
                        "A creature cannot move next to itself.",
                    ));
                }
                let target = TargetInstance::Entity {
                    entity: EntityIdentifier::from_world(&self.engine.world, target),
                    point_on_entity: None,
                };
                let reach = uom::si::f32::Length::new::<uom::si::length::foot>(5.0);
                let near = systems::movement::path_in_range_of_target(
                    &mut self.engine,
                    entity,
                    &target,
                    reach,
                    partial,
                    LineOfSight::ignore(),
                    combat,
                )
                .map_err(|e| match e {
                    MovementError::InsufficientSpeed => rejected(
                        RejectReason::InsufficientResource,
                        "Not enough movement left this turn to get next to that creature.",
                    ),
                    _ => rejected(
                        RejectReason::NoPath,
                        format!("There is no route to {}.", handle.0),
                    ),
                })?;
                let here = systems::geometry::get_foot_position(&self.engine.world, entity)
                    .expect("scene creatures have a position");
                let end = near
                    .path_result
                    .full_path
                    .points
                    .last()
                    .copied()
                    .unwrap_or(here);
                // Within reach the way core measures it: from the mover's shape standing there.
                let target_point = target
                    .position(&self.engine.world)
                    .expect("a scene creature has a position");
                let in_reach = systems::geometry::get_shape_at_point(
                    &self.engine.world,
                    &self.engine.geometry,
                    entity,
                    &end,
                )
                .is_some_and(|(shape, pose)| {
                    shape.distance_to_point(&pose, &target_point, true)
                        <= reach.get::<uom::si::length::meter>() + 0.01
                });
                Ok((end, None, in_reach))
            }
        }
    }

    /// The furthest point along `path` where `entity` could end its move, searched by distance
    /// rather than by the path's corners: a straight walk has only its two ends, and the far one
    /// may be another creature's space.
    fn last_free_spot(&self, entity: Entity, path: &WorldPath) -> Option<Point3<f32>> {
        const STEP_M: f32 = 0.25;
        let start = *path.points.first()?;
        let mut distance = path.length.get::<uom::si::length::meter>();
        while distance > 0.0 {
            let point = path.point_at_distance(uom::si::f32::Length::new::<
                uom::si::length::meter,
            >(distance))?;
            if systems::movement::is_free_spot(&self.engine, entity, &point) {
                return Some(point);
            }
            distance -= STEP_M;
        }
        Some(start)
    }

    /// Starts the scene encounter `encounter_id`: rolls initiative for its participants, the
    /// surprised side with Disadvantage, and runs scripted turns until a client decides.
    /// Participants not in the scene are left out.
    pub fn start_combat(&mut self, encounter_id: &str) -> Result<(), ApiError> {
        if self.running_encounter().is_some() {
            return Err(error(ErrorCode::WrongMode, "Combat is already running."));
        }
        let Some(found) = self.scene.encounters.iter().find(|e| e.id == encounter_id) else {
            let mut e = error(
                ErrorCode::UnknownEncounter,
                format!("Scene {} has no encounter {encounter_id}.", self.scene.id),
            );
            let known_ids: Vec<String> =
                self.scene.encounters.iter().map(|e| e.id.clone()).collect();
            if !known_ids.is_empty() {
                e.hint = Some(ErrorHint {
                    legal_option_ids: Vec::new(),
                    awaiting: None,
                    known_ids,
                });
            }
            return Err(e);
        };
        let mut entities: Vec<Entity> = found
            .participants
            .iter()
            .filter_map(|h| self.entity(&h.0).ok())
            .collect();
        // Flag spawns whose flag is set arrive as the fight starts and join it.
        let arriving: Vec<Spawn> = self
            .scene
            .spawns
            .iter()
            .filter(|s| {
                !self.scene.placed.contains(&s.id)
                    && matches!(&s.when, SpawnWhen::Flag { flag } if self.flags.contains(flag))
            })
            .cloned()
            .collect();
        let arriving_sides: Vec<Side> = arriving
            .iter()
            .flat_map(|s| s.creatures.iter().map(|c| c.side))
            .collect();
        // The surprised side rolls initiative with Disadvantage once the scene's flag is set
        // (decision D4, SRD 5.2.1 Surprise).
        let surprised_side: Option<Side> = found
            .surprise
            .as_ref()
            .filter(|surprise| self.flags.contains(&surprise.when_flag))
            .map(|surprise| surprise.surprised);
        let standing = |side: Side| {
            arriving_sides.contains(&side)
                || entities.iter().any(|e| {
                    self.side_of(*e) == Some(side) && life_state_name(&self.engine, *e) == "normal"
                })
        };
        if !standing(Side::Party) || !standing(Side::Hostile) {
            return Err(error(
                ErrorCode::BadRequest,
                format!(
                    "{encounter_id} needs at least one conscious party creature and one conscious hostile creature."
                ),
            ));
        }
        // Whatever happened before this fight is already in the log.
        self.drain();
        entities.extend(self.place(&arriving)?);
        let surprised: HashSet<Entity> = entities
            .iter()
            .copied()
            .filter(|e| surprised_side.is_some() && self.side_of(*e) == surprised_side)
            .collect();
        let encounter = self
            .engine
            .start_surprised_encounter(entities.into_iter().collect(), surprised);
        self.encounter = Some(encounter);
        self.scene_encounter = Some(encounter_id.to_owned());
        self.encounter_seen = 0;
        self.winner = None;
        self.scripted_turn = None;
        self.drain();
        self.log_initiative();
        self.advance();
        Ok(())
    }

    /// Places the creatures of the scene spawn `spawn_id`, declared `when: dm`. During a fight
    /// they join it.
    pub fn spawn(&mut self, spawn_id: &str) -> Result<Vec<Handle>, ApiError> {
        let Some(found) = self.scene.spawns.iter().find(|s| s.id == spawn_id).cloned() else {
            let mut e = error(
                ErrorCode::UnknownSpawn,
                format!("Scene {} has no spawn {spawn_id}.", self.scene.id),
            );
            let known_ids: Vec<String> = self.scene.spawns.iter().map(|s| s.id.clone()).collect();
            if !known_ids.is_empty() {
                e.hint = Some(ErrorHint {
                    legal_option_ids: Vec::new(),
                    awaiting: None,
                    known_ids,
                });
            }
            return Err(e);
        };
        match &found.when {
            SpawnWhen::Dm => {}
            SpawnWhen::Flag { flag } => {
                return Err(rejected(
                    RejectReason::Automatic,
                    format!("{spawn_id} arrives by itself when a fight starts with {flag} set."),
                ));
            }
            SpawnWhen::Round { round, .. } => {
                return Err(rejected(
                    RejectReason::Automatic,
                    format!("{spawn_id} arrives by itself in round {round}."),
                ));
            }
        }
        if self.scene.placed.contains(spawn_id) {
            return Err(rejected(
                RejectReason::AlreadySpawned,
                format!("{spawn_id} is already placed in this scene."),
            ));
        }
        // A fight that ended by itself is closed before anything new is placed.
        self.drain();
        self.close_finished_fight();
        let placed = self.place(std::slice::from_ref(&found))?;
        Ok(placed.iter().map(|e| Handle(self.handle_of(*e))).collect())
    }

    /// Places every creature of `spawns` at its placement, logs `spawned` for each spawn and
    /// returns the new creatures. During a fight they join it, each rolling initiative. On any
    /// failure nothing is placed.
    fn place(&mut self, spawns: &[Spawn]) -> Result<Vec<Entity>, ApiError> {
        let mut new: Vec<SceneCreature> = Vec::new();
        let mut failed = None;
        for def in spawns.iter().flat_map(|s| &s.creatures) {
            match spawn_creature(&mut self.engine, def, &self.scene.pregens) {
                Ok(entity) => new.push(SceneCreature {
                    handle: def.handle.0.clone(),
                    entity,
                    side: def.side,
                    control: def.control,
                }),
                Err(e) => {
                    failed = Some(e);
                    break;
                }
            }
        }
        if failed.is_none() {
            let all: Vec<SceneCreature> = self
                .scene
                .creatures
                .iter()
                .chain(&new)
                .map(|c| SceneCreature {
                    handle: c.handle.clone(),
                    entity: c.entity,
                    side: c.side,
                    control: c.control,
                })
                .collect();
            failed = check_sides(&self.engine, &all).err();
        }
        if let Some(e) = failed {
            for c in &new {
                let _ = self.engine.despawn(c.entity);
            }
            self.global_seen = self.engine.event_log.events.len();
            return Err(e);
        }
        for def in spawns.iter().flat_map(|s| &s.creatures) {
            let c = new
                .iter()
                .find(|c| c.handle == def.handle.0)
                .expect("every spawn creature was placed");
            let at = match &def.at {
                Placement::Point { point } => *point,
                Placement::Anchor { anchor } => {
                    self.scene
                        .anchors
                        .iter()
                        .find(|a| a.id == *anchor)
                        .expect("anchors are checked when the scene is read")
                        .position_ft
                }
            };
            systems::geometry::teleport_to_ground(
                &mut self.engine.world,
                &self.engine.geometry,
                c.entity,
                &to_core_point(at),
            );
            self.hp.insert(c.entity, hit_points(&self.engine, c.entity));
            self.scene.handles.insert(c.entity, c.handle.clone());
        }
        // Spawning writes nothing the log shows; skip it.
        self.global_seen = self.engine.event_log.events.len();
        for spawn in spawns {
            self.scene.placed.insert(spawn.id.clone());
            self.pending.push(Pending {
                round: self.round(),
                visibility: Visibility::Dm,
                kind: EventKind::Spawned {
                    spawn_id: spawn.id.clone(),
                    handles: spawn.creatures.iter().map(|c| c.handle.clone()).collect(),
                },
            });
        }
        let entities: Vec<Entity> = new.iter().map(|c| c.entity).collect();
        self.scene.creatures.extend(new);
        if let Some(encounter) = self.running_encounter() {
            for entity in &entities {
                self.engine.join_encounter(&encounter, *entity);
            }
            self.log_joined_initiative(&entities);
        }
        Ok(entities)
    }

    /// Places the round spawns due since the last look, unless their `unless` holds then.
    fn round_spawns(&mut self) {
        let Some(round) = self.running_encounter().and(self.round()) else {
            return;
        };
        if round <= self.spawn_round {
            return;
        }
        let from = self.spawn_round;
        self.spawn_round = round;
        let due: Vec<Spawn> = self
            .scene
            .spawns
            .iter()
            .filter(|s| !self.scene.placed.contains(&s.id))
            .filter(|s| match &s.when {
                SpawnWhen::Round { round: r, unless } => {
                    *r > from && *r <= round && !unless.is_some_and(|u| self.spawn_cancelled(u))
                }
                _ => false,
            })
            .cloned()
            .collect();
        if due.is_empty() {
            return;
        }
        if let Err(e) = self.place(&due) {
            eprintln!("round spawn not placed: {}", e.message);
        }
    }

    /// Whether `unless` holds now.
    fn spawn_cancelled(&self, unless: SpawnUnless) -> bool {
        match unless {
            SpawnUnless::AnyPartyBloodied => self
                .scene
                .creatures
                .iter()
                .filter(|c| c.side == Side::Party)
                .any(|c| {
                    let (hp, hp_max, _) = hit_points(&self.engine, c.entity);
                    life_state_name(&self.engine, c.entity) != "normal" || 2 * hp <= hp_max
                }),
        }
    }

    /// The scene's spawns as the DM sees them.
    pub fn spawns(&self) -> Vec<SpawnView> {
        self.scene
            .spawns
            .iter()
            .map(|s| SpawnView {
                id: s.id.clone(),
                when: s.when.clone(),
                placed: self.scene.placed.contains(&s.id),
            })
            .collect()
    }

    /// Ends the running fight early, for a reason its scene encounter allows. The caller has
    /// checked that a fight is running.
    pub fn end_combat(&mut self, reason: EndCombatReason) -> Result<(), ApiError> {
        let (Some(core_id), Some(found)) = (
            self.running_encounter(),
            self.scene_encounter
                .as_ref()
                .and_then(|id| self.scene.encounters.iter().find(|e| e.id == *id)),
        ) else {
            return Err(error(
                ErrorCode::WrongMode,
                "There is no combat in this scene to end.",
            ));
        };
        let id = found.id.clone();
        let mut fleeing: Vec<Entity> = Vec::new();
        let (surrendering, winner, reason) = match reason {
            EndCombatReason::Fled => {
                if !found.end_reasons.contains(&EndCombatReason::Fled) {
                    return Err(rejected(
                        RejectReason::ConditionNotMet,
                        format!("{id} does not list fled among the ways it can end."),
                    ));
                }
                // Every participant not on the party's side runs, except those at 0 Hit Points,
                // who stay where they fell. Scene order keeps the event deterministic.
                let participants: Vec<Entity> = self
                    .engine
                    .encounter(&core_id)
                    .map(|running| {
                        running
                            .initiative_order()
                            .iter()
                            .map(|(entity, _)| *entity)
                            .collect()
                    })
                    .unwrap_or_default();
                fleeing = self
                    .scene
                    .creatures
                    .iter()
                    .filter(|c| participants.contains(&c.entity) && c.side != Side::Party)
                    .filter(|c| life_state_name(&self.engine, c.entity) == "normal")
                    .map(|c| c.entity)
                    .collect();
                (Vec::new(), Some(Side::Party), CombatOverReason::Fled)
            }
            EndCombatReason::Scenario => {
                if !found.end_reasons.contains(&EndCombatReason::Scenario) {
                    return Err(rejected(
                        RejectReason::ConditionNotMet,
                        format!("{id} does not list scenario among the ways it can end."),
                    ));
                }
                (Vec::new(), None, CombatOverReason::Scenario)
            }
            EndCombatReason::Surrender => {
                let Some(condition) = found.surrender.as_ref().filter(|c| self.surrender_holds(c))
                else {
                    return Err(error(
                        ErrorCode::SurrenderNotAvailable,
                        if found.surrender.is_some() {
                            format!("The surrender condition of {id} does not hold right now.")
                        } else {
                            format!("{id} declares no surrender condition.")
                        },
                    ));
                };
                // The side they surrender to is the other one.
                let winner = match condition
                    .creatures
                    .iter()
                    .find_map(|h| self.entity(&h.0).ok())
                    .and_then(|e| self.side_of(e))
                {
                    Some(Side::Hostile) => Some(Side::Party),
                    Some(Side::Party) => Some(Side::Hostile),
                    _ => None,
                };
                (
                    self.surrendering(condition),
                    winner,
                    CombatOverReason::Surrender,
                )
            }
        };

        let round = self.round();
        self.drain();
        if reason == CombatOverReason::Surrender {
            // The creatures that gave up and the winners stop being enemies, in core too, so
            // they can share a later scene (an interrogation) without a fight. Core takes the
            // more hostile of the two directions, so both change: the surrendered creatures
            // toward the winners' factions, and each winner toward the surrendered creatures
            // only, so the rest of their faction stays as it was.
            let winner_entities: Vec<Entity> = self
                .scene
                .creatures
                .iter()
                .filter(|c| Some(c.side) == winner)
                .map(|c| c.entity)
                .collect();
            let winner_factions: HashSet<FactionId> = winner_entities
                .iter()
                .filter_map(|e| self.engine.world.get::<&FactionSet>(*e).ok())
                .flat_map(|factions| factions.iter().cloned().collect::<Vec<_>>())
                .collect();
            for entity in &surrendering {
                self.attitude_overrides(*entity, |overrides| {
                    for faction in &winner_factions {
                        overrides
                            .factions
                            .insert(faction.clone(), Attitude::Neutral);
                    }
                });
            }
            for entity in &winner_entities {
                self.attitude_overrides(*entity, |overrides| {
                    for surrendered in &surrendering {
                        overrides.entities.insert(*surrendered, Attitude::Neutral);
                    }
                });
            }
            for creature in &mut self.scene.creatures {
                if surrendering.contains(&creature.entity) {
                    creature.side = Side::Neutral;
                }
            }
            let handles = surrendering
                .iter()
                .map(|e| Handle(self.handle_of(*e)))
                .collect();
            self.pending
                .push(Pending::public(round, EventKind::Surrendered { handles }));
        }
        if reason == CombatOverReason::Fled {
            let handles = fleeing.iter().map(|e| Handle(self.handle_of(*e))).collect();
            self.pending
                .push(Pending::public(round, EventKind::Fled { handles }));
        }
        self.engine.end_encounter(&core_id);
        self.drain();
        // The creatures that ran have left the scene (Milestone 5 spec D11).
        for entity in &fleeing {
            let _ = self.engine.despawn(*entity);
            self.hp.remove(entity);
        }
        self.scene
            .creatures
            .retain(|c| !fleeing.contains(&c.entity));
        self.stand_up();
        self.pending.push(combat_over(round, winner, reason));
        self.encounter = None;
        self.scene_encounter = None;
        self.scripted_turn = None;
        Ok(())
    }

    /// The scene's encounters as the DM sees them.
    pub fn encounters(&self) -> Vec<EncounterView> {
        let running = self
            .running_encounter()
            .and(self.scene_encounter.as_deref());
        self.scene
            .encounters
            .iter()
            .map(|e| {
                let holding = e
                    .surrender
                    .as_ref()
                    .filter(|c| running == Some(e.id.as_str()) && self.surrender_holds(c));
                EncounterView {
                    id: e.id.clone(),
                    running: running == Some(e.id.as_str()),
                    surrender_available: holding.is_some(),
                    surrendering: holding
                        .map(|c| {
                            self.surrendering(c)
                                .into_iter()
                                .map(|e| Handle(self.handle_of(e)))
                                .collect()
                        })
                        .unwrap_or_default(),
                }
            })
            .collect()
    }

    /// The creatures a surrender under `condition` would make neutral: its creatures in the scene
    /// that are still conscious, in the condition's order.
    fn surrendering(&self, condition: &SurrenderCondition) -> Vec<Entity> {
        condition
            .creatures
            .iter()
            .filter_map(|h| self.entity(&h.0).ok())
            .filter(|e| life_state_name(&self.engine, *e) == "normal")
            .collect()
    }

    /// Changes `entity`'s attitude overrides in core, adding the component the first time.
    fn attitude_overrides(&mut self, entity: Entity, change: impl FnOnce(&mut AttitudeOverride)) {
        if self.engine.world.get::<&AttitudeOverride>(entity).is_err() {
            let _ = self
                .engine
                .world
                .insert_one(entity, AttitudeOverride::new());
        }
        if let Ok(mut overrides) = self.engine.world.get::<&mut AttitudeOverride>(entity) {
            change(&mut overrides);
        }
    }

    /// Whether any trigger of a surrender condition holds, counted over its creatures that are
    /// in the scene. With none of them in the scene nobody can surrender, and a leader who is
    /// not in the scene is not down.
    fn surrender_holds(&self, condition: &SurrenderCondition) -> bool {
        let creatures: Vec<Entity> = condition
            .creatures
            .iter()
            .filter_map(|h| self.entity(&h.0).ok())
            .collect();
        if creatures.is_empty() {
            return false;
        }
        let down = |e: Entity| {
            !systems::health::is_alive(&self.engine.world, e)
                || life_state_name(&self.engine, e) != "normal"
        };
        condition.any_of.iter().any(|trigger| match trigger {
            SurrenderTrigger::HpFractionAtMost { fraction } => {
                let (hp, hp_max) = creatures.iter().fold((0, 0), |(hp, max), e| {
                    let (h, m, _) = hit_points(&self.engine, *e);
                    (hp + h, max + m)
                });
                hp_max > 0 && (hp as f32) <= fraction * hp_max as f32
            }
            SurrenderTrigger::StandingAtMost { count } => {
                creatures.iter().filter(|e| !down(**e)).count() as u32 <= *count
            }
            SurrenderTrigger::LeaderDown { handle } => self.entity(&handle.0).is_ok_and(down),
        })
    }

    /// The options at `actor`'s pending action prompt, and the ones it has but cannot take.
    pub fn legal_actions(
        &mut self,
        actor: &str,
    ) -> Result<(Vec<ActionOption>, Vec<UnavailableOption>), ApiError> {
        let entity = self.entity(actor)?;
        self.require_action_prompt(entity)?;
        Ok(self.listing(entity))
    }

    /// What `actor` has left of its turn: actions, Bonus Actions and Reactions by their resource
    /// uses, movement from its effective Speed (Dash included).
    pub fn turn_budget(&self, actor: &str) -> Result<TurnBudget, ApiError> {
        let entity = self.entity(actor)?;
        let engine = &self.engine;
        let mut budget = TurnBudget {
            action: 0,
            bonus_action: 0,
            reaction: 0,
            movement_ft: 0,
            speed_ft: 0,
        };
        if let Ok(map) = engine.world.get::<&ResourceMap>(entity) {
            for (id, kind) in map.iter() {
                let ResourceBudgetKind::Flat(uses) = kind else {
                    continue;
                };
                match id.id() {
                    "resource.action" => budget.action = uses.current_uses,
                    "resource.bonus_action" => budget.bonus_action = uses.current_uses,
                    "resource.reaction" => budget.reaction = uses.current_uses,
                    _ => {}
                }
            }
        }
        let speed = systems::movement::speed(engine, entity);
        let feet =
            |length: uom::si::f32::Length| length.get::<uom::si::length::meter>() / METERS_PER_FOOT;
        // A hair of slack so 30 ft stored as 9.144 m is not floored to 29.
        budget.movement_ft = (feet(speed.remaining_movement()) + 1e-3).floor() as u32;
        budget.speed_ft = feet(speed.total_speed()).round() as u32;
        Ok(budget)
    }

    /// Out of combat: the options `actor` could take on a turn of its own, listed as if that turn
    /// began now (its action and Bonus Action back). Nothing changes.
    pub fn explore_legal_actions(
        &mut self,
        actor: &str,
    ) -> Result<(Vec<ActionOption>, Vec<UnavailableOption>), ApiError> {
        let entity = self.entity(actor)?;
        Ok(self.as_if_next_turn(entity, |game| game.listing(entity)))
    }

    /// Runs `f` as if `entity`'s next turn had begun: the action, Bonus Action and per-turn uses
    /// a fight or an earlier explore action spent are back for it, and taken away again after.
    fn as_if_next_turn<T>(&mut self, entity: Entity, f: impl FnOnce(&mut Self) -> T) -> T {
        let world = &mut self.engine.world;
        let resources = systems::helpers::get_component_clone::<ResourceMap>(world, entity);
        let cooldowns = systems::helpers::get_component_clone::<ActionCooldownMap>(world, entity);
        systems::resources::recharge(world, entity, &RechargeRule::Turn);
        let was = std::mem::replace(&mut self.next_turn, true);
        let out = f(self);
        self.next_turn = was;
        let world = &mut self.engine.world;
        *systems::helpers::get_component_mut::<ResourceMap>(world, entity) = resources;
        *systems::helpers::get_component_mut::<ActionCooldownMap>(world, entity) = cooldowns;
        out
    }

    /// The options `entity` can take now, and the ones it has but cannot take. The list is kept
    /// for a `submit` that follows.
    fn listing(&mut self, entity: Entity) -> (Vec<ActionOption>, Vec<UnavailableOption>) {
        let entries = self.options(entity);
        let options = entries.iter().map(|o| o.option.clone()).collect();
        self.listed = Some(Listed {
            entity,
            next_turn: self.next_turn,
            options: entries,
        });

        // Actions the creature has but cannot use right now, so a caller can explain why not.
        let engine = &mut self.engine;
        let available = match ActionBuilder::available(engine, entity).state() {
            Ok(ActionBuilderState::Action { actions }) => actions.clone(),
            _ => Default::default(),
        };
        let mut unavailable = Vec::new();
        for (action_id, contexts) in systems::actions::all_actions(engine, entity) {
            if available.contains_key(&action_id)
                || systems::actions::get_action(&action_id).is_none_or(|a| a.is_reaction())
            {
                continue;
            }
            let problem = contexts.iter().find_map(|(context, cost)| {
                systems::actions::action_usable(
                    engine,
                    entity,
                    &action_id,
                    None,
                    context,
                    cost,
                    &[
                        systems::actions::ActionUsabilityCheck::ActionKnown,
                        systems::actions::ActionUsabilityCheck::Variant,
                    ],
                )
                .err()
            });
            let (reason, message) = match problem {
                Some(problem) => reason_for(&format!("{problem:?}")),
                // Known and without variants, so what is missing is an action, bonus action
                // or use this turn.
                None => (
                    RejectReason::ActionAlreadyUsed,
                    "It cannot be used again this turn.".to_string(),
                ),
            };
            let (option_id, name) = match contexts.first() {
                Some((context, _)) => names::option_for(engine, entity, &action_id, context),
                None => names::option_id_and_name(&action_id, None),
            };
            unavailable.push(UnavailableOption {
                option_id: OptionId(option_id),
                name,
                reason,
                message,
            });
        }
        unavailable.sort_by(|a, b| a.option_id.0.cmp(&b.option_id.0));
        (options, unavailable)
    }

    /// Takes one option at `actor`'s pending action prompt.
    pub fn submit(
        &mut self,
        actor: &str,
        option_id: &str,
        targets: &[String],
        aim: Option<&Aim>,
        variant: Option<&str>,
    ) -> Result<(), ApiError> {
        let entity = self.entity(actor)?;
        self.require_action_prompt(entity)?;
        let (option, variant, target_entities, area) =
            self.pick_option(entity, actor, option_id, targets, aim, variant)?;
        if area.is_some() {
            self.area_caught.clone_from(&target_entities);
        }
        let submitted = self.submit_entity(
            entity,
            &option.action_id,
            variant.as_ref(),
            option.context,
            &target_entities,
            area,
        );
        if submitted.is_err() {
            self.area_caught.clear();
        }
        if submitted? {
            self.walk_then_act = Some(WalkThenAct::of(entity, actor, &option.option, targets));
        }
        self.settle();
        self.drain();
        self.area_caught.clear();
        self.advance();
        Ok(())
    }

    /// Out of combat: `actor` takes one option as a turn of its own. Its next turn begins first,
    /// as for Help: the action and Bonus Action come back, and whatever lasted until the start of
    /// its turn ends. Everything is checked before that, so a refused submit changes nothing.
    pub fn explore_submit(
        &mut self,
        actor: &str,
        option_id: &str,
        targets: &[String],
        aim: Option<&Aim>,
        variant: Option<&str>,
    ) -> Result<(), ApiError> {
        let entity = self.entity(actor)?;
        if !systems::health::is_alive(&self.engine.world, entity)
            || life_state_name(&self.engine, entity) != "normal"
        {
            return Err(rejected(
                RejectReason::ConditionPrevents,
                format!("{actor} is down and cannot act."),
            ));
        }
        let (option, variant, target_entities, area) = self.as_if_next_turn(entity, |game| {
            game.pick_option(entity, actor, option_id, targets, aim, variant)
        })?;
        // Acting on an enemy starts a fight, and a fight starts only with start_combat, so
        // Initiative and surprise come from the scene.
        let side = |e: Entity| {
            self.scene
                .creatures
                .iter()
                .find(|c| c.entity == e)
                .map(|c| c.side)
        };
        let enemies = |a: Option<Side>, b: Option<Side>| {
            matches!(
                (a, b),
                (Some(Side::Party), Some(Side::Hostile)) | (Some(Side::Hostile), Some(Side::Party))
            )
        };
        if let Some(&enemy) = target_entities
            .iter()
            .find(|&&t| enemies(side(entity), side(t)))
        {
            return Err(error(
                ErrorCode::WrongMode,
                format!(
                    "{option_id} on {} starts a fight; call start_combat first.",
                    self.handle_of(enemy)
                ),
            ));
        }
        self.next_explore_turn(entity);
        if area.is_some() {
            self.area_caught.clone_from(&target_entities);
        }
        let submitted = self.submit_entity(
            entity,
            &option.action_id,
            variant.as_ref(),
            option.context,
            &target_entities,
            area,
        );
        if submitted.is_err() {
            self.area_caught.clear();
        }
        if submitted? {
            self.walk_then_act = Some(WalkThenAct::of(entity, actor, &option.option, targets));
        }
        // An explore command that acts closes a finished fight's `combat_over`, as `move` does.
        self.close_finished_fight();
        self.settle();
        self.decline_explore_reactions();
        self.drain();
        self.area_caught.clear();
        Ok(())
    }

    /// The option `option_id` among `entity`'s options now, the variant asked for, and the
    /// targets' entities. For an area option, the creatures its aim catches and the aim itself.
    fn pick_option(
        &mut self,
        entity: Entity,
        actor: &str,
        option_id: &str,
        targets: &[String],
        aim: Option<&Aim>,
        variant: Option<&str>,
    ) -> Result<Picked, ApiError> {
        let target_entities = targets
            .iter()
            .map(|t| self.entity(t))
            .collect::<Result<Vec<_>, _>>()?;
        let option = self
            .options_now(entity)
            .into_iter()
            .find(|o| o.option.option_id.0 == option_id)
            .ok_or_else(|| {
                if let Some(name) = self.item_left_none(entity, option_id) {
                    return rejected(
                        RejectReason::NoItemLeft,
                        format!("{actor} has no {name} left; see legal_actions."),
                    );
                }
                error(
                    ErrorCode::UnknownOption,
                    format!(
                        "{option_id} is not one of {actor}'s options right now; see legal_actions."
                    ),
                )
            })?;

        let variant = match (variant, option.variants.is_empty()) {
            (None, true) => None,
            (Some(_), true) => {
                return Err(error(
                    ErrorCode::BadRequest,
                    format!("{option_id} has no variants; send it without one."),
                ));
            }
            (None, false) => {
                return Err(rejected(
                    RejectReason::NeedsVariant,
                    format!("{option_id} needs one of its variants; see legal_actions."),
                ));
            }
            (Some(wanted), false) => Some(
                option
                    .variants
                    .iter()
                    .find(|v| names::variant_stem(v) == wanted)
                    .ok_or_else(|| {
                        // The valid ids, so a caller that sent a bare `heal` for
                        // `divine_spark/heal` can fix it on its retry.
                        let valid: Vec<String> =
                            option.variants.iter().map(names::variant_stem).collect();
                        error(
                            ErrorCode::UnknownOption,
                            format!(
                                "{wanted} is not one of {option_id}'s variants right now; send one of: {}.",
                                valid.join(", ")
                            ),
                        )
                    })?
                    .clone(),
            ),
        };
        if option.option.targeting != Targeting::Area {
            if aim.is_some() {
                return Err(error(
                    ErrorCode::BadRequest,
                    format!("{option_id} is not an area option; send targets, not an aim."),
                ));
            }
            return Ok((option, variant, target_entities, None));
        }
        if !targets.is_empty() {
            return Err(rejected(
                RejectReason::InvalidTarget,
                format!("{option_id} is aimed with aim, not targets."),
            ));
        }
        let Some(aim) = aim else {
            return Err(rejected(
                RejectReason::NeedsPoint,
                format!(
                    "{option_id} needs an aim: a creature, an anchor or a point; see area.aims in legal_actions."
                ),
            ));
        };
        let target = self.aim_target(aim)?;
        let catches = {
            let engine = &mut self.engine;
            let mut builder = ActionBuilder::available(engine, entity);
            builder.action(engine, &option.action_id);
            if let Some(variant) = &variant {
                builder.variant(&engine.world, variant);
            }
            if pick_context(&mut builder, &engine.world, option.context) {
                area_catches(engine, &mut builder, target.clone())
            } else {
                Some(Vec::new())
            }
        };
        let Some(catches) = catches else {
            return Err(rejected(
                RejectReason::OutOfRange,
                format!(
                    "That aim is beyond {option_id}'s range of {} feet; aim closer.",
                    option.option.range_ft.unwrap_or(0.0)
                ),
            ));
        };
        if catches.is_empty() {
            return Err(rejected(
                RejectReason::AreaEmpty,
                format!(
                    "That aim of {option_id} catches no creature, so nothing was spent; see area.aims in legal_actions."
                ),
            ));
        }
        Ok((option, variant, catches, Some(target)))
    }

    /// The engine target an aim names: a creature, or a point for an anchor or a point.
    fn aim_target(&self, aim: &Aim) -> Result<TargetInstance, ApiError> {
        Ok(match aim {
            Aim::Creature { handle } => TargetInstance::entity(EntityIdentifier::from_world(
                &self.engine.world,
                self.entity(&handle.0)?,
            )),
            Aim::Point { point } => TargetInstance::Point(to_core_point(*point)),
            Aim::Anchor { anchor } => {
                let Some(found) = self.scene.anchors.iter().find(|a| a.id == *anchor) else {
                    let mut e = error(
                        ErrorCode::UnknownAnchor,
                        format!("Scene {} has no anchor {anchor}.", self.scene.id),
                    );
                    e.hint = Some(ErrorHint {
                        legal_option_ids: Vec::new(),
                        awaiting: None,
                        known_ids: self.scene.anchors.iter().map(|a| a.id.clone()).collect(),
                    });
                    return Err(e);
                };
                TargetInstance::Point(to_core_point(found.position_ft))
            }
        })
    }

    /// The item's name when `option_id` is `use/<item>` for a known item `entity` no longer
    /// carries; `None` otherwise.
    fn item_left_none(&self, entity: Entity, option_id: &str) -> Option<String> {
        let word = option_id.strip_prefix("use/")?;
        let item = ItemId::new("nat20_core", format!("item.{word}"));
        ItemsRegistry::get(&item)?;
        (systems::inventory::item_count(&self.engine.world, entity, &item) == 0)
            .then(|| names::item_name(&item))
    }

    /// Answers `actor`'s pending reaction prompt; `None` declines.
    pub fn react(&mut self, actor: &str, choice: Option<u32>) -> Result<(), ApiError> {
        let entity = self.entity(actor)?;
        match self.awaiting() {
            Awaiting::Reaction {
                reactor, options, ..
            } if reactor == entity => {
                if choice.is_some_and(|c| c as usize >= options.len()) {
                    return Err(error(
                        ErrorCode::UnknownOption,
                        format!("{actor} has {} reaction options.", options.len()),
                    ));
                }
            }
            other => {
                return Err(error(
                    ErrorCode::NotYourTurn,
                    format!(
                        "The engine is not waiting on a reaction from {actor}: {}.",
                        self.describe(&other)
                    ),
                ));
            }
        }
        self.react_entity(entity, choice.map(|c| c as usize))?;
        self.settle();
        self.drain();
        self.advance();
        Ok(())
    }

    /// Ends `actor`'s turn.
    pub fn end_turn(&mut self, actor: &str) -> Result<(), ApiError> {
        let entity = self.entity(actor)?;
        self.require_action_prompt(entity)?;
        self.engine.end_turn(entity);
        self.settle();
        self.drain();
        self.advance();
        Ok(())
    }

    /// What the engine waits on, with handles instead of entities.
    pub fn wait(&self) -> Wait {
        match self.awaiting() {
            Awaiting::Nothing => Wait::Idle,
            Awaiting::CombatOver { winner } => Wait::CombatOver { winner },
            Awaiting::Action { actor } => Wait::Action {
                actor: self.handle_of(actor),
            },
            Awaiting::Reaction {
                reactor,
                trigger,
                moving,
                options,
            } => {
                let actor = self.handle_of(reactor);
                Wait::Reaction {
                    cause: trigger.map(|by| {
                        let by = self.handle_of(by);
                        if moving {
                            TriggerCause::Moved(by)
                        } else {
                            TriggerCause::Acted(by)
                        }
                    }),
                    trigger: match trigger {
                        Some(by) => format!("{actor} may react to {}.", self.handle_of(by)),
                        None => format!("{actor} may react."),
                    },
                    actor,
                    options: options
                        .iter()
                        .enumerate()
                        .map(|(i, o)| {
                            let (option_id, name) =
                                names::option_for(&self.engine, reactor, &o.action_id, &o.context);
                            ReactionOption {
                                choice: i as u32,
                                option_id: OptionId(option_id),
                                name,
                            }
                        })
                        .collect(),
                }
            }
        }
    }

    /// Every option `entity` can take now, with the engine action and context behind each id.
    fn options(&mut self, entity: Entity) -> Vec<OptionEntry> {
        let scene_entities: Vec<(String, Entity, Side)> = self
            .scene
            .creatures
            .iter()
            .map(|c| (c.handle.clone(), c.entity, c.side))
            .collect();
        // What an area can be aimed at: each other living creature, then each anchor.
        let aims: Vec<(Aim, TargetInstance)> = scene_entities
            .iter()
            .filter(|(_, other, _)| {
                *other != entity && life_state_name(&self.engine, *other) != "dead"
            })
            .map(|(handle, other, _)| {
                (
                    Aim::Creature {
                        handle: Handle(handle.clone()),
                    },
                    TargetInstance::entity(EntityIdentifier::from_world(
                        &self.engine.world,
                        *other,
                    )),
                )
            })
            .chain(self.scene.anchors.iter().map(|a| {
                (
                    Aim::Anchor {
                        anchor: a.id.clone(),
                    },
                    TargetInstance::Point(to_core_point(a.position_ft)),
                )
            }))
            .collect();
        let engine = &mut self.engine;
        let actions = match ActionBuilder::available(engine, entity).state() {
            Ok(ActionBuilderState::Action { actions }) => actions.clone(),
            _ => return Vec::new(),
        };

        let mut out: Vec<OptionEntry> = Vec::new();
        for (action_id, contexts) in &actions {
            // An action with variants (Help with a check: which skill) is one option; its
            // variants are the ones the actor can use on at least one target.
            let mut builder = ActionBuilder::available(engine, entity);
            builder.action(engine, action_id);
            let variant_ids: Vec<Option<ActionVariantId>> = match builder.state() {
                Ok(ActionBuilderState::Variant { variants, .. }) => {
                    variants.iter().cloned().map(Some).collect()
                }
                _ => vec![None],
            };
            for (index, (context, cost)) in contexts.iter().enumerate() {
                let start = |engine: &mut EngineState, variant: Option<&ActionVariantId>| {
                    let mut builder = ActionBuilder::available(engine, entity);
                    builder.action(engine, action_id);
                    if let Some(variant) = variant {
                        builder.variant(&engine.world, variant);
                    }
                    pick_context(&mut builder, &engine.world, index).then_some(builder)
                };
                let mut usable: Vec<ActionVariantId> = Vec::new();
                let mut targets: Vec<TargetCandidate> = Vec::new();
                let mut shape = None;
                let mut area = None;
                for variant in &variant_ids {
                    let Some(builder) = start(engine, variant.as_ref()) else {
                        continue;
                    };
                    let Ok(ActionBuilderState::Targets { action, .. }) = builder.state() else {
                        continue;
                    };
                    let targeting_context =
                        systems::actions::targeting_context_data(&engine.world, action);
                    let range_m: f32 = targeting_context
                        .range
                        .max()
                        .get::<uom::si::length::meter>();
                    let (targeting, max_targets) = match targeting_context.kind {
                        TargetingKind::SelfTarget => (Targeting::OnSelf, 0),
                        TargetingKind::Single => (Targeting::Single, 1),
                        TargetingKind::Multiple { max_targets, .. } => {
                            (Targeting::Multiple, max_targets as u32)
                        }
                        TargetingKind::Area {
                            shape: area_shape,
                            fixed_on_actor,
                            ..
                        } => {
                            let Some((wire_shape, size_m)) = wire_area_shape(&area_shape) else {
                                continue;
                            };
                            if area.is_none() {
                                let mut previews = Vec::new();
                                for (aim, target) in &aims {
                                    let Some(mut probe) = start(engine, variant.as_ref()) else {
                                        continue;
                                    };
                                    let caught = area_catches(engine, &mut probe, target.clone())
                                        .unwrap_or_default();
                                    let catches: Vec<Handle> = scene_entities
                                        .iter()
                                        .filter(|(_, e, _)| caught.contains(e))
                                        .map(|(h, _, _)| Handle(h.clone()))
                                        .collect();
                                    if !catches.is_empty() {
                                        previews.push(AreaAim {
                                            aim: aim.clone(),
                                            catches,
                                        });
                                    }
                                }
                                area = Some(OptionArea {
                                    shape: wire_shape,
                                    size_ft: round_ft(size_m),
                                    from_self: fixed_on_actor,
                                    aims: previews,
                                });
                            }
                            (Targeting::Area, 0)
                        }
                    };
                    let mut found = Vec::new();
                    if !matches!(targeting, Targeting::OnSelf | Targeting::Area) {
                        for (handle, other, side) in &scene_entities {
                            // A creature at 0 Hit Points stays a target: Help can stabilize it.
                            // The actor itself is a target only for an item it can drink.
                            if (*other == entity && context.item.is_none())
                                || life_state_name(engine, *other) == "dead"
                            {
                                continue;
                            }
                            let Some(mut probe) = start(engine, variant.as_ref()) else {
                                continue;
                            };
                            probe.target_entity(engine, *other);
                            let in_range = match probe.state() {
                                Ok(ActionBuilderState::Targets {
                                    path_to_target: Some(TargetPathFindingResult::AlreadyInRange(_)),
                                    ..
                                }) => true,
                                Ok(ActionBuilderState::Targets {
                                    path_to_target: Some(TargetPathFindingResult::PathFound(path)),
                                    ..
                                }) if path.path_result.reaches_goal() => false,
                                _ => continue,
                            };
                            found.push(TargetCandidate {
                                handle: Handle(handle.clone()),
                                side: *side,
                                distance_ft: distance_m(engine, entity, *other)
                                    .map(round_ft)
                                    .unwrap_or(0.0),
                                in_range,
                            });
                        }
                        if found.is_empty() {
                            continue;
                        }
                    }
                    if let Some(variant) = variant {
                        usable.push(variant.clone());
                    }
                    for candidate in found {
                        match targets.iter_mut().find(|t| t.handle == candidate.handle) {
                            Some(known) => known.in_range |= candidate.in_range,
                            None => targets.push(candidate),
                        }
                    }
                    shape.get_or_insert((targeting, max_targets, range_m));
                }
                let Some((targeting, max_targets, range_m)) = shape else {
                    continue;
                };
                usable.sort_by_key(names::variant_stem);
                let (mut option_id, name) = names::option_for(engine, entity, action_id, context);
                if out.iter().any(|o| o.option.option_id.0 == option_id) {
                    option_id = format!("{option_id}/{index}");
                }
                out.push(OptionEntry {
                    option: ActionOption {
                        option_id: OptionId(option_id),
                        action: action_id.to_string(),
                        name,
                        cost: action_cost(&cost.map),
                        targeting,
                        max_targets,
                        range_ft: match &area {
                            Some(area) => (!area.from_self).then(|| round_ft(range_m)),
                            None => (targeting != Targeting::OnSelf).then(|| round_ft(range_m)),
                        },
                        targets,
                        variants: usable
                            .iter()
                            .map(|v| OptionVariant {
                                variant: names::variant_stem(v),
                                name: names::variant_name(v),
                            })
                            .collect(),
                        spell: names::option_spell(context),
                        item: names::option_item(engine, entity, context),
                        area,
                    },
                    action_id: action_id.clone(),
                    context: index,
                    variants: usable,
                });
            }
        }
        out.sort_by(|a, b| a.option.option_id.0.cmp(&b.option.option_id.0));
        out
    }

    // ---- engine driving -------------------------------------------------

    /// Submits one option to the engine. `Ok(true)` when the actor first walks toward its target,
    /// to take the option where the walk ends if it gets in reach. Any walk it starts is logged by
    /// `drain` (API-32).
    fn submit_entity(
        &mut self,
        entity: Entity,
        action_id: &ActionId,
        variant: Option<&ActionVariantId>,
        context: usize,
        targets: &[Entity],
        area: Option<TargetInstance>,
    ) -> Result<bool, ApiError> {
        let engine = &mut self.engine;
        let mut builder = ActionBuilder::available(engine, entity);
        builder.action(engine, action_id);
        if let Ok(ActionBuilderState::Variant { .. }) = builder.state() {
            let Some(variant) = variant else {
                return Err(rejected(
                    RejectReason::NeedsVariant,
                    "This option needs one of its variants.",
                ));
            };
            builder.variant(&engine.world, variant);
        }
        if !pick_context(&mut builder, &engine.world, context) {
            return Err(error(
                ErrorCode::UnknownOption,
                "That option is not offered at this prompt.",
            ));
        }
        if let Ok(ActionBuilderState::Targets { action, .. }) = builder.state() {
            let kind = systems::actions::targeting_context_data(&engine.world, action).kind;
            if matches!(kind, TargetingKind::SelfTarget) {
                // A self-targeted option takes no targets (`max_targets: 0`); never quietly
                // run it on the actor when the caller named someone else.
                if !targets.is_empty() {
                    return Err(rejected(
                        RejectReason::InvalidTarget,
                        "This option targets its user; send it without targets.",
                    ));
                }
                // The builder fills in the actor itself for most self-targeted
                // actions; only add it when it did not.
                if action.targets.is_empty() {
                    builder.target_entity(engine, entity);
                }
            } else if let Some(area) = area {
                builder.target(engine, area);
            } else {
                if targets.is_empty() {
                    return Err(rejected(
                        RejectReason::NeedsTarget,
                        "This option needs a target.",
                    ));
                }
                for target in targets {
                    builder.target_entity(engine, *target);
                }
            }
        }
        let activity = builder.build(engine).map_err(|e| refusal(&e))?;
        // Core walks without acting (`Move`) when the target is beyond the movement left: the
        // option is dropped where the walk ends, as for a walk an opportunity attack stops.
        let walks = matches!(
            activity,
            Activity::MoveAndAct { .. } | Activity::Move { .. }
        );
        let from = systems::geometry::get_foot_position(&engine.world, entity);
        engine.submit_activity(activity).map_err(|e| refusal(&e))?;
        if let Some(from) = from.filter(|_| walks) {
            self.walks.push(Walk {
                entity,
                from,
                after_reaction: false,
                anchor: None,
            });
        }
        Ok(walks)
    }

    fn react_entity(&mut self, entity: Entity, choice: Option<usize>) -> Result<(), ApiError> {
        let engine = &mut self.engine;
        let mut builder = ReactionBuilder::new(engine, entity);
        match choice {
            Some(index) => builder.option_index(index),
            None => builder.option_none(),
        };
        let activity = builder.build().map_err(|e| refusal(&e))?;
        engine.submit_activity(activity).map_err(|e| refusal(&e))
    }

    /// Whether `entity` can take one of the Help actions on `goal` now: the target within reach,
    /// and the variant's own requirement (proficiency in the skill) met.
    fn check_help(
        &mut self,
        entity: Entity,
        actor: &str,
        action: &ActionId,
        variant: Option<&ActionVariantId>,
        goal: (Entity, &str),
    ) -> Result<(), ApiError> {
        self.help_builder(entity, actor, action, variant, goal)?;
        let engine = &self.engine;
        let contexts = systems::actions::all_actions(engine, entity)
            .remove(action)
            .unwrap_or_default();
        let mut problem = None;
        for (context, cost) in &contexts {
            match systems::actions::action_usable(
                engine,
                entity,
                action,
                variant,
                context,
                cost,
                &[],
            ) {
                Ok(()) => return Ok(()),
                Err(e) => problem = problem.or(Some(e)),
            }
        }
        Err(match problem {
            Some(problem) => refusal(&problem),
            None => refusal(&"ActionNotKnown"),
        })
    }

    /// A builder for one of the Help actions aimed at `goal`, its target within reach.
    fn help_builder(
        &mut self,
        entity: Entity,
        actor: &str,
        action: &ActionId,
        variant: Option<&ActionVariantId>,
        (target, target_handle): (Entity, &str),
    ) -> Result<ActionBuilder, ApiError> {
        let engine = &mut self.engine;
        let mut builder = ActionBuilder::available(engine, entity);
        builder.action(engine, action);
        if let Some(variant) = variant {
            builder.variant(&engine.world, variant);
        }
        if !pick_context(&mut builder, &engine.world, 0) {
            return Err(match builder.state() {
                Err(problem) => refusal(problem),
                Ok(_) => refusal(&"InvalidTarget"),
            });
        }
        builder.target_entity(engine, target);
        match builder.state() {
            Ok(ActionBuilderState::Targets {
                path_to_target: Some(TargetPathFindingResult::AlreadyInRange(_)),
                ..
            }) => Ok(builder),
            Ok(ActionBuilderState::Targets {
                path_to_target: Some(_),
                ..
            }) => Err(rejected(
                RejectReason::OutOfRange,
                format!("{actor} must be within 5 feet of {target_handle}; move there first."),
            )),
            Ok(_) => Err(refusal(&"InvalidTarget")),
            Err(problem) => Err(refusal(problem)),
        }
    }

    /// Out of combat a creature's turns pass with the story: each action it takes in explore mode
    /// starts its next turn first, as the engine does for a creature outside an encounter. Its
    /// action is back, and whatever lasted until the start of its next turn ends. The turn
    /// boundaries themselves are not logged; nobody is taking turns.
    fn next_explore_turn(&mut self, entity: Entity) {
        self.drain();
        let mark = self.pending.len();
        // What the creature gave others (a Help's Advantage) lives on them and ends at its turn
        // too, so every creature's effects see the boundary.
        // Their clocks run for the boundaries only (see `pause_story_clocks`).
        let creatures: Vec<Entity> = self.scene.creatures.iter().map(|c| c.entity).collect();
        for &creature in &creatures {
            systems::time::set_time_mode(&mut self.engine.world, creature, TimeMode::RealTime);
        }
        for boundary in [TurnBoundary::End, TurnBoundary::Start] {
            for &creature in &creatures {
                systems::time::advance_time(
                    &mut self.engine,
                    creature,
                    TimeStep::TurnBoundary { entity, boundary },
                );
            }
        }
        self.pause_story_clocks();
        // The update sweeps effects that expired at the boundary.
        self.engine.update(0.0);
        self.drain();
        let mut index = 0;
        self.pending.retain(|entry| {
            index += 1;
            index <= mark
                || !matches!(
                    entry.kind,
                    EventKind::TurnStart { .. } | EventKind::TurnEnd { .. }
                )
        });
        // A spell that ran out at the boundary is logged before the turn's action, which may
        // cast the same spell again.
        self.log_unseen_changes();
    }

    /// Out of combat nobody is asked to react: a reaction window that opens in explore mode
    /// (Tactical Mind after a failed check) is declined, so the check or action resolves as
    /// rolled (TASKS CHK-6).
    fn decline_explore_reactions(&mut self) {
        for _ in 0..MAX_SCRIPTED_STEPS {
            let Some(prompt) = self.engine.next_prompt(PromptScopeId::Global) else {
                return;
            };
            let ActionPromptKind::Reactions { options, .. } = &prompt.kind else {
                return;
            };
            let reactors: Vec<Entity> = options.keys().copied().collect();
            for reactor in reactors {
                if let Err(e) = self.react_entity(reactor, None) {
                    eprintln!("nat20-api-server: could not decline an explore reaction: {e:?}");
                    return;
                }
            }
            self.settle();
        }
    }

    /// Out of combat time passes with the story, not with the ticks that play out a move or an
    /// action: the clock of every creature outside a fight is paused, so what lasts until
    /// someone's next turn (a Help) lasts until that turn, however long the engine takes to
    /// settle. Core gives a creature outside an encounter a real-time clock; a fight's
    /// participants keep the turn-based clocks core gives them.
    fn pause_story_clocks(&mut self) {
        for c in &self.scene.creatures {
            if self.engine.encounter_for_entity(c.entity).is_none() {
                systems::time::set_time_mode(&mut self.engine.world, c.entity, TimeMode::Paused);
            }
        }
    }

    /// Ticks the engine until no creature is moving or acting and no event is
    /// waiting on anything but a reaction decision.
    fn settle(&mut self) {
        self.pause_story_clocks();
        for tick in 0..MAX_TICKS {
            if tick >= 2 && self.quiescent() {
                return;
            }
            self.engine.update(TICK_SECONDS);
        }
        self.stalls += 1;
        eprintln!(
            "engine did not settle within {MAX_TICKS} ticks ({} times this session)",
            self.stalls
        );
    }

    fn quiescent(&self) -> bool {
        let engine = &self.engine;
        let all_idle = self.scene.creatures.iter().all(|c| {
            engine
                .world
                .get::<&ActivityState>(c.entity)
                .map(|s| s.is_idle())
                .unwrap_or(true)
        });
        let Some(encounter) = self.encounter else {
            // A reaction window out of combat (Tactical Mind after a failed check) holds the
            // action that opened it until someone declines it.
            let reaction = engine
                .next_prompt(PromptScopeId::Global)
                .is_some_and(|p| matches!(p.kind, ActionPromptKind::Reactions { .. }));
            return all_idle || reaction;
        };
        let scope = engine.prompts.scope(&PromptScopeId::Encounter(encounter));
        let waiting_on_reaction = engine
            .next_prompt(PromptScopeId::Encounter(encounter))
            .is_some_and(|p| matches!(p.kind, ActionPromptKind::Reactions { .. }));
        let no_pending = scope.is_none_or(|s| s.pending_events().is_empty());
        // A reaction prompt holds everyone it doesn't wait on, even a creature still mid-move or
        // mid-attack: one that provoked an opportunity attack (ENG-22), or an attacker
        // whose roll waits on Shield. Ticking on would change nothing.
        waiting_on_reaction || (all_idle && no_pending)
    }

    /// Runs scripted creatures until the engine waits on a client, or combat
    /// is over.
    fn advance(&mut self) {
        for _ in 0..MAX_SCRIPTED_STEPS {
            self.settle();
            self.drain();
            // Catch conditions up at each step: a creature downed by one turn and back up by the
            // next would otherwise show no change by the end of the command.
            self.log_unseen_changes();
            if self.check_combat_over() {
                return;
            }
            self.round_spawns();
            match self.awaiting() {
                Awaiting::Action { actor } if self.control_of(actor) == Some(Control::Scripted) => {
                    self.scripted_action(actor);
                }
                Awaiting::Reaction {
                    reactor, trigger, ..
                } if self.control_of(reactor) == Some(Control::Scripted) => {
                    self.note_provoker();
                    // Scripted creatures take the first reaction offered (for a goblin, the
                    // opportunity attack) when an enemy set it off, and decline otherwise: the
                    // engine offers an opportunity attack on any creature leaving reach, ally
                    // or not.
                    let enemy = trigger.is_some_and(|t| {
                        systems::factions::mutual_attitude(&self.engine.world, reactor, t)
                            == Attitude::Hostile
                    });
                    let choice = enemy.then_some(0);
                    if self.react_entity(reactor, choice).is_err()
                        && let Err(e) = self.react_entity(reactor, None)
                    {
                        // Neither taking nor declining moved the engine on: retrying the
                        // same prompt would only spin, so leave it pending and say why.
                        eprintln!("scripted reaction is stuck: {}", e.message);
                        return;
                    }
                }
                _ => return,
            }
        }
        eprintln!("scripted creatures did not yield within {MAX_SCRIPTED_STEPS} steps");
    }

    /// The monster policy (MON-6, Milestone 5 spec D6). A Bloodied goblin in melee first takes
    /// Nimble Escape and steps away, so it shoots instead. Then it attacks, preferring a melee
    /// weapon already in reach, then any weapon already in range, then moving into melee. Melee
    /// goes for a Prone target first, and a creature with Pack Tactics for one an ally is
    /// beside; a ranged attack avoids Prone targets. Ties go to the nearer target, then by
    /// handle, so a seed replays the same fight. End the turn when no attack is possible.
    fn scripted_action(&mut self, actor: Entity) {
        let round = self
            .encounter
            .and_then(|id| self.engine.encounter(&id))
            .map(|enc| enc.round())
            .unwrap_or(0);
        let taken = match self.scripted_turn {
            Some((r, e, n)) if r == round && e == actor => n,
            _ => 0,
        };

        if taken < MAX_SCRIPTED_ACTIONS_PER_TURN
            && let Some(hostile) = self.should_escape(actor)
        {
            let nimble: ActionId = NIMBLE_ESCAPE.parse().expect("a valid action id");
            if self
                .submit_entity(actor, &nimble, None, 0, &[], None)
                .is_ok()
            {
                self.settle();
                self.drain();
                self.log_unseen_changes();
                self.scripted_retreat(actor, hostile);
                self.scripted_turn = Some((round, actor, taken + 1));
                return;
            }
        }

        let choice = if taken < MAX_SCRIPTED_ACTIONS_PER_TURN {
            self.choose_attack(actor)
        } else {
            None
        };
        if let Some((action_id, context, target)) = choice
            && self
                .submit_entity(actor, &action_id, None, context, &[target], None)
                .is_ok()
        {
            self.scripted_turn = Some((round, actor, taken + 1));
            return;
        }
        self.engine.end_turn(actor);
    }

    /// The hostile creature a Bloodied `actor` should get away from with Nimble Escape: the
    /// nearest one in reach, when the actor can take Nimble Escape and has a ranged attack.
    fn should_escape(&mut self, actor: Entity) -> Option<Entity> {
        let (hp, hp_max, _) = hit_points(&self.engine, actor);
        if health_band(hp, hp_max) != HealthBand::Bloodied {
            return None;
        }
        let nimble: ActionId = NIMBLE_ESCAPE.parse().ok()?;
        let ranged: ActionId = "nat20_core::action.ranged_attack".parse().ok()?;
        let available = match ActionBuilder::available(&self.engine, actor).state() {
            Ok(ActionBuilderState::Action { actions }) => actions.clone(),
            _ => return None,
        };
        if !available.contains_key(&nimble) || !available.contains_key(&ranged) {
            return None;
        }
        self.hostiles_of(actor)
            .into_iter()
            .find(|t| t.distance_m <= REACH_M)
            .map(|t| t.entity)
    }

    /// Steps `actor` away from the hostile creatures around it as far as its movement allows,
    /// straight away from where they stand together (from `hostile` when that is no direction),
    /// or a shorter or turned way when the terrain bends the route. A route that ends within
    /// reach of a hostile creature is no escape, so the actor stays where it is if every one
    /// does.
    fn scripted_retreat(&mut self, actor: Entity, hostile: Entity) {
        let world = &self.engine.world;
        let (Some(here), Some(there)) = (
            systems::geometry::get_foot_position(world, actor),
            systems::geometry::get_foot_position(world, hostile),
        ) else {
            return;
        };
        let hostiles: Vec<Point3<f32>> = self
            .hostiles_of(actor)
            .iter()
            .filter_map(|t| systems::geometry::get_foot_position(world, t.entity))
            .collect();
        let step = remaining_movement_m(&self.engine, actor);
        let Some(away) = retreat_direction(here, there, &hostiles) else {
            return;
        };
        if step <= 0.0 {
            return;
        }
        let route = retreat_goals(here, away, step)
            .into_iter()
            .find_map(|goal| {
                let route =
                    systems::movement::path(&self.engine, actor, &goal, false, true).ok()?;
                let end = *route.full_path.points.last().unwrap_or(&here);
                out_of_reach(end, &hostiles).then_some(route)
            });
        let Some(route) = route else {
            return;
        };
        let end = *route.full_path.points.last().unwrap_or(&here);
        let round = self.round();
        if self
            .engine
            .submit_activity(Activity::Move {
                entity: actor,
                goal: end,
            })
            .is_err()
        {
            return;
        }
        self.settle();
        let landed = systems::geometry::get_foot_position(&self.engine.world, actor)
            .expect("scene creatures have a position");
        self.pending.push(Pending::public(
            round,
            EventKind::Moved {
                actor: Handle(self.handle_of(actor)),
                from: from_core_point(here),
                to: from_core_point(landed),
                anchor: None,
            },
        ));
        self.drain();
    }

    /// The conscious creatures hostile to `actor`, nearest first, with what the policy weighs.
    fn hostiles_of(&self, actor: Entity) -> Vec<Candidate> {
        let engine = &self.engine;
        let prone = EffectId::new("nat20_core", PRONE);
        let incapacitated = EffectId::new("nat20_core", INCAPACITATED);
        let standing = |e: Entity| {
            life_state_name(engine, e) == "normal"
                && !systems::effects::has_effect(engine, e, &incapacitated)
        };
        let allies: Vec<Entity> = self
            .scene
            .creatures
            .iter()
            .filter(|c| c.entity != actor && standing(c.entity))
            .filter(|c| {
                systems::factions::mutual_attitude(&engine.world, actor, c.entity)
                    == Attitude::Friendly
            })
            .map(|c| c.entity)
            .collect();
        let mut hostiles: Vec<Candidate> = self
            .scene
            .creatures
            .iter()
            .filter(|c| c.entity != actor)
            .filter(|c| life_state_name(engine, c.entity) == "normal")
            .filter(|c| {
                systems::factions::mutual_attitude(&engine.world, actor, c.entity)
                    == Attitude::Hostile
            })
            .map(|c| Candidate {
                entity: c.entity,
                handle: c.handle.clone(),
                distance_m: distance_m(engine, actor, c.entity).unwrap_or(f32::MAX),
                prone: systems::effects::has_effect(engine, c.entity, &prone),
                engaged: allies
                    .iter()
                    .any(|a| distance_m(engine, *a, c.entity).is_some_and(|d| d <= REACH_M)),
            })
            .collect();
        hostiles.sort_by(|a, b| {
            a.distance_m
                .total_cmp(&b.distance_m)
                .then_with(|| a.handle.cmp(&b.handle))
        });
        hostiles
    }

    fn choose_attack(&mut self, actor: Entity) -> Option<(ActionId, usize, Entity)> {
        let hostiles = self.hostiles_of(actor);
        let pack_tactics = systems::effects::has_effect(
            &self.engine,
            actor,
            &EffectId::new("nat20_core", PACK_TACTICS),
        );
        // Melee: Prone first, then (with Pack Tactics) one an ally is beside. The sort is
        // stable, so nearest and then handle order break ties.
        let mut for_melee: Vec<&Candidate> = hostiles.iter().collect();
        for_melee.sort_by_key(|t| (!t.prone, !(pack_tactics && t.engaged)));
        // Ranged: a Prone target beyond 5 feet gives Disadvantage, so it goes last.
        let mut for_ranged: Vec<&Candidate> = hostiles.iter().collect();
        for_ranged.sort_by_key(|t| t.prone);

        let melee: ActionId = "nat20_core::action.melee_attack".parse().ok()?;
        let ranged: ActionId = "nat20_core::action.ranged_attack".parse().ok()?;
        let engine = &mut self.engine;
        let available = match ActionBuilder::available(engine, actor).state() {
            Ok(ActionBuilderState::Action { actions }) => actions.clone(),
            _ => return None,
        };

        // (action, allow moving first)
        for (action_id, allow_move) in [(&melee, false), (&ranged, false), (&melee, true)] {
            let Some(contexts) = available.get(action_id) else {
                continue;
            };
            let order = if *action_id == ranged {
                &for_ranged
            } else {
                &for_melee
            };
            for context in 0..contexts.len() {
                for target in order.iter().map(|t| &t.entity) {
                    let mut probe = ActionBuilder::available(engine, actor);
                    probe.action(engine, action_id);
                    if !pick_context(&mut probe, &engine.world, context) {
                        continue;
                    }
                    probe.target_entity(engine, *target);
                    let usable = match probe.state() {
                        Ok(ActionBuilderState::Targets {
                            path_to_target: Some(TargetPathFindingResult::AlreadyInRange(_)),
                            ..
                        }) => true,
                        Ok(ActionBuilderState::Targets {
                            path_to_target: Some(TargetPathFindingResult::PathFound(path)),
                            ..
                        }) => allow_move && path.path_result.reaches_goal(),
                        _ => false,
                    };
                    if usable {
                        return Some((action_id.clone(), context, *target));
                    }
                }
            }
        }
        None
    }

    /// Combat ends when the party or the hostile side has nobody left standing.
    fn check_combat_over(&mut self) -> bool {
        if self.winner.is_some() {
            return true;
        }
        let Some(encounter) = self.encounter else {
            return false;
        };
        let Some(running) = self.engine.encounter(&encounter) else {
            return false;
        };
        let participants: Vec<Entity> = running
            .initiative_order()
            .iter()
            .map(|(entity, _)| *entity)
            .collect();
        let standing = |side: Side| {
            participants.iter().any(|e| {
                self.side_of(*e) == Some(side) && life_state_name(&self.engine, *e) == "normal"
            })
        };
        let (party, hostile) = (standing(Side::Party), standing(Side::Hostile));
        if party && hostile {
            return false;
        }
        let winner = if party {
            Some(Side::Party)
        } else if hostile {
            Some(Side::Hostile)
        } else {
            None
        };
        let round = Some(running.round() as u32);
        self.drain();
        self.engine.end_encounter(&encounter);
        self.drain();
        self.stand_up();
        self.pending
            .push(combat_over(round, winner, CombatOverReason::SideDown));
        self.winner = Some(winner);
        true
    }

    /// Core stands a Prone creature up at the start of its turn (MON-8), and out of combat
    /// nobody takes turns, so when a fight ends every conscious creature still Prone stands.
    /// Movement out of combat costs nothing. A creature whose Speed is 0 stays Prone.
    /// `condition_removed{prone}` is logged with the next batch, after `combat_over`.
    fn stand_up(&mut self) {
        let prone = EffectId::new("nat20_core", PRONE);
        for c in &self.scene.creatures {
            // A creature can't stand up while its Speed is 0 (SRD 5.2.1, Prone)
            let speed_m = systems::movement::speed(&self.engine, c.entity)
                .total_speed()
                .get::<uom::si::length::meter>();
            if life_state_name(&self.engine, c.entity) == "normal" && speed_m > 0.0 {
                systems::effects::remove_effects_by_id(&mut self.engine, c.entity, &prone);
            }
        }
    }

    /// Closes the `combat_over` notice of a fight that ended by itself. The ended encounter goes
    /// too, or clearing `winner` alone would read as combat again.
    fn close_finished_fight(&mut self) {
        if self.winner.take().is_some() {
            self.encounter = None;
            self.scene_encounter = None;
        }
    }

    /// The encounter while combat runs; `None` in explore mode or once combat ended by itself.
    fn running_encounter(&self) -> Option<EncounterId> {
        self.encounter.filter(|_| self.winner.is_none())
    }

    fn awaiting(&self) -> Awaiting {
        if let Some(winner) = self.winner {
            return Awaiting::CombatOver { winner };
        }
        let Some(encounter) = self.encounter else {
            return Awaiting::Nothing;
        };
        let scope_id = PromptScopeId::Encounter(encounter);
        let Some(prompt) = self.engine.next_prompt(scope_id) else {
            return Awaiting::Nothing;
        };
        match &prompt.kind {
            ActionPromptKind::Action { actor } => Awaiting::Action { actor: *actor },
            ActionPromptKind::Reactions { event, options } => {
                let decided = self
                    .engine
                    .prompts
                    .scope(&scope_id)
                    .and_then(|s| s.decisions_for_prompt(&prompt.id));
                // Deterministic order: by scene order.
                for c in &self.scene.creatures {
                    if let Some(opts) = options.get(&c.entity)
                        && !decided.is_some_and(|d| d.contains_key(&c.entity))
                    {
                        return Awaiting::Reaction {
                            reactor: c.entity,
                            trigger: event.actor(),
                            moving: matches!(event.kind, EngineKind::MovingOutOfReach { .. }),
                            options: opts.clone(),
                        };
                    }
                }
                Awaiting::Nothing
            }
        }
    }

    fn describe(&self, awaiting: &Awaiting) -> String {
        match awaiting {
            Awaiting::Nothing if self.encounter.is_none() => {
                "in explore mode; start_combat first".into()
            }
            Awaiting::Nothing => "not waiting on anyone".into(),
            Awaiting::CombatOver { winner } => match winner {
                Some(side) => format!("done, combat is over and the {} side won", side_word(*side)),
                None => "done, combat is over with nobody standing".into(),
            },
            Awaiting::Action { actor } => format!("waiting on {}'s action", self.handle_of(*actor)),
            Awaiting::Reaction { reactor, .. } => {
                format!("waiting on {}'s reaction", self.handle_of(*reactor))
            }
        }
    }

    fn require_action_prompt(&self, entity: Entity) -> Result<(), ApiError> {
        match self.awaiting() {
            Awaiting::Action { actor } if actor == entity => Ok(()),
            Awaiting::Nothing if self.encounter.is_none() => Err(error(
                ErrorCode::WrongMode,
                "There is no combat in this scene yet; call start_combat first.",
            )),
            other => Err(error(
                ErrorCode::NotYourTurn,
                format!(
                    "{} cannot act now: the engine is {}.",
                    self.handle_of(entity),
                    self.describe(&other)
                ),
            )),
        }
    }

    /// Copies new engine events into the pending log.
    fn drain(&mut self) {
        // A reaction prompt holds every walker where it is until it is answered.
        let held = matches!(self.awaiting(), Awaiting::Reaction { .. });
        let engine = &self.engine;
        let encounter = self.encounter.and_then(|id| engine.encounter(&id));
        let initiative = encounter
            .map(|e| {
                e.initiative_order()
                    .iter()
                    .map(|(entity, _)| {
                        self.scene
                            .handles
                            .get(entity)
                            .cloned()
                            .unwrap_or_else(|| format!("{entity:?}"))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mut writer = LogWriter {
            engine,
            handles: &self.scene.handles,
            round: encounter.map(|e| e.round() as u32),
            hp: &mut self.hp,
            keys: &mut self.keys,
            initiative,
            concentration: Default::default(),
            area_targets: &self.area_caught,
            rule_dc: false,
        };

        // The engine splits events between the encounter log and the global log; core's `seq`
        // puts the two back in the order they were logged.
        let mut new_events: Vec<&EngineEvent> = Vec::new();
        if let Some(encounter) = encounter {
            let events = &encounter.event_log().events;
            new_events.extend(events.iter().skip(self.encounter_seen));
            self.encounter_seen = events.len();
        }
        let events = &engine.event_log.events;
        new_events.extend(events.iter().skip(self.global_seen));
        self.global_seen = events.len();
        new_events.sort_by_key(|event| event.seq);
        let mut entries = Vec::new();
        for event in new_events {
            entries.extend(writer.entries(event));
        }

        // A walk core made for an option is logged as a `move` is, once the walker has stopped:
        // right before its `action` when it got to act, else first, or last for a walk on after
        // a reaction (API-32, ENG-22). The `action` ends the walk even while a reaction keeps the
        // walker busy. A walker a reaction holds mid-walk has its walk so far logged now, so the
        // reaction can name it (protocol §3), and walks on from there; any other walk still under
        // way waits for the next batch.
        use nat20_api_contract::EventKind as Kind;
        for walk in std::mem::take(&mut self.walks) {
            let actor = Handle(
                self.scene
                    .handles
                    .get(&walk.entity)
                    .cloned()
                    .unwrap_or_else(|| format!("{:?}", walk.entity)),
            );
            let acted = entries
                .iter()
                .position(|e| matches!(&e.kind, Kind::Action { actor: a, .. } if *a == actor));
            let walking = engine
                .world
                .get::<&ActivityState>(walk.entity)
                .is_ok_and(|s| !s.is_idle());
            let Some(landed) = systems::geometry::get_foot_position(&engine.world, walk.entity)
            else {
                continue;
            };
            let walked = (landed - walk.from).norm() >= 0.05;
            if walking && acted.is_none() {
                if held && walked {
                    self.walks.push(Walk {
                        entity: walk.entity,
                        from: landed,
                        after_reaction: true,
                        anchor: walk.anchor.clone(),
                    });
                } else {
                    self.walks.push(walk);
                    continue;
                }
            } else if !walked {
                continue;
            }
            let last = entries.len();
            let at = acted.unwrap_or(if walk.after_reaction { last } else { 0 });
            entries.insert(
                at,
                Pending::public(
                    encounter.map(|e| e.round() as u32),
                    Kind::Moved {
                        actor,
                        from: from_core_point(walk.from),
                        to: from_core_point(landed),
                        anchor: walk
                            .anchor
                            .filter(|(_, end)| (landed - end).norm() < 0.05)
                            .map(|(anchor, _)| anchor),
                    },
                ),
            );
        }

        // A walk that stopped without the option it walked for: the opportunity attack it
        // provoked dropped the walker (protocol §4.1), or the option couldn't be taken where the
        // walk ended, and core drops the option it carried (API-31).
        if let Some(walk) = self.walk_then_act.take() {
            let acted = entries
                .iter()
                .any(|e| matches!(&e.kind, Kind::Action { actor, .. } if *actor == walk.actor));
            let walking = engine
                .world
                .get::<&ActivityState>(walk.entity)
                .is_ok_and(|s| !s.is_idle());
            if !acted && walking {
                self.walk_then_act = Some(walk);
            } else if !acted {
                entries.push(Pending::public(
                    encounter.map(|e| e.round() as u32),
                    Kind::ActionDropped {
                        actor: walk.actor,
                        option_id: walk.option_id,
                        name: walk.name,
                        targets: walk.targets,
                    },
                ));
            }
        }

        // Within one batch put "combat begins" first, and each round header right before the
        // first turn that starts after it: the writer stamps the whole batch with the round the
        // engine is in now, so what comes before the header belongs to the round before.
        entries.sort_by_key(|e| !matches!(e.kind, Kind::CombatStarted { .. }));
        let headers: Vec<Pending> = entries
            .iter()
            .filter(|e| matches!(e.kind, Kind::Round { .. }))
            .cloned()
            .collect();
        entries.retain(|e| !matches!(e.kind, Kind::Round { .. }));
        for mut header in headers {
            let Kind::Round { number } = header.kind else {
                continue;
            };
            header.round = Some(number);
            let at = entries
                .iter()
                .position(|e| {
                    matches!(e.kind, Kind::TurnStart { .. }) && e.round.is_none_or(|r| r >= number)
                })
                .unwrap_or(entries.len());
            for entry in &mut entries[..at] {
                if entry.round.is_some_and(|r| r >= number) {
                    entry.round = Some(number.saturating_sub(1).max(1));
                }
            }
            entries.insert(at, header);
        }

        // The HP tracker must agree with the engine once the batch is written.
        for c in &self.scene.creatures {
            let actual = hit_points(engine, c.entity);
            if self.hp.get(&c.entity) != Some(&actual) {
                eprintln!(
                    "nat20-api-server: HP tracker for {} drifted to {:?}, engine has {actual:?}",
                    c.handle,
                    self.hp.get(&c.entity)
                );
                self.hp.insert(c.entity, actual);
            }
        }
        self.pending.extend(entries);
    }

    fn log_initiative(&mut self) {
        let engine = &self.engine;
        let Some(encounter) = self.encounter.and_then(|id| engine.encounter(&id)) else {
            return;
        };
        let writer = LogWriter {
            engine,
            handles: &self.scene.handles,
            round: Some(encounter.round() as u32),
            hp: &mut self.hp,
            keys: &mut self.keys,
            initiative: Vec::new(),
            concentration: Default::default(),
            area_targets: &[],
            rule_dc: false,
        };
        let entries: Vec<Pending> = encounter
            .initiative_order()
            .iter()
            .map(|(entity, roll)| {
                writer.initiative(&EntityIdentifier::from_world(&engine.world, *entity), roll)
            })
            .collect();
        // Initiative goes right after "Combat begins" and before round 1.
        let insert_at = self
            .pending
            .iter()
            .position(|e| matches!(e.kind, nat20_api_contract::EventKind::CombatStarted { .. }))
            .map(|i| i + 1)
            .unwrap_or(0);
        let tail = self.pending.split_off(insert_at);
        self.pending.extend(entries);
        self.pending.extend(tail);
    }

    /// Logs the initiative rolls of creatures that joined a running fight.
    fn log_joined_initiative(&mut self, joined: &[Entity]) {
        let engine = &self.engine;
        let Some(encounter) = self.encounter.and_then(|id| engine.encounter(&id)) else {
            return;
        };
        let writer = LogWriter {
            engine,
            handles: &self.scene.handles,
            round: Some(encounter.round() as u32),
            hp: &mut self.hp,
            keys: &mut self.keys,
            initiative: Vec::new(),
            concentration: Default::default(),
            area_targets: &[],
            rule_dc: false,
        };
        let entries: Vec<Pending> = encounter
            .initiative_order()
            .iter()
            .filter(|(entity, _)| joined.contains(entity))
            .map(|(entity, roll)| {
                writer.initiative(&EntityIdentifier::from_world(&engine.world, *entity), roll)
            })
            .collect();
        self.pending.extend(entries);
    }

    // ---- lookups --------------------------------------------------------

    fn entity(&self, handle: &str) -> Result<Entity, ApiError> {
        self.scene
            .creatures
            .iter()
            .find(|c| c.handle == handle)
            .map(|c| c.entity)
            .ok_or_else(|| {
                error(
                    ErrorCode::UnknownCreature,
                    format!("There is no creature {handle} in this scene."),
                )
            })
    }

    fn control_of(&self, entity: Entity) -> Option<Control> {
        self.scene
            .creatures
            .iter()
            .find(|c| c.entity == entity)
            .map(|c| c.control)
    }

    fn side_of(&self, entity: Entity) -> Option<Side> {
        self.scene
            .creatures
            .iter()
            .find(|c| c.entity == entity)
            .map(|c| c.side)
    }

    fn handle_of(&self, entity: Entity) -> String {
        self.scene
            .handles
            .get(&entity)
            .cloned()
            .unwrap_or_else(|| format!("{entity:?}"))
    }
}

pub(super) fn load_geometry(map: Option<&str>) -> WorldGeometry {
    let terrain = scene::map_path(map);
    WorldGeometry::from_obj_path(
        terrain.to_str().expect("utf-8 path"),
        &rerecast::ConfigBuilder::default().build(),
    )
}

/// Sides decide who wins; faction attitudes decide who may attack whom. The party and hostile
/// sides must be hostile to each other, and nobody to their own side or to a neutral creature,
/// or a fight could never end.
/// Spawns one scene or spawn creature in the engine, unplaced.
fn spawn_creature(
    engine: &mut EngineState,
    def: &nat20_api_contract::SceneCreature,
    pregens: &HashMap<String, PregenFile>,
) -> Result<Entity, ApiError> {
    match (&def.pregen, &def.monster) {
        (Some(pregen), None) => {
            pregen::spawn(engine, &pregens[pregen]).map_err(|m| error(ErrorCode::BadScene, m))
        }
        (None, Some(monster)) => {
            monster::spawn(engine, monster).map_err(|m| error(ErrorCode::BadScene, m))
        }
        _ => Err(error(
            ErrorCode::BadScene,
            format!("{} needs exactly one of pregen or monster.", def.handle.0),
        )),
    }
}

fn check_sides(engine: &EngineState, creatures: &[SceneCreature]) -> Result<(), ApiError> {
    for (i, a) in creatures.iter().enumerate() {
        for b in &creatures[i + 1..] {
            let hostile = systems::factions::mutual_attitude(&engine.world, a.entity, b.entity)
                == Attitude::Hostile;
            let should_be = matches!(
                (a.side, b.side),
                (Side::Party, Side::Hostile) | (Side::Hostile, Side::Party)
            );
            if hostile != should_be {
                return Err(error(
                    ErrorCode::BadScene,
                    format!(
                        "{} ({}) and {} ({}) are {}, so the fight could never end.",
                        a.handle,
                        side_word(a.side),
                        b.handle,
                        side_word(b.side),
                        if hostile {
                            "hostile to each other but not on opposing sides"
                        } else {
                            "on opposing sides but not hostile"
                        }
                    ),
                ));
            }
        }
    }
    Ok(())
}

/// Contract points are feet with `z_ft` up; core works in metres with `y` up.
/// The creatures an area option would catch aimed at `target`, allies included; `None` when the
/// aim is beyond the option's range from where the actor stands. `builder` stands at the
/// option's targets.
fn area_catches(
    engine: &mut EngineState,
    builder: &mut ActionBuilder,
    target: TargetInstance,
) -> Option<Vec<Entity>> {
    builder.target(engine, target);
    match builder.state() {
        Ok(ActionBuilderState::Targets {
            action,
            path_to_target: None | Some(TargetPathFindingResult::AlreadyInRange(_)),
        }) => Some(systems::actions::get_targeted_entities(
            engine, action, None,
        )),
        _ => None,
    }
}

/// An area's wire shape and its size in metres (see `OptionArea::size_ft`); `None` for a shape
/// the wire does not name (the capsule core uses for a free space, as Misty Step's).
fn wire_area_shape(shape: &AreaShape) -> Option<(WireAreaShape, f32)> {
    use uom::si::length::meter;
    Some(match shape {
        AreaShape::Cone { length, .. } => (WireAreaShape::Cone, length.get::<meter>()),
        AreaShape::Sphere { radius } => (WireAreaShape::Sphere, radius.get::<meter>()),
        AreaShape::Cube { side_length } => (WireAreaShape::Cube, side_length.get::<meter>()),
        AreaShape::Cylinder { radius, .. } => (WireAreaShape::Cylinder, radius.get::<meter>()),
        // A line as wide as it is long is a cube from the actor (Thunderwave).
        AreaShape::Line { length, width } if length == width => {
            (WireAreaShape::Cube, length.get::<meter>())
        }
        AreaShape::Line { length, .. } => (WireAreaShape::Line, length.get::<meter>()),
        AreaShape::Capsule { .. } => return None,
    })
}

fn to_core_point(point: PointFt) -> Point3<f32> {
    Point3::new(
        point.x_ft * METERS_PER_FOOT,
        point.z_ft * METERS_PER_FOOT,
        point.y_ft * METERS_PER_FOOT,
    )
}

/// The inverse of [`to_core_point`], rounded to a tenth of a foot.
fn from_core_point(point: Point3<f32>) -> PointFt {
    PointFt {
        x_ft: round_ft(point.x),
        y_ft: round_ft(point.z),
        z_ft: round_ft(point.y),
    }
}

/// Hit Point Dice `entity` has left, over every die size; 0 without a pool.
fn hit_dice_left(engine: &EngineState, entity: Entity) -> u32 {
    engine
        .world
        .get::<&HitPointDice>(entity)
        .map(|dice| {
            dice.pools()
                .map(|(_, remaining, _)| u32::from(remaining))
                .sum()
        })
        .unwrap_or(0)
}

fn life_state_name(engine: &EngineState, entity: Entity) -> &'static str {
    match engine.world.get::<&LifeState>(entity).map(|s| *s) {
        Ok(LifeState::Normal) => "normal",
        Ok(LifeState::Unconscious(_)) => "unconscious",
        Ok(LifeState::Stable) => "stable",
        Ok(LifeState::Dead) | Err(_) => "dead",
    }
}

fn remaining_movement_m(engine: &EngineState, entity: Entity) -> f32 {
    systems::movement::speed(engine, entity)
        .remaining_movement()
        .get::<uom::si::length::meter>()
}

fn distance_m(engine: &EngineState, a: Entity, b: Entity) -> Option<f32> {
    let pa = systems::geometry::get_foot_position(&engine.world, a)?;
    let pb = systems::geometry::get_foot_position(&engine.world, b)?;
    Some((pa - pb).norm())
}

/// The level direction a retreat from `here` takes: away from the middle of `hostiles`, or away
/// from `there` when the actor stands at that middle. `None` when neither gives a direction.
fn retreat_direction(
    here: Point3<f32>,
    there: Point3<f32>,
    hostiles: &[Point3<f32>],
) -> Option<nat20_core::parry3d::na::Vector3<f32>> {
    let level = |mut v: nat20_core::parry3d::na::Vector3<f32>| {
        v.y = 0.0;
        (v.norm() >= 1e-3).then(|| v.normalize())
    };
    let middle = (!hostiles.is_empty()).then(|| {
        let sum = hostiles
            .iter()
            .fold(nat20_core::parry3d::na::Vector3::zeros(), |acc, p| {
                acc + p.coords
            });
        Point3::from(sum / hostiles.len() as f32)
    });
    middle
        .and_then(|m| level(here - m))
        .or_else(|| level(here - there))
}

/// Where a retreat of up to `step` metres along `away` may end, best first: the whole step,
/// then three quarters and half of it, each straight on and then turned 45 degrees either way.
fn retreat_goals(
    here: Point3<f32>,
    away: nat20_core::parry3d::na::Vector3<f32>,
    step: f32,
) -> Vec<Point3<f32>> {
    let turned = |degrees: f32| {
        let (sin, cos) = degrees.to_radians().sin_cos();
        nat20_core::parry3d::na::Vector3::new(
            away.x * cos + away.z * sin,
            0.0,
            -away.x * sin + away.z * cos,
        )
    };
    let mut goals = Vec::new();
    for share in [1.0, 0.75, 0.5] {
        for degrees in [0.0, 45.0, -45.0] {
            goals.push(here + turned(degrees) * (step * share));
        }
    }
    goals
}

/// Whether `point` is beyond the policy's reach of every one of `hostiles`.
fn out_of_reach(point: Point3<f32>, hostiles: &[Point3<f32>]) -> bool {
    hostiles.iter().all(|h| (point - h).norm() > REACH_M + 1e-3)
}

/// Selects option `index` of the chosen action. The builder skips the choice
/// itself when an action has a single option, so index 0 is then a no-op.
fn pick_context(builder: &mut ActionBuilder, world: &hecs::World, index: usize) -> bool {
    match builder.state() {
        Ok(ActionBuilderState::Context { .. }) => {
            builder.context_index(world, index);
            builder.state().is_ok()
        }
        Ok(ActionBuilderState::Targets { .. }) => index == 0,
        _ => false,
    }
}

/// The engine's refusal of a decision as a contract error. The Debug text goes to stderr only.
fn refusal(problem: &impl std::fmt::Debug) -> ApiError {
    let debug = format!("{problem:?}");
    eprintln!("nat20-api-server: engine refused a decision: {debug}");
    let (reason, message) = reason_for(&debug);
    rejected(reason, message)
}

/// Maps an engine error's Debug text to a reject reason and one plain sentence.
fn reason_for(debug: &str) -> (RejectReason, String) {
    let table: [(&str, RejectReason, &str); 11] = [
        (
            "Requires proficiency",
            RejectReason::NotProficient,
            "The actor is not proficient in the skill this option needs.",
        ),
        (
            "OutOfRange",
            RejectReason::OutOfRange,
            "The target is out of range.",
        ),
        (
            "NoLineOfSight",
            RejectReason::InvalidTarget,
            "There is no line of sight to the target.",
        ),
        (
            "NoTargetsProvided",
            RejectReason::NeedsTarget,
            "This option needs a target.",
        ),
        (
            "ExceedsMaxTargets",
            RejectReason::InvalidTarget,
            "Too many targets for this option.",
        ),
        (
            "DuplicateTarget",
            RejectReason::InvalidTarget,
            "The same target was given twice.",
        ),
        (
            "InvalidTarget",
            RejectReason::InvalidTarget,
            "That creature cannot be targeted by this option.",
        ),
        (
            "NotEnoughResources",
            RejectReason::InsufficientResource,
            "The actor lacks the resources this option costs.",
        ),
        (
            "InsufficientResource",
            RejectReason::InsufficientResource,
            "The actor lacks the resources this option costs.",
        ),
        (
            "NotKnown",
            RejectReason::NotKnown,
            "The actor does not know this option.",
        ),
        (
            "InsufficientSpeed",
            RejectReason::InsufficientResource,
            "Not enough movement left this turn to get there.",
        ),
    ];
    for (needle, reason, message) in table {
        if debug.contains(needle) {
            return (reason, message.to_string());
        }
    }
    // Unmapped engine refusals: the target or the moment is wrong for this option.
    (
        RejectReason::InvalidTarget,
        "The engine refused this decision.".to_string(),
    )
}

fn round_ft(meters: f32) -> f32 {
    // `+ 0.0` turns a rounded -0.0 into 0.0, so the wire never shows "-0.0".
    (meters / METERS_PER_FOOT * 10.0).round() / 10.0 + 0.0
}

/// (current, max, temporary) Hit Points.
fn hit_points(engine: &EngineState, entity: Entity) -> (u32, u32, u32) {
    let points = systems::helpers::get_component::<HitPoints>(&engine.world, entity);
    (
        points.current(),
        points.max(),
        points.temp().map_or(0, |t| t.amount()),
    )
}

/// SRD 5.2.1: Bloodied is half Hit Points or fewer.
pub fn health_band(hp: u32, hp_max: u32) -> HealthBand {
    if hp == 0 {
        HealthBand::Down
    } else if hp * 2 <= hp_max {
        HealthBand::Bloodied
    } else {
        HealthBand::Unhurt
    }
}

fn side_word(side: Side) -> &'static str {
    match side {
        Side::Party => "party",
        Side::Hostile => "hostile",
        Side::Neutral => "neutral",
    }
}

/// Action economy spent by an option; other resources (Second Wind uses and the like) are on
/// the sheet.
fn action_cost(map: &HashMap<ResourceId, ResourceAmount>) -> ActionCost {
    let mut cost = ActionCost {
        action: 0,
        bonus_action: 0,
        reaction: 0,
        movement_ft: 0,
        spell_slot: None,
    };
    for (id, amount) in map {
        let count = match *amount {
            ResourceAmount::Flat(n) => n,
            ResourceAmount::Tiered { amount, .. } => amount,
        };
        match id.id() {
            "resource.action" => cost.action += count,
            "resource.bonus_action" => cost.bonus_action += count,
            "resource.reaction" => cost.reaction += count,
            "resource.spell_slot" => {
                if let ResourceAmount::Tiered { tier, .. } = *amount {
                    cost.spell_slot = Some(tier);
                }
            }
            _ => {}
        }
    }
    cost
}

fn life_state_of(engine: &EngineState, entity: Entity) -> nat20_api_contract::LifeState {
    match engine.world.get::<&LifeState>(entity) {
        Ok(state) => wire_life_state(&state),
        Err(_) => nat20_api_contract::LifeState::Dead,
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    /// A move the engine refuses for lack of movement says so, as the route check before it does,
    /// instead of the catch-all sentence (Bren just up from prone, Scene 3 live run, 2026-10-27).
    #[test]
    fn a_move_refused_for_lack_of_movement_says_so() {
        let (reason, message) = reason_for(&format!("{:?}", MovementError::InsufficientSpeed));
        assert_eq!(reason, RejectReason::InsufficientResource);
        assert_eq!(message, "Not enough movement left this turn to get there.");
    }

    /// A fighter's failed stabilize out of combat opens Tactical Mind while the Help is still
    /// acting; the engine waits on that window, which is declined, instead of ticking on.
    #[test]
    fn a_failed_stabilize_out_of_combat_settles_at_the_tactical_mind_window() {
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("data");
        let scene = scene::read(&data, "help_yard").unwrap();
        // With seed 5 Ana's first DC 10 Medicine check fails.
        crate::adapter::seed_dice(5);
        let Ok(mut game) = Game::load(None, &scene, &[]) else {
            panic!("help_yard loads");
        };
        let fall = CheckSpec::Scenario {
            check_id: "loft_fall".to_owned(),
        };
        game.request_check("bren", &fall).unwrap();
        let bren = game.entity("bren").unwrap();
        assert_eq!(life_state_name(&game.engine, bren), "unconscious");

        let stabilize = HelpSpec::Stabilize {
            target: Handle("bren".to_owned()),
        };
        game.help("ana", &stabilize).unwrap();
        assert_eq!(life_state_name(&game.engine, bren), "unconscious");
        assert_eq!(game.stalls, 0);
        assert!(game.engine.next_prompt(PromptScopeId::Global).is_none());
    }

    /// A creature whose Speed is 0 can't stand up (SRD 5.2.1, Prone), so it stays Prone when the
    /// fight ends, while a Prone creature that can move stands.
    #[test]
    fn a_prone_creature_at_speed_0_stays_prone_when_the_fight_ends() {
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("data");
        let scene = scene::read(&data, "prone_yard").unwrap();
        crate::adapter::seed_dice(1);
        let Ok(mut game) = Game::load(None, &scene, &[]) else {
            panic!("prone_yard loads");
        };
        let prone = EffectId::new("nat20_core", PRONE);
        let paralyzed = EffectId::new("nat20_core", "effect.condition.paralyzed");
        let source = ModifierSource::Custom("Test".into());
        let held = game.entity("goblin_a").unwrap();
        let free = game.entity("goblin_b").unwrap();
        for entity in [held, free] {
            systems::effects::add_permanent_effect(
                &mut game.engine,
                entity,
                prone.clone(),
                &source,
                None,
            );
        }
        systems::effects::add_permanent_effect(&mut game.engine, held, paralyzed, &source, None);

        game.stand_up();

        assert!(systems::effects::has_effect(&game.engine, held, &prone));
        assert!(!systems::effects::has_effect(&game.engine, free, &prone));
    }

    /// `crowded_yard` in combat with Bren to act first: Bren at 0, Maren 30 feet west, a goblin
    /// 60 feet west.
    fn crowded_yard() -> Game {
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("data");
        let scene = scene::read(&data, "crowded_yard").unwrap();
        let start = |seed| {
            crate::adapter::seed_dice(seed);
            let Ok(mut game) = Game::load(None, &scene, &[]) else {
                panic!("crowded_yard loads");
            };
            game.start_combat("yard_fight").unwrap();
            game
        };
        let seed = (1..50)
            .find(|seed| {
                let game = start(*seed);
                game.require_action_prompt(game.entity("bren").unwrap())
                    .is_ok()
            })
            .expect("some seed gives Bren the first turn");
        start(seed)
    }

    /// A partial move whose movement runs out in an ally's space stops short of the ally, at
    /// the last free spot along the straight walk, instead of not moving at all (Copilot on
    /// table #154): a straight walk's only corners are its two ends.
    #[test]
    fn a_partial_move_that_runs_out_in_an_allys_space_stops_before_it() {
        let mut game = crowded_yard();
        let far = MoveTarget::Point {
            point: PointFt {
                x_ft: -40.0,
                y_ft: 0.0,
                z_ft: 0.0,
            },
        };

        let (_, _, reached) = game.move_to("bren", &far, true).unwrap();

        assert!(!reached);
        let bren = game.entity("bren").unwrap();
        let landed = systems::geometry::get_foot_position(&game.engine.world, bren).unwrap();
        let x_ft = from_core_point(landed).x_ft;
        assert!(
            x_ft < -15.0 && x_ft > -30.0,
            "Bren stops short of Maren, at {x_ft} ft"
        );
    }

    /// A partial move towards a creature out of range, whose movement runs out in an ally's
    /// space, ends where core cut it back to a free spot, and says the creature wasn't reached
    /// (Copilot on table #154).
    #[test]
    fn a_partial_move_that_ends_short_of_a_creature_did_not_reach_it() {
        let mut game = crowded_yard();
        let goblin = MoveTarget::Creature {
            handle: Handle("goblin_a".to_owned()),
        };

        let (_, _, reached) = game.move_to("bren", &goblin, true).unwrap();

        assert!(!reached);
        let bren = game.entity("bren").unwrap();
        let landed = systems::geometry::get_foot_position(&game.engine.world, bren).unwrap();
        let x_ft = from_core_point(landed).x_ft;
        assert!(
            x_ft < -15.0 && x_ft > -30.0,
            "Bren walked towards the goblin and stopped short of Maren, at {x_ft} ft"
        );
    }

    fn at_ft(x_ft: f32, y_ft: f32) -> Point3<f32> {
        to_core_point(PointFt {
            x_ft,
            y_ft,
            z_ft: 0.0,
        })
    }

    /// A Bloodied goblin next to Bren with Maren 30 feet behind it: running straight away from
    /// Bren ends beside Maren (Copilot on table #78), so the retreat runs from both of them and
    /// takes the first way that ends out of everyone's reach.
    #[test]
    fn a_retreat_ends_out_of_every_hostile_creatures_reach() {
        let bren = at_ft(0.0, 0.0);
        let goblin = at_ft(-5.0, 0.0);
        let maren = at_ft(-35.0, 5.0);
        let step = 30.0 * METERS_PER_FOOT;

        let only_from_bren = retreat_direction(goblin, bren, &[bren]).unwrap();
        let old_end = retreat_goals(goblin, only_from_bren, step)[0];
        assert!(!out_of_reach(old_end, &[bren, maren]));

        let hostiles = [bren, maren];
        let away = retreat_direction(goblin, bren, &hostiles).unwrap();
        let end = retreat_goals(goblin, away, step)
            .into_iter()
            .find(|goal| out_of_reach(*goal, &hostiles))
            .expect("some retreat clears both");
        assert!(out_of_reach(end, &hostiles));
    }
}
