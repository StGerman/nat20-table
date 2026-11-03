//! The `world` block of a campaign file: which world, where and when the campaign starts, the
//! caravan and the route.
//!
//! A campaign file is a scenario pack's `campaign.json`, an extension of the `adventure.json`
//! format: the game reads the rest of it, the engine reads only this block.

use serde::{Deserialize, Serialize};

use crate::{caravan::Caravan, escort::EscortTerms};

/// A campaign file as the engine reads it: only its `world` block.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CampaignFile {
    /// The world block
    pub world: CampaignWorld,
}

/// Where and when the campaign starts, on which world, with which caravan.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CampaignWorld {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The world id: the folder `worlds/<id>/` with `map.json` and `goods.json`
    pub map: String,
    /// The place the campaign starts in
    pub start: String,
    /// The day it starts on, from 1
    #[serde(default = "first_day")]
    pub day: u32,
    /// The hour it starts at, 0 to 23
    pub hour: u32,
    /// The caravan at the start
    pub caravan: Caravan,
    /// Place ids in the order an NPC owner travels them; may be empty for a player owner
    #[serde(default)]
    pub route: Vec<String>,
    /// The scene for the road and for places without a scene of their own
    pub road_scene: String,
    /// The escort contract the party is hired on, if any (API-47)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub escort: Option<EscortTerms>,
}

fn first_day() -> u32 {
    1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_engine_reads_only_the_world_block() {
        let file: CampaignFile = serde_json::from_str(
            r#"{
              "format_version": 2,
              "title": "the game reads this",
              "world": {
                "map": "vale", "start": "town", "hour": 8, "road_scene": "road",
                "route": ["town", "inn"],
                "caravan": {"owner": "npc:tobin", "wagons": []}
              }
            }"#,
        )
        .unwrap();
        assert_eq!(file.world.day, 1);
        assert_eq!(file.world.route, ["town", "inn"]);
    }
}
