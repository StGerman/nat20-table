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
    /// The peoples of the world (API-63), such as the roadfolk, in file order
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub peoples: Vec<PeopleDef>,
}

/// A people of the world (API-63): a name and the one line anyone in the valley could say of
/// them, shown to a player once they have seen or heard of one of its persons.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PeopleDef {
    /// A note for authors; ignored
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The id, in snake_case
    pub id: String,
    /// The name players read, in English
    pub name: String,
    /// What a Russian run calls them; the DM's glossary holds it too
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name_ru: Option<String>,
    /// The one line about them, in English: no number
    pub line: String,
    /// `line` in a Russian run: the table reads it from the world file
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_ru: Option<String>,
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
    /// Every form of the name a story line may hold, in every language the world is told in:
    /// the matcher underlines a word only when it equals one (API-58, design rule N1)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub names: Vec<String>,
    /// What anyone who has seen them sees: one line, no number
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub look: Option<String>,
    /// `look` in a Russian run (decision 0067): the table reads it from the world file
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub look_ru: Option<String>,
    /// What the valley says of them aloud to anyone: one line, a rumour, never a fact
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heard: Option<String>,
    /// `heard` in a Russian run
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heard_ru: Option<String>,
    /// The people they belong to, an id of the file's `peoples` (API-63)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub people: Option<String>,
    /// What they remember of the party: one line per deed, shown only by the rules of
    /// decision 0077
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub remembers: Vec<Remembers>,
    /// The engine stat block they fight as (`guard`, `commoner`)
    pub monster: String,
    /// The place they live in, a place id; none for someone who lives on no map place (a
    /// merchant on the road, someone only heard of)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub place: Option<String>,
    /// The anchor of the place's scene they stand at; with `place` only
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,
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

/// One thing a person remembers of the party (API-58): the line shows once the deed is
/// remembered, by the rules of decision 0077.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Remembers {
    /// The deed id
    pub deed: String,
    /// The line for a viewer who did the deed (in the deed's `by`), in English
    pub you: String,
    /// The line for a viewer whose company did it without them, in English
    pub company: String,
    /// `you` in a Russian run
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub you_ru: Option<String>,
    /// `company` in a Russian run
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub company_ru: Option<String>,
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
    /// The characters who have seen them (API-59), each with the place they last did; none
    /// when it was on the road
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub seen: BTreeMap<String, Option<String>>,
    /// The characters who have heard of them without seeing them (API-59)
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    pub heard: BTreeSet<String>,
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
            seen: BTreeMap::new(),
            heard: BTreeSet::new(),
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
        let plain_id = |id: &str| {
            !id.is_empty()
                && id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
        };
        let one_line = |text: &str| {
            !text.trim().is_empty()
                && !text
                    .chars()
                    .any(|c| c.is_control() || matches!(c, '\u{2028}' | '\u{2029}'))
        };
        let mut peoples = BTreeSet::new();
        for people in &self.peoples {
            if !plain_id(&people.id) {
                return Err(MapError(format!(
                    "the people id {:?} is not a plain snake_case name",
                    people.id
                )));
            }
            if !peoples.insert(people.id.as_str()) {
                return Err(MapError(format!("the people {} is named twice", people.id)));
            }
            let texts = [
                Some(&people.name),
                people.name_ru.as_ref(),
                Some(&people.line),
                people.line_ru.as_ref(),
            ];
            if texts.into_iter().flatten().any(|t| !one_line(t)) {
                return Err(MapError(format!(
                    "the people {}'s name and line are each one line",
                    people.id
                )));
            }
        }
        let mut ids = BTreeSet::new();
        for npc in &self.npcs {
            let plain = plain_id(&npc.id);
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
            match (&npc.place, &npc.anchor) {
                (Some(place), Some(_)) if map.place(place).is_none() => {
                    return Err(MapError(format!(
                        "the NPC {} lives in unknown place {place}",
                        npc.id
                    )));
                }
                (Some(_), Some(_)) | (None, None) => {}
                (Some(_), None) => {
                    return Err(MapError(format!(
                        "the NPC {} lives in a place but stands at no anchor",
                        npc.id
                    )));
                }
                (None, Some(_)) => {
                    return Err(MapError(format!(
                        "the NPC {} has an anchor but lives in no place",
                        npc.id
                    )));
                }
            }
            if npc.names.iter().any(|n| n.trim().is_empty()) {
                return Err(MapError(format!(
                    "the NPC {} lists an empty name form",
                    npc.id
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
            if let Some(people) = npc.people.as_deref().filter(|p| !peoples.contains(p)) {
                return Err(MapError(format!(
                    "the NPC {} belongs to the people {people}, which the file does not record",
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
            peoples: Vec::new(),
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
    fn a_person_s_people_is_one_the_file_records() {
        let roadfolk = file(
            r#"{"peoples": [{"id": "corrins", "name": "the Corrins", "name_ru": "коррины", "line": "Roadfolk.", "line_ru": "Кочевой народ."}],
                "npcs": [{"id": "bel", "name": "Bel", "monster": "commoner", "people": "corrins"}]}"#,
        );
        roadfolk.validate(&map()).unwrap();
        let mut unknown = roadfolk.clone();
        unknown.npcs[0].people = Some("elves".into());
        assert!(
            unknown
                .validate(&map())
                .unwrap_err()
                .0
                .contains("does not record")
        );
        let mut twice = roadfolk.clone();
        twice.peoples.push(roadfolk.peoples[0].clone());
        assert!(
            twice
                .validate(&map())
                .unwrap_err()
                .0
                .contains("named twice")
        );
        let mut two_lines = roadfolk.clone();
        two_lines.peoples[0].line_ru = Some("Кочевой\nнарод.".into());
        assert!(two_lines.validate(&map()).is_err());
        let mut bad_id = roadfolk;
        bad_id.peoples[0].id = "Corrins".into();
        assert!(bad_id.validate(&map()).is_err());
    }

    #[test]
    fn a_person_may_live_on_no_place_but_an_anchor_needs_one() {
        let road = file(
            r#"{"npcs": [{"id": "tam", "name": "Tam", "names": ["Tam", "Тэм", "Тэма"], "monster": "commoner",
                "look": "A barefoot boy with a bundle.", "remembers": [{"deed": "fed_tam", "you": "You fed him.", "company": "Your company fed him."}]}]}"#,
        );
        road.validate(&map()).unwrap();
        assert_eq!(road.npcs[0].place, None);
        assert_eq!(road.npcs[0].names.len(), 3);
        let anchor_only = file(
            r#"{"npcs": [{"id": "tam", "name": "Tam", "monster": "commoner", "anchor": "square"}]}"#,
        );
        assert!(anchor_only.validate(&map()).is_err());
        let place_only = file(
            r#"{"npcs": [{"id": "tam", "name": "Tam", "monster": "commoner", "place": "town"}]}"#,
        );
        assert!(place_only.validate(&map()).is_err());
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
