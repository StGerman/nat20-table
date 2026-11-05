//! Travel plans (API-49): how long each road out of the caravan's place takes, and the route
//! to the escort's destination leg by leg. Both are worked out on a copy of the world with the
//! travel rule itself ([`World::travel`], [`World::pass_night`]), so no caller repeats it and
//! the world never changes.
//!
//! A plan goes at a Normal pace, or slower where the road allows no more: the pace the table
//! moves the caravan at. When the day's distance runs out on the way, the party spends the
//! night on the road and goes on the next morning.

use crate::{Clock, Owner, Pace, Position, TravelError, World};

/// The most nights a plan spends on one road before it gives up. No road on a map is that long.
const MAX_NIGHTS: u32 = 30;

/// How long one road out of the caravan's place takes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reach {
    /// The road
    pub road: String,
    /// The pace the plan goes at
    pub pace: Pace,
    /// Minutes on the move, nights left out
    pub minutes: u32,
    /// Nights spent before arriving: 0 when the caravan gets there today
    pub nights: u32,
    /// When the caravan gets to the road's other end
    pub arrives: Clock,
}

/// One leg of a [`Trip`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TripLeg {
    /// The road
    pub road: String,
    /// The place the leg ends at, always one the party has discovered
    pub to: String,
    /// The pace the plan goes at
    pub pace: Pace,
    /// Miles still to go on this road
    pub miles: u32,
    /// Minutes on the move, nights left out
    pub minutes: u32,
    /// Nights spent before arriving, counted from the leg before
    pub nights: u32,
    /// When the caravan gets to `to`
    pub arrives: Clock,
}

/// The route an NPC owner travels from where the caravan is to the escort's destination.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Trip {
    /// The legs in travel order. They stop before the first place the party hasn't discovered,
    /// so a trip never names one.
    pub legs: Vec<TripLeg>,
    /// Whether the legs reach the destination; false when they stop before an undiscovered place
    pub complete: bool,
}

impl World {
    /// The pace a plan goes along `road` at: Normal, or the road's slower maximum.
    fn plan_pace(&self, road: &str) -> Pace {
        self.map
            .road(road)
            .map_or(Pace::Normal, |r| r.max_pace().min(Pace::Normal))
    }

    /// How long each road out of the caravan's place takes, in map file order. Empty on the
    /// road, and for a road the travel rule refuses (an overloaded caravan).
    pub fn reach(&self) -> Vec<Reach> {
        let Position::At { place } = &self.state.at else {
            return Vec::new();
        };
        self.map
            .roads_from(place)
            .filter_map(|road| {
                let pace = self.plan_pace(&road.id);
                let mut copy = self.clone();
                let (minutes, nights) = go(&mut copy, &road.id, pace)?;
                Some(Reach {
                    road: road.id.clone(),
                    pace,
                    minutes,
                    nights,
                    arrives: copy.state.clock,
                })
            })
            .collect()
    }

    /// The route to the escort's destination, while an NPC owner follows a route and the
    /// contract is under way. `None` without one, when the caravan is off the route, or when the
    /// travel rule refuses a leg.
    pub fn trip(&self) -> Option<Trip> {
        let terms = self.escort.as_ref()?;
        if !matches!(self.state.caravan.owner, Owner::Npc(_)) || self.route.is_empty() {
            return None;
        }
        let destination = terms.destination.as_str();
        let mut copy = self.clone();
        let mut legs = Vec::new();
        // On a road, the first leg is the rest of it.
        if let Position::OnRoad {
            road,
            toward,
            miles_left,
        } = &self.state.at
        {
            if !self.state.discovered.contains(toward) {
                return Some(Trip {
                    legs,
                    complete: false,
                });
            }
            let (road, toward, miles) = (road.clone(), toward.clone(), *miles_left);
            let pace = self.plan_pace(&road);
            let (minutes, nights) = go(&mut copy, &road, pace)?;
            legs.push(TripLeg {
                road,
                to: toward,
                pace,
                miles,
                minutes,
                nights,
                arrives: copy.state.clock,
            });
        }
        // Where on the route the plan stands: a route may pass one place twice, so each look
        // starts after the stop the plan last reached, and the plan always moves forward.
        let mut from = 0;
        loop {
            let Position::At { place } = copy.state.at.clone() else {
                return None;
            };
            if place == destination {
                return Some(Trip {
                    legs,
                    complete: true,
                });
            }
            let i = from + self.route[from..].iter().position(|p| *p == place)?;
            from = i + 1;
            let next = self.route.get(i + 1)?;
            if !self.state.discovered.contains(next) {
                return Some(Trip {
                    legs,
                    complete: false,
                });
            }
            let road = self
                .map
                .roads_from(&place)
                .find(|r| r.other_end(&place) == Some(next.as_str()))?;
            let (road, miles) = (road.id.clone(), road.miles);
            let pace = self.plan_pace(&road);
            let (minutes, nights) = go(&mut copy, &road, pace)?;
            legs.push(TripLeg {
                road,
                to: next.clone(),
                pace,
                miles,
                minutes,
                nights,
                arrives: copy.state.clock,
            });
        }
    }
}

/// Travels `world` to the end of `road` at `pace`, a night at a time: the minutes on the move
/// and the nights it took. `None` when the travel rule refuses the road.
fn go(world: &mut World, road: &str, pace: Pace) -> Option<(u32, u32)> {
    let (mut minutes, mut nights) = (0, 0);
    while nights <= MAX_NIGHTS {
        match world.travel(Some(road), pace, false) {
            Ok(leg) if leg.arrived => return Some((minutes + leg.minutes, nights)),
            Ok(leg) => minutes += leg.minutes,
            Err(TravelError::DayOver) => {}
            Err(_) => return None,
        }
        world.pass_night(world.night_minutes());
        nights += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{EscortTerms, caravan::tests as caravans, map::tests::small_map};

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

    fn escorted(destination: &str) -> World {
        let mut world = world("npc:odda");
        world.escort = Some(EscortTerms {
            comment: None,
            destination: destination.into(),
            wage_cp: 200,
            advance_days: 0,
            purse_cp: 10_000,
        });
        world
    }

    #[test]
    fn a_road_out_of_here_takes_its_miles_at_the_pace_and_changes_nothing() {
        let world = world("maren");
        let before = world.state.clone();
        // 12 miles of grassland at Normal (the road allows Fast): 4 hours, there by noon.
        assert_eq!(
            world.reach(),
            vec![Reach {
                road: "town_inn".into(),
                pace: Pace::Normal,
                minutes: 240,
                nights: 0,
                arrives: Clock::at(1, 12, 0),
            }]
        );
        assert_eq!(world.state, before);
    }

    #[test]
    fn a_road_longer_than_the_day_left_spends_a_night_on_the_way() {
        let mut world = world("maren");
        world.travel(Some("inn"), Pace::Normal, false).unwrap();
        // 20 miles of hills at Normal with 12 of today's 24 left: 12 today, a night, 8 tomorrow.
        let reach = world.reach();
        assert_eq!(reach.len(), 2, "both roads out of the inn");
        let ruin = reach.iter().find(|r| r.road == "inn_ruin").unwrap();
        assert_eq!(
            (ruin.pace, ruin.minutes, ruin.nights),
            (Pace::Normal, 400, 1)
        );
        // 8 more miles from dawn on day 2: 2 h 40 after waking.
        let mut arrives = Clock::at(2, crate::WAKE_HOUR, 0);
        arrives.advance(160);
        assert_eq!(ruin.arrives, arrives);
    }

    #[test]
    fn on_the_road_nothing_is_reached() {
        let mut world = world("maren");
        world.travel(Some("inn"), Pace::Normal, false).unwrap();
        world.travel(Some("ruin"), Pace::Normal, false).unwrap();
        assert!(matches!(world.state.at, Position::OnRoad { .. }));
        assert!(world.reach().is_empty());
    }

    #[test]
    fn a_trip_follows_the_route_and_stops_before_an_undiscovered_place() {
        let world = escorted("ruin");
        let trip = world.trip().unwrap();
        assert!(!trip.complete, "the ruin is not discovered");
        assert_eq!(trip.legs.len(), 1);
        assert_eq!(trip.legs[0].to, "inn");
        assert_eq!(trip.legs[0].arrives, Clock::at(1, 12, 0));
        assert_eq!(world.trip(), Some(trip), "planning changes nothing");
    }

    #[test]
    fn a_trip_to_a_known_destination_is_complete_and_shares_the_day_across_legs() {
        let mut world = escorted("ruin");
        world.state.discovered.insert("ruin".into());
        let trip = world.trip().unwrap();
        assert!(trip.complete);
        let roads: Vec<_> = trip
            .legs
            .iter()
            .map(|l| (l.road.as_str(), l.nights))
            .collect();
        // The first leg spends 12 of the day's 24 miles; the hills take the other 12, a night, and 8.
        assert_eq!(roads, vec![("town_inn", 0), ("inn_ruin", 1)]);
        assert_eq!(trip.legs[1].minutes, 400);
    }

    #[test]
    fn a_route_that_passes_a_place_twice_is_planned_forward_to_its_end() {
        let mut world = escorted("ruin");
        world.route = ["town", "inn", "town", "inn", "ruin"]
            .map(String::from)
            .to_vec();
        world.state.discovered.insert("ruin".into());
        let trip = world.trip().unwrap();
        assert!(trip.complete);
        let stops: Vec<_> = trip.legs.iter().map(|l| l.to.as_str()).collect();
        assert_eq!(stops, vec!["inn", "town", "inn", "ruin"]);
    }

    #[test]
    fn a_trip_needs_an_npc_owner_and_a_contract() {
        assert_eq!(world("npc:odda").trip(), None, "no contract");
        let mut owned = escorted("ruin");
        owned.state.caravan.owner = Owner::Player("maren".into());
        assert_eq!(owned.trip(), None, "a player owner has no route");
    }

    #[test]
    fn a_trip_from_the_road_finishes_the_road_first() {
        let mut world = escorted("inn");
        // 5 miles along the road from town.
        world.state.at = Position::OnRoad {
            road: "town_inn".into(),
            toward: "inn".into(),
            miles_left: 7,
        };
        let trip = world.trip().unwrap();
        assert!(trip.complete);
        assert_eq!(
            (trip.legs[0].road.as_str(), trip.legs[0].miles),
            ("town_inn", 7)
        );
    }
}
