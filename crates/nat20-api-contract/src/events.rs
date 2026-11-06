//! The session log: one append-only list of events per session, and the roll views.
//!
//! The engine stores every event with its [`Visibility`]. Projection drops events the viewer may
//! not see and turns [`RollView::Full`] into [`RollView::Player`] for every player viewer. Hit Points
//! after damage travel only in `hit_points` events, which are DM and owner only.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    AdvantageState, CardChoiceView, CardDecided, CardTarget, Condition, DamageType, Handle,
    LegView, LifeState, Mode, NightView, OptionId, PointFt, RollId, Side, state::CombatOverReason,
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
    /// Creatures fled: the DM ended the fight with `end_combat{fled}` while their encounter
    /// allowed it. They have left the scene; creatures of their side at 0 Hit Points stay where
    /// they fell.
    Fled {
        /// The creatures that fled, in scene order.
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
    /// A creature walked to reach the target of the option it submitted (one whose target was out
    /// of reach or sight, protocol §4.4) and did not get to take it: an Opportunity Attack the walk
    /// provoked dropped it or left it unable to move (§4.1), or the option could not be taken
    /// where it ended.
    /// Nothing the option costs is spent; the movement is. In a fight the creature's action prompt
    /// stays open. Logged in place of the `action` it did not take.
    ActionDropped {
        /// Who walked.
        actor: Handle,
        /// The option it did not take.
        option_id: OptionId,
        /// Its display name.
        name: String,
        /// The targets it named.
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
    /// A caster started concentrating on a spell. Public: a caster visibly maintains a spell.
    ConcentrationStarted {
        /// The caster.
        actor: Handle,
        /// The spell's id, as in the caster's `spells` (`bless`).
        spell: String,
    },
    /// A caster's concentration ended, and with it the spell's effects. Public.
    ConcentrationEnded {
        /// The caster.
        actor: Handle,
        /// The spell's id, as in the caster's `spells` (`bless`).
        spell: String,
        /// Why it ended.
        reason: ConcentrationEndReason,
    },
    /// A lasting effect began on a creature (Bless, a Help's Advantage, Rage). Owner and DM
    /// only: the table hears the spell or action, not its numbers.
    EffectStarted {
        /// On whom.
        target: Handle,
        /// The effect's id, as in `effects` on the sheet (`spell/bless`).
        effect: String,
        /// Its display name.
        name: String,
        /// The creature whose action put it there.
        source: Handle,
    },
    /// A lasting effect on a creature ended: it ran out, was used, or its Concentration ended.
    /// Owner and DM only.
    EffectEnded {
        /// On whom.
        target: Handle,
        /// The effect's id, as in `effects` on the sheet (`spell/bless`).
        effect: String,
        /// Its display name.
        name: String,
    },
    /// A creature used up a carried item, e.g. drank a Potion of Healing or gave it to someone.
    /// Public: it is seen at the table. Logged right after the `action` that used it.
    ItemUsed {
        /// Who used it.
        actor: Handle,
        /// The item's id, as on the sheet (`potion_of_healing`).
        item: String,
        /// Who it was used on: the actor itself when drunk.
        target: Handle,
    },
    /// Coin or items changed hands: one entry of the ledger (`nat20-ledger`). Public, except a
    /// theft, which only the thief and the DM see.
    Ledger {
        /// Who gave: a creature handle, or `npc:<id>`, `wagon:<n>`, `market:<place>`, `world`.
        from: String,
        /// Who received, in the same form.
        to: String,
        /// What moved.
        what: LedgerGoods,
        /// Why it moved.
        reason: LedgerReason,
        /// The roll that decided it, for a theft.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        roll_id: Option<RollId>,
    },
    /// A theft failed: the target caught the thief, and nothing moved. Public.
    TheftNoticed {
        /// The thief.
        thief: Handle,
        /// Who caught them.
        target: Handle,
    },
    /// A creature's life state changed.
    LifeState {
        /// Whose.
        target: Handle,
        /// The new state.
        state: LifeState,
    },
    /// A creature moved: by a `move`, or on its own on the way to an option's target (a
    /// `submit` on a target out of reach, a scripted monster's approach), logged once it stopped
    /// and before the `action` it walked for (protocol §4.1).
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
    /// The DM placed a creature the scene file doesn't list (`place_creature`). DM only, like
    /// `spawned`; players see the creature in their state. In a running fight its `initiative`
    /// roll follows.
    CreaturePlaced {
        /// The new creature.
        handle: Handle,
        /// Its stat block id.
        monster: String,
    },
    /// The caravan travelled one leg (`travel`). Public. On arrival `place_discovered` may
    /// follow, then `scene_loaded` for the scene the leg ended in.
    Traveled {
        /// The leg.
        leg: LegView,
    },
    /// A road card was drawn after a leg or a night in camp (protocol §4.13). Public: the text
    /// and choices only; the card id and the draw roll are DM-only. The card's own words are
    /// `card_text`: a field named `text` here would clash with the event's own `text`, which the
    /// variant is flattened into.
    CardDrawn {
        /// Who decides it.
        target: CardTarget,
        /// What the players read: the card's own words.
        card_text: String,
        /// The choices.
        choices: Vec<CardChoiceView>,
    },
    /// A Hired Blade's advice on a caravan card or vote on a Blade card. Public.
    CardAdvice {
        /// Who spoke.
        actor: Handle,
        /// The choice id.
        choice: String,
    },
    /// The card on the table was decided; its effects follow in the log. Public.
    CardResolved {
        /// The choice id.
        choice: String,
        /// How it was decided.
        decided: CardDecided,
    },
    /// A road card added or took goods from the caravan. Public.
    CargoChanged {
        /// The good id.
        good: String,
        /// Units gained (positive) or lost (negative).
        change: i32,
    },
    /// A character gained Experience Points for a fight its side won (SRD 5.2.1: the XP of the
    /// defeated foes, split evenly). Owner and DM only.
    XpAwarded {
        /// The character.
        actor: Handle,
        /// Experience Points gained.
        xp: u32,
        /// Experience Points now.
        total: u32,
        /// It has the points for its next level.
        can_level_up: bool,
    },
    /// A character reached a new level (`level_up`). Public.
    LeveledUp {
        /// The character.
        actor: Handle,
        /// The level it reached.
        level: u8,
    },
    /// A road card cost the party time: the clock moved on and the day's travel shrank.
    /// Public.
    TimeLost {
        /// Minutes lost.
        minutes: u32,
    },
    /// The caravan reached the escort contract's destination and the Blades' pay was settled
    /// (API-47), after its `wage` ledger entries. Public.
    EscortSettled {
        /// The destination, a place id.
        destination: String,
    },
    /// A night passed (`rest_night`), after its `ledger`, saving throw and `rest` entries.
    /// Public.
    Night {
        /// The night.
        night: NightView,
    },
    /// The party found a place it did not know: it is in every player's `world.places` from
    /// now on. Public.
    PlaceDiscovered {
        /// The place id.
        place: String,
        /// Its name.
        name: String,
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
        /// Where the DC came from: present on every check and save.
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
    /// A roll on a world table, such as a road card draw. Its roller is `world`.
    Table,
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

/// What one ledger entry moves.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LedgerGoods {
    /// Coins, as their worth in copper pieces.
    Coins {
        /// Worth in copper pieces.
        copper: u32,
    },
    /// Some of one item.
    Item {
        /// The item's id, as on the sheet.
        item: String,
        /// How many.
        quantity: u32,
    },
}

/// Why something moved in the ledger. A closed set.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LedgerReason {
    /// Handed over, bought or sold.
    Trade,
    /// A Hired Blade's pay.
    Wage,
    /// Taken from a fallen or surrendered creature.
    Loot,
    /// A toll.
    Toll,
    /// An inn's fee.
    Inn,
    /// A theft that worked.
    Theft,
    /// A reward.
    Reward,
}

/// Where a DC came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum DcSource {
    /// The scenario file.
    Scenario,
    /// The SRD DC ladder, picked by the DM.
    Ladder,
    /// A stat block.
    StatBlock,
    /// A rule of the game: the DC 10 of a death save, or of the Medicine check of a Help that
    /// stabilizes; a Concentration save's DC (10 or half the damage taken).
    Rule,
    /// The caster's spell save DC (8 + spellcasting ability modifier + Proficiency Bonus): a
    /// spell's save, or a class feature that uses it, such as Divine Spark.
    SpellSaveDc,
    /// The target's passive score, as core computes it: passive Perception against a theft.
    Passive,
}

/// Why concentration ended (SRD 5.2.1, Concentration).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConcentrationEndReason {
    /// The caster started concentrating on another spell.
    Replaced,
    /// The caster failed the Constitution save after taking damage.
    FailedSave,
    /// The caster was incapacitated or died.
    Incapacitated,
    /// The spell's duration ran out.
    Expired,
    /// Anything else, such as the caster ending it.
    Ended,
}
