//! Conditions and lasting effects as the wire names them (API-20). Core keeps no condition list:
//! a condition is an effect named `effect.condition.<condition>`, and a creature at 0 Hit Points
//! that is not dead has the Unconscious condition (SRD 5.2.1 Rules Glossary › Unconscious).

use std::collections::HashMap;

use nat20_api_contract::{Condition, EffectLine, Handle};
use nat20_core::hecs::Entity;
use nat20_core::{
    components::{
        effects::{
            effect::{EffectInstance, EffectInstanceId, EffectLifetime},
            effect_manager::EffectManager,
        },
        health::life_state::LifeState,
        id::EntityIdentifier,
        modifier::ModifierSource,
        time::TurnBoundary,
    },
    engine::engine_state::EngineState,
};

use super::names;

/// What the log last showed of one creature's conditions and effects.
#[derive(Debug, Clone, Default)]
pub struct Snapshot {
    pub conditions: Vec<Condition>,
    pub effects: Vec<EffectSnap>,
}

/// One lasting effect, with what decides where its end is logged.
#[derive(Debug, Clone)]
pub struct EffectSnap {
    pub line: EffectLine,
    /// Core's instance id: a recast replaces the instance with one that shows the same line.
    pub instance: EffectInstanceId,
    /// Whose turn boundary ends it, when it runs out at one.
    pub ends_at: Option<(Entity, TurnBoundary)>,
    /// The spell it belongs to, when it is a spell's effect (`bless`).
    pub spell: Option<String>,
}

/// The creature's conditions, in the contract's order, each once.
pub fn conditions_of(engine: &EngineState, entity: Entity) -> Vec<Condition> {
    let world = &engine.world;
    let mut out: Vec<Condition> = Vec::new();
    if let Ok(effects) = world.get::<&EffectManager>(entity) {
        for instance in effects.values() {
            if let Some(condition) = condition_of(instance) {
                out.push(condition);
            }
        }
    }
    if let Ok(state) = world.get::<&LifeState>(entity)
        && matches!(*state, LifeState::Unconscious(_) | LifeState::Stable)
    {
        out.push(Condition::Unconscious);
    }
    out.sort_by_key(|c| *c as u8);
    out.dedup();
    out
}

/// The condition an effect stands for: `effect.condition.poisoned` is `poisoned`.
fn condition_of(instance: &EffectInstance) -> Option<Condition> {
    let word = instance.effect_id.id().strip_prefix("effect.condition.")?;
    serde_json::from_value(serde_json::Value::String(word.to_string())).ok()
}

/// The creature's lasting effects in the order they began: top-level effects that run out at a
/// turn boundary or came from an action (a spell, Help, Dash), leaving out conditions.
pub fn effects_of(
    engine: &EngineState,
    entity: Entity,
    handles: &HashMap<Entity, String>,
) -> Vec<EffectSnap> {
    let world = &engine.world;
    let Ok(effects) = world.get::<&EffectManager>(entity) else {
        return Vec::new();
    };
    effects
        .values()
        .filter(|i| i.parent.is_none() && condition_of(i).is_none())
        .filter(|i| {
            !matches!(i.lifetime, EffectLifetime::Permanent)
                || matches!(i.source, ModifierSource::Action(_))
        })
        .map(|i| {
            let id = effect_id(i);
            let applier = i.applier.unwrap_or(entity);
            EffectSnap {
                instance: i.instance_id,
                line: EffectLine {
                    name: effect_name(&id),
                    id,
                    source: Handle(handles.get(&applier).cloned().unwrap_or_else(|| {
                        EntityIdentifier::from_world(world, applier)
                            .name()
                            .as_str()
                            .to_string()
                    })),
                },
                ends_at: match i.lifetime {
                    EffectLifetime::TurnBoundary {
                        entity, boundary, ..
                    } => Some((entity, boundary)),
                    EffectLifetime::Permanent => None,
                },
                spell: i
                    .effect_id
                    .id()
                    .starts_with("effect.spell.")
                    .then(|| names::effect_spell(&i.effect_id)),
            }
        })
        .collect()
}

/// The wire id of an effect: `nat20_core::effect.spell.bless` becomes `spell/bless`.
fn effect_id(instance: &EffectInstance) -> String {
    let id = instance.effect_id.id();
    id.strip_prefix("effect.").unwrap_or(id).replace('.', "/")
}

/// A display name from the wire id: a spell's effect is named after the spell (`spell/guidance/
/// survival` is "Guidance"), a Help's is "Help", anything else after its last word
/// (`barbarian/rage` is "Rage").
fn effect_name(id: &str) -> String {
    let mut words = id.split('/');
    let word = match (words.next(), words.next()) {
        (Some("spell"), Some(spell)) => spell,
        (Some("help"), _) => "help",
        _ => id.rsplit('/').next().unwrap_or(id),
    };
    names::title(&word.replace('_', " "))
}
