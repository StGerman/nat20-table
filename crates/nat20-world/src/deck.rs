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
    /// The choice an NPC owner takes on a tie (caravan cards); the first tied choice when
    /// absent
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_pick: Option<String>,
    /// Two or three choices
    pub choices: Vec<Choice>,
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
    /// The card on the table, waiting for its decision
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending: Option<PendingCard>,
}

/// A drawn card waiting for its decision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingCard {
    /// The card id
    pub card: String,
    /// Each Blade's advice (caravan card) or vote (Blade card), by handle
    #[serde(default)]
    pub said: BTreeMap<String, String>,
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
    /// cards, zones that are a road zone or a place, `requires` that names a place, DCs
    /// on the ladder, a fight only last in its list, `add_card` that names a chained card, every chained card added by
    /// some choice, and no pile over [`MAX_PILE`] cards. Goods and stat blocks are the
    /// server's to check.
    pub fn validate(&self, map: &WorldMap) -> Result<(), DeckError> {
        let bad = |s: String| Err(DeckError(s));
        let zones: BTreeSet<&str> = map
            .roads
            .iter()
            .map(|r| r.zone.as_str())
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
            if let Some(place) = &card.requires
                && map.place(place).is_none()
            {
                return bad(format!("card {} requires unknown place {place}", card.id));
            }
            if !(2..=3).contains(&card.choices.len()) {
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
                    Effect::AddCard { card: next } => {
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
        if let Some(lost) = self
            .cards
            .iter()
            .find(|c| c.chained && !added.contains(c.id.as_str()))
        {
            return bad(format!("chained card {} is never added", lost.id));
        }
        Ok(())
    }

    fn in_play(&self, card: &Card, discovered: &BTreeSet<String>, state: &DeckState) -> bool {
        (!card.chained || state.added.contains(&card.id))
            && card
                .requires
                .as_ref()
                .is_none_or(|p| discovered.contains(p))
            && !state.gone.contains(&card.id)
    }

    /// The pile of a zone: the cards in play and not in the discard, in file order.
    pub fn pile<'a>(
        &'a self,
        zone: &str,
        when: When,
        discovered: &BTreeSet<String>,
        state: &DeckState,
    ) -> Vec<&'a Card> {
        self.cards
            .iter()
            .filter(|c| c.zone == zone && c.when == when)
            .filter(|c| self.in_play(c, discovered, state) && !state.discard.contains(&c.id))
            .collect()
    }

    /// Draws a card of `zone` and puts it on the table: one d100 roll on the pile. When the
    /// pile is empty the zone's discard is shuffled back first; a zone with no card in play
    /// draws nothing and rolls nothing. A card already on the table is never replaced.
    pub fn draw(
        &self,
        zone: &str,
        when: When,
        discovered: &BTreeSet<String>,
        state: &mut DeckState,
        dice: &mut impl WorldDice,
    ) -> Option<String> {
        if state.pending.is_some() {
            return None;
        }
        let mut pile = self.pile(zone, when, discovered, state);
        if pile.is_empty() {
            let back: Vec<String> = self
                .cards
                .iter()
                .filter(|c| c.zone == zone && c.when == when)
                .map(|c| c.id.clone())
                .collect();
            state.discard.retain(|id| !back.contains(id));
            pile = self.pile(zone, when, discovered, state);
        }
        if pile.is_empty() {
            return None;
        }
        let roll = dice.roll(DRAW_DIE, "road card");
        let index = ((roll - 1) as usize * pile.len()) / DRAW_DIE as usize;
        let card = pile[index];
        if card.once {
            state.gone.insert(card.id.clone());
        } else {
            state.discard.insert(card.id.clone());
        }
        state.pending = Some(PendingCard {
            card: card.id.clone(),
            said: BTreeMap::new(),
        });
        Some(card.id.clone())
    }

    /// A chained card joins the deck.
    pub fn add(&self, state: &mut DeckState, card: &str) {
        if self.card(card).is_some_and(|c| c.chained) {
            state.added.insert(card.to_string());
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
        if !card.choices.iter().any(|c| c.id == choice) {
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
            Some(resolve(card, choice, Decided::Owner))
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
        state.pending = None;
        let pick = card
            .choices
            .iter()
            .find(|c| c.owner_insists)
            .map(|c| c.id.clone())
            .or_else(|| card.owner_pick.clone())
            .unwrap_or_else(|| card.choices[0].id.clone());
        Some(resolve(card, &pick, Decided::Default))
    }
}

fn resolve(card: &Card, choice: &str, decided: Decided) -> Resolution {
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
        effects,
    }
}

/// Decides a card once every Blade has spoken, when the Blades decide it: a Blade card, or
/// a caravan card an NPC owns.
fn settle(card: &Card, pending: &PendingCard, table: &Table) -> Option<Resolution> {
    if table.blades.iter().any(|b| !pending.said.contains_key(b)) {
        return None;
    }
    if card.target == Target::Caravan {
        if matches!(table.owner, Owner::Player(_)) {
            return None;
        }
        if let Some(insist) = card.choices.iter().find(|c| c.owner_insists) {
            return Some(resolve(card, &insist.id, Decided::OwnerInsists));
        }
    }
    let mut counts: Vec<(&str, usize)> = card.choices.iter().map(|c| (c.id.as_str(), 0)).collect();
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
    if tied.len() == 1 {
        return Some(resolve(card, tied[0], Decided::Majority));
    }
    let human = table
        .tie_breaker
        .as_ref()
        .and_then(|h| pending.said.get(h))
        .filter(|c| card.target == Target::Blades && tied.contains(&c.as_str()));
    let pick = card.owner_pick.as_deref().filter(|p| tied.contains(p));
    let choice = human.map(String::as_str).or(pick).unwrap_or(tied[0]);
    Some(resolve(card, choice, Decided::Tie))
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
        d.cards[1].choices[0].effects[1] = Effect::AddCard { card: "mud".into() };
        assert!(d.validate(&map).unwrap_err().0.contains("not chained"));

        let mut d = deck();
        d.cards[0].zone = "sea".into();
        assert!(d.validate(&map).unwrap_err().0.contains("unknown zone sea"));

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
        let card = d.draw("fields", When::Road, &known(), &mut state, &mut dice);
        assert_eq!(card.as_deref(), Some("beggar"));
        assert_eq!(dice.asked(), &[(100, "road card".to_string())]);
        assert!(state.discard.contains("beggar"));
        // A card on the table is never replaced.
        assert_eq!(
            d.draw("fields", When::Road, &known(), &mut state, &mut dice),
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
            d.draw("fields", When::Road, &known(), &mut state, &mut dice)
                .as_deref(),
            Some("mud")
        );
        assert_eq!(state.discard, BTreeSet::from(["mud".to_string()]));
        state.pending = None;
        // The ruin's night card waits for the ruin; nothing else is in the hills.
        let mut none = ListDice::new([]);
        assert_eq!(
            d.draw("hills", When::Night, &known(), &mut state, &mut none),
            None
        );
        let mut found = known();
        found.insert("ruin".into());
        let mut dice = ListDice::new([100]);
        assert_eq!(
            d.draw("hills", When::Night, &found, &mut state, &mut dice)
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
        d.add(&mut state, "beggar_returns");
        assert!(state.added.contains("beggar_returns"));
    }

    #[test]
    fn an_npc_owner_follows_the_majority_unless_it_insists() {
        let mut d = deck();
        let table = npc_table();
        let mut state = DeckState {
            pending: Some(PendingCard {
                card: "mud".into(),
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
}
