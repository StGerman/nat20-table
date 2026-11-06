//! The living world on the wire: the clock, the map and the caravan (Milestone 9, API-41).
//!
//! The DM sees [`WorldDm`], every player [`WorldPlayer`]. A player's view holds only places the
//! party has discovered; a road to an undiscovered place shows only its known end. Deck zones,
//! the route an NPC owner follows and scene ids are DM only (protocol §5).

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::Handle;

/// How fast the party travels (SRD 5.2.1, Travel Pace).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Pace {
    /// 2 miles an hour, 18 a day.
    Slow,
    /// 3 miles an hour, 24 a day.
    Normal,
    /// 4 miles an hour, 30 a day.
    Fast,
}

/// A part of the day, four hours long; the night is two of them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Watch {
    /// Midnight to 4:00.
    SmallHours,
    /// 4:00 to 8:00.
    Dawn,
    /// 8:00 to noon.
    Morning,
    /// Noon to 16:00.
    Afternoon,
    /// 16:00 to 20:00.
    Evening,
    /// 20:00 to midnight.
    Night,
}

/// The predominant terrain of a road (SRD 5.2.1, Travel Terrain). It sets the road's maximum
/// pace.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Terrain {
    /// Normal at most (Fast needs skis, which the world does not model).
    Arctic,
    /// Normal at most.
    Coastal,
    /// Normal at most.
    Desert,
    /// Normal at most.
    Forest,
    /// Fast at most.
    Grassland,
    /// Normal at most.
    Hill,
    /// Slow at most.
    Mountain,
    /// Slow at most.
    Swamp,
    /// Normal at most.
    Underdark,
    /// Normal at most.
    Urban,
}

/// The world's time. The one calendar: core keeps time inside a fight by turns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ClockView {
    /// The day of the campaign, from 1.
    pub day: u32,
    /// The hour, 0 to 23.
    pub hour: u32,
    /// The minute of the hour, 0 to 59.
    pub minute: u32,
    /// The part of the day.
    pub watch: Watch,
}

/// Where the caravan is, tagged by `kind`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WorldPosition {
    /// In a place.
    At {
        /// The place id.
        place: String,
    },
    /// Part way along a road, stopped for the day or on the move.
    OnRoad {
        /// The road id.
        road: String,
        /// The place the caravan set out from on this road; always a discovered place.
        came_from: String,
        /// Miles still to go to the road's other end.
        miles_left: u32,
    },
}

/// How many more miles the party can travel today at each pace. A day's distance is shared:
/// a mile at Fast spends 1/30 of the day, at Normal 1/24, at Slow 1/18.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct MilesToday {
    /// Miles left today at a Fast pace.
    pub fast: u32,
    /// Miles left today at a Normal pace.
    pub normal: u32,
    /// Miles left today at a Slow pace.
    pub slow: u32,
}

/// A place as the DM sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PlaceDm {
    /// The place id.
    pub id: String,
    /// The name players read.
    pub name: String,
    /// What kind of place it is (`town`, `village`, `inn`, `ruin`).
    pub kind: String,
    /// Whether it has a market.
    pub market: bool,
    /// Whether the party has discovered it.
    pub discovered: bool,
    /// The scene the engine loads on arrival.
    pub scene: String,
}

/// A discovered place, as a player sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PlaceKnown {
    /// The place id; `travel` takes it as `to`.
    pub id: String,
    /// The name.
    pub name: String,
    /// What kind of place it is (`town`, `village`, `inn`, `ruin`).
    pub kind: String,
    /// Whether it has a market.
    pub market: bool,
}

/// A road as the DM sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RoadDm {
    /// The road id.
    pub id: String,
    /// One end, a place id.
    pub from: String,
    /// The other end, a place id.
    pub to: String,
    /// The length in miles.
    pub miles: u32,
    /// The predominant terrain.
    pub terrain: Terrain,
    /// Whether it is a good road (the maximum pace is one step faster).
    pub good_road: bool,
    /// The fastest pace the road allows.
    pub max_pace: Pace,
    /// The deck zone road cards come from.
    pub zone: String,
}

/// A road between two discovered places, as a player sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RoadKnown {
    /// The road id; `travel` takes it as `to`.
    pub id: String,
    /// One end, a place id.
    pub from: String,
    /// The other end, a place id.
    pub to: String,
    /// The length in miles.
    pub miles: u32,
    /// The predominant terrain.
    pub terrain: Terrain,
    /// Whether it is a good road.
    pub good_road: bool,
    /// The fastest pace the road allows.
    pub max_pace: Pace,
}

/// A road from a discovered place to one the party has not found yet, as a player sees it:
/// where it starts and how long it is, not where it leads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RoadUnexplored {
    /// The road id; `travel` takes it as `to`.
    pub id: String,
    /// The discovered end, a place id.
    pub from: String,
    /// The length in miles.
    pub miles: u32,
    /// The predominant terrain.
    pub terrain: Terrain,
    /// Whether it is a good road.
    pub good_road: bool,
    /// The fastest pace the road allows.
    pub max_pace: Pace,
}

/// Some of one good in a wagon.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CargoView {
    /// The good id.
    pub good: String,
    /// The name, with its unit.
    pub name: String,
    /// Units aboard.
    pub quantity: u32,
    /// The weight of all of them, in pounds.
    pub weight_lb: u32,
}

/// One cart or wagon. Every player sees the caravan.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct WagonView {
    /// The number, from 1; the ledger holder `wagon:<n>`.
    pub n: u32,
    /// The vehicle (`cart`, `wagon`).
    pub vehicle: String,
    /// The most cargo it can move, in pounds (SRD 5.2.1, Mounts and Cargo).
    pub limit_lb: u32,
    /// The cargo aboard, in pounds.
    pub load_lb: u32,
    /// The cargo, by good id.
    pub cargo: Vec<CargoView>,
}

/// The caravan. Every player sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CaravanView {
    /// Who owns it and decides where it goes: a player's handle, or `npc:<id>` for a world NPC
    /// that follows the campaign's route.
    pub owner: String,
    /// The wagons.
    pub wagons: Vec<WagonView>,
}

/// The world as the DM sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct WorldDm {
    /// The time.
    pub clock: ClockView,
    /// Where the caravan is.
    pub at: WorldPosition,
    /// Miles the party can still travel today.
    pub today: MilesToday,
    /// Every place, discovered or not, in map file order.
    pub places: Vec<PlaceDm>,
    /// Every road, in map file order.
    pub roads: Vec<RoadDm>,
    /// The caravan.
    pub caravan: CaravanView,
    /// The places an NPC owner travels, in order; empty when a player owns the caravan.
    pub route: Vec<String>,
}

/// The world as one player sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct WorldPlayer {
    /// The time.
    pub clock: ClockView,
    /// Where the caravan is.
    pub at: WorldPosition,
    /// Miles the party can still travel today.
    pub today: MilesToday,
    /// Whether this player may call `travel`: the owner, or any party member when an NPC owns
    /// the caravan.
    pub drives: bool,
    /// The places the party has discovered, in map file order.
    pub places: Vec<PlaceKnown>,
    /// Roads between two discovered places, in map file order.
    pub roads: Vec<RoadKnown>,
    /// Roads from a discovered place to one not yet found, in map file order.
    pub unexplored: Vec<RoadUnexplored>,
    /// The caravan.
    pub caravan: CaravanView,
}

/// One journey leg, in `travel`'s result and the `traveled` event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct LegView {
    /// Who called `travel`.
    pub actor: Handle,
    /// The road.
    pub road: String,
    /// The pace.
    pub pace: Pace,
    /// Miles covered.
    pub miles: u32,
    /// Minutes the leg took.
    pub minutes: u32,
    /// Whether the caravan reached the road's end; if not, it stopped on the road because the
    /// day's distance is spent.
    pub arrived: bool,
    /// Where the caravan is now.
    pub at: WorldPosition,
}
