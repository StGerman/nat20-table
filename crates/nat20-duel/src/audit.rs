//! Checks a transcript against the engine log: the demo's rule that every
//! roll a player sees must have come from the engine.
//!
//! A transcript cites a roll as `[r<seq>]` followed by the engine's own roll
//! summary, e.g. `[r12] ... 1d20 (14) +5 = 19 vs AC 15, hit`. The audit fails
//! when:
//! - a citation names a roll the log does not have,
//! - a line cites more than one roll,
//! - the line does not show the logged dice, modifiers, total, AC/DC and
//!   outcome exactly, or shows more arithmetic before or after them,
//! - a line shows roll arithmetic (dice such as `d20` or `1d6`, `= <n>`) without a citation,
//! - (when `require_all`) a roll in the log is never cited.

use std::collections::{HashMap, HashSet};

use nat20_api_contract::{AgainstKind, Event, EventKind, RollKind, RollOutcome, RollView};
use nat20_api_server::render::roll_summary;

#[derive(Debug, Default)]
pub struct AuditReport {
    pub rolls_in_log: usize,
    pub rolls_cited: usize,
    pub problems: Vec<String>,
}

impl AuditReport {
    pub fn passed(&self) -> bool {
        self.problems.is_empty()
    }
}

/// Audits `transcript` against the DM's view of the session log.
pub fn audit_transcript(transcript: &str, log: &[Event], require_all: bool) -> AuditReport {
    let rolls: HashMap<&str, &RollView> = log
        .iter()
        .filter_map(|e| match &e.kind {
            EventKind::Roll { roll } => Some(roll),
            _ => None,
        })
        .map(|r| (roll_id(r), r))
        .collect();
    let mut cited = HashSet::new();
    let mut report = AuditReport {
        rolls_in_log: rolls.len(),
        ..Default::default()
    };

    for (line_no, line) in transcript.lines().enumerate() {
        let line_no = line_no + 1;
        let ids = citations(line);
        let Some(id) = ids.first().cloned() else {
            if looks_like_roll(line) {
                report.problems.push(format!(
                    "line {line_no}: roll shown without an engine citation: {line}"
                ));
            }
            continue;
        };
        if ids.len() > 1 {
            report.problems.push(format!(
                "line {line_no}: cites {} rolls; cite one roll per line",
                ids.len()
            ));
            continue;
        }
        let Some(roll) = rolls.get(id.as_str()) else {
            report.problems.push(format!(
                "line {line_no}: cites {id}, which is not in the engine log"
            ));
            continue;
        };
        cited.insert(id.clone());
        // The line must show the engine's own arithmetic verbatim: dice,
        // kept die, modifiers, total, AC/DC and outcome. Anything else
        // (a changed die with the same total, a flipped outcome) fails.
        let summary = roll_summary(roll);
        let Some(at) = line.find(&summary) else {
            report.problems.push(format!(
                "line {line_no}: {id} does not show the engine's roll \"{summary}\""
            ));
            continue;
        };
        // Nothing else on the line may look like more arithmetic, before or after the summary.
        let rest = format!("{} {}", &line[..at], &line[at + summary.len()..]);
        if looks_like_roll(&rest) || rest.contains(" vs AC ") || rest.contains(" vs DC ") {
            report.problems.push(format!(
                "line {line_no}: {id} comes with extra roll arithmetic: {rest}"
            ));
        }
    }

    report.rolls_cited = cited.len();
    if require_all {
        let mut missing: Vec<&str> = rolls
            .keys()
            .copied()
            .filter(|id| !cited.contains(*id))
            .collect();
        missing.sort_by_key(|id| id[1..].parse::<usize>().unwrap_or(0));
        for id in missing {
            report
                .problems
                .push(format!("engine roll {id} never appears in the transcript"));
        }
    }
    report
}

/// Checks a logged roll is internally consistent: every die is within its size, and the total
/// is the dice that count plus the flat modifiers. Only a full view carries the modifiers, AC
/// and DC, so other views are refused.
pub fn check_roll_arithmetic(roll: &RollView) -> Result<(), String> {
    let RollView::Full {
        id,
        kind,
        dice,
        modifiers,
        total,
        against,
        outcome,
        ..
    } = roll
    else {
        return Err(format!(
            "{}: only a full roll view can be checked",
            roll_id(roll)
        ));
    };
    let id = &id.0;
    let mut sum = 0i64;
    for die in dice {
        let (count, size) = die
            .dice
            .split_once('d')
            .and_then(|(n, s)| Some((n.parse::<usize>().ok()?, s.parse::<u32>().ok()?)))
            .ok_or_else(|| format!("{id}: bad dice {}", die.dice))?;
        if die.results.len() != count {
            return Err(format!(
                "{id}: {} shows {} results",
                die.dice,
                die.results.len()
            ));
        }
        if let Some(bad) = die.results.iter().find(|r| **r < 1 || **r > size) {
            return Err(format!("{id}: {bad} is not a valid d{size} result"));
        }
        // `kept` is what the group counts: the sum of its dice, or with Advantage or
        // Disadvantage the one d20 that counted.
        let all: i64 = die.results.iter().map(|r| *r as i64).sum();
        let kept = die.kept as i64;
        if kept != all && !die.results.iter().any(|r| *r as i64 == kept) {
            return Err(format!("{id}: kept {kept} was never rolled"));
        }
        sum += kept;
    }
    sum += modifiers.iter().map(|m| m.value as i64).sum::<i64>();
    if sum != *total as i64 {
        return Err(format!(
            "{id}: dice and modifiers add to {sum}, total says {total}"
        ));
    }
    if let Some(against) = against {
        let natural = dice.first().map(|d| d.kept);
        let expected_success = match (kind, natural) {
            (RollKind::Attack, Some(20)) => true,
            (RollKind::Attack, Some(1)) => false,
            _ => *total >= against.value,
        };
        let success = matches!(
            outcome,
            RollOutcome::Hit | RollOutcome::CriticalHit | RollOutcome::Success
        );
        if success != expected_success {
            let against_kind = match against.kind {
                AgainstKind::Ac => "AC",
                AgainstKind::Dc => "DC",
            };
            return Err(format!(
                "{id}: {total} vs {against_kind} {} is marked {outcome:?}",
                against.value
            ));
        }
    } else if *outcome != RollOutcome::Value {
        return Err(format!("{id}: {outcome:?} with nothing to compare against"));
    }
    Ok(())
}

fn roll_id(roll: &RollView) -> &str {
    match roll {
        RollView::Full { id, .. } | RollView::Player { id, .. } => &id.0,
    }
}

/// Every `[r<digits>]` on the line, in order.
fn citations(line: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let mut rest = line;
    while let Some(start) = rest.find("[r") {
        rest = &rest[start + 2..];
        let Some(end) = rest.find(']') else { break };
        let digits = &rest[..end];
        if !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()) {
            ids.push(format!("r{digits}"));
            rest = &rest[end + 1..];
        }
    }
    ids
}

fn number_after(line: &str, marker: &str) -> Option<i32> {
    let start = line.find(marker)? + marker.len();
    let rest = &line[start..];
    let end = rest
        .char_indices()
        .find(|(i, c)| !(c.is_ascii_digit() || (*i == 0 && *c == '-')))
        .map(|(i, _)| i)
        .unwrap_or(rest.len());
    rest[..end].parse().ok()
}

fn looks_like_roll(line: &str) -> bool {
    // API request echo lines carry JSON, not results.
    if line.trim_start().starts_with("api>") {
        return false;
    }
    has_dice_notation(line) || number_after(line, " = ").is_some()
}

/// A whole word of dice notation such as `d20`, `1d6` or `2d10`, so that words and identifiers
/// that merely contain a `d` and digits do not count.
fn has_dice_notation(line: &str) -> bool {
    line.split(|c: char| !c.is_ascii_alphanumeric())
        .any(|word| {
            let Some((count, size)) = word.split_once('d') else {
                return false;
            };
            count.chars().all(|c| c.is_ascii_digit())
                && !size.is_empty()
                && size.chars().all(|c| c.is_ascii_digit())
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use nat20_api_contract::{
        AdvantageState, Against, DiceRolled, Handle, Modifier, RollId, Visibility,
    };

    fn roll() -> RollView {
        RollView::Full {
            id: RollId("r3".into()),
            kind: RollKind::Attack,
            label: "an attack roll vs goblin".into(),
            roller: Handle("bren".into()),
            target: Some(Handle("goblin".into())),
            dice: vec![DiceRolled {
                source: "d20".into(),
                dice: "1d20".into(),
                results: vec![14],
                kept: 14,
            }],
            modifiers: vec![Modifier {
                source: "longsword".into(),
                value: 5,
            }],
            total: 19,
            against: Some(Against {
                kind: AgainstKind::Ac,
                value: 15,
            }),
            outcome: RollOutcome::Hit,
            advantage: AdvantageState::Normal,
            dc_source: None,
        }
    }

    fn log_with_roll() -> Vec<Event> {
        vec![Event {
            seq: 3,
            round: Some(1),
            scene: Some("duel".into()),
            visibility: Visibility::Public,
            text: String::new(),
            kind: EventKind::Roll { roll: roll() },
        }]
    }

    #[test]
    fn accepts_matching_citation() {
        let report = audit_transcript(
            "[r3] Bren attacks: 1d20 (14) +5 = 19 vs AC 15, hit.",
            &log_with_roll(),
            true,
        );
        assert!(report.passed(), "{:?}", report.problems);
    }

    #[test]
    fn rejects_wrong_total_unknown_id_and_uncited_roll() {
        let transcript =
            "[r3] Bren attacks: = 20 vs AC 15\n[r9] = 4\nThe goblin rolls a d20 and gets 17.";
        let report = audit_transcript(transcript, &log_with_roll(), true);
        assert_eq!(report.problems.len(), 3, "{:?}", report.problems);
    }

    #[test]
    fn rejects_forged_dice_or_outcome_with_the_right_total() {
        for forged in [
            "[r3] Bren attacks: 1d20 (17) +2 = 19 vs AC 15, hit.",
            "[r3] Bren attacks: 1d20 (14) +5 = 19 vs AC 15, critical hit.",
            "[r3] Bren attacks: 1d20 (14) +5 = 19 vs AC 12, hit.",
        ] {
            let report = audit_transcript(forged, &log_with_roll(), true);
            assert!(!report.passed(), "{forged} passed");
        }
    }

    #[test]
    fn rejects_a_second_citation_or_extra_arithmetic_on_the_line() {
        for forged in [
            "[r3] Bren attacks: 1d20 (14) +5 = 19 vs AC 15, hit. [r999] = 99",
            "[r3] Bren attacks: 1d20 (14) +5 = 19 vs AC 15, hit. Then = 25.",
            "The goblin rolls d20 = 99. [r3] Bren attacks: 1d20 (14) +5 = 19 vs AC 15, hit.",
        ] {
            let report = audit_transcript(forged, &log_with_roll(), true);
            assert!(!report.passed(), "{forged} passed");
        }
    }

    #[test]
    fn rejects_uncited_dice_of_any_size_but_not_words() {
        let report = audit_transcript(
            "[r3] Bren attacks: 1d20 (14) +5 = 19 vs AC 15, hit.\nThe goblin rolls 1d6 and gets 6.\nSecond Wind: d10.",
            &log_with_roll(),
            true,
        );
        assert_eq!(report.problems.len(), 2, "{:?}", report.problems);
        let words = audit_transcript(
            "[r3] Bren attacks: 1d20 (14) +5 = 19 vs AC 15, hit.\nBren dodged; the goblin hid in room d.",
            &log_with_roll(),
            true,
        );
        assert!(words.passed(), "{:?}", words.problems);
    }

    #[test]
    fn rejects_missing_roll_when_required() {
        let report = audit_transcript("Bren swings.", &log_with_roll(), true);
        assert!(!report.passed());
    }

    #[test]
    fn arithmetic_accepts_the_engine_roll_and_rejects_forgeries() {
        assert_eq!(check_roll_arithmetic(&roll()), Ok(()));
        let mut wrong_total = roll();
        if let RollView::Full { total, .. } = &mut wrong_total {
            *total = 20;
        }
        assert!(check_roll_arithmetic(&wrong_total).is_err());
        let mut flipped = roll();
        if let RollView::Full { outcome, .. } = &mut flipped {
            *outcome = RollOutcome::Miss;
        }
        assert!(check_roll_arithmetic(&flipped).is_err());
        let mut impossible = roll();
        if let RollView::Full { dice, .. } = &mut impossible {
            dice[0].results = vec![21];
            dice[0].kept = 21;
        }
        assert!(check_roll_arithmetic(&impossible).is_err());
    }
}
