//! How engine ids read on the wire: option ids, display names, damage types.

use nat20_api_contract::{DamageType as WireDamage, OptionItem, OptionSpell};
use nat20_core::hecs::Entity;
use nat20_core::{
    components::{
        actions::action::{ActionAttackKind, ActionContext},
        damage::DamageType,
        id::{ActionId, ActionVariantId, EffectId, ItemId},
        items::{equipment::slots::EquipmentSlot, inventory::ItemContainer},
        spells::{concentration::ConcentrationInstance, spell::SpellFlag},
    },
    engine::engine_state::EngineState,
    registry::registry::{ItemsRegistry, SpellsRegistry},
    systems,
};

/// The option id stem for an engine action: `nat20_core::action.fighter.second_wind` becomes
/// `fighter/second_wind`.
pub fn option_stem(id: &ActionId) -> String {
    let id = id.id();
    id.strip_prefix("action.").unwrap_or(id).replace('.', "/")
}

/// The wire id of an action variant: `nat20_core::variant.help.sleight_of_hand` becomes
/// `help/sleight_of_hand`.
pub fn variant_stem(id: &ActionVariantId) -> String {
    let id = id.id();
    id.strip_prefix("variant.").unwrap_or(id).replace('.', "/")
}

/// A variant's display name from its last word: `help/sleight_of_hand` becomes
/// `Sleight of Hand`.
pub fn variant_name(id: &ActionVariantId) -> String {
    let id = id.id();
    let last = id.rsplit('.').next().unwrap_or(id);
    title(&last.replace('_', " ")).replace(" Of ", " of ")
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

/// The option id and display name of an action taken in `context`: a spell is
/// `cast/<spell>/<slot level>` (a cantrip `cast/<spell>`) named after the spell; an item is
/// `use/<item>` named after the item; anything else is [`option_id_and_name`] with the weapon
/// the context uses, and an action made with an attack that is more than the attack (Reckless
/// Attack, an Opportunity Attack) is named after itself and what it attacks with, e.g.
/// "Barbarian Reckless Attack (Greataxe)" or "Barbarian Reckless Attack (Unarmed)".
pub fn option_for(
    engine: &EngineState,
    entity: Entity,
    action_id: &ActionId,
    context: &ActionContext,
) -> (String, String) {
    if let Some(item) = &context.item {
        return (format!("use/{}", item_word(item)), item_name(item));
    }
    match &context.spell {
        Some(spell) => {
            let id = spell.id.id();
            let word = id.strip_prefix("spell.").unwrap_or(id);
            let name = title(&word.replace('_', " "));
            match spell.level {
                0 => (format!("cast/{word}"), name),
                level => (format!("cast/{word}/{level}"), name),
            }
        }
        None => {
            let weapon = weapon_of(engine, entity, context);
            let (option_id, name) = option_id_and_name(action_id, weapon.as_deref());
            match context.attack.as_ref() {
                // Anything else made with an attack keeps its own name and says what it attacks
                // with, so Reckless Attack with a greataxe doesn't read like a plain "Greataxe
                // attack", and its Unarmed Strike doesn't read like the greataxe swing.
                Some(attack) if !PLAIN_ATTACKS.contains(&option_stem(action_id).as_str()) => {
                    let with = match (&weapon, &attack.kind) {
                        (Some(weapon), _) => title(&weapon.replace('_', " ")),
                        (None, ActionAttackKind::Unarmed) => "Unarmed".to_string(),
                        (None, _) => return (option_id, name),
                    };
                    (
                        option_id,
                        format!("{} ({with})", title(&action_words(action_id))),
                    )
                }
                _ => (option_id, name),
            }
        }
    }
}

/// The actions that are nothing but an attack: their options are named after the weapon
/// ("Longsword attack") or "Unarmed Attack".
const PLAIN_ATTACKS: [&str; 3] = ["melee_attack", "ranged_attack", "unarmed_attack"];

/// An item's id word, as on the sheet: `nat20_core::item.potion_of_healing` becomes
/// `potion_of_healing`.
pub fn item_word(id: &ItemId) -> String {
    let id = id.id();
    id.strip_prefix("item.").unwrap_or(id).to_string()
}

/// An item's display name from the registry, e.g. "Potion of Healing".
pub fn item_name(id: &ItemId) -> String {
    ItemsRegistry::get(id)
        .map(|item| item.item().name.clone())
        .unwrap_or_else(|| title(&item_word(id).replace('_', " ")))
}

/// The item a context uses up and how many `entity` carries, for an option's `item`.
pub fn option_item(
    engine: &EngineState,
    entity: Entity,
    context: &ActionContext,
) -> Option<OptionItem> {
    let item = context.item.as_ref()?;
    Some(OptionItem {
        id: item_word(item),
        remaining: systems::inventory::item_count(&engine.world, entity, item) as u32,
    })
}

/// The spell a context casts, for an option's `spell`.
pub fn option_spell(context: &ActionContext) -> Option<OptionSpell> {
    let spell = context.spell.as_ref()?;
    let id = spell.id.id();
    Some(OptionSpell {
        id: id.strip_prefix("spell.").unwrap_or(id).to_string(),
        level: spell.level,
        concentration: SpellsRegistry::get(&spell.id)
            .is_some_and(|s| s.has_flag(SpellFlag::Concentration)),
    })
}

/// The spell a concentration instance belongs to, by the id the sheet uses: core names a
/// spell's effects `effect.spell.<spell>` (a variant adds `.<variant>`).
pub fn concentration_spell(instance: &ConcentrationInstance) -> String {
    let ConcentrationInstance::Effect { effect, .. } = instance;
    effect_spell(effect)
}

/// The spell an effect belongs to (`effect.spell.bless` is `bless`), or the effect's own id.
pub fn effect_spell(effect: &EffectId) -> String {
    let id = effect.id();
    let rest = id.strip_prefix("effect.spell.").unwrap_or(id);
    rest.split('.').next().unwrap_or(rest).to_string()
}

/// `second wind` becomes `Second Wind`.
pub fn title(words: &str) -> String {
    words
        .split(' ')
        .enumerate()
        .map(|(i, w)| {
            // Short joining words stay lowercase, as in "Shield of Faith".
            if i > 0 && ["a", "an", "and", "of", "the", "to"].contains(&w) {
                return w.to_string();
            }
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
