//! The only place that turns full state into a view (CLAUDE.md Rule 3, contract/protocol.md §5).
//!
//! The session stores everything in full form. A viewer is `dm` or a creature handle; this
//! module decides what that viewer gets: the DM sees everything, a player sees its own
//! creature in full and everyone else as observed, never sees an event outside its visibility,
//! and gets every roll in the `player` view.

use nat20_api_contract::{
    Anchor, AnchorObserved, AnchorView, CheckView, Condition, CreatureFull, CreatureObserved,
    EncounterView, Event, EventKind, Handle, Mode, PlaceKnown, PointFt, RoadKnown, RoadUnexplored,
    RollView, Sheet, SpawnView, State, Visibility, WorldDm, WorldPlayer,
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
    let WorldFull { view, drivers } = full;
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
            }),
            (false, false) => {}
        }
    }
    WorldPlayer {
        clock: view.clock,
        at: view.at,
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
            })
            .collect(),
        roads,
        unexplored,
        caravan: view.caravan,
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
