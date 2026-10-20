//! Engine API behaviour that is clearer as code than as a fixture transcript, played with
//! unseeded (engine-picked) dice so it holds for any rolls (a test whose path depends on the rolls uses `Api::seeded`): prompts and rejections in a live fight, legal actions, scene validation, one log across
//! scenes, the viewer projection and the stdio binary.

use std::{
    collections::HashSet,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use nat20_api_server::Server;
use serde_json::{Value, json};

struct Api {
    server: Server,
    next_id: u64,
}

impl Api {
    fn new(server: Server) -> Self {
        Self::start(server, json!({ "cmd": "new_session" }))
    }

    /// For a test whose path depends on the rolls: the same seed always plays the same fight.
    fn seeded(seed: u32) -> Self {
        Self::start(Server::new(), json!({ "cmd": "new_session", "seed": seed }))
    }

    fn start(server: Server, new_session: Value) -> Self {
        let mut api = Self { server, next_id: 0 };
        let started = api.call("dm", new_session);
        assert_eq!(started["ok"], true, "{started}");
        api
    }

    fn call(&mut self, viewer: &str, mut request: Value) -> Value {
        self.next_id += 1;
        request["v"] = json!(1);
        request["id"] = json!(format!("t-{}", self.next_id));
        request["viewer"] = json!(viewer);
        serde_json::from_str(&self.server.handle_line(&request.to_string())).unwrap()
    }

    /// Loads the duel scene and starts the fight; returns the `start_combat` response.
    fn start_duel(&mut self, viewer: &str) -> Value {
        let loaded = self.call(viewer, json!({ "cmd": "load_scene", "scene_id": "duel" }));
        assert_eq!(loaded["ok"], true, "{loaded}");
        let started = self.call(
            viewer,
            json!({ "cmd": "start_combat", "encounter_id": "duel" }),
        );
        assert_eq!(started["ok"], true, "{started}");
        started
    }
}

fn duel() -> Api {
    Api::new(Server::new())
}

/// A data folder with the Goblin Warrior stat block and the given scene files.
fn data_dir(name: &str, scenes: &[(&str, Value)]) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("nat20_table_{name}_{}", std::process::id()));
    std::fs::create_dir_all(dir.join("monsters")).unwrap();
    std::fs::create_dir_all(dir.join("scenes")).unwrap();
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("data/monsters/goblin_warrior.json");
    std::fs::copy(source, dir.join("monsters/goblin_warrior.json")).unwrap();
    for (id, scene) in scenes {
        std::fs::write(dir.join(format!("scenes/{id}.json")), scene.to_string()).unwrap();
    }
    dir
}

fn creature(handle: &str, kind: (&str, &str), side: &str, x_ft: f32) -> Value {
    let mut c = json!({
        "handle": handle, "side": side,
        "control": if kind.0 == "pregen" { "client" } else { "scripted" },
        "at": { "kind": "point", "point": { "x_ft": x_ft, "y_ft": 0.0, "z_ft": 0.0 } }
    });
    c[kind.0] = json!(kind.1);
    c
}

/// The DM's log keeps the hidden numbers every audit needs (protocol §6): AC or DC on every
/// attack, save and check, and where a DC came from.
fn assert_hidden_numbers_logged(events: &[Value]) {
    let mut checked = 0;
    for event in events.iter().filter(|e| e["kind"] == "roll") {
        let roll = &event["roll"];
        assert_eq!(roll["view"], "full", "{event}");
        let kind = roll["kind"].as_str().unwrap();
        let against = &roll["against"];
        match kind {
            "attack" => assert_eq!(against["kind"], "AC", "{event}"),
            "saving_throw" | "ability_check" | "skill_check" | "death_save" => {
                assert_eq!(against["kind"], "DC", "{event}");
                assert!(roll["dc_source"].is_string(), "{event}");
            }
            _ => assert!(against.is_null(), "{event}"),
        }
        if !against.is_null() {
            assert!(against["value"].is_u64(), "{event}");
            checked += 1;
        }
    }
    assert!(checked > 0, "no roll with an AC or DC in the log");
}

/// Every damage or healing event points at an earlier roll of the matching kind in the same
/// scene: never a later roll, a roll of another kind or one from the scene before.
fn assert_sources_cited(events: &[Value]) {
    for event in events
        .iter()
        .filter(|e| e["kind"] == "damage_taken" || e["kind"] == "healed")
    {
        let source = event["source_roll"].as_str().unwrap();
        let roll = events
            .iter()
            .find(|e| e["roll"]["id"] == source)
            .unwrap_or_else(|| panic!("{source} is not in the log: {event}"));
        let wanted = if event["kind"] == "healed" {
            "healing"
        } else {
            "damage"
        };
        assert_eq!(roll["roll"]["kind"], wanted, "{event} cites {roll}");
        assert!(roll["seq"].as_u64() < event["seq"].as_u64(), "{event}");
        assert_eq!(roll["scene"], event["scene"], "{event}");
    }
}

#[test]
fn invalid_decisions_get_readable_rejections() {
    let mut api = duel();
    let started = api.start_duel("dm");
    // Scripted goblin turns run inside the engine, so after start_combat it waits on Bren, or
    // the fight is already over.
    if started["awaiting"]["kind"] != "action" {
        return;
    }
    assert_eq!(started["awaiting"]["actor"], "bren");
    let prompt = started["awaiting"]["prompt_id"]
        .as_str()
        .unwrap()
        .to_owned();
    let head = started["log_head"].clone();

    let cases = [
        (
            json!({ "cmd": "submit", "actor": "goblin", "prompt_id": prompt, "option_id": "melee_attack/scimitar", "targets": ["bren"] }),
            "not_your_turn",
        ),
        (
            json!({ "cmd": "submit", "actor": "bren", "prompt_id": "p999", "option_id": "melee_attack/longsword", "targets": ["goblin"] }),
            "stale_prompt",
        ),
        (
            json!({ "cmd": "submit", "actor": "bren", "prompt_id": prompt, "option_id": "fireball", "targets": ["goblin"] }),
            "unknown_option",
        ),
        (
            json!({ "cmd": "submit", "actor": "bren", "prompt_id": prompt, "option_id": "melee_attack/longsword", "targets": ["dragon"] }),
            "unknown_creature",
        ),
        (
            json!({ "cmd": "submit", "actor": "bren", "prompt_id": prompt, "option_id": "melee_attack/longsword" }),
            "rejected",
        ),
        (
            // The prompt is Bren's action, not a reaction.
            json!({ "cmd": "react", "actor": "bren", "prompt_id": prompt, "choice": 0 }),
            "not_your_turn",
        ),
        (
            json!({ "cmd": "end_turn", "actor": "goblin", "prompt_id": prompt }),
            "not_your_turn",
        ),
        (
            json!({ "cmd": "start_combat", "encounter_id": "duel" }),
            "wrong_mode",
        ),
        (
            json!({ "cmd": "get_sheet", "actor": "ogre" }),
            "unknown_creature",
        ),
        (json!({ "cmd": "fly" }), "bad_request"),
    ];
    for (request, code) in cases {
        let response = api.call("dm", request.clone());
        assert_eq!(response["ok"], false, "{request} should fail: {response}");
        assert_eq!(response["error"]["code"], code, "{request}: {response}");
        let message = response["error"]["message"].as_str().unwrap();
        assert!(!message.is_empty() && !message.contains("::"), "{message}");
        // A rejection changes nothing.
        assert_eq!(response["events"], json!([]), "{request}");
        assert_eq!(response["log_head"], head, "{request}");
        if code != "bad_request" {
            assert_eq!(response["awaiting"]["prompt_id"], prompt, "{request}");
        }
        if code == "stale_prompt" {
            assert_eq!(
                response["error"]["hint"]["awaiting"]["prompt_id"], prompt,
                "{response}"
            );
        }
    }
}

#[test]
fn combat_commands_need_combat() {
    let mut api = duel();
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "duel" }));
    assert_eq!(loaded["result"]["state"]["mode"], "explore", "{loaded}");
    assert_eq!(loaded["awaiting"]["kind"], "none", "{loaded}");
    // Out of combat the options are those of a turn of Bren's own, with nothing pending.
    let legal = api.call("dm", json!({ "cmd": "legal_actions", "actor": "bren" }));
    assert_eq!(legal["result"]["prompt_id"], "", "{legal}");
    assert_eq!(legal["result"]["can_end_turn"], false, "{legal}");
    let unknown = api.call(
        "dm",
        json!({ "cmd": "start_combat", "encounter_id": "brawl" }),
    );
    assert_eq!(unknown["error"]["code"], "unknown_encounter", "{unknown}");
    assert_eq!(
        unknown["error"]["hint"]["known_ids"],
        json!(["duel"]),
        "{unknown}"
    );
    let guessed = api.call(
        "bren",
        json!({ "cmd": "start_combat", "encounter_id": "brawl" }),
    );
    assert_eq!(guessed["error"]["code"], "unknown_encounter", "{guessed}");
    assert!(guessed["error"].get("hint").is_none(), "{guessed}");
    let end = api.call("dm", json!({ "cmd": "end_combat", "reason": "surrender" }));
    assert_eq!(end["error"]["code"], "wrong_mode", "{end}");
}

#[test]
fn unsupported_inputs_say_not_implemented() {
    // A seed used to be unsupported; it is served now (API-11) and stays here as the setup.
    let mut api = Api::new(Server::new());
    let seeded = api.call("dm", json!({ "cmd": "new_session", "seed": 7 }));
    assert_eq!(seeded["result"]["seed"], 7, "{seeded}");
    // Party carry-over used to be unsupported; it is served now (API-5). Carrying a creature
    // that no scene has placed names an unknown creature.
    let party = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "duel", "party": ["bren"] }),
    );
    assert_eq!(party["error"]["code"], "unknown_creature", "{party}");
}

#[test]
fn an_accepted_decision_issues_a_new_prompt_and_retires_the_old_one() {
    let mut api = duel();
    let started = api.start_duel("dm");
    if started["awaiting"]["kind"] != "action" {
        return;
    }
    let prompt = started["awaiting"]["prompt_id"].clone();
    let attack = json!({ "cmd": "submit", "actor": "bren", "prompt_id": prompt, "option_id": "melee_attack/longsword", "targets": ["goblin"] });
    let first = api.call("dm", attack.clone());
    assert_eq!(first["ok"], true, "{first}");
    assert_ne!(first["awaiting"]["prompt_id"], prompt, "{first}");
    let again = api.call("dm", attack);
    // A first blow that ends the fight leaves nothing pending: wrong_mode, not stale_prompt.
    let expected = if first["awaiting"]["kind"] == "combat_over" {
        "wrong_mode"
    } else {
        "stale_prompt"
    };
    assert_eq!(again["error"]["code"], expected, "{again}");
}

#[test]
fn legal_actions_list_the_longsword_attack_on_the_goblin() {
    let mut api = duel();
    let started = api.start_duel("dm");
    if started["awaiting"]["kind"] != "action" {
        return; // the goblin won before Bren's first turn
    }
    let legal = api.call("bren", json!({ "cmd": "legal_actions", "actor": "bren" }));
    assert_eq!(legal["ok"], true, "{legal}");
    assert_eq!(
        legal["result"]["prompt_id"], started["awaiting"]["prompt_id"],
        "{legal}"
    );
    let options = legal["result"]["options"].as_array().unwrap();
    let attack = options
        .iter()
        .find(|o| o["option_id"] == "melee_attack/longsword")
        .unwrap_or_else(|| panic!("no longsword attack in {legal}"));
    assert_eq!(attack["name"], "Longsword attack");
    assert_eq!(attack["targeting"], "single");
    assert_eq!(attack["max_targets"], 1);
    assert_eq!(attack["cost"]["action"], 1, "{attack}");
    assert_eq!(attack["targets"][0]["handle"], "goblin");
    assert_eq!(attack["targets"][0]["side"], "hostile");
    assert_eq!(attack["targets"][0]["in_range"], true);
    let second_wind = options
        .iter()
        .find(|o| o["option_id"] == "fighter/second_wind")
        .unwrap_or_else(|| panic!("no Second Wind in {legal}"));
    assert_eq!(second_wind["targeting"], "self");
    assert_eq!(second_wind["cost"]["bonus_action"], 1, "{second_wind}");
    assert!(
        options
            .iter()
            .any(|o| o["option_id"] == "fighter/action_surge"),
        "{legal}"
    );
}

#[test]
fn bad_scenes_are_rejected_and_change_nothing() {
    let bren = creature("bren", ("pregen", "fighter_l2"), "party", 0.0);
    let goblin =
        |handle: &str, side: &str| creature(handle, ("monster", "goblin_warrior"), side, 5.0);
    let scene = |id: &str, creatures: Value| json!({ "id": id, "creatures": creatures });
    let cases = [
        ("empty", scene("empty", json!([]))),
        // Goblins share a faction, so one on the party side could never be attacked.
        (
            "turncoat",
            scene(
                "turncoat",
                json!([goblin("a", "party"), goblin("b", "hostile")]),
            ),
        ),
        // Bren is hostile to the goblin, so they cannot be on one side.
        (
            "allies",
            scene("allies", json!([bren, goblin("goblin", "party")])),
        ),
        (
            "twins",
            scene(
                "twins",
                json!([goblin("a", "hostile"), goblin("a", "hostile")]),
            ),
        ),
        (
            "ghost",
            scene(
                "ghost",
                json!([creature("x", ("pregen", "wizard_l9"), "party", 0.0)]),
            ),
        ),
        ("misnamed", scene("other", json!([goblin("a", "hostile")]))),
        ("broken", json!({ "id": "broken", "creatures": "none" })),
    ];
    let dir = data_dir("bad_scenes", &cases);
    for (id, _) in &cases {
        let mut api = Api::new(Server::with_data_dir(dir.clone()));
        let response = api.call("dm", json!({ "cmd": "load_scene", "scene_id": id }));
        assert_eq!(response["ok"], false, "{id}: {response}");
        assert_eq!(response["error"]["code"], "bad_scene", "{id}: {response}");
        let state = api.call("dm", json!({ "cmd": "get_state" }));
        assert_eq!(state["error"]["code"], "no_scene", "{state}");
    }
    let mut api = Api::new(Server::with_data_dir(dir.clone()));
    let missing = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "nowhere" }));
    assert_eq!(missing["error"]["code"], "bad_scene", "{missing}");
    let escape = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "../duel" }));
    assert_eq!(escape["error"]["code"], "bad_request", "{escape}");
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn monster_with_the_wrong_proficiency_bonus_is_rejected() {
    let dir = data_dir(
        "pb",
        &[(
            "pb",
            json!({ "id": "pb", "creatures": [
                creature("bren", ("pregen", "fighter_l2"), "party", 0.0),
                creature("goblin", ("monster", "bad_goblin"), "hostile", 5.0)
            ] }),
        )],
    );
    let mut goblin: Value = serde_json::from_str(
        &std::fs::read_to_string(dir.join("monsters/goblin_warrior.json")).unwrap(),
    )
    .unwrap();
    goblin["proficiency_bonus"] = json!(3);
    std::fs::write(dir.join("monsters/bad_goblin.json"), goblin.to_string()).unwrap();

    let mut api = Api::new(Server::with_data_dir(dir.clone()));
    let response = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "pb" }));
    // A player's view of the same error carries no stat-block numbers.
    let player = api.call("bren", json!({ "cmd": "load_scene", "scene_id": "pb" }));
    std::fs::remove_dir_all(dir).ok();
    assert_eq!(player["error"]["code"], "bad_scene", "{player}");
    let message = player["error"]["message"].as_str().unwrap();
    assert!(
        !message.contains("proficiency") && !message.chars().any(|c| c.is_ascii_digit()),
        "{player}"
    );
    assert_eq!(response["error"]["code"], "bad_scene", "{response}");
    assert!(
        response["error"]["message"]
            .as_str()
            .unwrap()
            .contains("proficiency_bonus"),
        "{response}"
    );
}

#[test]
fn a_second_scene_continues_the_same_log() {
    let mut api = duel();
    let first = api.start_duel("dm");
    // A running fight has to end before another scene loads; the refusal changes nothing.
    let refused = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "duel" }));
    assert_eq!(refused["error"]["code"], "wrong_mode", "{refused}");
    assert_eq!(refused["awaiting"], first["awaiting"], "{refused}");
    let (over, _) = fight_to_the_end(&mut api, first);
    let head = over["log_head"].as_u64().unwrap();
    let reload = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "duel" }));
    let events = reload["events"].as_array().unwrap();
    assert_eq!(events[0]["kind"], "scene_loaded", "{reload}");
    assert_eq!(events[0]["seq"].as_u64().unwrap(), head + 1, "{reload}");
    let second = api.call(
        "dm",
        json!({ "cmd": "start_combat", "encounter_id": "duel" }),
    );
    let initiative = second["events"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["roll"]["kind"] == "initiative")
        .count();
    assert_eq!(initiative, 2, "{second}");

    let log = api.call("dm", json!({ "cmd": "events", "since": 0 }));
    let events = log["result"]["events"].as_array().unwrap();
    let seqs: Vec<u64> = events.iter().map(|e| e["seq"].as_u64().unwrap()).collect();
    assert_eq!(seqs.first(), Some(&1));
    assert!(seqs.windows(2).all(|w| w[1] == w[0] + 1), "{seqs:?}");
    assert_eq!(log["result"]["next"], json!(seqs.last()));
    let ids: Vec<&str> = events
        .iter()
        .filter_map(|e| e["roll"]["id"].as_str())
        .collect();
    let unique: HashSet<_> = ids.iter().collect();
    assert_eq!(unique.len(), ids.len(), "roll ids repeat: {ids:?}");
    assert_sources_cited(events);
}

/// One engine per session: a carried creature keeps what the fight did to it, and every other
/// creature of the old scene is gone.
#[test]
fn a_carried_creature_keeps_its_hit_points() {
    let mut api = duel();
    let started = api.start_duel("dm");
    let (over, _) = fight_to_the_end(&mut api, started);
    assert_eq!(over["awaiting"]["kind"], "combat_over", "{over}");
    let before = api.call("dm", json!({ "cmd": "get_state" }));
    let bren = |state: &Value| -> Value {
        state["result"]["state"]["creatures"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["handle"] == "bren")
            .cloned()
            .unwrap_or(Value::Null)
    };
    let sheet_before = api.call("bren", json!({ "cmd": "get_sheet", "actor": "bren" }));
    assert_eq!(sheet_before["ok"], true, "{sheet_before}");
    let road = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "m3_s2_road", "party": ["bren"] }),
    );
    assert_eq!(road["ok"], true, "{road}");
    // Everything the sheet shows comes along: HP, resources, slots, equipment, death saves.
    let sheet_after = api.call("bren", json!({ "cmd": "get_sheet", "actor": "bren" }));
    assert_eq!(
        sheet_after["result"], sheet_before["result"],
        "{sheet_after}"
    );
    let creatures = road["result"]["state"]["creatures"].as_array().unwrap();
    assert_eq!(creatures.len(), 1, "only the party is carried: {road}");
    for field in ["hp", "hp_max", "temp_hp", "life_state", "health"] {
        assert_eq!(bren(&road)[field], bren(&before)[field], "{field}: {road}");
    }
    assert_eq!(
        bren(&road)["position_ft"],
        json!({ "x_ft": 0.0, "y_ft": 0.0, "z_ft": 0.0 }),
        "placed at road_start: {road}"
    );
    // The goblin left with its scene, so it can't be carried any more.
    let gone = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "m3_s4_prisoner", "party": ["bren", "goblin"] }),
    );
    assert_eq!(gone["error"]["code"], "unknown_creature", "{gone}");
}

/// Asking for sheets rolls nothing: the same seed plays the same fight with or without them.
#[test]
fn a_sheet_leaves_the_dice_alone() {
    let fight = |ask_for_sheets: bool| -> Value {
        let mut api = Api::seeded(5);
        let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "duel" }));
        assert_eq!(loaded["ok"], true, "{loaded}");
        if ask_for_sheets {
            for (viewer, actor) in [("bren", "bren"), ("dm", "goblin")] {
                let sheet = api.call(viewer, json!({ "cmd": "get_sheet", "actor": actor }));
                assert_eq!(sheet["ok"], true, "{sheet}");
                assert_eq!(sheet["events"], json!([]), "a sheet logs nothing: {sheet}");
            }
        }
        let started = api.call(
            "dm",
            json!({ "cmd": "start_combat", "encounter_id": "duel" }),
        );
        assert_eq!(started["ok"], true, "{started}");
        fight_to_the_end(&mut api, started);
        api.call("dm", json!({ "cmd": "events", "since": 0 }))["result"].clone()
    };
    let plain = fight(false);
    assert!(plain.to_string().contains("\"roll\""), "{plain}");
    assert_eq!(fight(true), plain);
}

/// A sheet lists the features class levels grant as actions, not only feats and effects.
#[test]
fn a_sheet_lists_class_features_granted_as_actions() {
    let mut api = duel();
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "duel" }));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let sheet = api.call("bren", json!({ "cmd": "get_sheet", "actor": "bren" }));
    let ids: Vec<&str> = sheet["result"]["sheet"]["features"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["id"].as_str().unwrap())
        .collect();
    for id in [
        "savage_attacker",
        "fighting_style.defense",
        "fighter.second_wind",
        "fighter.action_surge",
        "fighter.tactical_mind",
    ] {
        assert!(ids.contains(&id), "{id} missing: {sheet}");
    }
    // Generic actions every creature has are not features.
    assert!(
        !ids.iter().any(|id| id.ends_with("_attack")
            || id.starts_with("help")
            || ["dash", "disengage"].contains(id)),
        "{ids:?}"
    );
}

/// A sheet follows the fight: HP and life state match the state the DM sees.
#[test]
fn a_sheet_shows_the_hit_points_the_fight_left() {
    let mut api = Api::seeded(3);
    let started = api.start_duel("dm");
    fight_to_the_end(&mut api, started);
    let state = api.call("dm", json!({ "cmd": "get_state" }));
    for creature in state["result"]["state"]["creatures"].as_array().unwrap() {
        let handle = creature["handle"].as_str().unwrap();
        let sheet = api.call("dm", json!({ "cmd": "get_sheet", "actor": handle }));
        let sheet = &sheet["result"]["sheet"];
        for field in ["hp", "hp_max", "temp_hp", "ac", "life_state"] {
            assert_eq!(sheet[field], creature[field], "{handle} {field}: {sheet}");
        }
    }
}

/// A self-targeted option takes no targets; naming one is refused and spends nothing.
#[test]
fn a_self_targeted_option_refuses_targets() {
    let mut api = duel();
    let started = api.start_duel("dm");
    if started["awaiting"]["kind"] != "action" || started["awaiting"]["actor"] != "bren" {
        return;
    }
    let prompt = started["awaiting"]["prompt_id"].clone();
    let legal = api.call("dm", json!({ "cmd": "legal_actions", "actor": "bren" }));
    let options = legal["result"]["options"].as_array().unwrap();
    let own = options
        .iter()
        .find(|o| o["targeting"] == "self")
        .unwrap_or_else(|| panic!("no self-targeted option: {legal}"));
    assert_eq!(own["max_targets"], 0, "{own}");
    let head = legal["log_head"].clone();
    let refused = api.call(
        "dm",
        json!({ "cmd": "submit", "actor": "bren", "prompt_id": prompt, "option_id": own["option_id"], "targets": ["goblin"] }),
    );
    assert_eq!(refused["error"]["code"], "rejected", "{refused}");
    assert_eq!(refused["error"]["reason"], "invalid_target", "{refused}");
    assert_eq!(refused["log_head"], head, "{refused}");
    let again = api.call("dm", json!({ "cmd": "legal_actions", "actor": "bren" }));
    assert_eq!(
        again["result"]["options"], legal["result"]["options"],
        "{again}"
    );
}

/// A fight that ends by itself puts the scene back in explore mode: `combat_over` is reported
/// until the next scene command, `end_combat` has nothing to end, and `load_scene` reads `none`.
/// Plays the duel to its end from `last`, Bren attacking the goblin whenever he can.
/// Returns the last response and Bren's last prompt id.
fn fight_to_the_end(api: &mut Api, mut last: Value) -> (Value, Value) {
    let mut prompt = Value::Null;
    for _ in 0..200 {
        if last["awaiting"]["kind"] != "action" {
            break;
        }
        prompt = last["awaiting"]["prompt_id"].clone();
        let attack = api.call(
            "dm",
            json!({ "cmd": "submit", "actor": "bren", "prompt_id": prompt, "option_id": "melee_attack/longsword", "targets": ["goblin"] }),
        );
        last = if attack["ok"] == true {
            attack
        } else {
            api.call(
                "dm",
                json!({ "cmd": "end_turn", "actor": "bren", "prompt_id": prompt }),
            )
        };
    }
    (last, prompt)
}

#[test]
fn a_finished_fight_returns_the_scene_to_explore_mode() {
    let mut api = duel();
    let started = api.start_duel("dm");
    let (last, prompt) = fight_to_the_end(&mut api, started);
    assert_eq!(last["awaiting"]["kind"], "combat_over", "{last}");
    assert_eq!(last["awaiting"]["reason"], "side_down", "{last}");
    let over = last["events"]
        .as_array()
        .unwrap()
        .iter()
        .any(|e| e["kind"] == "combat_over");
    assert!(over, "{last}");
    let log = api.call("dm", json!({ "cmd": "events", "since": 0 }));
    let events = log["result"]["events"].as_array().unwrap();
    assert!(events.iter().any(|e| e["kind"] == "damage_taken"), "{log}");
    assert_sources_cited(events);
    assert_hidden_numbers_logged(events);

    // Combat commands after the fight answer wrong_mode, which is not retryable: nothing is
    // pending, so an agent must not loop on its last prompt.
    let late = api.call(
        "dm",
        json!({ "cmd": "end_turn", "actor": "bren", "prompt_id": prompt }),
    );
    assert_eq!(late["error"]["code"], "wrong_mode", "{late}");
    assert_eq!(late["error"]["retryable"], false, "{late}");
    let late_submit = api.call(
        "dm",
        json!({ "cmd": "submit", "actor": "bren", "prompt_id": prompt, "option_id": "melee_attack/longsword", "targets": ["goblin"] }),
    );
    assert_eq!(late_submit["error"]["code"], "wrong_mode", "{late_submit}");

    let state = api.call("dm", json!({ "cmd": "get_state" }));
    assert_eq!(state["result"]["state"]["mode"], "explore", "{state}");
    assert_eq!(state["awaiting"]["kind"], "combat_over", "{state}");
    let end = api.call("dm", json!({ "cmd": "end_combat", "reason": "surrender" }));
    assert_eq!(end["error"]["code"], "wrong_mode", "{end}");
    // Back in explore mode, legal_actions lists a turn of Bren's own; nothing is pending.
    let legal = api.call("dm", json!({ "cmd": "legal_actions", "actor": "bren" }));
    assert_eq!(legal["result"]["prompt_id"], "", "{legal}");
    assert_eq!(legal["awaiting"]["kind"], "combat_over", "{legal}");

    let reload = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "duel" }));
    assert_eq!(reload["ok"], true, "{reload}");
    assert_eq!(reload["result"]["state"]["mode"], "explore", "{reload}");
    assert_eq!(reload["awaiting"]["kind"], "none", "{reload}");
}

/// Plays the duel as Bren's own agent would: every request carries `viewer: "bren"`.
/// Nothing Bren's player may not know appears anywhere in what Bren receives.
#[test]
fn a_player_never_sees_hidden_numbers() {
    for _ in 0..10 {
        let mut api = duel();
        let mut seen = vec![api.start_duel("bren")];
        for _ in 0..60 {
            let last = seen.last().unwrap();
            if last["awaiting"]["kind"] != "action" {
                break;
            }
            let prompt = last["awaiting"]["prompt_id"].clone();
            let attack = api.call(
                "bren",
                json!({ "cmd": "submit", "actor": "bren", "prompt_id": prompt, "option_id": "melee_attack/longsword", "targets": ["goblin"] }),
            );
            let next = if attack["ok"] == true {
                attack
            } else {
                api.call(
                    "bren",
                    json!({ "cmd": "end_turn", "actor": "bren", "prompt_id": prompt }),
                )
            };
            seen.push(next);
        }
        seen.push(api.call("bren", json!({ "cmd": "get_state" })));
        seen.push(api.call("bren", json!({ "cmd": "events", "since": 0 })));

        for response in &seen {
            assert_eq!(response["ok"], true, "{response}");
            let state = &response["result"]["state"];
            if state.is_object() {
                assert_eq!(state["view"], "player", "{state}");
                assert_eq!(state["me"]["handle"], "bren", "{state}");
                for other in state["others"].as_array().unwrap() {
                    for hidden in ["hp", "hp_max", "temp_hp", "ac"] {
                        assert!(other.get(hidden).is_none(), "{other}");
                    }
                }
            }
            let events = response["events"]
                .as_array()
                .into_iter()
                .chain(response["result"]["events"].as_array())
                .flatten();
            for event in events {
                let text = event["text"].as_str().unwrap();
                assert!(
                    !text.contains(" vs AC ") && !text.contains(" vs DC "),
                    "{text}"
                );
                assert_ne!(event["visibility"]["scope"], "dm", "{event}");
                let roll = &event["roll"];
                if roll.is_object() {
                    assert_eq!(roll["view"], "player", "{event}");
                    for hidden in ["modifiers", "against", "dc_source"] {
                        assert!(roll.get(hidden).is_none(), "{event}");
                    }
                }
                if event["kind"] == "hit_points" {
                    assert_eq!(event["target"], "bren", "{event}");
                }
            }
        }
    }
}

#[test]
fn stdio_binary_speaks_json_lines() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_nat20-api-server"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    {
        let stdin = child.stdin.as_mut().unwrap();
        for line in [
            r#"{"v":1,"id":"a","viewer":"dm","cmd":"new_session"}"#,
            r#"{"v":1,"id":"b","viewer":"dm","cmd":"load_scene","scene_id":"duel"}"#,
            r#"{"v":1,"id":"c","viewer":"dm","cmd":"start_combat","encounter_id":"duel"}"#,
            r#"{"v":1,"id":"d","viewer":"dm","cmd":"events","since":0}"#,
        ] {
            writeln!(stdin, "{line}").unwrap();
        }
    }
    let output = child.wait_with_output().unwrap();
    let lines: Vec<Value> = String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines.len(), 4);
    assert!(lines.iter().all(|l| l["ok"] == true), "{lines:?}");
    let events = lines[3]["result"]["events"].as_array().unwrap();
    assert!(events.iter().any(|e| e["roll"]["kind"] == "initiative"));
}

#[test]
fn an_explore_move_walks_the_route_for_free() {
    let mut api = duel();
    let loaded = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "m3_s1_green" }),
    );
    assert_eq!(loaded["ok"], true, "{loaded}");
    let to_porch = json!({ "cmd": "move", "actor": "bren",
        "to": { "kind": "anchor", "anchor": "reeve_porch" } });
    for _ in 0..3 {
        // No movement is spent outside combat, so the same walk works again and again.
        let moved = api.call("dm", to_porch.clone());
        assert_eq!(moved["ok"], true, "{moved}");
        let back = api.call(
            "dm",
            json!({ "cmd": "move", "actor": "bren",
            "to": { "kind": "anchor", "anchor": "green_well" } }),
        );
        assert_eq!(back["result"]["moved_ft"], 22.4, "{back}");
    }
    let moved = api.call("dm", to_porch);
    assert_eq!(moved["result"]["provoked"], json!([]), "{moved}");
    let state = api.call("bren", json!({ "cmd": "get_state" }));
    let state = &state["result"]["state"];
    assert_eq!(state["me"]["position_ft"]["x_ft"], 20.0, "{state}");
    assert_eq!(state["me"]["position_ft"]["y_ft"], 10.0, "{state}");
    let porch = &state["anchors"][1];
    assert_eq!(porch["id"], "reeve_porch", "{state}");
    assert_eq!(porch["distance_ft"], 0.0, "{state}");
    // The move is public: the player reads it in the log.
    let events = api.call("bren", json!({ "cmd": "events", "since": 0 }));
    let moved: Vec<&Value> = events["result"]["events"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["kind"] == "moved")
        .collect();
    assert_eq!(moved.len(), 7, "{events}");
    assert_eq!(moved[6]["anchor"], "reeve_porch", "{events}");
}

#[test]
fn a_combat_move_spends_movement_and_provokes() {
    // Seed 3 (as in explore.jsonl): Bren acts first and survives the opportunity attack.
    let mut api = Api::seeded(3);
    let started = api.start_duel("dm");
    let prompt = started["awaiting"]["prompt_id"].clone();
    assert_eq!(started["awaiting"]["actor"], "bren", "{started}");
    let away = |prompt: &Value| {
        json!({ "cmd": "move", "actor": "bren", "prompt_id": prompt,
            "to": { "kind": "point", "point": { "x_ft": -20.0, "y_ft": 0.0, "z_ft": 0.0 } } })
    };
    // Leaving the goblin's reach gives it an opportunity attack, which stops Bren where he left.
    let moved = api.call("bren", away(&prompt));
    assert_eq!(moved["ok"], true, "{moved}");
    assert_eq!(moved["result"]["provoked"], json!(["goblin"]), "{moved}");
    let spent = moved["result"]["moved_ft"].as_f64().unwrap();
    assert!(spent > 0.0 && spent < 5.0, "{moved}");
    // A route longer than the movement left is refused and moves nobody.
    let prompt = moved["awaiting"]["prompt_id"].clone();
    let far = api.call(
        "bren",
        json!({ "cmd": "move", "actor": "bren", "prompt_id": prompt,
        "to": { "kind": "point", "point": { "x_ft": -60.0, "y_ft": 0.0, "z_ft": 0.0 } } }),
    );
    assert_eq!(far["error"]["reason"], "insufficient_resource", "{far}");
    // The rest of the movement still takes him on.
    let rest = api.call("bren", away(&prompt));
    assert_eq!(rest["ok"], true, "{rest}");
    assert_eq!(rest["result"]["provoked"], json!([]), "{rest}");
    assert!(
        spent + rest["result"]["moved_ft"].as_f64().unwrap() <= 30.0,
        "{rest}"
    );
}

#[test]
fn moves_after_a_finished_fight_stay_in_explore_mode() {
    let mut api = duel();
    let started = api.start_duel("dm");
    let (over, _) = fight_to_the_end(&mut api, started);
    assert_eq!(over["awaiting"]["kind"], "combat_over", "{over}");
    let standing = if over["awaiting"]["winner"] == "party" {
        "bren"
    } else {
        "goblin"
    };
    // The first move closes `combat_over`; neither it nor the next brings combat back.
    for x_ft in [-10.0, -20.0] {
        let moved = api.call(
            "dm",
            json!({ "cmd": "move", "actor": standing,
            "to": { "kind": "point", "point": { "x_ft": x_ft, "y_ft": 0.0, "z_ft": 0.0 } } }),
        );
        assert_eq!(moved["ok"], true, "{moved}");
        assert_eq!(moved["awaiting"]["kind"], "none", "{moved}");
        let state = api.call("dm", json!({ "cmd": "get_state" }));
        assert_eq!(state["result"]["state"]["mode"], "explore", "{state}");
    }
    let again = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "duel" }));
    assert_eq!(again["ok"], true, "{again}");
}

/// Loads the road scene with Bren carried in from the green.
fn road(api: &mut Api) {
    let green = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "m3_s1_green" }),
    );
    assert_eq!(green["ok"], true, "{green}");
    let road = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "m3_s2_road", "party": ["bren"] }),
    );
    assert_eq!(road["ok"], true, "{road}");
}

#[test]
fn explore_checks_log_their_dc_and_cite_their_rolls() {
    let mut api = duel();
    road(&mut api);
    for check in [
        json!({ "kind": "scenario", "check_id": "find_tracks" }),
        json!({ "kind": "scenario", "check_id": "spot_lookouts" }),
        json!({ "kind": "ladder", "ability": "strength", "skill": "athletics", "dc": 15 }),
    ] {
        let rolled = api.call(
            "dm",
            json!({ "cmd": "request_check", "actor": "bren", "check": check }),
        );
        assert_eq!(rolled["ok"], true, "{rolled}");
        let result = &rolled["result"];
        let events = rolled["events"].as_array().unwrap();
        let roll = events
            .iter()
            .find(|e| e["roll"]["id"] == result["roll_id"])
            .unwrap_or_else(|| panic!("the result's roll is not in its events: {rolled}"));
        assert_eq!(roll["roll"]["total"], result["total"], "{rolled}");
        let resolved = events
            .iter()
            .find(|e| e["kind"] == "check_resolved")
            .unwrap_or_else(|| panic!("no check_resolved: {rolled}"));
        assert_eq!(resolved["roll_id"], result["roll_id"], "{rolled}");
        assert_eq!(resolved["success"], result["success"], "{rolled}");
        assert_eq!(resolved["visibility"]["scope"], "dm", "{rolled}");
        let source = if check["kind"] == "ladder" {
            "ladder"
        } else {
            "scenario"
        };
        assert_eq!(roll["roll"]["dc_source"], source, "{rolled}");
    }
    let log = api.call("dm", json!({ "cmd": "events", "since": 0 }));
    let events = log["result"]["events"].as_array().unwrap();
    assert_hidden_numbers_logged(events);
    assert_sources_cited(events);
}

/// SRD 5.2.1 "D20 Tests" step 6: a check is decided by its total. A natural 20 or 1 decides
/// only attack rolls (and death saves), so it never beats or misses a check's DC on its own.
#[test]
fn a_natural_20_or_1_does_not_decide_a_check() {
    let mut api = Api::seeded(1);
    road(&mut api);
    for (natural, dc, success) in [(20, 30, false), (1, 5, true)] {
        let check =
            json!({ "kind": "ladder", "ability": "strength", "skill": "athletics", "dc": dc });
        let mut seen = false;
        for _ in 0..1000 {
            let rolled = api.call(
                "dm",
                json!({ "cmd": "request_check", "actor": "bren", "check": check }),
            );
            assert_eq!(rolled["ok"], true, "{rolled}");
            let roll = rolled["events"]
                .as_array()
                .unwrap()
                .iter()
                .find(|e| e["roll"]["id"] == rolled["result"]["roll_id"])
                .unwrap();
            if roll["roll"]["dice"][0]["kept"] == natural {
                assert_eq!(rolled["result"]["success"], success, "{rolled}");
                seen = true;
                break;
            }
        }
        assert!(seen, "no natural {natural} in 1000 checks");
    }
}

#[test]
fn a_refused_check_rolls_nothing() {
    let mut api = duel();
    road(&mut api);
    let first = api.call(
        "dm",
        json!({ "cmd": "request_check", "actor": "bren", "check": { "kind": "scenario", "check_id": "spot_lookouts" } }),
    );
    assert_eq!(first["ok"], true, "{first}");
    let head = first["log_head"].clone();
    for (check, code) in [
        (
            json!({ "kind": "scenario", "check_id": "spot_lookouts" }),
            "rejected",
        ),
        (
            json!({ "kind": "scenario", "check_id": "nothing_here" }),
            "unknown_check",
        ),
        (
            json!({ "kind": "ladder", "ability": "wisdom", "skill": "perception", "dc": 13 }),
            "bad_request",
        ),
    ] {
        let refused = api.call(
            "dm",
            json!({ "cmd": "request_check", "actor": "bren", "check": check }),
        );
        assert_eq!(refused["error"]["code"], code, "{refused}");
        assert_eq!(refused["log_head"], head, "{refused}");
    }
    let state = api.call("dm", json!({ "cmd": "get_state" }));
    let checks = state["result"]["state"]["checks"].as_array().unwrap();
    let rolled: Vec<&Value> = checks.iter().filter(|c| c["rolled"] == true).collect();
    assert_eq!(rolled.len(), 1, "{state}");
    assert_eq!(rolled[0]["id"], "spot_lookouts", "{state}");
}

#[test]
fn a_check_needs_explore_mode_and_a_conscious_creature() {
    let mut api = duel();
    let mut last = api.start_duel("dm");
    let ladder = json!({ "kind": "ladder", "ability": "strength", "skill": "athletics", "dc": 10 });
    let in_combat = api.call(
        "dm",
        json!({ "cmd": "request_check", "actor": "bren", "check": ladder }),
    );
    assert_eq!(in_combat["error"]["code"], "not_implemented", "{in_combat}");
    // Bren never attacks, so the goblin wins.
    for _ in 0..200 {
        if last["awaiting"]["kind"] != "action" {
            break;
        }
        let prompt = last["awaiting"]["prompt_id"].clone();
        last = api.call(
            "dm",
            json!({ "cmd": "end_turn", "actor": "bren", "prompt_id": prompt }),
        );
    }
    assert_eq!(last["awaiting"]["winner"], "hostile", "{last}");
    let down = api.call(
        "dm",
        json!({ "cmd": "request_check", "actor": "bren", "check": ladder }),
    );
    assert_eq!(down["error"]["code"], "rejected", "{down}");
    assert_eq!(down["error"]["reason"], "condition_prevents", "{down}");
}

#[test]
fn a_check_after_a_fight_closes_its_combat_over() {
    let mut api = duel();
    let started = api.start_duel("dm");
    let (last, _) = fight_to_the_end(&mut api, started);
    assert_eq!(last["awaiting"]["kind"], "combat_over", "{last}");
    // The session is unseeded, so either side can win; the survivor makes the checks.
    let standing = if last["awaiting"]["winner"] == "party" {
        "bren"
    } else {
        "goblin"
    };
    let refused = api.call(
        "dm",
        json!({ "cmd": "request_check", "actor": standing, "check": { "kind": "ladder", "ability": "strength", "skill": "athletics", "dc": 12 } }),
    );
    assert_eq!(refused["error"]["code"], "bad_request", "{refused}");
    assert_eq!(refused["awaiting"]["kind"], "combat_over", "{refused}");
    let rolled = api.call(
        "dm",
        json!({ "cmd": "request_check", "actor": standing, "check": { "kind": "ladder", "ability": "strength", "skill": "athletics", "dc": 10 } }),
    );
    assert_eq!(rolled["ok"], true, "{rolled}");
    assert_eq!(rolled["awaiting"]["kind"], "none", "{rolled}");
    let state = api.call("dm", json!({ "cmd": "get_state" }));
    assert_eq!(state["result"]["state"]["mode"], "explore", "{state}");
    assert_eq!(state["awaiting"]["kind"], "none", "{state}");
}

/// Decision D5: the engine refuses an early end its encounter does not allow, and the refusal
/// changes nothing. The accepted surrender is in `contract/fixtures/encounter.jsonl`.
#[test]
fn a_refused_end_combat_changes_nothing() {
    let mut api = duel();
    let started = api.start_duel("dm");
    let before = api.call("dm", json!({ "cmd": "get_state" }));
    for (reason, code) in [
        ("surrender", "surrender_not_available"),
        ("scenario", "rejected"),
        ("fled", "not_implemented"),
    ] {
        let refused = api.call("dm", json!({ "cmd": "end_combat", "reason": reason }));
        assert_eq!(refused["error"]["code"], code, "{refused}");
        assert_eq!(refused["events"], json!([]), "{refused}");
        assert_eq!(refused["log_head"], started["log_head"], "{refused}");
        assert_eq!(refused["awaiting"], started["awaiting"], "{refused}");
    }
    let after = api.call("dm", json!({ "cmd": "get_state" }));
    assert_eq!(after["result"], before["result"], "{after}");
    assert_eq!(
        after["result"]["state"]["encounters"],
        json!([{ "id": "duel", "running": true, "surrender_available": false }]),
        "{after}"
    );
    // A player learns that the fight cannot end that way, not which encounter it is or why.
    for (reason, code) in [
        ("surrender", "surrender_not_available"),
        ("scenario", "rejected"),
    ] {
        let refused = api.call("bren", json!({ "cmd": "end_combat", "reason": reason }));
        assert_eq!(refused["error"]["code"], code, "{refused}");
        let message = refused["error"]["message"].as_str().unwrap();
        assert!(
            !message.contains("duel") && !message.contains("condition"),
            "{refused}"
        );
    }
}

fn anchor(id: &str, x_ft: f32) -> Value {
    json!({ "id": id, "name": id, "position_ft": { "x_ft": x_ft, "y_ft": 0.0, "z_ft": 0.0 } })
}

/// A goblin that waits for a client instead of attacking on its own, so no roll decides how a
/// test fight starts.
fn held_goblin() -> Value {
    let mut goblin = creature("goblin", ("monster", "goblin_warrior"), "hostile", 5.0);
    goblin["control"] = json!("client");
    goblin
}

#[test]
fn a_party_creature_that_surrenders_can_share_the_next_scene_with_its_captor() {
    let dir = data_dir(
        "captured",
        &[
            (
                "last_stand",
                json!({ "id": "last_stand",
                    "creatures": [
                        creature("bren", ("pregen", "fighter_l2"), "party", 0.0),
                        held_goblin()
                    ],
                    "encounters": [{ "id": "stand", "participants": ["bren", "goblin"],
                        "surrender": { "creatures": ["bren"],
                            "any_of": [{ "kind": "standing_at_most", "count": 1 }] } }] }),
            ),
            (
                "camp",
                json!({ "id": "camp", "anchors": [anchor("tent", 0.0), anchor("post", 10.0)],
                    "party_start": ["tent", "post"] }),
            ),
        ],
    );
    let mut api = Api::new(Server::with_data_dir(dir.clone()));
    let loaded = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "last_stand" }),
    );
    assert_eq!(loaded["ok"], true, "{loaded}");
    let started = api.call(
        "dm",
        json!({ "cmd": "start_combat", "encounter_id": "stand" }),
    );
    assert_eq!(started["ok"], true, "{started}");
    let ended = api.call("dm", json!({ "cmd": "end_combat", "reason": "surrender" }));
    assert_eq!(ended["ok"], true, "{ended}");
    let events = ended["events"].as_array().unwrap();
    let surrendered = events.iter().find(|e| e["kind"] == "surrendered").unwrap();
    assert_eq!(surrendered["handles"], json!(["bren"]), "{ended}");
    let over = events.iter().find(|e| e["kind"] == "combat_over").unwrap();
    assert_eq!(over["winner"], "hostile", "{ended}");
    // The goblin no longer counts Bren as an enemy, so both can be carried into one scene.
    let carried = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "camp", "party": ["goblin", "bren"] }),
    );
    std::fs::remove_dir_all(dir).ok();
    assert_eq!(carried["ok"], true, "{carried}");
}

#[test]
fn surrender_needs_its_creatures_and_leader_in_the_scene() {
    // Mira is never carried in, so neither condition can hold: nobody of the first group is
    // here to give up, and a leader who is not here is not down.
    let encounter = |id: &str, surrender: Value| {
        json!({ "id": id, "participants": ["bren", "mira", "goblin"],
            "surrender": surrender, "end_reasons": ["scenario"] })
    };
    let dir = data_dir(
        "absent",
        &[
            (
                "camp",
                json!({ "id": "camp",
                    "creatures": [creature("bren", ("pregen", "fighter_l2"), "party", 0.0)] }),
            ),
            (
                "gate",
                json!({ "id": "gate", "anchors": [anchor("gate", 0.0)], "party_start": ["gate"],
                    "creatures": [held_goblin()],
                    "encounters": [
                        encounter("missing_group", json!({ "creatures": ["mira"],
                            "any_of": [{ "kind": "standing_at_most", "count": 0 }] })),
                        encounter("missing_leader", json!({ "creatures": ["goblin", "mira"],
                            "any_of": [{ "kind": "leader_down", "handle": "mira" }] }))
                    ] }),
            ),
        ],
    );
    let mut api = Api::new(Server::with_data_dir(dir.clone()));
    let camp = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "camp" }));
    assert_eq!(camp["ok"], true, "{camp}");
    let gate = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "gate", "party": ["bren"] }),
    );
    assert_eq!(gate["ok"], true, "{gate}");
    for id in ["missing_group", "missing_leader"] {
        let started = api.call("dm", json!({ "cmd": "start_combat", "encounter_id": id }));
        assert_eq!(started["ok"], true, "{started}");
        let encounters = &started["result"]["state"]["encounters"];
        let running = encounters
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["id"] == id)
            .unwrap();
        assert_eq!(running["running"], true, "{started}");
        assert_eq!(running["surrender_available"], false, "{started}");
        let refused = api.call("dm", json!({ "cmd": "end_combat", "reason": "surrender" }));
        assert_eq!(
            refused["error"]["code"], "surrender_not_available",
            "{refused}"
        );
        let ended = api.call("dm", json!({ "cmd": "end_combat", "reason": "scenario" }));
        assert_eq!(ended["ok"], true, "{ended}");
    }
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn a_spent_hit_point_die_stays_spent_in_the_next_scene() {
    let mut api = duel();
    let loaded = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "m3_s1_green" }),
    );
    assert_eq!(loaded["ok"], true, "{loaded}");
    let rested = api.call(
        "dm",
        json!({ "cmd": "short_rest", "participants": ["bren"],
            "hit_dice": [{ "handle": "bren", "count": 1 }] }),
    );
    assert_eq!(rested["ok"], true, "{rested}");
    // Bren is unhurt, so the die is spent for nothing.
    assert_eq!(
        rested["result"]["healed"],
        json!([{ "handle": "bren", "amount": 0 }]),
        "{rested}"
    );
    let kinds: Vec<&str> = rested["events"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["kind"].as_str().unwrap())
        .collect();
    assert_eq!(kinds, ["roll", "healed", "hit_points", "rest"], "{rested}");
    let carried = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "m3_s2_road", "party": ["bren"] }),
    );
    assert_eq!(carried["ok"], true, "{carried}");
    let sheet = api.call("dm", json!({ "cmd": "get_sheet", "actor": "bren" }));
    assert_eq!(
        sheet["result"]["sheet"]["hit_dice"],
        json!([{ "die": 10, "remaining": 1, "max": 2 }]),
        "{sheet}"
    );
}

/// Each initiative roll's roller and Advantage state, in initiative order.
fn initiative_rolls(started: &Value) -> Vec<(String, String)> {
    started["events"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["kind"] == "roll" && e["roll"]["kind"] == "initiative")
        .map(|e| {
            (
                e["roll"]["roller"].as_str().unwrap().to_owned(),
                e["roll"]["advantage"].as_str().unwrap().to_owned(),
            )
        })
        .collect()
}

#[test]
fn only_the_surprised_side_rolls_initiative_with_disadvantage() {
    for (seed, spot) in [(3, true), (4, false)] {
        let mut api = Api::seeded(seed);
        road(&mut api);
        if spot {
            let spotted = api.call(
                "dm",
                json!({ "cmd": "request_check", "actor": "bren",
                    "check": { "kind": "scenario", "check_id": "spot_lookouts" } }),
            );
            assert_eq!(spotted["result"]["success"], true, "{spotted}");
        }
        let yard = api.call(
            "dm",
            json!({ "cmd": "load_scene", "scene_id": "m3_s3_yard", "party": ["bren"] }),
        );
        assert_eq!(yard["ok"], true, "{yard}");
        let started = api.call(
            "dm",
            json!({ "cmd": "start_combat", "encounter_id": "yard_fight" }),
        );
        assert_eq!(started["ok"], true, "{started}");
        let rolls = initiative_rolls(&started);
        assert_eq!(rolls.len(), 3, "{started}");
        for (roller, advantage) in rolls {
            let surprised = spot && roller != "bren";
            let expected = if surprised { "disadvantage" } else { "normal" };
            assert_eq!(advantage, expected, "{roller}: {started}");
        }
    }
}

#[test]
fn a_flag_spawn_joins_the_fight_it_starts_once() {
    // Seed 2: Bren fails the interrogation, which sets boss_warned.
    let mut api = Api::seeded(2);
    let green = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "m3_s1_green" }),
    );
    assert_eq!(green["ok"], true, "{green}");
    let prisoner = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "m3_s4_prisoner", "party": ["bren"] }),
    );
    assert_eq!(prisoner["ok"], true, "{prisoner}");
    let asked = api.call(
        "dm",
        json!({ "cmd": "request_check", "actor": "bren",
            "check": { "kind": "scenario", "check_id": "interrogate" } }),
    );
    assert_eq!(asked["result"]["success"], false, "{asked}");
    let cellar = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "m3_s5_cellar", "party": ["bren"] }),
    );
    assert_eq!(cellar["ok"], true, "{cellar}");
    let refused = api.call("dm", json!({ "cmd": "spawn", "spawn_id": "extra_warrior" }));
    assert_eq!(refused["error"]["reason"], "automatic", "{refused}");
    assert_eq!(refused["events"], json!([]), "{refused}");
    let handles = |state: &Value| -> Vec<String> {
        state["creatures"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["handle"].as_str().unwrap().to_owned())
            .collect()
    };
    for fight in 0..2 {
        let started = api.call(
            "dm",
            json!({ "cmd": "start_combat", "encounter_id": "cellar_fight" }),
        );
        assert_eq!(started["ok"], true, "{started}");
        let state = &started["result"]["state"];
        assert_eq!(handles(state), ["bren", "boss", "goblin_3"], "{started}");
        let initiative = state["initiative"].as_array().unwrap();
        assert!(initiative.contains(&json!("goblin_3")), "{started}");
        let spawned = started["events"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["kind"] == "spawned")
            .count();
        assert_eq!(spawned, usize::from(fight == 0), "{started}");
        let ended = api.call("dm", json!({ "cmd": "end_combat", "reason": "scenario" }));
        assert_eq!(ended["ok"], true, "{ended}");
    }
}

#[test]
fn spawn_creatures_are_checked_when_their_scene_loads() {
    let spawn = |creature: Value| json!([{ "id": "later", "when": { "kind": "dm" }, "creatures": [creature] }]);
    let bren = creature("bren", ("pregen", "fighter_l2"), "party", 0.0);
    let goblin = |side: &str| creature("goblin", ("monster", "goblin_warrior"), side, 5.0);
    let dir = data_dir(
        "spawn_checks",
        &[
            (
                "start",
                json!({ "id": "start", "creatures": [bren.clone()] }),
            ),
            // Bren is carried in and also arrives by spawn.
            (
                "clash",
                json!({ "id": "clash", "anchors": [anchor("door", 0.0)], "party_start": ["door"],
                    "spawns": spawn(bren.clone()) }),
            ),
            (
                "bad_block",
                json!({ "id": "bad_block", "creatures": [bren.clone()],
                    "spawns": spawn(creature("goblin", ("monster", "bad_goblin"), "hostile", 5.0)) }),
            ),
            // Bren is hostile to the goblin, so it cannot arrive on the party side.
            (
                "turncoat",
                json!({ "id": "turncoat", "creatures": [bren.clone()], "spawns": spawn(goblin("party")) }),
            ),
        ],
    );
    let mut goblin_block: Value = serde_json::from_str(
        &std::fs::read_to_string(dir.join("monsters/goblin_warrior.json")).unwrap(),
    )
    .unwrap();
    goblin_block["proficiency_bonus"] = json!(3);
    std::fs::write(
        dir.join("monsters/bad_goblin.json"),
        goblin_block.to_string(),
    )
    .unwrap();

    let mut api = Api::new(Server::with_data_dir(dir.clone()));
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "start" }));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let refused = [
        ("clash", json!(["bren"]), "carried in"),
        ("bad_block", json!([]), "proficiency_bonus"),
        ("turncoat", json!([]), "goblin"),
    ]
    .map(|(id, party, why)| {
        let response = api.call(
            "dm",
            json!({ "cmd": "load_scene", "scene_id": id, "party": party }),
        );
        (id, why, response)
    });
    let state = api.call("dm", json!({ "cmd": "get_state" }));
    std::fs::remove_dir_all(dir).ok();
    for (id, why, response) in refused {
        assert_eq!(response["error"]["code"], "bad_scene", "{id}: {response}");
        let message = response["error"]["message"].as_str().unwrap();
        assert!(message.contains(why), "{id}: {response}");
    }
    // Every refusal left the first scene as it was.
    assert_eq!(state["result"]["state"]["scene_id"], "start", "{state}");
    assert_eq!(
        state["result"]["state"]["creatures"]
            .as_array()
            .unwrap()
            .len(),
        1,
        "{state}"
    );
}

/// Ends Bren's turns until the cellar fight reaches round 3, then returns the session and the
/// DM state.
fn cellar_round_3(seed: u32) -> (Api, Value) {
    let mut api = Api::seeded(seed);
    for (scene, party) in [
        ("m3_s1_green", json!([])),
        ("m3_s5_cellar", json!(["bren"])),
    ] {
        let loaded = api.call(
            "dm",
            json!({ "cmd": "load_scene", "scene_id": scene, "party": party }),
        );
        assert_eq!(loaded["ok"], true, "{loaded}");
    }
    let state = fight_to_round_3(&mut api);
    (api, state)
}

/// Starts the cellar fight and ends Bren's turns until it reaches round 3; returns the DM state.
fn fight_to_round_3(api: &mut Api) -> Value {
    let mut last = api.call(
        "dm",
        json!({ "cmd": "start_combat", "encounter_id": "cellar_fight" }),
    );
    for _ in 0..40 {
        let state = api.call("dm", json!({ "cmd": "get_state" }));
        if state["result"]["state"]["round"].as_u64() >= Some(3) {
            return state["result"]["state"].clone();
        }
        let awaiting = &last["awaiting"];
        assert_eq!(awaiting["kind"], "action", "{last}");
        last = api.call(
            "dm",
            json!({ "cmd": "end_turn", "actor": awaiting["actor"],
                "prompt_id": awaiting["prompt_id"] }),
        );
        assert_eq!(last["ok"], true, "{last}");
    }
    panic!("the cellar fight never reached round 3");
}

fn rats_placed(state: &Value) -> &Value {
    &state["spawns"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"] == "rats")
        .unwrap()["placed"]
}

#[test]
fn round_spawns_join_at_their_round_unless_the_party_is_bloodied() {
    // Seed 1: Bren has 13 of 20 Hit Points at round 3, so the rats come and join.
    let (_, state) = cellar_round_3(1);
    let initiative = state["initiative"].as_array().unwrap();
    assert!(initiative.contains(&json!("goblin_4")), "{state}");
    assert!(initiative.contains(&json!("goblin_5")), "{state}");
    // Seed 6: Bren is down to 6, bloodied, so they stay away.
    let (_, state) = cellar_round_3(6);
    let initiative = state["initiative"].as_array().unwrap();
    assert!(!initiative.contains(&json!("goblin_4")), "{state}");
    assert_eq!(rats_placed(&state), false, "{state}");
}

#[test]
fn a_cancelled_round_spawn_stays_cancelled_in_a_later_fight() {
    let (mut api, state) = cellar_round_3(6);
    assert_eq!(rats_placed(&state), false, "{state}");
    let ended = api.call("dm", json!({ "cmd": "end_combat", "reason": "scenario" }));
    assert_eq!(ended["ok"], true, "{ended}");
    let rested = api.call(
        "dm",
        json!({ "cmd": "short_rest", "participants": ["bren"],
            "hit_dice": [{ "handle": "bren", "count": 2 }] }),
    );
    assert_eq!(rested["ok"], true, "{rested}");
    let rested = api.call("dm", json!({ "cmd": "get_state" }));
    let bren = &rested["result"]["state"]["creatures"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["handle"] == "bren")
        .unwrap()["health"];
    assert_ne!(bren, "bloodied", "{rested}");

    // Bren is no longer Bloodied, but the rats were cancelled at round 3 of the first fight.
    let state = fight_to_round_3(&mut api);
    assert!(
        !state["initiative"]
            .as_array()
            .unwrap()
            .contains(&json!("goblin_4")),
        "{state}"
    );
    assert_eq!(rats_placed(&state), false, "{state}");
}

#[test]
fn a_spawn_leaves_a_pending_reaction_prompt_alone() {
    let mut reserve = creature("goblin_2", ("monster", "goblin_warrior"), "hostile", 40.0);
    reserve["control"] = json!("client");
    let dir = data_dir(
        "spawn_reaction",
        &[(
            "standoff",
            json!({ "id": "standoff",
                "creatures": [creature("bren", ("pregen", "fighter_l2"), "party", 0.0), held_goblin()],
                "encounters": [{ "id": "standoff", "participants": ["bren", "goblin"] }],
                "spawns": [{ "id": "reserve", "when": { "kind": "dm" }, "creatures": [reserve] }] }),
        )],
    );
    let mut api = Api::new(Server::with_data_dir(dir.clone()));
    let started = api.call("dm", json!({ "cmd": "new_session", "seed": 3 }));
    assert_eq!(started["ok"], true, "{started}");
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "standoff" }));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let mut last = api.call(
        "dm",
        json!({ "cmd": "start_combat", "encounter_id": "standoff" }),
    );
    if last["awaiting"]["actor"] == "goblin" {
        last = api.call(
            "dm",
            json!({ "cmd": "end_turn", "actor": "goblin",
                "prompt_id": last["awaiting"]["prompt_id"] }),
        );
    }
    assert_eq!(last["awaiting"]["actor"], "bren", "{last}");
    let moved = api.call(
        "dm",
        json!({ "cmd": "move", "actor": "bren", "prompt_id": last["awaiting"]["prompt_id"],
            "to": { "kind": "point", "point": { "x_ft": -20.0, "y_ft": 0.0, "z_ft": 0.0 } } }),
    );
    std::fs::remove_dir_all(dir).ok();
    assert_eq!(moved["awaiting"]["kind"], "reaction", "{moved}");
    let spawned = api.call("dm", json!({ "cmd": "spawn", "spawn_id": "reserve" }));
    assert_eq!(spawned["ok"], true, "{spawned}");
    assert_eq!(spawned["awaiting"], moved["awaiting"], "{spawned}");
}

/// Bren and Ana side by side on a yard, a far corner, a fall that drops whoever fails it to 0
/// Hit Points (Bren has 20; 20 to 23 damage leaves less than that over, so nobody dies), a
/// quiet second scene, and a fight with a goblin, with or without Ana.
fn help_dir(name: &str) -> PathBuf {
    data_dir(
        name,
        &[
            (
                "yard",
                json!({ "id": "yard", "anchors": [anchor("corner", 30.0)],
                    "creatures": [
                        creature("bren", ("pregen", "fighter_l2"), "party", 0.0),
                        creature("ana", ("pregen", "fighter_l2"), "party", 5.0),
                        held_goblin_at(60.0)
                    ],
                    "checks": [{ "id": "fall", "test": { "kind": "save", "ability": "dexterity" },
                        "dc": 30,
                        "on_failure": [{ "kind": "damage", "dice": "1d4+19", "damage_type": "bludgeoning" }] }],
                    "encounters": [
                        { "id": "brawl", "participants": ["bren", "ana", "goblin"] },
                        { "id": "duel", "participants": ["bren", "goblin"], "end_reasons": ["scenario"] }
                    ] }),
            ),
            (
                "lane",
                json!({ "id": "lane", "anchors": [anchor("a", 0.0), anchor("b", 5.0)],
                    "party_start": ["a", "b"] }),
            ),
        ],
    )
}

fn held_goblin_at(x_ft: f32) -> Value {
    let mut goblin = held_goblin();
    goblin["at"]["point"]["x_ft"] = json!(x_ft);
    goblin
}

fn help(api: &mut Api, actor: &str, help: Value) -> Value {
    api.call("dm", json!({ "cmd": "help", "actor": actor, "help": help }))
}

fn athletics(api: &mut Api, actor: &str) -> Value {
    let checked = api.call(
        "dm",
        json!({ "cmd": "request_check", "actor": actor,
            "check": { "kind": "ladder", "ability": "strength", "skill": "athletics", "dc": 10 } }),
    );
    assert_eq!(checked["ok"], true, "{checked}");
    checked["events"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["kind"] == "roll")
        .cloned()
        .unwrap()["roll"]
        .clone()
}

#[test]
fn help_gives_an_ally_advantage_on_their_next_check_with_the_skill() {
    let dir = help_dir("help_assist");
    let mut api = Api::new(Server::with_data_dir(dir.clone()));
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "yard" }));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let assist = json!({ "kind": "assist_check", "ally": "ana", "skill": "athletics" });

    let helped = help(&mut api, "bren", assist.clone());
    assert_eq!(helped["ok"], true, "{helped}");
    assert_eq!(helped["result"], json!({ "cmd": "help" }), "{helped}");
    let events = helped["events"].as_array().unwrap();
    let action = events.iter().find(|e| e["kind"] == "action").unwrap();
    assert_eq!(action["visibility"]["scope"], "public", "{helped}");
    assert_eq!(action["actor"], "bren", "{helped}");
    assert_eq!(action["targets"], json!(["ana"]), "{helped}");
    assert!(!events.iter().any(|e| e["kind"] == "roll"), "{helped}");

    // A check with another skill leaves the Help alone; the next Athletics check spends it.
    let perception = api.call(
        "dm",
        json!({ "cmd": "request_check", "actor": "ana",
            "check": { "kind": "ladder", "ability": "wisdom", "skill": "perception", "dc": 10 } }),
    );
    assert_eq!(perception["ok"], true, "{perception}");
    let roll = athletics(&mut api, "ana");
    assert_eq!(roll["advantage"], "advantage", "{roll}");
    assert_eq!(roll["dice"][0]["dice"], "2d20", "{roll}");
    let sources = roll["advantage_sources"].as_array().unwrap();
    assert!(
        sources.iter().any(|s| s.as_str().unwrap().contains("help")),
        "{roll}"
    );
    let roll = athletics(&mut api, "ana");
    assert_eq!(roll["advantage"], "normal", "{roll}");

    // Out of combat a helper can help again; Bren's own checks are not helped.
    let again = help(&mut api, "bren", assist.clone());
    assert_eq!(again["ok"], true, "{again}");
    assert_eq!(athletics(&mut api, "bren")["advantage"], "normal");

    // A Help left unused does not last into the next scene.
    let carried = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "lane", "party": ["bren", "ana"] }),
    );
    assert_eq!(carried["ok"], true, "{carried}");
    let roll = athletics(&mut api, "ana");
    std::fs::remove_dir_all(dir).ok();
    assert_eq!(roll["advantage"], "normal", "{roll}");
}

#[test]
fn a_helpers_next_turn_ends_what_it_gave_before() {
    let dir = help_dir("help_expiry");
    let mut api = Api::new(Server::with_data_dir(dir.clone()));
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "yard" }));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let assist = |skill: &str| json!({ "kind": "assist_check", "ally": "ana", "skill": skill });

    // Bren's second help starts his next turn, so the first one ends even though Ana kept it.
    assert_eq!(help(&mut api, "bren", assist("athletics"))["ok"], true);
    assert_eq!(help(&mut api, "bren", assist("perception"))["ok"], true);
    assert_eq!(athletics(&mut api, "ana")["advantage"], "normal");

    // A help Bren is refused moves nothing on, so the one he gave still stands.
    assert_eq!(help(&mut api, "bren", assist("athletics"))["ok"], true);
    let refused = help(&mut api, "bren", assist("arcana"));
    assert_eq!(refused["error"]["reason"], "not_proficient", "{refused}");
    let moved = api.call(
        "dm",
        json!({ "cmd": "move", "actor": "ana", "to": { "kind": "anchor", "anchor": "corner" } }),
    );
    assert_eq!(moved["ok"], true, "{moved}");
    let refused = help(&mut api, "bren", assist("perception"));
    assert_eq!(refused["error"]["reason"], "out_of_range", "{refused}");
    assert_eq!(athletics(&mut api, "ana")["advantage"], "advantage");

    // Other creatures' actions take no time off it: only Bren's next turn ends it.
    let moved = api.call(
        "dm",
        json!({ "cmd": "move", "actor": "ana", "to": { "kind": "creature", "handle": "bren" } }),
    );
    assert_eq!(moved["ok"], true, "{moved}");
    assert_eq!(help(&mut api, "bren", assist("athletics"))["ok"], true);
    for _ in 0..10 {
        let helped = help(
            &mut api,
            "ana",
            json!({ "kind": "assist_check", "ally": "bren", "skill": "perception" }),
        );
        assert_eq!(helped["ok"], true, "{helped}");
    }
    assert_eq!(athletics(&mut api, "ana")["advantage"], "advantage");

    // A helper the next scene leaves behind still ends the Help it gave.
    assert_eq!(help(&mut api, "bren", assist("athletics"))["ok"], true);
    let carried = api.call(
        "dm",
        json!({ "cmd": "load_scene", "scene_id": "lane", "party": ["ana"] }),
    );
    assert_eq!(carried["ok"], true, "{carried}");
    let roll = athletics(&mut api, "ana");
    std::fs::remove_dir_all(dir).ok();
    assert_eq!(roll["advantage"], "normal", "{roll}");
}

#[test]
fn a_help_ends_at_the_helpers_first_turn_of_a_fight_its_ally_is_not_in() {
    let dir = help_dir("help_fight_without_ally");
    let mut api = Api::new(Server::with_data_dir(dir.clone()));
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "yard" }));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let assist = json!({ "kind": "assist_check", "ally": "ana", "skill": "athletics" });
    assert_eq!(help(&mut api, "bren", assist)["ok"], true);

    let mut last = api.call(
        "dm",
        json!({ "cmd": "start_combat", "encounter_id": "duel" }),
    );
    assert_eq!(last["ok"], true, "{last}");
    if last["awaiting"]["actor"] == "goblin" {
        last = api.call(
            "dm",
            json!({ "cmd": "end_turn", "actor": "goblin", "prompt_id": last["awaiting"]["prompt_id"] }),
        );
        assert_eq!(last["ok"], true, "{last}");
    }
    assert_eq!(last["awaiting"]["actor"], "bren", "{last}");
    let ended = api.call("dm", json!({ "cmd": "end_combat", "reason": "scenario" }));
    assert_eq!(ended["ok"], true, "{ended}");
    let roll = athletics(&mut api, "ana");
    std::fs::remove_dir_all(dir).ok();
    assert_eq!(roll["advantage"], "normal", "{roll}");
}

#[test]
fn a_refused_help_rolls_and_logs_nothing() {
    let dir = help_dir("help_refused");
    let mut api = Api::new(Server::with_data_dir(dir.clone()));
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "yard" }));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let refused = |api: &mut Api, actor: &str, help_spec: Value, reason: &str| {
        let answer = help(api, actor, help_spec);
        assert_eq!(answer["ok"], false, "{answer}");
        assert_eq!(answer["error"]["code"], "rejected", "{answer}");
        assert_eq!(answer["error"]["reason"], reason, "{answer}");
        assert_eq!(answer["events"], json!([]), "{answer}");
    };
    // Bren has no Arcana proficiency, cannot help himself, and Ana is not dying.
    refused(
        &mut api,
        "bren",
        json!({ "kind": "assist_check", "ally": "ana", "skill": "arcana" }),
        "not_proficient",
    );
    refused(
        &mut api,
        "bren",
        json!({ "kind": "assist_check", "ally": "bren", "skill": "athletics" }),
        "invalid_target",
    );
    refused(
        &mut api,
        "bren",
        json!({ "kind": "stabilize", "target": "ana" }),
        "invalid_target",
    );
    let moved = api.call(
        "dm",
        json!({ "cmd": "move", "actor": "ana", "to": { "kind": "anchor", "anchor": "corner" } }),
    );
    assert_eq!(moved["ok"], true, "{moved}");
    refused(
        &mut api,
        "bren",
        json!({ "kind": "assist_check", "ally": "ana", "skill": "athletics" }),
        "out_of_range",
    );

    let started = api.call(
        "dm",
        json!({ "cmd": "start_combat", "encounter_id": "brawl" }),
    );
    assert_eq!(started["ok"], true, "{started}");
    let in_combat = help(
        &mut api,
        "bren",
        json!({ "kind": "assist_check", "ally": "ana", "skill": "athletics" }),
    );
    std::fs::remove_dir_all(dir).ok();
    assert_eq!(in_combat["error"]["code"], "wrong_mode", "{in_combat}");
}

#[test]
fn help_stabilizes_a_creature_at_0_hit_points_on_a_dc_10_medicine_check() {
    let dir = help_dir("help_stabilize");
    // With seed 5 the first two checks fail and the third succeeds.
    let mut api = Api::start(
        Server::with_data_dir(dir.clone()),
        json!({ "cmd": "new_session", "seed": 5 }),
    );
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "yard" }));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let fell = api.call(
        "dm",
        json!({ "cmd": "request_check", "actor": "bren",
            "check": { "kind": "scenario", "check_id": "fall" } }),
    );
    let fall_events = fell["events"].as_array().unwrap();
    let down = fall_events
        .iter()
        .find(|e| e["kind"] == "life_state")
        .unwrap();
    assert_eq!(down["state"], "unconscious", "{fell}");

    // Each try is one DC 10 Medicine check; a failure leaves Bren dying, a success makes him
    // Stable. Out of combat Ana can keep trying.
    let mut stable = false;
    for _ in 0..40 {
        let tried = help(
            &mut api,
            "ana",
            json!({ "kind": "stabilize", "target": "bren" }),
        );
        assert_eq!(tried["ok"], true, "{tried}");
        let events = tried["events"].as_array().unwrap();
        let rolls: Vec<&Value> = events.iter().filter(|e| e["kind"] == "roll").collect();
        assert_eq!(rolls.len(), 1, "{tried}");
        let roll = &rolls[0]["roll"];
        assert_eq!(roll["kind"], "skill_check", "{roll}");
        assert_eq!(roll["roller"], "ana", "{roll}");
        assert_eq!(
            roll["against"],
            json!({ "kind": "DC", "value": 10 }),
            "{roll}"
        );
        assert_eq!(roll["dc_source"], "rule", "{roll}");
        let changed = events.iter().find(|e| e["kind"] == "life_state");
        if roll["outcome"] == "success" {
            assert_eq!(changed.unwrap()["state"], "stable", "{tried}");
            stable = true;
            break;
        }
        assert!(changed.is_none(), "{tried}");
    }
    assert!(stable, "forty DC 10 Medicine checks all failed");
    let again = help(
        &mut api,
        "ana",
        json!({ "kind": "stabilize", "target": "bren" }),
    );
    std::fs::remove_dir_all(dir).ok();
    assert_eq!(again["error"]["reason"], "invalid_target", "{again}");
}

/// Ends turns until `actor`'s action prompt comes up, failing after a few rounds.
fn until_turn_of(api: &mut Api, mut last: Value, actor: &str) -> Value {
    for _ in 0..12 {
        if last["awaiting"]["kind"] == "action" && last["awaiting"]["actor"] == actor {
            return last;
        }
        assert_eq!(last["awaiting"]["kind"], "action", "{last}");
        let current = last["awaiting"]["actor"].clone();
        last = api.call(
            "dm",
            json!({ "cmd": "end_turn", "actor": current, "prompt_id": last["awaiting"]["prompt_id"] }),
        );
        assert_eq!(last["ok"], true, "{last}");
    }
    panic!("{actor} never got a turn: {last}");
}

#[test]
fn in_combat_help_is_an_option_with_a_variant_per_skill() {
    let dir = help_dir("help_combat");
    let mut api = Api::new(Server::with_data_dir(dir.clone()));
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "yard" }));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let started = api.call(
        "dm",
        json!({ "cmd": "start_combat", "encounter_id": "brawl" }),
    );
    assert_eq!(started["ok"], true, "{started}");
    let turn = until_turn_of(&mut api, started, "bren");
    let prompt_id = turn["awaiting"]["prompt_id"].clone();

    let listed = api.call("dm", json!({ "cmd": "legal_actions", "actor": "bren" }));
    let options = listed["result"]["options"].as_array().unwrap();
    let assist = options
        .iter()
        .find(|o| o["option_id"] == "help/assist_ability_check")
        .unwrap_or_else(|| panic!("{listed}"));
    // Bren's skills: Acrobatics and Perception from the class, Athletics and Intimidation from
    // Soldier, Insight from Skillful, Medicine, Persuasion and Survival from Skilled.
    let variants: Vec<&str> = assist["variants"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["variant"].as_str().unwrap())
        .collect();
    assert_eq!(
        variants,
        [
            "help/acrobatics",
            "help/athletics",
            "help/insight",
            "help/intimidation",
            "help/medicine",
            "help/perception",
            "help/persuasion",
            "help/survival"
        ],
        "{assist}"
    );
    assert_eq!(assist["variants"][0]["name"], "Acrobatics", "{assist}");
    let targets: Vec<&str> = assist["targets"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["handle"].as_str().unwrap())
        .collect();
    assert_eq!(targets, ["ana"], "{assist}");
    // Nobody is dying, so there is nobody to stabilize.
    assert!(
        !options.iter().any(|o| o["option_id"] == "help/stabilize"),
        "{listed}"
    );

    let submit = |api: &mut Api, variant: Option<&str>| {
        let mut request = json!({ "cmd": "submit", "actor": "bren", "prompt_id": prompt_id,
            "option_id": "help/assist_ability_check", "targets": ["ana"] });
        if let Some(variant) = variant {
            request["variant"] = json!(variant);
        }
        api.call("dm", request)
    };
    let bare = submit(&mut api, None);
    assert_eq!(bare["error"]["reason"], "needs_variant", "{bare}");
    let unknown = submit(&mut api, Some("help/arcana"));
    assert_eq!(unknown["error"]["code"], "unknown_option", "{unknown}");
    let other = api.call(
        "dm",
        json!({ "cmd": "submit", "actor": "bren", "prompt_id": prompt_id,
            "option_id": "dash", "variant": "help/athletics" }),
    );
    assert_eq!(other["error"]["code"], "bad_request", "{other}");

    let helped = submit(&mut api, Some("help/athletics"));
    std::fs::remove_dir_all(dir).ok();
    assert_eq!(helped["ok"], true, "{helped}");
    let action = helped["events"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["kind"] == "action")
        .unwrap();
    assert_eq!(action["option_id"], "help/assist_ability_check", "{helped}");
    assert_eq!(action["targets"], json!(["ana"]), "{helped}");
}

/// A session on `help_dir`'s yard, seed 1, with Bren at 0 Hit Points from the fall.
fn bren_down_in_a_brawl(dir: &Path) -> Api {
    let mut api = Api::start(
        Server::with_data_dir(dir.to_path_buf()),
        json!({ "cmd": "new_session", "seed": 1 }),
    );
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "yard" }));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let fell = api.call(
        "dm",
        json!({ "cmd": "request_check", "actor": "bren",
            "check": { "kind": "scenario", "check_id": "fall" } }),
    );
    assert_eq!(fell["ok"], true, "{fell}");
    api
}

/// Ana uses Help to stabilize Bren on each of her turns, declining Tactical Mind, until he is
/// Stable or she can't. Returns the last response, her Medicine checks and whether he is Stable.
fn ana_stabilizes_bren(api: &mut Api, mut last: Value) -> (Value, usize, bool) {
    let mut stabilize_rolls = 0;
    let mut stable = false;
    for _ in 0..8 {
        last = until_turn_of(api, last, "ana");
        let listed = api.call("dm", json!({ "cmd": "legal_actions", "actor": "ana" }));
        let options = listed["result"]["options"].as_array().unwrap();
        let Some(stabilize) = options.iter().find(|o| o["option_id"] == "help/stabilize") else {
            break;
        };
        assert_eq!(stabilize["targets"][0]["handle"], "bren", "{stabilize}");
        last = api.call(
            "dm",
            json!({ "cmd": "submit", "actor": "ana", "prompt_id": last["awaiting"]["prompt_id"],
                "option_id": "help/stabilize", "targets": ["bren"] }),
        );
        assert_eq!(last["ok"], true, "{last}");
        // Tactical Mind can be offered after a failed check; decline it.
        while last["awaiting"]["kind"] == "reaction" {
            last = api.call(
                "dm",
                json!({ "cmd": "react", "actor": last["awaiting"]["actor"],
                    "prompt_id": last["awaiting"]["prompt_id"] }),
            );
            assert_eq!(last["ok"], true, "{last}");
        }
        stabilize_rolls += 1;
        let read = api.call("dm", json!({ "cmd": "events", "since": 0 }));
        if read["result"]["events"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["kind"] == "life_state" && e["target"] == "bren" && e["state"] == "stable")
        {
            stable = true;
            break;
        }
        last = api.call(
            "dm",
            json!({ "cmd": "end_turn", "actor": "ana", "prompt_id": last["awaiting"]["prompt_id"] }),
        );
        assert_eq!(last["ok"], true, "{last}");
    }
    (last, stabilize_rolls, stable)
}

#[test]
fn a_dying_creature_makes_death_saves_and_an_ally_can_stabilize_it_in_a_fight() {
    // Seed 1: Bren fails a death save and Ana fails her first Medicine check before she succeeds.
    let dir = help_dir("help_dying");
    let mut api = bren_down_in_a_brawl(&dir);
    let started = api.call(
        "dm",
        json!({ "cmd": "start_combat", "encounter_id": "brawl" }),
    );
    assert_eq!(started["ok"], true, "{started}");
    let (_, stabilize_rolls, stable) = ana_stabilizes_bren(&mut api, started);
    let read = api.call("dm", json!({ "cmd": "events", "since": 0 }));
    let events = read["result"]["events"].as_array().unwrap();
    let rolls = |kind: &str| {
        events
            .iter()
            .filter(|e| e["kind"] == "roll" && e["roll"]["kind"] == kind)
            .map(|e| e["roll"].clone())
            .collect::<Vec<_>>()
    };
    let death_saves = rolls("death_save");
    for save in &death_saves {
        assert_eq!(save["roller"], "bren", "{save}");
        assert_eq!(
            save["against"],
            json!({ "kind": "DC", "value": 10 }),
            "{save}"
        );
        assert_eq!(save["dc_source"], "rule", "{save}");
    }
    let medicine: Vec<Value> = rolls("skill_check")
        .into_iter()
        .filter(|r| r["roller"] == "ana")
        .collect();
    assert_eq!(medicine.len(), stabilize_rolls, "{read}");
    for roll in &medicine {
        assert_eq!(roll["label"], "a Wisdom (Medicine) check", "{roll}");
        assert_eq!(
            roll["against"],
            json!({ "kind": "DC", "value": 10 }),
            "{roll}"
        );
        assert_eq!(roll["dc_source"], "rule", "{roll}");
    }
    std::fs::remove_dir_all(dir).ok();
    assert_eq!(death_saves.len(), 2, "{read}");
    assert_eq!(stabilize_rolls, 2, "{read}");
    assert!(stable, "{read}");
}

#[test]
fn scripted_monsters_take_no_opportunity_attack_on_an_ally() {
    let mut held = held_goblin();
    held["handle"] = json!("goblin_a");
    held["at"]["point"]["x_ft"] = json!(0.0);
    let dir = data_dir(
        "ally_reach",
        &[(
            "camp",
            json!({ "id": "camp",
                "creatures": [
                    held,
                    creature("goblin_b", ("monster", "goblin_warrior"), "hostile", 5.0),
                    creature("bren", ("pregen", "fighter_l2"), "party", 200.0)
                ],
                "encounters": [{ "id": "camp", "participants": ["goblin_a", "goblin_b", "bren"] }] }),
        )],
    );
    let mut api = Api::start(
        Server::with_data_dir(dir.clone()),
        json!({ "cmd": "new_session", "seed": 1 }),
    );
    let loaded = api.call("dm", json!({ "cmd": "load_scene", "scene_id": "camp" }));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let started = api.call(
        "dm",
        json!({ "cmd": "start_combat", "encounter_id": "camp" }),
    );
    assert_eq!(started["ok"], true, "{started}");
    let turn = until_turn_of(&mut api, started, "goblin_a");

    // Goblin A walks out of Goblin B's reach. The engine offers B an opportunity attack, which
    // a scripted monster declines against its own side.
    let moved = api.call(
        "dm",
        json!({ "cmd": "move", "actor": "goblin_a", "prompt_id": turn["awaiting"]["prompt_id"],
            "to": { "kind": "point", "point": { "x_ft": -25.0, "y_ft": 0.0, "z_ft": 0.0 } } }),
    );
    std::fs::remove_dir_all(dir).ok();
    assert_eq!(moved["ok"], true, "{moved}");
    assert_eq!(moved["awaiting"]["actor"], "goblin_a", "{moved}");
    let attacks: Vec<&Value> = moved["events"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["kind"] == "roll" && e["roll"]["kind"] == "attack")
        .collect();
    assert!(attacks.is_empty(), "{moved}");
    // The reaction was offered, so the move stopped where it provoked (protocol §4.1).
    assert_eq!(moved["result"]["provoked"], json!(["goblin_b"]), "{moved}");
}

#[test]
fn a_hit_on_a_stabilized_creature_is_a_failed_death_save() {
    // Seed 1: Ana stabilizes Bren, then strikes him with unarmed attacks on her next turns until
    // one hits. SRD 5.2.1: damage at 0 Hit Points is a failed death save, two on a Critical Hit,
    // and a Stable creature that takes damage starts making death saves again.
    let dir = help_dir("help_stable_hit");
    let mut api = bren_down_in_a_brawl(&dir);
    let started = api.call(
        "dm",
        json!({ "cmd": "start_combat", "encounter_id": "brawl" }),
    );
    assert_eq!(started["ok"], true, "{started}");
    let (mut last, _, stable) = ana_stabilizes_bren(&mut api, started);
    assert!(stable, "{last}");
    let mut hit = None;
    for _ in 0..8 {
        last = api.call(
            "dm",
            json!({ "cmd": "end_turn", "actor": "ana", "prompt_id": last["awaiting"]["prompt_id"] }),
        );
        assert_eq!(last["ok"], true, "{last}");
        last = until_turn_of(&mut api, last, "ana");
        last = api.call(
            "dm",
            json!({ "cmd": "submit", "actor": "ana", "prompt_id": last["awaiting"]["prompt_id"],
                "option_id": "unarmed_attack", "targets": ["bren"] }),
        );
        assert_eq!(last["ok"], true, "{last}");
        let attack = last["events"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["kind"] == "roll" && e["roll"]["kind"] == "attack")
            .unwrap()["roll"]
            .clone();
        if attack["outcome"] != "miss" {
            hit = Some(attack);
            break;
        }
    }
    let sheet = api.call("dm", json!({ "cmd": "get_sheet", "actor": "bren" }));
    std::fs::remove_dir_all(dir).ok();
    let hit = hit.expect("eight unarmed attacks all missed");
    let failures = if hit["outcome"] == "critical_hit" {
        2
    } else {
        1
    };
    let sheet = &sheet["result"]["sheet"];
    assert_eq!(sheet["life_state"], "unconscious", "{hit} {sheet}");
    assert_eq!(
        sheet["death_saves"],
        json!({ "successes": 0, "failures": failures }),
        "{hit} {sheet}"
    );
}
