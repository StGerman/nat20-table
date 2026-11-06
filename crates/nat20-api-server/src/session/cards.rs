//! Road cards in a session (API-43): the draw and its world roll, the seats' words, and the
//! chosen choice's effects. The deck and its rules are `nat20_world::deck`; checks, fights,
//! coin and exhaustion run through core by way of the adapter.

use nat20_api_contract::{
    AdvantageState, ApiError, CheckSpec, CommandResult, DiceRolled, ErrorCode, EventKind, Handle,
    LedgerReason, LifeState, Mode, Placement, RejectReason, RollId, RollKind, RollOutcome,
    RollView, Side, Visibility,
};
use nat20_world as world;

use super::Session;
use crate::{
    adapter::{self, events::Pending},
    campaign,
    errors::{error, rejected},
    projection::Viewer,
};

/// The roller of a world roll: no creature rolls it.
const WORLD_ROLLER: &str = "world";

/// The session's dice for the world: core's seeded dice, each roll kept for the log.
#[derive(Default)]
pub(super) struct SessionDice {
    rolls: Vec<(u32, u32, String)>,
}

impl world::WorldDice for SessionDice {
    fn roll(&mut self, sides: u32, why: &str) -> u32 {
        let value = adapter::roll_world_die(sides)
            .unwrap_or_else(|| panic!("the world asked for a d{sides}, which core has no die for"));
        self.rolls.push((sides, value, why.to_owned()));
        value
    }
}

impl Session {
    /// Draws a road card with `draw` and logs the roll (DM only) and `card_drawn` (public).
    /// A card nobody can speak on is settled at once. Returns whether a card was drawn.
    pub(super) fn draw_card(
        &mut self,
        draw: impl FnOnce(&mut world::World, &mut SessionDice) -> Option<String>,
    ) -> Result<bool, ApiError> {
        let Some(campaign) = self.campaign.as_mut() else {
            return Ok(false);
        };
        let mut dice = SessionDice::default();
        let drawn = draw(&mut campaign.world, &mut dice);
        let card = drawn.and_then(|id| campaign.world.deck.card(&id).cloned());
        let offered = campaign.world.state.deck.pending.clone();
        for (sides, value, why) in dice.rolls {
            self.push(Pending {
                round: None,
                visibility: Visibility::Dm,
                kind: EventKind::Roll {
                    roll: world_roll(sides, value, &why),
                },
            });
        }
        let Some(card) = card else {
            return Ok(false);
        };
        self.push(Pending::public(
            None,
            EventKind::CardDrawn {
                target: campaign::target(card.target),
                card_text: card.text.clone(),
                choices: campaign::choices(&card, offered.as_ref()),
            },
        ));
        let table = self.table();
        let campaign = self.campaign.as_mut().expect("checked above");
        let world = &mut campaign.world;
        if let Some(resolution) = world.deck.settle_unattended(&mut world.state.deck, &table) {
            self.resolve_card(resolution)?;
        }
        Ok(true)
    }

    /// Who sits at the table for the card: Blades who are up and in the scene.
    fn table(&self) -> world::Table {
        let campaign = self.campaign.as_ref().expect("a card needs a campaign");
        let game = self.game.as_ref();
        campaign.table(|h| game.is_some_and(|g| g.has_creature(h) && g.is_up(h)))
    }

    /// `choose_card`: one seat's word on the card on the table (API-43).
    pub fn choose_card(
        &mut self,
        actor: &str,
        choice: &str,
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        if *viewer != Viewer::Creature(actor.to_owned()) {
            return Err(rejected(
                RejectReason::NoSay,
                "choose_card is a player's word: send it as your own creature.",
            ));
        }
        let Some(campaign) = self.campaign.as_ref() else {
            return Err(error(
                ErrorCode::NoCampaign,
                "No campaign is running; the game starts one with start_campaign.",
            ));
        };
        if campaign.world.state.deck.pending.is_none() {
            return Err(rejected(
                RejectReason::NoCard,
                "No road card is waiting for a decision.",
            ));
        }
        if self.game_mut()?.mode() == Mode::Combat {
            return Err(error(
                ErrorCode::WrongMode,
                "A fight is running; the card waits until it is over.",
            ));
        }
        let table = self.table();
        let campaign = self.campaign.as_mut().expect("checked above");
        let world = &mut campaign.world;
        let spoken = world
            .deck
            .speak(&mut world.state.deck, &table, actor, choice)
            .map_err(|e| {
                let reason = match &e {
                    world::CardError::NoCard => RejectReason::NoCard,
                    world::CardError::UnknownChoice(_) => RejectReason::UnknownChoice,
                    world::CardError::NoSay(_) => RejectReason::NoSay,
                    world::CardError::AlreadySpoke(_) => RejectReason::AlreadySpoke,
                    world::CardError::WaitingFor(_) => RejectReason::WaitingForAdvice,
                };
                rejected(reason, format!("{}.", capitalised(&e.to_string())))
            })?;
        if table.blades.iter().any(|b| b == actor) {
            self.push(Pending::public(
                None,
                EventKind::CardAdvice {
                    actor: Handle(actor.to_owned()),
                    choice: choice.to_owned(),
                },
            ));
        }
        if let Some(resolution) = spoken {
            self.resolve_card(resolution)?;
        }
        Ok(CommandResult::ChooseCard {
            state: self.state_for(viewer)?,
        })
    }

    /// Logs the decision and runs the choice's effects.
    fn resolve_card(&mut self, resolution: world::Resolution) -> Result<(), ApiError> {
        self.push(Pending::public(
            None,
            EventKind::CardResolved {
                choice: resolution.choice.clone(),
                decided: campaign::decided(resolution.decided),
            },
        ));
        self.run_effects(&resolution.effects, &resolution.by)?;
        // A destination's arrival card is decided: the escort settles now (ENG-35).
        self.settle_if_arrived()?;
        Ok(())
    }

    /// The handles an effect touches, in party order. A check rolls for those on their feet
    /// only; a payment, a gain or Exhaustion touches every living one, downed or not.
    fn who(&self, who: world::Who, rolling: bool) -> Vec<String> {
        let table = self.table();
        let campaign = self.campaign.as_ref().expect("a card needs a campaign");
        let game = self.game.as_ref();
        let touched = |h: &str| {
            game.is_some_and(|g| {
                g.has_creature(h) && if rolling { g.is_up(h) } else { !g.is_dead(h) }
            })
        };
        match who {
            world::Who::Party => campaign
                .party
                .iter()
                .map(|h| h.0.clone())
                .filter(|h| touched(h))
                .collect(),
            // The Blades were up when the card opened; an earlier effect may have downed one.
            world::Who::Blades => table.blades.into_iter().filter(|h| touched(h)).collect(),
            world::Who::Owner => match &table.owner {
                world::Owner::Player(owner) if touched(owner) => vec![owner.clone()],
                _ => Vec::new(),
            },
        }
    }

    /// Runs a choice's effects in order. `by` is who did them, for a `remember`: the seats
    /// that made the call, or inside a check the ones who rolled it.
    fn run_effects(&mut self, effects: &[world::Effect], by: &[String]) -> Result<(), ApiError> {
        for effect in effects {
            self.run_effect(effect, by)?;
        }
        Ok(())
    }

    fn run_effect(&mut self, effect: &world::Effect, by: &[String]) -> Result<(), ApiError> {
        match effect {
            world::Effect::Check {
                who,
                ability,
                skill,
                dc,
                success,
                failure,
            } => {
                let (ability, skill) = campaign::parse_check(ability, skill).ok_or_else(|| {
                    error(
                        ErrorCode::Internal,
                        "a deck check names no ability or skill",
                    )
                })?;
                let rollers = self.who(*who, true);
                let spec = CheckSpec::Ladder {
                    ability,
                    skill: Some(skill),
                    dc: u8::try_from(*dc).unwrap_or(u8::MAX),
                };
                let mut passed = 0;
                for roller in &rollers {
                    let result = self.game_mut()?.request_check(roller, &spec);
                    self.push_entries();
                    if result?.success {
                        passed += 1;
                    }
                }
                // SRD 5.1, Group Checks: the group succeeds when at least half succeed.
                let group = !rollers.is_empty() && passed * 2 >= rollers.len();
                self.run_effects(if group { success } else { failure }, &rollers)
            }
            world::Effect::Fight { monsters } => self.card_fight(monsters),
            world::Effect::Pay { who, copper } => {
                for payer in self.who(*who, false) {
                    let game = self.game_mut()?;
                    let held = game.purse_total_cp(&payer)?;
                    let paid = u32::try_from(held.min(u64::from(*copper))).unwrap_or(*copper);
                    if paid > 0 {
                        game.pay_world(&payer, paid, LedgerReason::Toll)?;
                    }
                    self.push_entries();
                }
                Ok(())
            }
            world::Effect::Gain { who, copper } => {
                for taker in self.who(*who, false) {
                    self.game_mut()?
                        .receive_world(&taker, *copper, LedgerReason::Reward)?;
                    self.push_entries();
                }
                Ok(())
            }
            world::Effect::Cargo { good, change } => {
                let campaign = self.campaign.as_mut().expect("a card needs a campaign");
                let world = &mut campaign.world;
                let moved = if *change >= 0 {
                    let gained = world
                        .state
                        .caravan
                        .load_anywhere(good, change.unsigned_abs(), &world.goods)
                        .map_err(|e| error(ErrorCode::Internal, e.to_string()))?;
                    i32::try_from(gained).unwrap_or(i32::MAX)
                } else {
                    let lost = world.state.caravan.total(good).min(change.unsigned_abs());
                    world
                        .state
                        .caravan
                        .unload_anywhere(good, lost)
                        .map_err(|e| error(ErrorCode::Internal, e.to_string()))?;
                    -i32::try_from(lost).unwrap_or(i32::MAX)
                };
                if moved != 0 {
                    self.push(Pending::public(
                        None,
                        EventKind::CargoChanged {
                            good: good.clone(),
                            change: moved,
                        },
                    ));
                }
                Ok(())
            }
            world::Effect::Exhaustion { who, levels } => {
                for tired in self.who(*who, false) {
                    self.game_mut()?.gain_exhaustion(&tired, *levels)?;
                    self.push_entries();
                }
                Ok(())
            }
            world::Effect::Delay { minutes } => {
                let campaign = self.campaign.as_mut().expect("a card needs a campaign");
                campaign.world.delay(*minutes);
                self.game_mut()?.pass_minutes(*minutes);
                self.push_entries();
                self.push(Pending::public(
                    None,
                    EventKind::TimeLost { minutes: *minutes },
                ));
                Ok(())
            }
            world::Effect::AddCard { card, soon } => {
                let campaign = self.campaign.as_mut().expect("a card needs a campaign");
                let world = &mut campaign.world;
                world.deck.add(&mut world.state.deck, card, *soon);
                Ok(())
            }
            world::Effect::Remember { deed } => {
                self.remember(deed, by.to_vec());
                Ok(())
            }
        }
    }

    /// The world remembers a deed (ENG-33) and logs `deed_remembered`, DM only (API-52). A deed
    /// done again keeps its first record and logs nothing.
    pub(super) fn remember(&mut self, deed: &str, by: Vec<String>) {
        let Some(campaign) = self.campaign.as_mut() else {
            return;
        };
        if !campaign.world.remember(deed, by) {
            return;
        }
        let record = campaign.world.state.deeds[deed].clone();
        self.push(Pending {
            round: None,
            visibility: Visibility::Dm,
            kind: EventKind::DeedRemembered {
                deed: deed.to_owned(),
                by: record.by.into_iter().map(Handle).collect(),
                day: record.day,
                contract: record.contract,
            },
        });
    }

    /// Follows the blows of a fight for the death deed (ENG-36): who rolled each roll, who dealt
    /// the last damage to each creature, and, when a card fight's named NPC dies, the deed
    /// `killed_<npc>` by the one who dealt the last blow: returned, for the caller to remember
    /// once the death itself is logged.
    pub(super) fn follow_blows(&mut self, kind: &EventKind) -> Option<(String, Vec<String>)> {
        match kind {
            EventKind::Action { actor, .. } => self.last_actor = Some(actor.0.clone()),
            EventKind::Roll {
                roll: RollView::Full { id, roller, .. },
            } => {
                self.rollers.insert(id.0.clone(), roller.0.clone());
            }
            EventKind::DamageTaken {
                target,
                source_roll,
                ..
            } => {
                let by = source_roll
                    .as_ref()
                    .and_then(|r| self.rollers.get(&r.0).cloned())
                    .or_else(|| self.last_actor.clone());
                if let Some(by) = by {
                    self.last_blow.insert(target.0.clone(), by);
                }
            }
            EventKind::LifeState {
                target,
                state: LifeState::Dead,
            } => {
                if let Some(npc) = self.card_npcs.remove(&target.0) {
                    let by = self.last_blow.get(&target.0).cloned().into_iter().collect();
                    return Some((world::killed_deed(&npc), by));
                }
            }
            _ => {}
        }
        None
    }

    /// A card's fight: each stat block placed hostile at the scene's first anchor under a
    /// fresh handle, then a fight between them and the party members who are up.
    fn card_fight(&mut self, monsters: &[world::Monster]) -> Result<(), ApiError> {
        let mut fighters: Vec<Handle> = self
            .who(world::Who::Party, true)
            .into_iter()
            .map(Handle)
            .collect();
        let game = self.game_mut()?;
        let Some(anchor) = game.anchors().first().map(|a| a.id.clone()) else {
            return Err(error(
                ErrorCode::Internal,
                "The road scene has no anchor to place a card's fight at.",
            ));
        };
        let mut named = Vec::new();
        for monster in monsters {
            let stat = monster.stat();
            let handle = (1..)
                .map(|n| Handle(format!("{stat}_{n}")))
                .find(|h| !game.has_creature(&h.0))
                .expect("some handle is free");
            game.place_creature(
                &handle,
                stat,
                Side::Hostile,
                &Placement::Anchor {
                    anchor: anchor.clone(),
                },
                None,
                None,
            )?;
            if let Some(npc) = monster.npc() {
                named.push((handle.0.clone(), npc.to_owned()));
            }
            fighters.push(handle);
        }
        self.card_npcs.extend(named);
        let result = self.game_mut()?.start_fight(&fighters);
        self.after_decision(result)
    }
}

/// The roll of a world table: DM only, so the size of a deck's pile never reaches a player.
fn world_roll(sides: u32, value: u32, why: &str) -> RollView {
    let total = i32::try_from(value).unwrap_or(i32::MAX);
    RollView::Full {
        id: RollId(String::new()),
        kind: RollKind::Table,
        label: why.to_owned(),
        roller: Handle(WORLD_ROLLER.to_owned()),
        target: None,
        dice: vec![DiceRolled {
            source: why.to_owned(),
            dice: format!("1d{sides}"),
            results: vec![value],
            kept: total,
        }],
        modifiers: Vec::new(),
        total,
        against: None,
        outcome: RollOutcome::Value,
        advantage: AdvantageState::Normal,
        dc_source: None,
        advantage_sources: Vec::new(),
    }
}

fn capitalised(text: &str) -> String {
    let mut chars = text.chars();
    chars
        .next()
        .map(|c| c.to_uppercase().chain(chars).collect())
        .unwrap_or_default()
}
