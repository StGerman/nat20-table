//! A creature's full sheet, read from the engine without rolling anything.
//!
//! Check bonuses come from core's own check templates after its pre-roll hooks (ability
//! modifier, proficiency, effects), so the sheet shows what the engine will add when it rolls.
//! Dice modifiers such as Bless are left out of a bonus: the sheet shows the flat part.

use std::collections::BTreeMap;

use super::{events::wire_life_state, names::title};
use hecs::Entity;
use nat20_api_contract::{
    Ability as WireAbility, AbilityLine, DeathSaves, FeatureLine, Handle, HitDicePool, ItemLine,
    ProficiencyLevel as WireProficiency, Recharge, ResourcePool, Sheet, Side, Skill as WireSkill,
    SkillLine, SpellLine, SpellSlots, SpellcastingLine,
};
use nat20_core::{
    components::{
        ability::{Ability, AbilityScoreMap},
        class::{CastingReadinessModel, ClassAndSubclass},
        d20::{D20Check, D20CheckDC},
        health::{hit_point_dice::HitPointDice, life_state::LifeState},
        id::{ActionId, ClassId, EntityIdentifier, FeatId, ItemId, SpeciesId, SubspeciesId},
        items::{
            equipment::slots::EquipmentSlot,
            inventory::{Inventory, ItemContainer},
        },
        level::CharacterLevels,
        modifier::{FlatModifiable, Modifiable, ModifierKind, ModifierSource},
        proficiency::ProficiencyLevel,
        resource::{RechargeRule, ResourceBudgetKind, ResourceMap},
        saving_throw::{SavingThrowKind, SavingThrowSet},
        skill::{Skill, SkillSet},
        species::CreatureType,
        spells::{spell::SpellFlag, spellbook::Spellbook},
    },
    engine::engine_state::EngineState,
    registry::registry::{
        ClassesRegistry, ItemsRegistry, ResourcesRegistry, SpeciesRegistry, SpellsRegistry,
        SubclassesRegistry, SubspeciesRegistry,
    },
    systems::{self, time::RestKind},
};

const METERS_PER_FOOT: f32 = 0.3048;

/// The sheet of `entity`, known on the wire as `handle`.
pub fn sheet(engine: &EngineState, entity: Entity, handle: &str, side: Side) -> Sheet {
    let world = &engine.world;
    let levels = world.get::<&CharacterLevels>(entity).ok();
    let (level, class, subclass) = match levels.as_deref() {
        Some(levels) => {
            // Characters in the demo have one class; the first class is the one listed.
            let first = levels.all_classes().iter().max_by_key(|(_, p)| p.level());
            (
                Some(levels.total_level()),
                first.map(|(id, _)| class_word(id)),
                first
                    .and_then(|(_, p)| p.subclass())
                    .map(|id| tail(id.id(), "subclass.")),
            )
        }
        None => (None, None, None),
    };
    drop(levels);

    let species = match world.get::<&SpeciesId>(entity) {
        Ok(id) if !id.id().is_empty() => tail(id.id(), "species."),
        _ => world
            .get::<&CreatureType>(entity)
            .map(|t| t.to_string().to_lowercase())
            .unwrap_or_default(),
    };

    let proficiency_bonus =
        systems::helpers::level(world, entity).map_or(0, |level| level.proficiency_bonus());

    let scores = systems::helpers::get_component::<AbilityScoreMap>(world, entity);
    let saves = systems::helpers::get_component::<SavingThrowSet>(world, entity);
    let abilities = ABILITIES
        .iter()
        .map(|&(ability, wire)| {
            let save = saves.get(&SavingThrowKind::Ability(ability));
            AbilityLine {
                ability: wire,
                score: scores.get(&ability).total().clamp(0, 30) as u8,
                modifier: scores.ability_modifier(&ability).total() as i8,
                save_bonus: bonus(engine, entity, save),
                save_proficient: *save.proficiency().level() != ProficiencyLevel::None,
            }
        })
        .collect();
    drop((scores, saves));

    let skill_set = systems::helpers::get_component::<SkillSet>(world, entity);
    let skills = SKILLS
        .iter()
        .map(|&(skill, wire)| {
            let check = skill_set.get(&skill);
            SkillLine {
                skill: wire,
                bonus: bonus(engine, entity, check),
                proficiency: wire_proficiency(check.proficiency().level()),
            }
        })
        .collect::<Vec<_>>();
    let initiative_bonus = bonus(engine, entity, skill_set.get(&Skill::Initiative));
    let perception = bonus(engine, entity, skill_set.get(&Skill::Perception));
    drop(skill_set);

    let points = systems::helpers::get_component::<
        nat20_core::components::health::hit_points::HitPoints,
    >(world, entity);
    let (hp, hp_max, temp_hp) = (
        points.current(),
        points.max(),
        points.temp().map_or(0, |t| t.amount()),
    );
    drop(points);

    let (life_state, death_saves) = match world.get::<&LifeState>(entity) {
        Ok(state) => {
            let saves = match &*state {
                LifeState::Unconscious(throws) => DeathSaves {
                    successes: throws.successes(),
                    failures: throws.failures(),
                },
                _ => DeathSaves {
                    successes: 0,
                    failures: 0,
                },
            };
            (wire_life_state(&state), saves)
        }
        Err(_) => (
            nat20_api_contract::LifeState::Dead,
            DeathSaves {
                successes: 0,
                failures: 0,
            },
        ),
    };

    let speed_m: f32 = systems::movement::speed(engine, entity)
        .total_speed()
        .get::<uom::si::length::meter>();

    // Ids name their class or species first (`fighter.second_wind`); display names drop it.
    let owners: Vec<&str> = class
        .iter()
        .map(String::as_str)
        .chain([species.as_str()])
        .collect();
    let (spell_slots, resources) = resources(engine, entity, &owners);
    let features = features(engine, entity, &owners);
    let (spellcasting, spells) = spellcasting(engine, entity);

    Sheet {
        handle: Handle(handle.to_owned()),
        name: EntityIdentifier::from_world(world, entity)
            .name()
            .as_str()
            .to_string(),
        side,
        level,
        class,
        subclass,
        species,
        proficiency_bonus,
        abilities,
        skills,
        ac: systems::loadout::armor_class(engine, entity).total().max(0) as u32,
        speed_ft: (speed_m / METERS_PER_FOOT).round() as u32,
        initiative_bonus,
        passive_perception: (10 + i32::from(perception)).max(0) as u8,
        hp,
        hp_max,
        temp_hp,
        hit_dice: world
            .get::<&HitPointDice>(entity)
            .map(|dice| {
                dice.pools()
                    .map(|(die, remaining, max)| HitDicePool {
                        die: die as u8,
                        remaining: remaining.into(),
                        max: max.into(),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        spell_slots,
        spellcasting,
        spells,
        resources,
        // The core has no condition or exhaustion model yet.
        conditions: Vec::new(),
        exhaustion: 0,
        life_state,
        death_saves,
        equipment: equipment(engine, entity),
        features,
    }
}

/// The flat bonus the engine adds to `check` when it rolls it for `entity`. Runs the same
/// pre-roll hooks as a roll does, on a copy, and rolls nothing.
fn bonus(engine: &EngineState, entity: Entity, check: &D20Check) -> i8 {
    let mut check = check.clone();
    check.apply_pre_roll_hooks(engine, entity);
    check
        .modifiers()
        .values()
        .map(flat_part)
        .sum::<i32>()
        .clamp(i8::MIN.into(), i8::MAX.into()) as i8
}

fn flat_part(kind: &ModifierKind) -> i32 {
    match kind {
        ModifierKind::Flat(value) => *value,
        ModifierKind::Dice(_) => 0,
        ModifierKind::Composite(kinds) => kinds.iter().map(flat_part).sum(),
    }
}

/// Spell slots by level and limited-use features. Per-turn action economy (action, bonus
/// action, reaction, Extra Attack) is what `legal_actions` reports, so it is not listed.
fn resources(
    engine: &EngineState,
    entity: Entity,
    owners: &[&str],
) -> (Vec<SpellSlots>, Vec<ResourcePool>) {
    let Ok(map) = engine.world.get::<&ResourceMap>(entity) else {
        return (Vec::new(), Vec::new());
    };
    let mut slots = Vec::new();
    let mut pools = BTreeMap::new();
    for (id, budget) in map.iter() {
        let definition = ResourcesRegistry::get(id);
        let recharge = definition.map(|r| r.recharge);
        if recharge == Some(RechargeRule::Turn) {
            continue;
        }
        match budget {
            ResourceBudgetKind::Tiered(tiers) if id.id() == "resource.spell_slot" => {
                slots.extend(tiers.iter().map(|(level, budget)| SpellSlots {
                    level: *level,
                    remaining: budget.current_uses.into(),
                    max: budget.max_uses.into(),
                }));
            }
            ResourceBudgetKind::Flat(budget) => {
                let word = tail(id.id(), "resource.");
                let name = display_name(&word, owners);
                pools.insert(
                    word.clone(),
                    ResourcePool {
                        id: word,
                        name,
                        remaining: budget.current_uses.into(),
                        max: budget.max_uses.into(),
                        recharge: match recharge {
                            Some(RechargeRule::Rest(RestKind::Short)) => Recharge::ShortRest,
                            Some(RechargeRule::Rest(RestKind::Long) | RechargeRule::Daily) => {
                                Recharge::LongRest
                            }
                            _ => Recharge::Never,
                        },
                        short_rest_regain: definition
                            .into_iter()
                            .flat_map(|r| &r.partial_recharge)
                            .filter(|p| p.on == RechargeRule::Rest(RestKind::Short))
                            .map(|p| u32::from(p.uses))
                            .max(),
                    },
                );
            }
            // No other tiered resource exists in the core.
            ResourceBudgetKind::Tiered(_) => {}
        }
    }
    slots.sort_by_key(|s| s.level);
    (slots, pools.into_values().collect())
}

/// Each class's Spellcasting line, then the spells it can cast or prepare: cantrips first,
/// then by level and name. A class that prepares from its entire list lists what is prepared.
fn spellcasting(engine: &EngineState, entity: Entity) -> (Vec<SpellcastingLine>, Vec<SpellLine>) {
    let world = &engine.world;
    let (Ok(levels), Ok(book)) = (
        world.get::<&CharacterLevels>(entity),
        world.get::<&Spellbook>(entity),
    ) else {
        return (Vec::new(), Vec::new());
    };
    let scores = systems::helpers::get_component::<AbilityScoreMap>(world, entity);
    let mut lines = Vec::new();
    let mut spells = Vec::new();
    for (class_id, progress) in levels.all_classes() {
        let source = ClassAndSubclass {
            class: class_id.clone(),
            subclass: progress.subclass().cloned(),
        };
        let Some(rules) = ClassesRegistry::get(class_id)
            .and_then(|class| class.spellcasting_rules(&source.subclass).cloned())
        else {
            continue;
        };
        let Some(state) = book.class_state(&source) else {
            continue;
        };
        let ability = rules.spellcasting_ability;
        let save_dc = match book.class_saving_throw(
            world,
            entity,
            class_id,
            SavingThrowKind::Ability(ability),
        ) {
            D20CheckDC::SavingThrow { dc, .. } => dc.total(),
            _ => continue,
        };
        let mut attack = book.attack_roll_template().clone();
        attack.add_modifier(
            ModifierSource::Ability(ability),
            scores.ability_modifier(&ability).total(),
        );
        lines.push(SpellcastingLine {
            class: class_word(class_id),
            ability: ABILITIES
                .iter()
                .find(|(core, _)| *core == ability)
                .map(|(_, wire)| *wire)
                .expect("six abilities"),
            save_dc: save_dc.clamp(0, u8::MAX.into()) as u8,
            attack_bonus: bonus(engine, entity, &attack),
        });

        let selections = &state.selections;
        let prepared: Vec<_> = selections
            .cantrips
            .iter()
            .chain(&selections.always_prepared)
            .chain(selections.prepared_spells.iter())
            .collect();
        // A learned spell is castable for a class that casts what it knows (the Warlock), and
        // waits to be prepared for one that prepares from what it learned (the Wizard). A spell
        // listed twice keeps its first line, so a prepared one stays `true`.
        let learned_castable = rules.readiness_model == CastingReadinessModel::Known;
        for (id, is_prepared) in prepared
            .iter()
            .map(|id| (*id, true))
            .chain(selections.learned_spells.iter().map(|id| (id, learned_castable)))
        {
            let Some(spell) = SpellsRegistry::get(id) else {
                continue;
            };
            let word = tail(id.id(), "spell.");
            if spells.iter().any(|s: &SpellLine| s.id == word) {
                continue;
            }
            spells.push(SpellLine {
                name: title(&word.replace('_', " ")),
                id: word,
                level: spell.base_level(),
                prepared: is_prepared,
                concentration: spell.has_flag(SpellFlag::Concentration),
            });
        }
    }
    spells.sort_by(|a, b| (a.level, &a.name).cmp(&(b.level, &b.name)));
    (lines, spells)
}

/// Equipped items in slot order, then carried items in the order they were picked up, with
/// duplicates counted.
fn equipment(engine: &EngineState, entity: Entity) -> Vec<ItemLine> {
    let world = &engine.world;
    let mut lines: Vec<ItemLine> = Vec::new();
    let loadout = systems::loadout::loadout(world, entity);
    for slot in SLOTS {
        if let Some(id) = loadout.item_in_slot(&slot) {
            lines.push(item_line(id, true));
        }
    }
    drop(loadout);
    if let Ok(inventory) = world.get::<&Inventory>(entity) {
        for id in inventory.items() {
            let word = tail(id.id(), "item.");
            match lines.iter_mut().find(|l| !l.equipped && l.id == word) {
                Some(line) => line.quantity += 1,
                None => lines.push(item_line(id, false)),
            }
        }
    }
    lines
}

fn item_line(id: &ItemId, equipped: bool) -> ItemLine {
    let word = tail(id.id(), "item.");
    ItemLine {
        name: ItemsRegistry::get(id)
            .map(|item| item.item().name.clone())
            .unwrap_or_else(|| title(&word.replace('_', " "))),
        id: word,
        quantity: 1,
        equipped,
    }
}

/// Feats, then the actions class levels and species grant (Second Wind, Tactical Mind), then
/// the lasting effects class levels, species and background grant, each once.
fn features(engine: &EngineState, entity: Entity, owners: &[&str]) -> Vec<FeatureLine> {
    let world = &engine.world;
    let mut lines: Vec<FeatureLine> = Vec::new();
    if let Ok(feats) = world.get::<&Vec<FeatId>>(entity) {
        for id in feats.iter() {
            push_feature(&mut lines, tail(id.id(), "feat."), owners);
        }
    }
    for id in granted_actions(engine, entity) {
        push_feature(&mut lines, tail(id.id(), "action."), owners);
    }
    let effects = systems::effects::effects(world, entity);
    let mut granted: Vec<String> = effects
        .effects
        .values()
        .filter(|e| e.parent.is_none())
        .filter(|e| {
            matches!(
                e.source,
                ModifierSource::ClassFeature(_)
                    | ModifierSource::ClassLevel(_)
                    | ModifierSource::SubclassFeature(_)
                    | ModifierSource::Species(_)
                    | ModifierSource::Subspecies(_)
                    | ModifierSource::Background(_)
            )
        })
        .map(|e| tail(e.effect_id.id(), "effect."))
        .collect();
    granted.sort();
    for word in granted {
        push_feature(&mut lines, word, owners);
    }
    lines
}

/// Actions granted by class and subclass levels and by species, in level order. Generic actions
/// every creature has (attacks, Dash) are not features, and no registry grants them.
fn granted_actions(engine: &EngineState, entity: Entity) -> Vec<ActionId> {
    let world = &engine.world;
    let up_to = |by_level: &std::collections::HashMap<u8, Vec<ActionId>>, level: u8| {
        (1..=level)
            .filter_map(|l| by_level.get(&l))
            .flatten()
            .cloned()
            .collect::<Vec<_>>()
    };
    let mut actions = Vec::new();
    let mut total = 0;
    if let Ok(levels) = world.get::<&CharacterLevels>(entity) {
        total = levels.total_level();
        let mut classes: Vec<_> = levels.all_classes().iter().collect();
        classes.sort_by_key(|(id, _)| id.id().to_string());
        for (class, progression) in classes {
            if let Some(class) = ClassesRegistry::get(class) {
                actions.extend(up_to(&class.base.actions_by_level, progression.level()));
            }
            if let Some(subclass) = progression.subclass().and_then(SubclassesRegistry::get) {
                actions.extend(up_to(&subclass.base.actions_by_level, progression.level()));
            }
        }
    }
    if let Ok(species) = world.get::<&SpeciesId>(entity)
        && let Some(species) = SpeciesRegistry::get(&species)
    {
        actions.extend(up_to(&species.base.actions_by_level, total));
    }
    if let Ok(subspecies) = world.get::<&Option<SubspeciesId>>(entity)
        && let Some(subspecies) = subspecies.as_ref().and_then(SubspeciesRegistry::get)
    {
        actions.extend(up_to(&subspecies.base.actions_by_level, total));
    }
    actions
}

fn push_feature(lines: &mut Vec<FeatureLine>, word: String, owners: &[&str]) {
    if lines.iter().any(|l| l.id == word) {
        return;
    }
    let name = display_name(&word, owners);
    lines.push(FeatureLine { id: word, name });
}

/// `fighting_style.defense` reads `Fighting Style: Defense`; a leading class or species word
/// is dropped, so `fighter.second_wind` reads `Second Wind`.
fn display_name(word: &str, owners: &[&str]) -> String {
    let mut parts: Vec<&str> = word.split('.').collect();
    if parts.len() > 1 && owners.contains(&parts[0]) {
        parts.remove(0);
    }
    parts
        .iter()
        .map(|part| title(&part.replace('_', " ")))
        .collect::<Vec<_>>()
        .join(": ")
}

/// `class.fighter` becomes `fighter`.
fn class_word(id: &ClassId) -> String {
    tail(id.id(), "class.")
}

/// The id without its namespace prefix: `species.dragonborn` becomes `dragonborn`.
fn tail(id: &str, prefix: &str) -> String {
    id.strip_prefix(prefix).unwrap_or(id).to_string()
}

/// The six abilities in sheet order.
/// The core ability behind a wire ability.
pub(super) fn core_ability(ability: WireAbility) -> Ability {
    ABILITIES
        .iter()
        .find(|(_, wire)| *wire == ability)
        .map(|(core, _)| *core)
        .expect("ABILITIES lists every wire ability")
}

/// The core skill behind a wire skill.
pub(super) fn core_skill(skill: WireSkill) -> Skill {
    SKILLS
        .iter()
        .find(|(_, wire)| *wire == skill)
        .map(|(core, _)| *core)
        .expect("SKILLS lists every wire skill")
}

/// A wire skill's name as the rules write it, e.g. `Sleight of Hand`.
pub(super) fn skill_word(skill: WireSkill) -> String {
    core_skill_word(core_skill(skill))
}

/// A core skill's name as the rules write it, e.g. `Sleight of Hand`.
pub(super) fn core_skill_word(skill: Skill) -> String {
    let mut out = String::new();
    for (i, c) in format!("{skill:?}").chars().enumerate() {
        if c.is_uppercase() && i > 0 {
            out.push(' ');
        }
        out.push(c);
    }
    out.replace(" Of ", " of ")
}

/// A wire ability's name as the rules write it, e.g. `Wisdom`.
pub(super) fn ability_word(ability: WireAbility) -> String {
    format!("{:?}", core_ability(ability))
}

const ABILITIES: [(Ability, WireAbility); 6] = [
    (Ability::Strength, WireAbility::Strength),
    (Ability::Dexterity, WireAbility::Dexterity),
    (Ability::Constitution, WireAbility::Constitution),
    (Ability::Intelligence, WireAbility::Intelligence),
    (Ability::Wisdom, WireAbility::Wisdom),
    (Ability::Charisma, WireAbility::Charisma),
];

/// The contract's eighteen skills, alphabetical. Initiative is a check in the core but not a
/// skill on the wire; the sheet shows it as `initiative_bonus`.
const SKILLS: [(Skill, WireSkill); 18] = [
    (Skill::Acrobatics, WireSkill::Acrobatics),
    (Skill::AnimalHandling, WireSkill::AnimalHandling),
    (Skill::Arcana, WireSkill::Arcana),
    (Skill::Athletics, WireSkill::Athletics),
    (Skill::Deception, WireSkill::Deception),
    (Skill::History, WireSkill::History),
    (Skill::Insight, WireSkill::Insight),
    (Skill::Intimidation, WireSkill::Intimidation),
    (Skill::Investigation, WireSkill::Investigation),
    (Skill::Medicine, WireSkill::Medicine),
    (Skill::Nature, WireSkill::Nature),
    (Skill::Perception, WireSkill::Perception),
    (Skill::Performance, WireSkill::Performance),
    (Skill::Persuasion, WireSkill::Persuasion),
    (Skill::Religion, WireSkill::Religion),
    (Skill::SleightOfHand, WireSkill::SleightOfHand),
    (Skill::Stealth, WireSkill::Stealth),
    (Skill::Survival, WireSkill::Survival),
];

/// Equipment slots in sheet order: armor, then weapons, then worn items.
const SLOTS: [EquipmentSlot; 12] = [
    EquipmentSlot::Armor,
    EquipmentSlot::MeleeMainHand,
    EquipmentSlot::MeleeOffHand,
    EquipmentSlot::RangedMainHand,
    EquipmentSlot::RangedOffHand,
    EquipmentSlot::Headwear,
    EquipmentSlot::Cloak,
    EquipmentSlot::Gloves,
    EquipmentSlot::Boots,
    EquipmentSlot::Amulet,
    EquipmentSlot::Ring1,
    EquipmentSlot::Ring2,
];

fn wire_proficiency(level: &ProficiencyLevel) -> WireProficiency {
    match level {
        ProficiencyLevel::None => WireProficiency::None,
        ProficiencyLevel::Expertise => WireProficiency::Expertise,
        // Half proficiency (Jack of All Trades) has no wire value; it adds half the bonus.
        _ => WireProficiency::Proficient,
    }
}
