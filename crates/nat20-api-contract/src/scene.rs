//! The scene file: the scenario data one scene of an adventure declares.
//!
//! The engine reads scene files from its data directory when the DM calls `load_scene{scene_id}`;
//! the DM agent reads the same files to know which checks, anchors, encounters and spawns exist.
//! Both use these types, exported as their own schema (`generated/nat20-scene.schema.json`).
//!
//! A scene file is DM-only data (CLAUDE.md Rule 3): DCs, surrender conditions, flags and spawns
//! never reach a player view. `contract/protocol.md` §2 says which parts the engine serves today
//! and what it checks when a scene loads.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{Ability, DamageType, EndCombatReason, Handle, PointFt, Side, Skill};

/// One scene: where it happens, who is there, and what the engine resolves in it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SceneFile {
    /// Scene id, a plain name of letters, digits, `-` and `_`. Must match the file name.
    pub id: String,
    /// What the scene is, for the DM and for humans reading the file.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub description: String,
    /// The terrain file under `maps/`, without `.obj`. Omitted: `flat_arena`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub map: Option<String>,
    /// Named landmarks creatures are placed at and move to.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub anchors: Vec<Anchor>,
    /// Creatures this scene places when it loads, besides any carried in.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub creatures: Vec<SceneCreature>,
    /// Anchor ids where creatures carried in by `load_scene{party}` are placed, in the order the
    /// party lists them. An anchor may repeat. Empty for a scene that takes no party.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub party_start: Vec<String>,
    /// Checks the DM can ask for by id with `request_check{check:{kind:"scenario"}}`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub checks: Vec<ScenarioCheck>,
    /// Hazards a check's consequence can set off.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hazards: Vec<Hazard>,
    /// Fights the DM can start by id with `start_combat`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub encounters: Vec<Encounter>,
    /// Creatures that join later, on a trigger or when the DM calls `spawn`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub spawns: Vec<Spawn>,
}

/// A named landmark, e.g. the mill gate. Everyone in the scene may see anchors.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Anchor {
    /// Anchor id, unique in the scene, e.g. `mill_gate`.
    pub id: String,
    /// What the characters call it, e.g. "the mill gate".
    pub name: String,
    /// Where it is, in feet. The engine places creatures on the ground below this point.
    pub position_ft: PointFt,
}

/// One creature a scene or a spawn places: exactly one of `pregen` or `monster`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SceneCreature {
    /// The creature's handle, unique in the scene and its spawns. `dm` is reserved.
    pub handle: Handle,
    /// A pregenerated character id, e.g. `fighter_l2`. Set this or `monster`, not both.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pregen: Option<String>,
    /// A stat block id under the engine's `monsters/`, e.g. `goblin_warrior`. Set this or
    /// `pregen`, not both.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub monster: Option<String>,
    /// Which side of a fight it is on.
    pub side: Side,
    /// Who decides for it.
    pub control: Control,
    /// Where it is placed.
    pub at: Placement,
}

/// Who decides for a creature.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Control {
    /// The API client decides: an agent or the human.
    Client,
    /// The engine's scripted monster policy decides.
    Scripted,
}

/// Where a creature is placed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Placement {
    /// At one of the scene's anchors.
    Anchor {
        /// Anchor id from this scene.
        anchor: String,
    },
    /// At an exact point.
    Point {
        /// The point, in feet.
        point: PointFt,
    },
}

/// A check the scenario defines: what is tested, its DC, and what follows from the result.
/// The engine rolls it at most once per scene (decision D3, Milestone 3 spec).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ScenarioCheck {
    /// Check id, unique in the scene, e.g. `reeve_insight`.
    pub id: String,
    /// The skill check or saving throw rolled.
    pub test: CheckTest,
    /// The Difficulty Class, 1 to 30. DM-only.
    pub dc: u8,
    /// What the engine does when the check succeeds, in order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub on_success: Vec<Consequence>,
    /// What the engine does when the check fails, in order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub on_failure: Vec<Consequence>,
}

/// What a scenario check tests.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum CheckTest {
    /// An ability check with a skill, e.g. Wisdom (Insight).
    Skill {
        /// The skill; its ability is the SRD default.
        skill: Skill,
    },
    /// A saving throw.
    Save {
        /// The ability the save uses.
        ability: Ability,
    },
}

/// A hazard: a saving throw the engine rolls for the creature that set it off.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Hazard {
    /// Hazard id, unique in the scene, e.g. `snare`.
    pub id: String,
    /// The save the creature makes.
    pub save: HazardSave,
    /// What happens on a failed save, in order. A hazard cannot set off another hazard.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub on_failure: Vec<Consequence>,
    /// What happens on a successful save, in order. A hazard cannot set off another hazard.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub on_success: Vec<Consequence>,
}

/// The saving throw a hazard calls for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct HazardSave {
    /// The ability the save uses.
    pub ability: Ability,
    /// The Difficulty Class, 1 to 30. DM-only.
    pub dc: u8,
}

/// Something the engine does after a check or a hazard save. Story-only effects ("the reeve
/// mentions the debt") stay in the DM's notes, not here.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Consequence {
    /// Sets a session flag. Flags persist across scenes and are DM-only.
    Flag {
        /// The flag's name, e.g. `party_ambushes`.
        flag: String,
    },
    /// Sets off a hazard of this scene for the same creature.
    Hazard {
        /// Hazard id from this scene.
        hazard_id: String,
    },
    /// The engine rolls damage and applies it to the same creature.
    Damage {
        /// Dice in `NdM` or `NdM+K` form, e.g. `1d6`; M is 4, 6, 8, 10, 12, 20 or 100.
        dice: String,
        /// The damage type.
        damage_type: DamageType,
    },
}

/// A fight the scene declares. The engine takes its participants, surprise and surrender rules
/// from here, not from the DM.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Encounter {
    /// Encounter id, unique in the scene, e.g. `yard_fight`.
    pub id: String,
    /// Every creature in the fight. A handle not defined in the scene must be carried in with
    /// the party, so it is allowed only in a scene with a `party_start`.
    pub participants: Vec<Handle>,
    /// Who is surprised, and when (decision D4).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surprise: Option<Surprise>,
    /// When the DM may end the fight with `end_combat{reason:"surrender"}` (decision D5). DM-only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surrender: Option<SurrenderCondition>,
    /// Other early ends `end_combat` accepts for this fight: `scenario` or `fled`. Surrender is
    /// governed by `surrender`, so it is not listed here.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub end_reasons: Vec<EndCombatReason>,
}

/// A surprise rule: the named side rolls initiative with Disadvantage when the flag is set.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Surprise {
    /// The session flag that makes the surprise happen, e.g. `party_ambushes`.
    pub when_flag: String,
    /// The side that is surprised.
    pub surprised: Side,
}

/// The condition under which some creatures of a fight may surrender. The engine evaluates it
/// after every turn; the DM decides whether to call the surrender while it holds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SurrenderCondition {
    /// The creatures that surrender together, e.g. the goblins.
    pub creatures: Vec<Handle>,
    /// The condition holds when any of these does.
    pub any_of: Vec<SurrenderTrigger>,
}

/// One way a surrender condition can hold, counted over its `creatures`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum SurrenderTrigger {
    /// Their current Hit Points together are at most this fraction of their maximum.
    HpFractionAtMost {
        /// Above 0 and below 1, e.g. `0.25`.
        fraction: f32,
    },
    /// At most this many of them are still conscious.
    StandingAtMost {
        /// The number of conscious creatures.
        count: u32,
    },
    /// This creature is at 0 Hit Points or dead.
    LeaderDown {
        /// The leader's handle.
        handle: Handle,
    },
}

/// Creatures that join the scene later.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Spawn {
    /// Spawn id, unique in the scene, e.g. `rats`.
    pub id: String,
    /// The creatures placed. Their handles are unique across the scene.
    pub creatures: Vec<SceneCreature>,
    /// What places them.
    pub when: SpawnWhen,
}

/// What places a spawn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum SpawnWhen {
    /// The DM calls `spawn{spawn_id}`.
    Dm,
    /// The engine places them when combat starts, if this session flag is set.
    Flag {
        /// The session flag, e.g. `boss_warned`.
        flag: String,
    },
    /// The engine places them at the start of this combat round.
    Round {
        /// The round, 1 or later.
        round: u32,
        /// A state that cancels the spawn when it holds at that round.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        unless: Option<SpawnUnless>,
    },
}

/// A state that cancels a round spawn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SpawnUnless {
    /// Any party creature is Bloodied (half Hit Points or fewer) or down.
    AnyPartyBloodied,
}
