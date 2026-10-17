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
            json!({ "cmd": "start_combat", "participants": ["bren", "goblin"] }),
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
            "saving_throw" | "ability_check" | "skill_check" => {
                assert_eq!(against["kind"], "DC", "{event}");
                assert!(roll["dc_source"].is_string(), "{event}");
            }
            "death_save" => assert_eq!(against["kind"], "DC", "{event}"),
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
            json!({ "cmd": "start_combat", "participants": ["bren", "goblin"] }),
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
    let legal = api.call("dm", json!({ "cmd": "legal_actions", "actor": "bren" }));
    assert_eq!(legal["error"]["code"], "wrong_mode", "{legal}");
    let lonely = api.call(
        "dm",
        json!({ "cmd": "start_combat", "participants": ["bren"] }),
    );
    assert_eq!(lonely["error"]["code"], "bad_request", "{lonely}");
    let surprised = api.call(
        "dm",
        json!({ "cmd": "start_combat", "participants": ["bren", "goblin"], "surprised": ["goblin"] }),
    );
    assert_eq!(surprised["error"]["code"], "not_implemented", "{surprised}");
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
        json!({ "cmd": "start_combat", "participants": ["bren", "goblin"] }),
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
            json!({ "cmd": "start_combat", "participants": ["bren", "goblin"] }),
        );
        assert_eq!(started["ok"], true, "{started}");
        fight_to_the_end(&mut api, started);
        api.call("dm", json!({ "cmd": "events", "since": 0 }))["result"].clone()
    };
    let plain = fight(false);
    assert!(plain.to_string().contains("\"roll\""), "{plain}");
    assert_eq!(fight(true), plain);
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
    let legal = api.call("dm", json!({ "cmd": "legal_actions", "actor": "bren" }));
    assert_eq!(legal["error"]["code"], "wrong_mode", "{legal}");
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
            r#"{"v":1,"id":"c","viewer":"dm","cmd":"start_combat","participants":["bren","goblin"]}"#,
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
