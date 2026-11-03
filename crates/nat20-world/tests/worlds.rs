//! Every world shipped in the repository loads and validates (MAP-6): the shared worlds in
//! `worlds/` and the server's test worlds.

use std::path::{Path, PathBuf};

use nat20_world::{Caravan, Clock, Deck, DeckFile, Goods, Pace, Target, World, WorldMap};

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read<T: serde::de::DeserializeOwned>(path: &Path) -> T {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

fn world_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for root in ["worlds", "crates/nat20-api-server/data/worlds"] {
        for entry in std::fs::read_dir(repo().join(root)).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                dirs.push(path);
            }
        }
    }
    dirs.sort();
    dirs
}

#[test]
fn every_world_validates() {
    let dirs = world_dirs();
    assert!(dirs.iter().any(|d| d.ends_with("wend")));
    for dir in dirs {
        let map: WorldMap = read(&dir.join("map.json"));
        map.validate()
            .unwrap_or_else(|e| panic!("{}: {e}", dir.display()));
        let goods: Goods = read(&dir.join("goods.json"));
        goods
            .validate()
            .unwrap_or_else(|e| panic!("{}: {e}", dir.display()));
        for road in &map.roads {
            assert!(
                !road.zone.is_empty(),
                "{}: road {} has no zone",
                dir.display(),
                road.id
            );
        }
        deck(&dir)
            .validate(&map)
            .unwrap_or_else(|e| panic!("{}: {e}", dir.display()));
    }
}

/// A world's deck, files in name order, as the server reads it.
fn deck(dir: &Path) -> Deck {
    let Ok(entries) = std::fs::read_dir(dir.join("deck")) else {
        return Deck::default();
    };
    let mut paths: Vec<PathBuf> = entries.map(|e| e.unwrap().path()).collect();
    paths.sort();
    Deck::from_files(paths.iter().map(|p| read::<DeckFile>(p)))
}

/// About two Blade cards for each caravan card (design, card kinds): a human Blade gets a say
/// more often than the merchant's calls.
#[test]
fn the_wend_deck_gives_the_blades_most_cards() {
    let deck = deck(&repo().join("worlds/wend"));
    let caravan = deck
        .cards
        .iter()
        .filter(|c| c.target == Target::Caravan)
        .count();
    let blades = deck
        .cards
        .iter()
        .filter(|c| c.target == Target::Blades)
        .count();
    assert!(caravan > 0);
    assert!(
        (3 * caravan..=6 * caravan).contains(&(2 * blades)),
        "{blades} Blade cards to {caravan} caravan cards"
    );
}

fn wend() -> World {
    let dir = repo().join("worlds/wend");
    let caravan: Caravan = serde_json::from_str(
        r#"{"owner": "npc:merchant", "wagons": [{"n": 1, "vehicle": "wagon", "vehicle_lb": 400,
            "team": [{"animal": "draft_horse", "capacity_lb": 540}, {"animal": "draft_horse", "capacity_lb": 540}],
            "cargo": {"salt": 1000, "rations": 20}}]}"#,
    )
    .unwrap();
    let deck = deck(&dir);
    World::new(
        read(&dir.join("map.json")),
        read(&dir.join("goods.json")),
        vec!["wendford".into(), "wendmouth".into()],
        caravan,
        "wendford",
        Clock::at(1, 8, 0),
    )
    .unwrap()
    .with_deck(deck)
    .unwrap()
}

#[test]
fn the_river_road_draws_a_lowland_card() {
    let mut world = wend();
    world
        .travel(Some("wendmouth"), Pace::Normal, false)
        .unwrap();
    let mut dice = nat20_world::ListDice::new([1]);
    let card = world.draw_after_leg("river_road", &mut dice).unwrap();
    assert_eq!(world.deck.card(&card).unwrap().zone, "lowland");
}

#[test]
fn wendmouth_is_a_day_downriver_by_wagon() {
    let mut world = wend();
    let leg = world
        .travel(Some("wendmouth"), Pace::Normal, false)
        .unwrap();
    assert!(leg.arrived);
    assert_eq!(leg.miles, 20);
    // A normal day is 24 miles; 4 are left.
    assert_eq!(world.miles_left_today(Pace::Normal), 4);
}

#[test]
fn the_packs_have_their_slots_and_the_edges_are_closed() {
    let world = wend();
    let slots: Vec<_> = world
        .map
        .places
        .iter()
        .filter_map(|p| p.pack_slot.as_deref())
        .collect();
    assert!(slots.contains(&"the_silent_mill"));
    assert!(slots.contains(&"lair_of_arachas"));
    assert!(!world.map.edges.is_empty());
    let mut world = world;
    for edge in world.map.edges.clone() {
        assert!(
            world.travel(Some(&edge.id), Pace::Normal, false).is_err(),
            "no road leads to the edge {}",
            edge.id
        );
    }
}

#[test]
fn only_the_valley_floor_is_known_at_the_start() {
    let world = wend();
    let mut known: Vec<_> = world.state.discovered.iter().map(String::as_str).collect();
    known.sort_unstable();
    assert_eq!(known, ["pells_mill", "wendford", "wendmouth"]);
}
