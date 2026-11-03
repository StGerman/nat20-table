//! Level-up prompts in API terms (API-44, API-45): which have one answer, how the others are
//! offered, and how picks become core's decision. Shared by `level_up` in play and by the
//! roster, which replays the picks a character made.

use nat20_api_contract::LevelUpOption;
use nat20_core::{
    components::{
        level::CharacterLevels,
        level_up::{ChoiceItem, LevelUpPrompt},
        skill::Skill,
    },
    hecs::{Entity, World},
    registry::registry::SpellsRegistry,
    systems::level_up::LevelUpDecision,
};

use super::{names, sheet};

/// The id a skill prompt goes by, which core asks without one.
pub const SKILLS_PROMPT: &str = "choice.skills";

/// One option of a prompt, as core knows it.
#[derive(Clone, PartialEq)]
pub enum Item {
    Choice(ChoiceItem),
    Skill(Skill),
}

/// A prompt the player answers: its id, label, how many picks, and its options in wire order
/// (sorted by id), each with core's option.
pub struct Offer {
    pub id: String,
    pub label: String,
    pub picks: u8,
    pub options: Vec<(LevelUpOption, Item)>,
}

/// The answer to a prompt that has only one (the class it already has, a choice with no more
/// options than picks); `Ok(None)` when the player chooses. A prompt the API cannot ask yet
/// (ability scores, a spell swap) is an error.
pub fn automatic(
    world: &World,
    entity: Entity,
    prompt: &LevelUpPrompt,
) -> Result<Option<LevelUpDecision>, String> {
    match prompt {
        LevelUpPrompt::Choice(spec) if spec.id == "choice.class" => {
            let class = world
                .get::<&CharacterLevels>(entity)
                .ok()
                .and_then(|levels| levels.latest_class().cloned());
            spec.options
                .iter()
                .find(|o| matches!(o, ChoiceItem::Class(id) if Some(id) == class.as_ref()))
                .map(|item| {
                    Some(LevelUpDecision::single_choice_with_id(
                        spec.id.clone(),
                        item.clone(),
                    ))
                })
                .ok_or_else(|| "it has no class to gain a level in".to_owned())
        }
        LevelUpPrompt::Choice(spec) if spec.options.len() <= usize::from(spec.picks) => Ok(Some(
            LevelUpDecision::from_choice(spec.id.clone(), spec.options.clone()),
        )),
        LevelUpPrompt::Choice(_) => Ok(None),
        LevelUpPrompt::SkillProficiency {
            skills, choices, ..
        } if skills.len() <= usize::from(*choices) => {
            Ok(Some(LevelUpDecision::SkillProficiency(skills.clone())))
        }
        LevelUpPrompt::SkillProficiency { .. } => Ok(None),
        LevelUpPrompt::AbilityScores(..)
        | LevelUpPrompt::AbilityScoreImprovement { .. }
        | LevelUpPrompt::ReplaceSpells { .. } => {
            Err("it asks for ability scores or a spell swap, which level_up cannot ask yet".into())
        }
    }
}

/// How a prompt that [`automatic`] leaves to the player is offered.
pub fn offer(prompt: &LevelUpPrompt) -> Offer {
    let (id, label, picks, mut options): (String, String, u8, Vec<(LevelUpOption, Item)>) =
        match prompt {
            LevelUpPrompt::Choice(spec) => (
                spec.id.clone(),
                spec.label.clone(),
                spec.picks,
                spec.options
                    .iter()
                    .map(|item| (choice_option(item), Item::Choice(item.clone())))
                    .collect(),
            ),
            LevelUpPrompt::SkillProficiency {
                skills, choices, ..
            } => (
                SKILLS_PROMPT.to_owned(),
                "Skill Proficiency".to_owned(),
                *choices,
                skills
                    .iter()
                    .map(|skill| (skill_option(*skill), Item::Skill(*skill)))
                    .collect(),
            ),
            _ => (String::new(), String::new(), 0, Vec::new()),
        };
    // Core keeps some options in hash sets: the wire lists them by id.
    options.sort_by(|a, b| a.0.id.cmp(&b.0.id));
    Offer {
        id,
        label,
        picks,
        options,
    }
}

/// The options `picks` names, in order; `None` when one is not an option, one repeats, or
/// there are not as many as the offer asks.
pub fn pick(offer: &Offer, picks: &[String]) -> Option<Vec<Item>> {
    let mut chosen: Vec<Item> = Vec::new();
    for pick in picks {
        let (_, item) = offer.options.iter().find(|(o, _)| o.id == *pick)?;
        if chosen.contains(item) {
            return None;
        }
        chosen.push(item.clone());
    }
    (chosen.len() == usize::from(offer.picks)).then_some(chosen)
}

/// Core's decision for the chosen options of an offer.
pub fn decision(offer: &Offer, chosen: &[Item]) -> LevelUpDecision {
    if offer.id == SKILLS_PROMPT {
        return LevelUpDecision::SkillProficiency(
            chosen
                .iter()
                .filter_map(|c| match c {
                    Item::Skill(s) => Some(*s),
                    Item::Choice(_) => None,
                })
                .collect(),
        );
    }
    LevelUpDecision::from_choice(
        offer.id.clone(),
        chosen
            .iter()
            .filter_map(|c| match c {
                Item::Choice(item) => Some(item.clone()),
                Item::Skill(_) => None,
            })
            .collect(),
    )
}

/// A core choice option on the wire: the id's last part, its name, and a spell's summary.
fn choice_option(item: &ChoiceItem) -> LevelUpOption {
    let full = item.to_string();
    let id = full.rsplit(['.', ':']).next().unwrap_or(&full).to_owned();
    let summary = match item {
        ChoiceItem::Spell(spell, _) => {
            SpellsRegistry::get(spell).and_then(|s| s.action().summary.clone())
        }
        _ => None,
    };
    LevelUpOption {
        name: names::title(&id.replace('_', " ")),
        id,
        summary,
    }
}

/// A skill option on the wire: its id as the contract spells it and the ability it uses.
fn skill_option(skill: Skill) -> LevelUpOption {
    let name = sheet::core_skill_word(skill);
    let ability = format!("{:?}", skill.ability());
    let article = if ability.starts_with(['A', 'E', 'I', 'O', 'U']) {
        "An"
    } else {
        "A"
    };
    LevelUpOption {
        id: name.to_lowercase().replace(' ', "_"),
        summary: Some(format!("{article} {ability} skill.")),
        name,
    }
}
