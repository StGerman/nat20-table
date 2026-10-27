//! The audit of a game run (M6 step 6, decision 0033, TASKS.md AGT-8 and AGT-15). The game
//! writes `transcript.jsonl` (every line any seat heard or wrote, with its channel) and
//! `session-log.jsonl` (the DM's view of the whole session log). Each transcript line is checked
//! against the log **projected for whoever hears that line**, so the human's screen is held to
//! the player roll view (`1d20 (14) = 19, hit`, no AC) and the DM's channel to the full view
//! (`1d20 (14) +5 = 19 vs AC 15, hit`). Nothing hidden is added to what the human saw to satisfy
//! the audit.
//!
//! It fails when:
//! - a line's `rolls` field doesn't list exactly the `[rN]` its text cites;
//! - a line cites a roll the log doesn't have, one its listener can't see, or one the engine
//!   logged after the line was written (its `log_head`);
//! - an engine line isn't the next event of the log, in order, as its listener sees it;
//! - any other line shows roll arithmetic without citing exactly one roll, or shows it other than
//!   as the engine's own summary of that roll for its listener;
//! - `log_head` goes backwards;
//! - (when `require_all`) a roll in the log is cited on no channel.
//!
//! Lines the human typed (`human: true`) are the human's own words, not the table's claims, and
//! are not audited.

use std::collections::{HashMap, HashSet};

use nat20_api_contract::{Event, EventKind, RollView};
use nat20_api_server::projection::{self, Viewer};
use serde::Deserialize;

use crate::audit::{AuditReport, citations, looks_like_roll, roll_id, shows_roll};

/// One line of a game transcript, as `game/src/table/transcript.ts` writes it. Only the fields
/// the audit reads; the game's `TranscriptRecord` type is the source of truth.
#[derive(Debug, Clone, Deserialize)]
pub struct TranscriptRecord {
    /// `dm`, a character handle, `engine` or `table` (the orchestrator).
    pub speaker: String,
    /// Who hears it: `table`, `dm`, `run`, `memory:dm`, `to:<handle>` or `notes:<handle>`.
    pub channel: String,
    /// `engine` for an engine event's own text; narration, speech and the rest otherwise.
    pub kind: String,
    pub text: String,
    /// The roll ids the text cites.
    pub rolls: Vec<String>,
    /// The session log's length when the line was written.
    pub log_head: u64,
    /// The human typed it.
    #[serde(default)]
    pub human: bool,
}

/// Who hears a transcript channel, and so which projection of the log it is held to.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Listener {
    /// `dm`, `memory:dm` and `run` (the orchestrator's bookkeeping): the full view.
    Dm,
    /// `table`: every seat, so only what every player may see.
    Table,
    /// `to:<handle>` and `notes:<handle>`: that creature's player.
    Seat(String),
}

impl Listener {
    /// The listener of `channel`, or `None` for a channel the game doesn't write.
    pub fn of(channel: &str) -> Option<Listener> {
        match channel {
            "dm" | "memory:dm" | "run" => Some(Listener::Dm),
            "table" => Some(Listener::Table),
            other => other
                .strip_prefix("to:")
                .or_else(|| other.strip_prefix("notes:"))
                .filter(|handle| !handle.is_empty())
                .map(|handle| Listener::Seat(handle.to_string())),
        }
    }

    /// The table is a player who owns nothing: it sees public events only, in the player view.
    fn viewer(&self) -> Viewer {
        match self {
            Listener::Dm => Viewer::Dm,
            Listener::Table => Viewer::Creature(String::new()),
            Listener::Seat(handle) => Viewer::Creature(handle.clone()),
        }
    }

    fn name(&self) -> &str {
        match self {
            Listener::Dm => "the DM",
            Listener::Table => "the table",
            Listener::Seat(handle) => handle,
        }
    }
}

/// The log as one listener sees it.
struct View {
    events: Vec<Event>,
    /// Each roll it sees, with the `seq` that logged it.
    rolls: HashMap<String, (RollView, u64)>,
}

impl View {
    fn of(listener: &Listener, log: &[Event]) -> View {
        let viewer = listener.viewer();
        let events: Vec<Event> = log
            .iter()
            .filter_map(|event| projection::event(&viewer, event))
            .collect();
        let rolls = events
            .iter()
            .filter_map(|event| match &event.kind {
                EventKind::Roll { roll } => {
                    Some((roll_id(roll).to_string(), (roll.clone(), event.seq)))
                }
                _ => None,
            })
            .collect();
        View { events, rolls }
    }
}

/// An event as the game writes it to the transcript: its text, after its roll id when it is a
/// roll (`game/src/view.ts` `eventLine`).
fn event_line(event: &Event) -> String {
    match &event.kind {
        EventKind::Roll { roll } => format!("[{}] {}", roll_id(roll), event.text),
        _ => event.text.clone(),
    }
}

/// Reads a `transcript.jsonl`.
pub fn read_transcript(text: &str) -> Result<Vec<TranscriptRecord>, String> {
    text.lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty())
        .map(|(index, line)| {
            serde_json::from_str(line)
                .map_err(|error| format!("transcript line {}: {error}", index + 1))
        })
        .collect()
}

/// Reads a `session-log.jsonl`: one event per line.
pub fn read_session_log(text: &str) -> Result<Vec<Event>, String> {
    text.lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty())
        .map(|(index, line)| {
            serde_json::from_str(line)
                .map_err(|error| format!("session log line {}: {error}", index + 1))
        })
        .collect()
}

/// Audits a game transcript against the DM's view of the session log (see the module docs).
pub fn audit_game(records: &[TranscriptRecord], log: &[Event], require_all: bool) -> AuditReport {
    let in_log: HashSet<String> = View::of(&Listener::Dm, log).rolls.into_keys().collect();
    let mut report = AuditReport {
        rolls_in_log: in_log.len(),
        ..Default::default()
    };
    let mut views: HashMap<Listener, View> = HashMap::new();
    // Where each channel's engine lines got to in its listener's events.
    let mut cursors: HashMap<&str, usize> = HashMap::new();
    let mut cited = HashSet::new();
    let mut head = 0;

    for (index, record) in records.iter().enumerate() {
        if record.human {
            continue;
        }
        let at = format!("line {} ({})", index + 1, record.channel);
        let mut problem = |what: String| report.problems.push(format!("{at}: {what}"));
        if record.log_head < head {
            problem(format!(
                "log_head goes back from {head} to {}",
                record.log_head
            ));
        }
        head = head.max(record.log_head);
        let Some(listener) = Listener::of(&record.channel) else {
            problem("no such channel".to_string());
            continue;
        };
        let view = views
            .entry(listener.clone())
            .or_insert_with(|| View::of(&listener, log));

        let ids = citations(&record.text);
        if ids != record.rolls {
            problem(format!(
                "rolls lists {:?}, the text cites {ids:?}",
                record.rolls
            ));
        }
        for id in &ids {
            match view.rolls.get(id) {
                Some((_, seq)) if *seq > record.log_head => problem(format!(
                    "cites {id}, which the engine logged later (seq {seq}, log_head {})",
                    record.log_head
                )),
                Some(_) => {
                    cited.insert(id.clone());
                }
                None if in_log.contains(id) => {
                    problem(format!("cites {id}, which {} can't see", listener.name()))
                }
                None => problem(format!("cites {id}, which is not in the engine log")),
            }
        }

        if record.kind == "engine" {
            // Genuine engine output for this listener, in log order, nothing written twice.
            let cursor = cursors.entry(record.channel.as_str()).or_default();
            match view.events[*cursor..]
                .iter()
                .position(|event| event_line(event) == record.text)
            {
                Some(offset) => {
                    let seq = view.events[*cursor + offset].seq;
                    if seq > record.log_head {
                        problem(format!(
                            "shows event {seq} before the engine logged it (log_head {})",
                            record.log_head
                        ));
                    }
                    *cursor += offset + 1;
                }
                None => problem(format!(
                    "{:?} is not the next engine event {} sees",
                    record.text,
                    listener.name()
                )),
            }
        } else if looks_like_roll(&record.text) {
            match ids.as_slice() {
                [id] => {
                    if let Some((roll, _)) = view.rolls.get(id)
                        && let Some(what) = shows_roll(&record.text, id, roll)
                    {
                        problem(what);
                    }
                }
                _ => problem(format!(
                    "shows roll arithmetic without citing exactly one roll: {}",
                    record.text
                )),
            }
        }
    }

    report.rolls_cited = cited.len();
    if require_all {
        let mut missing: Vec<&String> = in_log.iter().filter(|id| !cited.contains(*id)).collect();
        missing.sort_by_key(|id| id[1..].parse::<u64>().unwrap_or(0));
        for id in missing {
            report
                .problems
                .push(format!("engine roll {id} is cited on no channel"));
        }
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    use nat20_api_contract::{
        AdvantageState, Against, AgainstKind, DiceRolled, Handle, Modifier, RollId, RollKind,
        RollOutcome, Visibility,
    };
    use nat20_api_server::render;

    /// Bren's attack on the goblin, logged at seq 3: public, so every seat sees it.
    fn log() -> Vec<Event> {
        let kind = EventKind::Roll {
            roll: RollView::Full {
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
                advantage_sources: Vec::new(),
            },
        };
        vec![Event {
            seq: 3,
            round: Some(1),
            scene: Some("duel".into()),
            visibility: Visibility::Public,
            text: render::text(&kind),
            kind,
        }]
    }

    fn line(channel: &str, kind: &str, text: &str, log_head: u64) -> TranscriptRecord {
        TranscriptRecord {
            speaker: if kind == "engine" { "engine" } else { "dm" }.into(),
            channel: channel.into(),
            kind: kind.into(),
            text: text.into(),
            rolls: citations(text),
            log_head,
            human: false,
        }
    }

    const FULL: &str = "[r3] bren rolls an attack roll vs goblin: 1d20 (14) +5 = 19 vs AC 15, hit.";
    const PLAYER: &str = "[r3] bren rolls an attack roll vs goblin: 1d20 (14) = 19, hit.";

    #[test]
    fn the_humans_screen_is_held_to_the_player_view_and_the_dm_to_the_full_view() {
        // The regression this step exists for (D4): the line the human saw passes as it is.
        let report = audit_game(
            &[
                line("dm", "engine", FULL, 3),
                line("to:bren", "engine", PLAYER, 3),
            ],
            &log(),
            true,
        );
        assert!(report.passed(), "{:?}", report.problems);
        assert_eq!(report.rolls_cited, 1);
        // Each view on the other channel fails: the human never saw the AC, and the DM's line
        // must show the modifiers.
        for (channel, text) in [("to:bren", FULL), ("dm", PLAYER)] {
            let report = audit_game(&[line(channel, "engine", text, 3)], &log(), false);
            assert!(!report.passed(), "{text} passed on {channel}");
        }
    }

    #[test]
    fn narration_may_cite_a_roll_but_only_one_its_listener_saw_and_already_logged() {
        let cites = "[r3] The goblin reels.";
        assert!(audit_game(&[line("table", "narration", cites, 3)], &log(), false).passed());
        let early = audit_game(&[line("table", "narration", cites, 2)], &log(), false);
        assert!(
            early.problems[0].contains("logged later"),
            "{:?}",
            early.problems
        );
        let invented = audit_game(
            &[line("table", "narration", "[r9] Snap.", 3)],
            &log(),
            false,
        );
        assert!(invented.problems[0].contains("not in the engine log"));
        let mut owner_only = log();
        owner_only[0].visibility = Visibility::Owner {
            handle: Handle("bren".into()),
        };
        let hidden = audit_game(&[line("table", "narration", cites, 3)], &owner_only, false);
        assert!(
            hidden.problems[0].contains("the table can't see"),
            "{:?}",
            hidden.problems
        );
        assert!(
            audit_game(
                &[line("to:bren", "narration", cites, 3)],
                &owner_only,
                false
            )
            .passed()
        );
    }

    #[test]
    fn narration_that_shows_arithmetic_shows_the_engines_own() {
        let quoted = "[r3] The blade lands: 1d20 (14) = 19, hit.";
        assert!(audit_game(&[line("table", "narration", quoted, 3)], &log(), false).passed());
        for forged in [
            "[r3] The blade lands: 1d20 (17) = 19, hit.",
            "The blade lands: 1d20 (14) = 19, hit.",
            "[r3] The blade lands: 1d20 (14) +5 = 19 vs AC 15, hit.",
        ] {
            let report = audit_game(&[line("table", "narration", forged, 3)], &log(), false);
            assert!(!report.passed(), "{forged} passed");
        }
    }

    #[test]
    fn engine_lines_are_the_logs_own_in_order() {
        let invented = "goblin flees.";
        let report = audit_game(&[line("dm", "engine", invented, 3)], &log(), false);
        assert!(report.problems[0].contains("not the next engine event"));
        let twice = audit_game(
            &[line("dm", "engine", FULL, 3), line("dm", "engine", FULL, 3)],
            &log(),
            false,
        );
        assert_eq!(twice.problems.len(), 1, "{:?}", twice.problems);
    }

    #[test]
    fn bookkeeping_is_checked_too() {
        let mut wrong_rolls = line("dm", "engine", FULL, 3);
        wrong_rolls.rolls.clear();
        let report = audit_game(&[wrong_rolls], &log(), false);
        assert!(report.problems[0].contains("rolls lists"));
        let backwards = audit_game(
            &[line("run", "system", "a", 3), line("run", "system", "b", 2)],
            &log(),
            false,
        );
        assert!(backwards.problems[0].contains("log_head goes back"));
        let nowhere = audit_game(&[line("lobby", "system", "hi", 3)], &log(), false);
        assert!(nowhere.problems[0].contains("no such channel"));
        assert!(
            !audit_game(&[], &log(), true).passed(),
            "an uncited roll fails"
        );
    }

    #[test]
    fn the_humans_own_words_are_not_audited() {
        let mut typed = line("table", "speech", "I roll a d20 = 20!", 3);
        typed.human = true;
        assert!(audit_game(&[typed], &log(), false).passed());
    }
}
