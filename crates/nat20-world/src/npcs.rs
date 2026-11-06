//! Place NPCs (API-48): townsfolk who live in one place and are still there, as the party left
//! them, when it comes back.
//!
//! A world's `npcs.json` names each NPC once: who they are, what they fight as, where they
//! stand and what they carry. The world remembers what changes: Hit Points, whether they are
//! alive, whether the party has met them, and their coin and items. The NPCs exist in core only
//! while the party is in their place. The server spawns them on arrival from this record and
//! writes them back here when the party leaves, so between visits nothing happens to them
//! (no healing, no trading) until schedules exist.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::map::{MapError, WorldMap};

/// A world's `npcs.json`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NpcFile {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The place NPCs, in file order
    pub npcs: Vec<NpcDef>,
}

/// One place NPC as the world file names them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NpcDef {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The id, in snake_case: also the creature's handle in the place's scene
    pub id: String,
    /// The name players read
    pub name: String,
    /// What a Russian run calls them (AGT-38), such as «староста Осрик Хейл»
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name_ru: Option<String>,
    /// The engine stat block they fight as (`guard`, `commoner`)
    pub monster: String,
    /// The place they live in, a place id
    pub place: String,
    /// The anchor of the place's scene they stand at
    pub anchor: String,
    /// How they feel about the party at first
    #[serde(default)]
    pub attitude: Attitude,
    /// What they carry at first: coin and items, as a scene creature's `carries`
    #[serde(default)]
    pub carries: NpcCarries,
    /// Who they are, for the DM only
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

/// How an NPC feels about the party. A hostile NPC stands on the hostile side of a fight;
/// the others are neutral.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Attitude {
    /// Glad of them
    Friendly,
    /// Neither
    #[default]
    Indifferent,
    /// Against them
    Hostile,
}

/// Coin and items an NPC carries.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NpcCarries {
    /// Coins by kind
    #[serde(default)]
    pub coins: NpcCoins,
    /// Items, each kind once
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<NpcItem>,
}

/// The five SRD coins.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NpcCoins {
    /// Copper pieces
    #[serde(default)]
    pub cp: u32,
    /// Silver pieces
    #[serde(default)]
    pub sp: u32,
    /// Electrum pieces
    #[serde(default)]
    pub ep: u32,
    /// Gold pieces
    #[serde(default)]
    pub gp: u32,
    /// Platinum pieces
    #[serde(default)]
    pub pp: u32,
}

/// Some of one item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NpcItem {
    /// The item id, as on a sheet
    pub item: String,
    /// How many
    pub quantity: u32,
}

/// What the world remembers about one NPC: what a visit can change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NpcState {
    /// Hit Points when the party last left them; none means at full
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hp: Option<u32>,
    /// Whether they are alive; the dead are not met again
    pub alive: bool,
    /// Whether the party has been in their place while they were there
    #[serde(default)]
    pub met: bool,
    /// How they feel about the party
    #[serde(default)]
    pub attitude: Attitude,
    /// What they carry
    #[serde(default)]
    pub carries: NpcCarries,
}

impl NpcState {
    /// An NPC as the world file starts them: alive, unhurt, not met.
    pub fn new(def: &NpcDef) -> Self {
        Self {
            hp: None,
            alive: true,
            met: false,
            attitude: def.attitude,
            carries: def.carries.clone(),
        }
    }
}

/// What an NPC is like when the party leaves their place, as core holds it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NpcLeft {
    /// Hit Points now, and the maximum
    pub hp: (u32, u32),
    /// Whether they are alive
    pub alive: bool,
    /// What they carry now
    pub carries: NpcCarries,
}

impl NpcFile {
    /// Checks the file against the map: ids unique and plain, and every NPC in a place the map
    /// has. The scene anchors are the server's to check: the world knows no scenes.
    pub fn validate(&self, map: &WorldMap) -> Result<(), MapError> {
        let mut ids = BTreeSet::new();
        for npc in &self.npcs {
            let plain = !npc.id.is_empty()
                && npc
                    .id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
            // dm and world are the table's own names, never a creature's handle
            if !plain || npc.id == "dm" || npc.id == "world" {
                return Err(MapError(format!(
                    "the NPC id {:?} is not a plain snake_case name",
                    npc.id
                )));
            }
            if !ids.insert(npc.id.as_str()) {
                return Err(MapError(format!("the NPC {} is named twice", npc.id)));
            }
            if map.place(&npc.place).is_none() {
                return Err(MapError(format!(
                    "the NPC {} lives in unknown place {}",
                    npc.id, npc.place
                )));
            }
            if npc.name.trim().is_empty()
                || npc.name.chars().count() > 40
                || npc
                    .name
                    .chars()
                    .any(|c| c.is_control() || matches!(c, '\u{2028}' | '\u{2029}'))
            {
                return Err(MapError(format!(
                    "the NPC {}'s name is one line of 1 to 40 characters",
                    npc.id
                )));
            }
            if npc.carries.items.iter().any(|i| i.quantity == 0) {
                return Err(MapError(format!(
                    "the NPC {} carries an item with quantity 0",
                    npc.id
                )));
            }
        }
        Ok(())
    }
}

/// Fills in the state of every NPC the file names that `state` doesn't know yet (a new world
/// file, or a roster saved before the NPC was written), and drops the state of NPCs the file
/// no longer names.
pub fn settle(defs: &[NpcDef], state: &mut BTreeMap<String, NpcState>) {
    state.retain(|id, _| defs.iter().any(|d| d.id == *id));
    for def in defs {
        state
            .entry(def.id.clone())
            .or_insert_with(|| NpcState::new(def));
    }
}

/// Records an NPC as the party leaves them: their Hit Points (none when at full), whether they
/// are alive, and what they carry. A living NPC left at 0 Hit Points comes back with 1.
pub fn left(state: &mut NpcState, now: NpcLeft) {
    let (current, max) = now.hp;
    state.alive = now.alive;
    state.hp = (now.alive && current < max).then_some(current.max(1).min(max));
    state.carries = now.carries;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map() -> WorldMap {
        serde_json::from_str(
            r#"{"places": [{"id": "town", "name": "Town", "kind": "town"}], "roads": []}"#,
        )
        .unwrap()
    }

    fn file(json: &str) -> NpcFile {
        serde_json::from_str(json).unwrap()
    }

    const REEVE: &str = r#"{"npcs": [{"id": "reeve", "name": "Reeve Hal", "monster": "guard", "place": "town", "anchor": "square", "carries": {"coins": {"gp": 4}}}]}"#;

    #[test]
    fn a_file_reads_and_checks_against_the_map() {
        let npcs = file(REEVE);
        assert_eq!(npcs.npcs[0].attitude, Attitude::Indifferent);
        assert_eq!(npcs.npcs[0].carries.coins.gp, 4);
        npcs.validate(&map()).unwrap();
        let elsewhere = file(&REEVE.replace(r#""place": "town""#, r#""place": "moon""#));
        assert!(elsewhere.validate(&map()).is_err());
        let twice = NpcFile {
            comment: None,
            npcs: vec![npcs.npcs[0].clone(), npcs.npcs[0].clone()],
        };
        assert!(twice.validate(&map()).is_err());
        let bad_id = file(&REEVE.replace(r#""id": "reeve""#, r#""id": "Reeve""#));
        assert!(bad_id.validate(&map()).is_err());
        let world = file(&REEVE.replace(r#""id": "reeve""#, r#""id": "world""#));
        assert!(
            world.validate(&map()).is_err(),
            "world is the ledger's name"
        );
        let mut two_lines = npcs.clone();
        two_lines.npcs[0].name = "Reeve\rof the town".into();
        assert!(two_lines.validate(&map()).is_err());
    }

    #[test]
    fn settling_adds_new_npcs_and_drops_gone_ones_keeping_the_rest() {
        let npcs = file(REEVE);
        let mut state = BTreeMap::new();
        state.insert("ghost".to_string(), NpcState::new(&npcs.npcs[0]));
        settle(&npcs.npcs, &mut state);
        assert_eq!(state.keys().collect::<Vec<_>>(), ["reeve"]);
        state.get_mut("reeve").unwrap().met = true;
        settle(&npcs.npcs, &mut state);
        assert!(state["reeve"].met, "a known NPC keeps what happened");
    }

    #[test]
    fn leaving_keeps_hit_points_below_the_maximum_and_coin() {
        let npcs = file(REEVE);
        let mut state = NpcState::new(&npcs.npcs[0]);
        let carries = NpcCarries {
            coins: NpcCoins {
                gp: 5,
                ..NpcCoins::default()
            },
            items: Vec::new(),
        };
        left(
            &mut state,
            NpcLeft {
                hp: (4, 11),
                alive: true,
                carries: carries.clone(),
            },
        );
        assert_eq!((state.hp, state.alive), (Some(4), true));
        assert_eq!(state.carries, carries);
        left(
            &mut state,
            NpcLeft {
                hp: (11, 11),
                alive: true,
                carries: carries.clone(),
            },
        );
        assert_eq!(state.hp, None, "at full");
        left(
            &mut state,
            NpcLeft {
                hp: (0, 11),
                alive: true,
                carries: carries.clone(),
            },
        );
        assert_eq!(state.hp, Some(1), "a living NPC comes back with at least 1");
        left(
            &mut state,
            NpcLeft {
                hp: (0, 11),
                alive: false,
                carries,
            },
        );
        assert_eq!((state.hp, state.alive), (None, false));
    }
}
