//! The living world for nat20-table: the clock, the map, the caravan and the road event deck.
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
pub mod map;
pub mod travel;

pub use campaign::{CampaignFile, CampaignWorld};
pub use caravan::{Caravan, CaravanError, Good, Goods, Owner, Wagon};
pub use clock::{Clock, Watch};
pub use deck::{
    CardError, Decided, Deck, DeckError, DeckFile, DeckState, Effect, PendingCard, Resolution,
    Table, Target, When, Who,
};
pub use dice::{ListDice, WorldDice};
pub use map::{Edge, Generate, MapError, Place, Position, Road, Terrain, WorldMap};
pub use travel::{
    LONG_REST_MINUTES, Leg, Pace, RATIONS, TravelError, WAKE_HOUR, World, WorldState,
};
