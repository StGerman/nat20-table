//! Milestone 1: one Fighter against one Goblin Warrior, end to end through the engine API,
//! with every roll audited against the engine log.

use nat20_api_contract::{
    Command, CommandResult, Event, EventKind, Handle, RollKind, RollView, State,
};
use nat20_duel::{
    audit::{audit_transcript, check_roll_arithmetic},
    client::Client,
    duel::run_duel,
};

/// Every roll in the log, in the DM's full view.
fn rolls(log: &[Event]) -> Vec<&RollView> {
    log.iter()
        .filter_map(|e| match &e.kind {
            EventKind::Roll { roll } => Some(roll),
            _ => None,
        })
        .collect()
}

fn kind(roll: &RollView) -> RollKind {
    match roll {
        RollView::Full { kind, .. } => *kind,
        other => panic!("the DM sees every roll in full: {other:?}"),
    }
}

#[test]
fn duel_finishes_and_every_roll_is_in_the_engine_log() {
    // Dice are random, so play enough duels to cover hits, misses, crits, Second Wind and
    // both sides winning at least sometimes.
    for run in 0..25 {
        let (transcript, log) = run_duel();

        assert!(
            log.iter()
                .any(|e| matches!(e.kind, EventKind::CombatOver { .. })),
            "run {run}: combat never ended\n{transcript}"
        );
        let rolls = rolls(&log);
        assert_eq!(
            rolls
                .iter()
                .filter(|r| kind(r) == RollKind::Initiative)
                .count(),
            2,
            "run {run}: expected two initiative rolls\n{transcript}"
        );
        assert!(
            rolls.iter().any(|r| kind(r) == RollKind::Attack),
            "run {run}: no attack rolled\n{transcript}"
        );
        for roll in &rolls {
            check_roll_arithmetic(roll).unwrap_or_else(|e| panic!("run {run}: {e}\n{transcript}"));
        }

        let report = audit_transcript(&transcript, &log, true);
        assert!(
            report.passed(),
            "run {run}: audit failed: {:?}\n{transcript}",
            report.problems
        );
        assert_eq!(report.rolls_cited, report.rolls_in_log);
    }
}

#[test]
fn tampered_transcript_fails_the_audit() {
    let (transcript, log) = run_duel();
    let (id, total) = rolls(&log)
        .into_iter()
        .find_map(|r| match r {
            RollView::Full {
                id,
                kind: RollKind::Attack,
                total,
                ..
            } => Some((id.0.clone(), *total)),
            _ => None,
        })
        .expect("every duel has an attack");

    // An LLM "improving" a roll: same citation, different total.
    let line = transcript
        .lines()
        .find(|l| l.contains(&format!("[{id}]")))
        .unwrap();
    let forged_line = line.replace(&format!(" = {total} "), &format!(" = {} ", total + 7));
    assert_ne!(line, forged_line);
    let forged = transcript.replace(line, &forged_line);
    assert!(!audit_transcript(&forged, &log, true).passed());

    // An invented roll with no engine citation.
    let invented = format!("{transcript}\nThe goblin rolls a d20 and gets 19.\n");
    assert!(!audit_transcript(&invented, &log, true).passed());

    // A dropped roll.
    let dropped: String = transcript
        .lines()
        .filter(|l| !l.contains(&format!("[{id}]")))
        .map(|l| format!("{l}\n"))
        .collect();
    assert!(!audit_transcript(&dropped, &log, true).passed());
}

#[test]
fn goblin_warrior_matches_the_srd_stat_block() {
    let mut client = Client::default();
    client.send("dm", Command::NewSession { seed: None });
    client.send(
        "dm",
        Command::LoadScene {
            scene_id: "duel".into(),
            party: Vec::new(),
        },
    );
    let started = client.send(
        "dm",
        Command::StartCombat {
            participants: vec![Handle("bren".into()), Handle("goblin".into())],
            surprised: Vec::new(),
        },
    );
    let Some(CommandResult::StartCombat {
        state: State::Dm { creatures, .. },
    }) = started.result
    else {
        panic!("start_combat failed: {:?}", started.error);
    };
    let goblin = creatures.iter().find(|c| c.handle.0 == "goblin").unwrap();
    assert_eq!(goblin.name, "Goblin Warrior");
    assert_eq!(goblin.ac, 15);
    assert_eq!(goblin.hp_max, 10);
    let bren = creatures.iter().find(|c| c.handle.0 == "bren").unwrap();
    assert_eq!(bren.ac, 17, "Chain Mail 16 + Defense 1");
    assert_eq!(bren.hp_max, 20, "level 2 Fighter, CON 14");
    assert_eq!(bren.speed_ft, 30);

    // Play duels until the goblin has attacked and hit, then check its Scimitar numbers:
    // +4 to hit, 1d6+2 damage.
    for _ in 0..40 {
        let (_, log) = run_duel();
        let goblin_rolls: Vec<_> = rolls(&log)
            .into_iter()
            .filter_map(|r| match r {
                RollView::Full {
                    roller,
                    kind,
                    label,
                    dice,
                    modifiers,
                    ..
                } if roller.0 == "goblin" => Some((*kind, label, dice, modifiers)),
                _ => None,
            })
            .collect();
        let Some((_, _, _, attack)) = goblin_rolls.iter().find(|r| r.0 == RollKind::Attack) else {
            continue;
        };
        let to_hit: i32 = attack.iter().map(|m| m.value).sum();
        assert_eq!(to_hit, 4, "Scimitar attack bonus: {attack:?}");

        let Some((_, label, dice, modifiers)) =
            goblin_rolls.iter().find(|r| r.0 == RollKind::Damage)
        else {
            continue;
        };
        let expected = if label.contains("critical") {
            "2d6"
        } else {
            "1d6"
        };
        assert_eq!(dice[0].dice, expected);
        let flat: i32 = modifiers.iter().map(|m| m.value).sum();
        assert_eq!(flat, 2, "Scimitar damage bonus: {modifiers:?}");
        return;
    }
    panic!("the goblin never hit in 40 duels");
}
