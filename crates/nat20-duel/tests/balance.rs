//! The balance sweep's smoke test (M7 design §3.6): two seeds of the chain through the real pack,
//! so the driver keeps working as the engine and the pack change. The measurement itself is
//! `nat20-balance`'s, run by hand.

use std::path::PathBuf;

use nat20_duel::balance::{report, run_chain};

#[test]
fn two_seeds_play_the_chain_and_report() {
    let pack = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../scenarios/the_silent_mill");
    let results: Vec<_> = [1, 2]
        .into_iter()
        .map(|seed| run_chain(&pack, seed))
        .collect();
    for result in &results {
        assert_eq!(result.fights[0].encounter, "yard_fight", "{result:?}");
        assert!(result.fights.iter().all(|f| !f.stalemate), "{result:?}");
        assert!(result.fights.iter().all(|f| f.rounds > 0), "{result:?}");
        // The cellar is fought only after a won yard.
        assert_eq!(result.fights.len() == 2, result.fights[0].won, "{result:?}");
        assert!(!result.reached_scene_6_standing || result.survived);
    }
    let table = report(&results);
    assert!(table.starts_with("Reached Scene 6 standing: "), "{table}");
    assert!(table.contains("| yard_fight | all | 2 |"), "{table}");
}
