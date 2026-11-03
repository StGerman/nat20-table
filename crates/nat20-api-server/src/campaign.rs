//! The living world in a session (API-41): reads the campaign and world files, keeps the
//! world, travels it, and builds the DM's world view. `projection.rs` turns that view into a
//! player's.
//!
//! The world itself is `nat20_world` (serde only, decision 0057); this module is the bridge to
//! the wire. Core is reached only through the adapter: the session moves core's time.

use std::path::{Path, PathBuf};

use nat20_api_contract::{
    CaravanView, CargoView, ClockView, ErrorCode, Handle, LegView, MilesToday, Pace, PlaceDm,
    RejectReason, RoadDm, Terrain, WagonView, Watch, WorldDm, WorldPosition,
};
use nat20_world as world;
use serde::de::DeserializeOwned;

use crate::{
    errors::{error, rejected},
    paths, scene,
};

/// The campaign file in a scenario pack.
pub const CAMPAIGN_FILE: &str = "campaign.json";

/// A running campaign: the world, the party that travels with the caravan, and the road scene.
#[derive(Debug, Clone)]
pub struct Campaign {
    /// The world
    pub world: world::World,
    /// The creatures that travel with the caravan, carried into every scene a journey loads
    pub party: Vec<Handle>,
    /// The scene for the road and for places without a scene of their own
    pub road_scene: String,
}

impl Campaign {
    /// Reads `campaign.json` from the pack and its world from `<pack>/worlds/<id>/`, else from
    /// the shared worlds directory, and checks that every scene a journey can load exists.
    pub fn read(data_dir: &Path, party: Vec<Handle>) -> Result<Self, nat20_api_contract::ApiError> {
        let file: world::CampaignFile = read_json(&data_dir.join(CAMPAIGN_FILE), "campaign")?;
        let setup = file.world;
        if !scene::is_plain_name(&setup.map) {
            return Err(bad(format!(
                "The campaign's world id {:?} is not a plain name.",
                setup.map
            )));
        }
        let dir = world_dir(data_dir, &setup.map);
        let map: world::WorldMap = read_json(&dir.join("map.json"), "world map")?;
        let goods: world::Goods = read_json(&dir.join("goods.json"), "goods file")?;
        if setup.day == 0 || setup.hour > 23 {
            return Err(bad(format!(
                "The campaign starts on day {} at hour {}; days count from 1 and hours run 0 to 23.",
                setup.day, setup.hour
            )));
        }
        if let Some(error) = setup
            .caravan
            .overloaded(&goods)
            .map_err(|e| bad(format!("The campaign's caravan: {e}.")))?
        {
            return Err(bad(format!("The campaign's caravan: {error}.")));
        }
        let built = world::World::new(
            map,
            goods,
            setup.route,
            setup.caravan,
            &setup.start,
            world::Clock::at(setup.day, setup.hour, 0),
        )
        .map_err(|e| bad(format!("The campaign's world {}: {e}.", setup.map)))?;
        let campaign = Self {
            world: built,
            party,
            road_scene: setup.road_scene,
        };
        let mut scenes: Vec<&str> = campaign
            .world
            .map
            .places
            .iter()
            .filter_map(|p| p.scene.as_deref())
            .collect();
        scenes.push(&campaign.road_scene);
        for id in scenes {
            scene::read(data_dir, id)?;
        }
        Ok(campaign)
    }

    /// Whether `handle` may call `travel`: the owner, or any party member when an NPC owns the
    /// caravan.
    pub fn drives(&self, handle: &str) -> bool {
        let in_party = self.party.iter().any(|h| h.0 == handle);
        in_party && self.world.state.caravan.may_drive(handle, in_party)
    }

    /// Every party member who may call `travel`.
    pub fn drivers(&self) -> Vec<String> {
        self.party
            .iter()
            .filter(|h| self.drives(&h.0))
            .map(|h| h.0.clone())
            .collect()
    }

    /// The scene a caravan at `at` stands in: the place's own, else the road scene.
    pub fn scene_at(&self, at: &world::Position) -> String {
        match at {
            world::Position::At { place } => self
                .world
                .map
                .place(place)
                .and_then(|p| p.scene.clone())
                .unwrap_or_else(|| self.road_scene.clone()),
            world::Position::OnRoad { .. } => self.road_scene.clone(),
        }
    }

    /// The inn's price per person for a night, when the caravan is in a place with an inn.
    pub fn inn_here(&self) -> Option<u32> {
        match &self.world.state.at {
            world::Position::At { place } => self.world.map.place(place).and_then(|p| p.inn_cp),
            world::Position::OnRoad { .. } => None,
        }
    }

    /// Plans one leg on a copy of the world: the copy after the leg and the leg, or why not.
    /// Nothing changes until the caller keeps the copy.
    pub fn plan_leg(
        &self,
        to: Option<&str>,
        pace: Pace,
    ) -> Result<(world::World, world::Leg), nat20_api_contract::ApiError> {
        let mut next = self.world.clone();
        // A party member at half Speed or less forces a Slow pace (SRD 5.2.1, Slower
        // Travelers). Nothing out of combat halves Speed until exhaustion (ENG-29).
        let leg = next
            .travel(to, from_pace(pace), false)
            .map_err(travel_error)?;
        Ok((next, leg))
    }

    /// The leg as the wire tells it, with the world already moved on.
    pub fn leg_view(&self, actor: &str, leg: &world::Leg) -> LegView {
        LegView {
            actor: Handle(actor.to_owned()),
            road: leg.road.clone(),
            pace: to_pace(leg.pace),
            miles: leg.miles,
            minutes: leg.minutes,
            arrived: leg.arrived,
            at: self.position(),
        }
    }

    /// The world as the DM sees it.
    pub fn dm_view(&self) -> WorldDm {
        let w = &self.world;
        let state = &w.state;
        WorldDm {
            clock: clock_view(state.clock),
            at: self.position(),
            today: MilesToday {
                fast: w.miles_left_today(world::Pace::Fast),
                normal: w.miles_left_today(world::Pace::Normal),
                slow: w.miles_left_today(world::Pace::Slow),
            },
            places: w
                .map
                .places
                .iter()
                .map(|p| PlaceDm {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    kind: p.kind.clone(),
                    market: p.market,
                    inn_cp: p.inn_cp,
                    discovered: state.discovered.contains(&p.id),
                    scene: p.scene.clone().unwrap_or_else(|| self.road_scene.clone()),
                })
                .collect(),
            roads: w
                .map
                .roads
                .iter()
                .map(|r| RoadDm {
                    id: r.id.clone(),
                    from: r.from.clone(),
                    to: r.to.clone(),
                    miles: r.miles,
                    terrain: terrain(r.terrain),
                    good_road: r.good_road,
                    max_pace: to_pace(r.max_pace()),
                    zone: r.zone.clone(),
                })
                .collect(),
            caravan: CaravanView {
                owner: state.caravan.owner.to_string(),
                wagons: state
                    .caravan
                    .wagons
                    .iter()
                    .map(|wagon| WagonView {
                        n: wagon.n,
                        vehicle: wagon.vehicle.clone(),
                        limit_lb: wagon.limit_lb(),
                        load_lb: wagon.load_lb(&w.goods).unwrap_or(0),
                        cargo: wagon
                            .cargo
                            .iter()
                            .map(|(good, quantity)| {
                                let known = w.goods.get(good);
                                CargoView {
                                    good: good.clone(),
                                    name: known.map_or_else(|| good.clone(), |g| g.name.clone()),
                                    quantity: *quantity,
                                    weight_lb: known
                                        .map_or(0, |g| g.weight_lb.saturating_mul(*quantity)),
                                }
                            })
                            .collect(),
                    })
                    .collect(),
            },
            route: match state.caravan.owner {
                world::Owner::Npc(_) => w.route.clone(),
                world::Owner::Player(_) => Vec::new(),
            },
        }
    }

    fn position(&self) -> WorldPosition {
        match &self.world.state.at {
            world::Position::At { place } => WorldPosition::At {
                place: place.clone(),
            },
            world::Position::OnRoad {
                road,
                toward,
                miles_left,
            } => {
                let came_from = self
                    .world
                    .map
                    .road(road)
                    .and_then(|r| r.other_end(toward))
                    .unwrap_or_default()
                    .to_owned();
                WorldPosition::OnRoad {
                    road: road.clone(),
                    came_from,
                    miles_left: *miles_left,
                }
            }
        }
    }
}

/// `<pack>/worlds/<id>` when the pack carries its world, else the shared worlds directory.
fn world_dir(data_dir: &Path, id: &str) -> PathBuf {
    let own = data_dir.join("worlds").join(id);
    if own.is_dir() {
        own
    } else {
        paths::worlds_dir().join(id)
    }
}

fn read_json<T: DeserializeOwned>(
    path: &Path,
    what: &str,
) -> Result<T, nat20_api_contract::ApiError> {
    let text = std::fs::read_to_string(path)
        .map_err(|_| bad(format!("There is no {what} at {}.", path.display())))?;
    serde_json::from_str(&text).map_err(|e| bad(format!("The {what} is not valid: {e}.")))
}

fn bad(message: String) -> nat20_api_contract::ApiError {
    error(ErrorCode::BadScene, message)
}

fn travel_error(e: world::TravelError) -> nat20_api_contract::ApiError {
    match e {
        world::TravelError::NoRoad { to } => rejected(
            RejectReason::NoRoad,
            format!("No road from here leads to {to}."),
        ),
        world::TravelError::RouteDone => rejected(
            RejectReason::NoRoad,
            "The caravan's route has no next place from here.",
        ),
        world::TravelError::NeedDestination => error(
            ErrorCode::BadRequest,
            "Say where the caravan goes: a place or road id as `to`.",
        ),
        world::TravelError::PaceTooFast { max } => rejected(
            RejectReason::PaceTooFast,
            format!("The fastest pace here is {}.", pace_name(to_pace(max))),
        ),
        world::TravelError::DayOver => rejected(
            RejectReason::DayOver,
            "The day's travel is spent; the caravan goes on after a night's rest.",
        ),
        world::TravelError::Caravan(world::CaravanError::Overloaded {
            wagon,
            load_lb,
            limit_lb,
        }) => rejected(
            RejectReason::Overloaded,
            format!("Wagon {wagon} carries {load_lb} lb, over its {limit_lb} lb; it cannot move."),
        ),
        world::TravelError::Caravan(other) => error(ErrorCode::Internal, other.to_string()),
    }
}

fn pace_name(pace: Pace) -> &'static str {
    match pace {
        Pace::Fast => "fast",
        Pace::Normal => "normal",
        Pace::Slow => "slow",
    }
}

fn to_pace(pace: world::Pace) -> Pace {
    match pace {
        world::Pace::Fast => Pace::Fast,
        world::Pace::Normal => Pace::Normal,
        world::Pace::Slow => Pace::Slow,
    }
}

fn from_pace(pace: Pace) -> world::Pace {
    match pace {
        Pace::Fast => world::Pace::Fast,
        Pace::Normal => world::Pace::Normal,
        Pace::Slow => world::Pace::Slow,
    }
}

fn terrain(t: world::Terrain) -> Terrain {
    match t {
        world::Terrain::Arctic => Terrain::Arctic,
        world::Terrain::Coastal => Terrain::Coastal,
        world::Terrain::Desert => Terrain::Desert,
        world::Terrain::Forest => Terrain::Forest,
        world::Terrain::Grassland => Terrain::Grassland,
        world::Terrain::Hill => Terrain::Hill,
        world::Terrain::Mountain => Terrain::Mountain,
        world::Terrain::Swamp => Terrain::Swamp,
        world::Terrain::Underdark => Terrain::Underdark,
        world::Terrain::Urban => Terrain::Urban,
    }
}

fn clock_view(clock: world::Clock) -> ClockView {
    ClockView {
        day: clock.day,
        hour: clock.hour(),
        minute: clock.minute % 60,
        watch: match clock.watch() {
            world::Watch::SmallHours => Watch::SmallHours,
            world::Watch::Dawn => Watch::Dawn,
            world::Watch::Morning => Watch::Morning,
            world::Watch::Afternoon => Watch::Afternoon,
            world::Watch::Evening => Watch::Evening,
            world::Watch::Night => Watch::Night,
        },
    }
}
