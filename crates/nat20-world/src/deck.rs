//! The road event deck (API-43): cards drawn on every journey leg and every night in camp.
//!
//! A deck, not a table: each card belongs to a zone (a road's `zone`, or a place id for a
//! night in camp there), and the pile is every card of the zone that is in play. Places add
//! their cards once discovered (`requires`), a choice can put a chained card into the deck
//! (`add_card`), and a drawn card goes to the discard until the zone's pile runs dry, when
//! the discard is shuffled back. A `once` card leaves the game when drawn.
//!
//! A draw is one d100 roll on the pile in file order for each card it takes, so the server
//! logs each as a world roll with an id: a pile of one puts its card on the table, and a
//! bigger pile offers two or three cards, rolled without putting one back, for the DM's pick
//! (API-53). The card offers 2 or 3 choices. Who decides follows the card's
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

use crate::{caravan::Owner, customs::CustomsFile, dice::WorldDice, map::WorldMap};

/// The die a draw rolls: card `i` of a pile of `n` takes the faces from `i * 100 / n + 1`.
pub const DRAW_DIE: u32 = 100;

/// The SRD DC ladder: the only DCs a card's check may use.
pub const DC_LADDER: [u32; 6] = [5, 10, 15, 20, 25, 30];

/// The most cards a zone may hold, so every card of a pile keeps at least one face of the
/// draw die.
pub const MAX_PILE: usize = DRAW_DIE as usize;

/// The condition a forewarned choice reads (API-54): true for one draw when the scout's
/// check succeeds. It is not a deed: nothing remembers it, and no card asks for it.
pub const SCOUTED: &str = "scouted";

/// The choice id of a seat's own move on the card on the table (API-56): reserved, so no deck
/// file may use it.
pub const OWN_MOVE: &str = "own_move";

/// The deed an own move writes when the card is decided on it (API-56): `own_move_<card>`.
pub fn own_move_deed(card: &str) -> String {
    format!("{OWN_MOVE}_{card}")
}

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
    /// When a journey leg ends at the place the zone names, once its scene has loaded
    /// (ENG-35): the place's pay-offs
    Arrival,
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
    /// What the players read in a Russian run (MAP-19, decision 0067); the table reads it from
    /// the deck file, so it is never projected
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_ru: Option<String>,
    /// A place id: the card is in play only once the party has discovered it
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requires: Option<String>,
    /// The card starts outside the deck; an `add_card` effect puts it in
    #[serde(default)]
    pub chained: bool,
    /// The card leaves the game once drawn instead of going to the discard: `true` for the
    /// world (gone for every later contract too), `"contract"` for the rest of the contract
    /// only (ENG-37, decision 0063 Q1)
    #[serde(default, skip_serializing_if = "Once::is_never")]
    pub once: Once,
    /// Deeds the card needs: it is in the pile only when every one is remembered
    #[serde(default, rename = "if", skip_serializing_if = "Option::is_none")]
    pub if_deeds: Option<Deeds>,
    /// Deeds that keep the card out: it is in the pile only when none is remembered
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unless: Option<Deeds>,
    /// The choice an NPC owner takes on a tie or with nobody to speak: one id, or ids in the
    /// owner's order of preference (MAP-18); the first one offered (or tied) is taken, and one
    /// of them is offered in every case
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_pick: Option<OwnerPick>,
    /// Two or three choices in every case the conditions allow
    pub choices: Vec<Choice>,
    /// What only the DM reads: the card's one oddity, voiced at every meeting (API-53)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// The skill the scout checks with when the card is drawn after a leg (API-54): a card
    /// with something to find ahead; none for a card with nothing to find
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scout: Option<ScoutSkill>,
}

/// What the scout looks for (API-54), from the SRD 5.2.1 Search table: Wisdom (Perception)
/// finds a concealed creature or object, Wisdom (Survival) finds tracks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScoutSkill {
    /// A creature or a person waiting on the road
    Perception,
    /// Tracks, a trail or a hazard
    Survival,
}

/// How long a drawn card stays out of the game.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Once {
    /// `true`: gone for the world; `false` (the default): back to the discard
    Flag(bool),
    /// `"contract"`: gone for the rest of the contract, back when the next one starts
    Scope(OnceScope),
}

/// The one word `once` takes besides `true` and `false`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnceScope {
    /// For the rest of the contract
    Contract,
}

impl Once {
    /// Gone for the world once drawn.
    pub const WORLD: Once = Once::Flag(true);
    /// Gone for the rest of the contract once drawn.
    pub const CONTRACT: Once = Once::Scope(OnceScope::Contract);

    fn is_never(&self) -> bool {
        *self == Once::Flag(false)
    }
}

impl Default for Once {
    fn default() -> Self {
        Once::Flag(false)
    }
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

/// A card's `owner_pick`: one choice id, or several in the owner's order (MAP-18).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OwnerPick {
    /// One choice
    One(String),
    /// Choices in the owner's order: the first one offered is taken
    Order(Vec<String>),
}

impl OwnerPick {
    /// The choice ids, in the owner's order.
    pub fn ids(&self) -> &[String] {
        match self {
            OwnerPick::One(id) => std::slice::from_ref(id),
            OwnerPick::Order(ids) => ids,
        }
    }

    /// The owner's choice among the ids `there` admits: the first in the owner's order.
    pub fn among(&self, there: impl Fn(&str) -> bool) -> Option<&str> {
        self.ids().iter().map(String::as_str).find(|id| there(id))
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
    /// What the players read in a Russian run (MAP-19), as on the card
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_ru: Option<String>,
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
    /// The customs taking it keeps, by id from the world's `customs.json` (ENG-39): the DM
    /// narrates who reacts, never a verdict
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub keeps: Vec<String>,
    /// The customs taking it breaks, by id from the world's `customs.json` (ENG-39)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub breaks: Vec<String>,
    /// The card's own question or plea (MAP-18): a card with one keeps it offered in every
    /// case its conditions allow; a variant may add to it, never replace it
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub asked: bool,
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
        /// One per creature: a stat block id, or `{"stat", "npc"}` for a creature who is an
        /// NPC of the story (ENG-36): its death writes the deed `killed_<npc>`
        monsters: Vec<Monster>,
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

/// One creature of a card's fight.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Monster {
    /// A stat block id
    Stat(String),
    /// A stat block that is an NPC of the story
    Npc {
        /// The stat block id
        stat: String,
        /// The NPC's id, in snake_case: the deed `killed_<npc>` is written when it dies
        npc: String,
    },
}

impl Monster {
    /// The stat block id.
    pub fn stat(&self) -> &str {
        match self {
            Monster::Stat(stat) | Monster::Npc { stat, .. } => stat,
        }
    }

    /// The NPC it is, if any.
    pub fn npc(&self) -> Option<&str> {
        match self {
            Monster::Stat(_) => None,
            Monster::Npc { npc, .. } => Some(npc),
        }
    }
}

/// The deed a named NPC's death writes (ENG-36).
pub fn killed_deed(npc: &str) -> String {
    format!("killed_{npc}")
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

/// Why a pick was refused (API-53).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PickError {
    /// No draw is waiting for a pick
    NothingOffered,
    /// The card is not one of the offered
    NotOffered(String),
}

impl std::fmt::Display for PickError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NothingOffered => write!(f, "no cards are offered for a pick"),
            Self::NotOffered(card) => write!(f, "{card} is not one of the cards offered"),
        }
    }
}

impl std::error::Error for PickError {}

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
    /// `once` cards already drawn: gone for the world
    #[serde(default)]
    pub gone: BTreeSet<String>,
    /// `once: "contract"` cards drawn in the contract under way: back when the next starts
    /// (ENG-37)
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    pub gone_for_contract: BTreeSet<String>,
    /// Cards added with `soon`, in the order added: the next draw in a card's zone and
    /// moment takes the first of them without a roll (ENG-34)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub soon: Vec<String>,
    /// The cards a draw offered the DM, in roll order, waiting for a pick (API-53): still in
    /// the pile, not yet on the table
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub offered: Vec<String>,
    /// The card on the table, waiting for its decision
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending: Option<PendingCard>,
    /// The road whose leg drew the cards offered or on the table (API-54): its terrain sets
    /// the scout's DC; none after a night or an arrival draw
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub road: Option<String>,
}

impl DeckState {
    /// Whether a card waits: offered for a pick, or on the table for its decision.
    pub fn waiting(&self) -> bool {
        self.pending.is_some() || !self.offered.is_empty()
    }
}

/// What a draw did (API-53).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Drawn {
    /// A card went on the table without a pick: a soon card, or a pile of one
    Table {
        /// The card id
        card: String,
        /// It came from the soon queue
        soon: bool,
    },
    /// Two or three cards are offered for the DM's pick, in roll order
    Offered(Vec<String>),
}

impl Drawn {
    /// The card that went on the table, when no pick is needed.
    pub fn table(&self) -> Option<&str> {
        match self {
            Self::Table { card, .. } => Some(card),
            Self::Offered(_) => None,
        }
    }
}

/// The most cards one draw offers (API-53, deck doc change 13).
pub const MAX_OFFERED: usize = 3;

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
    /// A seat's own move on the card (API-56): the choice [`OWN_MOVE`], offered last
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub own_move: Option<OwnMove>,
}

/// A seat's own words on the card on the table, turned by the DM into a ladder check that
/// brings one of the card's offered choices on a success and, when one is named, another on
/// a failure (API-56, decision 0079).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OwnMove {
    /// The seat whose words they are
    pub actor: String,
    /// The words, as said
    pub text: String,
    /// The check's ability (`strength` .. `charisma`): the skill's own
    pub ability: String,
    /// The check's skill, in snake_case
    pub skill: String,
    /// The DC, from the SRD DC ladder
    pub dc: u32,
    /// The choice a success brings
    pub success: String,
    /// The choice a failure brings; none when no choice fits, and a fall runs no choice
    /// (decision 0079)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<String>,
    /// The move fell (decision 0079): it is no longer offered, and the card waits for a
    /// written choice. One own move per card, tried or not
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub spent: bool,
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

    /// The ids a seat may name: the offered choices in card order, then the own move once
    /// the card has one that has not fallen, so a tie broken by order never falls to it.
    pub fn speakable(&self, card: &Card) -> Vec<String> {
        let mut ids: Vec<String> = self.offered(card).iter().map(|c| c.id.clone()).collect();
        if self.own_move.as_ref().is_some_and(|mv| !mv.spent) {
            ids.push(OWN_MOVE.to_owned());
        }
        ids
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
    /// The choice's effects, for the server to run; empty for an own move, whose branches
    /// are in `own_move`
    pub effects: Vec<Effect>,
    /// The card was decided on its own move (API-56): the proposer's check and the two
    /// branches; the server rolls and runs one. For a move with no failure the card is still
    /// on the table: the server ends it with [`Deck::own_move_won`] or [`Deck::own_move_fell`]
    pub own_move: Option<OwnMoveRun>,
}

impl Resolution {
    /// Whether the decision is an own move with no failure (decision 0079): its roll comes
    /// before the card leaves the table, and the server ends it with [`Deck::own_move_won`] or
    /// [`Deck::own_move_fell`].
    pub fn rolls_first(&self) -> bool {
        self.own_move
            .as_ref()
            .is_some_and(|run| run.mv.failure.is_none())
    }
}

/// An own move to run (API-56): the server rolls the proposer's check through core and runs
/// one branch with the resolution's `by`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OwnMoveRun {
    /// The move: who rolls (the seat whose words it was) and the check
    pub mv: OwnMove,
    /// The effects of `mv.success`'s choice, after `remember own_move_<card>`
    pub success: Vec<Effect>,
    /// The effects of `mv.failure`'s choice, after `remember own_move_<card>`; with no
    /// failure named, the fall's part: `remember own_move_<card>` alone (decision 0079)
    pub failure: Vec<Effect>,
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
    /// The card already carries an own move (API-56)
    OwnMoveTaken,
    /// An own move's success and failure are the same choice, or its failure breaks a custom
    BadOwnMove(String),
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
            CardError::OwnMoveTaken => write!(f, "the card already has an own move"),
            CardError::BadOwnMove(why) => write!(f, "{why}"),
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
    /// some choice, no pile over [`MAX_PILE`] cards, and 2 or 3 choices offered in every case a
    /// card's conditions allow (ENG-33), counting [`SCOUTED`] as a case, with one of its `asked`
    /// choices and one of its `owner_pick` among them (MAP-18); `scouted` read only by
    /// a choice and never remembered, and a `scout` skill only on a road card (API-54), and
    /// then with exactly one choice under `if: "scouted"`, which no other card has; and two of
    /// the five card tests (MAP-11): every choice has an effect (a `remember` counts), and no two
    /// choices offered together have the same effects. Goods and stat blocks are the server's to check; that
    /// every deed read is written is [`Deck::check_deeds_written`]'s.
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
            if card.when == When::Arrival && map.place(&card.zone).is_none() {
                return bad(format!(
                    "arrival card {} is in {}, which is no place",
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
                if choice.id == OWN_MOVE {
                    return bad(format!(
                        "card {} has a choice {OWN_MOVE}, which is reserved for a seat's own move",
                        card.id
                    ));
                }
                if !choices.insert(choice.id.as_str()) {
                    return bad(format!("card {} has two choices {}", card.id, choice.id));
                }
            }
            let picks = card.owner_pick.iter().flat_map(OwnerPick::ids);
            if let Some(pick) = picks.clone().find(|p| !choices.contains(p.as_str())) {
                return bad(format!(
                    "card {}'s owner_pick {pick} is not a choice",
                    card.id
                ));
            }
            let named: BTreeSet<&String> = picks.clone().collect();
            if card.owner_pick.is_some() && (named.is_empty() || named.len() < picks.count()) {
                return bad(format!(
                    "card {}'s owner_pick names no choice, or one twice",
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
        for card in &self.cards {
            // `scouted` holds for one draw only: a choice reads it, a card never does, and
            // nothing remembers it (API-54).
            if card
                .if_deeds
                .iter()
                .chain(&card.unless)
                .flat_map(Deeds::ids)
                .any(|d| d == SCOUTED)
            {
                return bad(format!(
                    "card {} reads {SCOUTED}, which only a choice may read",
                    card.id
                ));
            }
            if Deck::effects(card)
                .iter()
                .any(|e| matches!(e, Effect::Remember { deed } if deed == SCOUTED))
            {
                return bad(format!(
                    "card {} remembers {SCOUTED}, which is not a deed",
                    card.id
                ));
            }
            if card.scout.is_some() && card.when != When::Road {
                return bad(format!(
                    "card {} has a scout skill, but only a road card is scouted",
                    card.id
                ));
            }
            // The second card test (MAP-11): every choice changes something later.
            if let Some(idle) = card.choices.iter().find(|c| c.effects.is_empty()) {
                return bad(format!(
                    "card {}'s choice {} changes nothing: give it an effect or a deed",
                    card.id, idle.id
                ));
            }
            // A card with something to find has one forewarned choice, and only such a card
            // (MAP-11, API-54).
            let forewarned = card
                .choices
                .iter()
                .filter(|c| c.if_deeds.iter().flat_map(Deeds::ids).any(|d| d == SCOUTED))
                .count();
            match (card.scout.is_some(), forewarned) {
                (true, 1) | (false, 0) => {}
                (true, 0) => {
                    return bad(format!(
                        "card {} has a scout skill but no choice under if: {SCOUTED}",
                        card.id
                    ));
                }
                (false, _) => {
                    return bad(format!(
                        "card {} has a choice under if: {SCOUTED} but no scout skill",
                        card.id
                    ));
                }
                (true, n) => {
                    return bad(format!(
                        "card {} has {n} choices under if: {SCOUTED}; it needs one",
                        card.id
                    ));
                }
            }
            // The forewarned choice reads `scouted` alone, so a scout always finds it.
            if let Some(mixed) = card.choices.iter().find(|c| {
                let ids = c.if_deeds.iter().flat_map(Deeds::ids).collect::<Vec<_>>();
                ids.len() > 1 && ids.iter().any(|d| *d == SCOUTED)
            }) {
                return bad(format!(
                    "card {}'s choice {} reads {SCOUTED} with other deeds; a forewarned choice reads {SCOUTED} alone",
                    card.id, mixed.id
                ));
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

    /// The cards whose choices can come to a fight (MAP-11): a `fight` effect anywhere in a
    /// choice, a check's outcome included.
    fn can_fight(card: &Card) -> bool {
        Deck::effects(card)
            .iter()
            .any(|e| matches!(e, Effect::Fight { .. }))
    }

    /// The warnings for a campaign's route (MAP-11, Q6): fights are a recommendation, so these
    /// never fail a build. A route that meets fewer than two cards that can come to a fight is
    /// named: the cards of its roads' zones and of its places (night and arrival cards),
    /// chained cards included. A caravan with no fixed route (a human owner picks each road) has
    /// nothing to assess, so it is never warned of.
    pub fn route_warnings(&self, map: &WorldMap, route: &[String]) -> Vec<String> {
        if route.is_empty() {
            return Vec::new();
        }
        let mut zones: BTreeSet<&str> = route.iter().map(String::as_str).collect();
        for leg in route.windows(2) {
            if let Some(road) = map
                .roads_from(&leg[0])
                .find(|r| r.other_end(&leg[0]) == Some(leg[1].as_str()))
            {
                zones.insert(road.zone.as_str());
            }
        }
        let fights: Vec<&str> = self
            .cards
            .iter()
            .filter(|c| zones.contains(c.zone.as_str()) && Deck::can_fight(c))
            .map(|c| c.id.as_str())
            .collect();
        if fights.len() >= 2 {
            return Vec::new();
        }
        vec![format!(
            "the route {} meets {} card{} that can come to a fight{}; two or more are recommended",
            route.join(" > "),
            fights.len(),
            if fights.len() == 1 { "" } else { "s" },
            if fights.is_empty() {
                String::new()
            } else {
                format!(" ({})", fights.join(", "))
            }
        )]
    }

    /// The warnings for fights with persons (MAP-11, ENG-39): a choice that can come to a
    /// fight with a creature `is_person` says is a person, and names no custom it keeps or
    /// breaks. The DM shows how people take such a choice, so it should say which customs.
    pub fn untagged_fight_warnings(&self, is_person: impl Fn(&Monster) -> bool) -> Vec<String> {
        let mut out = Vec::new();
        for card in &self.cards {
            for choice in &card.choices {
                let mut effects = Vec::new();
                effects_of(&choice.effects, &mut effects);
                let with_persons = effects.iter().any(
                    |e| matches!(e, Effect::Fight { monsters } if monsters.iter().any(&is_person)),
                );
                if with_persons && choice.keeps.is_empty() && choice.breaks.is_empty() {
                    out.push(format!(
                        "card {}'s choice {} comes to a fight with persons and names no custom it keeps or breaks",
                        card.id, choice.id
                    ));
                }
            }
        }
        out
    }

    /// Checks that every deed a card or a choice reads is written by some `remember` in this
    /// deck or in `elsewhere` (ENG-33, ENG-38). A world's deck and its packs' decks are
    /// checked together, since a pack's card may write a deed a world card reads; at play time
    /// a card whose deed nothing in this contract writes is simply never in play.
    pub fn check_deeds_written(&self, elsewhere: &BTreeSet<String>) -> Result<(), DeckError> {
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
                if deed != SCOUTED && !written.contains(deed) && !elsewhere.contains(deed) {
                    return Err(DeckError(format!(
                        "card {} reads deed {deed}, which nothing writes",
                        card.id
                    )));
                }
            }
        }
        Ok(())
    }

    /// Checks every choice's `keeps` and `breaks` against the world's customs (ENG-39): each id
    /// a custom the file lists, each once on the choice, and none both kept and broken by it.
    pub fn check_customs(&self, customs: &CustomsFile) -> Result<(), DeckError> {
        for card in &self.cards {
            for choice in &card.choices {
                let mut seen = BTreeSet::new();
                for id in choice.keeps.iter().chain(&choice.breaks) {
                    if customs.get(id).is_none() {
                        return Err(DeckError(format!(
                            "card {} choice {} names custom {id}, which the world's customs don't list",
                            card.id, choice.id
                        )));
                    }
                    if !seen.insert(id.as_str()) {
                        return Err(DeckError(format!(
                            "card {} choice {} names custom {id} twice, or both keeps and breaks it",
                            card.id, choice.id
                        )));
                    }
                }
            }
        }
        Ok(())
    }

    /// This deck with another's cards after its own: a pack's deck joins the world's (ENG-38).
    pub fn join(mut self, other: Deck) -> Self {
        self.cards.extend(other.cards);
        self
    }

    /// Every deed some choice of the deck can write: its `remember`s, `killed_<npc>` for
    /// each NPC a card's fight names, and `own_move_<card>` for every card (API-56).
    pub fn deeds_written(&self) -> BTreeSet<String> {
        // Any card can be decided on an own move (API-56), which writes `own_move_<card>`.
        let mut written: BTreeSet<String> =
            self.cards.iter().map(|c| own_move_deed(&c.id)).collect();
        for effect in self.cards.iter().flat_map(Deck::effects) {
            match effect {
                Effect::Remember { deed } => {
                    written.insert(deed.clone());
                }
                Effect::Fight { monsters } => {
                    written.extend(monsters.iter().filter_map(Monster::npc).map(killed_deed));
                }
                _ => {}
            }
        }
        written
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
            && !state.gone_for_contract.contains(&card.id)
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

    /// Draws in `zone` (API-53): a soon card goes on the table without a roll; otherwise one
    /// d100 roll on the pile for each card offered, up to three, without putting a card back
    /// between rolls. A pile of one puts its card on the table; a bigger pile offers its cards
    /// for a pick (`pick`), and they stay in the pile until then. When the pile is empty the
    /// zone's discard is shuffled back first; a zone with no card in play draws nothing and
    /// rolls nothing. Nothing is drawn while a card waits.
    pub fn draw(
        &self,
        zone: &str,
        when: When,
        discovered: &BTreeSet<String>,
        deeds: &DeedBook,
        state: &mut DeckState,
        dice: &mut impl WorldDice,
    ) -> Option<Drawn> {
        if state.waiting() {
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
            return Some(Drawn::Table {
                card: id,
                soon: true,
            });
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
        let rolls = pile.len().min(MAX_OFFERED);
        let mut offered = Vec::with_capacity(rolls);
        for _ in 0..rolls {
            let roll = dice.roll(DRAW_DIE, "road card");
            let index = ((roll - 1) as usize * pile.len()) / DRAW_DIE as usize;
            offered.push(pile.remove(index).id.clone());
        }
        if let [only] = offered.as_slice() {
            let card = self.card(only).expect("drawn from the deck");
            self.put_on_table(card, deeds, state);
            return Some(Drawn::Table {
                card: only.clone(),
                soon: false,
            });
        }
        state.offered = offered.clone();
        Some(Drawn::Offered(offered))
    }

    /// The DM's pick among the offered cards (API-53): the card goes on the table with the
    /// choices its deeds offer; the others stay in the pile.
    pub fn pick(
        &self,
        card: &str,
        deeds: &DeedBook,
        state: &mut DeckState,
    ) -> Result<(), PickError> {
        if state.offered.is_empty() {
            return Err(PickError::NothingOffered);
        }
        if !state.offered.iter().any(|c| c == card) {
            return Err(PickError::NotOffered(card.to_owned()));
        }
        let picked = self
            .card(card)
            .ok_or_else(|| PickError::NotOffered(card.to_owned()))?;
        state.offered.clear();
        self.put_on_table(picked, deeds, state);
        Ok(())
    }

    /// The choice ids a card would offer with these deeds; empty when it offers all.
    pub fn offer_ids(card: &Card, deeds: &DeedBook) -> Vec<String> {
        offered_ids(card, deeds)
    }

    /// The scout saw what waits ahead (API-54): the card on the table offers its choices as
    /// if [`SCOUTED`] were remembered, so its forewarned choice replaces the one it stands
    /// for. Only before anyone speaks; returns whether the choices changed.
    pub fn forewarn(&self, deeds: &DeedBook, state: &mut DeckState) -> bool {
        let Some(pending) = state.pending.as_mut() else {
            return false;
        };
        let Some(card) = self.card(&pending.card) else {
            return false;
        };
        if !pending.said.is_empty() {
            return false;
        }
        let known = |id: &str| id == SCOUTED || deeds.contains_key(id);
        let offered: Vec<&Choice> = card
            .choices
            .iter()
            .filter(|c| holds(c.if_deeds.as_ref(), c.unless.as_ref(), &known))
            .collect();
        let choices = if offered.len() == card.choices.len() {
            Vec::new()
        } else {
            offered.iter().map(|c| c.id.clone()).collect()
        };
        let changed = choices != pending.choices;
        pending.choices = choices;
        changed
    }

    /// A drawn card goes on the table with the choices its deeds offer, and to the discard,
    /// or out of the game when it is `once`.
    fn put_on_table(&self, card: &Card, deeds: &DeedBook, state: &mut DeckState) {
        match card.once {
            Once::WORLD => state.gone.insert(card.id.clone()),
            Once::CONTRACT => state.gone_for_contract.insert(card.id.clone()),
            Once::Flag(_) => state.discard.insert(card.id.clone()),
        };
        state.pending = Some(PendingCard {
            card: card.id.clone(),
            choices: offered_ids(card, deeds),
            said: BTreeMap::new(),
            own_move: None,
        });
    }

    /// A chained card joins the deck; a `soon` one also joins the queue the next draw in its
    /// zone takes first, unless it is gone for the world (ENG-40): it can never be drawn.
    pub fn add(&self, state: &mut DeckState, card: &str, soon: bool) {
        if self.card(card).is_some_and(|c| c.chained) {
            state.added.insert(card.to_string());
            if soon && !state.gone.contains(card) && !state.soon.iter().any(|c| c == card) {
                state.soon.push(card.to_string());
            }
        }
    }

    /// One seat speaks on the card on the table: a Blade's advice or vote, or a player
    /// owner's call. Returns the decision once the card is settled, and takes the card off
    /// the table then, unless it is settled on an own move with no failure, which stays until
    /// its roll is in (decision 0079).
    pub fn speak(
        &self,
        state: &mut DeckState,
        table: &Table,
        handle: &str,
        choice: &str,
    ) -> Result<Option<Resolution>, CardError> {
        let pending = state.pending.as_ref().ok_or(CardError::NoCard)?;
        let card = self.card(&pending.card).ok_or(CardError::NoCard)?;
        if !pending.speakable(card).iter().any(|c| c == choice) {
            return Err(CardError::UnknownChoice(choice.to_string()));
        }
        let resolution = if may_speak(pending, card, table, handle)? {
            Some(resolve(
                card,
                pending,
                choice,
                Decided::Owner,
                vec![handle.to_string()],
            ))
        } else {
            let pending = state.pending.as_mut().expect("checked above");
            pending.said.insert(handle.to_string(), choice.to_string());
            settle(card, pending, table)
        };
        if resolution.as_ref().is_some_and(|r| !r.rolls_first()) {
            state.pending = None;
        }
        Ok(resolution)
    }

    /// The roll of an own move with no failure succeeded (decision 0079): the card leaves the
    /// table, decided on the move.
    pub fn own_move_won(&self, state: &mut DeckState) {
        state.pending = None;
    }

    /// An own move with no failure fell (decision 0079): a failed roll, a downed proposer or
    /// no roll at all. The move is spent and every word given for it is taken back; the words
    /// left are tallied as [`Deck::speak`] tallies them. Returns the decision when they settle
    /// the card, and takes the card off the table then.
    pub fn own_move_fell(&self, state: &mut DeckState, table: &Table) -> Option<Resolution> {
        let pending = state.pending.as_mut()?;
        let card = self.card(&pending.card)?;
        let mv = pending
            .own_move
            .as_mut()
            .filter(|mv| mv.failure.is_none())?;
        mv.spent = true;
        pending.said.retain(|_, choice| choice != OWN_MOVE);
        // Nobody left who can speak: the card is settled as a card nobody can speak on is.
        if table.blades.is_empty() {
            return self.settle_unattended(state, table);
        }
        let resolution = settle(card, pending, table);
        if resolution.is_some() {
            state.pending = None;
        }
        resolution
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
                card.owner_pick
                    .as_ref()?
                    .ids()
                    .iter()
                    .find_map(|id| offered.iter().find(|c| c.id == *id))
            })
            .or(offered.first())
            .map(|c| c.id.clone())?;
        let resolution = resolve(card, pending, &pick, Decided::Default, Vec::new());
        state.pending = None;
        Some(resolution)
    }

    /// A seat's own move goes on the card on the table (API-56): the move joins the card as
    /// the choice [`OWN_MOVE`], and the seat's word is given for it, as by [`Deck::speak`].
    /// `success` must be a choice offered on the card; a `failure`, when named, another one
    /// that breaks no custom. Returns the decision when the seat's word settles the card.
    pub fn own_move(
        &self,
        state: &mut DeckState,
        table: &Table,
        mv: OwnMove,
    ) -> Result<Option<Resolution>, CardError> {
        let pending = state.pending.as_ref().ok_or(CardError::NoCard)?;
        let card = self.card(&pending.card).ok_or(CardError::NoCard)?;
        let offered = pending.offered(card);
        let named = |id: &str| offered.iter().find(|c| c.id == id).copied();
        if named(&mv.success).is_none() {
            return Err(CardError::UnknownChoice(mv.success.clone()));
        }
        let failure = match &mv.failure {
            Some(id) => Some(named(id).ok_or_else(|| CardError::UnknownChoice(id.clone()))?),
            None => None,
        };
        may_speak(pending, card, table, &mv.actor)?;
        if pending.own_move.is_some() {
            return Err(CardError::OwnMoveTaken);
        }
        if let Some(failure) = failure {
            if failure.id == mv.success {
                return Err(CardError::BadOwnMove(format!(
                    "success and failure are both {}; name two different choices",
                    mv.success
                )));
            }
            if let Some(custom) = failure.breaks.first() {
                return Err(CardError::BadOwnMove(format!(
                    "a failure can't bring {}, which breaks {custom}; name another choice for the failure, or none",
                    failure.id
                )));
            }
        }
        let actor = mv.actor.clone();
        state.pending.as_mut().expect("checked above").own_move = Some(mv);
        self.speak(state, table, &actor, OWN_MOVE)
    }
}

/// Whether `handle` may speak on the card now: `Ok(true)` for a player owner's call on a
/// caravan card, once every Blade has advised; `Ok(false)` for a Blade's word.
fn may_speak(
    pending: &PendingCard,
    card: &Card,
    table: &Table,
    handle: &str,
) -> Result<bool, CardError> {
    if pending.said.contains_key(handle) {
        return Err(CardError::AlreadySpoke(handle.to_string()));
    }
    let player_owner = matches!(&table.owner, Owner::Player(o) if o == handle);
    if player_owner && card.target == Target::Caravan {
        let missing: Vec<String> = table
            .blades
            .iter()
            .filter(|b| !pending.said.contains_key(*b))
            .cloned()
            .collect();
        if !missing.is_empty() {
            return Err(CardError::WaitingFor(missing));
        }
        return Ok(true);
    }
    if !table.blades.iter().any(|b| b == handle) {
        return Err(CardError::NoSay(handle.to_string()));
    }
    Ok(false)
}

fn resolve(
    card: &Card,
    pending: &PendingCard,
    choice: &str,
    decided: Decided,
    by: Vec<String>,
) -> Resolution {
    let effects_of = |id: &str| {
        card.choices
            .iter()
            .find(|c| c.id == id)
            .map(|c| c.effects.clone())
            .unwrap_or_default()
    };
    let own_move = pending
        .own_move
        .as_ref()
        .filter(|_| choice == OWN_MOVE)
        .map(|mv| {
            // The deed comes first, as a choice's own `remember` does, so a fight stays last.
            // With no choice named (a fall, decision 0079), the branch is the deed alone.
            let branch = |id: Option<&str>| {
                let mut effects = vec![Effect::Remember {
                    deed: own_move_deed(&card.id),
                }];
                effects.extend(id.map(effects_of).unwrap_or_default());
                effects
            };
            OwnMoveRun {
                mv: mv.clone(),
                success: branch(Some(&mv.success)),
                failure: branch(mv.failure.as_deref()),
            }
        });
    Resolution {
        card: card.id.clone(),
        choice: choice.to_string(),
        decided,
        by,
        effects: if own_move.is_some() {
            Vec::new()
        } else {
            effects_of(choice)
        },
        own_move,
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
/// remembered and its `unless` deeds not. In every case it also offers one of its `asked`
/// choices, when it has any, and one of its `owner_pick` (MAP-18).
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
    let has_asked = card.choices.iter().any(|c| c.asked);
    for mask in 0u32..(1 << free.len()) {
        let known = |id: &str| {
            must.contains(id)
                || free
                    .iter()
                    .position(|d| *d == id)
                    .is_some_and(|i| mask & (1 << i) != 0)
        };
        let choices: Vec<&Choice> = card
            .choices
            .iter()
            .filter(|c| holds(c.if_deeds.as_ref(), c.unless.as_ref(), &known))
            .collect();
        let offered = choices.len();
        // The first card test code can check (MAP-11): no two choices offered together alike.
        for (i, a) in choices.iter().enumerate() {
            if let Some(b) = choices[i + 1..].iter().find(|b| b.effects == a.effects) {
                return bad(format!(
                    "card {}'s choices {} and {} do the same: their effects are alike",
                    card.id, a.id, b.id
                ));
            }
        }
        let case = || -> String {
            free.iter()
                .enumerate()
                .filter(|(i, _)| mask & (1 << i) != 0)
                .map(|(_, d)| *d)
                .collect::<Vec<_>>()
                .join(", ")
        };
        if !(2..=3).contains(&offered) {
            return bad(format!(
                "card {} offers {offered} choices when the deeds remembered are [{}]; it needs 2 or 3",
                card.id,
                case()
            ));
        }
        // The card's own question or plea stays offered, once (MAP-18): asked twins never
        // show together.
        let asked = choices.iter().filter(|c| c.asked).count();
        if has_asked && asked != 1 {
            return bad(format!(
                "card {} offers {asked} of its asked choices when the deeds remembered are [{}]; it needs 1",
                card.id,
                case()
            ));
        }
        // The owner's pick is one it offers, whatever the deeds (MAP-18).
        if let Some(pick) = &card.owner_pick
            && pick
                .among(|id| choices.iter().any(|c| c.id == id))
                .is_none()
        {
            return bad(format!(
                "card {}'s owner_pick {} is not offered when the deeds remembered are [{}]",
                card.id,
                pick.ids().join(" or "),
                case()
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
    let speakable = pending.speakable(card);
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
                pending,
                &insist.id,
                Decided::OwnerInsists,
                voters(&insist.id),
            ));
        }
    }
    // The own move counts like any choice, listed last (API-56).
    let mut counts: Vec<(&str, usize)> = speakable.iter().map(|c| (c.as_str(), 0)).collect();
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
        return Some(resolve(
            card,
            pending,
            first,
            Decided::Majority,
            voters(first),
        ));
    }
    let human = table
        .tie_breaker
        .as_ref()
        .and_then(|h| pending.said.get(h))
        .filter(|c| card.target == Target::Blades && tied.contains(&c.as_str()));
    let pick = card
        .owner_pick
        .as_ref()
        .and_then(|p| p.among(|id| tied.contains(&id)));
    let choice = human.map(String::as_str).or(pick).unwrap_or(first);
    Some(resolve(card, pending, choice, Decided::Tie, voters(choice)))
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
                   {"id": "refuse", "text": "Send him off.", "effects": [{"do": "remember", "deed": "chose_refuse"}]}
                 ]},
                {"id": "beggar_returns", "zone": "fields", "target": "blades", "chained": true, "once": true,
                 "text": "The beggar is back with news.",
                 "choices": [{"id": "listen", "text": "Listen.", "effects": [{"do": "remember", "deed": "chose_listen"}]}, {"id": "leave", "text": "Leave.", "effects": [{"do": "remember", "deed": "chose_leave"}]}]},
                {"id": "ruin_ghost", "zone": "hills", "when": "night", "target": "blades", "requires": "ruin",
                 "text": "Lights at the ruin.",
                 "choices": [{"id": "look", "text": "Look.", "effects": [{"do": "remember", "deed": "chose_look"}]}, {"id": "sleep", "text": "Sleep.", "effects": [{"do": "remember", "deed": "chose_sleep"}]}]}
              ]
            }"#,
        )
        .unwrap();
        Deck::from_files([file])
    }

    #[test]
    fn a_choice_names_only_customs_the_world_lists_and_never_keeps_and_breaks_one() {
        let customs: CustomsFile = serde_json::from_str(
            r#"{"customs": [
              {"id": "bread_shared", "people": "valley_folk", "text": "Bread is shared."},
              {"id": "debt_paid", "people": "valley_folk", "text": "A debt is paid."}
            ]}"#,
        )
        .unwrap();
        let mut d = deck();
        d.check_customs(&customs).unwrap();
        let give = &mut d.cards[1].choices[0];
        give.keeps = vec!["bread_shared".into()];
        d.check_customs(&customs).unwrap();
        // The tags read back from a card file and are left out when empty.
        let json = serde_json::to_value(&d.cards[1].choices[0]).unwrap();
        assert_eq!(json["keeps"], serde_json::json!(["bread_shared"]));
        assert!(json.get("breaks").is_none());
        d.cards[1].choices[1].breaks = vec!["mercy_to_yielded".into()];
        assert!(
            d.check_customs(&customs)
                .unwrap_err()
                .0
                .contains("custom mercy_to_yielded, which the world's customs don't list")
        );
        d.cards[1].choices[1].breaks = vec!["bread_shared".into()];
        d.cards[1].choices[0].breaks = vec!["bread_shared".into()];
        assert!(
            d.check_customs(&customs).unwrap_err().0.contains(
                "choice give names custom bread_shared twice, or both keeps and breaks it"
            )
        );
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
                monsters: vec![Monster::Stat("wolf".into())],
            },
            Effect::Delay { minutes: 10 },
        ];
        assert!(d.validate(&map).unwrap_err().0.contains("fight comes last"));

        let mut d = deck();
        if let Effect::Check { dc, .. } = &mut d.cards[0].choices[0].effects[0] {
            *dc = 12;
        }
        assert!(d.validate(&map).unwrap_err().0.contains("off the ladder"));

        let mut d = deck();
        d.cards[1].choices[1].id = OWN_MOVE.into();
        assert!(
            d.validate(&map)
                .unwrap_err()
                .0
                .contains("reserved for a seat's own move")
        );
    }

    /// Draws and, when cards are offered, picks the first rolled, as the engine does when
    /// the DM does not answer.
    fn draw_one(
        d: &Deck,
        zone: &str,
        when: When,
        found: &BTreeSet<String>,
        state: &mut DeckState,
        dice: &mut ListDice,
    ) -> Option<String> {
        match d.draw(zone, when, found, &DeedBook::new(), state, dice)? {
            Drawn::Table { card, .. } => Some(card),
            Drawn::Offered(cards) => {
                d.pick(&cards[0], &DeedBook::new(), state).unwrap();
                Some(cards[0].clone())
            }
        }
    }

    #[test]
    fn a_draw_offers_the_pile_rolled_without_putting_a_card_back() {
        let d = deck();
        let mut state = DeckState::default();
        // Two cards in play in `fields`: the first roll's faces 1-50 take mud, 51-100 the
        // beggar; the second roll is on the one card left.
        let mut dice = ListDice::new([51, 1]);
        let drawn = d.draw(
            "fields",
            When::Road,
            &known(),
            &DeedBook::new(),
            &mut state,
            &mut dice,
        );
        assert_eq!(
            drawn,
            Some(Drawn::Offered(vec!["beggar".into(), "mud".into()]))
        );
        assert_eq!(dice.asked().len(), 2, "one roll for each card offered");
        assert!(state.waiting() && state.pending.is_none());
        assert!(state.discard.is_empty(), "offered cards stay in the pile");
        // Nothing more is drawn while cards are offered.
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
        assert_eq!(
            d.pick("beggar_returns", &DeedBook::new(), &mut state),
            Err(PickError::NotOffered("beggar_returns".into()))
        );
        d.pick("mud", &DeedBook::new(), &mut state).unwrap();
        assert_eq!(state.pending.as_ref().unwrap().card, "mud");
        assert!(state.offered.is_empty());
        assert_eq!(state.discard, BTreeSet::from(["mud".to_string()]));
        assert_eq!(
            d.pick("beggar", &DeedBook::new(), &mut state),
            Err(PickError::NothingOffered)
        );
        // The beggar was passed over: still in the pile.
        state.pending = None;
        let pile = d.pile("fields", When::Road, &known(), &DeedBook::new(), &state);
        assert_eq!(
            pile.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
            ["beggar"]
        );
    }

    #[test]
    fn a_draw_offers_at_most_three_and_a_pile_of_one_needs_no_pick() {
        let mut d = deck();
        for n in 0..3 {
            let mut extra = d.cards[0].clone();
            extra.id = format!("mud_{n}");
            d.cards.push(extra);
        }
        let mut state = DeckState::default();
        let mut dice = ListDice::new([1, 1, 1, 1]);
        let Some(Drawn::Offered(cards)) = d.draw(
            "fields",
            When::Road,
            &known(),
            &DeedBook::new(),
            &mut state,
            &mut dice,
        ) else {
            panic!("five cards in play offer a pick");
        };
        assert_eq!(cards, ["mud", "beggar", "mud_0"]);
        assert_eq!(dice.asked().len(), MAX_OFFERED);
        // A pile of one: its card goes on the table, after its one roll as before.
        let mut state = DeckState {
            discard: BTreeSet::from(["mud".into()]),
            ..DeckState::default()
        };
        let mut one = ListDice::new([100]);
        assert_eq!(
            deck().draw(
                "fields",
                When::Road,
                &known(),
                &DeedBook::new(),
                &mut state,
                &mut one
            ),
            Some(Drawn::Table {
                card: "beggar".into(),
                soon: false
            })
        );
        assert_eq!(one.asked().len(), 1);
    }

    #[test]
    fn an_empty_pile_reshuffles_and_a_zone_without_cards_rolls_nothing() {
        let d = deck();
        let mut state = DeckState {
            discard: BTreeSet::from(["mud".into(), "beggar".into()]),
            ..DeckState::default()
        };
        let mut dice = ListDice::new([1, 1]);
        assert_eq!(
            draw_one(&d, "fields", When::Road, &known(), &mut state, &mut dice).as_deref(),
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
            .as_ref()
            .and_then(Drawn::table),
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
                own_move: None,
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
                own_move: None,
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
                own_move: None,
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
                own_move: None,
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
                own_move: None,
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
                own_move: None,
            }),
            ..DeckState::default()
        };
        let done = d.settle_unattended(&mut state, &table).unwrap();
        assert_eq!(
            (done.choice.as_str(), done.decided),
            ("unload", Decided::Default)
        );
    }

    fn pending(card: &str) -> DeckState {
        DeckState {
            pending: Some(PendingCard {
                card: card.into(),
                choices: Vec::new(),
                said: BTreeMap::new(),
                own_move: None,
            }),
            ..DeckState::default()
        }
    }

    fn own(actor: &str, success: &str, failure: &str) -> OwnMove {
        OwnMove {
            actor: actor.into(),
            text: "Share the bread and ask the way.".into(),
            ability: "charisma".into(),
            skill: "persuasion".into(),
            dc: 10,
            success: success.into(),
            failure: Some(failure.into()),
            spent: false,
        }
    }

    /// An own move that names no failure (decision 0079).
    fn own_alone(actor: &str, success: &str) -> OwnMove {
        OwnMove {
            failure: None,
            ..own(actor, success, "")
        }
    }

    #[test]
    fn an_own_move_with_no_failure_waits_for_its_roll_and_a_win_takes_the_card() {
        let d = deck();
        let table = npc_table();
        let mut state = pending("beggar");
        assert_eq!(
            d.own_move(&mut state, &table, own_alone("bren", "give")),
            Ok(None)
        );
        let done = d
            .speak(&mut state, &table, "maren", OWN_MOVE)
            .unwrap()
            .unwrap();
        assert_eq!(
            (done.choice.as_str(), done.decided),
            (OWN_MOVE, Decided::Majority)
        );
        let run = done.own_move.unwrap();
        // The fall's part is the deed alone.
        assert_eq!(
            run.failure,
            [Effect::Remember {
                deed: own_move_deed("beggar")
            }]
        );
        assert!(state.pending.is_some(), "the card waits for the roll");
        d.own_move_won(&mut state);
        assert!(state.pending.is_none());
    }

    #[test]
    fn an_own_move_that_fell_is_spent_its_words_taken_back_and_the_card_waits() {
        let d = deck();
        let table = npc_table();
        let mut state = pending("beggar");
        d.own_move(&mut state, &table, own_alone("bren", "give"))
            .unwrap();
        assert!(
            d.speak(&mut state, &table, "maren", OWN_MOVE)
                .unwrap()
                .is_some()
        );
        assert_eq!(d.own_move_fell(&mut state, &table), None);
        let card = state.pending.as_ref().unwrap();
        assert!(card.own_move.as_ref().unwrap().spent);
        assert!(card.said.is_empty());
        assert_eq!(
            card.speakable(d.card("beggar").unwrap()),
            ["give", "refuse"]
        );
        assert_eq!(
            d.speak(&mut state, &table, "bren", OWN_MOVE),
            Err(CardError::UnknownChoice(OWN_MOVE.into()))
        );
        assert_eq!(
            d.own_move(&mut state, &table, own_alone("maren", "give")),
            Err(CardError::OwnMoveTaken)
        );
        d.speak(&mut state, &table, "bren", "refuse").unwrap();
        let done = d
            .speak(&mut state, &table, "maren", "refuse")
            .unwrap()
            .unwrap();
        assert_eq!(done.choice, "refuse");
        assert!(done.own_move.is_none());
        assert!(state.pending.is_none());
    }

    #[test]
    fn a_downed_proposer_s_fall_settles_the_card_when_the_words_left_do() {
        let d = deck();
        let three = Table {
            owner: Owner::Npc("tobin".into()),
            blades: vec!["bren".into(), "maren".into(), "torva".into()],
            tie_breaker: Some("bren".into()),
        };
        let mut state = pending("beggar");
        d.own_move(&mut state, &three, own_alone("bren", "give"))
            .unwrap();
        d.speak(&mut state, &three, "maren", "give").unwrap();
        // A tie the human seat breaks for its own move.
        let done = d
            .speak(&mut state, &three, "torva", "refuse")
            .unwrap()
            .unwrap();
        assert_eq!(
            (done.choice.as_str(), done.decided),
            (OWN_MOVE, Decided::Tie)
        );
        // Bren is down: the table has only the Blades who are up, and their words split.
        let up = Table {
            blades: vec!["maren".into(), "torva".into()],
            ..three
        };
        let settled = d.own_move_fell(&mut state, &up).unwrap();
        assert_eq!(
            (settled.choice.as_str(), settled.decided),
            ("give", Decided::Tie)
        );
        assert!(state.pending.is_none());
    }

    #[test]
    fn a_fall_on_a_player_owner_s_call_frees_the_advice_and_waits_for_the_owner() {
        let d = deck();
        let table = Table {
            owner: Owner::Player("ilsa".into()),
            blades: vec!["bren".into(), "maren".into()],
            tie_breaker: None,
        };
        let mut state = pending("mud");
        d.own_move(&mut state, &table, own_alone("bren", "push"))
            .unwrap();
        d.speak(&mut state, &table, "maren", "unload").unwrap();
        let done = d
            .speak(&mut state, &table, "ilsa", OWN_MOVE)
            .unwrap()
            .unwrap();
        assert_eq!(done.decided, Decided::Owner);
        assert!(state.pending.is_some(), "the card waits for the roll");
        // The owner's call is no word in the tally; Bren's advice for the move is taken back.
        assert_eq!(d.own_move_fell(&mut state, &table), None);
        assert_eq!(
            d.speak(&mut state, &table, "ilsa", "push"),
            Err(CardError::WaitingFor(vec!["bren".into()]))
        );
        d.speak(&mut state, &table, "bren", "push").unwrap();
        let done = d
            .speak(&mut state, &table, "ilsa", "push")
            .unwrap()
            .unwrap();
        assert_eq!(
            (done.choice.as_str(), done.decided),
            ("push", Decided::Owner)
        );
        assert!(state.pending.is_none());
    }

    #[test]
    fn a_fall_with_nobody_left_to_speak_settles_the_card_by_its_default() {
        let d = deck();
        let one = Table {
            owner: Owner::Npc("tobin".into()),
            blades: vec!["bren".into()],
            tie_breaker: Some("bren".into()),
        };
        let mut state = pending("beggar");
        let done = d
            .own_move(&mut state, &one, own_alone("bren", "give"))
            .unwrap()
            .unwrap();
        assert!(done.rolls_first());
        let nobody = Table {
            blades: Vec::new(),
            ..one
        };
        let settled = d.own_move_fell(&mut state, &nobody).unwrap();
        assert_eq!(settled.decided, Decided::Default);
        assert!(settled.by.is_empty());
        assert!(state.pending.is_none());
    }

    #[test]
    fn an_own_move_s_failure_and_spent_are_left_out_when_absent() {
        let named = serde_json::to_value(own("bren", "give", "refuse")).unwrap();
        assert!(named.get("spent").is_none());
        assert_eq!(named["failure"], "refuse");
        let mut alone = own_alone("bren", "give");
        assert!(
            serde_json::to_value(&alone)
                .unwrap()
                .get("failure")
                .is_none()
        );
        alone.spent = true;
        let back: OwnMove = serde_json::from_value(serde_json::to_value(&alone).unwrap()).unwrap();
        assert_eq!(back, alone);
    }

    #[test]
    fn an_own_move_is_one_more_choice_voted_on_and_offered_last() {
        let d = deck();
        let table = npc_table();
        let mut state = pending("beggar");
        assert_eq!(
            d.own_move(&mut state, &table, own("bren", "give", "dance")),
            Err(CardError::UnknownChoice("dance".into()))
        );
        assert!(matches!(
            d.own_move(&mut state, &table, own("bren", "give", "give")),
            Err(CardError::BadOwnMove(_))
        ));
        assert_eq!(
            d.own_move(&mut state, &table, own("goblin", "give", "refuse")),
            Err(CardError::NoSay("goblin".into()))
        );
        assert_eq!(
            d.own_move(&mut state, &table, own("bren", "give", "refuse")),
            Ok(None)
        );
        let pending_card = state.pending.as_ref().unwrap();
        assert_eq!(
            pending_card.speakable(d.card("beggar").unwrap()),
            ["give", "refuse", OWN_MOVE]
        );
        assert_eq!(
            d.own_move(&mut state, &table, own("maren", "give", "refuse")),
            Err(CardError::OwnMoveTaken)
        );
        // A one-one tie goes to the human seat, whose word was the own move.
        let done = d
            .speak(&mut state, &table, "maren", "give")
            .unwrap()
            .unwrap();
        assert_eq!(
            (done.choice.as_str(), done.decided),
            (OWN_MOVE, Decided::Tie)
        );
        assert!(done.effects.is_empty());
        let run = done.own_move.unwrap();
        assert_eq!((run.mv.actor.as_str(), run.mv.dc), ("bren", 10));
        assert_eq!(
            run.success[0],
            Effect::Remember {
                deed: own_move_deed("beggar")
            }
        );
        assert!(matches!(run.success[1], Effect::Cargo { .. }));
        assert_eq!(
            (run.mv.success.as_str(), run.mv.failure.as_deref()),
            ("give", Some("refuse"))
        );
        assert_eq!(run.failure.len(), 2);
        assert!(state.pending.is_none());
    }

    #[test]
    fn an_own_move_s_failure_never_breaks_a_custom() {
        let mut d = deck();
        d.cards[1].choices[1].breaks = vec!["bread_shared".into()];
        let mut state = pending("beggar");
        let refused = d.own_move(&mut state, &npc_table(), own("bren", "give", "refuse"));
        assert!(
            matches!(&refused, Err(CardError::BadOwnMove(why)) if why.contains("breaks bread_shared"))
        );
        // The same choice may be the success.
        assert_eq!(
            d.own_move(&mut state, &npc_table(), own("bren", "refuse", "give")),
            Ok(None)
        );
    }

    #[test]
    fn a_player_owner_s_own_move_waits_for_every_blade_and_decides() {
        let d = deck();
        let table = Table {
            owner: Owner::Player("ilsa".into()),
            blades: vec!["bren".into(), "maren".into()],
            tie_breaker: None,
        };
        let mut state = pending("mud");
        d.speak(&mut state, &table, "bren", "push").unwrap();
        assert_eq!(
            d.own_move(&mut state, &table, own("ilsa", "push", "unload")),
            Err(CardError::WaitingFor(vec!["maren".into()]))
        );
        d.speak(&mut state, &table, "maren", "push").unwrap();
        let done = d
            .own_move(&mut state, &table, own("ilsa", "push", "unload"))
            .unwrap()
            .unwrap();
        assert_eq!(
            (done.choice.as_str(), done.decided),
            (OWN_MOVE, Decided::Owner)
        );
    }

    #[test]
    fn a_card_settled_unattended_never_takes_an_own_move_and_every_card_can_write_one() {
        let d = deck();
        let table = Table {
            owner: Owner::Npc("tobin".into()),
            blades: vec![],
            tie_breaker: None,
        };
        let mut state = pending("mud");
        state.pending.as_mut().unwrap().own_move = Some(own("bren", "push", "unload"));
        let done = d.settle_unattended(&mut state, &table).unwrap();
        assert_eq!(done.choice, "unload");
        assert!(done.own_move.is_none());
        let deeds = d.deeds_written();
        assert!(
            d.cards
                .iter()
                .all(|c| deeds.contains(&own_move_deed(&c.id)))
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
                   {"id": "pay_again", "text": "Pay again.", "unless": "angry", "effects": [{"do": "remember", "deed": "chose_pay_again"}]},
                   {"id": "shout", "text": "Shout.", "if": "angry", "effects": [{"do": "remember", "deed": "chose_shout"}]},
                   {"id": "say_no", "text": "Say no.", "effects": [{"do": "remember", "deed": "angry"}]},
                   {"id": "ford", "text": "Ford the beck.", "effects": [{"do": "remember", "deed": "chose_ford"}]}
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
        assert_eq!(card.as_ref().and_then(Drawn::table), Some("bridge_again"));
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
                own_move: None,
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
        d.cards[0].choices[0].effects = vec![Effect::Delay { minutes: 10 }];
        d.validate(&map).unwrap();
        assert_eq!(
            d.check_deeds_written(&BTreeSet::new()).unwrap_err().0,
            "card bridge_again reads deed paid, which nothing writes"
        );
        d.check_deeds_written(&BTreeSet::from(["paid".to_string()]))
            .unwrap();

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

        // The card's own question stays offered in every case (MAP-18): `pay_again` goes
        // when the party is angry, so marking it alone fails; `shout` asks it then.
        let angry = |d: &mut Deck| {
            d.cards[0].choices[1].effects.push(Effect::Remember {
                deed: "angry".into(),
            })
        };
        let mut d = deed_deck();
        angry(&mut d);
        d.cards[1].choices[0].asked = true;
        assert!(d.validate(&map).unwrap_err().0.contains(
            "card bridge_again offers 0 of its asked choices when the deeds remembered are ["
        ));
        d.cards[1].choices[1].asked = true;
        d.validate(&map).unwrap();

        // The owner's pick is offered in every case too (MAP-18).
        let mut d = deed_deck();
        angry(&mut d);
        d.cards[1].owner_pick = Some(OwnerPick::One("pay_again".into()));
        assert!(
            d.validate(&map)
                .unwrap_err()
                .0
                .contains("card bridge_again's owner_pick pay_again is not offered when the deeds remembered are [")
        );
        d.cards[1].owner_pick = Some(OwnerPick::One("say_no".into()));
        d.validate(&map).unwrap();
        // Or the owner's order over a twin: one of them is offered in every case.
        d.cards[1].owner_pick = Some(OwnerPick::Order(vec!["pay_again".into(), "shout".into()]));
        d.validate(&map).unwrap();

        // Gated twins that each carry `asked` pass together, though each alone is hidden in
        // one case; a card-level `if` deed is remembered in every case.
        let mut d = deed_deck();
        angry(&mut d);
        d.cards[1].choices[0].asked = true;
        d.cards[1].choices[1].asked = true;
        d.cards[1].if_deeds = Some(Deeds::One("paid".into()));
        d.validate(&map).unwrap();
        // Two asked choices offered together are two pleas: refused.
        d.cards[1].choices[2].asked = true;
        assert!(
            d.validate(&map)
                .unwrap_err()
                .0
                .contains("offers 2 of its asked choices")
        );

        // An owner_pick that names nothing, or one choice twice, is refused.
        let mut d = deed_deck();
        d.cards[1].owner_pick = Some(OwnerPick::Order(vec![]));
        assert!(
            d.validate(&map)
                .unwrap_err()
                .0
                .contains("names no choice, or one twice")
        );
        d.cards[1].owner_pick = Some(OwnerPick::Order(vec!["say_no".into(), "say_no".into()]));
        assert!(
            d.validate(&map)
                .unwrap_err()
                .0
                .contains("names no choice, or one twice")
        );
    }

    #[test]
    fn an_owner_s_ordered_pick_takes_the_first_one_offered() {
        let pick = OwnerPick::Order(vec!["welcome".into(), "welcome_with_dog".into()]);
        assert_eq!(pick.among(|id| id != "welcome"), Some("welcome_with_dog"));
        assert_eq!(pick.among(|_| true), Some("welcome"));
        assert_eq!(pick.among(|_| false), None);
        let one: OwnerPick = serde_json::from_str(r#""push""#).unwrap();
        assert_eq!(one.ids(), ["push"]);
        let order: OwnerPick = serde_json::from_str(r#"["a", "b"]"#).unwrap();
        assert_eq!(order.ids(), ["a", "b"]);
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
    fn once_reads_true_or_contract() {
        let mut d = deck();
        let json = serde_json::to_value(&d.cards[2]).unwrap();
        assert_eq!(json["once"], true);
        assert!(
            serde_json::to_value(&d.cards[0])
                .unwrap()
                .get("once")
                .is_none()
        );
        d.cards[0].once = serde_json::from_str("\"contract\"").unwrap();
        assert_eq!(d.cards[0].once, Once::CONTRACT);
        let mut state = DeckState::default();
        let mut dice = ListDice::new([1, 1]);
        draw_one(&d, "fields", When::Road, &known(), &mut state, &mut dice);
        assert!(state.gone_for_contract.contains("mud"));
        assert!(!state.discard.contains("mud") && !state.gone.contains("mud"));
        state.pending = None;
        let pile = d.pile("fields", When::Road, &known(), &DeedBook::new(), &state);
        assert_eq!(
            pile.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
            ["beggar"]
        );
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
        assert_eq!(card.as_ref().and_then(Drawn::table), Some("beggar_returns"));
        assert!(none.asked().is_empty(), "no roll for a soon card");
        assert!(state.soon.is_empty());
        assert!(state.gone.contains("beggar_returns"));
        // The next draw rolls on the pile as usual.
        state.pending = None;
        let mut dice = ListDice::new([1, 1]);
        let card = draw_one(&d, "fields", When::Road, &known(), &mut state, &mut dice);
        assert_eq!(card.as_deref(), Some("mud"));
        // Gone for the world, it is never queued again (ENG-40).
        d.add(&mut state, "beggar_returns", true);
        assert!(state.soon.is_empty());
    }

    #[test]
    fn an_arrival_card_lives_in_a_place() {
        let map = small_map();
        let mut d = deck();
        d.cards[3].when = When::Arrival;
        d.cards[3].zone = "inn".into();
        d.validate(&map).unwrap();
        let mut dice = ListDice::new([1]);
        let mut state = DeckState::default();
        let mut found = known();
        found.insert("ruin".into());
        let card = d.draw(
            "inn",
            When::Arrival,
            &found,
            &DeedBook::new(),
            &mut state,
            &mut dice,
        );
        assert_eq!(card.as_ref().and_then(Drawn::table), Some("ruin_ghost"));
        d.cards[3].zone = "fields".into();
        assert!(d.validate(&map).unwrap_err().0.contains("is no place"));
    }

    #[test]
    fn a_fight_s_named_npc_writes_its_death_deed() {
        let file: DeckFile = serde_json::from_str(
            r#"{"cards": [
              {"id": "toll", "zone": "fields", "target": "blades", "text": "Two men with cudgels.",
               "choices": [
                 {"id": "fight", "text": "Go at them.", "effects": [{"do": "fight", "monsters": [{"stat": "bandit", "npc": "col"}, "bandit"]}]},
                 {"id": "pay", "text": "Pay.", "effects": [{"do": "remember", "deed": "paid"}]}
               ]},
              {"id": "grave", "zone": "fields", "target": "blades", "text": "A new grave.", "if": "killed_col",
               "choices": [{"id": "stop", "text": "Stop.", "effects": [{"do": "remember", "deed": "chose_stop"}]}, {"id": "go", "text": "Go on.", "effects": [{"do": "remember", "deed": "chose_go"}]}]}
            ]}"#,
        )
        .unwrap();
        let d = Deck::from_files([file]);
        d.validate(&small_map()).unwrap();
        assert!(d.deeds_written().contains("killed_col"));
        d.check_deeds_written(&BTreeSet::new()).unwrap();
        let Effect::Fight { monsters } = &d.cards[0].choices[0].effects[0] else {
            panic!("a fight");
        };
        assert_eq!(
            (monsters[0].stat(), monsters[0].npc()),
            ("bandit", Some("col"))
        );
        assert_eq!((monsters[1].stat(), monsters[1].npc()), ("bandit", None));
    }

    fn scout_deck() -> Deck {
        let file: DeckFile = serde_json::from_str(
            r#"{"cards": [
              {"id": "willows", "zone": "fields", "target": "blades", "text": "Willows crowd the road.",
               "scout": "perception",
               "choices": [
                 {"id": "push_on", "text": "Push on.", "effects": [{"do": "remember", "deed": "chose_push_on"}]},
                 {"id": "wait", "text": "Wait for the light.", "unless": "scouted", "effects": [{"do": "remember", "deed": "chose_wait"}]},
                 {"id": "flank", "text": "Go round the men in the willows.", "if": "scouted", "effects": [{"do": "remember", "deed": "chose_flank"}]}
               ]}
            ]}"#,
        )
        .unwrap();
        Deck::from_files([file])
    }

    #[test]
    fn a_scouted_card_opens_its_forewarned_choice_for_one_draw() {
        let d = scout_deck();
        d.validate(&small_map()).unwrap();
        d.check_deeds_written(&BTreeSet::new()).unwrap();
        assert_eq!(d.cards[0].scout, Some(ScoutSkill::Perception));
        let mut state = DeckState::default();
        let mut dice = ListDice::new([1]);
        let drawn = draw_one(&d, "fields", When::Road, &known(), &mut state, &mut dice);
        assert_eq!(drawn.as_deref(), Some("willows"));
        let pending = state.pending.clone().unwrap();
        assert_eq!(pending.choices, ["push_on", "wait"]);

        assert!(d.forewarn(&DeedBook::new(), &mut state));
        assert_eq!(
            state.pending.as_ref().unwrap().choices,
            ["push_on", "flank"]
        );
        // Forewarned once is enough; a word spoken fixes the card.
        assert!(!d.forewarn(&DeedBook::new(), &mut state));

        // The next draw of the same card is not forewarned by the old scout.
        state.pending = None;
        let mut dice = ListDice::new([1]);
        draw_one(&d, "fields", When::Road, &known(), &mut state, &mut dice);
        assert_eq!(state.pending.as_ref().unwrap().choices, ["push_on", "wait"]);
        state
            .pending
            .as_mut()
            .unwrap()
            .said
            .insert("bren".into(), "push_on".into());
        assert!(!d.forewarn(&DeedBook::new(), &mut state));
    }

    #[test]
    fn the_validator_keeps_scouted_to_choices_and_road_cards() {
        let map = small_map();
        let mut d = scout_deck();
        d.cards[0].unless = Some(Deeds::One(SCOUTED.into()));
        assert!(
            d.validate(&map)
                .unwrap_err()
                .0
                .contains("only a choice may read")
        );

        let mut d = scout_deck();
        d.cards[0].choices[0].effects.push(Effect::Remember {
            deed: SCOUTED.into(),
        });
        assert!(d.validate(&map).unwrap_err().0.contains("is not a deed"));

        let mut d = scout_deck();
        d.cards[0].when = When::Night;
        assert!(d.validate(&map).unwrap_err().0.contains("only a road card"));

        // `scouted` is a case like a deed: a forewarned choice that makes four fails.
        let mut d = scout_deck();
        d.cards[0].choices[1].unless = None;
        let hide = Choice {
            id: "hide".into(),
            if_deeds: None,
            effects: vec![Effect::Delay { minutes: 20 }],
            ..d.cards[0].choices[2].clone()
        };
        d.cards[0].choices.push(hide);
        assert_eq!(
            d.validate(&map).unwrap_err().0,
            "card willows offers 4 choices when the deeds remembered are [scouted]; it needs 2 or 3"
        );

        // A scout skill and a forewarned choice go together, one of each (MAP-11).
        let mut d = scout_deck();
        d.cards[0].scout = None;
        assert_eq!(
            d.validate(&map).unwrap_err().0,
            "card willows has a choice under if: scouted but no scout skill"
        );
        let mut d = scout_deck();
        d.cards[0].choices.retain(|c| c.if_deeds.is_none());
        d.cards[0].choices[1].unless = None;
        assert_eq!(
            d.validate(&map).unwrap_err().0,
            "card willows has a scout skill but no choice under if: scouted"
        );
        let mut d = scout_deck();
        let again = Choice {
            id: "again".into(),
            ..d.cards[0].choices[2].clone()
        };
        d.cards[0].choices.push(again);
        assert_eq!(
            d.validate(&map).unwrap_err().0,
            "card willows has 2 choices under if: scouted; it needs one"
        );
        // The forewarned choice needs nothing more than the scout's look.
        let mut d = scout_deck();
        for c in d.cards[0]
            .choices
            .iter_mut()
            .filter(|c| c.if_deeds.is_some())
        {
            c.if_deeds = Some(Deeds::All(vec![SCOUTED.into(), "met_peddler".into()]));
        }
        assert_eq!(
            d.validate(&map).unwrap_err().0,
            "card willows's choice flank reads scouted with other deeds; a forewarned choice reads scouted alone"
        );
    }

    #[test]
    fn a_route_with_few_fight_cards_and_an_untagged_fight_with_persons_are_warned_of() {
        let map = small_map();
        let d = deck();
        let route: Vec<String> = map.places.iter().map(|p| p.id.clone()).take(2).collect();
        let fights = d.cards.iter().filter(|c| Deck::can_fight(c)).count();
        let warned = d.route_warnings(&map, &route);
        // The test deck's few fights: the route is named, and the build is not failed.
        if fights < 2 {
            assert_eq!(warned.len(), 1, "{warned:?}");
            assert!(warned[0].starts_with(&format!("the route {} meets ", route.join(" > "))));
            assert!(warned[0].ends_with("two or more are recommended"));
        }
        let mut two = d.clone();
        for card in two.cards.iter_mut().take(2) {
            card.zone = route[0].clone();
            card.choices[0].effects.push(Effect::Fight {
                monsters: vec![Monster::Stat("wolf".into())],
            });
        }
        assert!(two.route_warnings(&map, &route).is_empty());
        // No fixed route, no warning: the owner picks each road.
        assert!(d.route_warnings(&map, &[]).is_empty());

        // Wolves are beasts; a goblin is a person, so its fight names a custom.
        let person = |m: &Monster| m.stat() != "wolf";
        assert!(two.untagged_fight_warnings(person).is_empty());
        two.cards[0].choices[0].effects = vec![Effect::Fight {
            monsters: vec![Monster::Stat("goblin_warrior".into())],
        }];
        let untagged = two.untagged_fight_warnings(person);
        assert_eq!(untagged.len(), 1);
        assert!(
            untagged[0]
                .ends_with("comes to a fight with persons and names no custom it keeps or breaks")
        );
        two.cards[0].choices[0].breaks = vec!["no_blood_inside_gate".into()];
        assert!(two.untagged_fight_warnings(person).is_empty());
    }

    #[test]
    fn the_validator_checks_two_of_the_five_card_tests() {
        let map = small_map();
        // Every choice changes something later: an effect, or a deed.
        let mut d = deck();
        d.cards[0].choices[1].effects.clear();
        let idle = d.validate(&map).unwrap_err().0;
        assert!(
            idle.ends_with("changes nothing: give it an effect or a deed"),
            "{idle}"
        );
        // No two choices offered together alike.
        let mut d = deck();
        d.cards[0].choices[1].effects = d.cards[0].choices[0].effects.clone();
        let alike = d.validate(&map).unwrap_err().0;
        assert!(
            alike.ends_with("do the same: their effects are alike"),
            "{alike}"
        );
        // Two alike that are never offered together pass: a variant replaces its choice.
        let mut d = deed_deck();
        let variant = d.cards[1]
            .choices
            .iter()
            .position(|c| c.unless.is_some())
            .unwrap();
        let other = d.cards[1]
            .choices
            .iter()
            .position(|c| c.if_deeds.is_some())
            .unwrap();
        d.cards[1].choices[other].effects = d.cards[1].choices[variant].effects.clone();
        d.validate(&map).unwrap();
    }
}
