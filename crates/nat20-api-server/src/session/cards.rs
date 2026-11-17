//! Road cards in a session (API-43): the draw and its world roll, the seats' words, and the
//! chosen choice's effects. The deck and its rules are `nat20_world::deck`; checks, fights,
//! coin and exhaustion run through core by way of the adapter.

use nat20_api_contract::{
    Ability, AdvantageState, ApiError, CardCame, CheckSpec, CommandResult, DiceRolled, ErrorCode,
    EventKind, Handle, LedgerReason, LifeState, Mode, Placement, RejectReason, RollId, RollKind,
    RollOutcome, RollView, Side, Skill, Visibility,
};
use std::collections::BTreeMap;

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
    /// Draws with `draw` and logs each draw roll (DM only). A card that needs no pick goes on
    /// the table (`show_card`); two or three are offered to the DM (`cards_offered`, DM only)
    /// and wait for `pick_card` (API-53). Returns whether the draw drew anything.
    pub(super) fn draw_card(
        &mut self,
        draw: impl FnOnce(&mut world::World, &mut SessionDice) -> Option<world::Drawn>,
    ) -> Result<bool, ApiError> {
        let Some(campaign) = self.campaign.as_mut() else {
            return Ok(false);
        };
        let mut dice = SessionDice::default();
        let drawn = draw(&mut campaign.world, &mut dice);
        let mut rolls = Vec::new();
        for (sides, value, why) in dice.rolls {
            self.push(Pending {
                round: None,
                visibility: Visibility::Dm,
                kind: EventKind::Roll {
                    roll: world_roll(sides, value, &why),
                },
            });
            rolls.push(RollId(format!("r{}", self.log.len())));
        }
        match drawn {
            None => Ok(false),
            Some(world::Drawn::Offered(cards)) => {
                let campaign = self.campaign.as_ref().expect("checked above");
                let cards = cards
                    .iter()
                    .filter_map(|id| campaign.offered_card(id))
                    .collect();
                self.push(Pending {
                    round: None,
                    visibility: Visibility::Dm,
                    kind: EventKind::CardsOffered { cards, rolls },
                });
                Ok(true)
            }
            Some(world::Drawn::Table { card, soon }) => {
                if soon {
                    self.push(Pending {
                        round: None,
                        visibility: Visibility::Dm,
                        kind: EventKind::CardPicked {
                            card,
                            came: CardCame::Soon,
                            reason: None,
                        },
                    });
                }
                self.show_card()?;
                Ok(true)
            }
        }
    }

    /// Logs the card on the table (`card_drawn`, public), after the scout's look ahead when
    /// the card has something to find (API-54). A card nobody can speak on is settled at once.
    fn show_card(&mut self) -> Result<(), ApiError> {
        self.scout_look()?;
        let Some(campaign) = self.campaign.as_ref() else {
            return Ok(());
        };
        if let Some(shown) = campaign.card_shown() {
            self.push(Pending {
                round: None,
                visibility: Visibility::Dm,
                kind: shown,
            });
        }
        let campaign = self.campaign.as_mut().expect("checked above");
        if let Some(card) = campaign
            .world
            .state
            .deck
            .pending
            .as_ref()
            .map(|p| p.card.clone())
        {
            campaign.card_shown_to_party(&card);
        }
        let campaign = self.campaign.as_ref().expect("checked above");
        let pending = campaign.world.state.deck.pending.clone();
        let Some(card) = pending
            .as_ref()
            .and_then(|p| campaign.world.deck.card(&p.card).cloned())
        else {
            return Ok(());
        };
        self.push(Pending::public(
            None,
            EventKind::CardDrawn {
                target: campaign::target(card.target),
                card_text: card.text.clone(),
                choices: campaign::choices(&card, pending.as_ref()),
            },
        ));
        let table = self.table();
        let campaign = self.campaign.as_mut().expect("checked above");
        let world = &mut campaign.world;
        if let Some(resolution) = world.deck.settle_unattended(&mut world.state.deck, &table) {
            self.resolve_card(resolution)?;
        }
        Ok(())
    }

    /// The scout's look ahead at the card on the table (API-54): a Wisdom check with the
    /// card's `scout` skill against the road terrain's Search DC, through core, then
    /// `scout_looked` (public); a success opens the card's forewarned choice. Nothing when
    /// nobody walks ahead, the scout is not up, the card has nothing to find, or it is a night
    /// or arrival card.
    fn scout_look(&mut self) -> Result<(), ApiError> {
        let Some((scout, skill, dc)) = self.campaign.as_ref().and_then(|c| c.world.scout_check())
        else {
            return Ok(());
        };
        let up = self
            .game
            .as_ref()
            .is_some_and(|g| g.has_creature(&scout) && g.is_up(&scout) && g.mode() != Mode::Combat);
        if !up {
            return Ok(());
        }
        let spec = CheckSpec::Ladder {
            ability: Ability::Wisdom,
            skill: Some(campaign::scout_skill(skill)),
            dc: u8::try_from(dc).unwrap_or(u8::MAX),
        };
        let outcome = self.game_mut()?.request_check(&scout, &spec);
        self.push_entries();
        let outcome = outcome?;
        let roll = self
            .roll_keys
            .get(&outcome.key)
            .cloned()
            .expect("the check's roll was logged");
        if outcome.success {
            let campaign = self.campaign.as_mut().expect("checked above");
            campaign.world.forewarn();
        }
        self.push(Pending::public(
            None,
            EventKind::ScoutLooked {
                actor: Handle(scout),
                roll,
                saw: outcome.success,
            },
        ));
        Ok(())
    }

    /// `scout`: a Hired Blade walks ahead of the caravan as the scout (API-54), for every leg
    /// until another Blade takes the role.
    pub fn scout(&mut self, actor: &str, viewer: &Viewer) -> Result<CommandResult, ApiError> {
        if *viewer != Viewer::Creature(actor.to_owned()) {
            return Err(rejected(
                RejectReason::NoSay,
                "scout is a Blade's own word: send it as your own creature.",
            ));
        }
        let Some(campaign) = self.campaign.as_ref() else {
            return Err(error(
                ErrorCode::NoCampaign,
                "No campaign is running; the game starts one with start_campaign.",
            ));
        };
        if campaign.world.state.deck.waiting() {
            return Err(rejected(
                RejectReason::CardPending,
                "A road card waits; the scout can change places once it is decided.",
            ));
        }
        if self.game_mut()?.mode() == Mode::Combat {
            return Err(error(
                ErrorCode::WrongMode,
                "A fight is running; nobody walks ahead until it is over.",
            ));
        }
        if !self.table().blades.iter().any(|b| b == actor) {
            return Err(rejected(
                RejectReason::NoSay,
                format!(
                    "Only a Hired Blade on their feet walks ahead as the scout; {actor} cannot."
                ),
            ));
        }
        let campaign = self.campaign.as_mut().expect("checked above");
        if campaign.world.state.scout.as_deref() != Some(actor) {
            campaign.world.state.scout = Some(actor.to_owned());
            self.push(Pending::public(
                None,
                EventKind::ScoutAhead {
                    actor: Handle(actor.to_owned()),
                },
            ));
        }
        Ok(CommandResult::Scout {
            state: self.state_for(viewer)?,
        })
    }

    /// `pick_card`: the DM's pick among the offered cards (API-53). The card goes on the table
    /// as a drawn card does; the others stay in the pile.
    pub fn pick_card(
        &mut self,
        card: &str,
        reason: &str,
        fallback: bool,
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        if *viewer != Viewer::Dm {
            return Err(error(
                ErrorCode::NotVisible,
                "pick_card is the DM's call; send it as dm.",
            ));
        }
        let Some(campaign) = self.campaign.as_mut() else {
            return Err(error(
                ErrorCode::NoCampaign,
                "No campaign is running; the game starts one with start_campaign.",
            ));
        };
        // A card about someone who died since the draw is never picked (rule A8).
        campaign.world.drop_dead_offers();
        // The loop's fallback takes the first card rolled; any other card is the DM's pick,
        // never the engine's (ENG-42).
        if fallback
            && let Some(first) = campaign.world.state.deck.offered.first()
            && first != card
            && campaign.world.state.deck.offered.iter().any(|c| c == card)
        {
            return Err(rejected(
                RejectReason::CardNotOffered,
                format!("A fallback pick takes the first card rolled: {first}, not {card}."),
            ));
        }
        campaign.world.pick_card(card).map_err(|e| {
            let offered = campaign.world.state.deck.offered.join(", ");
            let message = match e {
                world::PickError::NothingOffered => {
                    "No road cards are offered; a pick follows a draw that offers two or three."
                        .to_owned()
                }
                world::PickError::NotOffered(_) => {
                    format!("{card} is not one of the cards offered; pick one of: {offered}.")
                }
            };
            rejected(RejectReason::CardNotOffered, message)
        })?;
        self.push(Pending {
            round: None,
            visibility: Visibility::Dm,
            kind: EventKind::CardPicked {
                card: card.to_owned(),
                came: if fallback {
                    CardCame::EnginePick
                } else {
                    CardCame::DmPick
                },
                reason: Some(reason.to_owned()),
            },
        });
        self.show_card()?;
        Ok(CommandResult::PickCard {
            state: self.state_for(viewer)?,
        })
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
        self.card_open("The road card is not on the table yet; the DM is still choosing it.")?;
        let table = self.table();
        let campaign = self.campaign.as_mut().expect("checked above");
        let world = &mut campaign.world;
        let spoken = world
            .deck
            .speak(&mut world.state.deck, &table, actor, choice)
            .map_err(card_rejected)?;
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

    /// Refuses a word on the card unless one is on the table and no fight is running, as
    /// `choose_card` and `own_move` both need; `offered` answers while cards are offered.
    fn card_open(&mut self, offered: &str) -> Result<(), ApiError> {
        let Some(campaign) = self.campaign.as_ref() else {
            return Err(error(
                ErrorCode::NoCampaign,
                "No campaign is running; the game starts one with start_campaign.",
            ));
        };
        if !campaign.world.state.deck.offered.is_empty() {
            return Err(rejected(RejectReason::NoCard, offered));
        }
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
        Ok(())
    }

    /// `own_move`: the DM puts a seat's own words on the card on the table (API-56), as a
    /// ladder check that brings an offered choice on a success and, when one is named, another
    /// on a failure (decision 0079). The seat's word is given for it, so it may settle the
    /// card.
    pub fn own_move(
        &mut self,
        actor: &str,
        text: &str,
        (ability, skill, dc): (Ability, Skill, u8),
        (success, failure): (&str, Option<&str>),
        viewer: &Viewer,
    ) -> Result<CommandResult, ApiError> {
        if *viewer != Viewer::Dm {
            return Err(error(
                ErrorCode::NotVisible,
                "own_move is the DM's call; send it as dm.",
            ));
        }
        self.card_open("The road card is not on the table yet; pick it first (pick_card).")?;
        let length = text.chars().count();
        if !(1..=OWN_MOVE_MAX_CHARS).contains(&length) {
            return Err(error(
                ErrorCode::BadRequest,
                format!(
                    "An own move's words are 1 to {OWN_MOVE_MAX_CHARS} characters, not {length}."
                ),
            ));
        }
        // The words reach every player: they never carry a target number (protocol §5).
        if crate::leaks::names_a_target_number(text) {
            return Err(error(
                ErrorCode::BadRequest,
                "An own move's words reach every player, so they never name a DC or an AC.",
            ));
        }
        // The check is a ladder check's, refused as `request_check` refuses it.
        if !world::DC_LADDER.contains(&u32::from(dc)) {
            return Err(error(
                ErrorCode::BadRequest,
                format!("A ladder DC is one of 5, 10, 15, 20, 25 or 30, not {dc}."),
            ));
        }
        if !crate::adapter::sheet::skill_fits(ability, skill) {
            return Err(error(
                ErrorCode::NotImplemented,
                format!("{skill:?} checks with another ability than its own are not served yet."),
            ));
        }
        let wire = |v: serde_json::Value| v.as_str().expect("a wire enum is a string").to_owned();
        let mv = world::OwnMove {
            actor: actor.to_owned(),
            text: text.to_owned(),
            ability: wire(serde_json::to_value(ability).expect("an ability serializes")),
            skill: wire(serde_json::to_value(skill).expect("a skill serializes")),
            dc: u32::from(dc),
            success: success.to_owned(),
            failure: failure.map(str::to_owned),
            spent: false,
        };
        let table = self.table();
        let campaign = self.campaign.as_mut().expect("checked above");
        let world = &mut campaign.world;
        let card = world
            .state
            .deck
            .pending
            .as_ref()
            .map(|p| p.card.clone())
            .unwrap_or_default();
        let spoken = world
            .deck
            .own_move(&mut world.state.deck, &table, mv)
            .map_err(card_rejected)?;
        self.push(Pending::public(
            None,
            EventKind::CardOwnMove {
                actor: Handle(actor.to_owned()),
                words: text.to_owned(),
                skill,
            },
        ));
        self.push(Pending {
            round: None,
            visibility: Visibility::Dm,
            kind: EventKind::OwnMoveSet {
                card,
                actor: Handle(actor.to_owned()),
                ability,
                skill,
                dc,
                success: success.to_owned(),
                failure: failure.map(str::to_owned),
            },
        });
        if table.blades.iter().any(|b| b == actor) {
            self.push(Pending::public(
                None,
                EventKind::CardAdvice {
                    actor: Handle(actor.to_owned()),
                    choice: world::OWN_MOVE.to_owned(),
                },
            ));
        }
        if let Some(resolution) = spoken {
            self.resolve_card(resolution)?;
        }
        Ok(CommandResult::OwnMove {
            state: self.state_for(viewer)?,
        })
    }

    /// Logs the decision and runs the choice's effects; for an own move, rolls the
    /// proposer's check and runs the branch it lands on (API-56). An own move with no failure
    /// rolls before the card is decided, and a fall leaves the card to the words left
    /// (decision 0079).
    fn resolve_card(&mut self, resolution: world::Resolution) -> Result<(), ApiError> {
        // The card's cast is shown the deeds its choice reads, and sees the deeds its effects
        // write (API-59).
        if let Some(campaign) = self.campaign.as_mut() {
            campaign
                .world
                .choice_chosen(&resolution.card, &resolution.choice);
            self.card_cast = Some(campaign.world.cast_of(&resolution.card));
        }
        let resolved = self.resolve_card_effects(resolution);
        self.card_cast = None;
        resolved
    }

    fn resolve_card_effects(&mut self, resolution: world::Resolution) -> Result<(), ApiError> {
        if let Some(run) = resolution
            .own_move
            .as_ref()
            .filter(|_| resolution.rolls_first())
        {
            return self.resolve_own_move_alone(&resolution, run);
        }
        self.push(Pending::public(
            None,
            EventKind::CardResolved {
                choice: resolution.choice.clone(),
                decided: campaign::decided(resolution.decided),
            },
        ));
        if let Some(mv) = &resolution.own_move {
            self.run_own_move(&resolution.card, mv, &resolution.by)?;
        }
        self.run_effects(&resolution.effects, &resolution.by)?;
        // A destination's arrival card is decided: the escort settles now (ENG-35).
        self.settle_if_arrived()?;
        Ok(())
    }

    /// An own move with no failure the vote settled on (decision 0079): the card is still on
    /// the table, and the proposer rolls first. A success decides the card on the move and runs
    /// the success branch. A fall (a failed roll, a downed proposer, or an engine error at the
    /// roll, taken as a fall with no roll) runs no choice: the deed is written, the move is
    /// spent, the words for it are taken back, and the card is decided now only if the words
    /// left settle it.
    fn resolve_own_move_alone(
        &mut self,
        resolution: &world::Resolution,
        run: &world::OwnMoveRun,
    ) -> Result<(), ApiError> {
        // Any error at the roll is a fall, so the card is never left voted for a move nobody
        // can try again; stderr keeps the error.
        let (roll, success) = match self.roll_own_move(&run.mv) {
            Ok(rolled) => rolled,
            Err(err) => {
                eprintln!(
                    "own move on {}: the roll failed, taken as a fall: {}",
                    resolution.card, err.message
                );
                (None, false)
            }
        };
        if success {
            let world = &mut self
                .campaign
                .as_mut()
                .expect("a card needs a campaign")
                .world;
            world.deck.own_move_won(&mut world.state.deck);
            world.choice_chosen(&resolution.card, &run.mv.success);
            self.push(Pending::public(
                None,
                EventKind::CardResolved {
                    choice: resolution.choice.clone(),
                    decided: campaign::decided(resolution.decided),
                },
            ));
            self.push_own_move_ran(&resolution.card, Some(run.mv.success.as_str()), roll);
            self.run_effects(&run.success, &resolution.by)?;
            // A destination's arrival card is decided: the escort settles now (ENG-35).
            self.settle_if_arrived()?;
            return Ok(());
        }
        // The move is spent and its words taken back first, so an error in the deed never
        // leaves the card voted for a move nobody can try again.
        let table = self.table();
        let world = &mut self
            .campaign
            .as_mut()
            .expect("a card needs a campaign")
            .world;
        let settled = world
            .deck
            .own_move_fell(&mut world.state.deck, &table, roll.is_some());
        self.push_own_move_ran(&resolution.card, None, roll);
        // The fall's part: the deed alone, with the resolution's `by`. A card the words left
        // settled is resolved even if the deed fails, since it is already off the table.
        let deed = self.run_effects(&run.failure, &resolution.by);
        if let Some(settled) = settled {
            self.resolve_card(settled)?;
        }
        deed
    }

    /// An own move the card was decided on (API-56): the proposer rolls the check through
    /// core if they are up, and the branch it lands on runs with the resolution's `by`. A
    /// downed proposer rolls nothing, and the failure runs.
    fn run_own_move(
        &mut self,
        card: &str,
        run: &world::OwnMoveRun,
        by: &[String],
    ) -> Result<(), ApiError> {
        let mv = &run.mv;
        let (roll, success) = self.roll_own_move(mv)?;
        let (choice, effects) = if success {
            (Some(mv.success.as_str()), &run.success)
        } else {
            (mv.failure.as_deref(), &run.failure)
        };
        // The choice the roll brought is the one chosen (API-59): its cast sees what it reads.
        if let (Some(choice), Some(campaign)) = (choice, self.campaign.as_mut()) {
            campaign.world.choice_chosen(card, choice);
        }
        self.push_own_move_ran(card, choice, roll);
        self.run_effects(effects, by)
    }

    /// The proposer's check (API-56): the roll id and whether it succeeded, or no roll and a
    /// failure when the proposer is down or not here.
    fn roll_own_move(&mut self, mv: &world::OwnMove) -> Result<(Option<RollId>, bool), ApiError> {
        let up = self
            .game
            .as_ref()
            .is_some_and(|g| g.has_creature(&mv.actor) && g.is_up(&mv.actor));
        if !up {
            return Ok((None, false));
        }
        let (ability, skill) = campaign::parse_check(&mv.ability, &mv.skill)
            .ok_or_else(|| error(ErrorCode::Internal, "an own move names no ability or skill"))?;
        let spec = CheckSpec::Ladder {
            ability,
            skill: Some(skill),
            dc: u8::try_from(mv.dc).unwrap_or(u8::MAX),
        };
        let outcome = self.game_mut()?.request_check(&mv.actor, &spec);
        self.push_entries();
        let outcome = outcome?;
        let roll = self
            .roll_keys
            .get(&outcome.key)
            .cloned()
            .expect("the check's roll was logged");
        Ok((Some(roll), outcome.success))
    }

    /// `own_move_ran` (API-56): the choice the roll brought, or none after a fall.
    fn push_own_move_ran(&mut self, card: &str, choice: Option<&str>, roll: Option<RollId>) {
        self.push(Pending {
            round: None,
            visibility: Visibility::Dm,
            kind: EventKind::OwnMoveRan {
                card: card.to_owned(),
                choice: choice.map(str::to_owned),
                roll,
            },
        });
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
            world::Effect::Fight {
                monsters,
                surprise,
                wagon,
                from,
                owner,
            } => self.card_fight(monsters, *surprise, *wagon, from.as_deref(), *owner),
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
        // A campaign's world, or a site session's memory (ENG-44); with neither, nothing.
        // Who saw it (API-59): the cast of the card that writes it, else the roster people in
        // the scene.
        let saw = self
            .card_cast
            .clone()
            .unwrap_or_else(|| self.npcs_here.clone());
        let record = if let Some(campaign) = self.campaign.as_mut() {
            if !campaign.world.remember(deed, by, saw) {
                return;
            }
            campaign.world.state.deeds[deed].clone()
        } else if let Some(site) = self.site.as_mut() {
            if !site.memory.remember(deed, by, saw) {
                return;
            }
            site.memory.deeds[deed].clone()
        } else {
            return;
        };
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

    /// Whether the world remembers `deed`; with no world, nothing is remembered.
    pub(super) fn remembers(&self, deed: &str) -> bool {
        self.campaign
            .as_ref()
            .is_some_and(|c| c.world.state.deeds.contains_key(deed))
            || self
                .site
                .as_ref()
                .is_some_and(|s| s.memory.deeds.contains_key(deed))
    }

    /// Follows the blows of a fight for the death deeds (ENG-36, ENG-48): who rolled each roll,
    /// who dealt the last damage to each creature, and, when a card fight's named NPC dies, the
    /// deed `killed_<npc>` by the one who dealt the last blow; when an ally of a wagon fight
    /// dies, its death deed by the fight's Blades (rule A7). Returned, for the caller to
    /// remember once the death itself is logged.
    pub(super) fn follow_blows(&mut self, kind: &EventKind) -> Vec<(String, Vec<String>)> {
        let mut deeds = Vec::new();
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
                // A roster person who dies in the scene is dead to the world at once (API-58).
                if self.npcs_here.contains(&target.0)
                    && let Some(campaign) = self.campaign.as_mut()
                {
                    campaign.npc_died(&target.0);
                }
                if let Some(npc) = self.card_npcs.remove(&target.0) {
                    let by = self.last_blow.get(&target.0).cloned().into_iter().collect();
                    deeds.push((world::killed_deed(&npc), by));
                }
                if let Some(deed) = self.ally_died(&target.0) {
                    deeds.push(deed);
                }
            }
            _ => {}
        }
        deeds
    }

    /// An ally of the wagon fight under way died (ENG-48): a team animal leaves its team and
    /// writes `<owner>_lost_a_horse`; a company entry writes `<id>_dead`, and the NPC owner
    /// `<owner>_dead`. `by` is the fight's Blades (rule A7).
    fn ally_died(&mut self, handle: &str) -> Option<(String, Vec<String>)> {
        let fight = self.wagon_fight.as_mut()?;
        let ally = fight.allies.remove(handle)?;
        let by = fight.blades.clone();
        let campaign = self.campaign.as_mut()?;
        let deed = match ally {
            WagonAllyOf::Animal { wagon, animal } => {
                campaign.animal_died(wagon, &animal);
                world::lost_a_horse_deed(campaign.npc_owner()?)
            }
            WagonAllyOf::Entry { id, .. } => format!("{id}_dead"),
            WagonAllyOf::Owner { id } => world::owner_dead_deed(&id),
        };
        Some((deed, by))
    }

    /// The deeds a wagon fight writes when it ends (ENG-48): `<id>_hurt` for each company entry
    /// with `hurt` that lived through it below full Hit Points, by the fight's Blades (rule A7).
    pub(super) fn wagon_deeds(&mut self, kind: &EventKind) -> Vec<(String, Vec<String>)> {
        if !matches!(kind, EventKind::CombatOver { .. }) {
            return Vec::new();
        }
        let (Some(fight), Some(game)) = (self.wagon_fight.take(), self.game.as_ref()) else {
            return Vec::new();
        };
        fight
            .allies
            .iter()
            .filter_map(|(handle, ally)| match ally {
                WagonAllyOf::Entry { id, hurt: true } => game
                    .npc_now(handle)
                    .filter(|now| now.alive && now.hp < now.max_hp)
                    .map(|_| (format!("{id}_hurt"), fight.blades.clone())),
                _ => None,
            })
            .collect()
    }

    /// A card's fight: each stat block placed hostile under a fresh handle at the effect's
    /// `from`, or the scene's first anchor, then a fight between them and the party members who
    /// are up. With `surprise`, the monsters roll Initiative with Disadvantage (ENG-47). With
    /// `wagon`, whoever rides with the wagon joins it as an ally (ENG-48, rules A2 and A3).
    fn card_fight(
        &mut self,
        monsters: &[world::Monster],
        surprise: bool,
        wagon: bool,
        from: Option<&str>,
        owner: bool,
    ) -> Result<(), ApiError> {
        let mut fighters: Vec<Handle> = self
            .who(world::Who::Party, true)
            .into_iter()
            .map(Handle)
            .collect();
        let blades: Vec<String> = fighters.iter().map(|h| h.0.clone()).collect();
        let Some(anchor) = self.game_mut()?.anchor_or_first(from) else {
            return Err(error(
                ErrorCode::Internal,
                "The road scene has no anchor to place a card's fight at.",
            ));
        };
        let allies = if wagon {
            self.place_wagon_allies(owner)?
        } else {
            BTreeMap::new()
        };
        fighters.extend(allies.keys().cloned().map(Handle));
        let game = self.game_mut()?;
        let mut named = Vec::new();
        for monster in monsters {
            let stat = monster.stat();
            let handle = free_handle(game, stat);
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
        self.wagon_fight = wagon.then_some(WagonFight { blades, allies });
        let surprised = surprise.then_some(Side::Hostile);
        let result = self.game_mut()?.start_fight_surprised(&fighters, surprised);
        self.after_decision(result)
    }

    /// Places whoever rides with the wagon as allies (ENG-48, rules A2, A3 and A10), by handle.
    /// A team animal takes `<animal>_<wagon>_<n>`, a company entry its id, a roster person
    /// their id; one already in the scene joins as they stand, and one with no room is left out.
    fn place_wagon_allies(
        &mut self,
        owner: bool,
    ) -> Result<BTreeMap<String, WagonAllyOf>, ApiError> {
        let plan = self
            .campaign
            .as_ref()
            .map(|c| c.wagon_allies(owner))
            .unwrap_or_default();
        let mut allies = BTreeMap::new();
        let mut seen = Vec::new();
        for ally in plan {
            let game = self.game.as_mut().ok_or_else(no_scene)?;
            let first = game.anchor_or_first(None).unwrap_or_default();
            let (handle, of, placed) = match ally {
                campaign::WagonAlly::Animal { wagon, animal } => {
                    let base = format!("{animal}_{wagon}");
                    let k = 1 + seen.iter().filter(|b| **b == base).count();
                    seen.push(base.clone());
                    let handle = Handle(format!("{base}_{k}"));
                    let placed = if game.has_creature(&handle.0) {
                        if game.is_dead(&handle.0) {
                            continue;
                        }
                        game.make_ally(&handle.0)
                    } else {
                        game.place_ally(&handle, &animal, &first, None)
                    };
                    (handle.0, WagonAllyOf::Animal { wagon, animal }, placed)
                }
                campaign::WagonAlly::Beast {
                    id,
                    monster,
                    name,
                    at,
                    hurt,
                } => {
                    let placed = if game.has_creature(&id) {
                        game.make_ally(&id)
                    } else {
                        let at = game.anchor_or_first(at.as_deref()).unwrap_or_default();
                        game.place_ally(&Handle(id.clone()), &monster, &at, name.as_deref())
                    };
                    let of = WagonAllyOf::Entry {
                        id: id.clone(),
                        hurt,
                    };
                    (id, of, placed)
                }
                campaign::WagonAlly::Person {
                    person,
                    at,
                    hurt,
                    owner,
                } => {
                    let id = person.id.clone();
                    // One creature, never two (rule A10): a person a mention placed joins as
                    // they stand.
                    let placed = if game.has_creature(&id) {
                        game.make_ally(&id)
                    } else {
                        let at = game.anchor_or_first(at.as_deref()).unwrap_or_default();
                        game.place_npc(
                            &id,
                            &person.monster,
                            person.side,
                            &at,
                            &person.name,
                            &person.carries,
                            person.hp,
                        )
                        .and_then(|()| game.make_ally(&id))
                    };
                    if placed.is_ok() && !self.npcs_here.contains(&id) {
                        self.npcs_here.push(id.clone());
                        if let Some(campaign) = self.campaign.as_mut() {
                            campaign.met(&id);
                        }
                    }
                    let of = if owner {
                        WagonAllyOf::Owner { id: id.clone() }
                    } else {
                        WagonAllyOf::Entry {
                            id: id.clone(),
                            hurt,
                        }
                    };
                    (id, of, placed)
                }
            };
            match placed {
                Ok(()) => {
                    allies.insert(handle, of);
                }
                Err(e) => eprintln!("wagon fight: {handle} is not placed: {}", e.message),
            }
        }
        self.push_entries();
        Ok(allies)
    }
}

/// The card's wagon fight under way (ENG-48).
#[derive(Debug, Clone)]
pub(super) struct WagonFight {
    /// The Blades in the fight, in its order, downed ones included (rule A7)
    blades: Vec<String>,
    /// The allies that still live, by handle
    allies: BTreeMap<String, WagonAllyOf>,
}

/// What an ally of a wagon fight is, for its deeds (ENG-48).
#[derive(Debug, Clone)]
enum WagonAllyOf {
    /// A team animal of wagon `wagon`
    Animal { wagon: u32, animal: String },
    /// A company entry, animal or roster person
    Entry { id: String, hurt: bool },
    /// The caravan's NPC owner
    Owner { id: String },
}

/// The first free handle `<stat>_<n>` in the scene.
fn free_handle(game: &adapter::game::Game, stat: &str) -> Handle {
    (1..)
        .map(|n| Handle(format!("{stat}_{n}")))
        .find(|h| !game.has_creature(&h.0))
        .expect("some handle is free")
}

fn no_scene() -> ApiError {
    error(ErrorCode::NoScene, "No scene is loaded.")
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

/// The most characters an own move's words may hold (API-56).
const OWN_MOVE_MAX_CHARS: usize = 300;

/// A refused word on a card, on the wire.
fn card_rejected(e: world::CardError) -> ApiError {
    let reason = match &e {
        world::CardError::NoCard => RejectReason::NoCard,
        world::CardError::UnknownChoice(_) => RejectReason::UnknownChoice,
        world::CardError::NoSay(_) => RejectReason::NoSay,
        world::CardError::AlreadySpoke(_) => RejectReason::AlreadySpoke,
        world::CardError::WaitingFor(_) => RejectReason::WaitingForAdvice,
        world::CardError::OwnMoveTaken => RejectReason::OwnMoveTaken,
        world::CardError::BadOwnMove(_) => RejectReason::BadOwnMove,
    };
    rejected(reason, format!("{}.", capitalised(&e.to_string())))
}

fn capitalised(text: &str) -> String {
    let mut chars = text.chars();
    chars
        .next()
        .map(|c| c.to_uppercase().chain(chars).collect())
        .unwrap_or_default()
}
