//! The engine side of a session: an `EngineState`, the loaded scene, and the log entries the
//! engine produced since the session last took them.
//!
//! The game owns the clock. Nat20 resolves actions over simulated time (`EngineState::update`),
//! so after every decision the session ticks the engine until nothing is moving or acting,
//! copies new engine events into the log, and runs scripted creatures until a client decision
//! is needed.

use std::{collections::HashMap, path::Path};

use hecs::Entity;
use nat20_api_contract::{
    ActionCost, ActionOption, Anchor, ApiError, Control, CreatureFull, ErrorCode, ErrorHint,
    EventKind, Handle, HealthBand, Mode, MoveTarget, OptionId, Placement, PointFt, ReactionOption,
    RejectReason, SceneFile, Side, TargetCandidate, Targeting, UnavailableOption,
};
use nat20_core::{
    components::{
        actions::{
            action_builder::{ActionBuilder, ActionBuilderState, ReactionBuilder},
            targeting::{LineOfSight, TargetInstance, TargetingKind},
        },
        activity::{Activity, ActivityState},
        faction::Attitude,
        health::{hit_points::HitPoints, life_state::LifeState},
        id::{ActionId, EntityIdentifier, ResourceId},
        modifier::FlatModifiable,
        resource::ResourceAmount,
    },
    engine::{
        action_prompt::{ActionData, ActionPromptKind},
        encounter::EncounterId,
        engine_state::EngineState,
        geometry::WorldGeometry,
        prompt::PromptScopeId,
    },
    systems::{
        self,
        movement::{MovementError, TargetPathFindingResult},
    },
};
use parry3d::na::Point3;

use crate::{
    adapter::{
        events::{HpTracker, LogWriter, Pending, RollKeys, combat_over, wire_life_state},
        monster::MonsterDef,
        names, pregen,
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

struct Scene {
    id: String,
    creatures: Vec<SceneCreature>,
    handles: HashMap<Entity, String>,
    anchors: Vec<Anchor>,
}

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
    },
    /// Combat ended with this side standing.
    CombatOver { winner: Option<Side> },
}

/// One option at an action prompt and the engine action behind it.
struct OptionEntry {
    option: ActionOption,
    action_id: ActionId,
    context: usize,
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
        options: Vec<ActionData>,
    },
    Nothing,
}

/// A loaded scene and its engine.
pub struct Game {
    engine: EngineState,
    /// The terrain the engine's geometry was built from; `None` is the default map.
    map: Option<String>,
    scene: Scene,
    /// The running or finished combat, if any.
    encounter: Option<EncounterId>,
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
        data_dir: &Path,
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
        if let Some(clash) = party
            .iter()
            .find(|h| scene.creatures.iter().any(|c| c.handle == **h))
        {
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
        // Stat blocks are read before anything is spawned.
        let mut monsters = HashMap::new();
        for def in &scene.creatures {
            if let Some(monster) = &def.monster
                && !monsters.contains_key(monster)
            {
                let loaded = scene::monster_path(data_dir, monster).and_then(|path| {
                    MonsterDef::load(&path).map_err(|e| {
                        error(ErrorCode::BadScene, format!("Stat block {monster}: {e}."))
                    })
                });
                match loaded {
                    Ok(loaded) => monsters.insert(monster.clone(), loaded),
                    Err(e) => return fail(previous, e),
                };
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
            let entity = match (&def.pregen, &def.monster) {
                (Some(pregen), None) => pregen::spawn(&mut game.engine, pregen).ok_or_else(|| {
                    error(
                        ErrorCode::BadScene,
                        format!(
                            "There is no pregen {pregen}; known pregens: {}.",
                            pregen::PREGENS.join(", ")
                        ),
                    )
                }),
                (None, Some(monster)) => monsters[monster]
                    .spawn(&mut game.engine)
                    .map_err(|e| error(ErrorCode::BadScene, format!("Stat block {monster}: {e}."))),
                _ => Err(error(
                    ErrorCode::BadScene,
                    format!("{} needs exactly one of pregen or monster.", def.handle.0),
                )),
            };
            match entity {
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

        let creatures: Vec<SceneCreature> = carried.into_iter().chain(spawned).collect();
        if let Err(e) = check_sides(&game.engine, &creatures) {
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
        };
        game.encounter_seen = 0;
        game.winner = None;
        game.scripted_turn = None;
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
            },
            encounter: None,
            pending: Vec::new(),
            hp: HpTracker::new(),
            keys: RollKeys::default(),
            global_seen: 0,
            encounter_seen: 0,
            winner: None,
            scripted_turn: None,
        }
    }

    /// Log entries produced since the last call, in order, without `seq`.
    pub fn take_entries(&mut self) -> Vec<Pending> {
        std::mem::take(&mut self.pending)
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
                    // The core has no condition or exhaustion model yet.
                    conditions: Vec::new(),
                    exhaustion: 0,
                    life_state: life_state_of(engine, c.entity),
                    health: health_band(hp, hp_max),
                }
            })
            .collect()
    }

    /// The scene's anchors, in scene file order.
    pub fn anchors(&self) -> &[Anchor] {
        &self.scene.anchors
    }

    // ---- commands -------------------------------------------------------

    /// Moves `actor` and returns the feet it moved and who it provoked. In explore mode the
    /// creature walks the whole route at no movement cost and provokes nobody, since nobody
    /// is fighting. In combat the session has checked the prompt: the route must fit in the
    /// movement left, and an opportunity attack stops the creature where it was provoked.
    pub fn move_to(
        &mut self,
        actor: &str,
        to: &MoveTarget,
    ) -> Result<(f32, Vec<Handle>), ApiError> {
        let entity = self.entity(actor)?;
        let combat = self.mode() == Mode::Combat;
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
        let (goal, anchor) = self.goal(entity, to, combat)?;
        let from = systems::geometry::get_foot_position(&self.engine.world, entity)
            .expect("scene creatures have a position");
        let route = systems::movement::path(&self.engine, entity, &goal, false, combat).map_err(
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
        let end = *route.full_path.points.last().unwrap_or(&from);

        let round = self.round();
        let (moved_m, provoked) = if combat {
            let before = remaining_movement_m(&self.engine, entity);
            self.engine
                .submit_activity(Activity::Move { entity, goal: end })
                .map_err(|e| refusal(&e))?;
            self.settle();
            let provoked = match self.awaiting() {
                Awaiting::Reaction { reactor, .. } => vec![Handle(self.handle_of(reactor))],
                _ => Vec::new(),
            };
            (
                before - remaining_movement_m(&self.engine, entity),
                provoked,
            )
        } else {
            // Nobody is fighting, so the creature is simply placed at the end of its route.
            systems::geometry::teleport_to(&mut self.engine.world, entity, &end);
            // An explore command that acts closes a finished fight's `combat_over`.
            self.winner = None;
            (
                route.full_path.length.get::<uom::si::length::meter>(),
                Vec::new(),
            )
        };
        let landed = systems::geometry::get_foot_position(&self.engine.world, entity)
            .expect("scene creatures have a position");
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
        }
        Ok((round_ft(moved_m), provoked))
    }

    /// Where a move ends, in core coordinates, and the anchor it names.
    fn goal(
        &mut self,
        entity: Entity,
        to: &MoveTarget,
        combat: bool,
    ) -> Result<(Point3<f32>, Option<String>), ApiError> {
        match to {
            MoveTarget::Point { point } => Ok((to_core_point(*point), None)),
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
                Ok((to_core_point(found.position_ft), Some(anchor.clone())))
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
                let near = systems::movement::path_in_range_of_target(
                    &mut self.engine,
                    entity,
                    &target,
                    uom::si::f32::Length::new::<uom::si::length::foot>(5.0),
                    false,
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
                Ok((end, None))
            }
        }
    }

    /// Rolls initiative for `participants` and runs scripted turns until a client decides.
    pub fn start_combat(&mut self, participants: &[String]) -> Result<(), ApiError> {
        if self.running_encounter().is_some() {
            return Err(error(ErrorCode::WrongMode, "Combat is already running."));
        }
        let mut entities = Vec::new();
        for handle in participants {
            let entity = self.entity(handle)?;
            if !entities.contains(&entity) {
                entities.push(entity);
            }
        }
        let standing = |side: Side| {
            entities.iter().any(|e| {
                self.side_of(*e) == Some(side) && life_state_name(&self.engine, *e) == "normal"
            })
        };
        if !standing(Side::Party) || !standing(Side::Hostile) {
            return Err(error(
                ErrorCode::BadRequest,
                "start_combat needs at least one conscious party creature and one conscious hostile creature.",
            ));
        }
        // Whatever happened before this fight is already in the log.
        self.drain();
        let encounter = self.engine.start_encounter(entities.into_iter().collect());
        self.encounter = Some(encounter);
        self.encounter_seen = 0;
        self.winner = None;
        self.scripted_turn = None;
        self.drain();
        self.log_initiative();
        self.advance();
        Ok(())
    }

    /// The options at `actor`'s pending action prompt, and the ones it has but cannot take.
    pub fn legal_actions(
        &mut self,
        actor: &str,
    ) -> Result<(Vec<ActionOption>, Vec<UnavailableOption>), ApiError> {
        let entity = self.entity(actor)?;
        self.require_action_prompt(entity)?;
        let options = self.options(entity).into_iter().map(|o| o.option).collect();

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
            let (option_id, name) = names::option_id_and_name(&action_id, None);
            unavailable.push(UnavailableOption {
                option_id: OptionId(option_id),
                name,
                reason,
                message,
            });
        }
        unavailable.sort_by(|a, b| a.option_id.0.cmp(&b.option_id.0));
        Ok((options, unavailable))
    }

    /// Takes one option at `actor`'s pending action prompt.
    pub fn submit(
        &mut self,
        actor: &str,
        option_id: &str,
        targets: &[String],
    ) -> Result<(), ApiError> {
        let entity = self.entity(actor)?;
        self.require_action_prompt(entity)?;
        let target_entities = targets
            .iter()
            .map(|t| self.entity(t))
            .collect::<Result<Vec<_>, _>>()?;
        let option = self
            .options(entity)
            .into_iter()
            .find(|o| o.option.option_id.0 == option_id)
            .ok_or_else(|| {
                error(
                    ErrorCode::UnknownOption,
                    format!(
                        "{option_id} is not one of {actor}'s options right now; see legal_actions."
                    ),
                )
            })?;

        self.submit_entity(entity, &option.action_id, option.context, &target_entities)?;
        self.settle();
        self.drain();
        self.advance();
        Ok(())
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
                options,
            } => {
                let actor = self.handle_of(reactor);
                Wait::Reaction {
                    trigger: match trigger {
                        Some(by) => format!("{actor} may react to {}.", self.handle_of(by)),
                        None => format!("{actor} may react."),
                    },
                    actor,
                    options: options
                        .iter()
                        .enumerate()
                        .map(|(i, o)| {
                            let weapon = names::weapon_of(&self.engine, reactor, &o.context);
                            let (option_id, name) =
                                names::option_id_and_name(&o.action_id, weapon.as_deref());
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
    /// Options with variants or an area target are not offered yet.
    fn options(&mut self, entity: Entity) -> Vec<OptionEntry> {
        let scene_entities: Vec<(String, Entity, Side)> = self
            .scene
            .creatures
            .iter()
            .map(|c| (c.handle.clone(), c.entity, c.side))
            .collect();
        let engine = &mut self.engine;
        let actions = match ActionBuilder::available(engine, entity).state() {
            Ok(ActionBuilderState::Action { actions }) => actions.clone(),
            _ => return Vec::new(),
        };

        let mut out: Vec<OptionEntry> = Vec::new();
        for (action_id, contexts) in &actions {
            for (index, (context, cost)) in contexts.iter().enumerate() {
                let mut builder = ActionBuilder::available(engine, entity);
                builder.action(engine, action_id);
                if let Ok(ActionBuilderState::Variant { .. }) = builder.state() {
                    continue;
                }
                if !pick_context(&mut builder, &engine.world, index) {
                    continue;
                }
                let Ok(ActionBuilderState::Targets { action, .. }) = builder.state() else {
                    continue;
                };
                let targeting_context =
                    systems::actions::targeting_context_data(&engine.world, action);
                let range_m: f32 = targeting_context
                    .range
                    .max()
                    .get::<uom::si::length::meter>();
                let weapon = names::weapon_of(engine, entity, context);

                let (targeting, max_targets, targets) = match targeting_context.kind {
                    TargetingKind::SelfTarget => (Targeting::OnSelf, 0, Vec::new()),
                    TargetingKind::Single | TargetingKind::Multiple { .. } => {
                        let mut targets = Vec::new();
                        for (handle, other, side) in &scene_entities {
                            if *other == entity || !systems::health::is_alive(&engine.world, *other)
                            {
                                continue;
                            }
                            let mut probe = ActionBuilder::available(engine, entity);
                            probe.action(engine, action_id);
                            if !pick_context(&mut probe, &engine.world, index) {
                                continue;
                            }
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
                            targets.push(TargetCandidate {
                                handle: Handle(handle.clone()),
                                side: *side,
                                distance_ft: distance_m(engine, entity, *other)
                                    .map(round_ft)
                                    .unwrap_or(0.0),
                                in_range,
                            });
                        }
                        match targeting_context.kind {
                            TargetingKind::Multiple { max_targets, .. } => {
                                (Targeting::Multiple, max_targets as u32, targets)
                            }
                            _ => (Targeting::Single, 1, targets),
                        }
                    }
                    TargetingKind::Area { .. } => continue,
                };
                if targeting != Targeting::OnSelf && targets.is_empty() {
                    continue;
                }
                let (mut option_id, name) = names::option_id_and_name(action_id, weapon.as_deref());
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
                        range_ft: (targeting != Targeting::OnSelf).then(|| round_ft(range_m)),
                        targets,
                        variants: Vec::new(),
                    },
                    action_id: action_id.clone(),
                    context: index,
                });
            }
        }
        out.sort_by(|a, b| a.option.option_id.0.cmp(&b.option.option_id.0));
        out
    }

    // ---- engine driving -------------------------------------------------

    fn submit_entity(
        &mut self,
        entity: Entity,
        action_id: &ActionId,
        context: usize,
        targets: &[Entity],
    ) -> Result<(), ApiError> {
        let engine = &mut self.engine;
        let mut builder = ActionBuilder::available(engine, entity);
        builder.action(engine, action_id);
        if let Ok(ActionBuilderState::Variant { .. }) = builder.state() {
            return Err(rejected(
                RejectReason::NeedsVariant,
                "Options with variants are not supported by this engine yet.",
            ));
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
        engine.submit_activity(activity).map_err(|e| refusal(&e))
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

    /// Ticks the engine until no creature is moving or acting and no event is
    /// waiting on anything but a reaction decision.
    fn settle(&mut self) {
        for tick in 0..MAX_TICKS {
            if tick >= 2 && self.quiescent() {
                return;
            }
            self.engine.update(TICK_SECONDS);
        }
        eprintln!("engine did not settle within {MAX_TICKS} ticks");
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
            return all_idle;
        };
        let scope = engine.prompts.scope(&PromptScopeId::Encounter(encounter));
        let waiting_on_reaction = engine
            .next_prompt(PromptScopeId::Encounter(encounter))
            .is_some_and(|p| matches!(p.kind, ActionPromptKind::Reactions { .. }));
        let no_pending = scope.is_none_or(|s| s.pending_events().is_empty());
        all_idle && (no_pending || waiting_on_reaction)
    }

    /// Runs scripted creatures until the engine waits on a client, or combat
    /// is over.
    fn advance(&mut self) {
        for _ in 0..MAX_SCRIPTED_STEPS {
            self.settle();
            self.drain();
            if self.check_combat_over() {
                return;
            }
            match self.awaiting() {
                Awaiting::Action { actor } if self.control_of(actor) == Some(Control::Scripted) => {
                    self.scripted_action(actor);
                }
                Awaiting::Reaction { reactor, .. }
                    if self.control_of(reactor) == Some(Control::Scripted) =>
                {
                    // Scripted creatures always take the first reaction offered
                    // (for a goblin, the opportunity attack).
                    if self.react_entity(reactor, Some(0)).is_err()
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

    /// The monster policy: attack the nearest hostile creature, preferring a
    /// melee weapon already in reach, then any weapon already in range, then
    /// moving into melee. End the turn when no attack is possible.
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

        let choice = if taken < MAX_SCRIPTED_ACTIONS_PER_TURN {
            self.choose_attack(actor)
        } else {
            None
        };
        if let Some((action_id, context, target)) = choice
            && self
                .submit_entity(actor, &action_id, context, &[target])
                .is_ok()
        {
            self.scripted_turn = Some((round, actor, taken + 1));
            return;
        }
        self.engine.end_turn(actor);
    }

    fn choose_attack(&mut self, actor: Entity) -> Option<(ActionId, usize, Entity)> {
        let engine = &self.engine;
        let mut hostiles: Vec<(f32, Entity)> = self
            .scene
            .creatures
            .iter()
            .filter(|c| c.entity != actor)
            .filter(|c| life_state_name(engine, c.entity) == "normal")
            .filter(|c| {
                systems::factions::mutual_attitude(&engine.world, actor, c.entity)
                    == Attitude::Hostile
            })
            .map(|c| {
                (
                    distance_m(engine, actor, c.entity).unwrap_or(f32::MAX),
                    c.entity,
                )
            })
            .collect();
        hostiles.sort_by(|a, b| a.0.total_cmp(&b.0));

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
            for context in 0..contexts.len() {
                for (_, target) in &hostiles {
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
        self.pending.push(combat_over(round, winner));
        self.winner = Some(winner);
        true
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
        };

        let mut entries = Vec::new();
        if let Some(encounter) = encounter {
            let events = &encounter.event_log().events;
            for event in events.iter().skip(self.encounter_seen) {
                entries.extend(writer.entries(event));
            }
            self.encounter_seen = events.len();
        }
        let events = &engine.event_log.events;
        for event in events.iter().skip(self.global_seen) {
            entries.extend(writer.entries(event));
        }
        self.global_seen = events.len();

        // The engine splits events between the encounter log and the global log, so within one
        // batch put "combat begins" first and each round header right before the first turn
        // that starts after it; what comes before the header belongs to the round before.
        use nat20_api_contract::EventKind as Kind;
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

fn load_geometry(map: Option<&str>) -> WorldGeometry {
    let terrain = scene::map_path(map);
    WorldGeometry::from_obj_path(
        terrain.to_str().expect("utf-8 path"),
        &rerecast::ConfigBuilder::default().build(),
    )
}

/// Sides decide who wins; faction attitudes decide who may attack whom. The party and hostile
/// sides must be hostile to each other, and nobody to their own side or to a neutral creature,
/// or a fight could never end.
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
    let table: [(&str, RejectReason, &str); 9] = [
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
    use super::*;

    #[test]
    fn a_monster_that_fails_its_checks_leaves_no_entity() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("data/monsters/goblin_warrior.json");
        let mut goblin = MonsterDef::load(&path).unwrap();
        goblin.armor_class += 1;
        let mut engine = EngineState::new(load_geometry(None));
        let before = engine.world.len();
        assert!(goblin.spawn(&mut engine).is_err());
        assert_eq!(engine.world.len(), before);
    }
}
