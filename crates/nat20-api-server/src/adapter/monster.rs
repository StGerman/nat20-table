//! Monster stat blocks loaded from JSON (see `data/monsters`).
//!
//! This is a deliberately small format covering what the demo needs. The
//! long-term format belongs upstream in `assets/registries` and is a design
//! call for the Nat20 maintainer, so it is kept here until that is agreed.

use std::{collections::BTreeMap, fs, path::Path};

use hecs::Entity;
use nat20_core::{
    components::{
        ability::{Ability, AbilityScoreMap},
        ai::PlayerControlledTag,
        faction::FactionSet,
        health::hit_points::HitPoints,
        id::{EffectId, FactionId, ItemId, Name},
        items::{
            equipment::{armor::ArmorTrainingSet, weapon::WeaponProficiencyMap},
            inventory::ItemInstance,
        },
        level::{ChallengeRating, Level},
        modifier::{FlatModifiable, ModifierSource},
        proficiency::{Proficiency, ProficiencyLevel},
        species::{CreatureSize, CreatureType},
        speed::Speed,
    },
    engine::engine_state::EngineState,
    entities::creature::Monster,
    registry::{self, registry::ItemsRegistry},
    systems,
};
use serde::Deserialize;
use uom::si::{f32::Length, length::foot};

#[derive(Debug, Clone, Deserialize)]
pub struct MonsterDef {
    pub id: String,
    pub name: String,
    pub source: String,
    pub size: String,
    pub creature_type: String,
    pub challenge_rating: String,
    pub proficiency_bonus: u8,
    pub armor_class: i32,
    pub hit_points: HitPointsDef,
    pub speed_ft: f32,
    pub abilities: BTreeMap<String, i32>,
    pub factions: Vec<String>,
    pub gear: Vec<String>,
    #[serde(default)]
    pub effects: Vec<String>,
    #[serde(default)]
    pub not_yet_supported: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HitPointsDef {
    pub average: u32,
    pub dice: String,
}

#[derive(Debug)]
pub enum MonsterError {
    Io(String),
    Parse(String),
    Invalid(String),
}

impl std::fmt::Display for MonsterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MonsterError::Io(e) => write!(f, "could not read monster file: {e}"),
            MonsterError::Parse(e) => write!(f, "could not parse monster file: {e}"),
            MonsterError::Invalid(e) => write!(f, "invalid monster: {e}"),
        }
    }
}

impl MonsterDef {
    pub fn load(path: &Path) -> Result<Self, MonsterError> {
        let text = fs::read_to_string(path).map_err(|e| MonsterError::Io(e.to_string()))?;
        serde_json::from_str(&text).map_err(|e| MonsterError::Parse(e.to_string()))
    }

    /// Nat20 only supports whole-number challenge ratings. Fractional CRs are
    /// rounded up to 1, which keeps the proficiency bonus right (+2 for every
    /// CR up to 4) but makes the engine's XP value wrong.
    fn engine_challenge_rating(&self) -> Result<ChallengeRating, MonsterError> {
        let cr = match self.challenge_rating.as_str() {
            "0" | "1/8" | "1/4" | "1/2" => 1,
            other => other
                .parse::<u8>()
                .map_err(|_| MonsterError::Invalid(format!("bad challenge_rating {other}")))?,
        };
        let cr = ChallengeRating::new(cr);
        if cr.proficiency_bonus() != self.proficiency_bonus {
            return Err(MonsterError::Invalid(format!(
                "proficiency_bonus {} but challenge rating {} gives {}",
                self.proficiency_bonus,
                self.challenge_rating,
                cr.proficiency_bonus()
            )));
        }
        Ok(cr)
    }

    fn ability_scores(&self) -> Result<AbilityScoreMap, MonsterError> {
        let get = |name: &str| {
            self.abilities
                .get(name)
                .copied()
                .ok_or_else(|| MonsterError::Invalid(format!("missing ability {name}")))
        };
        Ok(AbilityScoreMap::from([
            (Ability::Strength, get("strength")?),
            (Ability::Dexterity, get("dexterity")?),
            (Ability::Constitution, get("constitution")?),
            (Ability::Intelligence, get("intelligence")?),
            (Ability::Wisdom, get("wisdom")?),
            (Ability::Charisma, get("charisma")?),
        ]))
    }

    fn size(&self) -> Result<CreatureSize, MonsterError> {
        serde_json::from_value(serde_json::Value::String(self.size.clone()))
            .map_err(|_| MonsterError::Invalid(format!("unknown size {}", self.size)))
    }

    fn creature_type(&self) -> Result<CreatureType, MonsterError> {
        serde_json::from_value(serde_json::Value::String(self.creature_type.clone()))
            .map_err(|_| MonsterError::Invalid(format!("unknown type {}", self.creature_type)))
    }

    /// Spawns the monster and checks the engine agrees with the stat block on
    /// AC and proficiency bonus, so a silent data drift fails loudly.
    pub fn spawn(&self, engine_state: &mut EngineState) -> Result<Entity, MonsterError> {
        let factions: FactionSet = self
            .factions
            .iter()
            .map(|f| {
                f.parse::<FactionId>()
                    .map_err(|e| MonsterError::Invalid(format!("faction {f}: {e:?}")))
            })
            .collect::<Result<_, _>>()?;

        let monster = Monster::new(
            Name::new(self.name.clone()),
            registry::ai::RANDOM_CONTROLLER_ID.clone(),
            self.engine_challenge_rating()?,
            HitPoints::new(self.hit_points.average),
            self.size()?,
            self.creature_type()?,
            Speed::new(Length::new::<foot>(self.speed_ft)),
            self.ability_scores()?,
            factions,
        );
        let entity = engine_state.world.spawn(monster);

        // The server runs monster turns with its own scripted policy, so the
        // engine's built-in random AI must not act for this creature.
        engine_state
            .world
            .insert_one(entity, PlayerControlledTag)
            .map_err(|e| MonsterError::Invalid(e.to_string()))?;

        for item in &self.gear {
            let item_id: ItemId = item
                .parse()
                .map_err(|e| MonsterError::Invalid(format!("item {item}: {e:?}")))?;
            // Monsters are proficient with all their gear.
            match ItemsRegistry::get(&item_id) {
                Some(ItemInstance::Armor(armor)) => {
                    systems::helpers::get_component_mut::<ArmorTrainingSet>(
                        &mut engine_state.world,
                        entity,
                    )
                    .insert(armor.armor_type.clone());
                }
                Some(ItemInstance::Weapon(weapon)) => {
                    systems::helpers::get_component_mut::<WeaponProficiencyMap>(
                        &mut engine_state.world,
                        entity,
                    )
                    .set_proficiency(
                        weapon.category().clone(),
                        Proficiency::new(ProficiencyLevel::Proficient, ModifierSource::None),
                    );
                }
                Some(_) => {}
                None => return Err(MonsterError::Invalid(format!("unknown item {item}"))),
            }
            systems::loadout::equip(engine_state, entity, &item_id)
                .map_err(|e| MonsterError::Invalid(format!("equip {item}: {e:?}")))?;
        }

        for effect in &self.effects {
            let effect_id: EffectId = effect
                .parse()
                .map_err(|e| MonsterError::Invalid(format!("effect {effect}: {e:?}")))?;
            systems::effects::add_permanent_effect(
                engine_state,
                entity,
                effect_id,
                &ModifierSource::Custom(format!("{} stat block", self.name)),
                None,
            );
        }

        let _ = systems::health::heal_full(&mut engine_state.world, entity);

        let engine_ac = systems::loadout::armor_class(engine_state, entity).total();
        if engine_ac != self.armor_class {
            return Err(MonsterError::Invalid(format!(
                "{}: engine AC {engine_ac} does not match stat block AC {}",
                self.name, self.armor_class
            )));
        }

        Ok(entity)
    }
}
