//! Who rides with the wagon besides its team and its owner (ENG-48, design
//! `docs/design/allies-in-fights-system-design.md` §2 and rule A2): `worlds/<id>/company.json`.
//! An entry joins a card's wagon fight while it rides on the contract under way; the server
//! places it. Nothing here is a rule on a creature (decision 0057): the stat block is core's.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::deck::{Deck, DeedBook, Deeds};
use crate::map::MapError;
use crate::npcs::NpcDef;

/// The pseudo-deed a choice reads, in its `if` or `unless`, for "this company entry rides on
/// this contract" (MAP-22, ENG-48): `rides:<entry id>`. No card writes it; the world adds it to
/// the deeds a card is offered against while the entry rides.
pub const RIDES_PREFIX: &str = "rides:";

/// The deed the death of the caravan's NPC owner `owner` writes in a wagon fight (ENG-48).
pub fn owner_dead_deed(owner: &str) -> String {
    format!("{owner}_dead")
}

/// The deed the death of a team animal writes, by the NPC owner's id (ENG-48).
pub fn lost_a_horse_deed(owner: &str) -> String {
    format!("{owner}_lost_a_horse")
}

/// The company file.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompanyFile {
    /// What the file is, for a person reading it
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The entries, in the order they are placed
    #[serde(default)]
    pub company: Vec<CompanyEntry>,
}

/// One who may ride with the wagon: an animal (`monster`) or a roster person (`npc`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompanyEntry {
    /// The id: the creature's handle in a fight, and `<id>_dead`, `<id>_hurt` when that
    /// happens. A roster person's entry takes the person's id
    pub id: String,
    /// The stat block of an animal; none for a roster person, who fights as their roster
    /// `monster`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub monster: Option<String>,
    /// The roster person this entry is
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub npc: Option<String>,
    /// The name players read, for an animal; a roster person's is their roster name
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Deeds written on the contract under way that make it ride (all of them)
    #[serde(rename = "if")]
    pub if_deeds: Deeds,
    /// Deeds that keep it off the road, whenever they were written (any of them)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unless: Option<Deeds>,
    /// The anchor it stands at in a fight; the scene's first when absent or missing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
    /// Whether a fight that leaves it alive and below full Hit Points writes `<id>_hurt`
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub hurt: bool,
}

impl CompanyEntry {
    /// The deed its death writes.
    pub fn dead_deed(&self) -> String {
        format!("{}_dead", self.id)
    }

    /// The deed a fight that hurts it writes, when it has `hurt`.
    pub fn hurt_deed(&self) -> String {
        format!("{}_hurt", self.id)
    }

    /// Whether it rides on contract `contract` (rule A2): not dead, every `if` deed written in
    /// this contract, no `unless` deed remembered. `alive` says whether a roster person is.
    pub fn rides(&self, deeds: &DeedBook, contract: u32, alive: bool) -> bool {
        alive
            && !deeds.contains_key(&self.dead_deed())
            && self
                .if_deeds
                .ids()
                .iter()
                .all(|d| deeds.get(d).is_some_and(|r| r.contract == contract))
            && self
                .unless
                .as_ref()
                .is_none_or(|u| !u.ids().iter().any(|d| deeds.contains_key(d)))
    }
}

impl CompanyFile {
    /// Every deed the engine writes for this company, `rides:<id>` included: what a card may
    /// read with nothing in a deck writing it.
    pub fn written(&self) -> BTreeSet<String> {
        self.company
            .iter()
            .flat_map(|e| {
                [
                    Some(e.dead_deed()),
                    e.hurt.then(|| e.hurt_deed()),
                    Some(format!("{RIDES_PREFIX}{}", e.id)),
                ]
            })
            .flatten()
            .collect()
    }

    /// Rule A9: each `_dead` and `_hurt` deed of an entry has a reader that speaks, a card
    /// or a choice with it in `if`; one read only through `unless` falls silent.
    pub fn check_readers(&self, deck: &Deck) -> Result<(), MapError> {
        let spoken = deck.read_in_if();
        for e in &self.company {
            for deed in [Some(e.dead_deed()), e.hurt.then(|| e.hurt_deed())]
                .into_iter()
                .flatten()
            {
                if !spoken.contains(&deed) {
                    return Err(MapError(format!(
                        "company entry {}: no card or choice reads {deed} in its if",
                        e.id
                    )));
                }
            }
        }
        Ok(())
    }

    /// Checks the file against the roster: each entry is an animal or a roster person, not
    /// both, with a unique id; a person's entry takes the person's id.
    pub fn validate(&self, npcs: &[NpcDef]) -> Result<(), MapError> {
        let bad = |m: String| Err(MapError(m));
        for (i, e) in self.company.iter().enumerate() {
            if self.company[..i].iter().any(|o| o.id == e.id) {
                return bad(format!("company entry {} is listed twice", e.id));
            }
            match (&e.monster, &e.npc) {
                (Some(_), None) => {}
                (None, Some(npc)) if npc == &e.id && npcs.iter().any(|n| n.id == *npc) => {}
                (None, Some(npc)) => {
                    return bad(format!(
                        "company entry {} names {npc}, who must be a roster person with the entry's id",
                        e.id
                    ));
                }
                _ => {
                    return bad(format!(
                        "company entry {} needs either a monster or an npc",
                        e.id
                    ));
                }
            }
            if e.if_deeds.ids().is_empty() {
                return bad(format!("company entry {} rides on no deed", e.id));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deck::Deed;

    fn deed(contract: u32) -> Deed {
        Deed {
            by: vec![],
            day: 1,
            contract,
            saw: vec![],
        }
    }

    #[test]
    fn an_entry_rides_on_the_contract_its_deed_was_written_in_until_it_dies() {
        let file: CompanyFile = serde_json::from_str(
            r#"{"company": [{"id": "dog", "monster": "mastiff", "name": "the dog",
                "if": "fed_dog", "unless": "sent_dog_home", "at": "behind"}]}"#,
        )
        .unwrap();
        file.validate(&[]).unwrap();
        let dog = &file.company[0];
        let mut deeds = DeedBook::new();
        assert!(!dog.rides(&deeds, 2, true), "never fed");
        deeds.insert("fed_dog".into(), deed(1));
        assert!(dog.rides(&deeds, 1, true));
        assert!(!dog.rides(&deeds, 2, true), "fed on an earlier contract");
        deeds.insert("dog_dead".into(), deed(1));
        assert!(!dog.rides(&deeds, 1, true), "dead");
        deeds.remove("dog_dead");
        deeds.insert("sent_dog_home".into(), deed(1));
        assert!(!dog.rides(&deeds, 1, true), "sent home");
    }

    #[test]
    fn a_death_or_a_wound_needs_a_reader_that_speaks() {
        let file: CompanyFile = serde_json::from_str(
            r#"{"company": [{"id": "dog", "monster": "mastiff", "if": "fed_dog", "hurt": true}]}"#,
        )
        .unwrap();
        assert_eq!(
            file.written().into_iter().collect::<Vec<_>>(),
            ["dog_dead", "dog_hurt", "rides:dog"]
        );
        let deck = |choices: &str| {
            crate::Deck::from_files([serde_json::from_str::<crate::DeckFile>(&format!(
                r#"{{"cards": [{{"id": "c", "zone": "z", "target": "blades", "text": "T",
                    "choices": [{choices}]}}]}}"#
            ))
            .unwrap()])
        };
        let silent = deck(
            r#"{"id": "a", "text": "A", "effects": [], "unless": "dog_dead"},
               {"id": "b", "text": "B", "effects": [], "if": "dog_hurt"}"#,
        );
        assert!(
            file.check_readers(&silent)
                .unwrap_err()
                .0
                .contains("dog_dead")
        );
        let spoken = deck(
            r#"{"id": "a", "text": "A", "effects": [], "if": "dog_dead"},
               {"id": "b", "text": "B", "effects": [], "if": "dog_hurt"}"#,
        );
        file.check_readers(&spoken).unwrap();
    }

    #[test]
    fn an_entry_is_an_animal_or_a_roster_person_once() {
        let file = |json: &str| serde_json::from_str::<CompanyFile>(json).unwrap();
        let both =
            file(r#"{"company": [{"id": "x", "monster": "mastiff", "npc": "x", "if": "a"}]}"#);
        assert!(both.validate(&[]).is_err());
        let stranger = file(r#"{"company": [{"id": "tam", "npc": "tam", "if": "a"}]}"#);
        assert!(stranger.validate(&[]).unwrap_err().0.contains("roster"));
        let twice = file(
            r#"{"company": [{"id": "d", "monster": "mastiff", "if": "a"},
                            {"id": "d", "monster": "mastiff", "if": "b"}]}"#,
        );
        assert!(twice.validate(&[]).unwrap_err().0.contains("twice"));
    }
}
