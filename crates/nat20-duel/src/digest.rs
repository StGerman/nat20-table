//! The narration check's state digest (M7 design §3.4, TASKS.md AGT-9): what the engine held each
//! time the DM narrated, for a judge that reads narration against it.
//!
//! The session log can't rebuild state on its own (`scene_loaded` carries no positions; starting
//! HP and inventory live in the pack and the pregens), so the digest replays the run's
//! `engine-log.jsonl` through an in-process `Server`, checks every response's events against the
//! recorded ones, and at each DM narration's `log_head` reads the replayed engine's DM view and
//! the party's sheets. Nothing here judges: it only lays the facts out, with the distances worked
//! out, so the judge never does geometry.

use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

use nat20_api_server::Server;
use serde::Serialize;
use serde_json::{Value, json};

use crate::game_audit::TranscriptRecord;

/// Two creatures closer than this, centre to centre, are next to each other (5 ft, with slack for
/// a diagonal step that rounds).
const ADJACENT_FT: f64 = 5.5;

/// One party member as the pack names it.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PartyMember {
    pub handle: String,
    /// Every form the table calls it by: handle, card name and the pack's `names`.
    pub names: Vec<String>,
    /// The pack's `pronouns`, when it gives them.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pronouns: Option<String>,
    /// Coins from the pregen's `money`: the engine doesn't track money.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coins: Option<String>,
}

/// What the engine held when the DM said one narration line.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Digest {
    /// The narration's number in the run, from 1.
    pub line: usize,
    pub text: String,
    /// `table`, or `to:<handle>` for a line to one character.
    pub channel: String,
    pub log_head: u64,
    pub scene: Option<String>,
    pub mode: Option<String>,
    pub round: Option<u64>,
    /// Whose decision the engine waited on: a turn in a fight, or a reaction.
    pub turn: Option<String>,
    /// A fight had just ended by itself (a side is down) and nothing new had started.
    pub combat_over: bool,
    /// Every creature in the scene: handle, name, side, HP, life state, conditions, position, and
    /// `surrendered` or `offered_surrender` when the engine says so.
    pub creatures: Vec<Value>,
    /// Creatures that fled the fight and left the scene, this run.
    pub fled: Vec<String>,
    /// Pairs of creatures next to each other, each pair in handle order.
    pub adjacent: Vec<[String; 2]>,
    /// Each party member's distance to the nearest hostile creature still standing, in feet.
    pub nearest_foe_ft: Vec<(String, f64)>,
    /// Each party member's distance to every hostile creature in the scene, in feet, so a claim
    /// about one named foe can be checked without geometry.
    pub foes_ft: BTreeMap<String, BTreeMap<String, f64>>,
    /// The engine's lines (DM view) since the narration before this one, each as `seq: text`.
    pub engine_lines: Vec<String>,
    /// Each party member's carried items with quantities, from its sheet.
    pub inventory: Vec<(String, Vec<Value>)>,
}

/// A digest of a whole run: one record per narration, and where the replay stopped if it did.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RunDigest {
    pub party: Vec<PartyMember>,
    /// The DM's narration lines in the transcript; fewer digests than this means the replay stopped.
    pub narrations: usize,
    pub digests: Vec<Digest>,
    pub requests_replayed: usize,
    /// The first request whose replayed response differed from the recorded one, with why.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diverged: Option<String>,
}

/// The party as the pack names it, with coins from the pregens in `pregens`.
pub fn pack_party(pack: &Path, pregens: &Path) -> Result<Vec<PartyMember>, String> {
    let read = |path: &Path| -> Result<Value, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
        serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
    };
    let adventure = read(&pack.join("adventure.json"))?;
    let first = adventure["scenes"][0]["id"]
        .as_str()
        .ok_or("adventure.json has no scenes")?;
    let scene = read(&pack.join("scenes").join(format!("{first}.json")))?;
    let mut party = Vec::new();
    for member in adventure["party"]
        .as_array()
        .ok_or("adventure.json has no party")?
    {
        let handle = member["handle"].as_str().unwrap_or_default().to_owned();
        let card = member["card"]
            .as_str()
            .and_then(|c| std::fs::read_to_string(pack.join(c)).ok())
            .unwrap_or_default();
        let card_name = card
            .lines()
            .find_map(|l| l.strip_prefix("# "))
            .map(|n| n.trim().to_owned());
        let mut names = vec![handle.clone()];
        names.extend(card_name);
        for name in member["names"].as_array().into_iter().flatten() {
            if let Some(name) = name.as_str() {
                names.push(name.to_owned());
            }
        }
        let mut seen = BTreeSet::new();
        names.retain(|n| seen.insert(n.clone()));
        let pregen = scene["creatures"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|c| c["handle"] == handle.as_str())
            .and_then(|c| c["pregen"].as_str());
        let coins = pregen
            .and_then(|id| read(&pregens.join(format!("{id}.json"))).ok())
            .and_then(|p| p["money"].as_str().map(str::to_owned));
        party.push(PartyMember {
            handle,
            names,
            pronouns: member["pronouns"].as_str().map(str::to_owned),
            coins,
        });
    }
    Ok(party)
}

/// The DM's narration lines, in order: a line to the table or to one character.
fn narrations(transcript: &[TranscriptRecord]) -> Vec<&TranscriptRecord> {
    transcript
        .iter()
        .filter(|r| r.speaker == "dm" && r.kind == "narration")
        .collect()
}

/// An event as the divergence check compares it: its seq, kind and text.
fn event_keys(response: &Value) -> Vec<(Value, Value, Value)> {
    response["events"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|e| (e["seq"].clone(), e["kind"].clone(), e["text"].clone()))
        .collect()
}

fn position(creature: &Value) -> Option<(f64, f64, f64)> {
    let p = &creature["position_ft"];
    Some((
        p["x_ft"].as_f64()?,
        p["y_ft"].as_f64()?,
        p["z_ft"].as_f64()?,
    ))
}

fn distance(a: (f64, f64, f64), b: (f64, f64, f64)) -> f64 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2) + (a.2 - b.2).powi(2)).sqrt()
}

/// A creature that can still fight: neither down nor dead.
fn standing(creature: &Value) -> bool {
    creature["life_state"] == "conscious"
}

fn handles(list: &Value) -> impl Iterator<Item = String> + '_ {
    list.as_array()
        .into_iter()
        .flatten()
        .filter_map(|h| h.as_str().map(str::to_owned))
}

/// The replayed engine, asked read-only questions as the DM between the run's own requests.
struct Replay {
    server: Server,
    asked: usize,
    /// The log head the previous digest read up to.
    read_to: u64,
    surrendered: BTreeSet<String>,
    fled: BTreeSet<String>,
}

impl Replay {
    fn ask(&mut self, command: Value) -> Value {
        self.asked += 1;
        let mut request = command;
        request["v"] = json!(1);
        request["id"] = json!(format!("digest-{}", self.asked));
        request["viewer"] = json!("dm");
        serde_json::from_str(&self.server.handle_line(&request.to_string())).unwrap_or(Value::Null)
    }

    /// The digest of the engine's state now, for one narration line.
    fn digest(
        &mut self,
        party: &[PartyMember],
        awaiting: &Value,
        record: &TranscriptRecord,
        line: usize,
    ) -> Digest {
        let events = self.ask(json!({"cmd": "events", "since": self.read_to}));
        let mut engine_lines = Vec::new();
        for event in events["result"]["events"].as_array().into_iter().flatten() {
            match event["kind"].as_str() {
                Some("surrendered") => self.surrendered.extend(handles(&event["handles"])),
                Some("fled") => self.fled.extend(handles(&event["handles"])),
                _ => {}
            }
            engine_lines.push(format!(
                "{}: {}",
                event["seq"],
                event["text"].as_str().unwrap_or_default()
            ));
        }
        if let Some(next) = events["result"]["next"].as_u64() {
            self.read_to = next;
        }
        let state = self.ask(json!({"cmd": "get_state"}));
        let state = &state["result"]["state"];
        let offered: BTreeSet<String> = state["encounters"]
            .as_array()
            .into_iter()
            .flatten()
            .flat_map(|e| handles(&e["surrendering"]))
            .collect();
        let mut creatures: Vec<Value> = state["creatures"].as_array().cloned().unwrap_or_default();
        for c in &mut creatures {
            let handle = c["handle"].as_str().unwrap_or_default().to_owned();
            if let Some(c) = c.as_object_mut() {
                // What the judge needs, not the full stat line.
                for key in ["ac", "speed_ft", "effects", "health"] {
                    c.remove(key);
                }
                if self.surrendered.contains(&handle) {
                    c.insert("surrendered".into(), json!(true));
                } else if offered.contains(&handle) {
                    c.insert("offered_surrender".into(), json!(true));
                }
            }
        }
        let mut adjacent = Vec::new();
        for (i, a) in creatures.iter().enumerate() {
            for b in &creatures[i + 1..] {
                if let (Some(pa), Some(pb)) = (position(a), position(b))
                    && distance(pa, pb) <= ADJACENT_FT
                {
                    let mut pair =
                        [a, b].map(|c| c["handle"].as_str().unwrap_or_default().to_owned());
                    pair.sort();
                    adjacent.push(pair);
                }
            }
        }
        let foes: Vec<(f64, f64, f64)> = creatures
            .iter()
            .filter(|c| {
                c["side"] == "hostile"
                    && standing(c)
                    && !self
                        .surrendered
                        .contains(c["handle"].as_str().unwrap_or_default())
            })
            .filter_map(position)
            .collect();
        let feet = |d: f64| (d * 10.0).round() / 10.0;
        let mut nearest_foe_ft = Vec::new();
        let mut foes_ft = BTreeMap::new();
        let mut inventory = Vec::new();
        for member in party {
            let me = creatures
                .iter()
                .find(|c| c["handle"] == member.handle.as_str());
            if let Some(at) = me.and_then(position) {
                if let Some(d) = foes.iter().map(|f| distance(at, *f)).reduce(f64::min) {
                    nearest_foe_ft.push((member.handle.clone(), feet(d)));
                }
                let each: BTreeMap<String, f64> = creatures
                    .iter()
                    .filter(|c| c["side"] == "hostile")
                    .filter_map(|c| {
                        Some((
                            c["handle"].as_str()?.to_owned(),
                            feet(distance(at, position(c)?)),
                        ))
                    })
                    .collect();
                if !each.is_empty() {
                    foes_ft.insert(member.handle.clone(), each);
                }
            }
            if me.is_some() {
                let sheet = self.ask(json!({"cmd": "get_sheet", "actor": member.handle}));
                let items = sheet["result"]["sheet"]["equipment"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|i| json!({"name": i["name"], "quantity": i["quantity"], "equipped": i["equipped"]}))
                    .collect();
                inventory.push((member.handle.clone(), items));
            }
        }
        let turn = match awaiting["kind"].as_str() {
            Some("action") | Some("reaction") => awaiting["actor"].as_str().map(str::to_owned),
            _ => None,
        };
        Digest {
            line,
            text: record.text.clone(),
            channel: record.channel.clone(),
            log_head: record.log_head,
            scene: state["scene_id"].as_str().map(str::to_owned),
            mode: state["mode"].as_str().map(str::to_owned),
            round: state["round"].as_u64(),
            turn,
            combat_over: awaiting["kind"] == "combat_over",
            creatures,
            fled: self.fled.iter().cloned().collect(),
            adjacent,
            nearest_foe_ft,
            foes_ft,
            engine_lines,
            inventory,
        }
    }
}

/// Replays `engine_log` (the run's `engine-log.jsonl`) on a fresh server over `pack`, and digests
/// the engine's state at each DM narration in `transcript`. The replay stops at the first response
/// that differs from the recorded one, and the narrations after it get no digest.
pub fn digest_run(
    pack: &Path,
    party: Vec<PartyMember>,
    engine_log: &str,
    transcript: &[TranscriptRecord],
) -> Result<RunDigest, String> {
    let lines: Vec<Value> = engine_log
        .lines()
        .filter(|l| !l.trim().is_empty())
        .enumerate()
        .map(|(i, l)| {
            serde_json::from_str(l).map_err(|e| format!("engine log line {}: {e}", i + 1))
        })
        .collect::<Result<_, _>>()?;
    let mut replay = Replay {
        server: Server::with_data_dir(pack.to_path_buf()),
        asked: 0,
        read_to: 0,
        surrendered: BTreeSet::new(),
        fled: BTreeSet::new(),
    };
    let said = narrations(transcript);
    let mut next = 0;
    let mut digests = Vec::new();
    let mut awaiting = Value::Null;
    let mut diverged = None;
    let mut replayed = 0;
    for (index, entry) in lines.iter().enumerate() {
        let recorded = &entry["response"];
        let head = recorded["log_head"].as_u64().unwrap_or(0);
        // A narration said before this request moved the log past its head is digested now, while
        // the replayed engine is where it was when the DM spoke.
        while next < said.len() && said[next].log_head < head {
            digests.push(replay.digest(&party, &awaiting, said[next], next + 1));
            next += 1;
        }
        let response: Value =
            serde_json::from_str(&replay.server.handle_line(&entry["request"].to_string()))
                .map_err(|e| {
                    format!("engine log line {}: the replayed response: {e}", index + 1)
                })?;
        replayed += 1;
        if event_keys(&response) != event_keys(recorded) || response["ok"] != recorded["ok"] {
            diverged = Some(format!(
                "engine log line {} ({}): the replayed response differs from the recorded one",
                index + 1,
                entry["request"]["cmd"].as_str().unwrap_or("?")
            ));
            break;
        }
        awaiting = response["awaiting"].clone();
    }
    if diverged.is_none() {
        while next < said.len() {
            digests.push(replay.digest(&party, &awaiting, said[next], next + 1));
            next += 1;
        }
    }
    Ok(RunDigest {
        party,
        narrations: said.len(),
        digests,
        requests_replayed: replayed,
        diverged,
    })
}
