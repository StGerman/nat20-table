//! The road event deck (API-43): cards drawn on every journey leg and every night in camp.
//!
//! A deck, not a table: each card belongs to a zone (a road's `zone`, or a place id for a
//! night in camp there), and the pile is every card of the zone that is in play. Places add
//! their cards once discovered (`requires`), a choice can put a chained card into the deck
//! (`add_card`), and a drawn card goes to the discard until the zone's pile runs dry, when
//! the discard is shuffled back. A `once` card leaves the game when drawn.
//!
//! A draw is one d100 roll on the pile in file order, so the server logs it as one world
//! roll with an id. The card offers 2 or 3 choices. Who decides follows the card's
//! `target` (Stas, 2026-11-02): a caravan card is the caravan owner's call after the Hired
//! Blades advise, and an NPC owner takes their majority; a Blade card is the Blades' vote.
//! The world returns the chosen choice's effects as data; the server runs them through
//! core (checks, fights, exhaustion, coin) and the world (cargo, time, chained cards).
//!
//! Deeds (Milestone 11, ENG-33, decision 0063): a choice can `remember` a deed, and a card or
//! a choice can ask for deeds (`if`) or for their absence (`unless`). A card whose
//! condition fails is not in the pile; a choice whose condition fails is not offered, and
//! the choices offered are fixed when the card goes on the table. Deeds are DM-only
//! bookkeeping: the players remember what they did through the story.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::{caravan::Owner, dice::WorldDice, map::WorldMap};

/// The die a draw rolls: card `i` of a pile of `n` takes the faces from `i * 100 / n + 1`.
pub const DRAW_DIE: u32 = 100;

/// The SRD DC ladder: the only DCs a card's check may use.
pub const DC_LADDER: [u32; 6] = [5, 10, 15, 20, 25, 30];

/// The most cards a zone may hold, so every card of a pile keeps at least one face of the
/// draw die.
pub const MAX_PILE: usize = DRAW_DIE as usize;

/// One deck file, `worlds/<id>/deck/<name>.json`. A world's deck is every file together.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeckFile {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The cards
    pub cards: Vec<Card>,
}

/// Who decides a card.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Target {
    /// The road, the wagons, the cargo: the owner's call after the Blades advise
    Caravan,
    /// The escort themselves: the Blades vote
    Blades,
}

/// When a card can be drawn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum When {
    /// After a journey leg on a road of the card's zone
    #[default]
    Road,
    /// After a night in camp on such a road, or in the place the zone names
    Night,
}

/// One card.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Card {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The id, in snake_case, unique in the world
    pub id: String,
    /// The zone: a road's `zone`, or a place id
    pub zone: String,
    /// When it can be drawn
    #[serde(default)]
    pub when: When,
    /// Who decides it
    pub target: Target,
    /// What the players read
    pub text: String,
    /// A place id: the card is in play only once the party has discovered it
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requires: Option<String>,
    /// The card starts outside the deck; an `add_card` effect puts it in
    #[serde(default)]
    pub chained: bool,
    /// The card leaves the game once drawn instead of going to the discard
    #[serde(default)]
    pub once: bool,
    /// Deeds the card needs: it is in the pile only when every one is remembered
    #[serde(default, rename = "if", skip_serializing_if = "Option::is_none")]
    pub if_deeds: Option<Deeds>,
    /// Deeds that keep the card out: it is in the pile only when none is remembered
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unless: Option<Deeds>,
    /// The choice an NPC owner takes on a tie (caravan cards); the first tied choice when
    /// absent or not offered
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_pick: Option<String>,
    /// Two or three choices in every case the conditions allow
    pub choices: Vec<Choice>,
}

/// One deed id, or a list of them, in a card's or a choice's `if` or `unless`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Deeds {
    /// One deed
    One(String),
    /// Several deeds
    All(Vec<String>),
}

impl Deeds {
    /// The deed ids.
    pub fn ids(&self) -> &[String] {
        match self {
            Deeds::One(id) => std::slice::from_ref(id),
            Deeds::All(ids) => ids,
        }
    }
}

/// A deed the world remembers: what the party did, who did it, and when.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Deed {
    /// The handles that voted for the choice, or rolled the check it sits under; the owner
    /// who called a caravan card; empty when nobody could speak
    #[serde(default)]
    pub by: Vec<String>,
    /// The day it was done
    pub day: u32,
    /// The contract it was done in: 1 for the first
    pub contract: u32,
}

/// The deeds remembered, by id. A deed done again keeps its first record.
pub type DeedBook = BTreeMap<String, Deed>;

/// Whether `if` and `unless` hold against the deeds remembered: every `if` deed is, and no
/// `unless` deed is.
fn holds(if_deeds: Option<&Deeds>, unless: Option<&Deeds>, known: &dyn Fn(&str) -> bool) -> bool {
    if_deeds.is_none_or(|d| d.ids().iter().all(|id| known(id)))
        && unless.is_none_or(|d| !d.ids().iter().any(|id| known(id)))
}

impl Card {
    /// Whether the card's own conditions hold.
    pub fn holds(&self, deeds: &DeedBook) -> bool {
        holds(self.if_deeds.as_ref(), self.unless.as_ref(), &|id| {
            deeds.contains_key(id)
        })
    }

    /// The choices offered against these deeds, in card order.
    pub fn offered(&self, deeds: &DeedBook) -> Vec<&Choice> {
        self.choices.iter().filter(|c| c.holds(deeds)).collect()
    }
}

impl Choice {
    /// Whether the choice's conditions hold.
    pub fn holds(&self, deeds: &DeedBook) -> bool {
        holds(self.if_deeds.as_ref(), self.unless.as_ref(), &|id| {
            deeds.contains_key(id)
        })
    }
}

/// One choice on a card.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Choice {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The id, unique on the card
    pub id: String,
    /// What the players read
    pub text: String,
    /// An NPC owner takes this choice whatever the advice (the merchant will not risk the
    /// cargo); the DM narrates why. At most one per card, caravan cards only
    #[serde(default)]
    pub owner_insists: bool,
    /// Deeds the choice needs: it is offered only when every one is remembered
    #[serde(default, rename = "if", skip_serializing_if = "Option::is_none")]
    pub if_deeds: Option<Deeds>,
    /// Deeds that keep the choice off the card: it is offered only when none is remembered
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unless: Option<Deeds>,
    /// What happens, in order
    #[serde(default)]
    pub effects: Vec<Effect>,
}

/// Who an effect touches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Who {
    /// Every party member
    Party,
    /// Every Hired Blade: the party less a player owner
    Blades,
    /// The caravan owner, when a player owns it; nobody when an NPC does
    Owner,
}

/// What a choice does. The world keeps cargo, time and the deck; the server runs the
/// rest through core.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "do", rename_all = "snake_case", deny_unknown_fields)]
pub enum Effect {
    /// A group check: everyone in `who` rolls through core; it succeeds when at least half
    /// of them succeed (SRD 5.1, Group Checks)
    Check {
        /// Who rolls
        who: Who,
        /// The ability (`strength` .. `charisma`): the skill's own
        ability: String,
        /// The skill, in snake_case
        skill: String,
        /// The DC, from the SRD DC ladder: 5, 10, 15, 20, 25 or 30
        dc: u32,
        /// What happens on a success
        #[serde(default)]
        success: Vec<Effect>,
        /// What happens on a failure
        #[serde(default)]
        failure: Vec<Effect>,
    },
    /// A fight: these stat blocks are placed hostile on the road and the fight starts. It
    /// comes last in its list
    Fight {
        /// Stat block ids, one per creature
        monsters: Vec<String>,
    },
    /// Everyone in `who` pays `copper` each to the world, as much as their purse holds
    Pay {
        /// Who pays
        who: Who,
        /// Copper pieces each
        copper: u32,
    },
    /// Everyone in `who` gets `copper` each from the world
    Gain {
        /// Who gets it
        who: Who,
        /// Copper pieces each
        copper: u32,
    },
    /// The caravan gains or loses units of a good; a loss takes what there is
    Cargo {
        /// The good id
        good: String,
        /// Units gained (positive) or lost (negative)
        change: i32,
    },
    /// Everyone in `who` gains Exhaustion levels, through core
    Exhaustion {
        /// Who
        who: Who,
        /// Levels each
        levels: u8,
    },
    /// Time lost: the clock and core's time move on, and the day's travel shrinks by as
    /// much
    Delay {
        /// Minutes lost
        minutes: u32,
    },
    /// A chained card joins the deck
    AddCard {
        /// The card id
        card: String,
        /// The card comes next (ENG-34): the next draw in its zone and moment takes it
        /// without a roll
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        soon: bool,
    },
    /// The world remembers a deed, with who did it and the day (ENG-33)
    Remember {
        /// The deed id, in snake_case
        deed: String,
    },
}

/// Why a deck is unusable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckError(pub String);

impl std::fmt::Display for DeckError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "bad deck: {}", self.0)
    }
}

impl std::error::Error for DeckError {}

/// A world's deck: every card of every deck file.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Deck {
    /// The cards, in file order (files by name)
    pub cards: Vec<Card>,
}

/// What changes in the deck.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct DeckState {
    /// Chained cards an `add_card` effect put into the deck
    #[serde(default)]
    pub added: BTreeSet<String>,
    /// Cards in the discard
    #[serde(default)]
    pub discard: BTreeSet<String>,
    /// `once` cards already drawn
    #[serde(default)]
    pub gone: BTreeSet<String>,
    /// Cards added with `soon`, in the order added: the next draw in a card's zone and
    /// moment takes the first of them without a roll (ENG-34)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub soon: Vec<String>,
    /// The card on the table, waiting for its decision
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending: Option<PendingCard>,
}

/// A drawn card waiting for its decision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingCard {
    /// The card id
    pub card: String,
    /// The choice ids offered, fixed when the card went on the table; empty means every
    /// choice of the card
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub choices: Vec<String>,
    /// Each Blade's advice (caravan card) or vote (Blade card), by handle
    #[serde(default)]
    pub said: BTreeMap<String, String>,
}

impl PendingCard {
    /// Whether `choice` is offered.
    pub fn offers(&self, choice: &str) -> bool {
        self.choices.is_empty() || self.choices.iter().any(|c| c == choice)
    }

    /// The card's choices offered, in card order.
    pub fn offered<'a>(&self, card: &'a Card) -> Vec<&'a Choice> {
        card.choices.iter().filter(|c| self.offers(&c.id)).collect()
    }
}

/// Who sits at the table for a card's decision.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Table {
    /// The caravan owner
    pub owner: Owner,
    /// The Hired Blades who can speak: party members, less a player owner, still alive
    pub blades: Vec<String>,
    /// The seat that breaks a tied Blade vote: the human's, when one plays
    pub tie_breaker: Option<String>,
}

/// How a card was decided.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Decided {
    /// The player owner chose, after the Blades' advice
    Owner,
    /// The majority of the Blades
    Majority,
    /// A tie, broken by the human seat or the card's `owner_pick`
    Tie,
    /// The NPC owner insisted on a choice
    OwnerInsists,
    /// Nobody could speak; the card's `owner_pick` or its first choice
    Default,
}

/// A card's decision.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolution {
    /// The card id
    pub card: String,
    /// The choice id
    pub choice: String,
    /// How it was decided
    pub decided: Decided,
    /// Who made the call: the Blades whose word was the choice, or the player owner who
    /// called it; empty when nobody could speak. A `remember` at the top of the choice
    /// records them
    pub by: Vec<String>,
    /// The choice's effects, for the server to run
    pub effects: Vec<Effect>,
}

/// Why a card choice was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CardError {
    /// No card is waiting
    NoCard,
    /// The card has no such choice
    UnknownChoice(String),
    /// The speaker has no say on this card
    NoSay(String),
    /// The speaker already spoke
    AlreadySpoke(String),
    /// The owner decides only after every Blade has advised; these still have to
    WaitingFor(Vec<String>),
}

impl std::fmt::Display for CardError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CardError::NoCard => write!(f, "no card is waiting for a decision"),
            CardError::UnknownChoice(c) => write!(f, "the card has no choice {c}"),
            CardError::NoSay(h) => write!(f, "{h} has no say on this card"),
            CardError::AlreadySpoke(h) => write!(f, "{h} has already spoken on this card"),
            CardError::WaitingFor(h) => {
                write!(
                    f,
                    "the owner decides after the Blades advise: waiting for {}",
                    h.join(", ")
                )
            }
        }
    }
}

impl std::error::Error for CardError {}

fn effects_of<'a>(effects: &'a [Effect], out: &mut Vec<&'a Effect>) {
    for effect in effects {
        out.push(effect);
        if let Effect::Check {
            success, failure, ..
        } = effect
        {
            effects_of(success, out);
            effects_of(failure, out);
        }
    }
}

impl Deck {
    /// A deck from its files, in the order given.
    pub fn from_files(files: impl IntoIterator<Item = DeckFile>) -> Self {
        Self {
            cards: files.into_iter().flat_map(|f| f.cards).collect(),
        }
    }

    /// The card with this id.
    pub fn card(&self, id: &str) -> Option<&Card> {
        self.cards.iter().find(|c| c.id == id)
    }

    /// Every effect on the card, nested ones included.
    pub fn effects(card: &Card) -> Vec<&Effect> {
        let mut out = Vec::new();
        for choice in &card.choices {
            effects_of(&choice.effects, &mut out);
        }
        out
    }

    /// Checks the deck against the map: unique ids, 2 or 3 choices with unique ids, an
    /// `owner_pick` that names a choice, at most one `owner_insists` and only on caravan
    /// cards, zones that are a road zone or a place (a road card's a road zone), `requires` that names a place, DCs
    /// on the ladder, a fight only last in its list, `add_card` that names a chained card, every chained card added by
    /// some choice, no pile over [`MAX_PILE`] cards, every deed a card or a choice reads
    /// written by some `remember`, and 2 or 3 choices offered in every case a card's
    /// conditions allow (ENG-33). Goods and stat blocks are the server's to check.
    pub fn validate(&self, map: &WorldMap) -> Result<(), DeckError> {
        let bad = |s: String| Err(DeckError(s));
        let road_zones: BTreeSet<&str> = map.roads.iter().map(|r| r.zone.as_str()).collect();
        let zones: BTreeSet<&str> = road_zones
            .iter()
            .copied()
            .chain(map.places.iter().map(|p| p.id.as_str()))
            .collect();
        let mut ids = BTreeSet::new();
        let mut piles: BTreeMap<(&str, When), usize> = BTreeMap::new();
        for card in &self.cards {
            if !ids.insert(card.id.as_str()) {
                return bad(format!("two cards with id {}", card.id));
            }
            if !zones.contains(card.zone.as_str()) {
                return bad(format!("card {} is in unknown zone {}", card.id, card.zone));
            }
            // Only a road's zone is drawn from after a leg; a place zone holds night cards.
            if card.when == When::Road && !road_zones.contains(card.zone.as_str()) {
                return bad(format!(
                    "road card {} is in {}, which is no road's zone",
                    card.id, card.zone
                ));
            }
            if let Some(place) = &card.requires
                && map.place(place).is_none()
            {
                return bad(format!("card {} requires unknown place {place}", card.id));
            }
            // A card may hold more choices than it offers, when deeds pick between them; the
            // cases are checked below. A card without conditions offers all of them.
            let conditional = card
                .choices
                .iter()
                .any(|c| c.if_deeds.is_some() || c.unless.is_some());
            if card.choices.len() < 2 || (!conditional && card.choices.len() > 3) {
                return bad(format!("card {} needs 2 or 3 choices", card.id));
            }
            let mut choices = BTreeSet::new();
            for choice in &card.choices {
                if !choices.insert(choice.id.as_str()) {
                    return bad(format!("card {} has two choices {}", card.id, choice.id));
                }
            }
            if let Some(pick) = &card.owner_pick
                && !choices.contains(pick.as_str())
            {
                return bad(format!(
                    "card {}'s owner_pick {pick} is not a choice",
                    card.id
                ));
            }
            let insists = card.choices.iter().filter(|c| c.owner_insists).count();
            if insists > 1 || (insists == 1 && card.target != Target::Caravan) {
                return bad(format!(
                    "card {}: owner_insists goes on one choice of a caravan card",
                    card.id
                ));
            }
            *piles.entry((card.zone.as_str(), card.when)).or_default() += 1;
        }
        if let Some(((zone, _), n)) = piles.iter().find(|(_, n)| **n > MAX_PILE) {
            return bad(format!("zone {zone} holds {n} cards, more than {MAX_PILE}"));
        }
        fn fight_last(effects: &[Effect]) -> bool {
            effects.iter().enumerate().all(|(i, e)| match e {
                Effect::Fight { .. } => i + 1 == effects.len(),
                Effect::Check {
                    success, failure, ..
                } => fight_last(success) && fight_last(failure),
                _ => true,
            })
        }
        if let Some(card) = self
            .cards
            .iter()
            .find(|c| !c.choices.iter().all(|ch| fight_last(&ch.effects)))
        {
            return bad(format!("card {}: a fight comes last in its list", card.id));
        }
        let mut added = BTreeSet::new();
        for card in &self.cards {
            for effect in Deck::effects(card) {
                match effect {
                    Effect::AddCard { card: next, .. } => {
                        match self.card(next) {
                            Some(c) if c.chained => {}
                            Some(_) => {
                                return bad(format!(
                                    "card {} adds {next}, which is not chained",
                                    card.id
                                ));
                            }
                            None => {
                                return bad(format!("card {} adds unknown card {next}", card.id));
                            }
                        }
                        added.insert(next.as_str());
                    }
                    Effect::Check { dc, .. } if !DC_LADDER.contains(dc) => {
                        return bad(format!("card {} has a DC {dc} off the ladder", card.id));
                    }
                    Effect::Fight { monsters } if monsters.is_empty() => {
                        return bad(format!("card {} starts a fight with nobody", card.id));
                    }
                    _ => {}
                }
            }
        }
        let written = self.deeds_written();
        for card in &self.cards {
            let reads = card
                .if_deeds
                .iter()
                .chain(&card.unless)
                .chain(
                    card.choices
                        .iter()
                        .flat_map(|c| c.if_deeds.iter().chain(&c.unless)),
                )
                .flat_map(Deeds::ids);
            for deed in reads {
                if !written.contains(deed.as_str()) {
                    return bad(format!(
                        "card {} reads deed {deed}, which nothing writes",
                        card.id
                    ));
                }
            }
            check_cases(card)?;
        }
        if let Some(lost) = self
            .cards
            .iter()
            .find(|c| c.chained && !added.contains(c.id.as_str()))
        {
            return bad(format!("chained card {} is never added", lost.id));
        }
        Ok(())
    }

    /// Every deed some choice of the deck can write.
    pub fn deeds_written(&self) -> BTreeSet<&str> {
        self.cards
            .iter()
            .flat_map(Deck::effects)
            .filter_map(|e| match e {
                Effect::Remember { deed } => Some(deed.as_str()),
                _ => None,
            })
            .collect()
    }

    fn in_play(
        &self,
        card: &Card,
        discovered: &BTreeSet<String>,
        deeds: &DeedBook,
        state: &DeckState,
    ) -> bool {
        (!card.chained || state.added.contains(&card.id))
            && card
                .requires
                .as_ref()
                .is_none_or(|p| discovered.contains(p))
            && !state.gone.contains(&card.id)
            && card.holds(deeds)
    }

    /// The pile of a zone: the cards in play and not in the discard, in file order. A card
    /// is in play once chained in, its place discovered, not gone, and its deeds hold.
    pub fn pile<'a>(
        &'a self,
        zone: &str,
        when: When,
        discovered: &BTreeSet<String>,
        deeds: &DeedBook,
        state: &DeckState,
    ) -> Vec<&'a Card> {
        self.cards
            .iter()
            .filter(|c| c.zone == zone && c.when == when)
            .filter(|c| self.in_play(c, discovered, deeds, state) && !state.discard.contains(&c.id))
            .collect()
    }

    /// Draws a card of `zone` and puts it on the table with the choices its deeds offer:
    /// one d100 roll on the pile. When the pile is empty the zone's discard is shuffled back
    /// first; a zone with no card in play draws nothing and rolls nothing. A card already on
    /// the table is never replaced.
    pub fn draw(
        &self,
        zone: &str,
        when: When,
        discovered: &BTreeSet<String>,
        deeds: &DeedBook,
        state: &mut DeckState,
        dice: &mut impl WorldDice,
    ) -> Option<String> {
        if state.pending.is_some() {
            return None;
        }
        // A soon card comes first, without a roll; one whose deeds or place do not hold yet
        // waits in the queue.
        let soon = state.soon.iter().position(|id| {
            self.card(id).is_some_and(|c| {
                c.zone == zone && c.when == when && self.in_play(c, discovered, deeds, state)
            })
        });
        if let Some(at) = soon {
            let id = state.soon.remove(at);
            let card = self.card(&id).expect("checked above");
            self.put_on_table(card, deeds, state);
            return Some(id);
        }
        let mut pile = self.pile(zone, when, discovered, deeds, state);
        if pile.is_empty() {
            let back: Vec<String> = self
                .cards
                .iter()
                .filter(|c| c.zone == zone && c.when == when)
                .map(|c| c.id.clone())
                .collect();
            state.discard.retain(|id| !back.contains(id));
            pile = self.pile(zone, when, discovered, deeds, state);
        }
        if pile.is_empty() {
            return None;
        }
        let roll = dice.roll(DRAW_DIE, "road card");
        let index = ((roll - 1) as usize * pile.len()) / DRAW_DIE as usize;
        let card = pile[index];
        self.put_on_table(card, deeds, state);
        Some(card.id.clone())
    }

    /// A drawn card goes on the table with the choices its deeds offer, and to the discard,
    /// or out of the game when it is `once`.
    fn put_on_table(&self, card: &Card, deeds: &DeedBook, state: &mut DeckState) {
        if card.once {
            state.gone.insert(card.id.clone());
        } else {
            state.discard.insert(card.id.clone());
        }
        state.pending = Some(PendingCard {
            card: card.id.clone(),
            choices: offered_ids(card, deeds),
            said: BTreeMap::new(),
        });
    }

    /// A chained card joins the deck; a `soon` one also joins the queue the next draw in its
    /// zone takes first.
    pub fn add(&self, state: &mut DeckState, card: &str, soon: bool) {
        if self.card(card).is_some_and(|c| c.chained) {
            state.added.insert(card.to_string());
            if soon && !state.soon.iter().any(|c| c == card) {
                state.soon.push(card.to_string());
            }
        }
    }

    /// One seat speaks on the card on the table: a Blade's advice or vote, or a player
    /// owner's call. Returns the decision once the card is settled, and takes the card off
    /// the table then.
    pub fn speak(
        &self,
        state: &mut DeckState,
        table: &Table,
        handle: &str,
        choice: &str,
    ) -> Result<Option<Resolution>, CardError> {
        let pending = state.pending.as_ref().ok_or(CardError::NoCard)?;
        let card = self.card(&pending.card).ok_or(CardError::NoCard)?;
        if !card.choices.iter().any(|c| c.id == choice) || !pending.offers(choice) {
            return Err(CardError::UnknownChoice(choice.to_string()));
        }
        let player_owner = matches!(&table.owner, Owner::Player(o) if o == handle);
        let blade = table.blades.iter().any(|b| b == handle);
        if pending.said.contains_key(handle) {
            return Err(CardError::AlreadySpoke(handle.to_string()));
        }
        let resolution = if player_owner && card.target == Target::Caravan {
            let missing: Vec<String> = table
                .blades
                .iter()
                .filter(|b| !pending.said.contains_key(*b))
                .cloned()
                .collect();
            if !missing.is_empty() {
                return Err(CardError::WaitingFor(missing));
            }
            Some(resolve(
                card,
                choice,
                Decided::Owner,
                vec![handle.to_string()],
            ))
        } else if blade {
            let pending = state.pending.as_mut().expect("checked above");
            pending.said.insert(handle.to_string(), choice.to_string());
            settle(card, pending, table)
        } else {
            return Err(CardError::NoSay(handle.to_string()));
        };
        if resolution.is_some() {
            state.pending = None;
        }
        Ok(resolution)
    }

    /// Settles the card on the table without anyone speaking, when nobody can: no Blade can
    /// speak and no player owns the caravan (or it is a Blade card). The choice is the one
    /// an NPC owner insists on, else `owner_pick`, else the first. Returns the decision and
    /// takes the card off the table then.
    pub fn settle_unattended(&self, state: &mut DeckState, table: &Table) -> Option<Resolution> {
        let pending = state.pending.as_ref()?;
        let card = self.card(&pending.card)?;
        let owner_decides =
            matches!(table.owner, Owner::Player(_)) && card.target == Target::Caravan;
        if !table.blades.is_empty() || owner_decides {
            return None;
        }
        let offered = pending.offered(card);
        let pick = offered
            .iter()
            .find(|c| c.owner_insists)
            .or_else(|| {
                offered
                    .iter()
                    .find(|c| card.owner_pick.as_deref() == Some(c.id.as_str()))
            })
            .or(offered.first())
            .map(|c| c.id.clone())?;
        state.pending = None;
        Some(resolve(card, &pick, Decided::Default, Vec::new()))
    }
}

fn resolve(card: &Card, choice: &str, decided: Decided, by: Vec<String>) -> Resolution {
    let effects = card
        .choices
        .iter()
        .find(|c| c.id == choice)
        .map(|c| c.effects.clone())
        .unwrap_or_default();
    Resolution {
        card: card.id.clone(),
        choice: choice.to_string(),
        decided,
        by,
        effects,
    }
}

/// The ids of the choices a card offers against these deeds; empty when it offers every
/// choice, as [`PendingCard::choices`] reads it.
fn offered_ids(card: &Card, deeds: &DeedBook) -> Vec<String> {
    let offered = card.offered(deeds);
    if offered.len() == card.choices.len() {
        return Vec::new();
    }
    offered.iter().map(|c| c.id.clone()).collect()
}

/// The most deeds the choices of one card may read, so the validator's cases stay few.
const MAX_CASE_DEEDS: usize = 10;

/// Checks that a card offers 2 or 3 choices in every case its own conditions allow: every
/// way the deeds its choices read can be remembered or not, with the card's `if` deeds
/// remembered and its `unless` deeds not.
fn check_cases(card: &Card) -> Result<(), DeckError> {
    let bad = |s: String| Err(DeckError(s));
    let must: BTreeSet<&str> = card
        .if_deeds
        .iter()
        .flat_map(Deeds::ids)
        .map(String::as_str)
        .collect();
    let never: BTreeSet<&str> = card
        .unless
        .iter()
        .flat_map(Deeds::ids)
        .map(String::as_str)
        .collect();
    if let Some(both) = must.intersection(&never).next() {
        return bad(format!(
            "card {} both needs and refuses deed {both}",
            card.id
        ));
    }
    let free: Vec<&str> = card
        .choices
        .iter()
        .flat_map(|c| c.if_deeds.iter().chain(&c.unless))
        .flat_map(Deeds::ids)
        .map(String::as_str)
        .filter(|d| !must.contains(d) && !never.contains(d))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if free.len() > MAX_CASE_DEEDS {
        return bad(format!(
            "card {}'s choices read {} deeds, more than {MAX_CASE_DEEDS}",
            card.id,
            free.len()
        ));
    }
    for mask in 0u32..(1 << free.len()) {
        let known = |id: &str| {
            must.contains(id)
                || free
                    .iter()
                    .position(|d| *d == id)
                    .is_some_and(|i| mask & (1 << i) != 0)
        };
        let offered = card
            .choices
            .iter()
            .filter(|c| holds(c.if_deeds.as_ref(), c.unless.as_ref(), &known))
            .count();
        if !(2..=3).contains(&offered) {
            let case: Vec<&str> = free
                .iter()
                .enumerate()
                .filter(|(i, _)| mask & (1 << i) != 0)
                .map(|(_, d)| *d)
                .collect();
            return bad(format!(
                "card {} offers {offered} choices when the deeds remembered are [{}]; it needs 2 or 3",
                card.id,
                case.join(", ")
            ));
        }
    }
    Ok(())
}

/// Decides a card once every Blade has spoken, when the Blades decide it: a Blade card, or
/// a caravan card an NPC owns. Only the choices offered count.
fn settle(card: &Card, pending: &PendingCard, table: &Table) -> Option<Resolution> {
    if table.blades.iter().any(|b| !pending.said.contains_key(b)) {
        return None;
    }
    let offered = pending.offered(card);
    let voters = |choice: &str| -> Vec<String> {
        table
            .blades
            .iter()
            .filter(|b| pending.said.get(*b).is_some_and(|c| c == choice))
            .cloned()
            .collect()
    };
    if card.target == Target::Caravan {
        if matches!(table.owner, Owner::Player(_)) {
            return None;
        }
        if let Some(insist) = offered.iter().find(|c| c.owner_insists) {
            return Some(resolve(
                card,
                &insist.id,
                Decided::OwnerInsists,
                voters(&insist.id),
            ));
        }
    }
    let mut counts: Vec<(&str, usize)> = offered.iter().map(|c| (c.id.as_str(), 0)).collect();
    for said in pending.said.values() {
        if let Some(count) = counts.iter_mut().find(|(id, _)| id == said) {
            count.1 += 1;
        }
    }
    let top = counts.iter().map(|(_, n)| *n).max().unwrap_or(0);
    let tied: Vec<&str> = counts
        .iter()
        .filter(|(_, n)| *n == top)
        .map(|(id, _)| *id)
        .collect();
    let first = *tied.first()?;
    if tied.len() == 1 {
        return Some(resolve(card, first, Decided::Majority, voters(first)));
    }
    let human = table
        .tie_breaker
        .as_ref()
        .and_then(|h| pending.said.get(h))
        .filter(|c| card.target == Target::Blades && tied.contains(&c.as_str()));
    let pick = card.owner_pick.as_deref().filter(|p| tied.contains(p));
    let choice = human.map(String::as_str).or(pick).unwrap_or(first);
    Some(resolve(card, choice, Decided::Tie, voters(choice)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{dice::ListDice, map::tests::small_map};

    fn deck() -> Deck {
        let file: DeckFile = serde_json::from_str(
            r#"{
              "cards": [
                {"id": "mud", "zone": "fields", "target": "caravan", "text": "A wheel sinks in mud.",
                 "owner_pick": "push",
                 "choices": [
                   {"id": "push", "text": "Push it out.", "effects": [
                     {"do": "check", "who": "blades", "ability": "strength", "skill": "athletics", "dc": 10,
                      "failure": [{"do": "delay", "minutes": 60}]}]},
                   {"id": "unload", "text": "Unload and reload.", "owner_insists": true,
                    "effects": [{"do": "delay", "minutes": 120}]}
                 ]},
                {"id": "beggar", "zone": "fields", "target": "blades", "text": "A beggar asks for bread.",
                 "choices": [
                   {"id": "give", "text": "Give a ration.", "effects": [{"do": "cargo", "good": "rations", "change": -1},
                     {"do": "add_card", "card": "beggar_returns"}]},
                   {"id": "refuse", "text": "Send him off."}
                 ]},
                {"id": "beggar_returns", "zone": "fields", "target": "blades", "chained": true, "once": true,
                 "text": "The beggar is back with news.",
                 "choices": [{"id": "listen", "text": "Listen."}, {"id": "leave", "text": "Leave."}]},
                {"id": "ruin_ghost", "zone": "hills", "when": "night", "target": "blades", "requires": "ruin",
                 "text": "Lights at the ruin.",
                 "choices": [{"id": "look", "text": "Look."}, {"id": "sleep", "text": "Sleep."}]}
              ]
            }"#,
        )
        .unwrap();
        Deck::from_files([file])
    }

    fn known() -> BTreeSet<String> {
        BTreeSet::from(["town".to_string(), "inn".to_string()])
    }

    fn npc_table() -> Table {
        Table {
            owner: Owner::Npc("tobin".into()),
            blades: vec!["bren".into(), "maren".into()],
            tie_breaker: Some("bren".into()),
        }
    }

    #[test]
    fn the_test_deck_validates() {
        deck().validate(&small_map()).unwrap();
    }

    #[test]
    fn the_validator_finds_broken_cards() {
        let map = small_map();
        let mut d = deck();
        d.cards[1].choices[0].effects[1] = Effect::AddCard {
            card: "mud".into(),
            soon: false,
        };
        assert!(d.validate(&map).unwrap_err().0.contains("not chained"));

        let mut d = deck();
        d.cards[0].zone = "sea".into();
        assert!(d.validate(&map).unwrap_err().0.contains("unknown zone sea"));

        let mut d = deck();
        let road = d.cards.iter().position(|c| c.when == When::Road).unwrap();
        d.cards[road].zone = "inn".into();
        assert!(d.validate(&map).unwrap_err().0.contains("no road's zone"));

        let mut d = deck();
        d.cards[1].choices[0].effects.pop();
        assert_eq!(
            d.validate(&map).unwrap_err().0,
            "chained card beggar_returns is never added"
        );

        let mut d = deck();
        d.cards[3].choices[0].owner_insists = true;
        assert!(d.validate(&map).unwrap_err().0.contains("owner_insists"));

        let mut d = deck();
        d.cards[0].choices.truncate(1);
        assert!(d.validate(&map).unwrap_err().0.contains("2 or 3 choices"));

        let mut d = deck();
        d.cards[1].choices[1].effects = vec![
            Effect::Fight {
                monsters: vec!["wolf".into()],
            },
            Effect::Delay { minutes: 10 },
        ];
        assert!(d.validate(&map).unwrap_err().0.contains("fight comes last"));

        let mut d = deck();
        if let Effect::Check { dc, .. } = &mut d.cards[0].choices[0].effects[0] {
            *dc = 12;
        }
        assert!(d.validate(&map).unwrap_err().0.contains("off the ladder"));
    }

    #[test]
    fn a_draw_rolls_d100_on_the_pile_in_file_order() {
        let d = deck();
        let mut state = DeckState::default();
        // Two cards in play in `fields`: faces 1-50 take mud, 51-100 the beggar.
        let mut dice = ListDice::new([51]);
        let card = d.draw(
            "fields",
            When::Road,
            &known(),
            &DeedBook::new(),
            &mut state,
            &mut dice,
        );
        assert_eq!(card.as_deref(), Some("beggar"));
        assert_eq!(dice.asked(), &[(100, "road card".to_string())]);
        assert!(state.discard.contains("beggar"));
        // A card on the table is never replaced.
        assert_eq!(
            d.draw(
                "fields",
                When::Road,
                &known(),
                &DeedBook::new(),
                &mut state,
                &mut dice
            ),
            None
        );
    }

    #[test]
    fn an_empty_pile_reshuffles_and_a_zone_without_cards_rolls_nothing() {
        let d = deck();
        let mut state = DeckState {
            discard: BTreeSet::from(["mud".into(), "beggar".into()]),
            ..DeckState::default()
        };
        let mut dice = ListDice::new([1]);
        assert_eq!(
            d.draw(
                "fields",
                When::Road,
                &known(),
                &DeedBook::new(),
                &mut state,
                &mut dice
            )
            .as_deref(),
            Some("mud")
        );
        assert_eq!(state.discard, BTreeSet::from(["mud".to_string()]));
        state.pending = None;
        // The ruin's night card waits for the ruin; nothing else is in the hills.
        let mut none = ListDice::new([]);
        assert_eq!(
            d.draw(
                "hills",
                When::Night,
                &known(),
                &DeedBook::new(),
                &mut state,
                &mut none
            ),
            None
        );
        let mut found = known();
        found.insert("ruin".into());
        let mut dice = ListDice::new([100]);
        assert_eq!(
            d.draw(
                "hills",
                When::Night,
                &found,
                &DeedBook::new(),
                &mut state,
                &mut dice
            )
            .as_deref(),
            Some("ruin_ghost")
        );
    }

    #[test]
    fn blades_vote_and_the_human_breaks_a_tie() {
        let d = deck();
        let mut state = DeckState {
            pending: Some(PendingCard {
                card: "beggar".into(),
                choices: Vec::new(),
                said: BTreeMap::new(),
            }),
            ..DeckState::default()
        };
        let table = npc_table();
        assert_eq!(d.speak(&mut state, &table, "maren", "give").unwrap(), None);
        assert_eq!(
            d.speak(&mut state, &table, "maren", "refuse"),
            Err(CardError::AlreadySpoke("maren".into()))
        );
        let done = d
            .speak(&mut state, &table, "bren", "refuse")
            .unwrap()
            .unwrap();
        assert_eq!(
            (done.choice.as_str(), done.decided),
            ("refuse", Decided::Tie)
        );
        assert!(state.pending.is_none());
        // A chained card joins the deck.
        d.add(&mut state, "beggar_returns", false);
        assert!(state.added.contains("beggar_returns"));
    }

    #[test]
    fn an_npc_owner_follows_the_majority_unless_it_insists() {
        let mut d = deck();
        let table = npc_table();
        let mut state = DeckState {
            pending: Some(PendingCard {
                card: "mud".into(),
                choices: Vec::new(),
                said: BTreeMap::new(),
            }),
            ..DeckState::default()
        };
        d.speak(&mut state, &table, "bren", "push").unwrap();
        let done = d
            .speak(&mut state, &table, "maren", "push")
            .unwrap()
            .unwrap();
        assert_eq!(
            (done.choice.as_str(), done.decided),
            ("unload", Decided::OwnerInsists)
        );

        d.cards[0].choices[1].owner_insists = false;
        let mut state = DeckState {
            pending: Some(PendingCard {
                card: "mud".into(),
                choices: Vec::new(),
                said: BTreeMap::new(),
            }),
            ..DeckState::default()
        };
        d.speak(&mut state, &table, "bren", "unload").unwrap();
        let done = d
            .speak(&mut state, &table, "maren", "push")
            .unwrap()
            .unwrap();
        // The human seat breaks Blade votes only; the owner's pick breaks this tie.
        assert_eq!((done.choice.as_str(), done.decided), ("push", Decided::Tie));
        assert!(matches!(done.effects[0], Effect::Check { dc: 10, .. }));
    }

    #[test]
    fn a_player_owner_decides_after_every_blade_advises() {
        let d = deck();
        let table = Table {
            owner: Owner::Player("ilsa".into()),
            blades: vec!["bren".into(), "maren".into()],
            tie_breaker: None,
        };
        let mut state = DeckState {
            pending: Some(PendingCard {
                card: "mud".into(),
                choices: Vec::new(),
                said: BTreeMap::new(),
            }),
            ..DeckState::default()
        };
        d.speak(&mut state, &table, "bren", "push").unwrap();
        assert_eq!(
            d.speak(&mut state, &table, "ilsa", "unload"),
            Err(CardError::WaitingFor(vec!["maren".into()]))
        );
        assert_eq!(d.speak(&mut state, &table, "maren", "push").unwrap(), None);
        let done = d
            .speak(&mut state, &table, "ilsa", "unload")
            .unwrap()
            .unwrap();
        assert_eq!(
            (done.choice.as_str(), done.decided),
            ("unload", Decided::Owner)
        );
        assert_eq!(
            d.speak(&mut state, &table, "ilsa", "unload"),
            Err(CardError::NoCard)
        );
    }

    #[test]
    fn strangers_and_unknown_choices_are_refused() {
        let d = deck();
        let mut state = DeckState {
            pending: Some(PendingCard {
                card: "beggar".into(),
                choices: Vec::new(),
                said: BTreeMap::new(),
            }),
            ..DeckState::default()
        };
        let table = npc_table();
        assert_eq!(
            d.speak(&mut state, &table, "goblin", "give"),
            Err(CardError::NoSay("goblin".into()))
        );
        assert_eq!(
            d.speak(&mut state, &table, "bren", "dance"),
            Err(CardError::UnknownChoice("dance".into()))
        );
    }

    #[test]
    fn a_card_nobody_can_speak_on_takes_the_default() {
        let d = deck();
        let table = Table {
            owner: Owner::Npc("tobin".into()),
            blades: vec![],
            tie_breaker: None,
        };
        let mut state = DeckState {
            pending: Some(PendingCard {
                card: "mud".into(),
                choices: Vec::new(),
                said: BTreeMap::new(),
            }),
            ..DeckState::default()
        };
        let done = d.settle_unattended(&mut state, &table).unwrap();
        assert_eq!(
            (done.choice.as_str(), done.decided),
            ("unload", Decided::Default)
        );
    }

    fn deed_deck() -> Deck {
        let file: DeckFile = serde_json::from_str(
            r#"{
              "cards": [
                {"id": "bridge", "zone": "fields", "target": "blades", "text": "A toll bridge.",
                 "choices": [
                   {"id": "pay", "text": "Pay.", "effects": [{"do": "remember", "deed": "paid"}]},
                   {"id": "fight", "text": "Fight.", "effects": [{"do": "remember", "deed": "fought"}]}
                 ]},
                {"id": "bridge_again", "zone": "fields", "target": "blades", "text": "The bridge again.",
                 "if": "paid", "unless": ["fought"],
                 "choices": [
                   {"id": "pay_again", "text": "Pay again.", "unless": "angry"},
                   {"id": "shout", "text": "Shout.", "if": "angry"},
                   {"id": "say_no", "text": "Say no.", "effects": [{"do": "remember", "deed": "angry"}]},
                   {"id": "ford", "text": "Ford the beck."}
                 ]}
              ]
            }"#,
        )
        .unwrap();
        Deck::from_files([file])
    }

    fn book(ids: &[&str]) -> DeedBook {
        ids.iter()
            .map(|id| {
                (
                    id.to_string(),
                    Deed {
                        by: vec![],
                        day: 1,
                        contract: 1,
                    },
                )
            })
            .collect()
    }

    #[test]
    fn deeds_put_cards_in_the_pile_and_choices_on_the_card() {
        let d = deed_deck();
        d.validate(&small_map()).unwrap();
        let ids = |deeds: &DeedBook| -> Vec<String> {
            d.pile("fields", When::Road, &known(), deeds, &DeckState::default())
                .iter()
                .map(|c| c.id.clone())
                .collect()
        };
        assert_eq!(ids(&book(&[])), ["bridge"]);
        assert_eq!(ids(&book(&["paid"])), ["bridge", "bridge_again"]);
        assert_eq!(ids(&book(&["paid", "fought"])), ["bridge"]);

        // Faces 51-100 take the second card; its choices are fixed on the table.
        let mut state = DeckState {
            discard: BTreeSet::from(["bridge".into()]),
            ..DeckState::default()
        };
        let mut dice = ListDice::new([1]);
        let deeds = book(&["paid", "angry"]);
        let card = d.draw(
            "fields",
            When::Road,
            &known(),
            &deeds,
            &mut state,
            &mut dice,
        );
        assert_eq!(card.as_deref(), Some("bridge_again"));
        let pending = state.pending.as_ref().unwrap();
        assert_eq!(pending.choices, ["shout", "say_no", "ford"]);

        let table = npc_table();
        assert_eq!(
            d.speak(&mut state, &table, "bren", "pay_again"),
            Err(CardError::UnknownChoice("pay_again".into()))
        );
        d.speak(&mut state, &table, "bren", "shout").unwrap();
        let done = d
            .speak(&mut state, &table, "maren", "ford")
            .unwrap()
            .unwrap();
        // A tie with no human vote among the tied and no owner pick: the first offered.
        assert_eq!(
            (done.choice.as_str(), done.decided),
            ("shout", Decided::Tie)
        );
        assert_eq!(done.by, ["bren"]);
    }

    #[test]
    fn a_decision_says_who_made_it() {
        let d = deck();
        let table = npc_table();
        let mut state = DeckState {
            pending: Some(PendingCard {
                card: "beggar".into(),
                choices: Vec::new(),
                said: BTreeMap::new(),
            }),
            ..DeckState::default()
        };
        d.speak(&mut state, &table, "bren", "give").unwrap();
        let done = d
            .speak(&mut state, &table, "maren", "give")
            .unwrap()
            .unwrap();
        assert_eq!(done.decided, Decided::Majority);
        assert_eq!(done.by, ["bren", "maren"]);
    }

    #[test]
    fn the_validator_checks_deeds_and_every_case() {
        let map = small_map();
        let mut d = deed_deck();
        d.cards[0].choices[0].effects.clear();
        assert_eq!(
            d.validate(&map).unwrap_err().0,
            "card bridge_again reads deed paid, which nothing writes"
        );

        // Without `say_no`, a party that is not angry has only two choices left, and an
        // angry one too: still fine. Without `ford` as well, one choice is left.
        let mut d = deed_deck();
        d.cards[1].choices.retain(|c| c.id != "say_no");
        d.cards[0].choices[1].effects.push(Effect::Remember {
            deed: "angry".into(),
        });
        d.validate(&map).unwrap();
        d.cards[1].choices.retain(|c| c.id != "ford");
        assert_eq!(
            d.validate(&map).unwrap_err().0,
            "card bridge_again offers 1 choices when the deeds remembered are []; it needs 2 or 3"
        );

        // Four choices that are all offered at once are too many.
        let mut d = deed_deck();
        d.cards[1].choices[1].if_deeds = None;
        d.cards[1].choices[0].unless = None;
        assert!(d.validate(&map).unwrap_err().0.contains("2 or 3 choices"));

        let mut d = deed_deck();
        d.cards[1].unless = Some(Deeds::One("paid".into()));
        assert!(
            d.validate(&map)
                .unwrap_err()
                .0
                .contains("both needs and refuses")
        );
    }

    #[test]
    fn a_card_reads_deeds_from_json_as_one_or_a_list() {
        let card = &deed_deck().cards[1];
        assert_eq!(card.if_deeds, Some(Deeds::One("paid".into())));
        assert_eq!(card.unless, Some(Deeds::All(vec!["fought".into()])));
        let back = serde_json::to_value(card).unwrap();
        assert_eq!(back["if"], "paid");
        assert_eq!(back["unless"][0], "fought");
    }

    #[test]
    fn a_soon_card_comes_next_without_a_roll() {
        let d = deck();
        let mut state = DeckState::default();
        d.add(&mut state, "beggar_returns", true);
        d.add(&mut state, "beggar_returns", true);
        assert_eq!(state.soon, ["beggar_returns"]);
        // Not at night: the queue waits for its own zone and moment.
        let mut none = ListDice::new([]);
        assert_eq!(
            d.draw(
                "fields",
                When::Night,
                &known(),
                &DeedBook::new(),
                &mut state,
                &mut none
            ),
            None
        );
        let card = d.draw(
            "fields",
            When::Road,
            &known(),
            &DeedBook::new(),
            &mut state,
            &mut none,
        );
        assert_eq!(card.as_deref(), Some("beggar_returns"));
        assert!(none.asked().is_empty(), "no roll for a soon card");
        assert!(state.soon.is_empty());
        assert!(state.gone.contains("beggar_returns"));
        // The next draw rolls on the pile as usual.
        state.pending = None;
        let mut dice = ListDice::new([1]);
        let card = d.draw(
            "fields",
            When::Road,
            &known(),
            &DeedBook::new(),
            &mut state,
            &mut dice,
        );
        assert_eq!(card.as_deref(), Some("mud"));
    }
}
