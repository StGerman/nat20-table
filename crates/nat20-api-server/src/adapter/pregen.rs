//! Pregenerated characters, read from `pregens/<id>.json` and built through the engine's normal
//! level-up path (contract/protocol.md §2.2).

use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};

use hecs::Entity;
use nat20_api_contract::{EquipSlot, PregenFile};
use nat20_core::{
    components::{
        ability::{Ability, AbilityScoreDistribution},
        id::{
            BackgroundId, ClassId, DEFAULT_NAMESPACE, ItemId, NAMESPACE_SEPARATOR, Name, SpeciesId,
            SubspeciesId,
        },
        items::{equipment::slots::EquipmentSlot, inventory::Inventory, money::MonetaryValue},
        level_up::{ChoiceItem, ChoiceSpec, LevelUpPrompt},
        modifier::ModifierSource,
        resource::RechargeRule,
    },
    engine::engine_state::EngineState,
    entities::creature::Character,
    registry::registry::ItemsRegistry,
    systems::{
        self,
        level_up::{LevelUpDecision, LevelUpError, LevelUpSession},
    },
};

use super::sheet::{core_ability, core_skill};

/// Pregens live in `pregens/` at the repository root, with the rest of our adventure content.
fn pregens_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../pregens")
}

/// The ids of every pregen file, sorted.
pub fn known() -> Vec<String> {
    let mut ids: Vec<String> = std::fs::read_dir(pregens_dir())
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    e.file_name()
                        .to_str()
                        .and_then(|n| n.strip_suffix(".json"))
                        .map(str::to_owned)
                })
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    ids
}

/// Reads and parses `pregens/<id>.json`. The message names what is wrong, for a `bad_scene`.
pub fn read(id: &str) -> Result<PregenFile, String> {
    let plain = !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    let path = pregens_dir().join(format!("{id}.json"));
    if !plain || !path.is_file() {
        return Err(format!(
            "There is no pregen {id}; known pregens: {}.",
            known().join(", ")
        ));
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("Pregen {id}: {e}."))?;
    let file: PregenFile = serde_json::from_str(&text).map_err(|e| format!("Pregen {id}: {e}."))?;
    if file.id != id {
        return Err(format!(
            "Pregen {id}: the file's id is {}, not its file name.",
            file.id
        ));
    }
    Ok(file)
}

/// Spawns the character a pregen file describes, unplaced. On failure nothing is left behind.
pub fn spawn(engine: &mut EngineState, file: &PregenFile) -> Result<Entity, String> {
    let entity = engine
        .world
        .spawn(Character::new(Name::new(file.name.clone())));
    match build(engine, entity, file) {
        Ok(()) => Ok(entity),
        Err(e) => {
            let _ = engine.despawn(entity);
            Err(format!("Pregen {}: {e}.", file.id))
        }
    }
}

fn build(engine: &mut EngineState, entity: Entity, file: &PregenFile) -> Result<(), String> {
    if !(1..=20).contains(&file.level) {
        return Err(format!("level {} is outside 1 to 20", file.level));
    }
    let answers = Answers::new(file)?;
    let mut used = Used {
        choices: vec![false; file.choices.len()],
        skill_choices: vec![false; file.skill_choices.len()],
    };
    for level in 1..=file.level {
        let mut session = LevelUpSession::new(&engine.world, entity);
        while let Some(prompt) = session.pending_prompts().first().cloned() {
            let decision = answers.decide(&prompt, &mut used, level)?;
            session
                .advance(engine, &decision)
                .map_err(|e| refusal(&prompt, level, e))?;
        }
    }
    if let Some(i) = used.choices.iter().position(|u| !u) {
        return Err(format!(
            "choice {} answers no prompt core asked",
            file.choices[i].prompt_id
        ));
    }
    if let Some(i) = used.skill_choices.iter().position(|u| !u) {
        return Err(format!(
            "skill choice for {} answers no prompt core asked",
            file.skill_choices[i].source
        ));
    }

    outfit(engine, entity, file)?;

    let _ = systems::health::heal_full(&mut engine.world, entity);
    systems::resources::recharge(&mut engine.world, entity, &RechargeRule::Daily);
    Ok(())
}

/// Which of the file's `choices` and `skill_choices` have answered a prompt.
struct Used {
    choices: Vec<bool>,
    skill_choices: Vec<bool>,
}

/// The file's answers, parsed into core's types.
struct Answers<'a> {
    file: &'a PregenFile,
    species: String,
    subspecies: Option<String>,
    background: String,
    class: String,
    abilities: AbilityScoreDistribution,
}

impl<'a> Answers<'a> {
    fn new(file: &'a PregenFile) -> Result<Self, String> {
        let scores = &file.ability_scores;
        Ok(Self {
            file,
            species: parse::<SpeciesId>(&file.species)?.to_string(),
            subspecies: file
                .subspecies
                .as_deref()
                .map(parse::<SubspeciesId>)
                .transpose()?
                .map(|id| id.to_string()),
            background: parse::<BackgroundId>(&file.background)?.to_string(),
            class: parse::<ClassId>(&file.class)?.to_string(),
            abilities: AbilityScoreDistribution {
                scores: HashMap::from([
                    (Ability::Strength, scores.strength),
                    (Ability::Dexterity, scores.dexterity),
                    (Ability::Constitution, scores.constitution),
                    (Ability::Intelligence, scores.intelligence),
                    (Ability::Wisdom, scores.wisdom),
                    (Ability::Charisma, scores.charisma),
                ]),
                plus_2_bonus: core_ability(scores.plus_2),
                plus_1_bonus: core_ability(scores.plus_1),
            },
        })
    }

    /// The decision answering `prompt`, or why the file has none.
    fn decide(
        &self,
        prompt: &LevelUpPrompt,
        used: &mut Used,
        level: u8,
    ) -> Result<LevelUpDecision, String> {
        match prompt {
            LevelUpPrompt::Choice(spec) => {
                let picks: Vec<String> = match spec.id.as_str() {
                    "choice.species" => vec![self.species.clone()],
                    "choice.subspecies" => vec![self.subspecies.clone().ok_or_else(|| {
                        format!("core asks for a subspecies at level {level}; set `subspecies`")
                    })?],
                    "choice.background" => vec![self.background.clone()],
                    "choice.class" => vec![self.class.clone()],
                    _ if is_equipment(spec) => {
                        return gold_option(spec);
                    }
                    id => {
                        let i = self
                            .file
                            .choices
                            .iter()
                            .enumerate()
                            .position(|(i, c)| !used.choices[i] && c.prompt_id == id)
                            .ok_or_else(|| {
                                format!(
                                    "core asks {id} ({}) at level {level} and the file has no answer",
                                    spec.label
                                )
                            })?;
                        used.choices[i] = true;
                        self.file.choices[i]
                            .picks
                            .iter()
                            .map(|p| normalize(p))
                            .collect()
                    }
                };
                let selected = picks
                    .iter()
                    .map(|pick| {
                        spec.options
                            .iter()
                            .find(|o| option_id(o).as_deref() == Some(pick.as_str()))
                            .cloned()
                            .ok_or_else(|| {
                                format!("{pick} is not one of the options of {}", spec.id)
                            })
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(LevelUpDecision::from_choice(spec.id.clone(), selected))
            }
            LevelUpPrompt::AbilityScores(_, _) => {
                Ok(LevelUpDecision::AbilityScores(self.abilities.clone()))
            }
            LevelUpPrompt::SkillProficiency { source, .. } => {
                let skills = match source {
                    ModifierSource::ClassLevel(_) | ModifierSource::ClassFeature(_) => {
                        &self.file.skills
                    }
                    _ => {
                        let asker = source_id(source);
                        let i = self
                            .file
                            .skill_choices
                            .iter()
                            .enumerate()
                            .position(|(i, c)| {
                                !used.skill_choices[i] && Some(normalize(&c.source)) == asker
                            })
                            .ok_or_else(|| {
                                format!(
                                    "core asks for skills from {} at level {level} and \
                                     `skill_choices` has no answer",
                                    asker.unwrap_or_else(|| source.to_string())
                                )
                            })?;
                        used.skill_choices[i] = true;
                        &self.file.skill_choices[i].skills
                    }
                };
                Ok(LevelUpDecision::SkillProficiency(
                    skills
                        .iter()
                        .map(|s| core_skill(*s))
                        .collect::<HashSet<_>>(),
                ))
            }
            LevelUpPrompt::AbilityScoreImprovement { .. } | LevelUpPrompt::ReplaceSpells { .. } => {
                Err(format!(
                    "core asks for an {} at level {level}, which pregen files cannot answer yet",
                    match prompt {
                        LevelUpPrompt::AbilityScoreImprovement { .. } =>
                            "Ability Score Improvement",
                        _ => "spell replacement",
                    }
                ))
            }
        }
    }
}

/// Starting equipment comes from the file's `equipment`, so a kit prompt takes its gold option.
fn is_equipment(spec: &ChoiceSpec) -> bool {
    spec.options
        .iter()
        .all(|o| matches!(o, ChoiceItem::Equipment { .. }))
}

fn gold_option(spec: &ChoiceSpec) -> Result<LevelUpDecision, String> {
    spec.options
        .iter()
        .find(|o| matches!(o, ChoiceItem::Equipment { items, .. } if items.is_empty()))
        .map(|o| LevelUpDecision::single_choice_with_id(spec.id.clone(), o.clone()))
        .ok_or_else(|| format!("{} has no gold option to take", spec.id))
}

/// The registry id a choice option stands for; `None` for an equipment kit.
fn option_id(item: &ChoiceItem) -> Option<String> {
    Some(match item {
        ChoiceItem::Action(id) => id.to_string(),
        ChoiceItem::Spell(id, _) => id.to_string(),
        ChoiceItem::Background(id) => id.to_string(),
        ChoiceItem::Class(id) => id.to_string(),
        ChoiceItem::Subclass(id) => id.to_string(),
        ChoiceItem::Effect(id) => id.to_string(),
        ChoiceItem::Feat(id) => id.to_string(),
        ChoiceItem::Species(id) => id.to_string(),
        ChoiceItem::Subspecies(id) => id.to_string(),
        ChoiceItem::Equipment { .. } => return None,
    })
}

/// The registry id of what asks a prompt, for matching `skill_choices`.
fn source_id(source: &ModifierSource) -> Option<String> {
    Some(match source {
        ModifierSource::Species(id) => id.to_string(),
        ModifierSource::Subspecies(id) => id.to_string(),
        ModifierSource::Background(id) => id.to_string(),
        ModifierSource::Feat(id) | ModifierSource::FeatRepeatable(id, _) => id.to_string(),
        _ => return None,
    })
}

/// A registry id with its namespace spelled out.
fn normalize(id: &str) -> String {
    if id.contains(NAMESPACE_SEPARATOR) {
        id.to_owned()
    } else {
        format!("{DEFAULT_NAMESPACE}{NAMESPACE_SEPARATOR}{id}")
    }
}

fn parse<T: std::str::FromStr>(id: &str) -> Result<T, String> {
    id.parse()
        .map_err(|_| format!("{id} is not a registry id of the right kind"))
}

fn refusal(prompt: &LevelUpPrompt, level: u8, error: LevelUpError) -> String {
    let what = match prompt {
        LevelUpPrompt::Choice(spec) => spec.id.clone(),
        LevelUpPrompt::AbilityScores(_, _) => "ability_scores".into(),
        LevelUpPrompt::SkillProficiency { .. } => "skills".into(),
        LevelUpPrompt::AbilityScoreImprovement { .. } => "an Ability Score Improvement".into(),
        LevelUpPrompt::ReplaceSpells { .. } => "a spell replacement".into(),
    };
    let why = match error {
        LevelUpError::InvalidDecision {
            message: Some(m), ..
        } => m,
        LevelUpError::RegistryMissing(m) => format!("missing from the registry: {m}"),
        _ => "not an answer core allows".into(),
    };
    format!("core refuses the answer to {what} at level {level}: {why}")
}

/// Gives the character the file's items, equipping those with a slot, and its coins.
fn outfit(engine: &mut EngineState, entity: Entity, file: &PregenFile) -> Result<(), String> {
    for line in &file.equipment {
        let id: ItemId = parse(&line.item)?;
        if ItemsRegistry::get(&id).is_none() {
            return Err(format!("there is no item {}", line.item));
        }
        if line.quantity == 0 {
            return Err(format!("{} has quantity 0", line.item));
        }
        match line.equip {
            Some(slot) => {
                if line.quantity != 1 {
                    return Err(format!(
                        "{} is equipped, so its quantity must be 1",
                        line.item
                    ));
                }
                let displaced =
                    systems::loadout::equip_in_slot(engine, entity, &core_slot(slot), &id)
                        .map_err(|e| format!("{} cannot be equipped there: {e:?}", line.item))?;
                for item in displaced {
                    systems::inventory::add_item(&mut engine.world, entity, item);
                }
            }
            None => {
                for _ in 0..line.quantity {
                    systems::inventory::add_item(&mut engine.world, entity, id.clone());
                }
            }
        }
    }
    let money: MonetaryValue = file
        .money
        .parse()
        .map_err(|_| format!("{} is not a coin amount such as 54 GP", file.money))?;
    let held = systems::helpers::get_component::<Inventory>(&engine.world, entity)
        .money()
        .clone();
    let _ = systems::inventory::remove_money(&mut engine.world, entity, held);
    systems::inventory::add_money(&mut engine.world, entity, money);
    Ok(())
}

fn core_slot(slot: EquipSlot) -> EquipmentSlot {
    match slot {
        EquipSlot::Armor => EquipmentSlot::Armor,
        EquipSlot::MeleeMainHand => EquipmentSlot::MeleeMainHand,
        EquipSlot::MeleeOffHand => EquipmentSlot::MeleeOffHand,
        EquipSlot::RangedMainHand => EquipmentSlot::RangedMainHand,
        EquipSlot::RangedOffHand => EquipmentSlot::RangedOffHand,
    }
}

#[cfg(test)]
mod tests {
    use nat20_core::components::{
        health::hit_points::HitPoints,
        modifier::FlatModifiable,
        proficiency::ProficiencyLevel,
        skill::{Skill, SkillSet},
    };

    use super::*;
    use crate::adapter::game::load_geometry;

    fn engine() -> EngineState {
        EngineState::new(load_geometry(None))
    }

    fn bren() -> PregenFile {
        read("fighter_l2").expect("Bren's file reads")
    }

    /// Builds `file`, expecting a refusal that contains `needle` and leaves no entity behind.
    fn refused(file: PregenFile, needle: &str) {
        let mut engine = engine();
        let before = engine.world.len();
        let error = spawn(&mut engine, &file).expect_err("the pregen is refused");
        assert!(error.contains(needle), "{needle:?} not in {error:?}");
        assert_eq!(engine.world.len(), before, "{error}");
    }

    #[test]
    fn every_pregen_file_builds() {
        for id in known() {
            let file = read(&id).unwrap_or_else(|e| panic!("{e}"));
            spawn(&mut engine(), &file).unwrap_or_else(|e| panic!("{e}"));
        }
    }

    /// Armor Class and Hit Points of a built pregen.
    fn ac_and_hp(id: &str) -> (i32, u32) {
        let mut engine = engine();
        let entity = spawn(&mut engine, &read(id).unwrap()).unwrap();
        let ac = systems::loadout::armor_class(&engine, entity).total();
        let hp = systems::helpers::get_component::<HitPoints>(&engine.world, entity).current();
        (ac, hp)
    }

    #[test]
    fn the_pregens_have_the_specs_ac_and_hit_points() {
        // Milestone 4 spec §3: Chain Mail 16, Shield 2, Defense 1; 10+2, 6+2
        assert_eq!(ac_and_hp("fighter_l2"), (19, 20));
        // Unarmored Defense 10, Dex 1, Con 2; 12+2, 7+2
        assert_eq!(ac_and_hp("barbarian_l2"), (13, 23));
        // Chain Mail 16, Shield 2 (Protector's Heavy armour training); 8+2, 5+2
        assert_eq!(ac_and_hp("cleric_l2"), (18, 17));
    }

    #[test]
    fn skill_choices_answer_the_species_and_feat_prompts() {
        let mut engine = engine();
        let bren = spawn(&mut engine, &bren()).unwrap();
        let skills = systems::helpers::get_component::<SkillSet>(&engine.world, bren);
        for skill in [
            Skill::Insight,
            Skill::Medicine,
            Skill::Persuasion,
            Skill::Survival,
            Skill::Acrobatics,
            Skill::Athletics,
            Skill::Perception,
            Skill::Intimidation,
        ] {
            assert_eq!(
                skills.get(&skill).proficiency().level(),
                &ProficiencyLevel::Proficient,
                "{skill:?}"
            );
        }
        let inventory = systems::helpers::get_component::<Inventory>(&engine.world, bren);
        assert_eq!(inventory.money().to_string(), "54 GP");
    }

    #[test]
    fn skill_choices_are_checked() {
        let mut file = bren();
        file.skill_choices.remove(1);
        refused(
            file,
            "core asks for skills from nat20_core::feat.skilled at level 1 and `skill_choices` has no answer",
        );
        let mut file = bren();
        let mut extra = file.skill_choices[0].clone();
        extra.source = "feat.alert".into();
        file.skill_choices.push(extra);
        refused(file, "skill choice for feat.alert answers no prompt");
        let mut file = bren();
        file.skill_choices[0]
            .skills
            .push(nat20_api_contract::Skill::Arcana);
        refused(file, "core refuses the answer to skills at level 1");
    }

    #[test]
    fn unknown_keys_are_refused() {
        let mut value = serde_json::to_value(bren()).unwrap();
        value["armour_class"] = 19.into();
        let error = serde_json::from_value::<PregenFile>(value).unwrap_err();
        assert!(
            error.to_string().contains("unknown field `armour_class`"),
            "{error}"
        );
        let mut value = serde_json::to_value(bren()).unwrap();
        value["equipment"][0]["equipped"] = true.into();
        assert!(serde_json::from_value::<PregenFile>(value).is_err());
    }

    #[test]
    fn comments_are_allowed_on_the_file_and_its_sections() {
        let mut value = serde_json::to_value(bren()).unwrap();
        value["choices"][1]["_comment"] = "Defense: +1 AC in armour.".into();
        value["equipment"][0]["_comment"] = "Heavy armour.".into();
        let file: PregenFile = serde_json::from_value(value).unwrap();
        spawn(&mut engine(), &file).unwrap();
    }

    #[test]
    fn an_unanswered_prompt_is_refused() {
        let mut file = bren();
        file.choices.remove(1);
        refused(file, "core asks choice.fighting_style");
    }

    #[test]
    fn a_choice_no_prompt_asks_is_refused() {
        let mut file = bren();
        let mut extra = file.choices[0].clone();
        extra.prompt_id = "choice.divine_order".into();
        file.choices.push(extra);
        refused(file, "choice.divine_order answers no prompt");
    }

    #[test]
    fn a_pick_that_is_not_an_option_is_refused() {
        let mut file = bren();
        file.choices[1].picks = vec!["feat.fighting_style.dueling".into()];
        refused(
            file,
            "nat20_core::feat.fighting_style.dueling is not one of the options",
        );
        let mut file = bren();
        file.class = "nat20_core::class.monk".into();
        refused(file, "class.monk is not one of the options of choice.class");
    }

    #[test]
    fn core_refusing_an_answer_names_the_prompt() {
        let mut file = bren();
        file.skills.push(nat20_api_contract::Skill::Insight);
        refused(file, "core refuses the answer to skills at level 1");
        let mut file = bren();
        file.ability_scores.strength = 18;
        refused(file, "core refuses the answer to ability_scores");
    }

    #[test]
    fn equipment_is_checked() {
        let mut file = bren();
        file.equipment[2].quantity = 0;
        refused(file, "quantity 0");
        let mut file = bren();
        file.equipment[0].quantity = 2;
        refused(file, "its quantity must be 1");
        let mut file = bren();
        file.equipment[2].item = "nat20_core::item.vorpal_sword".into();
        refused(file, "there is no item nat20_core::item.vorpal_sword");
        let mut file = bren();
        file.money = "a lot".into();
        refused(file, "not a coin amount");
        let mut file = bren();
        file.level = 0;
        refused(file, "outside 1 to 20");
    }

    #[test]
    fn a_displaced_item_stays_in_the_inventory() {
        let mut file = bren();
        file.equipment.push(nat20_api_contract::PregenItem {
            comment: None,
            item: "nat20_core::item.flail".into(),
            quantity: 1,
            equip: Some(EquipSlot::MeleeMainHand),
        });
        let mut engine = engine();
        let bren = spawn(&mut engine, &file).unwrap();
        let inventory = systems::helpers::get_component::<Inventory>(&engine.world, bren);
        assert!(
            inventory.items().iter().any(|i| i.id() == "item.longsword"),
            "{:?}",
            inventory.items()
        );
    }

    #[test]
    fn a_missing_pregen_names_the_known_ones() {
        let error = read("wizard_l9").unwrap_err();
        assert!(
            error.contains("known pregens: barbarian_l2, cleric_l2, fighter_l2"),
            "{error}"
        );
        assert!(read("../fighter_l2").is_err());
    }
}
