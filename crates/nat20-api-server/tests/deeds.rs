//! Every deed a card reads is written somewhere a party can reach (design `m13-system-design.md`
//! §4.2 rule 8, API-57): for each world, a deed that a card or a choice of the world's deck joined
//! with its packs' decks reads is written by a deck effect, a card fight's `npc`, or a scene of a
//! pack on that world (a check's `remember`, an encounter's `on_end`, a creature's `npc`). A pack
//! is on a world by `campaign.json`'s `world.map` or `adventure.json`'s `site.map`. The engine's
//! own deeds count as written too: a company entry's, `rides:<id>`, and the NPC owner's (ENG-48).
//!
//! The test lives here, not in the world crate, because only the server reads both the deck and
//! the scene formats.

use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use nat20_api_contract::{Consequence, SceneFile};
use nat20_world::{CompanyFile, Deck, DeckFile, killed_deed, lost_a_horse_deed, owner_dead_deed};
use serde_json::Value;

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read<T: serde::de::DeserializeOwned>(path: &Path) -> T {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

fn files(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    paths.sort();
    paths
}

fn dirs(root: &Path) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(root)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    dirs
}

/// The world map a pack plays on: its campaign's or its site's.
fn pack_map(pack: &Path) -> Option<String> {
    let campaign = pack.join("campaign.json");
    if campaign.exists() {
        return read::<Value>(&campaign)["world"]["map"]
            .as_str()
            .map(str::to_owned);
    }
    let adventure = pack.join("adventure.json");
    if adventure.exists() {
        return read::<Value>(&adventure)["site"]["map"]
            .as_str()
            .map(str::to_owned);
    }
    None
}

/// Every pack: the shipped ones and the server's test pack.
fn packs() -> Vec<PathBuf> {
    let mut packs = dirs(&repo().join("scenarios"));
    packs.push(repo().join("crates/nat20-api-server/data"));
    packs
}

fn deck(dir: &Path) -> Deck {
    Deck::from_files(files(&dir.join("deck")).iter().map(|p| read::<DeckFile>(p)))
}

/// The deeds a pack's scenes write.
fn scene_deeds(pack: &Path) -> BTreeSet<String> {
    let mut written = BTreeSet::new();
    for path in files(&pack.join("scenes")) {
        let scene: SceneFile = read(&path);
        for check in &scene.checks {
            for consequence in check.on_success.iter().chain(&check.on_failure) {
                if let Consequence::Remember { deed } = consequence {
                    written.insert(deed.clone());
                }
            }
        }
        for encounter in &scene.encounters {
            written.extend(encounter.on_end.iter().map(|r| r.remember.clone()));
        }
        let creatures = scene
            .creatures
            .iter()
            .chain(scene.spawns.iter().flat_map(|s| s.creatures.iter()));
        written.extend(creatures.filter_map(|c| c.npc.as_deref().map(killed_deed)));
    }
    written
}

/// Every world: the shipped ones and the server's test world.
fn worlds() -> Vec<PathBuf> {
    let mut worlds = dirs(&repo().join("worlds"));
    worlds.extend(dirs(&repo().join("crates/nat20-api-server/data/worlds")));
    assert!(worlds.iter().any(|w| w.ends_with("wend")));
    worlds
}

/// A world's deck joined with its packs' decks, and the deeds written outside a deck: by the
/// packs' scenes, and by the engine for a company entry (`rides:<id>` too) and the NPC owner
/// (ENG-48).
fn on_world(world: &Path) -> (Deck, BTreeSet<String>) {
    let id = world.file_name().unwrap().to_str().unwrap().to_owned();
    let mut all = deck(world);
    let mut elsewhere = BTreeSet::new();
    let company = world.join("company.json");
    if company.exists() {
        elsewhere.extend(read::<CompanyFile>(&company).written());
    }
    for pack in packs()
        .iter()
        .filter(|p| pack_map(p).as_deref() == Some(&id))
    {
        all = all.join(deck(pack));
        elsewhere.extend(scene_deeds(pack));
        let campaign = pack.join("campaign.json");
        if let Some(owner) = campaign
            .exists()
            .then(|| read::<Value>(&campaign))
            .and_then(|c| c["world"]["caravan"]["owner"].as_str().map(str::to_owned))
            .and_then(|o| o.strip_prefix("npc:").map(str::to_owned))
        {
            elsewhere.insert(owner_dead_deed(&owner));
            elsewhere.insert(lost_a_horse_deed(&owner));
        }
    }
    (all, elsewhere)
}

#[test]
fn every_deed_a_card_reads_is_written_on_its_world() {
    for world in worlds() {
        let (all, elsewhere) = on_world(&world);
        all.check_deeds_written(&elsewhere)
            .unwrap_or_else(|e| panic!("{} and its packs: {e}", world.display()));
    }
}

/// Rules N2 and N3 of the allies-in-fights design (§6.1, MAP-24) on every roster: a `remembers`
/// line reads a deed something on its world writes, and no `look`, `heard` or `remembers` line
/// holds a digit.
#[test]
fn every_roster_line_reads_a_written_deed_and_holds_no_digit() {
    for world in worlds() {
        let file = world.join("npcs.json");
        if !file.exists() {
            continue;
        }
        let (all, elsewhere) = on_world(&world);
        let mut written = all.deeds_written();
        written.extend(elsewhere);
        let roster: Value = read(&file);
        for person in roster["npcs"].as_array().unwrap() {
            let id = person["id"].as_str().unwrap();
            let mut lines: Vec<&str> = ["look", "look_ru", "heard", "heard_ru"]
                .iter()
                .filter_map(|k| person[*k].as_str())
                .collect();
            for line in person["remembers"].as_array().into_iter().flatten() {
                let deed = line["deed"].as_str().unwrap();
                assert!(
                    written.contains(deed),
                    "{}: {id} remembers {deed}, which nothing writes",
                    world.display()
                );
                lines.extend(
                    ["you", "company", "you_ru", "company_ru"]
                        .iter()
                        .filter_map(|k| line[*k].as_str()),
                );
            }
            for line in lines {
                assert!(
                    !line.chars().any(|c| c.is_ascii_digit()),
                    "{}: {id}'s line holds a digit: {line}",
                    world.display()
                );
            }
        }
    }
}

/// The test pack's yard writes its deeds from scenes alone, so the rule above has scene deeds to
/// count.
#[test]
fn the_test_pack_scenes_write_deeds() {
    let deeds = scene_deeds(&repo().join("crates/nat20-api-server/data"));
    for deed in [
        "tracks_counted",
        "tracks_lost",
        "yard_yielded",
        "yard_to_the_end",
        "killed_grak",
    ] {
        assert!(deeds.contains(deed), "{deed}");
    }
}

/// The Mill's scenes write the deeds the Wendford cards read, and nothing else of the yard
/// (design §4.1): the yard's two outcomes, the cellar's marker, the boss's death. The green's
/// and the wrap-up's people stand in their scenes as creatures, so each one's death is a deed
/// too (ENG-36): the reeve, the miller and Wenna.
#[test]
fn the_mill_writes_its_deeds_into_the_wend_world() {
    let mill = repo().join("scenarios/the_silent_mill");
    assert_eq!(pack_map(&mill).as_deref(), Some("wend"));
    assert_eq!(
        scene_deeds(&mill),
        BTreeSet::from(
            [
                "snitt_yielded",
                "yard_to_the_end",
                "wenna_saved",
                "killed_gritch",
                "killed_osric_hale",
                "killed_bertil_pell",
                "killed_wenna_thorne"
            ]
            .map(String::from)
        )
    );
}

/// Design §4.2 rule 7 on the shipped packs: with only the Mill's deeds remembered, *Fair in
/// Wend*'s arrival pile at Wendford holds exactly the card for how the yard ended, and with no
/// rescue, none. A pile of one goes on the table with no draw-three and no pick (M11).
#[test]
fn wendford_meets_the_party_with_the_card_its_yard_wrote() {
    use nat20_world::{DeckState, Deed, DeedBook, When};
    let wend = repo().join("worlds/wend");
    let deck = deck(&wend).join(deck(&repo().join("scenarios/fair_in_wend")));
    let map: Value = read(&wend.join("map.json"));
    let discovered: BTreeSet<String> = map["places"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["id"].as_str().unwrap().to_owned())
        .collect();
    let remembered = |deeds: &[&str]| -> DeedBook {
        deeds
            .iter()
            .map(|d| {
                let deed = Deed {
                    by: vec!["bren".into()],
                    day: 1,
                    contract: 1,
                    saw: vec![],
                };
                (d.to_string(), deed)
            })
            .collect()
    };
    let pile = |deeds: &[&str]| -> Vec<String> {
        deck.pile(
            "wendford",
            When::Arrival,
            &discovered,
            &remembered(deeds),
            &DeckState::default(),
        )
        .into_iter()
        .map(|c| c.id.clone())
        .collect()
    };
    let reads = |id: &str, deed: &str| {
        deck.card(id)
            .and_then(|c| c.if_deeds.as_ref())
            .is_some_and(|d| d.ids().iter().any(|i| i == deed))
    };
    for (yard, other) in [
        ("snitt_yielded", "yard_to_the_end"),
        ("yard_to_the_end", "snitt_yielded"),
    ] {
        let cards = pile(&["wenna_saved", yard, "killed_gritch"]);
        assert_eq!(cards.len(), 1, "{yard}: {cards:?}");
        assert!(reads(&cards[0], yard), "{yard}: {cards:?}");
        assert!(!reads(&cards[0], other), "{yard}: {cards:?}");
    }
    assert!(pile(&["snitt_yielded"]).is_empty());
    assert!(pile(&["yard_to_the_end"]).is_empty());
    assert!(pile(&[]).is_empty());
}
