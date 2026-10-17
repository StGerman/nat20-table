//! How engine ids read on the wire: option ids, display names, damage types.

use hecs::Entity;
use nat20_api_contract::DamageType as WireDamage;
use nat20_core::{
    components::{
        actions::action::ActionContext, damage::DamageType, id::ActionId,
        items::equipment::slots::EquipmentSlot,
    },
    engine::engine_state::EngineState,
    systems,
};

/// The option id stem for an engine action: `nat20_core::action.fighter.second_wind` becomes
/// `fighter/second_wind`.
pub fn option_stem(id: &ActionId) -> String {
    let id = id.id();
    id.strip_prefix("action.").unwrap_or(id).replace('.', "/")
}

/// The action's words: `nat20_core::action.melee_attack` becomes `melee attack`.
pub fn action_words(id: &ActionId) -> String {
    let id = id.id();
    let tail = id.strip_prefix("action.").unwrap_or(id);
    tail.replace(['.', '_'], " ")
}

/// The weapon an attack context uses, as an id word, e.g. `longsword`.
pub fn weapon_of(engine: &EngineState, entity: Entity, context: &ActionContext) -> Option<String> {
    let slot = context.attack.as_ref()?.slot.as_ref()?;
    weapon_name(engine, entity, slot)
}

fn weapon_name(engine: &EngineState, entity: Entity, slot: &EquipmentSlot) -> Option<String> {
    let loadout = systems::loadout::loadout(&engine.world, entity);
    let id = loadout.item_in_slot(slot)?;
    Some(id.id().strip_prefix("item.").unwrap_or(id.id()).to_string())
}

/// The option id and display name for an action with an optional weapon, without the
/// duplicate suffix `legal_actions` adds when two contexts would share an id.
pub fn option_id_and_name(action_id: &ActionId, weapon: Option<&str>) -> (String, String) {
    let stem = option_stem(action_id);
    match weapon {
        Some(weapon) => (
            format!("{stem}/{weapon}"),
            format!("{} attack", title(&weapon.replace('_', " "))),
        ),
        None => (stem, title(&action_words(action_id))),
    }
}

/// `second wind` becomes `Second Wind`.
pub fn title(words: &str) -> String {
    words
        .split(' ')
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().chain(chars).collect(),
                None => String::new(),
            }
        })
        .collect::<Vec<String>>()
        .join(" ")
}

pub fn damage_type(kind: &DamageType) -> WireDamage {
    match kind {
        DamageType::Acid => WireDamage::Acid,
        DamageType::Bludgeoning => WireDamage::Bludgeoning,
        DamageType::Cold => WireDamage::Cold,
        DamageType::Fire => WireDamage::Fire,
        DamageType::Force => WireDamage::Force,
        DamageType::Lightning => WireDamage::Lightning,
        DamageType::Necrotic => WireDamage::Necrotic,
        DamageType::Piercing => WireDamage::Piercing,
        DamageType::Poison => WireDamage::Poison,
        DamageType::Psychic => WireDamage::Psychic,
        DamageType::Radiant => WireDamage::Radiant,
        DamageType::Slashing => WireDamage::Slashing,
        DamageType::Thunder => WireDamage::Thunder,
    }
}

/// The core damage type behind a wire damage type.
pub fn core_damage_type(wire: WireDamage) -> DamageType {
    [
        DamageType::Acid,
        DamageType::Bludgeoning,
        DamageType::Cold,
        DamageType::Fire,
        DamageType::Force,
        DamageType::Lightning,
        DamageType::Necrotic,
        DamageType::Piercing,
        DamageType::Poison,
        DamageType::Psychic,
        DamageType::Radiant,
        DamageType::Slashing,
        DamageType::Thunder,
    ]
    .into_iter()
    .find(|core| damage_type(core) == wire)
    .expect("every wire damage type has a core one")
}
