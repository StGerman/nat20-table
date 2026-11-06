//! The living world for nat20-table: the clock, the map, the caravan, the road event deck and
//! the place NPCs.
//!
//! The world is data plus SRD tables about the world (travel pace, travel terrain,
//! drawn vehicles). Rules on creatures stay in core: the world never rolls a save or
//! applies a condition, it returns what happened and the server runs the rest through
//! core (decision 0057).
//!
//! The crate depends on serde only (and may depend on `nat20-ledger`, never the
//! reverse; CI job `world-pure`). It has no random number generator: every function
//! that needs a roll takes [`WorldDice`], which the server implements with the
//! session's dice and logs with an `rN` id.

pub mod campaign;
pub mod caravan;
pub mod clock;
pub mod deck;
pub mod dice;
pub mod escort;
pub mod map;
pub mod npcs;
pub mod plan;
pub mod travel;

pub use campaign::{CampaignFile, CampaignWorld};
pub use caravan::{Caravan, CaravanError, Good, Goods, Owner, Wagon};
pub use clock::{Clock, Watch};
pub use deck::{
    Card, CardError, Choice, DC_LADDER, DRAW_DIE, Decided, Deck, DeckError, DeckFile, DeckState,
    Deed, DeedBook, Deeds, Drawn, Effect, MAX_OFFERED, Monster, Once, OnceScope, PendingCard,
    PickError, Resolution, Table, Target, When, Who, killed_deed,
};
pub use dice::{ListDice, WorldDice};
pub use escort::{EscortState, EscortTerms, SKILLED_WAGE_CP, Wage};
pub use map::{Edge, Generate, MapError, Place, Position, Road, Terrain, WorldMap};
pub use npcs::{Attitude, NpcCarries, NpcCoins, NpcDef, NpcFile, NpcItem, NpcLeft, NpcState};
pub use plan::{Reach, Trip, TripLeg};
pub use travel::{
    Carried, LONG_REST_MINUTES, Leg, MILES_PER_DAY_BETWEEN, Pace, RATIONS, TravelError, WAKE_HOUR,
    World, WorldState,
};
