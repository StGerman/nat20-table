//! Travel: the world's state and a journey leg along one road.
//!
//! Pace follows the SRD 5.2.1 Travel Pace table (Fast 4 miles an hour and 30 a day,
//! Normal 3 and 24, Slow 2 and 18). A road's terrain caps the pace, a good road raises
//! the cap by one step, and a party with a member at half Speed or less moves at a Slow
//! pace (Gameplay Toolbox, Travel Pace). Travelers in a wagon choose a pace as normal.
//!
//! A day of travel is one day's distance at the pace: a leg stops on the road when the
//! day's distance is spent, and the caravan goes on after a night. Mixed paces in one
//! day share the budget in proportion: a mile at Fast spends 1/30 of the day, at Normal
//! 1/24, at Slow 1/18. Extended travel past that (the Constitution saves) is not
//! offered.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::{
    caravan::{Caravan, CaravanError, Goods, Owner},
    clock::Clock,
    company::{CompanyEntry, CompanyFile, RIDES_PREFIX, owner_dead_deed},
    deck::{
        Card, Deck, DeckError, DeckState, Deed, DeedBook, Deeds, Drawn, OWNER_CAST, Once,
        PickError, ScoutSkill, When,
    },
    dice::WorldDice,
    escort::{EscortState, EscortTerms, Wage},
    map::{MapError, Position, WorldMap},
    npcs::{self, NpcDef, NpcFile, NpcState},
};

/// The hour the party wakes after a night.
pub const WAKE_HOUR: u32 = 6;

/// A Long Rest lasts at least 8 hours (SRD 5.2.1).
pub const LONG_REST_MINUTES: u32 = 8 * 60;

/// The good id of rations: one unit is a day's food for one Small or Medium creature
/// (SRD 5.2.1, Rations).
pub const RATIONS: &str = "rations";

/// A day's travel budget: the least common multiple of 30, 24 and 18 miles, so every
/// pace spends a whole number of units per mile.
const DAY_BUDGET: u32 = 360;

/// How fast the party travels (SRD 5.2.1, Travel Pace).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Pace {
    /// 2 miles an hour, 18 a day
    Slow,
    /// 3 miles an hour, 24 a day
    Normal,
    /// 4 miles an hour, 30 a day
    Fast,
}

impl Pace {
    /// Miles in an hour.
    pub fn miles_per_hour(self) -> u32 {
        match self {
            Pace::Fast => 4,
            Pace::Normal => 3,
            Pace::Slow => 2,
        }
    }

    /// Miles in a day.
    pub fn miles_per_day(self) -> u32 {
        match self {
            Pace::Fast => 30,
            Pace::Normal => 24,
            Pace::Slow => 18,
        }
    }

    /// One step faster, Fast staying Fast.
    pub fn faster(self) -> Pace {
        match self {
            Pace::Slow => Pace::Normal,
            Pace::Normal | Pace::Fast => Pace::Fast,
        }
    }

    fn budget_per_mile(self) -> u32 {
        DAY_BUDGET / self.miles_per_day()
    }
}

/// What the world remembers between calls, and what a roster saves: the time, where the
/// caravan is, what the party has discovered, the caravan, and the day's travel so far.
///
/// Two parts (ENG-37, decision 0063): the **memory** (the clock, the discovered places, the
/// deeds, the deck but the card on the table and the `once: "contract"` marks, the place NPCs,
/// the contract count) outlives a contract; the **contract** (its pack, where the caravan is,
/// the caravan, the day's travel, the escort, the card on the table) is rebuilt from the next
/// pack's campaign file by [`World::carry_memory`]. Roster format 2 (API-51) saves them apart.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorldState {
    /// The time
    pub clock: Clock,
    /// Where the caravan is
    pub at: Position,
    /// Place ids the party knows
    pub discovered: BTreeSet<String>,
    /// The caravan
    pub caravan: Caravan,
    /// The day's travel budget spent, in 1/360 of a day's distance
    pub traveled_today: u32,
    /// The road event deck: what is in play, the discard, the card on the table
    #[serde(default)]
    pub deck: DeckState,
    /// The place NPCs, by id: what each visit left them with (API-48)
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub npcs: BTreeMap<String, NpcState>,
    /// The escort contract: days served, pay so far, the merchant's purse (API-47)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub escort: Option<EscortState>,
    /// The deeds the world remembers, by id (ENG-33): DM-only
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub deeds: DeedBook,
    /// The pack whose contract this is, by its campaign file's `id` (ENG-38): part of the
    /// contract, so a roster with a contract under way opens only that pack
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pack: Option<String>,
    /// The contract under way: 1 for the first, the number a deed records; left out of the
    /// saved state while it is 1
    #[serde(default = "first_contract", skip_serializing_if = "is_first_contract")]
    pub contract: u32,
    /// The Hired Blade who walks ahead as the scout (API-54), until another takes the role:
    /// part of the contract
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scout: Option<String>,
}

fn first_contract() -> u32 {
    1
}

fn is_first_contract(contract: &u32) -> bool {
    *contract == 1
}

/// The miles a party travels in a day between contracts: a normal pace (SRD 5.2.1 Travel
/// Pace, 24 miles a day).
pub const MILES_PER_DAY_BETWEEN: u32 = 24;

/// A world state as roster format 2 saves it (API-51): the memory and the contract apart, as
/// [`WorldState`] describes them. [`World::carry_memory`] keeps the memory and rebuilds the
/// contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SavedWorld {
    /// What outlives a contract
    pub memory: Memory,
    /// What the next contract rebuilds; absent when a pack with no campaign saved the world
    /// (a site session, ENG-44): it has a memory and no contract
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contract: Option<ContractState>,
}

/// The world's memory (ENG-37): kept when a contract is done.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Memory {
    /// The time
    pub clock: Clock,
    /// Place ids the party knows
    pub discovered: BTreeSet<String>,
    /// The deeds the world remembers, by id: DM-only
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub deeds: DeedBook,
    /// The deck: chained cards added, the discard, the cards gone for the world, the soon queue
    #[serde(default)]
    pub deck: DeckState,
    /// The place NPCs, by id
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub npcs: BTreeMap<String, NpcState>,
    /// The contract under way: 1 for the first
    #[serde(default = "first_contract", skip_serializing_if = "is_first_contract")]
    pub contract: u32,
    /// The place the party was left at, when no contract part says where (a site session,
    /// ENG-44); a saved contract's own position wins
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left_at: Option<String>,
}

impl Memory {
    /// A new world's memory: day 1 at `hour`, contract 1, nothing known or remembered (ENG-44).
    pub fn new(hour: u32) -> Self {
        Memory {
            clock: Clock::at(1, hour, 0),
            discovered: BTreeSet::new(),
            deeds: DeedBook::new(),
            deck: DeckState::default(),
            npcs: BTreeMap::new(),
            contract: first_contract(),
            left_at: None,
        }
    }

    /// Remembers a deed done today by `by` in the contract under way, as [`World::remember`]
    /// does. Returns whether it is new.
    pub fn remember(&mut self, deed: &str, by: Vec<String>, saw: Vec<String>) -> bool {
        remember_in(
            &mut self.deeds,
            deed,
            by,
            saw,
            self.clock.day,
            self.contract,
        )
    }

    /// This memory taken up at `start` by the next contract or site (ENG-37, ENG-44): the
    /// contract count goes up by one, and the clock moves to `start_hour` on the day after the
    /// saved day plus the trip from `from` at a normal pace (one day per
    /// [`MILES_PER_DAY_BETWEEN`] miles by the shortest road, rounded up). A party saved on a
    /// road starts from whichever end of it is nearer `start` (ENG-41). The deck keeps what the
    /// world keeps and drops the card on the table and the `once: "contract"` marks.
    pub fn carried(
        mut self,
        map: &WorldMap,
        from: &Position,
        start: &str,
        start_hour: u32,
    ) -> (Self, Carried) {
        let via = |end: &str, left: u32| {
            map.miles_between(end, start)
                .map(|m| (left + m, end.to_string()))
        };
        let (miles, from) = match from {
            Position::At { place } => via(place, 0).unwrap_or((0, place.clone())),
            // On a road, the party goes on or turns back, whichever end is nearer the start
            // (ENG-41); an end with no road to the start never counts as nearer.
            Position::OnRoad {
                road,
                toward,
                miles_left,
            } => {
                let on = via(toward, *miles_left);
                // A position past the road's length (a map changed since the save) never turns
                // back for free.
                let back = map
                    .road(road)
                    .and_then(|r| via(r.other_end(toward)?, r.miles.checked_sub(*miles_left)?));
                match (on, back) {
                    (Some(on), Some(back)) if back.0 < on.0 => back,
                    (Some(on), _) => on,
                    (None, Some(back)) => back,
                    (None, None) => (*miles_left, toward.clone()),
                }
            }
        };
        let days = miles.div_ceil(MILES_PER_DAY_BETWEEN);
        self.deck.pending = None;
        self.deck.offered.clear();
        self.deck.road = None;
        self.deck.gone_for_contract.clear();
        self.clock = Clock::at(self.clock.day + 1 + days, start_hour, 0);
        self.contract += 1;
        self.left_at = None;
        (self, Carried { from, days })
    }
}

/// The contract under way (ENG-37): rebuilt from the next pack's campaign file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContractState {
    /// Where the caravan is
    pub at: Position,
    /// The caravan
    pub caravan: Caravan,
    /// The day's travel budget spent
    pub traveled_today: u32,
    /// The deck's contract part: the `once: "contract"` marks, the cards offered or on the
    /// table, the road that drew them
    #[serde(default)]
    pub deck: DeckState,
    /// The escort contract
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub escort: Option<EscortState>,
    /// The pack whose contract this is
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pack: Option<String>,
    /// Who walks ahead as the scout
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scout: Option<String>,
}

impl From<WorldState> for SavedWorld {
    fn from(state: WorldState) -> Self {
        let deck = state.deck;
        SavedWorld {
            memory: Memory {
                clock: state.clock,
                discovered: state.discovered,
                deeds: state.deeds,
                deck: DeckState {
                    added: deck.added,
                    discard: deck.discard,
                    gone: deck.gone,
                    soon: deck.soon,
                    ..DeckState::default()
                },
                npcs: state.npcs,
                contract: state.contract,
                left_at: None,
            },
            contract: Some(ContractState {
                at: state.at,
                caravan: state.caravan,
                traveled_today: state.traveled_today,
                deck: DeckState {
                    gone_for_contract: deck.gone_for_contract,
                    offered: deck.offered,
                    pending: deck.pending,
                    road: deck.road,
                    ..DeckState::default()
                },
                escort: state.escort,
                pack: state.pack,
                scout: state.scout,
            }),
        }
    }
}

impl SavedWorld {
    /// The world state to take up, when a contract was saved; a memory-only world (a site
    /// session, ENG-44) is never resumed and gives its memory back instead.
    pub fn resume(self) -> Result<WorldState, Box<Memory>> {
        let SavedWorld { memory, contract } = self;
        let Some(contract) = contract else {
            return Err(Box::new(memory));
        };
        Ok(WorldState {
            clock: memory.clock,
            at: contract.at,
            discovered: memory.discovered,
            caravan: contract.caravan,
            traveled_today: contract.traveled_today,
            deck: DeckState {
                added: memory.deck.added,
                discard: memory.deck.discard,
                // A gone card in the queue is a dead id: rosters saved before ENG-40 can hold one.
                soon: memory
                    .deck
                    .soon
                    .into_iter()
                    .filter(|c| !memory.deck.gone.contains(c))
                    .collect(),
                gone: memory.deck.gone,
                gone_for_contract: contract.deck.gone_for_contract,
                offered: contract.deck.offered,
                pending: contract.deck.pending,
                road: contract.deck.road,
                cast_dead: BTreeSet::new(),
            },
            npcs: memory.npcs,
            escort: contract.escort,
            deeds: memory.deeds,
            pack: contract.pack,
            contract: memory.contract,
            scout: contract.scout,
        })
    }
}

/// How a new contract took up the world a finished one left (ENG-37).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Carried {
    /// Where the party set out from: the place it was in when the last contract ended, or,
    /// out on a road, the end of that road nearer the new start (ENG-41)
    pub from: String,
    /// The days the trip to the new contract's start took, at a normal pace: 0 when the party
    /// was already there
    pub days: u32,
}

/// The world: the map and goods files, the route an NPC owner follows, and the state.
#[derive(Debug, Clone)]
pub struct World {
    /// The map file
    pub map: WorldMap,
    /// The goods file
    pub goods: Goods,
    /// Place ids in the order an NPC owner travels them
    pub route: Vec<String>,
    /// The road event deck; empty until [`World::with_deck`]
    pub deck: Deck,
    /// The place NPCs; none until [`World::with_npcs`]
    pub npcs: Vec<NpcDef>,
    /// The escort contract's terms; none until [`World::with_escort`]
    pub escort: Option<EscortTerms>,
    /// Who may ride with the wagon (ENG-48); none until [`World::with_company`]
    pub company: Vec<CompanyEntry>,
    /// What changes
    pub state: WorldState,
}

/// One journey leg along one road.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Leg {
    /// The road
    pub road: String,
    /// The deck zone of the road
    pub zone: String,
    /// The place the caravan heads for
    pub toward: String,
    /// The pace
    pub pace: Pace,
    /// Miles covered
    pub miles: u32,
    /// Minutes the leg took
    pub minutes: u32,
    /// Whether the caravan reached `toward`; if not, it stopped on the road for the day
    pub arrived: bool,
    /// Whether arriving discovered `toward`
    pub discovered: bool,
}

/// Why a journey leg was refused. Nothing changes on a refusal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TravelError {
    /// No road from here leads there (a place id or road id)
    NoRoad {
        /// What was asked for
        to: String,
    },
    /// A player owns the caravan, so the leg needs a destination
    NeedDestination,
    /// An NPC owner has no next place on the route
    RouteDone,
    /// The pace is faster than the road or the party allows
    PaceTooFast {
        /// The fastest pace allowed
        max: Pace,
    },
    /// The day's travel is spent; rest first
    DayOver,
    /// A wagon is over its limit, or its cargo names an unknown good
    Caravan(CaravanError),
}

impl std::fmt::Display for TravelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TravelError::NoRoad { to } => write!(f, "no road from here to {to}"),
            TravelError::NeedDestination => write!(f, "say where the caravan goes"),
            TravelError::RouteDone => write!(f, "the route has no next place"),
            TravelError::PaceTooFast { max } => write!(f, "the fastest pace here is {max:?}"),
            TravelError::DayOver => write!(f, "the day's travel is spent; rest first"),
            TravelError::Caravan(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for TravelError {}

impl World {
    /// A world at the start of a campaign: the caravan in `start` at `clock`, knowing
    /// the places the map marks discovered and `start`.
    pub fn new(
        map: WorldMap,
        goods: Goods,
        route: Vec<String>,
        caravan: Caravan,
        start: &str,
        clock: Clock,
    ) -> Result<Self, MapError> {
        map.validate()?;
        goods
            .validate()
            .map_err(|e| MapError(format!("the goods file: {e}")))?;
        if map.place(start).is_none() {
            return Err(MapError(format!("the start {start} is not a place")));
        }
        if let Some(stop) = route.iter().find(|p| map.place(p).is_none()) {
            return Err(MapError(format!("the route names unknown place {stop}")));
        }
        let mut discovered: BTreeSet<String> = map
            .places
            .iter()
            .filter(|p| p.discovered)
            .map(|p| p.id.clone())
            .collect();
        discovered.insert(start.to_string());
        Ok(Self {
            map,
            goods,
            route,
            state: WorldState {
                clock,
                at: Position::At {
                    place: start.to_string(),
                },
                discovered,
                caravan,
                traveled_today: 0,
                deck: DeckState::default(),
                deeds: DeedBook::new(),
                pack: None,
                contract: first_contract(),
                npcs: BTreeMap::new(),
                escort: None,
                scout: None,
            },
            deck: Deck::default(),
            npcs: Vec::new(),
            escort: None,
            company: Vec::new(),
        })
    }

    /// The world with its road event deck, checked against the map.
    pub fn with_deck(mut self, deck: Deck) -> Result<Self, DeckError> {
        deck.validate(&self.map)?;
        self.deck = deck;
        Ok(self)
    }

    /// The world with its place NPCs, checked against the map. Call it after the state is
    /// final (a roster's state included): NPCs the state doesn't know start as the file says.
    pub fn with_npcs(mut self, file: NpcFile) -> Result<Self, MapError> {
        file.validate(&self.map)?;
        npcs::settle(&file.npcs, &mut self.state.npcs);
        self.npcs = file.npcs;
        Ok(self)
    }

    /// The world with who may ride with the wagon (ENG-48), checked against the roster and
    /// the deck (rule A9): so after [`World::with_deck`] and [`World::with_npcs`].
    pub fn with_company(mut self, file: CompanyFile) -> Result<Self, MapError> {
        file.validate(&self.npcs)?;
        file.check_readers(&self.deck)?;
        self.company = file.company;
        Ok(self)
    }

    /// The company entries that ride on the contract under way (rule A2), in file order.
    pub fn riding(&self) -> Vec<&CompanyEntry> {
        self.company
            .iter()
            .filter(|e| {
                let alive = e
                    .npc
                    .as_ref()
                    .is_none_or(|n| self.state.npcs.get(n).is_some_and(|s| s.alive));
                e.rides(&self.state.deeds, self.state.contract, alive)
            })
            .collect()
    }

    /// The deeds a card is offered against: the deeds remembered, and `rides:<id>` for each
    /// company entry that rides now (ENG-48).
    pub fn deeds_now(&self) -> DeedBook {
        let mut deeds = self.state.deeds.clone();
        for entry in self.riding() {
            deeds.insert(
                format!("{RIDES_PREFIX}{}", entry.id),
                Deed {
                    by: Vec::new(),
                    day: self.state.clock.day,
                    contract: self.state.contract,
                    saw: Vec::new(),
                },
            );
        }
        deeds
    }

    /// The world with an escort contract, checked against the map. `blades` are the Hired
    /// Blades in party order. A state that already holds the contract (a roster's) keeps it;
    /// otherwise it starts now and the advance is due: the payments are returned.
    pub fn with_escort(
        mut self,
        terms: EscortTerms,
        blades: Vec<String>,
    ) -> Result<(Self, Vec<Wage>), MapError> {
        terms.validate(&self.map)?;
        // The death card (ENG-49, rule M1) reads the owner's death in its own `if` and goes
        // once, so no draw can take it before the engine puts it on the table, or after.
        if let (Some(card), Owner::Npc(owner)) = (&terms.death_card, &self.state.caravan.owner) {
            let deed = owner_dead_deed(owner);
            let fits = self.deck.card(card).is_some_and(|c| {
                c.once == Once::WORLD
                    && c.if_deeds.as_ref().is_some_and(|d| d.ids().contains(&deed))
            });
            if !fits {
                return Err(MapError(format!(
                    "the escort's death_card {card} is not a card of the deck that goes once and reads {deed} in its if"
                )));
            }
        }
        // Rule A9 for the owner (ENG-49): a wagon fight can kill the NPC owner, so the death
        // needs a reader that speaks: a card or choice with it in `if`, the death card among them.
        if let Owner::Npc(owner) = &self.state.caravan.owner
            && self.deck.owner_may_fall()
            && !self.deck.read_in_if().contains(&owner_dead_deed(owner))
        {
            return Err(MapError(format!(
                "a wagon fight can kill {owner}, and no card or choice reads {} in its if",
                owner_dead_deed(owner)
            )));
        }
        let advance = match &self.state.escort {
            Some(_) => Vec::new(),
            None => {
                let mut state = EscortState::new(&terms, blades);
                let advance = state.advance(&terms);
                self.state.escort = Some(state);
                advance
            }
        };
        self.escort = Some(terms);
        Ok((self, advance))
    }

    /// The living NPCs of `place`, in file order.
    pub fn npcs_at<'a>(
        &'a self,
        place: &'a str,
    ) -> impl Iterator<Item = (&'a NpcDef, &'a NpcState)> + 'a {
        self.npcs
            .iter()
            .filter(move |d| d.place.as_deref() == Some(place))
            .filter_map(|d| {
                self.state
                    .npcs
                    .get(&d.id)
                    .filter(|s| s.alive)
                    .map(|s| (d, s))
            })
    }

    /// Whether the caravan's NPC owner is dead (ENG-49).
    pub fn owner_dead(&self) -> bool {
        matches!(&self.state.caravan.owner, Owner::Npc(id) if self.state.npcs.get(id).is_some_and(|s| !s.alive))
    }

    /// Puts the escort's death card on the table when it is due (ENG-49, rule M1): the NPC
    /// owner is dead, the contract is under way, nothing waits on the table, and the card has
    /// not been put before. Returns the card put.
    pub fn put_death_card(&mut self) -> Option<String> {
        let card = self.escort.as_ref()?.death_card.clone()?;
        let under_way = self.state.escort.as_ref().is_some_and(|e| !e.done);
        if !under_way
            || !self.owner_dead()
            || self.state.deck.waiting()
            || self.state.deck.gone.contains(&card)
        {
            return None;
        }
        let deeds = self.deeds_now();
        self.deck
            .put_card(&card, &deeds, &mut self.state.deck)
            .then_some(card)
    }

    /// Shares the escort's purse out among the Blades who are `alive` (ENG-49): the shares, in
    /// party order. Nothing while the NPC owner lives (rule M3), or once settled or shared.
    pub fn share_purse(&mut self, alive: impl Fn(&str) -> bool) -> Vec<Wage> {
        if !self.owner_dead() {
            return Vec::new();
        }
        self.state
            .escort
            .as_mut()
            .map(|e| e.share(alive))
            .unwrap_or_default()
    }

    /// Who of a card's cast is dead (API-58, rule A8), for the next draw: every roster person
    /// the world holds dead, and `owner` when the caravan's NPC owner is one of them.
    fn mark_cast_dead(&mut self) {
        let dead: BTreeSet<String> = self
            .state
            .npcs
            .iter()
            .filter(|(_, s)| !s.alive)
            .map(|(id, _)| id.clone())
            .collect();
        let owner_dead = self.owner_dead();
        self.state.deck.cast_dead = dead;
        if owner_dead {
            self.state.deck.cast_dead.insert(OWNER_CAST.to_owned());
        }
    }

    /// Checks every card's `cast` and `tells` (API-58): each a roster person's id or `owner`.
    pub fn check_cast(&self) -> Result<(), MapError> {
        for card in &self.deck.cards {
            for who in card.cast.iter().chain(&card.tells) {
                if who != OWNER_CAST && !self.npcs.iter().any(|n| n.id == *who) {
                    return Err(MapError(format!(
                        "the card {} names {who} in its cast or tells, who is not in the roster",
                        card.id
                    )));
                }
            }
        }
        Ok(())
    }

    /// The place the caravan is in, if it is in one.
    pub fn place_here(&self) -> Option<&str> {
        match &self.state.at {
            Position::At { place } => Some(place),
            Position::OnRoad { .. } => None,
        }
    }

    /// The deck zone where the caravan is: its road's zone on a road, else the place's id
    /// (a place's own cards).
    pub fn zone_here(&self) -> String {
        match &self.state.at {
            Position::OnRoad { road, .. } => self
                .map
                .road(road)
                .map(|r| r.zone.clone())
                .unwrap_or_default(),
            Position::At { place } => place.clone(),
        }
    }

    /// Takes up the memory of the world a finished contract left, for a world just built
    /// from the next contract's campaign file (ENG-37, decision 0063 Q1 and Q2): the clock,
    /// the discovered places, the deeds, the deck (but the card on the table and the
    /// `once: "contract"` marks) and the place NPCs come from `saved`; the caravan, where it
    /// stands and the day's travel stay this world's. The contract count goes up by one. The
    /// clock never goes back: the contract starts at `start_hour` on the day after the saved
    /// day, plus the days the trip from where the party was takes at a normal pace (one day per
    /// [`MILES_PER_DAY_BETWEEN`] miles by the shortest road, rounded up). A party saved on a
    /// road starts from whichever end of it is nearer, and `from` names that end.
    pub fn carry_memory(&mut self, saved: WorldState, start_hour: u32) -> Carried {
        let from = saved.at.clone();
        self.carry(&from, SavedWorld::from(saved).memory, start_hour)
    }

    /// Takes up a saved memory as [`World::carry_memory`] does, the party setting out from
    /// `from`: a finished contract's position, or the place a site session left it at
    /// ([`Memory::left_at`], ENG-44).
    pub fn carry(&mut self, from: &Position, memory: Memory, start_hour: u32) -> Carried {
        let start = self.place_here().unwrap_or_default().to_string();
        let (memory, carried) = memory.carried(&self.map, from, &start, start_hour);
        let mut discovered = memory.discovered;
        discovered.extend(std::mem::take(&mut self.state.discovered));
        self.state.clock = memory.clock;
        self.state.discovered = discovered;
        self.state.deeds = memory.deeds;
        self.state.deck = memory.deck;
        self.state.npcs = memory.npcs;
        self.state.contract = memory.contract;
        carried
    }

    /// Remembers a deed done today by `by` in the contract under way, seen by the roster
    /// people in `saw` (API-59). A deed done again keeps its first record. Returns whether it
    /// is new.
    pub fn remember(&mut self, deed: &str, by: Vec<String>, saw: Vec<String>) -> bool {
        let state = &mut self.state;
        remember_in(
            &mut state.deeds,
            deed,
            by,
            saw,
            state.clock.day,
            state.contract,
        )
    }

    /// The roster ids a card's `cast` names: `owner` is the caravan's NPC owner, if an NPC
    /// owns it (API-59).
    pub fn cast_of(&self, card: &str) -> Vec<String> {
        self.people_of(card, |c| &c.cast)
    }

    /// The roster ids a card's `tells` names, `owner` resolved as in [`World::cast_of`].
    pub fn tells_of(&self, card: &str) -> Vec<String> {
        self.people_of(card, |c| &c.tells)
    }

    fn people_of(&self, card: &str, list: impl Fn(&Card) -> &Vec<String>) -> Vec<String> {
        let Some(card) = self.deck.card(card) else {
            return Vec::new();
        };
        list(card)
            .iter()
            .filter_map(|who| match (who.as_str(), &self.state.caravan.owner) {
                (OWNER_CAST, Owner::Npc(id)) => Some(id.clone()),
                (OWNER_CAST, _) => None,
                (id, _) => Some(id.to_owned()),
            })
            .collect()
    }

    /// Everyone in `party` sees roster person `id` here (API-59): at the place the caravan is
    /// at, or on the road. A sight also makes them more than a name heard.
    pub fn seen_by(&mut self, id: &str, party: &[String]) {
        let here = self.place_here().map(str::to_owned);
        if let Some(state) = self.state.npcs.get_mut(id) {
            for who in party {
                state.seen.insert(who.clone(), here.clone());
                state.heard.remove(who);
            }
        }
    }

    /// A roster saved before API-59 (rule N7): a person it holds met reads as seen by the
    /// whole of `party`, at the place they live.
    pub fn seen_from_met(&mut self, party: &[String]) {
        for def in &self.npcs {
            if let Some(state) = self.state.npcs.get_mut(&def.id)
                && state.met
                && state.seen.is_empty()
            {
                for who in party {
                    state.seen.insert(who.clone(), def.place.clone());
                }
            }
        }
    }

    /// Everyone in `party` who has not seen roster person `id` hears of them (API-59).
    pub fn heard_by(&mut self, id: &str, party: &[String]) {
        if let Some(state) = self.state.npcs.get_mut(id) {
            for who in party {
                if !state.seen.contains_key(who) {
                    state.heard.insert(who.clone());
                }
            }
        }
    }

    /// Roster people `saw` are shown deed `deed` (API-59): a card read it while they were on
    /// it. A deed not remembered takes nobody.
    pub fn shown_deed(&mut self, deed: &str, saw: &[String]) {
        if let Some(record) = self.state.deeds.get_mut(deed) {
            for who in saw {
                if !record.saw.contains(who) {
                    record.saw.push(who.clone());
                }
            }
        }
    }

    /// The card `card` is shown (API-59): its cast sees the party, its `tells` are heard of,
    /// and the cast is shown every deed the card's own `if` reads.
    pub fn card_shown(&mut self, card: &str, party: &[String]) {
        let cast = self.cast_of(card);
        for id in &cast {
            self.seen_by(id, party);
        }
        for id in self.tells_of(card) {
            self.heard_by(&id, party);
        }
        let read = self.deck.card(card).and_then(|c| c.if_deeds.clone());
        self.shown_if(read.as_ref(), &cast);
    }

    /// Choice `choice` of card `card` is chosen (API-59): the card's cast is shown every deed
    /// the choice's `if` reads.
    pub fn choice_chosen(&mut self, card: &str, choice: &str) {
        let cast = self.cast_of(card);
        let read = self
            .deck
            .card(card)
            .and_then(|c| c.choices.iter().find(|ch| ch.id == choice))
            .and_then(|ch| ch.if_deeds.clone());
        self.shown_if(read.as_ref(), &cast);
    }

    /// Shows `cast` every deed an `if` reads.
    fn shown_if(&mut self, read: Option<&Deeds>, cast: &[String]) {
        for deed in read.map(Deeds::ids).unwrap_or_default() {
            self.shown_deed(deed, cast);
        }
    }

    /// Draws after a leg along `road`. Returns what the draw did: a card on the table, or cards
    /// offered for the DM's pick (API-53); none when the zone has no card in play.
    pub fn draw_after_leg(&mut self, road: &str, dice: &mut impl WorldDice) -> Option<Drawn> {
        self.mark_cast_dead();
        let zone = self.map.road(road)?.zone.clone();
        let deeds = self.deeds_now();
        let drawn = self.deck.draw(
            &zone,
            When::Road,
            &self.state.discovered,
            &deeds,
            &mut self.state.deck,
            dice,
        );
        if drawn.is_some() {
            self.state.deck.road = Some(road.to_owned());
        }
        drawn
    }

    /// Draws an arrival card of `place` when a leg ends there (ENG-35): on the table, or
    /// offered for a pick (API-53).
    pub fn draw_on_arrival(&mut self, place: &str, dice: &mut impl WorldDice) -> Option<Drawn> {
        self.mark_cast_dead();
        let deeds = self.deeds_now();
        let drawn = self.deck.draw(
            place,
            When::Arrival,
            &self.state.discovered,
            &deeds,
            &mut self.state.deck,
            dice,
        );
        if drawn.is_some() {
            self.state.deck.road = None;
        }
        drawn
    }

    /// The scout's check for the card on the table (API-54): who rolls, with what skill, and
    /// the Search DC of the road's terrain. None when nobody walks ahead, the card names no
    /// `scout` skill, or it is a night or arrival card; the server also skips a scout who is
    /// not up.
    pub fn scout_check(&self) -> Option<(String, ScoutSkill, u32)> {
        let scout = self.state.scout.clone()?;
        let pending = self.state.deck.pending.as_ref()?;
        let card = self.deck.card(&pending.card)?;
        if card.when != When::Road {
            return None;
        }
        let skill = card.scout?;
        let road = self.map.road(self.state.deck.road.as_deref()?)?;
        Some((scout, skill, road.terrain.search_dc()))
    }

    /// The scout's check succeeded (API-54): the card on the table opens its forewarned
    /// choice. Returns whether the choices changed.
    pub fn forewarn(&mut self) -> bool {
        let deeds = self.deeds_now();
        self.deck.forewarn(&deeds, &mut self.state.deck)
    }

    /// Takes off the offered cards each one whose `cast` holds someone who died since the
    /// draw offered it (rule A8, API-58), so neither the DM nor a fallback can pick it.
    pub fn drop_dead_offers(&mut self) {
        self.mark_cast_dead();
        let (deck, state) = (&self.deck, &mut self.state.deck);
        let dead = &state.cast_dead;
        let keep: Vec<String> = state
            .offered
            .iter()
            .filter(|id| {
                deck.card(id)
                    .is_none_or(|c| !c.cast.iter().any(|p| dead.contains(p)))
            })
            .cloned()
            .collect();
        state.offered = keep;
    }

    /// The DM picks one of the offered cards (API-53): it goes on the table.
    pub fn pick_card(&mut self, card: &str) -> Result<(), PickError> {
        let deeds = self.deeds_now();
        self.deck.pick(card, &deeds, &mut self.state.deck)
    }

    /// Draws a night card after a night in camp where the caravan is: on the table, or offered
    /// for a pick (API-53).
    pub fn draw_at_night(&mut self, dice: &mut impl WorldDice) -> Option<Drawn> {
        self.mark_cast_dead();
        let zone = self.zone_here();
        let deeds = self.deeds_now();
        let drawn = self.deck.draw(
            &zone,
            When::Night,
            &self.state.discovered,
            &deeds,
            &mut self.state.deck,
            dice,
        );
        if drawn.is_some() {
            self.state.deck.road = None;
        }
        drawn
    }

    /// Time lost to a road event: the clock moves on and the day's travel shrinks by as
    /// much, an 8-hour travel day being the whole day's distance. A part of a budget unit is
    /// rounded up, so delays never leave more travel than the time they took allows: eight
    /// one-minute delays cost at least what one eight-minute delay costs.
    pub fn delay(&mut self, minutes: u32) {
        self.state.clock.advance(minutes);
        let spent = minutes.saturating_mul(DAY_BUDGET).div_ceil(8 * 60);
        self.state.traveled_today = self
            .state
            .traveled_today
            .saturating_add(spent)
            .min(DAY_BUDGET);
    }

    /// Starts a new day of travel (after a night): the whole day's distance is
    /// available again.
    pub fn start_travel_day(&mut self) {
        self.state.traveled_today = 0;
    }

    /// How long a night from now lasts, in minutes: until the next dawn ([`WAKE_HOUR`]),
    /// but never shorter than a Long Rest's 8 hours (SRD 5.2.1).
    pub fn night_minutes(&self) -> u32 {
        let mut dawn = self.state.clock;
        dawn.advance_to_hour(WAKE_HOUR).max(LONG_REST_MINUTES)
    }

    /// Passes a night of `minutes`: the clock moves on and a new day of travel starts.
    pub fn pass_night(&mut self, minutes: u32) {
        self.state.clock.advance(minutes);
        self.start_travel_day();
    }

    /// The miles the party can still cover today at `pace`.
    pub fn miles_left_today(&self, pace: Pace) -> u32 {
        DAY_BUDGET.saturating_sub(self.state.traveled_today) / pace.budget_per_mile()
    }

    /// Travels one leg: toward `to` (a neighbouring place id or a road id) or, without
    /// `to`, on along the road or the NPC owner's route. Goes as far as the day allows
    /// and stops on the road when the day's distance is spent. `slowed` means a party
    /// member's Speed is at half or less, which forces a Slow pace.
    pub fn travel(
        &mut self,
        to: Option<&str>,
        pace: Pace,
        slowed: bool,
    ) -> Result<Leg, TravelError> {
        if let Some(error) = self
            .state
            .caravan
            .overloaded(&self.goods)
            .map_err(TravelError::Caravan)?
        {
            return Err(TravelError::Caravan(error));
        }
        let (road_id, toward, miles_left) = self.next_stretch(to)?;
        let road = self.map.road(&road_id).expect("checked by next_stretch");
        let max = if slowed { Pace::Slow } else { road.max_pace() };
        if pace > max {
            return Err(TravelError::PaceTooFast { max });
        }
        let can_go = self.miles_left_today(pace);
        if can_go == 0 {
            return Err(TravelError::DayOver);
        }
        let miles = miles_left.min(can_go);
        let minutes = miles * 60 / pace.miles_per_hour();
        let zone = road.zone.clone();
        self.state.traveled_today += miles * pace.budget_per_mile();
        self.state.clock.advance(minutes);
        let arrived = miles == miles_left;
        let discovered = arrived && self.state.discovered.insert(toward.clone());
        self.state.at = if arrived {
            Position::At {
                place: toward.clone(),
            }
        } else {
            Position::OnRoad {
                road: road_id.clone(),
                toward: toward.clone(),
                miles_left: miles_left - miles,
            }
        };
        Ok(Leg {
            road: road_id,
            zone,
            toward,
            pace,
            miles,
            minutes,
            arrived,
            discovered,
        })
    }

    /// The road, the place it heads for and the miles to go for the next leg.
    fn next_stretch(&self, to: Option<&str>) -> Result<(String, String, u32), TravelError> {
        match &self.state.at {
            Position::At { place } => {
                let target = match to {
                    Some(to) => to.to_string(),
                    None => match &self.state.caravan.owner {
                        Owner::Player(_) => return Err(TravelError::NeedDestination),
                        Owner::Npc(_) => self.next_on_route(place)?,
                    },
                };
                let road = self
                    .map
                    .roads_from(place)
                    .find(|r| r.id == target || r.other_end(place) == Some(target.as_str()))
                    .ok_or(TravelError::NoRoad { to: target })?;
                let toward = road.other_end(place).expect("road from place").to_string();
                Ok((road.id.clone(), toward, road.miles))
            }
            Position::OnRoad {
                road,
                toward,
                miles_left,
            } => {
                let road = self.map.road(road).expect("the state names a map road");
                match to {
                    None => Ok((road.id.clone(), toward.clone(), *miles_left)),
                    Some(to) if to == toward || to == road.id => {
                        Ok((road.id.clone(), toward.clone(), *miles_left))
                    }
                    Some(to) if road.other_end(toward) == Some(to) => {
                        Ok((road.id.clone(), to.to_string(), road.miles - miles_left))
                    }
                    Some(to) => Err(TravelError::NoRoad { to: to.to_string() }),
                }
            }
        }
    }

    fn next_on_route(&self, place: &str) -> Result<String, TravelError> {
        self.route
            .iter()
            .position(|p| p == place)
            .and_then(|i| self.route.get(i + 1))
            .cloned()
            .ok_or(TravelError::RouteDone)
    }
}

/// Writes `deed` into `book` as done on `day` in `contract` by `by`, unless the book holds it
/// already: a deed done again keeps its first record. Returns whether it is new.
fn remember_in(
    book: &mut DeedBook,
    deed: &str,
    by: Vec<String>,
    saw: Vec<String>,
    day: u32,
    contract: u32,
) -> bool {
    if book.contains_key(deed) {
        return false;
    }
    let mut saw = saw;
    saw.sort();
    saw.dedup();
    book.insert(
        deed.to_string(),
        Deed {
            by,
            day,
            contract,
            saw,
        },
    );
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{caravan::tests as caravans, map::tests::small_map};

    fn world(owner: &str) -> World {
        World::new(
            small_map(),
            caravans::goods(),
            vec!["town".into(), "inn".into(), "ruin".into()],
            caravans::caravan(owner),
            "town",
            Clock::at(1, 8, 0),
        )
        .unwrap()
    }

    #[test]
    fn the_next_contract_keeps_the_memory_and_starts_after_the_saved_day() {
        let mut done = world("maren");
        done.remember("helped_farmer", vec!["bren".into()], vec![]);
        done.state.deck.gone.insert("ghost".into());
        done.state
            .deck
            .gone_for_contract
            .insert("fair_crowd".into());
        done.state.deck.discard.insert("mud".into());
        done.state.discovered.insert("ruin".into());
        done.state.at = Position::At {
            place: "inn".into(),
        };
        done.state.clock = Clock::at(2, 20, 0);
        // The next contract starts in town at 9:00: 12 miles from the inn is one day's trip.
        let mut next = world("maren");
        next.state.clock = Clock::at(1, 9, 0);
        let carried = next.carry_memory(done.state.clone(), 9);
        assert_eq!(
            carried,
            Carried {
                from: "inn".into(),
                days: 1
            }
        );
        assert_eq!(next.state.clock, Clock::at(4, 9, 0));
        assert_eq!(next.place_here(), Some("town"));
        assert_eq!(next.state.contract, 2);
        assert!(next.state.deeds.contains_key("helped_farmer"));
        assert!(
            next.state.deck.gone.contains("ghost"),
            "once is for the world"
        );
        assert!(
            next.state.deck.gone_for_contract.is_empty(),
            "once: contract comes back"
        );
        assert!(next.state.deck.discard.contains("mud"));
        assert!(next.state.discovered.contains("ruin"));
        // A deed written now records the second contract.
        next.remember("paid_toll", vec![], vec![]);
        assert_eq!(next.state.deeds["paid_toll"].contract, 2);
        // From the start place itself, no trip: the day after.
        let mut again = world("maren");
        let mut at_start = done.state;
        at_start.at = Position::At {
            place: "town".into(),
        };
        assert_eq!(again.carry_memory(at_start, 9).days, 0);
        assert_eq!(again.state.clock, Clock::at(3, 9, 0));
    }

    /// A site session's memory (ENG-44): saved with no contract part, never resumed, and taken
    /// up by the next contract from the place it was left at.
    #[test]
    fn a_memory_saved_at_a_site_is_carried_from_where_it_left_the_party() {
        let mut memory = Memory::new(8);
        assert!(memory.remember("yard_yielded", vec!["bren".into()], vec![]));
        assert!(!memory.remember("yard_yielded", vec!["maren".into()], vec![]));
        assert_eq!(memory.deeds["yard_yielded"].day, 1);
        assert_eq!(memory.deeds["yard_yielded"].contract, 1);
        memory.left_at = Some("inn".into());
        let saved = SavedWorld {
            memory,
            contract: None,
        };
        let json = serde_json::to_value(&saved).unwrap();
        assert!(json.get("contract").is_none());
        assert_eq!(json["memory"]["left_at"], "inn");
        let back: SavedWorld = serde_json::from_value(json).unwrap();
        let memory = back
            .resume()
            .expect_err("a memory-only world is never resumed");
        let mut next = world("maren");
        let from = Position::At {
            place: memory.left_at.clone().unwrap(),
        };
        // The inn is 12 miles from town: one day's trip, then the day after.
        let carried = next.carry(&from, *memory, 9);
        assert_eq!(
            carried,
            Carried {
                from: "inn".into(),
                days: 1
            }
        );
        assert_eq!(next.state.clock, Clock::at(3, 9, 0));
        assert_eq!(next.state.contract, 2);
        assert_eq!(next.state.deeds["yard_yielded"].contract, 1);
        // A contract saved before ENG-44 still reads and resumes.
        let w = world("maren");
        let old = serde_json::to_value(SavedWorld::from(w.state.clone())).unwrap();
        assert!(old["memory"].get("left_at").is_none());
        let old: SavedWorld = serde_json::from_value(old).unwrap();
        assert_eq!(old.resume().unwrap(), w.state);
    }

    #[test]
    fn a_saved_queue_drops_cards_gone_for_the_world() {
        let mut state = world("maren").state;
        state.deck.gone.insert("ghost".into());
        state.deck.soon = vec!["ghost".into(), "beggar".into()];
        let loaded = SavedWorld::from(state).resume().unwrap();
        assert_eq!(loaded.deck.soon, ["beggar"]);
    }

    #[test]
    fn a_party_on_a_road_turns_back_when_that_end_is_nearer() {
        // A mile out of the inn toward the ruin: back through the inn to town is 1 + 12 miles,
        // one day; on to the ruin and back would be 19 + 20 + 12.
        let mut done = world("maren");
        done.state.at = Position::OnRoad {
            road: "inn_ruin".into(),
            toward: "ruin".into(),
            miles_left: 19,
        };
        let mut next = world("maren");
        assert_eq!(
            next.carry_memory(done.state.clone(), 9),
            Carried {
                from: "inn".into(),
                days: 1
            }
        );
        // A mile short of the inn heading for it: going on is nearer, as before.
        done.state.at = Position::OnRoad {
            road: "inn_ruin".into(),
            toward: "inn".into(),
            miles_left: 1,
        };
        let mut next = world("maren");
        assert_eq!(
            next.carry_memory(done.state, 9),
            Carried {
                from: "inn".into(),
                days: 1
            }
        );
    }

    #[test]
    fn a_deed_keeps_its_first_record() {
        let mut world = world("maren");
        assert!(world.remember("paid_toll", vec!["bren".into()], vec![]));
        world.delay(24 * 60);
        assert!(!world.remember("paid_toll", vec!["maren".into()], vec![]));
        assert_eq!(
            world.state.deeds["paid_toll"],
            Deed {
                by: vec!["bren".into()],
                day: 1,
                contract: 1,
                saw: vec![],
            }
        );
        // A roster saved before deeds reads as the first contract with none.
        let mut saved = serde_json::to_value(&world.state).unwrap();
        let fields = saved.as_object_mut().unwrap();
        fields.remove("deeds");
        fields.remove("contract");
        let back: WorldState = serde_json::from_value(saved).unwrap();
        assert!(back.deeds.is_empty());
        assert_eq!(back.contract, 1);
    }

    #[test]
    fn a_short_leg_arrives_and_moves_the_clock() {
        let mut world = world("maren");
        let leg = world.travel(Some("inn"), Pace::Fast, false).unwrap();
        assert_eq!(
            leg,
            Leg {
                road: "town_inn".into(),
                zone: "fields".into(),
                toward: "inn".into(),
                pace: Pace::Fast,
                miles: 12,
                minutes: 180,
                arrived: true,
                discovered: false,
            }
        );
        assert_eq!(world.state.clock, Clock::at(1, 11, 0));
        assert_eq!(
            world.state.at,
            Position::At {
                place: "inn".into()
            }
        );
    }

    #[test]
    fn a_long_road_stops_for_the_night_and_goes_on_next_day() {
        let mut world = world("maren");
        // 12 miles at Fast spend 12/30 of the day; 12/24 is left at Normal on the hills.
        world.travel(Some("inn"), Pace::Fast, false).unwrap();
        assert_eq!(world.miles_left_today(Pace::Normal), 14);
        let leg = world.travel(Some("ruin"), Pace::Normal, false).unwrap();
        assert_eq!((leg.miles, leg.arrived, leg.minutes), (14, false, 280));
        assert_eq!(
            world.state.at,
            Position::OnRoad {
                road: "inn_ruin".into(),
                toward: "ruin".into(),
                miles_left: 6
            }
        );
        assert_eq!(
            world.travel(None, Pace::Normal, false),
            Err(TravelError::DayOver)
        );
        world.start_travel_day();
        let leg = world.travel(None, Pace::Slow, false).unwrap();
        assert_eq!((leg.miles, leg.arrived, leg.discovered), (6, true, true));
        assert!(world.state.discovered.contains("ruin"));
    }

    #[test]
    fn a_caravan_can_turn_back_on_the_road() {
        let mut world = world("maren");
        world.state.at = Position::OnRoad {
            road: "inn_ruin".into(),
            toward: "ruin".into(),
            miles_left: 15,
        };
        let leg = world.travel(Some("inn"), Pace::Normal, false).unwrap();
        assert_eq!(
            (leg.toward.as_str(), leg.miles, leg.arrived),
            ("inn", 5, true)
        );
        world.state.at = Position::OnRoad {
            road: "inn_ruin".into(),
            toward: "ruin".into(),
            miles_left: 15,
        };
        assert_eq!(
            world.travel(Some("town"), Pace::Normal, false),
            Err(TravelError::NoRoad { to: "town".into() })
        );
    }

    #[test]
    fn terrain_and_slow_members_cap_the_pace() {
        let mut world = world("maren");
        world.state.at = Position::At {
            place: "inn".into(),
        };
        assert_eq!(
            world.travel(Some("ruin"), Pace::Fast, false),
            Err(TravelError::PaceTooFast { max: Pace::Normal })
        );
        assert_eq!(
            world.travel(Some("town_inn"), Pace::Normal, true),
            Err(TravelError::PaceTooFast { max: Pace::Slow })
        );
        // A road id works as a destination too.
        assert!(
            world
                .travel(Some("town_inn"), Pace::Slow, true)
                .unwrap()
                .arrived
        );
    }

    #[test]
    fn a_player_owner_names_the_place_and_an_npc_owner_follows_the_route() {
        let mut merchant = world("maren");
        assert_eq!(
            merchant.travel(None, Pace::Normal, false),
            Err(TravelError::NeedDestination)
        );
        let mut npc = world("npc:old_tobin");
        assert_eq!(npc.travel(None, Pace::Normal, false).unwrap().toward, "inn");
        npc.state.at = Position::At {
            place: "ruin".into(),
        };
        assert_eq!(
            npc.travel(None, Pace::Normal, false),
            Err(TravelError::RouteDone)
        );
    }

    #[test]
    fn an_overloaded_wagon_does_not_move() {
        let mut world = world("maren");
        world.state.caravan.wagons[0]
            .cargo
            .insert("iron".into(), 5000);
        let before = world.state.clone();
        assert!(matches!(
            world.travel(Some("inn"), Pace::Normal, false),
            Err(TravelError::Caravan(CaravanError::Overloaded {
                wagon: 1,
                ..
            }))
        ));
        assert_eq!(world.state, before);
    }

    #[test]
    fn a_bad_start_or_route_is_refused() {
        let new = |start: &str, route: &[&str]| {
            World::new(
                small_map(),
                caravans::goods(),
                route.iter().map(|s| s.to_string()).collect(),
                caravans::caravan("maren"),
                start,
                Clock::at(1, 8, 0),
            )
        };
        assert!(new("castle", &[]).is_err());
        assert!(new("town", &["town", "castle"]).is_err());
        let world = new("town", &[]).unwrap();
        assert_eq!(
            world.state.discovered,
            BTreeSet::from(["town".to_string(), "inn".to_string()])
        );
    }

    #[test]
    fn a_delay_takes_time_and_travel_from_the_day() {
        let mut world = world("maren");
        world.delay(120);
        assert_eq!(world.state.clock, Clock::at(1, 10, 0));
        // Two of eight travel hours: a quarter of 24 miles is gone.
        assert_eq!(world.miles_left_today(Pace::Normal), 18);
        world.delay(10 * 60);
        assert_eq!(world.miles_left_today(Pace::Normal), 0);
    }

    #[test]
    fn short_delays_never_cost_less_than_one_long_one() {
        let mut short = world("maren");
        for _ in 0..8 {
            short.delay(1);
        }
        let mut long = world("maren");
        long.delay(8);
        assert_eq!(short.state.clock, long.state.clock);
        assert!(short.state.traveled_today >= long.state.traveled_today);
        assert_eq!(long.state.traveled_today, 6);
    }

    #[test]
    fn a_night_lasts_until_dawn_and_at_least_8_hours() {
        let mut world = world("maren");
        world.state.clock = Clock::at(1, 20, 0);
        assert_eq!(world.night_minutes(), 10 * 60);
        world.state.clock = Clock::at(1, 23, 30);
        assert_eq!(world.night_minutes(), 8 * 60);
        world.state.clock = Clock::at(2, 2, 0);
        assert_eq!(world.night_minutes(), 8 * 60);
        world.travel(Some("inn"), Pace::Fast, false).unwrap();
        world.state.clock = Clock::at(1, 20, 0);
        world.pass_night(600);
        assert_eq!(world.state.clock, Clock::at(2, 6, 0));
        assert_eq!(world.miles_left_today(Pace::Fast), 30);
    }

    #[test]
    fn the_state_survives_a_round_trip_through_json() {
        let mut world = world("npc:old_tobin");
        world.travel(Some("inn"), Pace::Fast, false).unwrap();
        world.travel(None, Pace::Normal, false).unwrap();
        let json = serde_json::to_string(&world.state).unwrap();
        assert_eq!(
            serde_json::from_str::<WorldState>(&json).unwrap(),
            world.state
        );
    }

    #[test]
    fn the_scout_checks_against_the_road_s_search_dc() {
        let deck: crate::deck::DeckFile = serde_json::from_str(
            r#"{"cards": [
              {"id": "willows", "zone": "hills", "target": "blades", "text": "Willows.", "scout": "survival",
               "choices": [{"id": "on", "text": "On.", "effects": [{"do": "remember", "deed": "chose_on"}]}, {"id": "wait", "text": "Wait.", "unless": "scouted", "effects": [{"do": "remember", "deed": "chose_wait"}]},
                           {"id": "round", "text": "Round.", "if": "scouted", "effects": [{"do": "remember", "deed": "chose_round"}]}]},
              {"id": "camp", "zone": "hills", "when": "night", "target": "blades", "text": "Wind.",
               "choices": [{"id": "a", "text": "A.", "effects": [{"do": "remember", "deed": "chose_a"}]}, {"id": "b", "text": "B.", "effects": [{"do": "remember", "deed": "chose_b"}]}]}
            ]}"#,
        )
        .unwrap();
        let mut w = world("npc:tobin")
            .with_deck(Deck::from_files([deck]))
            .unwrap();
        let mut dice = crate::dice::ListDice::new([1]);
        assert!(w.draw_after_leg("inn_ruin", &mut dice).is_some());
        // Nobody walks ahead: no check.
        assert_eq!(w.scout_check(), None);
        w.state.scout = Some("bren".into());
        // A hill road: Search DC 15 (SRD 5.2.1, Travel Terrain).
        assert_eq!(
            w.scout_check(),
            Some(("bren".to_string(), ScoutSkill::Survival, 15))
        );
        assert!(w.forewarn());
        assert_eq!(
            w.state.deck.pending.as_ref().unwrap().choices,
            ["on", "round"]
        );

        // A night card is never scouted, even in a zone with a scout card.
        w.state.deck.pending = None;
        w.state.at = Position::OnRoad {
            road: "inn_ruin".into(),
            toward: "ruin".into(),
            miles_left: 4,
        };
        let mut dice = crate::dice::ListDice::new([1]);
        assert!(w.draw_at_night(&mut dice).is_some());
        assert_eq!(w.state.deck.road, None);
        assert_eq!(w.scout_check(), None);
    }

    #[test]
    fn a_card_with_a_dead_person_in_its_cast_is_never_drawn() {
        let deck: crate::deck::DeckFile = serde_json::from_str(
            r#"{"cards": [
              {"id": "tobin_sings", "zone": "hills", "target": "blades", "text": "A song.", "cast": ["owner"],
               "choices": [{"id": "a", "text": "A.", "effects": [{"do": "remember", "deed": "chose_a"}]}, {"id": "b", "text": "B.", "effects": [{"do": "remember", "deed": "chose_b"}]}]},
              {"id": "ned_waves", "zone": "hills", "target": "blades", "text": "Ned waves.", "cast": ["ned"], "tells": ["tobin"],
               "choices": [{"id": "a", "text": "A.", "effects": [{"do": "remember", "deed": "chose_a"}]}, {"id": "b", "text": "B.", "effects": [{"do": "remember", "deed": "chose_b"}]}]}
            ]}"#,
        )
        .unwrap();
        let npcs: NpcFile = serde_json::from_str(
            r#"{"npcs": [{"id": "tobin", "name": "Tobin", "monster": "commoner"},
                         {"id": "ned", "name": "Ned", "monster": "commoner"}]}"#,
        )
        .unwrap();
        let mut w = world("npc:tobin")
            .with_deck(Deck::from_files([deck]))
            .unwrap()
            .with_npcs(npcs)
            .unwrap();
        w.check_cast().unwrap();
        w.state.npcs.get_mut("tobin").unwrap().alive = false;
        // The owner is dead: only Ned's card, which only names him, is in the pile.
        let mut dice = crate::dice::ListDice::new([1]);
        assert_eq!(
            w.draw_after_leg("inn_ruin", &mut dice),
            Some(Drawn::Table {
                card: "ned_waves".into(),
                soon: false
            })
        );
        w.state.deck.pending = None;
        w.state.npcs.get_mut("ned").unwrap().alive = false;
        let mut dice = crate::dice::ListDice::new([1]);
        assert_eq!(w.draw_after_leg("inn_ruin", &mut dice), None);
        w.deck.cards[1].cast = vec!["nobody".into()];
        assert!(w.check_cast().unwrap_err().0.contains("nobody"));
        // Offered while both lived, then Ned dies before the pick: his card is taken off the
        // offer, so neither the DM nor a fallback can pick it.
        w.deck.cards[1].cast = vec!["ned".into()];
        w.state.npcs.get_mut("tobin").unwrap().alive = true;
        w.state.deck.offered = vec!["ned_waves".into(), "tobin_sings".into()];
        w.drop_dead_offers();
        assert_eq!(w.state.deck.offered, vec!["tobin_sings".to_string()]);
        assert!(matches!(
            w.pick_card("ned_waves"),
            Err(PickError::NotOffered(_))
        ));
        w.pick_card("tobin_sings").unwrap();
    }

    /// ENG-49: a wagon fight that can kill the NPC owner needs a reader of the death (rule
    /// A9), the escort's death card must go once and read it, and the engine puts that card
    /// on the table once the owner is dead, and only once.
    #[test]
    fn the_owner_s_death_needs_a_reader_and_the_death_card_comes_once() {
        let deck = |reader: &str| -> Deck {
            let file: crate::deck::DeckFile = serde_json::from_str(&format!(
                r#"{{"cards": [
                  {{"id": "wolves", "zone": "hills", "target": "blades", "text": "Wolves.",
                   "choices": [{{"id": "a", "text": "A.", "effects": [{{"do": "fight", "monsters": ["wolf"], "wagon": true}}]}},
                               {{"id": "b", "text": "B.", "effects": [{{"do": "remember", "deed": "chose_b"}}]}}]}},
                  {{"id": "tobin_falls", "zone": "hills", "target": "blades", "text": "Tobin is dead.", {reader}
                   "choices": [{{"id": "a", "text": "A.", "effects": [{{"do": "remember", "deed": "chose_a"}}]}},
                               {{"id": "b", "text": "B.", "effects": [{{"do": "share_purse"}}]}}]}}
                ]}}"#
            ))
            .unwrap();
            Deck::from_files([file])
        };
        let npcs = || -> NpcFile {
            serde_json::from_str(
                r#"{"npcs": [{"id": "tobin", "name": "Tobin", "monster": "commoner"}]}"#,
            )
            .unwrap()
        };
        let terms = |card: Option<&str>| EscortTerms {
            comment: None,
            destination: "inn".into(),
            wage_cp: crate::escort::SKILLED_WAGE_CP,
            advance_days: 0,
            purse_cp: 1000,
            death_card: card.map(String::from),
        };
        let blades = || vec!["bren".to_string(), "maren".to_string()];
        let with = |reader: &str| {
            world("npc:tobin")
                .with_deck(deck(reader))
                .unwrap()
                .with_npcs(npcs())
                .unwrap()
        };
        // No reader of tobin_dead: rule A9 refuses the contract.
        let err = with("").with_escort(terms(None), blades()).unwrap_err();
        assert!(err.0.contains("a wagon fight can kill tobin"), "{}", err.0);
        // A reader that may come back is no death card.
        let err = with(r#""if": "tobin_dead","#)
            .with_escort(terms(Some("tobin_falls")), blades())
            .unwrap_err();
        assert!(err.0.contains("death_card tobin_falls"), "{}", err.0);
        let (mut w, _) = with(r#""if": "tobin_dead", "once": true,"#)
            .with_escort(terms(Some("tobin_falls")), blades())
            .unwrap();
        // Alive, nothing is put and the purse is never shared; dead, the card is put once.
        assert_eq!(w.put_death_card(), None);
        assert_eq!(w.share_purse(|_| true), Vec::new());
        w.state.npcs.get_mut("tobin").unwrap().alive = false;
        assert!(w.owner_dead());
        assert_eq!(w.put_death_card(), Some("tobin_falls".into()));
        assert!(w.state.deck.waiting());
        w.state.deck.pending = None;
        assert_eq!(w.put_death_card(), None, "never twice");
        assert_eq!(
            w.share_purse(|_| true).len(),
            2,
            "dead, the purse is shared"
        );
    }

    #[test]
    fn a_person_is_seen_or_heard_of_and_an_old_roster_s_met_reads_as_seen() {
        let npcs: NpcFile = serde_json::from_str(
            r#"{"npcs": [{"id": "tobin", "name": "Tobin", "monster": "commoner"},
                         {"id": "ned", "name": "Ned", "monster": "commoner"}]}"#,
        )
        .unwrap();
        let mut w = world("npc:tobin").with_npcs(npcs).unwrap();
        let party = ["bren".to_string(), "maren".to_string()];
        w.heard_by("ned", &party[..1]);
        w.seen_by("ned", &party);
        // A sight replaces a name heard; a name heard after a sight changes nothing.
        w.heard_by("ned", &party);
        let ned = &w.state.npcs["ned"];
        assert!(ned.heard.is_empty());
        assert_eq!(ned.seen.len(), 2);
        // A deed keeps who saw it, and a later card shows it to more.
        assert!(w.remember("paid", vec!["bren".into()], vec!["ned".into()]));
        w.shown_deed("paid", &["tobin".into(), "ned".into()]);
        assert_eq!(w.state.deeds["paid"].saw, ["ned", "tobin"]);
        // Rule N7: a roster saved before API-59 held Tobin met and nobody seen.
        w.state.npcs.get_mut("tobin").unwrap().met = true;
        w.seen_from_met(&party);
        assert_eq!(
            w.state.npcs["tobin"].seen.keys().collect::<Vec<_>>(),
            ["bren", "maren"]
        );
    }

    #[test]
    fn a_saved_world_keeps_memory_and_contract_apart_and_reads_back_whole() {
        let mut w = world("npc:tobin");
        w.remember("paid", vec!["bren".into()], vec![]);
        w.state.scout = Some("bren".into());
        w.state.deck.discard.insert("mud".into());
        w.state.deck.gone_for_contract.insert("toll".into());
        let saved = SavedWorld::from(w.state.clone());
        let json = serde_json::to_value(&saved).unwrap();
        assert!(json["memory"]["deeds"]["paid"].is_object());
        assert_eq!(
            json["memory"]["deck"]["discard"],
            serde_json::json!(["mud"])
        );
        assert_eq!(
            json["contract"]["deck"]["gone_for_contract"],
            serde_json::json!(["toll"])
        );
        assert_eq!(json["contract"]["scout"], "bren");
        assert!(json["memory"].get("caravan").is_none());
        let back: SavedWorld = serde_json::from_value(json).unwrap();
        assert_eq!(back.resume().unwrap(), w.state);
    }
}
