//! Monsters spawned from the stat blocks in core's `monsters/` registry.
//!
//! Scene files name a stat block by a short id (`goblin_warrior`), which means
//! `nat20_core::monster.goblin_warrior`; a namespaced id such as
//! `nat20_demo::monster.mill_rat` names a block in our overlay and passes through
//! (milestone 5 spec D10). Core checks the blocks when its registry loads.

use nat20_core::hecs::Entity;
use nat20_core::{
    components::{ai::PlayerControlledTag, id::MonsterId},
    engine::engine_state::EngineState,
    registry::registry::MonstersRegistry,
    systems,
};

/// The core id a scene file's monster id names, or why it names none.
pub fn monster_id(monster: &str) -> Result<MonsterId, String> {
    if monster.contains("::") {
        return monster
            .parse()
            .map_err(|_| format!("{monster} is not a valid stat block id."));
    }
    if monster.is_empty()
        || !monster
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(format!("{monster} is not a valid stat block id."));
    }
    Ok(MonsterId::new(
        "nat20_core",
        format!("{}.{monster}", MonsterId::PREFIX),
    ))
}

/// Checks that a scene file's monster id names a stat block in the registry.
pub fn check(monster: &str) -> Result<(), String> {
    let id = monster_id(monster)?;
    if MonstersRegistry::get(&id).is_none() {
        return Err(format!(
            "Stat block {monster}: there is no such stat block."
        ));
    }
    Ok(())
}

/// Spawns the monster, unplaced. Nothing is left in the world if spawning fails.
pub fn spawn(engine_state: &mut EngineState, monster: &str) -> Result<Entity, String> {
    let id = monster_id(monster)?;
    let entity = systems::monsters::spawn(engine_state, &id)
        .map_err(|e| format!("Stat block {monster}: {e}."))?;
    // The server runs monster turns with its own scripted policy, so the
    // engine's built-in random AI must not act for this creature.
    if let Err(e) = engine_state.world.insert_one(entity, PlayerControlledTag) {
        let _ = engine_state.despawn(entity);
        return Err(format!("Stat block {monster}: {e}."));
    }
    Ok(entity)
}

#[cfg(test)]
mod tests {
    //! The stat-block guard (milestone 5 spec §9): each monster the demo fights is spawned
    //! from core's registry and what the engine derives is compared with a numbers-only
    //! excerpt of its SRD 5.2.1 stat block, so a typo or a wrong item fails here.

    use std::{collections::BTreeMap, path::Path};

    use nat20_core::uom::si::length::foot;
    use nat20_core::{
        components::{
            ability::{Ability, AbilityScoreMap},
            health::hit_points::HitPoints,
            items::equipment::{slots::EquipmentSlot, weapon::WeaponProficiencyMap},
            level::{ChallengeRating, Level},
            modifier::FlatModifiable,
        },
        engine::engine_state::EngineState,
        systems,
    };
    use serde::Deserialize;

    use super::*;
    use crate::adapter::{game::load_geometry, sheet};

    #[derive(Deserialize)]
    struct Excerpt {
        monsters: Vec<Block>,
    }

    #[derive(Deserialize)]
    struct Block {
        id: String,
        armor_class: i32,
        hit_points: u32,
        speed_ft: f32,
        challenge_rating: String,
        experience: u32,
        proficiency_bonus: u8,
        abilities: BTreeMap<String, i32>,
        attacks: Vec<Attack>,
    }

    #[derive(Deserialize)]
    struct Attack {
        name: String,
        /// `melee` or `ranged`: the hand the weapon is held in.
        hand: String,
        to_hit: i8,
        /// `NdM + K`, the damage dice and the flat bonus.
        damage: String,
        damage_type: String,
    }

    const ABILITIES: [(&str, Ability); 6] = [
        ("strength", Ability::Strength),
        ("dexterity", Ability::Dexterity),
        ("constitution", Ability::Constitution),
        ("intelligence", Ability::Intelligence),
        ("wisdom", Ability::Wisdom),
        ("charisma", Ability::Charisma),
    ];

    /// The lowest and highest totals of `NdM + K`.
    fn damage_range(damage: &str) -> (i32, i32) {
        let (dice, flat) = damage.split_once('+').unwrap_or((damage, "0"));
        let (count, size) = dice.trim().split_once('d').expect("NdM");
        let (count, size): (i32, i32) = (count.parse().unwrap(), size.parse().unwrap());
        let flat: i32 = flat.trim().parse().unwrap();
        (count + flat, count * size + flat)
    }

    fn excerpt() -> Excerpt {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data/srd-5.2.1-monsters.json");
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    #[test]
    fn every_demo_monster_matches_its_srd_stat_block() {
        let blocks = excerpt().monsters;
        assert_eq!(blocks.len(), 4);
        let mut engine = EngineState::new(load_geometry(None));
        for block in blocks {
            let name = &block.id;
            let entity = spawn(&mut engine, name).unwrap_or_else(|e| panic!("{e}"));
            let world = &engine.world;

            assert_eq!(
                systems::loadout::armor_class(&engine, entity).total(),
                block.armor_class,
                "{name} AC"
            );
            let hit_points = systems::helpers::get_component::<HitPoints>(world, entity);
            assert_eq!(
                (hit_points.current(), hit_points.max()),
                (block.hit_points, block.hit_points),
                "{name} HP"
            );
            drop(hit_points);
            let speed = systems::movement::speed(&engine, entity)
                .total_speed()
                .get::<foot>()
                .round();
            assert_eq!(speed, block.speed_ft, "{name} speed");

            let scores = systems::helpers::get_component::<AbilityScoreMap>(world, entity);
            for (word, ability) in ABILITIES {
                assert_eq!(
                    scores.get(&ability).total(),
                    block.abilities[word],
                    "{name} {word}"
                );
            }
            drop(scores);

            let challenge_rating =
                systems::helpers::get_component::<ChallengeRating>(world, entity);
            assert_eq!(
                challenge_rating.to_string(),
                block.challenge_rating,
                "{name} CR"
            );
            assert_eq!(challenge_rating.experience(), block.experience, "{name} XP");
            assert_eq!(
                challenge_rating.proficiency_bonus(),
                block.proficiency_bonus,
                "{name} PB"
            );
            drop(challenge_rating);

            for attack in &block.attacks {
                let slot = match attack.hand.as_str() {
                    "melee" => EquipmentSlot::MeleeMainHand,
                    "ranged" => EquipmentSlot::RangedMainHand,
                    other => panic!("{name} {}: unknown hand {other}", attack.name),
                };
                let loadout = systems::loadout::loadout(world, entity);
                let weapon = loadout
                    .weapon_in_hand(&slot)
                    .unwrap_or_else(|| panic!("{name} holds no {}", attack.name));
                assert_eq!(weapon.item().name, attack.name, "{name} {:?}", slot);
                let mut check = weapon.attack_roll(
                    &systems::helpers::get_component::<AbilityScoreMap>(world, entity),
                    &systems::helpers::get_component::<WeaponProficiencyMap>(world, entity)
                        .proficiency(weapon.category()),
                );
                check.merge_from(loadout.attack_roll_template(weapon.kind()));
                let damage = loadout
                    .weapon_damage_roll(world, entity, &slot)
                    .min_max_rolls();
                drop(loadout);

                assert_eq!(
                    sheet::bonus(&engine, entity, &check),
                    attack.to_hit,
                    "{name} {} to hit",
                    attack.name
                );
                let [(min, max, damage_type)] = damage[..] else {
                    panic!("{name} {}: {damage:?}", attack.name);
                };
                assert_eq!(
                    (min, max),
                    damage_range(&attack.damage),
                    "{name} {} damage",
                    attack.name
                );
                assert_eq!(
                    format!("{damage_type:?}").to_lowercase(),
                    attack.damage_type,
                    "{name} {} damage type",
                    attack.name
                );
            }
        }
    }

    #[test]
    fn short_ids_name_core_blocks_and_namespaced_ids_pass_through() {
        assert_eq!(
            monster_id("wolf").unwrap(),
            MonsterId::new("nat20_core", "monster.wolf")
        );
        assert_eq!(
            monster_id("nat20_demo::monster.mill_rat").unwrap(),
            MonsterId::new("nat20_demo", "monster.mill_rat")
        );
        assert!(monster_id("../wolf").is_err());
        assert!(monster_id("nat20_demo::item.wolf_bite").is_err());
    }

    #[test]
    fn an_unknown_monster_leaves_no_entity() {
        let mut engine = EngineState::new(load_geometry(None));
        let before = engine.world.len();
        assert!(check("goblin_king").is_err());
        assert!(spawn(&mut engine, "goblin_king").is_err());
        assert_eq!(engine.world.len(), before);
    }
}
