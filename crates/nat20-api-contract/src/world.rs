//! The living world on the wire: the clock, the map and the caravan (Milestone 9, API-41).
//!
//! The DM sees [`WorldDm`], every player [`WorldPlayer`]. A player's view holds only places the
//! party has discovered; a road to an undiscovered place shows only its known end. Deck zones,
//! the route an NPC owner follows and scene ids are DM only (protocol §5).

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{Ability, Handle, Skill};

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

/// Where the party spends a night.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Lodging {
    /// The inn of the place the caravan is in: each party member pays the place's `inn_cp`
    /// for room and board.
    Inn,
    /// A camp, in a place or on the road: each party member eats one day's rations from the
    /// caravan while they last.
    Camp,
}

/// How long `pass_time` lets pass (API-50): coarse spans the fiction names, never minutes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TimeSpan {
    /// Half an hour: a meal, a word with someone, a look round.
    ShortWhile,
    /// An hour.
    Hour,
    /// Until the next watch begins (the watches start at 0:00, 4:00, 8:00, noon, 16:00 and
    /// 20:00).
    Watch,
}

/// One night, in `rest_night`'s result and the `night` event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct NightView {
    /// Who called `rest_night`.
    pub actor: Handle,
    /// Inn or camp.
    pub lodging: Lodging,
    /// How long the night lasted, in minutes: until dawn, and at least 8 hours.
    pub minutes: u32,
    /// The party members who finished a Long Rest.
    pub rested: Vec<Handle>,
    /// The party members who could not take a Long Rest: at 0 Hit Points, or less than 16
    /// hours after their last one.
    pub not_rested: Vec<Handle>,
    /// The party members who ate less than a full day's food (no rations left).
    pub hungry: Vec<Handle>,
}

/// Who decides a road card.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CardTarget {
    /// The road, the wagons, the cargo: the caravan owner decides after every Hired Blade
    /// advises; an NPC owner takes the Blades' majority.
    Caravan,
    /// The escort themselves: the Hired Blades vote.
    Blades,
}

/// One choice on a road card.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CardChoiceView {
    /// The choice id; `choose_card` takes it.
    pub id: String,
    /// What the players read.
    pub text: String,
}

/// One choice on a road card, as the DM sees it (API-55): the players' words and the
/// customs taking it keeps or breaks. DM only; players see [`CardChoiceView`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CardChoiceDm {
    /// The choice id; `choose_card` takes it.
    pub id: String,
    /// What the players read.
    pub text: String,
    /// The customs taking it keeps, by id from the world's customs (ENG-39): the DM narrates
    /// who reacts, never a verdict. Empty when it touches none.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub keeps: Vec<String>,
    /// The customs taking it breaks, by id from the world's customs (ENG-39). Empty when it
    /// touches none.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub breaks: Vec<String>,
}

/// One seat's word on the card on the table: a Blade's advice or vote.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CardSaid {
    /// Who spoke.
    pub actor: Handle,
    /// The choice id.
    pub choice: String,
}

/// The road card on the table, as the DM sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CardDm {
    /// The card id in the world's deck.
    pub id: String,
    /// The deck zone it came from: a road zone or a place id.
    pub zone: String,
    /// Who decides it.
    pub target: CardTarget,
    /// What the players read.
    pub text: String,
    /// The choices, with the customs each keeps or breaks (API-55); the last is `own_move`, in
    /// the seat's own words, once the card has one (API-56).
    pub choices: Vec<CardChoiceDm>,
    /// What each Blade has said so far.
    pub said: Vec<CardSaid>,
    /// The Blades who still have to speak.
    pub waiting_for: Vec<Handle>,
    /// What only the DM reads: the card's one oddity, to voice at every meeting (API-53).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// The skill the scout checked with when the card was shown (API-54); absent for a card
    /// with nothing to find.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scout: Option<Skill>,
    /// The own move on the card (API-56), once the DM put it there: its check and the two
    /// choices a success and a failure bring. Its words are the choice `own_move` in
    /// `choices`. Absent while the card has none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub own_move: Option<OwnMoveDm>,
}

/// A seat's own move on the card on the table, as the DM sees it (API-56; protocol §4.13).
/// DM only; players see [`OwnMovePlayer`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct OwnMoveDm {
    /// The seat whose words it is.
    pub actor: Handle,
    /// The check's ability: the skill's own.
    pub ability: Ability,
    /// The check's skill.
    pub skill: Skill,
    /// The check's DC, from the SRD DC ladder.
    pub dc: u8,
    /// The choice id a success brings.
    pub success: String,
    /// The choice id a failure brings.
    pub failure: String,
}

/// A seat's own move on the card on the table, as a player sees it (API-56): who said it and
/// what it tries. Never the DC, nor what a success or a failure brings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct OwnMovePlayer {
    /// The seat whose words it is.
    pub actor: Handle,
    /// The check's ability: the skill's own.
    pub ability: Ability,
    /// The check's skill.
    pub skill: Skill,
}

/// A road card a draw offered for the DM's pick (API-53). DM only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct OfferedCard {
    /// The card id: what `pick_card` names.
    pub id: String,
    /// The deck zone it came from: a road zone or a place id.
    pub zone: String,
    /// Who would decide it.
    pub target: CardTarget,
    /// What the players would read.
    pub text: String,
    /// The choices it would offer, with the customs each keeps or breaks (API-55).
    pub choices: Vec<CardChoiceDm>,
    /// What only the DM reads: the card's one oddity.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// The skill the scout would check with (API-54); absent for a card with nothing to find.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scout: Option<Skill>,
    /// The deeds it reads (AGT-91): the remembered deeds its `if`, or an offered choice's
    /// `if`, names, with their records. A card that reads one continues what the party did.
    /// Empty, and left out, when it reads none.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reads: Vec<DeedDm>,
}

/// When a road card is drawn (AGT-91), as the deck file's `when` says.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CardWhen {
    /// After a journey leg.
    Road,
    /// After a night.
    Night,
    /// When a leg ends in the card's place: the place's pay-offs (ENG-35).
    Arrival,
}

/// How a road card came to the table (API-53).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CardCame {
    /// The DM picked it among the offered (`pick_card`).
    DmPick,
    /// The game loop picked the first card rolled because the DM did not answer.
    EnginePick,
    /// An earlier choice queued it (`add_card` with `soon`): no roll, no pick.
    Soon,
}

/// The road card on the table, as a player sees it: no card id, zone or deck.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CardPlayer {
    /// Who decides it.
    pub target: CardTarget,
    /// What the players read.
    pub text: String,
    /// The choices; the last is `own_move`, in the seat's own words, once the card has one.
    pub choices: Vec<CardChoiceView>,
    /// What each Blade has said so far.
    pub said: Vec<CardSaid>,
    /// The Blades who still have to speak.
    pub waiting_for: Vec<Handle>,
    /// The own move on the card (API-56): who said it and the check it tries. Absent while
    /// the card has none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub own_move: Option<OwnMovePlayer>,
}

/// How a road card was decided.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CardDecided {
    /// The player owner chose, after the Blades' advice.
    Owner,
    /// The Blades' majority.
    Majority,
    /// A tie, broken by the human seat (Blade cards) or the card's own pick.
    Tie,
    /// The NPC owner insisted on a choice; the DM narrates why.
    OwnerInsists,
    /// Nobody could speak; the card's default.
    Default,
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
    /// A night's room and board at its inn, per person, in copper pieces; absent when it has
    /// no inn.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inn_cp: Option<u32>,
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
    /// A night's room and board at its inn, per person, in copper pieces; absent when it has
    /// no inn.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inn_cp: Option<u32>,
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
    /// How long the road takes from where the caravan stands (API-49): set on each road out of
    /// the caravan's place, absent elsewhere and on the road.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reach: Option<ReachView>,
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
    /// How long the road takes from where the caravan stands (API-49): set on each road out of
    /// the caravan's place, absent elsewhere and on the road.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reach: Option<ReachView>,
}

/// How long one road out of the caravan's place takes (API-49), worked out by the world with the
/// travel rule: at a Normal pace, or the road's slower maximum, and when the day's distance runs
/// out on the way, a night on the road and on the next morning. Players read it as prose and a
/// watch; the minutes are for wording, never shown.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ReachView {
    /// The pace the plan goes at.
    pub pace: Pace,
    /// Minutes on the move, nights left out.
    pub minutes: u32,
    /// Nights spent before arriving: 0 when the caravan gets there today.
    pub nights: u32,
    /// When the caravan gets to the road's other end.
    pub arrives: ClockView,
}

/// One leg of the escort's trip (API-49).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct TripLegView {
    /// The road id.
    pub road: String,
    /// The place the leg ends at; always one the party has discovered.
    pub to: String,
    /// The pace the plan goes at.
    pub pace: Pace,
    /// Miles still to go on this road.
    pub miles: u32,
    /// Minutes on the move, nights left out.
    pub minutes: u32,
    /// Nights spent before arriving, counted from the leg before.
    pub nights: u32,
    /// When the caravan gets to `to`.
    pub arrives: ClockView,
}

/// The route the merchant's caravan travels from where it is to the escort's destination (API-49),
/// leg by leg and with the day's distance shared across legs, as `ReachView` works it out.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct TripView {
    /// The legs in travel order. They stop before the first place the party hasn't discovered,
    /// so a trip never names one.
    pub legs: Vec<TripLegView>,
    /// Whether the legs reach the destination; false when they stop before an undiscovered place.
    pub complete: bool,
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
    /// The road card waiting for its decision; `travel` and `rest_night` wait for it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card: Option<CardDm>,
    /// The cards a draw offered, in roll order, waiting for the DM's `pick_card` (API-53);
    /// `travel`, `rest_night`, `pass_time` and `choose_card` wait for the pick.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub offered: Vec<OfferedCard>,
    /// Every place NPC, alive or dead, met or not, in the world file's order (API-48).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub npcs: Vec<NpcDm>,
    /// The escort contract, when the party is hired on one (API-47).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub escort: Option<EscortDm>,
    /// Every deed the world remembers, by id (Milestone 11, API-52): this contract's and the
    /// ones before. DM only.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deeds: Vec<DeedDm>,
    /// The Hired Blade who walks ahead as the scout (API-54).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scout: Option<Handle>,
}

/// A deed the world remembers, as the DM sees it (API-52).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct DeedDm {
    /// The deed id.
    pub deed: String,
    /// Who did it; empty when nobody spoke.
    pub by: Vec<Handle>,
    /// The day it was done.
    pub day: u32,
    /// The contract it was done in: 1 for a party's first.
    pub contract: u32,
}

/// The escort contract as the DM sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct EscortDm {
    /// The terms and each Blade's service and pay, as the players see them.
    pub contract: EscortView,
    /// What the merchant's purse holds now, in copper pieces.
    pub purse_cp: u64,
}

/// The escort contract as the party knows it: the terms, and each Blade's days and pay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct EscortView {
    /// Who pays: the caravan's owner, `npc:<id>`.
    pub merchant: String,
    /// Where the caravan is escorted to; the rest of the pay is due on arrival.
    pub destination: String,
    /// The wage per Blade per day, in copper pieces.
    pub wage_cp: u32,
    /// Days of wages paid ahead when the contract started.
    pub advance_days: u32,
    /// Each Blade, in party order.
    pub blades: Vec<EscortBlade>,
    /// Whether the caravan reached the destination and the pay was settled.
    pub done: bool,
}

/// One Hired Blade's service and pay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct EscortBlade {
    /// The Blade.
    pub handle: Handle,
    /// Days served: one for each night they lived through, and the day of arrival.
    pub served: u32,
    /// Copper paid so far.
    pub paid_cp: u64,
}

/// How a place NPC feels about the party.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum NpcAttitude {
    /// Glad of them.
    Friendly,
    /// Neither.
    Indifferent,
    /// Against them: they stand on the hostile side of a fight.
    Hostile,
}

/// A place NPC as the DM sees them (API-48).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct NpcDm {
    /// The id; also their creature handle while the party is in their place.
    pub id: String,
    /// The name players read.
    pub name: String,
    /// The place they live in.
    pub place: String,
    /// The stat block they fight as.
    pub monster: String,
    /// How they feel about the party.
    pub attitude: NpcAttitude,
    /// Whether they are alive.
    pub alive: bool,
    /// Whether the party has met them.
    pub met: bool,
    /// Hit Points when the party last left them; absent when at full. While the party is in
    /// their place, their creature in the scene has the live value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hp: Option<u32>,
    /// Who they are, from the world file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

/// A place NPC the party has met, as a player sees them: never Hit Points, attitude or notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct NpcKnown {
    /// The id; also their creature handle while the party is in their place.
    pub id: String,
    /// The name.
    pub name: String,
    /// The place they live in.
    pub place: String,
    /// Whether they are alive, as far as the party knows: the party met them, so a death the
    /// party saw is known.
    pub alive: bool,
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
    /// The road card waiting for its decision.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card: Option<CardPlayer>,
    /// The place NPCs the party has met, in the world file's order (API-48).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub npcs: Vec<NpcKnown>,
    /// The escort contract, when the party is hired on one (API-47).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub escort: Option<EscortView>,
    /// The route to the escort's destination (API-49): while the contract is under way and the
    /// merchant's caravan follows its route from a place on it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trip: Option<TripView>,
    /// The Hired Blade who walks ahead as the scout (API-54).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scout: Option<Handle>,
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
