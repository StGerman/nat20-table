//! One engine session: the session log, roll ids, prompt ids, and the loaded scene.
//!
//! The log holds every event in full (DM) form with its visibility and is never cleared or
//! rewritten: `seq` (from 1) and roll ids (`r<seq>`) are unique for the whole session.
//! Projection happens on the way out.

use std::{collections::HashMap, path::PathBuf};

use nat20_world as world;

use nat20_ledger::{Asset, Entry, Holder, Holdings, Journal, Reason};

use nat20_api_contract::{
    Aim, ApiError, Awaiting, CheckSpec, CombatOverReason, Command, CommandResult, EndCombatReason,
    ErrorCode, Event, EventKind, Goods, Handle, HelpSpec, HitDiceSpend, LedgerGoods, LedgerReason,
    Lodging, Mode, MoveTarget, NightView, OptionId, Pace, PromptId, ReactionTrigger, RejectReason,
    RollId, RollView, SceneFile, State, Visibility,
};

mod cards;
mod level_up;

use crate::{
    adapter::{
        events::Pending,
        game::{DAYS_FOOD_QUARTER_LB, Game, TriggerCause, Wait},
    },
    campaign::Campaign,
    errors::{error, rejected, with_awaiting},
    projection::{self, FullState, Viewer, WorldFull},
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
    /// Every movement of coin and items this session, as the `ledger` entries log it.
    ledger: Journal,
    /// Every time the coin trial balance failed: a creature whose purse in core differs from what
    /// the journal says it holds (AGT-78). Each is also logged on stderr. Empty in a sound run.
    ledger_mismatches: Vec<String>,
    /// The living world, once `start_campaign` ran (API-41).
    campaign: Option<Campaign>,
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
            ledger: Journal::default(),
            ledger_mismatches: Vec::new(),
            campaign: None,
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
        self.enter_scene(&scene, party)?;
        Ok(CommandResult::LoadScene {
            state: self.state_for(viewer)?,
        })
    }

    /// Loads a scene file already read and checked, carrying `party` in, and logs
    /// `scene_loaded`. Nothing changes on a refusal.
    fn enter_scene(&mut self, scene: &SceneFile, party: &[Handle]) -> Result<(), ApiError> {
        match Game::load(self.game.take(), scene, party) {
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
                scene_id: scene.id.clone(),
                mode: Mode::Explore,
            },
        ));
        Ok(())
    }

    /// Starts the living world from the pack's `campaign.json` (API-41). The DM's command, once,
    /// with the party in the current scene.
    pub fn start_campaign(
        &mut self,
        party: &[Handle],
        human: Option<&Handle>,
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        if *viewer != Viewer::Dm {
            return Err(error(
                ErrorCode::NotVisible,
                "start_campaign is the game's setup command; send it as dm.",
            ));
        }
        if self.campaign.is_some() {
            return Err(error(
                ErrorCode::BadRequest,
                "A campaign is already running in this session.",
            ));
        }
        let game = self.game_mut()?;
        if game.mode() == Mode::Combat {
            return Err(error(
                ErrorCode::WrongMode,
                "A fight is running; the campaign starts out of combat.",
            ));
        }
        if party.is_empty() {
            return Err(error(
                ErrorCode::BadRequest,
                "The party needs at least one creature.",
            ));
        }
        let mut seen = std::collections::HashSet::new();
        for handle in party {
            if !seen.insert(&handle.0) {
                return Err(error(
                    ErrorCode::BadRequest,
                    format!("The party lists {} twice.", handle.0),
                ));
            }
            if !game.has_creature(&handle.0) {
                return Err(error(
                    ErrorCode::UnknownCreature,
                    format!("There is no creature {} in this scene.", handle.0),
                ));
            }
        }
        if let Some(human) = human
            && !party.contains(human)
        {
            return Err(error(
                ErrorCode::BadRequest,
                format!("The human's creature {} is not in the party.", human.0),
            ));
        }
        self.campaign = Some(Campaign::read(
            &self.data_dir,
            party.to_vec(),
            human.map(|h| h.0.clone()),
        )?);
        Ok(CommandResult::StartCampaign {
            state: self.state_for(viewer)?,
        })
    }

    /// The checks `travel` and `rest_night` share: a campaign runs, the viewer is the actor and
    /// drives the caravan, no fight runs, and the whole party is in the scene.
    fn driver_check(
        &self,
        actor: &str,
        viewer: &Viewer,
        command: &str,
    ) -> Result<&Campaign, ApiError> {
        let Some(campaign) = self.campaign.as_ref() else {
            return Err(error(
                ErrorCode::NoCampaign,
                "No campaign is running; the game starts one with start_campaign.",
            ));
        };
        if *viewer != Viewer::Creature(actor.to_owned()) {
            return Err(rejected(
                RejectReason::NotDriver,
                format!("{command} is the caravan's call: its driver sends it as themselves."),
            ));
        }
        if campaign.world.state.deck.pending.is_some() {
            return Err(rejected(
                RejectReason::CardPending,
                format!(
                    "A road card waits for its decision; {command} waits until every seat has spoken (choose_card)."
                ),
            ));
        }
        if !campaign.drives(actor) {
            return Err(rejected(
                RejectReason::NotDriver,
                format!(
                    "{actor} does not decide where the caravan goes; the caravan owner {} does.",
                    campaign.world.state.caravan.owner
                ),
            ));
        }
        let game = self
            .game
            .as_ref()
            .ok_or_else(|| error(ErrorCode::NoScene, "Load a scene first."))?;
        if game.mode() == Mode::Combat {
            return Err(error(
                ErrorCode::WrongMode,
                "A fight is running; the caravan moves on once it is over.",
            ));
        }
        if let Some(missing) = campaign.party.iter().find(|h| !game.has_creature(&h.0)) {
            return Err(error(
                ErrorCode::UnknownCreature,
                format!("{} of the party is not in this scene.", missing.0),
            ));
        }
        Ok(campaign)
    }

    /// Spends the night (API-42): pays the inn or eats the caravan's rations, ends the day
    /// through core (the Malnutrition save), takes the Long Rest through core, and moves the
    /// clock to dawn. Nothing changes on a refusal.
    pub fn rest_night(
        &mut self,
        actor: &str,
        lodging: Lodging,
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        let campaign = self.driver_check(actor, viewer, "rest_night")?;
        let party = campaign.party.clone();
        let mut next = campaign.clone();
        let fed = match lodging {
            Lodging::Inn => {
                let Some(price) = campaign.inn_here() else {
                    return Err(rejected(
                        RejectReason::NoInn,
                        "There is no inn here; make camp instead.",
                    ));
                };
                let game = self
                    .game
                    .as_ref()
                    .ok_or_else(|| error(ErrorCode::NoScene, "Load a scene first."))?;
                for handle in &party {
                    if game.purse_total_cp(&handle.0)? < u64::from(price) {
                        return Err(rejected(
                            RejectReason::InsufficientFunds,
                            format!(
                                "{} cannot pay the inn's {price} cp for the night; make camp instead.",
                                handle.0
                            ),
                        ));
                    }
                }
                party.len()
            }
            Lodging::Camp => {
                let held = campaign.world.state.caravan.total(world::RATIONS) as usize;
                let eaten = held.min(party.len());
                next.world
                    .state
                    .caravan
                    .unload_anywhere(world::RATIONS, eaten as u32)
                    .map_err(|e| error(ErrorCode::Internal, format!("{e:?}")))?;
                eaten
            }
        };
        let minutes = next.world.night_minutes();
        next.world.pass_night(minutes);
        let price = campaign.inn_here().unwrap_or(0);
        if lodging == Lodging::Inn {
            // One payment at a time, each logged before the next, so the coin trial balance
            // (AGT-78) holds after every entry.
            for handle in &party {
                self.game_mut()?
                    .pay_world(&handle.0, price, LedgerReason::Inn)?;
                self.push_entries();
            }
        }
        let game = self.game_mut()?;
        let mut hungry = Vec::new();
        for (i, handle) in party.iter().enumerate() {
            let food = if i < fed { DAYS_FOOD_QUARTER_LB } else { 0 };
            if !game.end_of_day(&handle.0, food)? {
                hungry.push(handle.clone());
            }
        }
        let (rested, not_rested) = game.night(&party, minutes)?;
        self.campaign = Some(next);
        self.push_entries();
        let night = NightView {
            actor: Handle(actor.to_owned()),
            lodging,
            minutes,
            rested,
            not_rested,
            hungry,
        };
        self.push(Pending::public(
            None,
            EventKind::Night {
                night: night.clone(),
            },
        ));
        if lodging == Lodging::Camp {
            self.draw_card(|world, dice| world.draw_at_night(dice))?;
        }
        Ok(CommandResult::RestNight {
            night,
            state: self.state_for(viewer)?,
        })
    }

    /// Travels one leg (API-41): the world moves on, core's time with it, and the scene the
    /// leg ends in loads with the party.
    pub fn travel(
        &mut self,
        actor: &str,
        to: Option<&str>,
        pace: Pace,
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        let campaign = self.driver_check(actor, viewer, "travel")?;
        let (next, leg) = campaign.plan_leg(to, pace)?;
        let party = campaign.party.clone();
        let mut moved = campaign.clone();
        moved.world = next;
        let scene = scene::read(&self.data_dir, &moved.scene_at(&moved.world.state.at))?;
        // The scene change's own ten minutes count toward the leg.
        let on_the_way = leg.minutes.saturating_sub(10);
        let view = moved.leg_view(actor, &leg);
        let found = leg
            .discovered
            .then(|| moved.world.map.place(&leg.toward).map(|p| p.name.clone()))
            .flatten();
        self.campaign = Some(moved);
        if let Some(game) = self.game.as_mut() {
            game.pass_minutes(on_the_way);
        }
        self.push_entries();
        self.push(Pending::public(
            None,
            EventKind::Traveled { leg: view.clone() },
        ));
        if let Some(name) = found {
            self.push(Pending::public(
                None,
                EventKind::PlaceDiscovered {
                    place: leg.toward.clone(),
                    name,
                },
            ));
        }
        self.enter_scene(&scene, &party)?;
        let road = leg.road.clone();
        self.draw_card(|world, dice| world.draw_after_leg(&road, dice))?;
        Ok(CommandResult::Travel {
            leg: view,
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

    /// Starts a fight among creatures present that no authored encounter fits (API-34).
    pub fn start_fight(
        &mut self,
        participants: &[Handle],
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        let result = self.game_mut()?.start_fight(participants);
        self.after_decision(result)?;
        Ok(CommandResult::StartFight {
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
    /// take on a turn of its own, with no prompt id. Only `actor`'s owner and the DM may list
    /// them; anyone else gets `not_visible`.
    pub fn legal_actions(
        &mut self,
        actor: &str,
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        if !projection::lists_options(viewer, actor) {
            return Err(error(
                ErrorCode::NotVisible,
                format!("Only {actor}'s player and the DM can see {actor}'s options."),
            ));
        }
        if self.game_mut()?.mode() == Mode::Explore {
            let (options, unavailable) = self.game_mut()?.explore_legal_actions(actor)?;
            return Ok(CommandResult::LegalActions {
                prompt_id: PromptId(String::new()),
                options,
                unavailable,
                can_end_turn: false,
                budget: None,
            });
        }
        let prompt_id = self.require_prompt(actor, None, false)?;
        let (options, unavailable) = self.game_mut()?.legal_actions(actor)?;
        let budget = self.game_mut()?.turn_budget(actor)?;
        Ok(CommandResult::LegalActions {
            prompt_id: PromptId(prompt_id),
            options,
            unavailable,
            can_end_turn: true,
            budget: Some(budget),
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
        partial: bool,
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
        let result = self.game_mut()?.move_to(actor, to, partial);
        self.after_decision(result.as_ref().map(|_| ()).map_err(Clone::clone))?;
        let (moved_ft, provoked, reached) = result.expect("errors returned above");
        Ok(CommandResult::Move {
            moved_ft,
            provoked,
            reached,
        })
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

    /// `give`: coin or one carried item to a creature within 5 feet; the `ledger` entry is in
    /// the log.
    pub fn give(&mut self, actor: &str, to: &str, what: &Goods) -> Result<CommandResult, ApiError> {
        let result = self.game_mut()?.give(actor, to, what);
        self.after_decision(result.clone())?;
        Ok(CommandResult::Give {})
    }

    /// `steal`: Sleight of Hand against passive Perception; the roll and what moved are in the
    /// log, seen by the thief and the DM.
    pub fn steal(
        &mut self,
        actor: &str,
        target: &str,
        what: &Goods,
    ) -> Result<CommandResult, ApiError> {
        let result = self.game_mut()?.steal(actor, target, what);
        self.after_decision(result.as_ref().map(|_| ()).map_err(Clone::clone))?;
        let outcome = result.expect("errors returned above");
        Ok(CommandResult::Steal {
            roll_id: self
                .roll_keys
                .get(&outcome.key)
                .cloned()
                .expect("the theft's roll was logged"),
            success: outcome.success,
        })
    }

    /// `loot`: everything a fallen or surrendered creature carries; one `ledger` entry each.
    pub fn loot(&mut self, actor: &str, from: &str) -> Result<CommandResult, ApiError> {
        let result = self.game_mut()?.loot(actor, from);
        self.after_decision(result.clone())?;
        Ok(CommandResult::Loot {})
    }

    /// Places one monster the scene file doesn't list (`place_creature`, API-33).
    pub fn place_creature(
        &mut self,
        command: &Command,
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        let Command::PlaceCreature {
            handle,
            monster,
            side,
            at,
            name,
            carries,
        } = command
        else {
            unreachable!("the server dispatches place_creature here");
        };
        let result = self.game_mut()?.place_creature(
            handle,
            monster,
            *side,
            at,
            name.as_deref(),
            carries.as_ref(),
        );
        // Like a spawn, placing is not a decision: a pending prompt keeps its id.
        self.push_entries();
        result?;
        Ok(CommandResult::PlaceCreature {
            state: self.state_for(viewer)?,
            handle: handle.clone(),
        })
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
            Wait::Idle => match self.game.as_ref().and_then(|g| g.open_level_up()) {
                Some((actor, prompt_id)) => Awaiting::LevelUp {
                    prompt_id: PromptId(prompt_id),
                    actor: Handle(actor),
                },
                None => Awaiting::Idle,
            },
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
            world: self.campaign.as_ref().map(|c| WorldFull {
                view: c.dm_view(|h| game.is_up(h)),
                drivers: c.drivers(),
            }),
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
            EventKind::Ledger {
                from,
                to,
                what,
                reason,
                roll_id,
            } => {
                if let Some(key) = roll_id.as_mut()
                    && let Some(real) = self.roll_keys.get(&key.0)
                {
                    *key = real.clone();
                }
                let entry = ledger_entry(from, to, what, *reason, roll_id.as_ref());
                self.open_accounts(&entry);
                self.ledger
                    .post(entry)
                    .expect("the engine logs ledger entries only for goods that moved");
                self.check_coin();
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

impl Session {
    /// Opens the journal account of a creature it meets for the first time, from its purse in
    /// core before this entry: core has already moved the coin, so the giver had `copper` more
    /// and the receiver `copper` less. Each command logs at most one coin entry per creature, so
    /// the purse read now is the one this entry left.
    fn open_accounts(&mut self, entry: &Entry) {
        let copper = match entry.what {
            Asset::Coin { copper } => i64::from(copper),
            Asset::Item { .. } => 0,
        };
        for (holder, before) in [(&entry.from, copper), (&entry.to, -copper)] {
            let Holder::Creature(handle) = holder else {
                continue;
            };
            let Some(now) = self.game.as_ref().and_then(|g| g.purse_copper(handle)) else {
                continue;
            };
            self.ledger.open_account(
                holder.clone(),
                Holdings {
                    copper: now + before,
                    ..Holdings::default()
                },
            );
        }
    }

    /// The coin trial balance (AGT-78): every creature the journal knows holds, in core, the
    /// copper the journal says. Items are left out: a potion drunk leaves the pack with no
    /// ledger entry. A creature no longer in the scene isn't compared.
    fn check_coin(&mut self) {
        let Some(game) = self.game.as_ref() else {
            return;
        };
        for (holder, holdings) in self.ledger.balances() {
            let Holder::Creature(handle) = &holder else {
                continue;
            };
            if let Some(core) = game.purse_copper(handle)
                && core != holdings.copper
            {
                let line = format!(
                    "ledger: {handle} holds {core} cp in core but {} cp in the journal",
                    holdings.copper
                );
                eprintln!("{line}");
                self.ledger_mismatches.push(line);
            }
        }
    }

    /// Every failed coin trial balance so far (AGT-78).
    pub fn ledger_mismatches(&self) -> &[String] {
        &self.ledger_mismatches
    }
}

/// A logged `ledger` event as a journal entry.
fn ledger_entry(
    from: &str,
    to: &str,
    what: &LedgerGoods,
    reason: LedgerReason,
    roll_id: Option<&RollId>,
) -> Entry {
    let holder = |h: &str| h.parse().unwrap_or_else(|_| Holder::Creature(h.to_owned()));
    Entry {
        from: holder(from),
        to: holder(to),
        what: match what {
            LedgerGoods::Coins { copper } => Asset::Coin { copper: *copper },
            LedgerGoods::Item { item, quantity } => Asset::Item {
                item: item.clone(),
                quantity: *quantity,
            },
        },
        reason: match reason {
            LedgerReason::Trade => Reason::Trade,
            LedgerReason::Wage => Reason::Wage,
            LedgerReason::Loot => Reason::Loot,
            LedgerReason::Toll => Reason::Toll,
            LedgerReason::Inn => Reason::Inn,
            LedgerReason::Theft => Reason::Theft,
            LedgerReason::Reward => Reason::Reward,
        },
        roll: roll_id.map(|r| r.0.clone()),
    }
}

fn describe(awaiting: &Awaiting) -> String {
    match awaiting {
        Awaiting::NoSession | Awaiting::Idle => "nobody".into(),
        Awaiting::Action { actor, .. } => format!("{}'s action", actor.0),
        Awaiting::Reaction { actor, .. } => format!("{}'s reaction", actor.0),
        Awaiting::CombatOver { .. } => "nothing, because combat is over".into(),
        Awaiting::LevelUp { actor, .. } => format!("{}'s level-up choice", actor.0),
    }
}
