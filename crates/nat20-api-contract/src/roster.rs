//! The roster: the party saved at the end of one game session and carried into the next
//! (API-45, protocol §4.15). The engine writes it with `save_roster` and reads it back with
//! `new_session{roster}`; the game loop keeps it in a file and records its sha256.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{Coins, Handle, PregenItem};

/// The roster's format version this contract writes and reads.
pub const ROSTER_FORMAT: u32 = 1;

/// A party saved between game sessions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Roster {
    /// Format version, 1. Another is refused.
    pub format: u32,
    /// The party's characters, in party order.
    pub characters: Vec<RosterCharacter>,
    /// The world as the engine left it: the clock, where the caravan is, its wagons and cargo,
    /// the places discovered, the deck. Absent when no campaign ran. Opaque to clients: give it
    /// back unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub world: Option<RosterWorld>,
}

/// The world part of a roster.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RosterWorld {
    /// The world map's id, e.g. `wend`. A campaign on another map starts fresh.
    pub map: String,
    /// The world's state, as the engine wrote it.
    pub state: serde_json::Value,
}

/// One character as it left a game session: a pregen with a history. Hit Points are not kept;
/// the next session starts after a Long Rest.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RosterCharacter {
    /// Its handle, which a scene's pregen creature of the same handle takes on.
    pub handle: Handle,
    /// The pregen file it was built from.
    pub pregen: String,
    /// Character level.
    pub level: u8,
    /// Experience Points.
    pub xp: u32,
    /// The answers given in play to the level-up choices past the pregen's level.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub choices: Vec<RosterChoice>,
    /// What it carries, equipped items with their slot.
    pub equipment: Vec<PregenItem>,
    /// The coins in its purse.
    pub purse: Coins,
    /// Exhaustion level, 0 to 6.
    #[serde(default)]
    pub exhaustion: u8,
    /// How many of those levels malnutrition caused: a Long Rest can't remove them until it
    /// eats a full day's food.
    #[serde(default)]
    pub malnutrition: u8,
    /// Days in a row it has eaten nothing.
    #[serde(default)]
    pub days_without_food: u32,
}

/// One level-up choice answered in play.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RosterChoice {
    /// The level it was made at.
    pub level: u8,
    /// The prompt's id, e.g. `choice.spells` or `choice.skills`.
    pub prompt_id: String,
    /// The option ids picked, as `level_up` listed them.
    pub picks: Vec<String>,
}
