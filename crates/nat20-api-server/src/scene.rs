//! Scene files: reading them from the data directory and checking what their schema can't say
//! (ids that refer to each other, dice, DCs). The format is the contract's [`SceneFile`].
//!
//! A scene that fails any check here answers `bad_scene` and changes nothing.

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use nat20_api_contract::{
    ApiError, Consequence, EndCombatReason, ErrorCode, Placement, PointFt, SceneCreature,
    SceneFile, SurrenderTrigger,
};

use crate::{adapter::pregen, errors::error};

/// The terrain a scene uses when it names none.
pub const DEFAULT_MAP: &str = "flat_arena";

/// Reads `data_dir/scenes/<scene_id>.json` and checks it.
pub fn read(data_dir: &Path, scene_id: &str) -> Result<SceneFile, ApiError> {
    if !is_plain_name(scene_id) {
        return Err(error(
            ErrorCode::BadRequest,
            "scene_id must be a plain name of letters, digits, - and _.",
        ));
    }
    let path = data_dir.join("scenes").join(format!("{scene_id}.json"));
    let text = std::fs::read_to_string(&path).map_err(|_| {
        error(
            ErrorCode::BadScene,
            format!("There is no scene {scene_id}."),
        )
    })?;
    let scene: SceneFile = serde_json::from_str(&text).map_err(|e| {
        error(
            ErrorCode::BadScene,
            format!("Scene {scene_id} is not valid: {e}."),
        )
    })?;
    if scene.id != scene_id {
        return Err(error(
            ErrorCode::BadScene,
            format!("Scene file {scene_id} declares the id {}.", scene.id),
        ));
    }
    check(&scene, data_dir)?;
    Ok(scene)
}

/// Checks the cross-references and values a scene's schema can't express.
pub fn check(scene: &SceneFile, data_dir: &Path) -> Result<(), ApiError> {
    let bad = |message: String| Err(error(ErrorCode::BadScene, message));
    let ids = |what: &str, ids: Vec<&str>| -> Result<HashSet<String>, ApiError> {
        let mut seen = HashSet::new();
        for id in ids {
            if !is_plain_name(id) {
                return Err(error(
                    ErrorCode::BadScene,
                    format!(
                        "The {what} id {id:?} must be a plain name of letters, digits, - and _."
                    ),
                ));
            }
            if !seen.insert(id.to_owned()) {
                return Err(error(
                    ErrorCode::BadScene,
                    format!("The {what} id {id} is used twice."),
                ));
            }
        }
        Ok(seen)
    };

    if let Some(map) = &scene.map
        && !is_plain_name(map)
    {
        return bad(format!("The map {map:?} must be a plain name."));
    }
    if !map_path(scene.map.as_deref()).is_file() {
        return bad(format!(
            "There is no map {}.",
            scene.map.as_deref().unwrap_or(DEFAULT_MAP)
        ));
    }

    let anchors = ids(
        "anchor",
        scene.anchors.iter().map(|a| a.id.as_str()).collect(),
    )?;
    let hazards = ids(
        "hazard",
        scene.hazards.iter().map(|h| h.id.as_str()).collect(),
    )?;
    ids(
        "check",
        scene.checks.iter().map(|c| c.id.as_str()).collect(),
    )?;
    ids(
        "encounter",
        scene.encounters.iter().map(|e| e.id.as_str()).collect(),
    )?;
    ids(
        "spawn",
        scene.spawns.iter().map(|s| s.id.as_str()).collect(),
    )?;
    for anchor in &scene.party_start {
        if !anchors.contains(anchor) {
            return bad(format!("party_start names the unknown anchor {anchor}."));
        }
    }

    // Creatures placed on load and by spawns share one handle space.
    let all_creatures = scene
        .creatures
        .iter()
        .chain(scene.spawns.iter().flat_map(|s| s.creatures.iter()));
    let mut handles = HashSet::new();
    for creature in all_creatures {
        check_creature(creature, &anchors, data_dir)?;
        if !handles.insert(creature.handle.0.clone()) {
            return bad(format!("The handle {} is used twice.", creature.handle.0));
        }
    }
    for spawn in &scene.spawns {
        if spawn.creatures.is_empty() {
            return bad(format!("Spawn {} places no creature.", spawn.id));
        }
        if let nat20_api_contract::SpawnWhen::Flag { flag } = &spawn.when {
            check_flag(flag)?;
        }
        if let nat20_api_contract::SpawnWhen::Round { round: 0, .. } = &spawn.when {
            return bad(format!(
                "Spawn {} names round 0; rounds start at 1.",
                spawn.id
            ));
        }
    }

    for check in &scene.checks {
        check_dc(&check.id, check.dc)?;
        for consequence in check.on_success.iter().chain(&check.on_failure) {
            check_consequence(consequence, &hazards, true)?;
        }
    }
    for hazard in &scene.hazards {
        check_dc(&hazard.id, hazard.save.dc)?;
        for consequence in hazard.on_success.iter().chain(&hazard.on_failure) {
            check_consequence(consequence, &hazards, false)?;
        }
    }

    // A participant the scene doesn't define has to arrive with the party.
    let known = |handle: &str| handles.contains(handle);
    for encounter in &scene.encounters {
        let id = &encounter.id;
        if encounter.participants.is_empty() {
            return bad(format!("Encounter {id} has no participants."));
        }
        let mut seen = HashSet::new();
        for handle in &encounter.participants {
            check_handle(&handle.0)?;
            if !seen.insert(&handle.0) {
                return bad(format!("Encounter {id} lists {} twice.", handle.0));
            }
            if !known(&handle.0) && scene.party_start.is_empty() {
                return bad(format!(
                    "Encounter {id} names {}, which the scene doesn't define and no party is carried into (no party_start).",
                    handle.0
                ));
            }
        }
        if let Some(surprise) = &encounter.surprise {
            check_flag(&surprise.when_flag)?;
        }
        if let Some(surrender) = &encounter.surrender {
            if surrender.creatures.is_empty() || surrender.any_of.is_empty() {
                return bad(format!(
                    "Encounter {id}: a surrender condition needs creatures and at least one trigger."
                ));
            }
            for handle in &surrender.creatures {
                if !encounter.participants.contains(handle) {
                    return bad(format!(
                        "Encounter {id}: {} can surrender but is not a participant.",
                        handle.0
                    ));
                }
            }
            for trigger in &surrender.any_of {
                match trigger {
                    SurrenderTrigger::HpFractionAtMost { fraction }
                        if !(*fraction > 0.0 && *fraction < 1.0) =>
                    {
                        return bad(format!(
                            "Encounter {id}: hp_fraction_at_most must be above 0 and below 1, not {fraction}."
                        ));
                    }
                    SurrenderTrigger::LeaderDown { handle }
                        if !surrender.creatures.contains(handle) =>
                    {
                        return bad(format!(
                            "Encounter {id}: the leader {} is not one of the creatures that surrender.",
                            handle.0
                        ));
                    }
                    _ => {}
                }
            }
        }
        let mut reasons = HashSet::new();
        for reason in &encounter.end_reasons {
            if *reason == EndCombatReason::Surrender {
                return bad(format!(
                    "Encounter {id} lists surrender in end_reasons; declare a surrender condition instead."
                ));
            }
            if !reasons.insert(format!("{reason:?}")) {
                return bad(format!("Encounter {id} lists an end reason twice."));
            }
        }
    }
    Ok(())
}

/// Where a creature goes, in feet. The scene has been checked, so an anchor always exists.
pub fn position(scene: &SceneFile, at: &Placement) -> PointFt {
    match at {
        Placement::Point { point } => *point,
        Placement::Anchor { anchor } => {
            scene
                .anchors
                .iter()
                .find(|a| a.id == *anchor)
                .expect("anchors are checked when the scene is read")
                .position_ft
        }
    }
}

/// The terrain file for a scene's `map`.
/// Maps live in `maps/` at the repository root, shared with the rest of our content.
pub fn map_path(map: Option<&str>) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../maps")
        .join(format!("{}.obj", map.unwrap_or(DEFAULT_MAP)))
}

/// The stat block file for a monster id.
pub fn monster_path(data_dir: &Path, monster: &str) -> Result<PathBuf, ApiError> {
    if !monster
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(error(
            ErrorCode::BadScene,
            format!("{monster} is not a valid stat block id."),
        ));
    }
    Ok(data_dir.join("monsters").join(format!("{monster}.json")))
}

fn check_creature(
    creature: &SceneCreature,
    anchors: &HashSet<String>,
    data_dir: &Path,
) -> Result<(), ApiError> {
    let handle = &creature.handle.0;
    check_handle(handle)?;
    match (&creature.pregen, &creature.monster) {
        (Some(pregen), None) => {
            if !pregen::PREGENS.contains(&pregen.as_str()) {
                return Err(error(
                    ErrorCode::BadScene,
                    format!(
                        "There is no pregen {pregen}; known pregens: {}.",
                        pregen::PREGENS.join(", ")
                    ),
                ));
            }
        }
        (None, Some(monster)) => {
            if !monster_path(data_dir, monster)?.is_file() {
                return Err(error(
                    ErrorCode::BadScene,
                    format!("Stat block {monster}: there is no such stat block."),
                ));
            }
        }
        _ => {
            return Err(error(
                ErrorCode::BadScene,
                format!("{handle} needs exactly one of pregen or monster."),
            ));
        }
    }
    if let Placement::Anchor { anchor } = &creature.at
        && !anchors.contains(anchor)
    {
        return Err(error(
            ErrorCode::BadScene,
            format!("{handle} is placed at the unknown anchor {anchor}."),
        ));
    }
    Ok(())
}

/// A handle is a plain name and not `dm`, whether the scene defines the creature or it is
/// carried in, so a reference that could never resolve is refused up front.
fn check_handle(handle: &str) -> Result<(), ApiError> {
    if handle == "dm" || !is_plain_name(handle) {
        return Err(error(
            ErrorCode::BadScene,
            format!("{handle:?} cannot be a creature handle."),
        ));
    }
    Ok(())
}

fn check_consequence(
    consequence: &Consequence,
    hazards: &HashSet<String>,
    may_set_off_hazard: bool,
) -> Result<(), ApiError> {
    match consequence {
        Consequence::Flag { flag } => check_flag(flag),
        Consequence::Hazard { hazard_id } if !may_set_off_hazard => Err(error(
            ErrorCode::BadScene,
            format!("A hazard cannot set off another hazard ({hazard_id})."),
        )),
        Consequence::Hazard { hazard_id } if !hazards.contains(hazard_id) => Err(error(
            ErrorCode::BadScene,
            format!("A consequence names the unknown hazard {hazard_id}."),
        )),
        Consequence::Hazard { .. } => Ok(()),
        Consequence::Damage { dice, .. } if parse_dice(dice).is_none() => Err(error(
            ErrorCode::BadScene,
            format!(
                "The damage dice {dice:?} must look like 1d6 or 2d8+2, with a d4, d6, d8, d10, d12, d20 or d100."
            ),
        )),
        Consequence::Damage { .. } => Ok(()),
    }
}

fn check_flag(flag: &str) -> Result<(), ApiError> {
    if is_plain_name(flag) {
        Ok(())
    } else {
        Err(error(
            ErrorCode::BadScene,
            format!("The flag {flag:?} must be a plain name of letters, digits, - and _."),
        ))
    }
}

fn check_dc(id: &str, dc: u8) -> Result<(), ApiError> {
    if (1..=30).contains(&dc) {
        Ok(())
    } else {
        Err(error(
            ErrorCode::BadScene,
            format!("{id} has DC {dc}; a DC is 1 to 30."),
        ))
    }
}

/// `NdM` or `NdM+K`: count 1 to 20, a die the engine rolls (d4, d6, d8, d10, d12, d20 or
/// d100), bonus 0 to 100.
pub fn parse_dice(dice: &str) -> Option<(u32, u32, u32)> {
    let (count, rest) = dice.split_once('d')?;
    let (size, bonus) = match rest.split_once('+') {
        Some((size, bonus)) => (size, bonus),
        None => (rest, "0"),
    };
    let number = |s: &str| -> Option<u32> {
        if s.is_empty() || !s.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
        s.parse().ok()
    };
    let (count, size, bonus) = (number(count)?, number(size)?, number(bonus)?);
    ((1..=20).contains(&count) && [4, 6, 8, 10, 12, 20, 100].contains(&size) && bonus <= 100)
        .then_some((count, size, bonus))
}

fn is_plain_name(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn data_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("data")
    }

    /// Every scene the engine ships reads and passes the checks.
    #[test]
    fn every_shipped_scene_is_valid() {
        let mut read_any = false;
        for entry in std::fs::read_dir(data_dir().join("scenes")).unwrap() {
            let path = entry.unwrap().path();
            let id = path.file_stem().unwrap().to_string_lossy().to_string();
            read(&data_dir(), &id).unwrap_or_else(|e| panic!("{id}: {}", e.message));
            read_any = true;
        }
        assert!(read_any);
    }

    /// The scenes round-trip through the contract type without losing anything.
    #[test]
    fn shipped_scenes_round_trip() {
        for entry in std::fs::read_dir(data_dir().join("scenes")).unwrap() {
            let path = entry.unwrap().path();
            let text = std::fs::read_to_string(&path).unwrap();
            let value: serde_json::Value = serde_json::from_str(&text).unwrap();
            let scene: SceneFile = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(
                serde_json::to_value(&scene).unwrap(),
                value,
                "{}",
                path.display()
            );
        }
    }

    #[test]
    fn dice() {
        assert_eq!(parse_dice("1d6"), Some((1, 6, 0)));
        assert_eq!(parse_dice("2d8+2"), Some((2, 8, 2)));
        for bad in [
            "d6", "1d", "1d6+", "1d6-1", "0d6", "1d1", "1d3", "21d6", "1 d6", "1d6+x",
        ] {
            assert_eq!(parse_dice(bad), None, "{bad}");
        }
    }

    fn base() -> serde_json::Value {
        serde_json::json!({
            "id": "t",
            "anchors": [{"id": "gate", "name": "the gate", "position_ft": {"x_ft": 0, "y_ft": 0, "z_ft": 0}}],
            "creatures": [
                {"handle": "bren", "pregen": "fighter_l2", "side": "party", "control": "client", "at": {"kind": "anchor", "anchor": "gate"}},
                {"handle": "goblin", "monster": "goblin_warrior", "side": "hostile", "control": "scripted", "at": {"kind": "point", "point": {"x_ft": 5, "y_ft": 0, "z_ft": 0}}}
            ],
            "checks": [{"id": "look", "test": {"kind": "skill", "skill": "perception"}, "dc": 12,
                        "on_failure": [{"kind": "hazard", "hazard_id": "snare"}]}],
            "hazards": [{"id": "snare", "save": {"ability": "dexterity", "dc": 12},
                         "on_failure": [{"kind": "damage", "dice": "1d6", "damage_type": "piercing"}]}],
            "encounters": [{"id": "fight", "participants": ["bren", "goblin"],
                            "surrender": {"creatures": ["goblin"], "any_of": [{"kind": "standing_at_most", "count": 0}]}}],
            "spawns": [{"id": "more", "when": {"kind": "dm"}, "creatures": [
                {"handle": "goblin_2", "monster": "goblin_warrior", "side": "hostile", "control": "scripted", "at": {"kind": "anchor", "anchor": "gate"}}
            ]}]
        })
    }

    fn check_value(value: serde_json::Value) -> Result<(), String> {
        let scene: SceneFile = serde_json::from_value(value).map_err(|e| e.to_string())?;
        check(&scene, &data_dir()).map_err(|e| {
            assert_eq!(e.code, ErrorCode::BadScene);
            e.message
        })
    }

    #[test]
    fn the_base_scene_is_valid() {
        check_value(base()).unwrap();
    }

    /// Each broken scene is refused with a sentence naming what is wrong.
    #[test]
    fn broken_references_are_refused() {
        type Case = (&'static str, fn(&mut serde_json::Value), &'static str);
        let cases: Vec<Case> = vec![
            (
                "unknown anchor",
                |s| s["creatures"][0]["at"]["anchor"] = "moon".into(),
                "unknown anchor moon",
            ),
            (
                "duplicate handle",
                |s| s["spawns"][0]["creatures"][0]["handle"] = "goblin".into(),
                "handle goblin is used twice",
            ),
            (
                "unknown hazard",
                |s| s["checks"][0]["on_failure"][0]["hazard_id"] = "pit".into(),
                "unknown hazard pit",
            ),
            (
                "hazard chain",
                |s| {
                    s["hazards"][0]["on_failure"][0] =
                        serde_json::json!({"kind": "hazard", "hazard_id": "snare"})
                },
                "cannot set off another hazard",
            ),
            (
                "bad dice",
                |s| s["hazards"][0]["on_failure"][0]["dice"] = "1d".into(),
                "must look like 1d6",
            ),
            (
                "dc 0",
                |s| s["checks"][0]["dc"] = 0.into(),
                "a DC is 1 to 30",
            ),
            (
                "dc 31",
                |s| s["hazards"][0]["save"]["dc"] = 31.into(),
                "a DC is 1 to 30",
            ),
            (
                "unknown participant",
                |s| s["encounters"][0]["participants"][1] = "lia".into(),
                "names lia",
            ),
            (
                "surrenderer not in fight",
                |s| s["encounters"][0]["surrender"]["creatures"][0] = "goblin_2".into(),
                "not a participant",
            ),
            (
                "fraction 1",
                |s| {
                    s["encounters"][0]["surrender"]["any_of"][0] =
                        serde_json::json!({"kind": "hp_fraction_at_most", "fraction": 1.0})
                },
                "above 0 and below 1",
            ),
            (
                "leader not surrendering",
                |s| {
                    s["encounters"][0]["surrender"]["any_of"][0] =
                        serde_json::json!({"kind": "leader_down", "handle": "bren"})
                },
                "the leader bren",
            ),
            (
                "surrender as end reason",
                |s| s["encounters"][0]["end_reasons"] = serde_json::json!(["surrender"]),
                "declare a surrender condition",
            ),
            (
                "party_start anchor",
                |s| s["party_start"] = serde_json::json!(["moon"]),
                "unknown anchor moon",
            ),
            (
                "duplicate check",
                |s| {
                    let check = s["checks"][0].clone();
                    s["checks"].as_array_mut().unwrap().push(check);
                },
                "check id look is used twice",
            ),
            (
                "both sources",
                |s| s["creatures"][0]["monster"] = "goblin_warrior".into(),
                "exactly one of pregen or monster",
            ),
            (
                "unknown pregen",
                |s| s["creatures"][0]["pregen"] = "wizard_l9".into(),
                "no pregen wizard_l9",
            ),
            (
                "unknown monster",
                |s| s["creatures"][1]["monster"] = "dragon".into(),
                "Stat block dragon",
            ),
            (
                "round 0",
                |s| s["spawns"][0]["when"] = serde_json::json!({"kind": "round", "round": 0}),
                "round 0",
            ),
            ("unknown map", |s| s["map"] = "moon".into(), "no map moon"),
            (
                "flag name",
                |s| {
                    s["checks"][0]["on_success"] =
                        serde_json::json!([{"kind": "flag", "flag": "a b"}])
                },
                "flag \"a b\"",
            ),
        ];
        for (name, edit, expected) in cases {
            let mut scene = base();
            edit(&mut scene);
            let message = check_value(scene).expect_err(name);
            assert!(message.contains(expected), "{name}: {message}");
        }
    }

    /// A participant the scene doesn't define is fine once a party can be carried in.
    #[test]
    fn carried_participants_need_a_party_start() {
        let mut scene = base();
        scene["encounters"][0]["participants"][0] = "lia".into();
        assert!(check_value(scene.clone()).is_err());
        scene["party_start"] = serde_json::json!(["gate"]);
        check_value(scene).unwrap();
    }

    /// A carried participant still has to be a handle that could exist.
    #[test]
    fn carried_participants_must_be_valid_handles() {
        for bad in ["dm", "", "a/b"] {
            let mut scene = base();
            scene["party_start"] = serde_json::json!(["gate"]);
            scene["encounters"][0]["participants"][0] = bad.into();
            let message = check_value(scene).expect_err(bad);
            assert!(
                message.contains("cannot be a creature handle"),
                "{bad}: {message}"
            );
        }
    }

    /// Unknown fields are refused, so a typo can't silently drop a rule.
    #[test]
    fn unknown_fields_are_refused() {
        let mut scene = base();
        scene["checks"][0]["dcc"] = 12.into();
        assert!(
            check_value(scene)
                .unwrap_err()
                .contains("unknown field `dcc`")
        );
    }
}
