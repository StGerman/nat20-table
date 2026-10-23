//! The leak scan of a game run (M6 spec §3.5, step 6, TASKS.md AGT-19): the agent-side twin of
//! the `visibility` job. The game writes every model input a player agent got, and everything
//! the human's seat was shown, to `inputs.jsonl` (`{seat, text, human?}`). Nothing in it may
//! carry what that seat's player may not know:
//! - anything `nat20_api_server::leaks` finds in JSON (another creature's HP or AC, `against`,
//!   `dc_source`, scenario data, DM-only events), including JSON inside a string;
//! - an AC or DC number in text (`vs AC 15`, `DC 12`);
//! - another creature's current Hit Points (`7/10 HP`, `has 7/10 Hit Points`);
//! - the text of a DM-only event (`Flag x is set.`, `bren's check fails.`) or its kind's name;
//! - a DM-only id of the scenario pack: a check, hazard, encounter, spawn, flag or monster stat
//!   block id.
//!
//! Lines the human typed (`human: true`) are skipped: they are the human's own. Ids that are plain
//! words (`rats`, `wolf`) can't be told from prose, so they are listed as not scanned instead.

use std::{collections::BTreeSet, fs, path::Path};

use nat20_api_contract::{Consequence, SceneCreature, SceneFile, SpawnWhen};
use nat20_api_server::leaks::{SCENARIO_EVENT_KINDS, json_leaks, names_a_target_number};
use serde::Deserialize;
use serde_json::Value;

/// One line of `inputs.jsonl`, as `game/src/table/state.ts` `recordInput` writes it.
#[derive(Debug, Clone, Deserialize)]
pub struct InputRecord {
    /// The character whose player got it: an AI player, or the human's character.
    pub seat: String,
    pub text: String,
    /// The human typed it.
    #[serde(default)]
    pub human: bool,
}

/// The DM-only ids of a scenario pack.
#[derive(Debug, Default)]
pub struct Secrets {
    /// Ids the scan looks for: those with an `_`, a digit or a `:` in them.
    pub ids: BTreeSet<String>,
    /// Plain-word ids the scan can't tell from prose.
    pub not_scanned: BTreeSet<String>,
}

impl Secrets {
    /// The DM-only ids of every scene in `pack/scenes/`.
    pub fn of_pack(pack: &Path) -> Result<Secrets, String> {
        let dir = pack.join("scenes");
        let mut paths: Vec<_> = fs::read_dir(&dir)
            .map_err(|error| format!("cannot read {}: {error}", dir.display()))?
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
            .collect();
        paths.sort();
        let scenes = paths
            .iter()
            .map(|path| {
                let text = fs::read_to_string(path)
                    .map_err(|error| format!("cannot read {}: {error}", path.display()))?;
                serde_json::from_str(&text)
                    .map_err(|error| format!("{} is not a scene: {error}", path.display()))
            })
            .collect::<Result<Vec<SceneFile>, String>>()?;
        Ok(Secrets::of_scenes(&scenes))
    }

    /// The DM-only ids of `scenes`: checks, hazards, encounters, spawns, flags and monster stat
    /// blocks, less any id a player is shown anyway (a scene, anchor or creature handle).
    pub fn of_scenes(scenes: &[SceneFile]) -> Secrets {
        let mut hidden = BTreeSet::new();
        let mut shown = BTreeSet::new();
        // A namespaced stat block (`nat20_demo::monster.mill_rat`) is named by its last part.
        let mut creature = |c: &SceneCreature, hidden: &mut BTreeSet<String>| {
            shown.insert(c.handle.0.clone());
            hidden.extend(
                c.monster
                    .as_deref()
                    .map(|id| id.rsplit(['.', ':']).next().unwrap_or(id).to_string()),
            );
        };
        for scene in scenes {
            for c in &scene.creatures {
                creature(c, &mut hidden);
            }
            let consequences = scene
                .checks
                .iter()
                .flat_map(|check| check.on_success.iter().chain(&check.on_failure))
                .chain(
                    scene
                        .hazards
                        .iter()
                        .flat_map(|hazard| hazard.on_success.iter().chain(&hazard.on_failure)),
                );
            for consequence in consequences {
                if let Consequence::Flag { flag } = consequence {
                    hidden.insert(flag.clone());
                }
            }
            hidden.extend(scene.checks.iter().map(|check| check.id.clone()));
            hidden.extend(scene.hazards.iter().map(|hazard| hazard.id.clone()));
            for encounter in &scene.encounters {
                hidden.insert(encounter.id.clone());
                hidden.extend(encounter.surprise.iter().map(|s| s.when_flag.clone()));
            }
            for spawn in &scene.spawns {
                hidden.insert(spawn.id.clone());
                if let SpawnWhen::Flag { flag } = &spawn.when {
                    hidden.insert(flag.clone());
                }
                for c in &spawn.creatures {
                    creature(c, &mut hidden);
                }
            }
        }
        for scene in scenes {
            shown.insert(scene.id.clone());
            shown.extend(scene.anchors.iter().map(|anchor| anchor.id.clone()));
        }
        let mut secrets = Secrets::default();
        for id in hidden.into_iter().filter(|id| !shown.contains(id)) {
            if id
                .chars()
                .any(|c| c == '_' || c == ':' || c.is_ascii_digit())
            {
                secrets.ids.insert(id);
            } else {
                secrets.not_scanned.insert(id);
            }
        }
        secrets
    }
}

/// What the scan read and found.
#[derive(Debug, Default)]
pub struct LeakReport {
    /// Inputs scanned.
    pub inputs: usize,
    /// The seats they went to.
    pub seats: BTreeSet<String>,
    /// Lines the human typed, skipped.
    pub human_lines: usize,
    pub leaks: Vec<String>,
}

impl LeakReport {
    pub fn passed(&self) -> bool {
        self.leaks.is_empty()
    }
}

/// Scans an `inputs.jsonl` for anything its seat's player may not know.
pub fn scan_inputs(inputs: &str, secrets: &Secrets) -> Result<LeakReport, String> {
    let mut report = LeakReport::default();
    for (index, line) in inputs.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let record: InputRecord = serde_json::from_str(line)
            .map_err(|error| format!("inputs line {}: {error}", index + 1))?;
        if record.human {
            report.human_lines += 1;
            continue;
        }
        report.inputs += 1;
        report.seats.insert(record.seat.clone());
        for leak in leaks_in(&record.seat, &record.text, secrets) {
            report.leaks.push(format!(
                "inputs line {} to {}: {leak}",
                index + 1,
                record.seat
            ));
        }
    }
    Ok(report)
}

/// Every leak in `text` given to the player of `seat`.
pub fn leaks_in(seat: &str, text: &str, secrets: &Secrets) -> Vec<String> {
    let mut found = Vec::new();
    match serde_json::from_str::<Value>(text) {
        Ok(value @ (Value::Object(_) | Value::Array(_))) => {
            found.extend(json_leaks(seat, &value));
            each_string(&value, &mut |text| {
                if text.trim_start().starts_with(['{', '[']) {
                    found.extend(leaks_in(seat, text, secrets));
                } else {
                    // `json_leaks` already reports AC and DC numbers in strings.
                    found.extend(text_leaks(seat, text, secrets, false));
                }
            });
        }
        _ => found.extend(text_leaks(seat, text, secrets, true)),
    }
    found
}

fn each_string(value: &Value, visit: &mut impl FnMut(&str)) {
    match value {
        Value::String(text) => visit(text),
        Value::Array(items) => items.iter().for_each(|item| each_string(item, visit)),
        Value::Object(map) => map.values().for_each(|item| each_string(item, visit)),
        _ => {}
    }
}

fn text_leaks(seat: &str, text: &str, secrets: &Secrets, target_numbers: bool) -> Vec<String> {
    let mut found = Vec::new();
    for line in text.lines() {
        if target_numbers && names_a_target_number(line) {
            found.push(format!("an AC or DC number: {line:?}"));
        }
        if shows_current_hp(line) && !about(seat, line) {
            found.push(format!("another creature's Hit Points: {line:?}"));
        }
        if (line.contains("Flag ") && line.contains(" is set."))
            || line.contains("'s check succeeds.")
            || line.contains("'s check fails.")
        {
            found.push(format!("a DM-only event: {line:?}"));
        }
        for token in tokens(line) {
            if secrets.ids.contains(token) {
                found.push(format!("the DM-only id {token}: {line:?}"));
            } else if token.contains('_') && SCENARIO_EVENT_KINDS.contains(&token) {
                found.push(format!("the DM-only event kind {token}: {line:?}"));
            }
        }
    }
    found
}

/// Ids, handles and words: runs of letters, digits, `_` and `:`, without `:` at either end.
fn tokens(line: &str) -> impl Iterator<Item = &str> {
    line.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == ':'))
        .map(|token| token.trim_matches(':'))
        .filter(|token| !token.is_empty())
}

/// `7/10 HP` or `7/10 Hit Points`: a creature's current Hit Points.
fn shows_current_hp(line: &str) -> bool {
    line.match_indices('/').any(|(at, _)| {
        let before = line[..at].chars().next_back();
        let after = &line[at + 1..];
        let digits = after.chars().take_while(char::is_ascii_digit).count();
        let rest = &after[digits..];
        before.is_some_and(|c| c.is_ascii_digit())
            && digits > 0
            && (rest.starts_with(" HP") || rest.starts_with(" Hit Points"))
    })
}

/// Whether the line is about the seat's own creature: `You: …` (the game's own line in its
/// state), or the engine's sentence about it (`bren has 12/20 Hit Points.`).
fn about(seat: &str, line: &str) -> bool {
    let line = line.trim_start();
    line.starts_with("You: ") || line.split(' ').next() == Some(seat)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secrets() -> Secrets {
        Secrets {
            ids: ["yard_fight", "reeve_insight", "goblin_warrior"]
                .map(String::from)
                .into(),
            not_scanned: BTreeSet::new(),
        }
    }

    #[test]
    fn what_a_player_may_know_passes() {
        for text in [
            "You: Maren (maren), 12/17 HP, conscious.\n- Goblin Warrior (goblin_1, hostile): bloodied, 30 ft away",
            "What happened:\nmaren has 12/17 Hit Points.\ngoblin_1 takes 5 slashing damage.\nbren regains 4 Hit Points.",
            "[r12] bren rolls an attack roll vs goblin_1: 1d20 (14) = 19, hit.",
            r#"{"kind":"engine","text":"maren has 12/17 Hit Points.","seq":40}"#,
            r#"{"handle":"maren","hp":12,"hp_max":17,"ac":18,"spellcasting":[{"save_dc":13}]}"#,
        ] {
            let found = leaks_in("maren", text, &secrets());
            assert!(found.is_empty(), "{text}: {found:?}");
        }
    }

    #[test]
    fn what_only_the_dm_or_another_owner_may_know_leaks() {
        for text in [
            "[r12] bren rolls an attack roll vs goblin_1: 1d20 (14) +5 = 19 vs AC 15, hit.",
            "The lock needs DC 12.",
            "- Goblin Warrior (goblin_1, hostile): 3/10 HP, AC 15",
            "torva has 9/23 Hit Points.",
            "Flag gate_open is set.",
            "bren's check fails.",
            "The DM starts yard_fight.",
            "It is a goblin_warrior.",
            "a check_resolved event",
            r#"{"kind":"info","title":"Sheet","text":"{\"handle\":\"torva\",\"hp\":9}"}"#,
            r#"{"kind":"engine","text":"torva has 9/23 Hit Points.","seq":40}"#,
            r#"{"roll":{"view":"full","against":{"kind":"ac","value":15}}}"#,
        ] {
            let found = leaks_in("maren", text, &secrets());
            assert!(!found.is_empty(), "{text} passed");
        }
    }

    #[test]
    fn handles_that_contain_an_id_are_not_the_id() {
        assert!(leaks_in("maren", "goblin_warrior_2 snarls.", &secrets()).is_empty());
    }

    #[test]
    fn the_humans_own_lines_are_skipped() {
        let inputs = concat!(
            r#"{"seat":"bren","text":"{\"kind\":\"text\",\"text\":\"Is it DC 15?\"}","human":true}"#,
            "\n",
            r#"{"seat":"bren","text":"{\"kind\":\"status\",\"text\":\"Your turn.\"}"}"#,
            "\n",
        );
        let report = scan_inputs(inputs, &secrets()).unwrap();
        assert!(report.passed(), "{:?}", report.leaks);
        assert_eq!((report.inputs, report.human_lines), (1, 1));
    }

    #[test]
    fn plain_word_ids_are_listed_not_scanned() {
        let scene: SceneFile = serde_json::from_str(
            r#"{"id":"cellar","description":"","anchors":[{"id":"cellar_stairs","name":"the stairs","position_ft":{"x_ft":0,"y_ft":0,"z_ft":0}}],
                "creatures":[{"handle":"rat_1","monster":"nat20_demo::monster.giant_rat","side":"hostile","control":"scripted","at":{"kind":"anchor","anchor":"cellar_stairs"}}],
                "spawns":[{"id":"rats","creatures":[],"when":{"kind":"dm"}},{"id":"cellar_stairs","creatures":[],"when":{"kind":"dm"}}]}"#,
        )
        .unwrap();
        let secrets = Secrets::of_scenes(&[scene]);
        assert_eq!(secrets.ids, BTreeSet::from(["giant_rat".to_string()]));
        assert_eq!(secrets.not_scanned, BTreeSet::from(["rats".to_string()]));
    }
}
