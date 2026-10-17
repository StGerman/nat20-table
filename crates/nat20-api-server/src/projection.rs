//! The only place that turns full state into a view (CLAUDE.md Rule 3, contract/protocol.md §5).
//!
//! The session stores everything in full form. A viewer is `dm` or a creature handle; this
//! module decides what that viewer gets: the DM sees everything, a player sees its own
//! creature in full and everyone else as observed, never sees an event outside its visibility,
//! and gets every roll in the `player` view.

use nat20_api_contract::{
    Anchor, AnchorObserved, AnchorView, CheckView, CreatureFull, CreatureObserved, EncounterView,
    Event, EventKind, Handle, Mode, PointFt, RollView, Sheet, State, Visibility,
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
            // Every SRD condition is visible until vision exists; none are modelled yet.
            conditions: c.conditions.clone(),
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
    })
}

/// A sheet goes only to its owner and the DM (Rule 3): `None` for anyone else.
pub fn sheet(viewer: &Viewer, sheet: Sheet) -> Option<Sheet> {
    match viewer {
        Viewer::Dm => Some(sheet),
        Viewer::Creature(handle) if *handle == sheet.handle.0 => Some(sheet),
        Viewer::Creature(_) => None,
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
