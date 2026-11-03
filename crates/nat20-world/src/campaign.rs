//! The `world` block of a campaign file: which world, where and when the campaign starts, the
//! caravan and the route.
//!
//! A campaign file is a scenario pack's `campaign.json`, an extension of the `adventure.json`
//! format: the game reads the rest of it, the engine reads only this block.

use serde::{Deserialize, Serialize};

use std::collections::BTreeMap;

use crate::{
    caravan::Caravan,
    escort::EscortTerms,
    map::{MapError, WorldMap},
};

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
    /// The pack's own scene for a place, by place id (MAP-7): a shared world map names no scenes,
    /// so the pack that plays on it says which of its scenes each place loads
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub scenes: BTreeMap<String, String>,
    /// The escort contract the party is hired on, if any (API-47)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub escort: Option<EscortTerms>,
}

fn first_day() -> u32 {
    1
}

impl CampaignWorld {
    /// Gives each place the pack names in `scenes` that scene, over any the map sets. A place the
    /// map doesn't have is an error.
    pub fn place_scenes(&self, map: &mut WorldMap) -> Result<(), MapError> {
        for (place, scene) in &self.scenes {
            let found = map
                .places
                .iter_mut()
                .find(|p| p.id == *place)
                .ok_or_else(|| {
                    MapError(format!(
                        "the campaign gives a scene to unknown place {place}"
                    ))
                })?;
            found.scene = Some(scene.clone());
        }
        Ok(())
    }
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
        assert!(file.world.scenes.is_empty());
    }

    #[test]
    fn the_pack_names_each_place_s_scene_over_the_map() {
        let mut map: WorldMap = serde_json::from_str(
            r#"{"places": [{"id": "town", "name": "Town", "kind": "town"}, {"id": "inn", "name": "Inn", "kind": "inn", "scene": "map_inn"}], "roads": []}"#,
        )
        .unwrap();
        let world: CampaignWorld = serde_json::from_str(
            r#"{"map": "vale", "start": "town", "hour": 8, "road_scene": "road", "scenes": {"town": "fair_town", "inn": "fair_inn"}, "caravan": {"owner": "npc:tobin", "wagons": []}}"#,
        )
        .unwrap();
        world.place_scenes(&mut map).unwrap();
        assert_eq!(
            map.place("town").unwrap().scene.as_deref(),
            Some("fair_town")
        );
        assert_eq!(map.place("inn").unwrap().scene.as_deref(), Some("fair_inn"));
        let stray: CampaignWorld = serde_json::from_str(
            r#"{"map": "vale", "start": "town", "hour": 8, "road_scene": "road", "scenes": {"moon": "x"}, "caravan": {"owner": "npc:tobin", "wagons": []}}"#,
        )
        .unwrap();
        assert!(stray.place_scenes(&mut map).is_err());
    }
}
