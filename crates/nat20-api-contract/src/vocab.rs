//! Shared vocabulary: identifiers, geometry and the rules enums every other module uses.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// A creature's handle in the session, e.g. `bren` or `goblin_1`. Stable for the creature's life.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(transparent)]
pub struct Handle(pub String);

/// Who a projection is for: `dm`, or the handle of the creature whose player is looking.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct Viewer(pub String);

/// A roll's id, `r` plus a number, e.g. `r412`. Unique for the whole session, never reused.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct RollId(pub String);

/// A pending decision's id, e.g. `p57`. `submit`, `react` and `end_turn` echo it.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct PromptId(pub String);

/// An action option's id, derived from the action and its context (weapon, spell and level),
/// never from a list index, e.g. `melee_attack/longsword`. Stable for the life of a prompt.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct OptionId(pub String);

/// A point in feet. The engine works in metres internally and converts at the boundary.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct PointFt {
    /// East-west, feet.
    pub x_ft: f32,
    /// North-south, feet.
    pub y_ft: f32,
    /// Height, feet.
    pub z_ft: f32,
}

/// Which side of a fight a creature is on, as seen by the party.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    /// The player characters and their allies.
    Party,
    /// Enemies of the party.
    Hostile,
    /// Neither.
    Neutral,
}

/// Whether the session is out of combat or in initiative order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    /// Exploration and social play: no initiative, checks on request.
    Explore,
    /// Initiative order: one actor at a time, reactions interrupt.
    Combat,
}

/// Coarse health that every viewer may see. SRD 5.2.1: Bloodied means half Hit Points or fewer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum HealthBand {
    /// More than half Hit Points.
    Unhurt,
    /// Half Hit Points or fewer, above 0.
    Bloodied,
    /// At 0 Hit Points or dead.
    Down,
}

/// Life state of a creature.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LifeState {
    /// Above 0 Hit Points.
    Conscious,
    /// At 0 Hit Points, making death saving throws.
    Unconscious,
    /// At 0 Hit Points and stable.
    Stable,
    /// Dead.
    Dead,
}

/// The six abilities.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Ability {
    /// Strength.
    Strength,
    /// Dexterity.
    Dexterity,
    /// Constitution.
    Constitution,
    /// Intelligence.
    Intelligence,
    /// Wisdom.
    Wisdom,
    /// Charisma.
    Charisma,
}

/// The eighteen skills.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Skill {
    /// Dexterity.
    Acrobatics,
    /// Wisdom.
    AnimalHandling,
    /// Intelligence.
    Arcana,
    /// Strength.
    Athletics,
    /// Charisma.
    Deception,
    /// Intelligence.
    History,
    /// Wisdom.
    Insight,
    /// Charisma.
    Intimidation,
    /// Intelligence.
    Investigation,
    /// Wisdom.
    Medicine,
    /// Intelligence.
    Nature,
    /// Wisdom.
    Perception,
    /// Charisma.
    Performance,
    /// Charisma.
    Persuasion,
    /// Intelligence.
    Religion,
    /// Dexterity.
    SleightOfHand,
    /// Dexterity.
    Stealth,
    /// Wisdom.
    Survival,
}

/// The SRD 5.2.1 conditions (Exhaustion is a level on the sheet, not listed here).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Condition {
    /// Blinded.
    Blinded,
    /// Charmed.
    Charmed,
    /// Deafened.
    Deafened,
    /// Frightened.
    Frightened,
    /// Grappled.
    Grappled,
    /// Incapacitated.
    Incapacitated,
    /// Invisible.
    Invisible,
    /// Paralyzed.
    Paralyzed,
    /// Petrified.
    Petrified,
    /// Poisoned.
    Poisoned,
    /// Prone.
    Prone,
    /// Restrained.
    Restrained,
    /// Stunned.
    Stunned,
    /// Unconscious.
    Unconscious,
}

/// Advantage state of a d20 roll.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AdvantageState {
    /// One d20.
    Normal,
    /// Two d20s, keep the higher.
    Advantage,
    /// Two d20s, keep the lower.
    Disadvantage,
}

/// SRD damage types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum DamageType {
    /// Acid.
    Acid,
    /// Bludgeoning.
    Bludgeoning,
    /// Cold.
    Cold,
    /// Fire.
    Fire,
    /// Force.
    Force,
    /// Lightning.
    Lightning,
    /// Necrotic.
    Necrotic,
    /// Piercing.
    Piercing,
    /// Poison.
    Poison,
    /// Psychic.
    Psychic,
    /// Radiant.
    Radiant,
    /// Slashing.
    Slashing,
    /// Thunder.
    Thunder,
}
