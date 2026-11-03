//! The map: places joined by roads, read from a world's `map.json`.
//!
//! Roads go both ways. Where the caravan stands and what the party has discovered is
//! [`crate::WorldState`]; this module is the file.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::travel::Pace;

/// A world's map file: places and the roads between them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorldMap {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// Every place, by id
    pub places: Vec<Place>,
    /// Every road; each goes both ways
    pub roads: Vec<Road>,
    /// Where the map's open edges are: the places a generated road will leave from later.
    /// Closed to travel in Milestone 9, with no road leading to them; DM data only.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub edges: Vec<Edge>,
}

/// An open edge of the map, where the road generator will attach a road later.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Edge {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The id, in snake_case
    pub id: String,
    /// The place the edge leaves from
    pub from: String,
    /// What lies beyond, for the DM's prose ("the old road west")
    pub name: String,
    /// What will be generated there
    pub generate: Generate,
}

/// What a generator builds beyond an edge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Generate {
    /// A long road to a far place, made of generated legs
    Road,
}

/// A place on the map: a town, a village, an inn, a ruin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Place {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The id, in snake_case
    pub id: String,
    /// The name players read
    pub name: String,
    /// What kind of place it is (`town`, `village`, `inn`, `ruin`), for the DM's prose
    pub kind: String,
    /// Whether the place has a market (markets come with the second sandbox)
    #[serde(default)]
    pub market: bool,
    /// Whether the party knows the place before the first journey
    #[serde(default)]
    pub discovered: bool,
    /// The scene the engine loads on arrival; none means the shared road scene
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene: Option<String>,
    /// The pack slot this place holds: the one link from the map to a scenario pack, which
    /// names the slot it fills. The map knows nothing of the pack's contents
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pack_slot: Option<String>,
    /// A night's room and board at the place's inn, per person, in copper pieces; none
    /// when the place has no inn
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inn_cp: Option<u32>,
}

/// A road between two places. Its terrain sets the maximum travel pace (SRD 5.2.1,
/// Travel Terrain), and a good road raises that by one step.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Road {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The id, in snake_case
    pub id: String,
    /// One end, a place id
    pub from: String,
    /// The other end, a place id
    pub to: String,
    /// The length in miles
    pub miles: u32,
    /// The predominant terrain
    pub terrain: Terrain,
    /// A good road: the maximum pace is one step faster (SRD 5.2.1, Good Roads)
    #[serde(default)]
    pub good_road: bool,
    /// The deck zone road cards are drawn from
    pub zone: String,
}

/// The terrain of a road, from the SRD 5.2.1 Travel Terrain table. Waterborne travel
/// is not modelled.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Terrain {
    /// Fast with equipment such as skis, which the world does not model, so Normal
    Arctic,
    /// Normal
    Coastal,
    /// Normal
    Desert,
    /// Normal
    Forest,
    /// Fast
    Grassland,
    /// Normal
    Hill,
    /// Slow
    Mountain,
    /// Slow
    Swamp,
    /// Normal
    Underdark,
    /// Normal
    Urban,
}

impl Terrain {
    /// The Maximum Pace column of the SRD 5.2.1 Travel Terrain table.
    pub fn max_pace(self) -> Pace {
        match self {
            Terrain::Grassland => Pace::Fast,
            Terrain::Mountain | Terrain::Swamp => Pace::Slow,
            Terrain::Arctic
            | Terrain::Coastal
            | Terrain::Desert
            | Terrain::Forest
            | Terrain::Hill
            | Terrain::Underdark
            | Terrain::Urban => Pace::Normal,
        }
    }
}

impl Road {
    /// The fastest pace allowed on this road.
    pub fn max_pace(&self) -> Pace {
        let pace = self.terrain.max_pace();
        if self.good_road { pace.faster() } else { pace }
    }

    /// The end that is not `place`, if `place` is an end.
    pub fn other_end(&self, place: &str) -> Option<&str> {
        if self.from == place {
            Some(&self.to)
        } else if self.to == place {
            Some(&self.from)
        } else {
            None
        }
    }
}

/// Where the caravan is: in a place, or on a road part of the way.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Position {
    /// In a place
    At {
        /// The place id
        place: String,
    },
    /// On a road, heading for one end
    OnRoad {
        /// The road id
        road: String,
        /// The place the caravan heads for
        toward: String,
        /// Miles still to go
        miles_left: u32,
    },
}

/// Why a map file is unusable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MapError(pub String);

impl std::fmt::Display for MapError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "bad map: {}", self.0)
    }
}

impl std::error::Error for MapError {}

impl WorldMap {
    /// Checks the file: unique ids, roads between two different known places, no road
    /// of 0 miles, every place reachable from every other, one place per pack slot, and
    /// edges that leave from a known place.
    pub fn validate(&self) -> Result<(), MapError> {
        let mut places = BTreeSet::new();
        for place in &self.places {
            if !places.insert(place.id.as_str()) {
                return Err(MapError(format!("two places with id {}", place.id)));
            }
        }
        if places.is_empty() {
            return Err(MapError("no places".into()));
        }
        let mut roads = BTreeSet::new();
        let mut links: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
        for road in &self.roads {
            if !roads.insert(road.id.as_str()) {
                return Err(MapError(format!("two roads with id {}", road.id)));
            }
            for end in [&road.from, &road.to] {
                if !places.contains(end.as_str()) {
                    return Err(MapError(format!(
                        "road {} ends at unknown place {end}",
                        road.id
                    )));
                }
            }
            if road.from == road.to {
                return Err(MapError(format!("road {} is a loop", road.id)));
            }
            if road.miles == 0 {
                return Err(MapError(format!("road {} is 0 miles long", road.id)));
            }
            links.entry(&road.from).or_default().push(&road.to);
            links.entry(&road.to).or_default().push(&road.from);
        }
        let mut slots = BTreeSet::new();
        for place in &self.places {
            if let Some(slot) = &place.pack_slot
                && !slots.insert(slot.as_str())
            {
                return Err(MapError(format!("two places hold pack slot {slot}")));
            }
        }
        let mut edges = BTreeSet::new();
        for edge in &self.edges {
            if places.contains(edge.id.as_str()) || !edges.insert(edge.id.as_str()) {
                return Err(MapError(format!(
                    "edge id {} is used twice or by a place",
                    edge.id
                )));
            }
            if !places.contains(edge.from.as_str()) {
                return Err(MapError(format!(
                    "edge {} leaves from unknown place {}",
                    edge.id, edge.from
                )));
            }
        }
        let start = self.places[0].id.as_str();
        let mut seen = BTreeSet::from([start]);
        let mut queue = vec![start];
        while let Some(place) = queue.pop() {
            for next in links.get(place).into_iter().flatten() {
                if seen.insert(next) {
                    queue.push(next);
                }
            }
        }
        if let Some(lost) = places.iter().find(|p| !seen.contains(*p)) {
            return Err(MapError(format!("no road reaches {lost} from {start}")));
        }
        Ok(())
    }

    /// The place with this id.
    pub fn place(&self, id: &str) -> Option<&Place> {
        self.places.iter().find(|p| p.id == id)
    }

    /// The road with this id.
    pub fn road(&self, id: &str) -> Option<&Road> {
        self.roads.iter().find(|r| r.id == id)
    }

    /// Every road with an end at `place`.
    pub fn roads_from<'a>(&'a self, place: &'a str) -> impl Iterator<Item = &'a Road> + 'a {
        self.roads
            .iter()
            .filter(move |r| r.other_end(place).is_some())
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Three places in a line: town, 12 miles of good grassland road to the inn, 20 miles
    /// of hill trail to the ruin.
    pub(crate) fn small_map() -> WorldMap {
        serde_json::from_str(
            r#"{
              "_comment": "test map",
              "places": [
                {"id": "town", "name": "Town", "kind": "town", "market": true, "discovered": true, "scene": "town"},
                {"id": "inn", "name": "Inn", "kind": "inn", "discovered": true},
                {"id": "ruin", "name": "Ruin", "kind": "ruin"}
              ],
              "roads": [
                {"id": "town_inn", "from": "town", "to": "inn", "miles": 12, "terrain": "grassland", "good_road": true, "zone": "fields"},
                {"id": "inn_ruin", "from": "inn", "to": "ruin", "miles": 20, "terrain": "hill", "zone": "hills"}
              ]
            }"#,
        )
        .unwrap()
    }

    #[test]
    fn a_sound_map_validates() {
        small_map().validate().unwrap();
    }

    #[test]
    fn a_cut_off_place_is_refused() {
        let mut map = small_map();
        map.roads.pop();
        assert_eq!(
            map.validate().unwrap_err().0,
            "no road reaches ruin from town"
        );
    }

    #[test]
    fn a_road_to_nowhere_is_refused() {
        let mut map = small_map();
        map.roads[0].to = "castle".into();
        assert!(
            map.validate()
                .unwrap_err()
                .0
                .contains("unknown place castle")
        );
    }

    #[test]
    fn terrain_and_good_roads_set_the_maximum_pace() {
        let map = small_map();
        // Grassland is Fast already; a good road cannot go faster.
        assert_eq!(map.road("town_inn").unwrap().max_pace(), Pace::Fast);
        assert_eq!(map.road("inn_ruin").unwrap().max_pace(), Pace::Normal);
        let mut swamp = map.road("inn_ruin").unwrap().clone();
        swamp.terrain = Terrain::Swamp;
        assert_eq!(swamp.max_pace(), Pace::Slow);
        swamp.good_road = true;
        assert_eq!(swamp.max_pace(), Pace::Normal);
    }

    #[test]
    fn edges_and_pack_slots_are_checked() {
        let mut map = small_map();
        map.places[2].pack_slot = Some("the_silent_mill".into());
        map.edges.push(Edge {
            comment: None,
            id: "road_west".into(),
            from: "town".into(),
            name: "the road west".into(),
            generate: Generate::Road,
        });
        map.validate().unwrap();

        let mut twice = map.clone();
        twice.places[1].pack_slot = Some("the_silent_mill".into());
        assert_eq!(
            twice.validate().unwrap_err().0,
            "two places hold pack slot the_silent_mill"
        );

        let mut nowhere = map.clone();
        nowhere.edges[0].from = "castle".into();
        assert!(
            nowhere
                .validate()
                .unwrap_err()
                .0
                .contains("unknown place castle")
        );

        let mut clash = map;
        clash.edges[0].id = "inn".into();
        assert!(clash.validate().unwrap_err().0.contains("edge id inn"));
    }

    #[test]
    fn an_unknown_field_is_refused() {
        let error =
            serde_json::from_str::<WorldMap>(r#"{"places": [], "roads": [], "rivers": []}"#)
                .unwrap_err();
        assert!(error.to_string().contains("rivers"));
    }
}
