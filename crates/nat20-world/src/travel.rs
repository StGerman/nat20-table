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

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::{
    caravan::{Caravan, CaravanError, Goods, Owner},
    clock::Clock,
    map::{MapError, Position, WorldMap},
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
            },
        })
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
}
