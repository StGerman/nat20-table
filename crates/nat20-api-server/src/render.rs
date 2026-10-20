//! Event text: one sentence per event, rendered from the event as the viewer sees it, so the
//! text can never carry a number the view type left out (CLAUDE.md Rule 3).

use nat20_api_contract::{
    AgainstKind, CombatOverReason, ConcentrationEndReason, DamageType, DiceRolled, EventKind,
    Handle, LifeState, Mode, RollKind, RollOutcome, RollView, Side,
};

/// The sentence for one event.
pub fn text(kind: &EventKind) -> String {
    match kind {
        EventKind::SessionStarted {
            seed,
            protocol_version,
        } => format!("Session started (protocol {protocol_version}, seed {seed})."),
        EventKind::SceneLoaded { scene_id, mode } => {
            format!("Scene {scene_id} loaded in {} mode.", mode_word(*mode))
        }
        EventKind::CombatStarted { participants } => {
            format!("Combat begins: {}.", list(participants))
        }
        EventKind::CombatOver { winner, reason } => match (reason, winner) {
            (CombatOverReason::Surrender, _) => {
                "Combat is over: the other side surrendered.".into()
            }
            (CombatOverReason::Fled, _) => "Combat is over: the other side fled.".into(),
            (CombatOverReason::Scenario, _) => "Combat is over.".into(),
            (CombatOverReason::SideDown, Some(side)) => {
                format!("Combat is over. The {} side wins.", side_word(*side))
            }
            (CombatOverReason::SideDown, None) => {
                "Combat is over with nobody left standing.".into()
            }
        },
        EventKind::Surrendered { handles } => format!(
            "{} {}.",
            list(handles),
            if handles.len() == 1 {
                "surrenders"
            } else {
                "surrender"
            }
        ),
        EventKind::Round { number } => format!("Round {number} begins."),
        EventKind::TurnStart { actor } => format!("{actor}'s turn.", actor = actor.0),
        EventKind::TurnEnd { actor } => format!("{}'s turn ends.", actor.0),
        EventKind::Action {
            actor,
            name,
            targets,
            ..
        } => {
            if targets.is_empty() || targets == std::slice::from_ref(actor) {
                format!("{} uses {name}.", actor.0)
            } else {
                format!("{} uses {name} on {}.", actor.0, list(targets))
            }
        }
        EventKind::Roll { roll } => {
            let (roller, label) = match roll {
                RollView::Full { roller, label, .. } | RollView::Player { roller, label, .. } => {
                    (roller, label)
                }
            };
            format!("{} rolls {label}: {}.", roller.0, roll_summary(roll))
        }
        EventKind::DamageTaken {
            target,
            amount,
            damage_type,
            ..
        } => format!(
            "{} takes {amount} {} damage.",
            target.0,
            damage_word(*damage_type)
        ),
        EventKind::Healed { target, amount, .. } => {
            format!("{} regains {amount} Hit Points.", target.0)
        }
        EventKind::HitPoints {
            target,
            hp,
            hp_max,
            temp_hp,
        } => {
            if *temp_hp > 0 {
                format!(
                    "{} has {hp}/{hp_max} Hit Points and {temp_hp} temporary.",
                    target.0
                )
            } else {
                format!("{} has {hp}/{hp_max} Hit Points.", target.0)
            }
        }
        EventKind::ConditionAdded {
            target, condition, ..
        } => format!("{} is now {}.", target.0, snake_words(condition)),
        EventKind::ConditionRemoved {
            target, condition, ..
        } => format!("{} is no longer {}.", target.0, snake_words(condition)),
        EventKind::ConcentrationStarted { actor, spell } => {
            format!("{} concentrates on {}.", actor.0, spell_name(spell))
        }
        EventKind::ConcentrationEnded {
            actor,
            spell,
            reason,
        } => format!(
            "{} stops concentrating on {}{}.",
            actor.0,
            spell_name(spell),
            match reason {
                ConcentrationEndReason::Replaced => " to cast another spell",
                ConcentrationEndReason::FailedSave => " after a failed save",
                ConcentrationEndReason::Incapacitated => ", incapacitated",
                ConcentrationEndReason::Expired => " as it runs out",
                ConcentrationEndReason::Ended => "",
            }
        ),
        EventKind::ItemUsed {
            actor,
            item,
            target,
        } => {
            if actor == target {
                format!("{} drinks a {}.", actor.0, item_name(item))
            } else {
                format!("{} gives {} a {}.", actor.0, target.0, item_name(item))
            }
        }
        EventKind::LifeState { target, state } => {
            format!("{} is {}.", target.0, life_state(*state))
        }
        EventKind::Moved { actor, anchor, .. } => match anchor {
            Some(anchor) => format!("{} moves to {anchor}.", actor.0),
            None => format!("{} moves.", actor.0),
        },
        EventKind::CheckResolved { actor, success, .. } => format!(
            "{}'s check {}.",
            actor.0,
            if *success { "succeeds" } else { "fails" }
        ),
        EventKind::Rest { participants, rest } => format!(
            "{} {} a {} rest.",
            list(participants),
            if participants.len() == 1 {
                "finishes"
            } else {
                "finish"
            },
            snake_words(rest)
        ),
        EventKind::Spawned { handles, .. } => format!(
            "{} {}.",
            list(handles),
            if handles.len() == 1 {
                "appears"
            } else {
                "appear"
            }
        ),
        EventKind::FlagSet { flag } => format!("Flag {flag} is set."),
        EventKind::HazardTriggered { hazard_id, actor } => {
            format!("{} sets off {hazard_id}.", actor.0)
        }
    }
}

/// The roll's arithmetic as this view shows it, e.g. `1d20 (14) +5 = 19 vs AC 15, hit` in the
/// full view and `1d20 (14) = 19, hit` in the player view. Transcripts quote this verbatim
/// after the roll's `[rN]` citation.
pub fn roll_summary(roll: &RollView) -> String {
    let (dice, modifiers, total, against, outcome) = match roll {
        RollView::Full {
            dice,
            modifiers,
            total,
            against,
            outcome,
            ..
        } => (dice, Some(modifiers), *total, against.as_ref(), *outcome),
        RollView::Player {
            dice,
            total,
            outcome,
            ..
        } => (dice, None, *total, None, *outcome),
    };
    let mut text = dice.iter().map(die).collect::<Vec<_>>().join(" + ");
    if let Some(modifiers) = modifiers {
        let flat: i32 = modifiers.iter().map(|m| m.value).sum();
        if flat != 0 || text.is_empty() {
            text.push_str(&format!(
                " {}{}",
                if flat < 0 { "-" } else { "+" },
                flat.abs()
            ));
        }
    }
    text.push_str(&format!(" = {total}"));
    if let Some(against) = against {
        let kind = match against.kind {
            AgainstKind::Ac => "AC",
            AgainstKind::Dc => "DC",
        };
        text.push_str(&format!(" vs {kind} {}", against.value));
    }
    if outcome != RollOutcome::Value {
        text.push_str(&format!(", {}", outcome_word(outcome)));
    }
    text
}

/// `1d20 (14)`, `2d6 (3, 5)`, or with Advantage `2d20 (14, 6, kept 14)`.
fn die(die: &DiceRolled) -> String {
    let results = die
        .results
        .iter()
        .map(|r| r.to_string())
        .collect::<Vec<_>>()
        .join(", ");
    let sum: i64 = die.results.iter().map(|r| *r as i64).sum();
    if die.kept as i64 == sum {
        format!("{} ({results})", die.dice)
    } else {
        format!("{} ({results}, kept {})", die.dice, die.kept)
    }
}

/// The outcome as a reader says it.
pub fn outcome_word(outcome: RollOutcome) -> &'static str {
    match outcome {
        RollOutcome::Hit => "hit",
        RollOutcome::CriticalHit => "critical hit",
        RollOutcome::Miss => "miss",
        RollOutcome::Success => "success",
        RollOutcome::Failure => "failure",
        RollOutcome::Value => "",
    }
}

/// A roll kind as a reader says it.
pub fn roll_kind_word(kind: RollKind) -> &'static str {
    match kind {
        RollKind::Attack => "attack roll",
        RollKind::SavingThrow => "saving throw",
        RollKind::AbilityCheck => "ability check",
        RollKind::SkillCheck => "skill check",
        RollKind::Initiative => "initiative",
        RollKind::Damage => "damage",
        RollKind::Healing => "healing",
        RollKind::DeathSave => "death saving throw",
    }
}

/// `shield_of_faith` reads "Shield of Faith".
fn spell_name(spell: &str) -> String {
    crate::adapter::names::title(&spell.replace('_', " "))
}

/// `potion_of_healing` becomes `Potion of Healing`.
fn item_name(item: &str) -> String {
    crate::adapter::names::title(&item.replace('_', " "))
}

fn life_state(state: LifeState) -> &'static str {
    match state {
        LifeState::Conscious => "conscious",
        LifeState::Unconscious => "unconscious",
        LifeState::Stable => "stable",
        LifeState::Dead => "dead",
    }
}

fn side_word(side: Side) -> &'static str {
    match side {
        Side::Party => "party",
        Side::Hostile => "hostile",
        Side::Neutral => "neutral",
    }
}

fn mode_word(mode: Mode) -> &'static str {
    match mode {
        Mode::Explore => "explore",
        Mode::Combat => "combat",
    }
}

fn damage_word(kind: DamageType) -> String {
    snake_words(&kind)
}

/// The serde name of a unit enum value, with spaces: `SleightOfHand` reads `sleight of hand`.
fn snake_words(value: &impl serde::Serialize) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|v| v.as_str().map(|s| s.replace('_', " ")))
        .unwrap_or_default()
}

fn list(handles: &[Handle]) -> String {
    handles
        .iter()
        .map(|h| h.0.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}
