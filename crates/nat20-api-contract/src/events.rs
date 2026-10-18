//! The session log: one append-only list of events per session, and the roll views.
//!
//! The engine stores every event with its [`Visibility`]. Projection drops events the viewer may
//! not see and turns [`RollView::Full`] into [`RollView::Player`] for every player viewer. Hit Points
//! after damage travel only in `hit_points` events, which are DM and owner only.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    AdvantageState, Condition, DamageType, Handle, LifeState, Mode, OptionId, PointFt, RollId,
    Side, state::CombatOverReason,
};

/// One log entry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Event {
    /// Position in the session log, from 1. Unique and monotonic for the whole session.
    pub seq: u64,
    /// The combat round, in combat mode.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub round: Option<u32>,
    /// The scene the event happened in; absent before the first scene loads.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene: Option<String>,
    /// Who may see the event.
    pub visibility: Visibility,
    /// One plain sentence rendered for the viewer. Never carries a number the viewer may not see.
    pub text: String,
    /// What happened, tagged by `kind`.
    #[serde(flatten)]
    pub kind: EventKind,
}

/// Who may see an event, tagged by `scope`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "scope", rename_all = "snake_case")]
pub enum Visibility {
    /// Everyone at the table.
    Public,
    /// The DM only.
    Dm,
    /// The DM and the player of one creature.
    Owner {
        /// The creature whose player may see it.
        handle: Handle,
    },
}

/// What happened, tagged by `kind`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EventKind {
    /// The session started.
    SessionStarted {
        /// The dice seed in use.
        seed: u32,
        /// Contract version the engine speaks.
        protocol_version: String,
    },
    /// A scene loaded.
    SceneLoaded {
        /// Scene id.
        scene_id: String,
        /// The mode the scene starts in.
        mode: Mode,
    },
    /// Initiative was rolled; combat started.
    CombatStarted {
        /// Every creature in the fight, in initiative order.
        participants: Vec<Handle>,
    },
    /// Creatures surrendered: the DM called the surrender while their encounter allowed it. They
    /// are now `neutral` and stay in the scene.
    Surrendered {
        /// The creatures that surrendered, in the encounter's order.
        handles: Vec<Handle>,
    },
    /// Combat ended.
    CombatOver {
        /// The side left standing, if any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        winner: Option<Side>,
        /// Why.
        reason: CombatOverReason,
    },
    /// A new combat round started.
    Round {
        /// The round number, from 1.
        number: u32,
    },
    /// A creature's turn started.
    TurnStart {
        /// Whose turn.
        actor: Handle,
    },
    /// A creature's turn ended.
    TurnEnd {
        /// Whose turn.
        actor: Handle,
    },
    /// A creature took an option.
    Action {
        /// Who acted.
        actor: Handle,
        /// The option taken.
        option_id: OptionId,
        /// Its display name.
        name: String,
        /// Its targets.
        targets: Vec<Handle>,
    },
    /// The engine rolled dice.
    Roll {
        /// The roll, in the view the viewer may see.
        roll: RollView,
    },
    /// A creature took damage. The amount is said at the table; the Hit Points left are not.
    DamageTaken {
        /// Who took it.
        target: Handle,
        /// Damage after resistances and vulnerabilities.
        amount: u32,
        /// Its type.
        damage_type: DamageType,
        /// The damage roll, when one was made.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        source_roll: Option<RollId>,
    },
    /// A creature regained Hit Points.
    Healed {
        /// Who.
        target: Handle,
        /// Hit Points regained.
        amount: u32,
        /// The healing roll, when one was made.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        source_roll: Option<RollId>,
    },
    /// A creature's Hit Points changed. DM and owner only.
    HitPoints {
        /// Whose.
        target: Handle,
        /// Current Hit Points.
        hp: u32,
        /// Hit Point maximum.
        hp_max: u32,
        /// Temporary Hit Points.
        temp_hp: u32,
    },
    /// A condition started.
    ConditionAdded {
        /// On whom.
        target: Handle,
        /// Which.
        condition: Condition,
        /// What caused it, e.g. a spell or feature id.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        source: Option<String>,
    },
    /// A condition ended.
    ConditionRemoved {
        /// On whom.
        target: Handle,
        /// Which.
        condition: Condition,
        /// What ended it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        source: Option<String>,
    },
    /// A creature's life state changed.
    LifeState {
        /// Whose.
        target: Handle,
        /// The new state.
        state: LifeState,
    },
    /// A creature moved.
    Moved {
        /// Who.
        actor: Handle,
        /// From, in feet.
        from: PointFt,
        /// To, in feet.
        to: PointFt,
        /// The anchor it moved to, when it moved to one and got there.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        anchor: Option<String>,
    },
    /// A check resolved. DM only: `check_id` is scenario data.
    CheckResolved {
        /// The scenario check id, for scenario checks.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        check_id: Option<String>,
        /// Who made it.
        actor: Handle,
        /// The roll.
        roll_id: RollId,
        /// Whether it succeeded.
        success: bool,
    },
    /// A scene flag was set for the first time this session. DM only.
    FlagSet {
        /// The flag.
        flag: String,
    },
    /// A scenario hazard was set off; its saving throw follows. DM only: players see the save
    /// and any damage.
    HazardTriggered {
        /// Hazard id from the scene.
        hazard_id: String,
        /// The creature that set it off and makes the save.
        actor: Handle,
    },
    /// A rest finished, after any Hit Point Dice it spent; resources have recharged. Public.
    Rest {
        /// Who rested.
        participants: Vec<Handle>,
        /// Which rest.
        rest: RestKind,
    },
    /// Creatures were placed by a spawn: on `spawn`, or by the engine when a flag spawn's fight
    /// starts or a round spawn's round comes. In a running fight their `initiative` rolls follow.
    /// DM only, because the spawn id is scenario data; players see the creatures in
    /// their state.
    Spawned {
        /// Spawn id from the scene.
        spawn_id: String,
        /// The creatures placed.
        handles: Vec<Handle>,
    },
}

/// Which rest.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RestKind {
    /// A Short Rest.
    Short,
    /// A Long Rest.
    Long,
}

/// A roll, in one of two views, tagged by `view`. `full` goes to the DM only. Every player, the
/// roller's own included, gets `player`, which has no modifiers, target number or DC source;
/// a player reads their own modifiers from their sheet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "view", rename_all = "snake_case")]
pub enum RollView {
    /// Everything the engine knows about the roll. The audit runs on this view.
    Full {
        /// Session-unique roll id.
        id: RollId,
        /// What kind of roll.
        kind: RollKind,
        /// Short label, e.g. "Longsword attack vs goblin_1".
        label: String,
        /// Who rolled.
        roller: Handle,
        /// The roll's target, if any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        target: Option<Handle>,
        /// The dice.
        dice: Vec<DiceRolled>,
        /// Modifiers added to the dice.
        modifiers: Vec<Modifier>,
        /// Dice plus modifiers.
        total: i32,
        /// The number the total was compared with: always present for `attack` (AC),
        /// `saving_throw`, `death_save`, `ability_check` and `skill_check` (DC); absent for
        /// `initiative`, `damage` and `healing`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        against: Option<Against>,
        /// The result.
        outcome: RollOutcome,
        /// Advantage state of the d20.
        advantage: AdvantageState,
        /// Where the DC came from: present for every check and save except a death save, whose
        /// DC 10 is a rule.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        dc_source: Option<DcSource>,
        /// The rules reasons behind `advantage`, as the engine tracked them, e.g. a condition or
        /// a feature. Empty when the roll is normal.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        advantage_sources: Vec<String>,
    },
    /// What another player sees: the dice, the total and the result.
    Player {
        /// Session-unique roll id.
        id: RollId,
        /// What kind of roll.
        kind: RollKind,
        /// Short label, e.g. "Longsword attack vs goblin_1".
        label: String,
        /// Who rolled.
        roller: Handle,
        /// The roll's target, if any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        target: Option<Handle>,
        /// The dice.
        dice: Vec<DiceRolled>,
        /// Dice plus modifiers.
        total: i32,
        /// The result.
        outcome: RollOutcome,
        /// Advantage state of the d20.
        advantage: AdvantageState,
    },
}

/// What kind of roll.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RollKind {
    /// An attack roll.
    Attack,
    /// A saving throw.
    SavingThrow,
    /// An ability check without a skill.
    AbilityCheck,
    /// An ability check with a skill.
    SkillCheck,
    /// Initiative.
    Initiative,
    /// Damage.
    Damage,
    /// Healing.
    Healing,
    /// A death saving throw.
    DeathSave,
}

/// One group of dice in a roll.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct DiceRolled {
    /// What the dice are for, e.g. `d20` or `longsword`.
    pub source: String,
    /// Dice notation, e.g. `1d20` or `2d6`.
    pub dice: String,
    /// Every die's face, including dropped ones.
    pub results: Vec<u32>,
    /// The sum the roll kept, after Advantage or Disadvantage.
    pub kept: i32,
}

/// One modifier added to a roll.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Modifier {
    /// What it comes from, e.g. "Strength" or "Proficiency".
    pub source: String,
    /// Its value.
    pub value: i32,
}

/// The number a roll was compared with.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Against {
    /// Armor Class or Difficulty Class.
    pub kind: AgainstKind,
    /// The number.
    pub value: i32,
}

/// Armor Class or Difficulty Class.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum AgainstKind {
    /// Armor Class.
    #[serde(rename = "AC")]
    Ac,
    /// Difficulty Class.
    #[serde(rename = "DC")]
    Dc,
}

/// A roll's result.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RollOutcome {
    /// An attack hit.
    Hit,
    /// An attack hit with a natural 20.
    CriticalHit,
    /// An attack missed.
    Miss,
    /// A check or save succeeded.
    Success,
    /// A check or save failed.
    Failure,
    /// A roll with nothing to compare, such as damage or initiative.
    Value,
}

/// Where a DC came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum DcSource {
    /// The scenario file.
    Scenario,
    /// The SRD DC ladder, picked by the DM.
    Ladder,
    /// A stat block or spell.
    StatBlock,
}
