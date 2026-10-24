//! One engine session: the session log, roll ids, prompt ids, and the loaded scene.
//!
//! The log holds every event in full (DM) form with its visibility and is never cleared or
//! rewritten: `seq` (from 1) and roll ids (`r<seq>`) are unique for the whole session.
//! Projection happens on the way out.

use std::{collections::HashMap, path::PathBuf};

use nat20_api_contract::{
    Aim, ApiError, Awaiting, CheckSpec, CombatOverReason, CommandResult, EndCombatReason,
    ErrorCode, Event, EventKind, Handle, HelpSpec, HitDiceSpend, Mode, MoveTarget, OptionId,
    PromptId, ReactionTrigger, RollId, RollView, State, Visibility,
};

use crate::{
    adapter::{
        events::Pending,
        game::{Game, TriggerCause, Wait},
    },
    errors::{error, with_awaiting},
    projection::{self, FullState, Viewer},
    render, scene,
};

/// The pending prompt and the id the client must echo.
struct Prompt {
    wait: Wait,
    id: String,
    /// The event a reaction answers (the log head for an action prompt).
    event_seq: u64,
}

pub struct Session {
    data_dir: PathBuf,
    game: Option<Game>,
    log: Vec<Event>,
    prompt: Option<Prompt>,
    prompts_issued: u64,
    /// Set when an accepted decision or a load may have changed what the engine waits on, so
    /// the next prompt gets a new id even if it looks the same.
    decided: bool,
    /// The last damage and healing roll ids, for `source_roll`.
    /// The adapter's local roll keys (`#n`) to logged roll ids, for the current scene.
    roll_keys: HashMap<String, RollId>,
}

impl Session {
    pub fn new(data_dir: PathBuf, protocol_version: &str, seed: u32) -> Self {
        let mut session = Self {
            data_dir,
            game: None,
            log: Vec::new(),
            prompt: None,
            prompts_issued: 0,
            decided: false,
            roll_keys: HashMap::new(),
        };
        session.push(Pending {
            round: None,
            visibility: Visibility::Dm,
            kind: EventKind::SessionStarted {
                seed,
                protocol_version: protocol_version.to_owned(),
            },
        });
        session
    }

    /// The `seq` of the last event; 0 for an empty log.
    pub fn log_head(&self) -> u64 {
        self.log.len() as u64
    }

    /// Whether `viewer` names `dm` or a creature in the loaded scene.
    pub fn has_scene(&self) -> bool {
        self.game.is_some()
    }

    pub fn knows_viewer(&self, viewer: &Viewer) -> bool {
        match viewer {
            Viewer::Dm => true,
            Viewer::Creature(handle) => self.game.as_ref().is_some_and(|g| g.has_creature(handle)),
        }
    }

    /// Log entries after `since`, projected for `viewer`.
    pub fn events(&self, since: u64, viewer: &Viewer) -> Vec<Event> {
        self.log
            .iter()
            .skip(since as usize)
            .filter_map(|event| projection::event(viewer, event))
            .collect()
    }

    pub fn load_scene(
        &mut self,
        scene_id: &str,
        party: &[Handle],
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        if let Some(game) = &self.game
            && game.mode() == Mode::Combat
        {
            return Err(error(
                ErrorCode::WrongMode,
                format!(
                    "A fight is running in scene {}; another scene can load once it is over.",
                    game.scene_id()
                ),
            ));
        }
        let scene = scene::read(&self.data_dir, scene_id)?;
        let mut seen = std::collections::HashSet::new();
        for handle in party {
            if !seen.insert(handle) {
                return Err(error(
                    ErrorCode::BadRequest,
                    format!("The party lists {} twice.", handle.0),
                ));
            }
            if !self
                .game
                .as_ref()
                .is_some_and(|g| g.has_creature(&handle.0))
            {
                return Err(error(
                    ErrorCode::UnknownCreature,
                    format!(
                        "There is no creature {} in the current scene to carry over.",
                        handle.0
                    ),
                ));
            }
        }
        if let Viewer::Creature(handle) = viewer
            && !scene.creatures.iter().any(|c| c.handle.0 == *handle)
            && !party.iter().any(|h| h.0 == *handle)
        {
            return Err(error(
                ErrorCode::UnknownCreature,
                format!("The viewer {handle} is not a creature in scene {scene_id}."),
            ));
        }
        match Game::load(self.game.take(), &scene, party) {
            Ok(game) => self.game = Some(game),
            Err((previous, e)) => {
                self.game = previous;
                return Err(e);
            }
        }
        // What ran out on the way (ten minutes pass between scenes) is logged right before
        // `scene_loaded`.
        self.push_entries();
        // Roll keys are per scene; the old scene's rolls are never cited again.
        self.roll_keys.clear();
        self.decided = true;
        self.push(Pending::public(
            None,
            EventKind::SceneLoaded {
                scene_id: scene_id.to_owned(),
                mode: Mode::Explore,
            },
        ));
        Ok(CommandResult::LoadScene {
            state: self.state_for(viewer)?,
        })
    }

    pub fn start_combat(
        &mut self,
        encounter_id: &str,
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        let result = self.game_mut()?.start_combat(encounter_id);
        self.after_decision(result)?;
        Ok(CommandResult::StartCombat {
            state: self.state_for(viewer)?,
        })
    }

    /// Ends the running fight for a reason its encounter allows. Outside combat, including after
    /// a fight ended by itself, there is nothing to end.
    pub fn end_combat(
        &mut self,
        reason: EndCombatReason,
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        let game = self.game_mut()?;
        if game.mode() == Mode::Explore {
            let message = if matches!(game.wait(), Wait::CombatOver { .. }) {
                "Combat is already over; the scene is back in explore mode."
            } else {
                "There is no combat in this scene to end."
            };
            return Err(error(ErrorCode::WrongMode, message));
        }
        let result = game.end_combat(reason);
        self.after_decision(result)?;
        Ok(CommandResult::EndCombat {
            state: self.state_for(viewer)?,
        })
    }

    pub fn state(&self, viewer: &Viewer) -> Result<CommandResult, ApiError> {
        Ok(CommandResult::GetState {
            state: self.state_for(viewer)?,
        })
    }

    /// `actor`'s full sheet, for its owner or the DM; anyone else gets `not_visible`.
    pub fn sheet(&mut self, actor: &str, viewer: &Viewer) -> Result<CommandResult, ApiError> {
        let sheet = self.game_mut()?.sheet(actor)?;
        let sheet = projection::sheet(viewer, sheet).ok_or_else(|| {
            error(
                ErrorCode::NotVisible,
                format!("Only {actor}'s player and the DM can see {actor}'s sheet."),
            )
        })?;
        Ok(CommandResult::GetSheet { sheet })
    }

    /// The options at `actor`'s pending action prompt. In explore mode, the options it could
    /// take on a turn of its own, with no prompt id.
    pub fn legal_actions(&mut self, actor: &str) -> Result<CommandResult, ApiError> {
        if self.game_mut()?.mode() == Mode::Explore {
            let (options, unavailable) = self.game_mut()?.explore_legal_actions(actor)?;
            return Ok(CommandResult::LegalActions {
                prompt_id: PromptId(String::new()),
                options,
                unavailable,
                can_end_turn: false,
            });
        }
        let prompt_id = self.require_prompt(actor, None, false)?;
        let (options, unavailable) = self.game_mut()?.legal_actions(actor)?;
        Ok(CommandResult::LegalActions {
            prompt_id: PromptId(prompt_id),
            options,
            unavailable,
            can_end_turn: true,
        })
    }

    /// Takes an option at `actor`'s pending action prompt. In explore mode, without a prompt id,
    /// it is a turn of `actor`'s own (protocol §4.8); with one, it is a late combat decision.
    pub fn submit(
        &mut self,
        actor: &str,
        prompt_id: Option<&str>,
        option_id: &OptionId,
        targets: &[Handle],
        aim: Option<&Aim>,
        variant: Option<&str>,
    ) -> Result<CommandResult, ApiError> {
        let targets: Vec<String> = targets.iter().map(|t| t.0.clone()).collect();
        if self.game_mut()?.mode() == Mode::Explore && prompt_id.is_none() {
            let result =
                self.game_mut()?
                    .explore_submit(actor, &option_id.0, &targets, aim, variant);
            self.after_decision(result)?;
            return Ok(CommandResult::Submit {});
        }
        if self.game_mut()?.mode() == Mode::Explore
            && !matches!(self.game_mut()?.wait(), Wait::CombatOver { .. })
        {
            return Err(error(
                ErrorCode::WrongMode,
                "There is no combat in this scene, so no prompt is pending; leave prompt_id out to act out of combat.",
            ));
        }
        let Some(prompt_id) = prompt_id else {
            return Err(error(
                ErrorCode::BadRequest,
                "In combat, submit needs the pending prompt_id.",
            ));
        };
        self.require_prompt(actor, Some(prompt_id), false)?;
        let result = self
            .game_mut()?
            .submit(actor, &option_id.0, &targets, aim, variant);
        self.after_decision(result)?;
        Ok(CommandResult::Submit {})
    }

    pub fn react(
        &mut self,
        actor: &str,
        prompt_id: &str,
        choice: Option<u32>,
    ) -> Result<CommandResult, ApiError> {
        self.require_prompt(actor, Some(prompt_id), true)?;
        let result = self.game_mut()?.react(actor, choice);
        self.after_decision(result)?;
        Ok(CommandResult::React {})
    }

    pub fn end_turn(&mut self, actor: &str, prompt_id: &str) -> Result<CommandResult, ApiError> {
        self.require_prompt(actor, Some(prompt_id), false)?;
        let result = self.game_mut()?.end_turn(actor);
        self.after_decision(result)?;
        Ok(CommandResult::EndTurn {})
    }

    /// Moves `actor`. In combat it is a decision at the actor's action prompt, so it needs that
    /// prompt's id; in explore mode any creature may be moved and `prompt_id` is ignored.
    pub fn move_creature(
        &mut self,
        actor: &str,
        to: &MoveTarget,
        prompt_id: Option<&str>,
    ) -> Result<CommandResult, ApiError> {
        if self.game_mut()?.mode() == Mode::Combat {
            let Some(prompt_id) = prompt_id else {
                return Err(error(
                    ErrorCode::BadRequest,
                    "In combat, move needs the pending prompt_id.",
                ));
            };
            self.require_prompt(actor, Some(prompt_id), false)?;
        }
        let result = self.game_mut()?.move_to(actor, to);
        self.after_decision(result.as_ref().map(|_| ()).map_err(Clone::clone))?;
        let (moved_ft, provoked) = result.expect("errors returned above");
        Ok(CommandResult::Move { moved_ft, provoked })
    }

    /// Rolls a check in explore mode and applies a scenario check's consequences.
    pub fn request_check(
        &mut self,
        actor: &str,
        check: &CheckSpec,
    ) -> Result<CommandResult, ApiError> {
        let result = self.game_mut()?.request_check(actor, check);
        self.after_decision(result.as_ref().map(|_| ()).map_err(Clone::clone))?;
        let outcome = result.expect("errors returned above");
        Ok(CommandResult::RequestCheck {
            roll_id: self
                .roll_keys
                .get(&outcome.key)
                .cloned()
                .expect("the check's roll was logged"),
            total: outcome.total,
            success: outcome.success,
        })
    }

    /// A short rest; the dice rolled and Hit Points regained are in the log.
    pub fn short_rest(
        &mut self,
        participants: &[Handle],
        hit_dice: &[HitDiceSpend],
    ) -> Result<CommandResult, ApiError> {
        let result = self.game_mut()?.short_rest(participants, hit_dice);
        self.after_decision(result.as_ref().map(|_| ()).map_err(Clone::clone))?;
        Ok(CommandResult::ShortRest {
            healed: result.expect("errors returned above"),
        })
    }

    /// The Help action in explore mode; what it rolled and changed is in the log.
    pub fn help(&mut self, actor: &str, help: &HelpSpec) -> Result<CommandResult, ApiError> {
        let result = self.game_mut()?.help(actor, help);
        self.after_decision(result.clone())?;
        Ok(CommandResult::Help {})
    }

    /// Places a `when: dm` spawn's creatures.
    pub fn spawn(&mut self, spawn_id: &str, viewer: &Viewer) -> Result<CommandResult, ApiError> {
        let result = self.game_mut()?.spawn(spawn_id);
        // A spawn is not a decision: a pending prompt keeps its id, and a pending reaction keeps
        // the event it answers.
        self.push_entries();
        let handles = result?;
        Ok(CommandResult::Spawn {
            state: self.state_for(viewer)?,
            handles,
        })
    }

    /// What the engine waits on, with the prompt id to echo.
    pub fn awaiting(&mut self) -> Awaiting {
        let wait = self.game.as_ref().map_or(Wait::Idle, |g| g.wait());
        if matches!(wait, Wait::Action { .. } | Wait::Reaction { .. }) {
            let fresh = match &self.prompt {
                Some(prompt) => self.decided || prompt.wait != wait,
                None => true,
            };
            if fresh {
                self.prompts_issued += 1;
                let event_seq = match &wait {
                    Wait::Reaction {
                        cause: Some(cause), ..
                    } => self.trigger_seq(cause),
                    _ => None,
                }
                .unwrap_or_else(|| self.log_head());
                self.prompt = Some(Prompt {
                    wait: wait.clone(),
                    id: format!("p{}", self.prompts_issued),
                    event_seq,
                });
            }
        } else {
            self.prompt = None;
        }
        self.decided = false;
        let (prompt_id, event_seq) = self
            .prompt
            .as_ref()
            .map(|p| (PromptId(p.id.clone()), p.event_seq))
            .unwrap_or((PromptId(String::new()), 0));
        match wait {
            Wait::Idle => Awaiting::Idle,
            Wait::CombatOver { winner } => Awaiting::CombatOver {
                winner,
                reason: CombatOverReason::SideDown,
            },
            Wait::Action { actor } => Awaiting::Action {
                prompt_id,
                actor: Handle(actor),
            },
            Wait::Reaction {
                actor,
                options,
                trigger,
                ..
            } => Awaiting::Reaction {
                prompt_id,
                actor: Handle(actor),
                trigger: ReactionTrigger {
                    event_seq,
                    summary: trigger,
                },
                options,
            },
        }
    }

    // ---- helpers --------------------------------------------------------

    /// The `seq` of the logged event a reaction answers: the latest `moved` of the creature
    /// moving out of reach, or the latest `action` of the creature that triggered it.
    fn trigger_seq(&self, cause: &TriggerCause) -> Option<u64> {
        self.log
            .iter()
            .rev()
            .find(|e| match (cause, &e.kind) {
                (TriggerCause::Moved(by), EventKind::Moved { actor, .. })
                | (TriggerCause::Acted(by), EventKind::Action { actor, .. }) => actor.0 == *by,
                _ => false,
            })
            .map(|e| e.seq)
    }

    /// Drops the option list the last `legal_actions` kept for a following `submit` (API-17).
    pub fn forget_options(&mut self) {
        if let Some(game) = self.game.as_mut() {
            game.forget_options();
        }
    }

    fn game_mut(&mut self) -> Result<&mut Game, ApiError> {
        self.game
            .as_mut()
            .ok_or_else(|| error(ErrorCode::NoScene, "Load a scene first."))
    }

    /// Checks that the engine waits on `actor` (for a reaction when `reaction`) and, when given,
    /// that `prompt_id` is the pending prompt's. Returns the pending prompt's id.
    fn require_prompt(
        &mut self,
        actor: &str,
        prompt_id: Option<&str>,
        reaction: bool,
    ) -> Result<String, ApiError> {
        let game = self.game_mut()?;
        if !game.has_creature(actor) {
            return Err(error(
                ErrorCode::UnknownCreature,
                format!("There is no creature {actor} in this scene."),
            ));
        }
        // Explore mode, also once a fight ended by itself: nothing is pending, so retrying
        // cannot help (wrong_mode is not retryable).
        if game.mode() == Mode::Explore {
            let message = if matches!(game.wait(), Wait::CombatOver { .. }) {
                "Combat is over; the scene is back in explore mode. Call start_combat or load_scene to go on."
            } else {
                "There is no combat in this scene yet; call start_combat first."
            };
            return Err(error(ErrorCode::WrongMode, message));
        }
        let awaiting = self.awaiting();
        // An old id is stale whoever it was for, also once no prompt is pending (protocol §3).
        let current = match &awaiting {
            Awaiting::Action { prompt_id, .. } | Awaiting::Reaction { prompt_id, .. } => {
                Some(prompt_id.0.as_str())
            }
            _ => None,
        };
        if let Some(given) = prompt_id
            && Some(given) != current
        {
            let message = match current {
                Some(pending) => {
                    format!(
                        "Prompt {given} is not the pending prompt; the pending prompt is {pending}."
                    )
                }
                None => format!(
                    "Prompt {given} is not pending; the engine is waiting on {}.",
                    describe(&awaiting)
                ),
            };
            return Err(with_awaiting(
                error(ErrorCode::StalePrompt, message),
                awaiting,
            ));
        }
        let pending = match &awaiting {
            Awaiting::Action {
                prompt_id,
                actor: a,
            } if !reaction && a.0 == actor => prompt_id.0.clone(),
            Awaiting::Reaction {
                prompt_id,
                actor: a,
                ..
            } if reaction && a.0 == actor => prompt_id.0.clone(),
            other => {
                return Err(error(
                    ErrorCode::NotYourTurn,
                    format!(
                        "The engine is not waiting on {} from {actor}; it is waiting on {}.",
                        if reaction { "a reaction" } else { "an action" },
                        describe(other)
                    ),
                ));
            }
        };
        Ok(pending)
    }

    fn after_decision(&mut self, result: Result<(), ApiError>) -> Result<(), ApiError> {
        // A refused decision can still have produced log entries (an engine-side partial
        // resolution); the log never drops what the engine did.
        self.push_entries();
        if result.is_ok() {
            self.decided = true;
        }
        result
    }

    /// Logs the entries the engine produced since the last call.
    fn push_entries(&mut self) {
        let entries = self
            .game
            .as_mut()
            .map(|g| g.take_entries())
            .unwrap_or_default();
        for entry in entries {
            self.push(entry);
        }
    }

    fn state_for(&self, viewer: &Viewer) -> Result<State, ApiError> {
        let game = self
            .game
            .as_ref()
            .ok_or_else(|| error(ErrorCode::NoScene, "Load a scene first."))?;
        let full = FullState {
            mode: game.mode(),
            scene_id: Some(game.scene_id().to_owned()),
            round: game.round(),
            initiative: game.initiative(),
            creatures: game.creatures(),
            anchors: game.anchors().to_vec(),
            flags: game.flags(),
            checks: game.checks(),
            encounters: game.encounters(),
            spawns: game.spawns(),
        };
        projection::state(viewer, full).ok_or_else(|| {
            error(
                ErrorCode::UnknownCreature,
                "The viewer must be dm or a creature in this scene.",
            )
        })
    }

    fn push(&mut self, pending: Pending) {
        let seq = self.log.len() as u64 + 1;
        let mut kind = pending.kind;
        match &mut kind {
            EventKind::Roll {
                roll: RollView::Full { id, .. },
            } => {
                let real = RollId(format!("r{seq}"));
                if !id.0.is_empty() {
                    self.roll_keys.insert(id.0.clone(), real.clone());
                }
                *id = real;
            }
            // The adapter names the roll behind a change by its local key; a key with no
            // logged roll cites nothing rather than a guess.
            EventKind::DamageTaken { source_roll, .. } | EventKind::Healed { source_roll, .. } => {
                *source_roll = source_roll
                    .take()
                    .and_then(|key| self.roll_keys.get(&key.0).cloned());
            }
            EventKind::CheckResolved { roll_id, .. } => {
                if let Some(real) = self.roll_keys.get(&roll_id.0) {
                    *roll_id = real.clone();
                }
            }
            _ => {}
        }
        self.log.push(Event {
            seq,
            round: pending.round,
            scene: self.game.as_ref().map(|g| g.scene_id().to_owned()),
            visibility: pending.visibility,
            text: render::text(&kind),
            kind,
        });
    }
}

fn describe(awaiting: &Awaiting) -> String {
    match awaiting {
        Awaiting::NoSession | Awaiting::Idle => "nobody".into(),
        Awaiting::Action { actor, .. } => format!("{}'s action", actor.0),
        Awaiting::Reaction { actor, .. } => format!("{}'s reaction", actor.0),
        Awaiting::CombatOver { .. } => "nothing, because combat is over".into(),
    }
}
