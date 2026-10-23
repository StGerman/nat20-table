//! What a player's view must never carry (`contract/protocol.md` §5), as a scan over any JSON a
//! player was given. The `visibility` CI job runs it over every response a fixture step gives a
//! player viewer; the game's leak scan (`nat20-duel`, M6 step 6) runs it over everything a player
//! agent and the human's seat were given. One list, so the two can't drift apart.
//!
//! A leak is: another creature's HP, max HP, temp HP or AC; any roll target (`against`, `dc`,
//! `dc_source`) or roll modifiers; scenario data (`flags`, `checks`, `encounters`,
//! `surrender_available`, `spawns`, `known_ids`) or the reasons behind Advantage
//! (`advantage_sources`); a DM-only or another owner's event, or a scenario event kind
//! (`check_resolved`, `flag_set`, `hazard_triggered`, `spawned`) whatever its visibility; another
//! creature's `hit_points` event; an AC or DC number in free text.

use serde_json::Value;

/// Keys no player view carries, whoever they describe.
pub const HIDDEN_KEYS: &[&str] = &[
    "against",
    "dc",
    "dc_source",
    "flags",
    "checks",
    "encounters",
    "surrender_available",
    "spawns",
    "known_ids",
    "advantage_sources",
];

/// Keys a player view carries only for the viewer's own creature.
pub const OWNER_KEYS: &[&str] = &["hp", "hp_max", "temp_hp", "ac"];

/// Event kinds that are scenario bookkeeping, never shown to a player whatever their visibility.
pub const SCENARIO_EVENT_KINDS: &[&str] =
    &["check_resolved", "flag_set", "hazard_triggered", "spawned"];

/// Every leak of hidden data in `value` as seen by the player of creature `viewer`; empty when
/// clean. Each entry names the JSON path and what leaked.
pub fn json_leaks(viewer: &str, value: &Value) -> Vec<String> {
    let mut found = Vec::new();
    scan(viewer, value, "$", &mut found);
    found
}

/// True when `text` carries a number right after "AC" or "DC", as in "vs AC 15" or "DC 12".
pub fn names_a_target_number(text: &str) -> bool {
    ["AC ", "DC "].iter().any(|word| {
        text.match_indices(word).any(|(at, _)| {
            let before = text[..at].chars().next_back();
            let after = text[at + word.len()..].chars().next();
            !before.is_some_and(char::is_alphanumeric) && after.is_some_and(|c| c.is_ascii_digit())
        })
    })
}

fn scan(viewer: &str, node: &Value, path: &str, found: &mut Vec<String>) {
    match node {
        Value::Object(map) => {
            let handle = map.get("handle").and_then(Value::as_str);
            if let Some(handle) = handle.filter(|handle| *handle != viewer) {
                for hidden in OWNER_KEYS {
                    if map.contains_key(*hidden) {
                        found.push(format!("{path}.{hidden} of {handle}"));
                    }
                }
            }
            for hidden in HIDDEN_KEYS {
                if map.contains_key(*hidden) {
                    found.push(format!("{path}.{hidden}"));
                }
            }
            if let Some(view) = map.get("view").and_then(Value::as_str) {
                if view != "player" {
                    found.push(format!("{path}.view is {view:?}"));
                }
                if map.contains_key("modifiers") {
                    found.push(format!("{path}.modifiers"));
                }
            }
            if let Some(visibility) = map.get("visibility") {
                let scope = visibility.get("scope").and_then(Value::as_str);
                let owner = visibility.get("handle").and_then(Value::as_str);
                if scope == Some("dm") || (scope == Some("owner") && owner != Some(viewer)) {
                    found.push(format!("{path} has visibility {visibility}"));
                }
            }
            let kind = map.get("kind").and_then(Value::as_str);
            if let Some(kind) = kind.filter(|kind| SCENARIO_EVENT_KINDS.contains(kind)) {
                found.push(format!("{path} is a {kind} event"));
            }
            if kind == Some("hit_points")
                && map.get("target").and_then(Value::as_str) != Some(viewer)
            {
                found.push(format!("{path} is another creature's hit_points event"));
            }
            for (key, value) in map {
                scan(viewer, value, &format!("{path}.{key}"), found);
            }
        }
        Value::Array(items) => {
            for (index, value) in items.iter().enumerate() {
                scan(viewer, value, &format!("{path}[{index}]"), found);
            }
        }
        Value::String(text) if names_a_target_number(text) => {
            found.push(format!("{path} names a target number: {text:?}"));
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn target_numbers_in_text_are_recognised() {
        assert!(names_a_target_number("Bren hits: 18 vs AC 15."));
        assert!(names_a_target_number("DC 12 Wisdom (Perception)"));
        assert!(!names_a_target_number("Bren hits the goblin for 7 damage."));
        assert!(!names_a_target_number("ABC 12"));
    }

    #[test]
    fn own_numbers_pass_and_other_creatures_numbers_leak() {
        let own = json!({"handle": "bren", "hp": 12, "ac": 19});
        assert!(json_leaks("bren", &own).is_empty());
        let other = json!({"others": [{"handle": "goblin_1", "hp": 7}]});
        assert_eq!(json_leaks("bren", &other), ["$.others[0].hp of goblin_1"]);
    }
}
