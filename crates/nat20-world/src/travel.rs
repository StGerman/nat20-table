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
    deck::{Deck, DeckError, DeckState, Deed, DeedBook, Drawn, PickError, ScoutSkill, When},
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
    /// What the next contract rebuilds
    pub contract: ContractState,
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
            },
            contract: ContractState {
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
            },
        }
    }
}

impl From<SavedWorld> for WorldState {
    fn from(saved: SavedWorld) -> Self {
        let SavedWorld { memory, contract } = saved;
        WorldState {
            clock: memory.clock,
            at: contract.at,
            discovered: memory.discovered,
            caravan: contract.caravan,
            traveled_today: contract.traveled_today,
            deck: DeckState {
                added: memory.deck.added,
                discard: memory.deck.discard,
                gone: memory.deck.gone,
                soon: memory.deck.soon,
                gone_for_contract: contract.deck.gone_for_contract,
                offered: contract.deck.offered,
                pending: contract.deck.pending,
                road: contract.deck.road,
            },
            npcs: memory.npcs,
            escort: contract.escort,
            deeds: memory.deeds,
            pack: contract.pack,
            contract: memory.contract,
            scout: contract.scout,
        }
    }
}

/// How a new contract took up the world a finished one left (ENG-37).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Carried {
    /// The place the party was in when the last contract ended
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

    /// The world with an escort contract, checked against the map. `blades` are the Hired
    /// Blades in party order. A state that already holds the contract (a roster's) keeps it;
    /// otherwise it starts now and the advance is due: the payments are returned.
    pub fn with_escort(
        mut self,
        terms: EscortTerms,
        blades: Vec<String>,
    ) -> Result<(Self, Vec<Wage>), MapError> {
        terms.validate(&self.map)?;
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
            .filter(move |d| d.place == place)
            .filter_map(|d| {
                self.state
                    .npcs
                    .get(&d.id)
                    .filter(|s| s.alive)
                    .map(|s| (d, s))
            })
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
    /// [`MILES_PER_DAY_BETWEEN`] miles by the shortest road, rounded up).
    pub fn carry_memory(&mut self, saved: WorldState, start_hour: u32) -> Carried {
        let from = match &saved.at {
            Position::At { place } => place.clone(),
            Position::OnRoad { toward, .. } => toward.clone(),
        };
        let start = self.place_here().unwrap_or_default().to_string();
        let left = match &saved.at {
            Position::OnRoad { miles_left, .. } => *miles_left,
            Position::At { .. } => 0,
        };
        let miles = left + self.map.miles_between(&from, &start).unwrap_or(0);
        let days = miles.div_ceil(MILES_PER_DAY_BETWEEN);
        let mut deck = saved.deck;
        deck.pending = None;
        deck.offered.clear();
        deck.road = None;
        deck.gone_for_contract.clear();
        let mut discovered = saved.discovered;
        discovered.extend(std::mem::take(&mut self.state.discovered));
        self.state.clock = Clock::at(saved.clock.day + 1 + days, start_hour, 0);
        self.state.discovered = discovered;
        self.state.deeds = saved.deeds;
        self.state.deck = deck;
        self.state.npcs = saved.npcs;
        self.state.contract = saved.contract + 1;
        Carried { from, days }
    }

    /// Remembers a deed done today by `by` in the contract under way. A deed done again
    /// keeps its first record. Returns whether it is new.
    pub fn remember(&mut self, deed: &str, by: Vec<String>) -> bool {
        if self.state.deeds.contains_key(deed) {
            return false;
        }
        self.state.deeds.insert(
            deed.to_string(),
            Deed {
                by,
                day: self.state.clock.day,
                contract: self.state.contract,
            },
        );
        true
    }

    /// Draws after a leg along `road`. Returns what the draw did: a card on the table, or cards
    /// offered for the DM's pick (API-53); none when the zone has no card in play.
    pub fn draw_after_leg(&mut self, road: &str, dice: &mut impl WorldDice) -> Option<Drawn> {
        let zone = self.map.road(road)?.zone.clone();
        let drawn = self.deck.draw(
            &zone,
            When::Road,
            &self.state.discovered,
            &self.state.deeds,
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
        let drawn = self.deck.draw(
            place,
            When::Arrival,
            &self.state.discovered,
            &self.state.deeds,
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
        self.deck.forewarn(&self.state.deeds, &mut self.state.deck)
    }

    /// The DM picks one of the offered cards (API-53): it goes on the table.
    pub fn pick_card(&mut self, card: &str) -> Result<(), PickError> {
        self.deck
            .pick(card, &self.state.deeds, &mut self.state.deck)
    }

    /// Draws a night card after a night in camp where the caravan is: on the table, or offered
    /// for a pick (API-53).
    pub fn draw_at_night(&mut self, dice: &mut impl WorldDice) -> Option<Drawn> {
        let zone = self.zone_here();
        let drawn = self.deck.draw(
            &zone,
            When::Night,
            &self.state.discovered,
            &self.state.deeds,
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
        done.remember("helped_farmer", vec!["bren".into()]);
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
        next.remember("paid_toll", vec![]);
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

    #[test]
    fn a_deed_keeps_its_first_record() {
        let mut world = world("maren");
        assert!(world.remember("paid_toll", vec!["bren".into()]));
        world.delay(24 * 60);
        assert!(!world.remember("paid_toll", vec!["maren".into()]));
        assert_eq!(
            world.state.deeds["paid_toll"],
            Deed {
                by: vec!["bren".into()],
                day: 1,
                contract: 1,
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
               "choices": [{"id": "on", "text": "On."}, {"id": "wait", "text": "Wait.", "unless": "scouted"},
                           {"id": "round", "text": "Round.", "if": "scouted"}]},
              {"id": "camp", "zone": "hills", "when": "night", "target": "blades", "text": "Wind.",
               "choices": [{"id": "a", "text": "A."}, {"id": "b", "text": "B."}]}
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
    fn a_saved_world_keeps_memory_and_contract_apart_and_reads_back_whole() {
        let mut w = world("npc:tobin");
        w.remember("paid", vec!["bren".into()]);
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
        assert_eq!(WorldState::from(back), w.state);
    }
}
