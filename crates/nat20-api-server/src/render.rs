//! Event text: one sentence per event, rendered from the event as the viewer sees it, so the
//! text can never carry a number the view type left out (CLAUDE.md Rule 3).

use nat20_api_contract::{
    AgainstKind, CardCame, CombatOverReason, ConcentrationEndReason, DamageType, DiceRolled,
    EventKind, Handle, LedgerGoods, LedgerReason, LifeState, Lodging, Mode, RollKind, RollOutcome,
    RollView, Side,
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
        EventKind::Fled { handles } => format!(
            "{} {}.",
            list(handles),
            if handles.len() == 1 { "flees" } else { "flee" }
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
        EventKind::ActionDropped { actor, name, .. } => {
            format!("{} moves but doesn't get to use {name}.", actor.0)
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
        EventKind::EffectStarted {
            target,
            name,
            source,
            ..
        } => {
            if target == source {
                format!("{} is under {}.", target.0, name)
            } else {
                format!("{} is under {} from {}.", target.0, name, source.0)
            }
        }
        EventKind::EffectEnded { target, name, .. } => {
            format!("{} is no longer under {}.", target.0, name)
        }
        EventKind::Ledger {
            from,
            to,
            what,
            reason,
            ..
        } => {
            let goods = goods_words(what);
            match reason {
                LedgerReason::Trade => format!("{from} gives {to} {goods}."),
                LedgerReason::Theft => format!("{to} steals {goods} from {from}, unseen."),
                LedgerReason::Loot => format!("{to} takes {goods} from {from}."),
                LedgerReason::Wage => format!("{from} pays {to} {goods} in wages."),
                LedgerReason::Toll => format!("{from} pays {goods} in toll."),
                LedgerReason::Inn => format!("{from} pays the inn {goods}."),
                LedgerReason::Reward => format!("{to} is rewarded with {goods}."),
            }
        }
        EventKind::TheftNoticed { thief, target } => {
            format!(
                "{} catches {} reaching for their things.",
                target.0, thief.0
            )
        }
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
        EventKind::CreaturePlaced { handle, .. } => format!("{} appears.", handle.0),
        EventKind::Traveled { leg } => {
            if leg.arrived {
                format!(
                    "The caravan travels {} miles along {} and arrives.",
                    leg.miles, leg.road
                )
            } else {
                format!(
                    "The caravan travels {} miles along {} and stops on the road for the day.",
                    leg.miles, leg.road
                )
            }
        }
        EventKind::PlaceDiscovered { name, .. } => format!("The party finds {name}."),
        EventKind::Night { night } => {
            let place = match night.lodging {
                Lodging::Inn => "at the inn",
                Lodging::Camp => "in camp",
            };
            format!(
                "The party spends the night {place}; {} wake rested.",
                if night.rested.is_empty() {
                    "none".to_string()
                } else {
                    night
                        .rested
                        .iter()
                        .map(|h| h.0.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                }
            )
        }
        EventKind::CardDrawn {
            card_text, choices, ..
        } => format!(
            "A road card: {card_text} ({})",
            choices
                .iter()
                .map(|c| c.text.as_str())
                .collect::<Vec<_>>()
                .join(" / ")
        ),
        EventKind::CardAdvice { actor, choice } => format!("{} says: {choice}.", actor.0),
        EventKind::CardResolved { choice, .. } => format!("The card is decided: {choice}."),
        EventKind::CargoChanged { good, change } => {
            if *change >= 0 {
                format!("The caravan gains {change} {good}.")
            } else {
                format!("The caravan loses {} {good}.", change.unsigned_abs())
            }
        }
        EventKind::TimeLost { minutes } => format!("The party loses {minutes} minutes."),
        EventKind::TimePassed { minutes, clock } => format!(
            "{minutes} minutes pass; it is day {}, {}.",
            clock.day,
            snake_words(&clock.watch)
        ),
        EventKind::CardsOffered { cards, .. } => {
            let ids: Vec<&str> = cards.iter().map(|c| c.id.as_str()).collect();
            format!("The road offers {}; the DM picks one.", ids.join(", "))
        }
        EventKind::CardPicked { card, came, .. } => match came {
            CardCame::DmPick => format!("The DM picks {card}."),
            CardCame::EnginePick => format!("The DM did not pick; the engine takes {card}."),
            CardCame::Soon => format!("{card} comes next, as an earlier choice set it."),
        },
        EventKind::CardShown { card, reads, .. } => {
            if reads.is_empty() {
                format!("{card} goes on the table.")
            } else {
                let deeds: Vec<&str> = reads.iter().map(|d| d.deed.as_str()).collect();
                format!("{card} goes on the table; it reads {}.", deeds.join(", "))
            }
        }
        EventKind::TripToStart { from, days } => match days {
            0 => format!("The new contract starts where the last one ended, at {from}."),
            1 => format!("The party travels one day from {from} to the new contract's start."),
            n => format!("The party travels {n} days from {from} to the new contract's start."),
        },
        EventKind::ScoutAhead { actor } => {
            format!("{} walks ahead of the caravan as the scout.", actor.0)
        }
        EventKind::ScoutLooked { actor, saw, .. } => {
            if *saw {
                format!("{} spots what waits ahead.", actor.0)
            } else {
                format!("{} looks ahead and misses what waits there.", actor.0)
            }
        }
        EventKind::DeedRemembered { deed, by, .. } => {
            if by.is_empty() {
                format!("The world remembers {deed}.")
            } else {
                let by: Vec<&str> = by.iter().map(|h| h.0.as_str()).collect();
                format!("The world remembers {deed}, by {}.", by.join(", "))
            }
        }
        EventKind::EscortSettled { destination } => {
            format!("The caravan reaches {destination}; the Blades are paid what they are owed.")
        }
        EventKind::XpAwarded {
            actor,
            xp,
            total,
            can_level_up,
        } => format!(
            "{} gains {xp} XP, {total} in all{}.",
            actor.0,
            if *can_level_up {
                ", enough for the next level"
            } else {
                ""
            }
        ),
        EventKind::LeveledUp { actor, level } => format!("{} reaches level {level}.", actor.0),
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
        RollKind::Table => "table roll",
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

/// Goods in words: coins as gold, silver and copper pieces (as a shopkeeper counts them), or an
/// item by name.
fn goods_words(what: &LedgerGoods) -> String {
    match what {
        LedgerGoods::Coins { copper } => {
            let (gp, sp, cp) = (copper / 100, copper % 100 / 10, copper % 10);
            let mut parts = Vec::new();
            for (n, word) in [(gp, "gold"), (sp, "silver"), (cp, "copper")] {
                if n > 0 {
                    parts.push(format!("{n} {word}"));
                }
            }
            let pieces = if gp + sp + cp == 1 { "piece" } else { "pieces" };
            format!("{} {pieces}", parts.join(", "))
        }
        LedgerGoods::Item { item, quantity } => {
            if *quantity == 1 {
                format!("a {}", item_name(item))
            } else {
                format!("{quantity} × {}", item_name(item))
            }
        }
    }
}
