//! The only place that turns full state into a view (CLAUDE.md Rule 3, contract/protocol.md §5).
//!
//! The session stores everything in full form. A viewer is `dm` or a creature handle; this
//! module decides what that viewer gets: the DM sees everything, a player sees its own
//! creature in full and everyone else as observed, never sees an event outside its visibility,
//! and gets every roll in the `player` view.

use nat20_api_contract::{
    Anchor, AnchorObserved, AnchorView, CardChoiceView, CardPlayer, CheckView, Condition,
    CreatureFull, CreatureObserved, EncounterView, Event, EventKind, Handle, Mode, NpcKnown,
    PlaceKnown, PointFt, ReachView, RoadKnown, RoadUnexplored, RollView, Sheet, SpawnView, State,
    TripView, Visibility, WorldDm, WorldPlayer,
};

use crate::render;

/// Who a response is for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Viewer {
    /// The DM: sees everything.
    Dm,
    /// A creature's player.
    Creature(String),
}

impl Viewer {
    /// `dm` or a creature handle.
    pub fn parse(raw: &str) -> Self {
        if raw == "dm" {
            Viewer::Dm
        } else {
            Viewer::Creature(raw.to_owned())
        }
    }
}

/// The scene state in full form, before projection.
pub struct FullState {
    pub mode: Mode,
    pub scene_id: Option<String>,
    pub round: Option<u32>,
    pub initiative: Vec<Handle>,
    pub creatures: Vec<CreatureFull>,
    pub anchors: Vec<Anchor>,
    /// Session flags, sorted.
    pub flags: Vec<String>,
    /// The scene's checks with whether each was rolled.
    pub checks: Vec<CheckView>,
    /// The scene's encounters with which one runs and whether its surrender is available.
    pub encounters: Vec<EncounterView>,
    /// The scene's spawns with whether each was placed.
    pub spawns: Vec<SpawnView>,
    /// The living world, once a campaign runs.
    pub world: Option<WorldFull>,
}

/// The world in full, and who may drive the caravan.
pub struct WorldFull {
    /// The DM's view.
    pub view: WorldDm,
    /// The handles that may call `travel`.
    pub drivers: Vec<String>,
    /// How long each road out of the caravan's place takes, by road id (API-49).
    pub reach: std::collections::BTreeMap<String, ReachView>,
    /// The route to the escort's destination, cut before the first undiscovered place (API-49).
    pub trip: Option<TripView>,
}

/// The state as `viewer` may see it. `None` when a creature viewer is not in the scene.
pub fn state(viewer: &Viewer, full: FullState) -> Option<State> {
    let FullState {
        mode,
        scene_id,
        round,
        initiative,
        creatures,
        anchors,
        flags,
        checks,
        encounters,
        spawns,
        world,
    } = full;
    let handle = match viewer {
        Viewer::Dm => {
            return Some(State::Dm {
                mode,
                scene_id,
                round,
                initiative,
                creatures,
                anchors: anchors
                    .into_iter()
                    .map(|a| AnchorView {
                        id: a.id,
                        name: a.name,
                        position_ft: a.position_ft,
                    })
                    .collect(),
                flags,
                checks,
                encounters,
                spawns,
                world: world.map(|w| w.view),
            });
        }
        Viewer::Creature(handle) => handle,
    };
    let me = creatures.iter().find(|c| c.handle.0 == *handle)?.clone();
    let others = creatures
        .iter()
        .filter(|c| c.handle.0 != *handle)
        .map(|c| CreatureObserved {
            handle: c.handle.clone(),
            name: c.name.clone(),
            side: c.side,
            position_ft: c.position_ft,
            distance_ft: distance_ft(me.position_ft, c.position_ft),
            health: c.health,
            // Every SRD condition is visible until vision exists, except Invisible: an
            // invisible creature is unseen (protocol.md §5).
            conditions: c
                .conditions
                .iter()
                .copied()
                .filter(|c| *c != Condition::Invisible)
                .collect(),
        })
        .collect();
    Some(State::Player {
        viewer: Handle(handle.clone()),
        mode,
        scene_id,
        round,
        initiative,
        anchors: anchors
            .into_iter()
            .map(|a| AnchorObserved {
                distance_ft: distance_ft(me.position_ft, a.position_ft),
                id: a.id,
                name: a.name,
                position_ft: a.position_ft,
            })
            .collect(),
        me,
        others,
        world: world.map(|w| world_for(handle, w)),
    })
}

/// The world as one player sees it (protocol §5): discovered places only; a road whose ends
/// are both discovered in full, a road with one discovered end without where it leads; no
/// deck zones, no route, no scene ids.
fn world_for(handle: &str, full: WorldFull) -> WorldPlayer {
    let WorldFull {
        view,
        drivers,
        reach,
        trip,
    } = full;
    let known: std::collections::HashSet<&str> = view
        .places
        .iter()
        .filter(|p| p.discovered)
        .map(|p| p.id.as_str())
        .collect();
    let mut roads = Vec::new();
    let mut unexplored = Vec::new();
    for road in &view.roads {
        match (
            known.contains(road.from.as_str()),
            known.contains(road.to.as_str()),
        ) {
            (true, true) => roads.push(RoadKnown {
                id: road.id.clone(),
                from: road.from.clone(),
                to: road.to.clone(),
                miles: road.miles,
                terrain: road.terrain,
                good_road: road.good_road,
                max_pace: road.max_pace,
                reach: reach.get(&road.id).copied(),
            }),
            (true, false) | (false, true) => unexplored.push(RoadUnexplored {
                id: road.id.clone(),
                from: if known.contains(road.from.as_str()) {
                    road.from.clone()
                } else {
                    road.to.clone()
                },
                miles: road.miles,
                terrain: road.terrain,
                good_road: road.good_road,
                max_pace: road.max_pace,
                reach: reach.get(&road.id).copied(),
            }),
            (false, false) => {}
        }
    }
    // A party that turned back towards where it set out came from the road's undiscovered
    // end: players see the position from the end they know instead, never the other's name.
    let at = match view.at {
        nat20_api_contract::WorldPosition::OnRoad {
            road,
            came_from,
            miles_left,
        } if !known.contains(came_from.as_str()) => {
            let full_road = view.roads.iter().find(|r| r.id == road);
            let other = full_road.map(|r| if r.from == came_from { &r.to } else { &r.from });
            nat20_api_contract::WorldPosition::OnRoad {
                came_from: other.cloned().unwrap_or_default(),
                miles_left: full_road.map_or(0, |r| r.miles.saturating_sub(miles_left)),
                road,
            }
        }
        at => at,
    };
    WorldPlayer {
        clock: view.clock,
        at,
        today: view.today,
        drives: drivers.iter().any(|d| d == handle),
        places: view
            .places
            .iter()
            .filter(|p| p.discovered)
            .map(|p| PlaceKnown {
                id: p.id.clone(),
                name: p.name.clone(),
                kind: p.kind.clone(),
                market: p.market,
                inn_cp: p.inn_cp,
            })
            .collect(),
        roads,
        unexplored,
        caravan: view.caravan,
        card: view.card.map(|c| CardPlayer {
            target: c.target,
            text: c.text,
            // A player reads the words only: the customs a choice touches are the DM's (API-55).
            choices: c
                .choices
                .into_iter()
                .map(|choice| CardChoiceView {
                    id: choice.id,
                    text: choice.text,
                })
                .collect(),
            said: c.said,
            waiting_for: c.waiting_for,
        }),
        escort: view.escort.map(|e| e.contract),
        trip,
        scout: view.scout,
        // Met NPCs only, and only what the party can see (API-48): never Hit Points, attitude
        // or notes.
        npcs: view
            .npcs
            .into_iter()
            .filter(|n| n.met)
            .map(|n| NpcKnown {
                id: n.id,
                name: n.name,
                place: n.place,
                alive: n.alive,
            })
            .collect(),
    }
}

/// A sheet goes only to its owner and the DM (Rule 3): `None` for anyone else.
pub fn sheet(viewer: &Viewer, sheet: Sheet) -> Option<Sheet> {
    match viewer {
        Viewer::Dm => Some(sheet),
        Viewer::Creature(handle) if *handle == sheet.handle.0 => Some(sheet),
        Viewer::Creature(_) => None,
    }
}

/// Whether `viewer` may list `actor`'s options, with their `unavailable` reasons and the turn's
/// `budget`: its owner and the DM only (Rule 3, the §5 table), as for a sheet.
pub fn lists_options(viewer: &Viewer, actor: &str) -> bool {
    match viewer {
        Viewer::Dm => true,
        Viewer::Creature(handle) => handle == actor,
    }
}

fn distance_ft(p: PointFt, q: PointFt) -> f32 {
    let d =
        ((p.x_ft - q.x_ft).powi(2) + (p.y_ft - q.y_ft).powi(2) + (p.z_ft - q.z_ft).powi(2)).sqrt();
    (d * 10.0).round() / 10.0
}

/// Whether `viewer` may see an event with `visibility`.
pub fn sees(viewer: &Viewer, visibility: &Visibility) -> bool {
    match (viewer, visibility) {
        (Viewer::Dm, _) | (_, Visibility::Public) => true,
        (Viewer::Creature(_), Visibility::Dm) => false,
        (Viewer::Creature(own), Visibility::Owner { handle }) => *own == handle.0,
    }
}

/// The event as `viewer` may see it, with its text rendered for that view; `None` when the
/// viewer may not see it at all.
pub fn event(viewer: &Viewer, full: &Event) -> Option<Event> {
    if !sees(viewer, &full.visibility) {
        return None;
    }
    let kind = match (&full.kind, viewer) {
        (EventKind::Roll { roll }, Viewer::Creature(_)) => EventKind::Roll {
            roll: player_roll(roll),
        },
        (other, _) => other.clone(),
    };
    Some(Event {
        seq: full.seq,
        round: full.round,
        scene: full.scene.clone(),
        visibility: full.visibility.clone(),
        text: render::text(&kind),
        kind,
    })
}

/// Dice, total and outcome: what is said at the table.
fn player_roll(full: &RollView) -> RollView {
    match full {
        RollView::Full {
            id,
            kind,
            label,
            roller,
            target,
            dice,
            total,
            outcome,
            advantage,
            ..
        } => RollView::Player {
            id: id.clone(),
            kind: *kind,
            label: label.clone(),
            roller: roller.clone(),
            target: target.clone(),
            dice: dice.clone(),
            total: *total,
            outcome: *outcome,
            advantage: *advantage,
        },
        player => player.clone(),
    }
}

#[cfg(test)]
mod turned_back_tests {
    use super::*;

    /// The DM's world from the travel fixture: on the tower trail, 8 miles from the
    /// undiscovered tower, having set out from the inn.
    fn dm_world() -> WorldDm {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../contract/fixtures/travel.jsonl"
        );
        let line = std::fs::read_to_string(path)
            .unwrap()
            .lines()
            .find(|l| l.contains(r#""id": "tr-15""#) || l.contains(r#""id":"tr-15""#))
            .unwrap()
            .to_owned();
        let v: serde_json::Value = serde_json::from_str(&line).unwrap();
        serde_json::from_value(v["response"]["result"]["state"]["world"].clone()).unwrap()
    }

    #[test]
    fn a_turned_back_party_never_shows_the_undiscovered_end() {
        let mut view = dm_world();
        // Turned back towards the inn: the DM's position names the tower as where it came from.
        view.at = nat20_api_contract::WorldPosition::OnRoad {
            road: "tower_trail".into(),
            came_from: "old_tower".into(),
            miles_left: 15,
        };
        let player = world_for(
            "maren",
            WorldFull {
                view,
                drivers: Vec::new(),
                reach: Default::default(),
                trip: None,
            },
        );
        assert_eq!(
            player.at,
            nat20_api_contract::WorldPosition::OnRoad {
                road: "tower_trail".into(),
                came_from: "crossing_inn".into(),
                miles_left: 5,
            }
        );
    }
}
