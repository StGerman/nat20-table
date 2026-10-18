//! The pregen file: one pregenerated character, built by the engine through core's level-up path.
//!
//! A scene names a pregen by id (`SceneCreature.pregen`); the engine reads `pregens/<id>.json`
//! at the repository root and builds the character when the scene loads. The file is our
//! adventure content (CC-BY-4.0), exported as its own schema
//! (`generated/nat20-pregen.schema.json`). Not sent on the wire.
//!
//! Registry ids (`species`, `class`, a pick, an item) are core's: `[namespace::]<kind>.<name>`,
//! e.g. `nat20_core::class.fighter`; the namespace defaults to `nat20_core`.
//! `contract/protocol.md` §2 says what the engine checks when it builds a pregen.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{Ability, Skill};

/// One pregenerated character.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PregenFile {
    /// Notes for humans reading the file. The engine ignores it.
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// Pregen id, a plain name of letters, digits and `_`. Must match the file name.
    pub id: String,
    /// The character's name, e.g. "Bren".
    pub name: String,
    /// Species registry id, e.g. `nat20_core::species.dragonborn`.
    pub species: String,
    /// Subspecies registry id, when the species asks for one, e.g.
    /// `nat20_core::subspecies.dragonborn.white`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subspecies: Option<String>,
    /// Background registry id, e.g. `nat20_core::background.soldier`.
    pub background: String,
    /// Class registry id, e.g. `nat20_core::class.fighter`. Every level is in this class.
    pub class: String,
    /// Character level, 1 to 20.
    pub level: u8,
    /// Ability scores before the background's increases.
    pub ability_scores: PregenAbilityScores,
    /// Answers to the choice prompts core asks while levelling up (a Fighting Style, a Divine
    /// Order, ...), each by its prompt id. Species, subspecies, background, class, ability
    /// scores, skills and starting equipment have their own fields and are not listed here.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub choices: Vec<PregenChoice>,
    /// The skills picked from the class's skill list, as many as the class grants.
    pub skills: Vec<Skill>,
    /// What the character carries, in the order it is put on or picked up. It replaces the
    /// class's and background's starting equipment, for which the engine takes the gold option.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub equipment: Vec<PregenItem>,
    /// Coins carried, e.g. `54 GP`.
    pub money: String,
}

/// Ability scores before the background's increases, plus which abilities those increase.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PregenAbilityScores {
    /// Notes for humans reading the file. The engine ignores it.
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// Strength, from the standard array or point buy.
    pub strength: u8,
    /// Dexterity.
    pub dexterity: u8,
    /// Constitution.
    pub constitution: u8,
    /// Intelligence.
    pub intelligence: u8,
    /// Wisdom.
    pub wisdom: u8,
    /// Charisma.
    pub charisma: u8,
    /// The ability the background increases by 2.
    pub plus_2: Ability,
    /// The ability the background increases by 1.
    pub plus_1: Ability,
}

/// The answer to one choice prompt.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PregenChoice {
    /// Notes for humans reading the file. The engine ignores it.
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// The prompt's id in core, e.g. `choice.fighting_style`.
    pub prompt_id: String,
    /// The registry ids picked from the prompt's options, as many as it asks for, e.g.
    /// `["nat20_core::feat.fighting_style.defense"]`.
    pub picks: Vec<String>,
}

/// One item the character carries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PregenItem {
    /// Notes for humans reading the file. The engine ignores it.
    #[serde(default, rename = "_comment", skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// Item registry id, e.g. `nat20_core::item.longsword`.
    pub item: String,
    /// How many, at least 1.
    pub quantity: u8,
    /// The slot it is worn or wielded in. Omitted: carried. Only a quantity of 1 can be equipped.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub equip: Option<EquipSlot>,
}

/// Where an item is worn or wielded.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EquipSlot {
    /// Body armour.
    Armor,
    /// A melee weapon in the main hand; a two-handed weapon takes both hands.
    MeleeMainHand,
    /// A melee weapon in the off hand.
    MeleeOffHand,
    /// A ranged weapon in the main hand.
    RangedMainHand,
    /// A ranged weapon in the off hand.
    RangedOffHand,
}
