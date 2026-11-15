//! Every deed a card reads is written somewhere a party can reach (design `m13-system-design.md`
//! §4.2 rule 8, API-57): for each world, a deed that a card or a choice of the world's deck joined
//! with its packs' decks reads is written by a deck effect, a card fight's `npc`, or a scene of a
//! pack on that world (a check's `remember`, an encounter's `on_end`, a creature's `npc`). A pack
//! is on a world by `campaign.json`'s `world.map` or `adventure.json`'s `site.map`.
//!
//! The test lives here, not in the world crate, because only the server reads both the deck and
//! the scene formats.

use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use nat20_api_contract::{Consequence, SceneFile};
use nat20_world::{Deck, DeckFile, killed_deed};
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

#[test]
fn every_deed_a_card_reads_is_written_on_its_world() {
    let mut worlds = dirs(&repo().join("worlds"));
    worlds.extend(dirs(&repo().join("crates/nat20-api-server/data/worlds")));
    assert!(worlds.iter().any(|w| w.ends_with("wend")));
    for world in worlds {
        let id = world.file_name().unwrap().to_str().unwrap().to_owned();
        let mut all = deck(&world);
        let mut by_scenes = BTreeSet::new();
        for pack in packs()
            .iter()
            .filter(|p| pack_map(p).as_deref() == Some(&id))
        {
            all = all.join(deck(pack));
            by_scenes.extend(scene_deeds(pack));
        }
        all.check_deeds_written(&by_scenes)
            .unwrap_or_else(|e| panic!("{} and its packs: {e}", world.display()));
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
