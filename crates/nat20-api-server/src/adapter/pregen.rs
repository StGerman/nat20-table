//! Pregenerated characters, built through the engine's normal level-up path.

use std::collections::HashSet;

use hecs::Entity;
use nat20_core::{
    components::{
        id::{BackgroundId, ClassId, FeatId, ItemId, Name, SpeciesId, SubspeciesId},
        level_up::ChoiceItem,
        resource::RechargeRule,
        skill::Skill,
    },
    engine::engine_state::EngineState,
    entities::creature::Character,
    registry::registry::ClassesRegistry,
    systems::{self, level_up::LevelUpDecision},
};

pub const PREGENS: &[&str] = &["fighter_l2"];

pub fn spawn(engine_state: &mut EngineState, pregen: &str) -> Option<Entity> {
    match pregen {
        "fighter_l2" => Some(fighter_l2(engine_state)),
        _ => None,
    }
}

/// Bren, level 2 Fighter with the Defense fighting style, Chain Mail and a
/// Longsword.
///
/// Stand-ins until the engine has them: Dragonborn instead of Human (no Human
/// species yet) and no Shield (no shield equipment yet), so AC is 17 instead
/// of the demo pregen's 19.
fn fighter_l2(engine_state: &mut EngineState) -> Entity {
    let fighter = ClassId::new("nat20_core", "class.fighter");
    let entity = engine_state.world.spawn(Character::new(Name::new("Bren")));

    systems::level_up::apply_level_up_decision(
        engine_state,
        entity,
        2,
        vec![
            // Level 1
            LevelUpDecision::single_choice(ChoiceItem::Species(SpeciesId::new(
                "nat20_core",
                "species.dragonborn",
            ))),
            LevelUpDecision::single_choice(ChoiceItem::Subspecies(SubspeciesId::new(
                "nat20_core",
                "subspecies.dragonborn.white",
            ))),
            LevelUpDecision::single_choice(ChoiceItem::Background(BackgroundId::new(
                "nat20_core",
                "background.soldier",
            ))),
            LevelUpDecision::single_choice(ChoiceItem::Class(fighter.clone())),
            LevelUpDecision::AbilityScores(
                ClassesRegistry::get(&fighter)
                    .expect("fighter class is registered")
                    .default_abilities
                    .clone(),
            ),
            LevelUpDecision::single_choice_with_id(
                "choice.fighting_style",
                ChoiceItem::Feat(FeatId::new("nat20_core", "feat.fighting_style.defense")),
            ),
            LevelUpDecision::SkillProficiency(HashSet::from([Skill::Athletics, Skill::Perception])),
            LevelUpDecision::single_choice_with_id(
                "choice.starting_equipment.fighter",
                ChoiceItem::Equipment {
                    items: vec![
                        (1, ItemId::new("nat20_core", "item.chainmail")),
                        (1, ItemId::new("nat20_core", "item.greatsword")),
                        (1, ItemId::new("nat20_core", "item.flail")),
                        (8, ItemId::new("nat20_core", "item.javelin")),
                    ],
                    money: "4 GP".to_string(),
                },
            ),
            LevelUpDecision::single_choice_with_id(
                "choice.starting_equipment.soldier",
                ChoiceItem::Equipment {
                    items: Vec::new(),
                    money: "50 GP".to_string(),
                },
            ),
            // Level 2
            LevelUpDecision::single_choice(ChoiceItem::Class(fighter)),
        ],
    );

    systems::loadout::equip(
        engine_state,
        entity,
        &ItemId::new("nat20_core", "item.longsword"),
    )
    .expect("fighter can equip a longsword");

    let _ = systems::health::heal_full(&mut engine_state.world, entity);
    systems::resources::recharge(&mut engine_state.world, entity, &RechargeRule::Daily);

    entity
}
