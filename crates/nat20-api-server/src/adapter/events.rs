//! Turns Nat20 engine events into session log entries, in full (DM) form with their visibility.

use std::collections::HashMap;

use hecs::Entity;
use nat20_api_contract::{
    AdvantageState, Against, AgainstKind, CombatOverReason, DcSource, DiceRolled, EventKind,
    Handle, LifeState as WireLife, Modifier, OptionId, RollId, RollKind, RollOutcome, RollView,
    Side, Visibility,
};
use nat20_core::{
    components::{
        actions::{
            action::{ActionResultComponent, DamageResult, HealingResult},
            targeting::TargetInstance,
        },
        d20::{
            AdvantageAware, AdvantageType, D20CheckDC, D20CheckOutcome, D20CheckResult, RollMode,
        },
        damage::{DamageMitigationResult, DamageRollResult},
        health::life_state::LifeState,
        id::EntityIdentifier,
        modifier::{FlatModifiable, ModifierKindResult, ModifierResult},
        saving_throw::SavingThrowKind,
        time::TurnBoundary,
    },
    engine::{
        engine_state::EngineState,
        event::{EncounterEvent, Event, EventKind as EngineKind},
    },
};

use crate::adapter::names;

/// One log entry before the session gives it a `seq` and roll ids.
#[derive(Debug, Clone)]
pub struct Pending {
    /// Combat round, when in combat.
    pub round: Option<u32>,
    /// Who may see it.
    pub visibility: Visibility,
    /// What happened, in full form. A roll's id is a local key such as `#3`, and a `damage_taken`
    /// or `healed` `source_roll` names the key of the roll that caused it; the session swaps both
    /// for the roll's real id. `None` means no roll caused it.
    pub kind: EventKind,
}

impl Pending {
    pub fn public(round: Option<u32>, kind: EventKind) -> Self {
        Self {
            round,
            visibility: Visibility::Public,
            kind,
        }
    }
}

/// Hit points per creature as the log has told them: (current, max, temp).
pub type HpTracker = HashMap<Entity, (u32, u32, u32)>;

/// Local keys for logged rolls, so a damage or healing event names the exact roll behind it
/// whatever else was logged in between. Lives as long as the scene.
#[derive(Debug, Default)]
pub struct RollKeys {
    next: u64,
    /// Recent damage rolls with their keys, newest last.
    damage: Vec<(DamageRollResult, String)>,
}

impl RollKeys {
    fn key(&mut self) -> String {
        self.next += 1;
        format!("#{}", self.next)
    }

    /// The key of the newest logged damage roll equal to `roll`.
    fn damage_key(&self, roll: &DamageRollResult) -> Option<String> {
        self.damage
            .iter()
            .rev()
            .find(|(logged, _)| logged == roll)
            .map(|(_, key)| key.clone())
    }
}

/// `(hp, hp_max, temp_hp)` after a change of `delta`, as the core applies it: damage spends
/// Temporary Hit Points first, healing never restores them, HP stays within 0..=max.
fn apply_hp((hp, hp_max, temp): (u32, u32, u32), delta: i32) -> (u32, u32, u32) {
    let (delta, temp) = if delta < 0 {
        let absorbed = temp.min(delta.unsigned_abs());
        (delta + absorbed as i32, temp - absorbed)
    } else {
        (delta, temp)
    };
    let hp = (hp as i64 + delta as i64).clamp(0, hp_max as i64) as u32;
    (hp, hp_max, temp)
}

fn keyed(mut roll: RollView, key: &str) -> RollView {
    if let RollView::Full { id, .. } = &mut roll {
        *id = RollId(key.to_owned());
    }
    roll
}

/// Turns engine events into log entries. Knows the scene's handles, so entries use the names the
/// API takes as input, and tracks Hit Points so each `hit_points` entry carries the value right
/// after that hit even when several land in one batch.
pub struct LogWriter<'a> {
    pub engine: &'a EngineState,
    pub handles: &'a HashMap<Entity, String>,
    pub round: Option<u32>,
    pub hp: &'a mut HpTracker,
    pub keys: &'a mut RollKeys,
    /// Handles in initiative order, for `combat_started`.
    pub initiative: Vec<String>,
}

impl LogWriter<'_> {
    fn who(&self, id: &EntityIdentifier) -> String {
        self.handles
            .get(&id.id())
            .cloned()
            .unwrap_or_else(|| id.name().as_str().to_string())
    }

    fn public(&self, kind: EventKind) -> Pending {
        Pending::public(self.round, kind)
    }

    /// Zero or more entries for one engine event.
    pub fn entries(&mut self, event: &Event) -> Vec<Pending> {
        match &event.kind {
            EngineKind::Encounter(EncounterEvent::EncounterStarted(_)) => {
                vec![self.public(EventKind::CombatStarted {
                    participants: self.initiative.iter().cloned().map(Handle).collect(),
                })]
            }
            EngineKind::Encounter(EncounterEvent::NewRound(_, round)) => {
                self.round = Some(*round as u32);
                vec![self.public(EventKind::Round {
                    number: *round as u32,
                })]
            }
            EngineKind::TurnBoundary { entity, boundary } => {
                let actor = Handle(self.who(entity));
                vec![self.public(match boundary {
                    TurnBoundary::Start => EventKind::TurnStart { actor },
                    TurnBoundary::End => EventKind::TurnEnd { actor },
                })]
            }
            EngineKind::ActionRequested { action } => {
                let weapon = names::weapon_of(self.engine, action.actor.id(), &action.context);
                let (option_id, name) =
                    names::option_id_and_name(&action.action_id, weapon.as_deref());
                let targets = action
                    .targets
                    .iter()
                    .filter_map(|t| match t {
                        TargetInstance::Entity { entity, .. } => Some(Handle(self.who(entity))),
                        _ => None,
                    })
                    .collect();
                vec![self.public(EventKind::Action {
                    actor: Handle(self.who(&action.actor)),
                    option_id: OptionId(option_id),
                    name,
                    targets,
                })]
            }
            EngineKind::D20CheckResolved { actor, result, dc } => {
                let (kind, label, against, target, dc_source) = match dc {
                    D20CheckDC::AttackRoll {
                        target,
                        armor_class,
                        ..
                    } => (
                        RollKind::Attack,
                        format!("an attack roll vs {}", self.who(target)),
                        Against {
                            kind: AgainstKind::Ac,
                            value: armor_class.total(),
                        },
                        Some(self.who(target)),
                        None,
                    ),
                    // A death save's DC 10 is a rule, not a stat block.
                    D20CheckDC::SavingThrow {
                        saving_throw: SavingThrowKind::Death,
                        dc,
                    } => (
                        RollKind::DeathSave,
                        "a death saving throw".into(),
                        Against {
                            kind: AgainstKind::Dc,
                            value: dc.total(),
                        },
                        None,
                        None,
                    ),
                    D20CheckDC::SavingThrow { saving_throw, dc } => (
                        RollKind::SavingThrow,
                        format!("a {} saving throw", words(&format!("{saving_throw:?}"))),
                        Against {
                            kind: AgainstKind::Dc,
                            value: dc.total(),
                        },
                        None,
                        Some(DcSource::StatBlock),
                    ),
                    D20CheckDC::Skill { skill, dc } => (
                        RollKind::SkillCheck,
                        format!("a {} check", words(&format!("{skill:?}"))),
                        Against {
                            kind: AgainstKind::Dc,
                            value: dc.total(),
                        },
                        None,
                        Some(DcSource::StatBlock),
                    ),
                };
                let success = result.is_success(dc);
                let outcome = match (kind, result.outcome, success) {
                    (RollKind::Attack, Some(D20CheckOutcome::CriticalSuccess), _) => {
                        RollOutcome::CriticalHit
                    }
                    (RollKind::Attack, _, true) => RollOutcome::Hit,
                    (RollKind::Attack, _, false) => RollOutcome::Miss,
                    (_, _, true) => RollOutcome::Success,
                    (_, _, false) => RollOutcome::Failure,
                };
                let roll = d20_roll(D20Roll {
                    kind,
                    label,
                    roller: self.who(actor),
                    target,
                    result,
                    against: Some(against),
                    outcome,
                    dc_source,
                });
                vec![self.public(EventKind::Roll { roll })]
            }
            EngineKind::DamageRollResolved { actor, result } => {
                let key = self.keys.key();
                let roll = keyed(damage_roll(self.who(actor), result), &key);
                self.keys.damage.push((result.clone(), key));
                // Area damage shares one roll across targets; keep a short history only.
                if self.keys.damage.len() > 32 {
                    self.keys.damage.remove(0);
                }
                vec![self.public(EventKind::Roll { roll })]
            }
            EngineKind::ActionResult { result, actor, .. } => {
                let target_entity = result.target.id();
                let target = self.who(&result.target);
                // Whoever acted rolls the healing; only an actor-less effect falls back to the
                // target.
                let healer = actor
                    .as_ref()
                    .map_or_else(|| target.clone(), |a| self.who(a));
                let mut entries = Vec::new();
                for component in &result.components {
                    let new_life_state = match component {
                        ActionResultComponent::Damage(DamageResult {
                            damage_roll,
                            damage_taken,
                            new_life_state,
                            ..
                        }) => {
                            // Damage with no roll (a fixed amount) cites nothing.
                            let source = damage_roll
                                .as_ref()
                                .and_then(|r| self.keys.damage_key(r))
                                .map(RollId);
                            if let Some(taken) = damage_taken {
                                let amount = taken.total.max(0) as u32;
                                let damage_type = taken
                                    .components
                                    .first()
                                    .map(|c| names::damage_type(&c.damage_type))
                                    .unwrap_or(nat20_api_contract::DamageType::Slashing);
                                entries.push(self.public(EventKind::DamageTaken {
                                    target: Handle(target.clone()),
                                    amount,
                                    damage_type,
                                    source_roll: source,
                                }));
                                entries.push(self.hit_points(target_entity, &target, -taken.total));
                            }
                            new_life_state
                        }
                        ActionResultComponent::Healing(HealingResult {
                            healing,
                            new_life_state,
                        }) => {
                            let key = self.keys.key();
                            let roll = keyed(
                                modifier_roll(
                                    RollKind::Healing,
                                    "healing".into(),
                                    healer.clone(),
                                    healing,
                                ),
                                &key,
                            );
                            entries.push(self.public(EventKind::Roll { roll }));
                            // The roll keeps the raw total; the event says what was regained.
                            let missing = self
                                .hp
                                .get(&target_entity)
                                .map(|(hp, hp_max, _)| hp_max.saturating_sub(*hp))
                                .unwrap_or(u32::MAX);
                            entries.push(self.public(EventKind::Healed {
                                target: Handle(target.clone()),
                                amount: (healing.total().max(0) as u32).min(missing),
                                source_roll: Some(RollId(key)),
                            }));
                            entries.push(self.hit_points(target_entity, &target, healing.total()));
                            new_life_state
                        }
                        _ => &None,
                    };
                    if let Some(state) = new_life_state {
                        entries.push(self.public(EventKind::LifeState {
                            target: Handle(target.clone()),
                            state: wire_life_state(state),
                        }));
                    }
                }
                entries
            }
            EngineKind::LifeStateChanged {
                entity, new_state, ..
            } => vec![self.public(EventKind::LifeState {
                target: Handle(self.who(entity)),
                state: wire_life_state(new_state),
            })],
            // Performed events are followed by Resolved events carrying the final result after
            // any reactions; logging both would show every die twice.
            _ => Vec::new(),
        }
    }

    /// The owner-only `hit_points` entry after a change of `delta`.
    fn hit_points(&mut self, entity: Entity, handle: &str, delta: i32) -> Pending {
        let entry = self.hp.entry(entity).or_insert((0, 0, 0));
        *entry = apply_hp(*entry, delta);
        let (hp, hp_max, temp_hp) = *entry;
        Pending {
            round: self.round,
            visibility: Visibility::Owner {
                handle: Handle(handle.to_owned()),
            },
            kind: EventKind::HitPoints {
                target: Handle(handle.to_owned()),
                hp,
                hp_max,
                temp_hp,
            },
        }
    }

    /// The roll entry for an ability check or saving throw the session asked for outside combat,
    /// with its local key, so the caller can cite the roll. `dc` is a skill check or an ability
    /// saving throw.
    pub fn explore_check(
        &mut self,
        roller: &str,
        label: String,
        result: &D20CheckResult,
        dc: &D20CheckDC,
        dc_source: DcSource,
    ) -> (Pending, String) {
        let (kind, value) = match dc {
            D20CheckDC::Skill { dc, .. } => (RollKind::SkillCheck, dc.total()),
            D20CheckDC::SavingThrow { dc, .. } => (RollKind::SavingThrow, dc.total()),
            D20CheckDC::AttackRoll { .. } => unreachable!("explore checks are never attacks"),
        };
        let key = self.keys.key();
        let roll = keyed(
            d20_roll(D20Roll {
                kind,
                label,
                roller: roller.to_owned(),
                target: None,
                result,
                against: Some(Against {
                    kind: AgainstKind::Dc,
                    value,
                }),
                outcome: if result.is_success(dc) {
                    RollOutcome::Success
                } else {
                    RollOutcome::Failure
                },
                dc_source: Some(dc_source),
            }),
            &key,
        );
        (self.public(EventKind::Roll { roll }), key)
    }

    /// The entries for damage dealt to `target` outside an action: the damage roll, then, if the
    /// target took damage, `damage_taken` citing that roll and its `hit_points`, then its new life
    /// state if it changed.
    pub fn plain_damage(
        &mut self,
        roller: &str,
        target: Entity,
        roll: &DamageRollResult,
        taken: Option<&DamageMitigationResult>,
        new_life_state: Option<&LifeState>,
    ) -> Vec<Pending> {
        let key = self.keys.key();
        let handle = self.handles.get(&target).cloned().unwrap_or_default();
        let mut entries = vec![self.public(EventKind::Roll {
            roll: keyed(damage_roll(roller.to_owned(), roll), &key),
        })];
        if let Some(taken) = taken {
            let damage_type = taken
                .components
                .first()
                .map(|c| names::damage_type(&c.damage_type))
                .unwrap_or(nat20_api_contract::DamageType::Slashing);
            entries.push(self.public(EventKind::DamageTaken {
                target: Handle(handle.clone()),
                amount: taken.total.max(0) as u32,
                damage_type,
                source_roll: Some(RollId(key)),
            }));
            entries.push(self.hit_points(target, &handle, -taken.total));
        }
        if let Some(state) = new_life_state {
            entries.push(self.public(EventKind::LifeState {
                target: Handle(handle),
                state: wire_life_state(state),
            }));
        }
        entries
    }

    /// The initiative roll for one creature.
    pub fn initiative(&self, entity: &EntityIdentifier, result: &D20CheckResult) -> Pending {
        let roll = d20_roll(D20Roll {
            kind: RollKind::Initiative,
            label: "initiative".into(),
            roller: self.who(entity),
            target: None,
            result,
            against: None,
            outcome: RollOutcome::Value,
            dc_source: None,
        });
        self.public(EventKind::Roll { roll })
    }
}

/// The entry for the end of combat.
pub fn combat_over(round: Option<u32>, winner: Option<Side>) -> Pending {
    Pending::public(
        round,
        EventKind::CombatOver {
            winner,
            reason: CombatOverReason::SideDown,
        },
    )
}

pub fn wire_life_state(state: &LifeState) -> WireLife {
    match state {
        LifeState::Normal => WireLife::Conscious,
        LifeState::Unconscious(_) => WireLife::Unconscious,
        LifeState::Stable => WireLife::Stable,
        LifeState::Dead => WireLife::Dead,
    }
}

/// `StrengthSave` becomes `strength save`.
fn words(s: &str) -> String {
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() && i > 0 {
            out.push(' ');
        }
        out.push(c.to_ascii_lowercase());
    }
    out
}

fn collect_modifiers(
    result: &ModifierResult,
    dice: &mut Vec<DiceRolled>,
    mods: &mut Vec<Modifier>,
) {
    fn walk(
        source: &str,
        kind: &ModifierKindResult,
        dice: &mut Vec<DiceRolled>,
        mods: &mut Vec<Modifier>,
    ) {
        match kind {
            ModifierKindResult::Flat(value) => mods.push(Modifier {
                source: source.to_string(),
                value: *value,
            }),
            ModifierKindResult::Dice(result) => {
                let results: Vec<u32> = result.rolls().to_vec();
                dice.push(DiceRolled {
                    source: source.to_string(),
                    dice: result.dice().to_string(),
                    kept: results.iter().sum::<u32>() as i32,
                    results,
                })
            }
            ModifierKindResult::Composite(parts) => {
                for part in parts {
                    walk(source, part, dice, mods);
                }
            }
        }
    }
    for (source, kind) in result.iter() {
        walk(&source.to_string(), kind, dice, mods);
    }
}

struct D20Roll<'a> {
    kind: RollKind,
    label: String,
    roller: String,
    target: Option<String>,
    result: &'a D20CheckResult,
    against: Option<Against>,
    outcome: RollOutcome,
    dc_source: Option<DcSource>,
}

fn d20_roll(roll: D20Roll) -> RollView {
    let result = roll.result;
    let advantage = match (result.rolls.len(), result.roll_mode()) {
        (1, _) | (_, RollMode::Normal) => AdvantageState::Normal,
        (_, RollMode::Advantage) => AdvantageState::Advantage,
        (_, RollMode::Disadvantage) => AdvantageState::Disadvantage,
    };
    let mut dice = vec![DiceRolled {
        source: "d20".into(),
        dice: format!("{}d20", result.rolls.len()),
        results: result.rolls.iter().map(|r| *r as u32).collect(),
        kept: result.selected_roll as i32,
    }];
    let mut modifiers = Vec::new();
    collect_modifiers(result.modifiers(), &mut dice, &mut modifiers);
    let advantage_sources = result
        .advantage_tracker()
        .summary()
        .iter()
        .map(|(source, kind)| {
            let kind = match kind {
                AdvantageType::Advantage => "advantage",
                AdvantageType::Disadvantage => "disadvantage",
            };
            format!("{source} ({kind})")
        })
        .collect();
    RollView::Full {
        id: RollId(String::new()),
        kind: roll.kind,
        label: roll.label,
        roller: Handle(roll.roller),
        target: roll.target.map(Handle),
        dice,
        modifiers,
        total: result.total(),
        against: roll.against,
        outcome: roll.outcome,
        advantage,
        dc_source: roll.dc_source,
        advantage_sources,
    }
}

fn damage_roll(roller: String, result: &DamageRollResult) -> RollView {
    let mut dice = Vec::new();
    let mut modifiers = Vec::new();
    let mut types = Vec::new();
    for component in &result.components {
        collect_modifiers(&component.result, &mut dice, &mut modifiers);
        types.push(component.damage_type.to_string().to_lowercase());
    }
    types.dedup();
    let label = format!(
        "{}{} damage",
        if result.crit { "critical " } else { "" },
        types.join(" and ")
    );
    plain_roll(
        RollKind::Damage,
        label,
        roller,
        dice,
        modifiers,
        result.total,
    )
}

fn modifier_roll(
    kind: RollKind,
    label: String,
    roller: String,
    result: &ModifierResult,
) -> RollView {
    let mut dice = Vec::new();
    let mut modifiers = Vec::new();
    collect_modifiers(result, &mut dice, &mut modifiers);
    plain_roll(kind, label, roller, dice, modifiers, result.total())
}

fn plain_roll(
    kind: RollKind,
    label: String,
    roller: String,
    dice: Vec<DiceRolled>,
    modifiers: Vec<Modifier>,
    total: i32,
) -> RollView {
    RollView::Full {
        id: RollId(String::new()),
        kind,
        label,
        roller: Handle(roller),
        target: None,
        dice,
        modifiers,
        total,
        against: None,
        outcome: RollOutcome::Value,
        advantage: AdvantageState::Normal,
        dc_source: None,
        advantage_sources: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::apply_hp;

    #[test]
    fn damage_spends_temporary_hit_points_first() {
        assert_eq!(apply_hp((20, 20, 5), -7), (18, 20, 0));
        assert_eq!(apply_hp((20, 20, 5), -3), (20, 20, 2));
        assert_eq!(apply_hp((4, 20, 0), -9), (0, 20, 0));
        assert_eq!(apply_hp((15, 20, 3), 10), (20, 20, 3));
    }
}
