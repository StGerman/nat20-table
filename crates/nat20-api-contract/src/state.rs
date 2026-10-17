//! State and sheet views, action options, and what the engine is waiting on.
//!
//! Visibility is structural (CLAUDE.md Rule 3): the DM and owner see [`CreatureFull`], everyone
//! else sees [`CreatureObserved`], which has no Hit Point or Armor Class field at all.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    Ability, CheckTest, Condition, Handle, HealthBand, LifeState, Mode, OptionId, PointFt,
    PromptId, RejectReason, Side, Skill,
};

/// The session state, projected for the request's `viewer`, tagged by `view`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "view", rename_all = "snake_case")]
pub enum State {
    /// What the DM sees: every creature in full.
    Dm {
        /// Explore or combat.
        mode: Mode,
        /// The loaded scene, if any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        scene_id: Option<String>,
        /// The combat round, in combat mode.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        round: Option<u32>,
        /// Initiative order, in combat mode; empty in explore mode.
        initiative: Vec<Handle>,
        /// Every creature in the scene.
        creatures: Vec<CreatureFull>,
        /// The scene's named landmarks, in scene file order.
        anchors: Vec<AnchorView>,
        /// Scene flags set this session, sorted. They persist across scenes.
        flags: Vec<String>,
        /// The loaded scene's checks, in scene file order.
        checks: Vec<CheckView>,
        /// The loaded scene's encounters, in scene file order.
        encounters: Vec<EncounterView>,
    },
    /// What one player sees: their own creature in full, the others as observed.
    Player {
        /// The creature whose player is looking.
        viewer: Handle,
        /// Explore or combat.
        mode: Mode,
        /// The loaded scene, if any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        scene_id: Option<String>,
        /// The combat round, in combat mode.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        round: Option<u32>,
        /// Initiative order, in combat mode; empty in explore mode.
        initiative: Vec<Handle>,
        /// The viewer's own creature.
        me: CreatureFull,
        /// Every other creature the viewer perceives.
        others: Vec<CreatureObserved>,
        /// The scene's named landmarks, in scene file order, with the distance from the viewer.
        anchors: Vec<AnchorObserved>,
    },
}

/// A scene encounter as the DM sees it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct EncounterView {
    /// Encounter id from the scene, the `encounter_id` a `start_combat` names.
    pub id: String,
    /// Whether this encounter is the fight running now.
    pub running: bool,
    /// Whether `end_combat{surrender}` would be accepted now: the encounter is running and its
    /// surrender condition holds (decision D5). The engine works this out; the DM decides
    /// whether to call it.
    pub surrender_available: bool,
}

/// A scenario check as the DM sees it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct CheckView {
    /// Check id from the scene.
    pub id: String,
    /// The skill or saving throw.
    pub test: CheckTest,
    /// The DC.
    pub dc: u8,
    /// Whether the check was already rolled in this scene; it cannot be rolled again.
    pub rolled: bool,
}

/// A named landmark as the DM sees it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct AnchorView {
    /// Anchor id from the scene, the `anchor` a `move` names.
    pub id: String,
    /// What the characters call it, e.g. "the mill gate".
    pub name: String,
    /// Where it is, in feet.
    pub position_ft: PointFt,
}

/// A named landmark as one player sees it: the DM's view plus how far away it is.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct AnchorObserved {
    /// Anchor id from the scene, the `anchor` a `move` names.
    pub id: String,
    /// What the characters call it, e.g. "the mill gate".
    pub name: String,
    /// Where it is, in feet.
    pub position_ft: PointFt,
    /// Straight-line distance from the viewer's creature, in feet.
    pub distance_ft: f32,
}

/// A creature as its owner and the DM see it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct CreatureFull {
    /// Session handle.
    pub handle: Handle,
    /// Display name.
    pub name: String,
    /// Which side it is on.
    pub side: Side,
    /// Position, in feet.
    pub position_ft: PointFt,
    /// Current Hit Points.
    pub hp: u32,
    /// Hit Point maximum.
    pub hp_max: u32,
    /// Temporary Hit Points.
    pub temp_hp: u32,
    /// Armor Class.
    pub ac: u32,
    /// Speed, in feet.
    pub speed_ft: u32,
    /// Active conditions.
    pub conditions: Vec<Condition>,
    /// Exhaustion level, 0 to 6.
    pub exhaustion: u8,
    /// Conscious, unconscious, stable or dead.
    pub life_state: LifeState,
    /// The health band other players see.
    pub health: HealthBand,
}

/// A creature as another player perceives it. Has no Hit Points, Armor Class or stat block, by design.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct CreatureObserved {
    /// Session handle.
    pub handle: Handle,
    /// Display name.
    pub name: String,
    /// Which side it is on.
    pub side: Side,
    /// Position, in feet.
    pub position_ft: PointFt,
    /// Distance from the viewer, in feet.
    pub distance_ft: f32,
    /// Unhurt, bloodied or down.
    pub health: HealthBand,
    /// Conditions the viewer can see.
    pub conditions: Vec<Condition>,
}

/// A creature's full sheet. Only its owner and the DM receive it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Sheet {
    /// Session handle.
    pub handle: Handle,
    /// Display name.
    pub name: String,
    /// Which side it is on.
    pub side: Side,
    /// Character level. Absent for monsters.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
    /// Class id, e.g. `fighter`. Absent for monsters.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub class: Option<String>,
    /// Subclass id, once chosen.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subclass: Option<String>,
    /// Species id for characters, creature type for monsters.
    pub species: String,
    /// Proficiency Bonus.
    pub proficiency_bonus: u8,
    /// The six abilities with their saving throws, Strength to Charisma.
    pub abilities: Vec<AbilityLine>,
    /// The eighteen skills, in alphabetical order.
    pub skills: Vec<SkillLine>,
    /// Armor Class.
    pub ac: u32,
    /// Speed, in feet.
    pub speed_ft: u32,
    /// Initiative bonus.
    pub initiative_bonus: i8,
    /// Passive Perception: 10 plus the Perception bonus.
    pub passive_perception: u8,
    /// Current Hit Points.
    pub hp: u32,
    /// Hit Point maximum.
    pub hp_max: u32,
    /// Temporary Hit Points.
    pub temp_hp: u32,
    /// Hit Point Dice by die size, smallest first: one die per class level, spent on a short
    /// rest. Empty for a creature without Hit Point Dice, such as a monster.
    pub hit_dice: Vec<HitDicePool>,
    /// Spell slots by level; empty for non-casters.
    pub spell_slots: Vec<SpellSlots>,
    /// Limited-use features, e.g. Second Wind, by id. Per-turn action economy (action, bonus
    /// action, reaction) is not listed; `legal_actions` reports it.
    pub resources: Vec<ResourcePool>,
    /// Active conditions.
    pub conditions: Vec<Condition>,
    /// Exhaustion level, 0 to 6.
    pub exhaustion: u8,
    /// Conscious, unconscious, stable or dead.
    pub life_state: LifeState,
    /// Death saving throws so far, while unconscious.
    pub death_saves: DeathSaves,
    /// Equipped items in slot order (armor, then weapons), then carried items in the order they
    /// were picked up.
    pub equipment: Vec<ItemLine>,
    /// Feats, then features granted by class, subclass, species and background (as actions,
    /// e.g. Second Wind, or as lasting effects), each once.
    pub features: Vec<FeatureLine>,
}

/// One ability on a sheet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AbilityLine {
    /// The ability.
    pub ability: Ability,
    /// Score, 1 to 30.
    pub score: u8,
    /// Modifier.
    pub modifier: i8,
    /// Saving throw bonus: what the engine adds to the d20, without dice bonuses such as Bless.
    pub save_bonus: i8,
    /// Whether the creature is proficient in this saving throw.
    pub save_proficient: bool,
}

/// One skill on a sheet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SkillLine {
    /// The skill.
    pub skill: Skill,
    /// Total bonus: what the engine adds to the d20, without dice bonuses such as Bless.
    pub bonus: i8,
    /// Proficiency in it.
    pub proficiency: ProficiencyLevel,
}

/// Proficiency in a skill.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ProficiencyLevel {
    /// Not proficient.
    None,
    /// Proficient: adds the Proficiency Bonus.
    Proficient,
    /// Expertise: adds twice the Proficiency Bonus.
    Expertise,
}

/// Hit Point Dice of one size.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct HitDicePool {
    /// Die size, e.g. `10` for d10.
    pub die: u8,
    /// Dice left to spend.
    pub remaining: u32,
    /// Dice when fully rested.
    pub max: u32,
}

/// Spell slots of one level.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SpellSlots {
    /// Spell slot level, 1 to 9.
    pub level: u8,
    /// Slots left.
    pub remaining: u32,
    /// Slots when fully rested.
    pub max: u32,
}

/// A limited-use feature.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ResourcePool {
    /// Resource id, e.g. `fighter.second_wind`.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Uses left.
    pub remaining: u32,
    /// Uses when recharged.
    pub max: u32,
    /// When it recharges.
    pub recharge: Recharge,
}

/// When a resource recharges.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Recharge {
    /// At the start of each turn.
    Turn,
    /// On a Short or Long Rest.
    ShortRest,
    /// On a Long Rest.
    LongRest,
    /// Never on its own.
    Never,
}

/// Death saving throws so far.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct DeathSaves {
    /// Successes, 0 to 3.
    pub successes: u8,
    /// Failures, 0 to 3.
    pub failures: u8,
}

/// An item on a sheet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ItemLine {
    /// Item id from the registry, e.g. `longsword`.
    pub id: String,
    /// Display name.
    pub name: String,
    /// How many.
    pub quantity: u32,
    /// Whether it is equipped or wielded.
    pub equipped: bool,
}

/// A feature on a sheet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct FeatureLine {
    /// Feature id, e.g. `fighting_style.defense`.
    pub id: String,
    /// Display name.
    pub name: String,
}

/// One option the actor can take at the pending prompt.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ActionOption {
    /// Echo it in `submit`.
    pub option_id: OptionId,
    /// The engine action id behind the option.
    pub action: String,
    /// Display name, e.g. "Longsword attack".
    pub name: String,
    /// What taking it spends.
    pub cost: ActionCost,
    /// What `submit` must name as targets.
    pub targeting: Targeting,
    /// How many targets `submit` may name: 0 for `none`, `self` and `point`, 1 for `single`.
    pub max_targets: u32,
    /// Range in feet, when the option has one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range_ft: Option<f32>,
    /// Creatures the option can target, with their distance.
    pub targets: Vec<TargetCandidate>,
    /// Variants `submit` must pick from, e.g. a spell's casting level. Empty when none.
    pub variants: Vec<OptionVariant>,
}

/// What an option costs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ActionCost {
    /// Actions spent.
    pub action: u8,
    /// Bonus Actions spent.
    pub bonus_action: u8,
    /// Reactions spent.
    pub reaction: u8,
    /// Movement spent, in feet.
    pub movement_ft: u32,
    /// Spell slot level spent, for spells.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spell_slot: Option<u8>,
}

/// What an option targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Targeting {
    /// No target.
    None,
    /// The actor itself.
    #[serde(rename = "self")]
    OnSelf,
    /// One creature.
    Single,
    /// Up to `max_targets` creatures.
    Multiple,
    /// A point.
    Point,
}

/// A creature an option can target.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct TargetCandidate {
    /// The creature.
    pub handle: Handle,
    /// Its side.
    pub side: Side,
    /// Distance from the actor, in feet.
    pub distance_ft: f32,
    /// Whether it is within the option's range now.
    pub in_range: bool,
}

/// A variant of an option.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct OptionVariant {
    /// Echo it in `submit.variant`.
    pub variant: String,
    /// Display name, e.g. "Level 2 slot".
    pub name: String,
}

/// An option the actor has but cannot take now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnavailableOption {
    /// The option's id.
    pub option_id: OptionId,
    /// Display name.
    pub name: String,
    /// Why not.
    pub reason: RejectReason,
    /// One plain sentence.
    pub message: String,
}

/// Who the engine waits on next, tagged by `kind`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Awaiting {
    /// A creature's turn: `legal_actions`, then `submit`, `move` or `end_turn`.
    Action {
        /// Echo it in `submit`, `move` and `end_turn`.
        prompt_id: PromptId,
        /// Whose turn it is.
        actor: Handle,
    },
    /// A creature may react to a trigger: answer with `react`.
    Reaction {
        /// Echo it in `react`.
        prompt_id: PromptId,
        /// The creature that may react.
        actor: Handle,
        /// What triggered it.
        trigger: ReactionTrigger,
        /// The reactions it can take.
        options: Vec<ReactionOption>,
    },
    /// Nothing pending: explore mode, or a session with no scene yet.
    #[serde(rename = "none")]
    Idle,
    /// Combat ended by itself because a side is down. The scene is already back in explore mode
    /// and nothing is pending. Reported until a command changes the session (`load_scene`,
    /// `start_combat`, or any explore command that acts), after which it reads `none`; read-only
    /// and rejected commands keep reporting it.
    /// Go on with any explore command, `start_combat` or `load_scene`; `end_combat` is not needed.
    CombatOver {
        /// The side left standing, if any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        winner: Option<Side>,
        /// Why combat ended.
        reason: CombatOverReason,
    },
    /// No session: call `new_session`.
    NoSession,
}

/// The event that opened a reaction prompt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ReactionTrigger {
    /// The triggering event's `seq`.
    pub event_seq: u64,
    /// One plain sentence, e.g. "goblin_1 moves out of Bren's reach".
    pub summary: String,
}

/// A reaction the actor can take.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ReactionOption {
    /// Echo it in `react.choice`.
    pub choice: u32,
    /// The option's id.
    pub option_id: OptionId,
    /// Display name, e.g. "Opportunity Attack".
    pub name: String,
}

/// Why combat ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CombatOverReason {
    /// Every creature on one side is down.
    SideDown,
    /// The DM ended it: the other side surrendered.
    Surrender,
    /// The DM ended it: the other side fled.
    Fled,
    /// A scenario trigger ended it.
    Scenario,
}
