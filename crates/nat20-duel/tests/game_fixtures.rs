//! The game fixtures (M6 step 5, `game/test/fixtures/`) through the transcript audit and the leak
//! scan (step 6, TASKS.md AGT-8, AGT-15, AGT-19): what CI runs on every game fixture.
//! `game/test/loop.test.ts` proves the files are what the game writes today (each replays byte
//! for byte); these tests prove they pass, and that a planted problem doesn't. The Milestone 7
//! fixtures play the real scenario pack, so their leak scan reads its secrets.

use std::{fs, path::PathBuf, process::Command};

use nat20_duel::{
    game_audit::{TranscriptRecord, audit_game, read_session_log, read_transcript},
    leak_scan::{Secrets, leaks_in, scan_inputs},
};

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../game/test/fixtures")
}

/// The engine's test scenes: the pack the game fixtures play.
fn pack() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../nat20-api-server/data")
}

/// The pack a fixture plays: the Milestone 7 ones play The Silent Mill itself (AGT-39), the rest
/// the engine's test scenes.
fn pack_of(name: &str) -> PathBuf {
    if name.starts_with("m7_") {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../scenarios/the_silent_mill")
    } else {
        pack()
    }
}

/// Every game fixture, by name: `<name>.transcript.jsonl` and its siblings.
fn fixtures() -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(fixtures_dir())
        .expect("game/test/fixtures")
        .filter_map(|entry| {
            let name = entry.ok()?.file_name().to_string_lossy().to_string();
            name.strip_suffix(".transcript.jsonl").map(str::to_string)
        })
        .collect();
    names.sort();
    names
}

fn read(name: &str, file: &str) -> String {
    let path = fixtures_dir().join(format!("{name}.{file}"));
    fs::read_to_string(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}

#[test]
fn every_game_fixture_passes_the_audit_and_the_leak_scan() {
    let names = fixtures();
    assert!(
        ["m5_yard", "m3_trail", "m7_adventure"]
            .iter()
            .all(|n| names.contains(&n.to_string())),
        "{names:?}"
    );
    let secrets = Secrets::of_pack(&pack()).unwrap();
    assert!(secrets.ids.contains("yard_fight") && secrets.ids.contains("reeve_insight"));
    let mill = Secrets::of_pack(&pack_of("m7_adventure")).unwrap();
    assert!(mill.ids.contains("cellar_fight"), "{:?}", mill.ids);
    for name in names {
        let secrets = if name.starts_with("m7_") {
            &mill
        } else {
            &secrets
        };
        let transcript = read_transcript(&read(&name, "transcript.jsonl")).unwrap();
        let log = read_session_log(&read(&name, "session-log.jsonl")).unwrap();
        let audit = audit_game(&transcript, &log, true);
        assert!(audit.passed(), "{name}: {:#?}", audit.problems);
        assert!(audit.rolls_in_log > 0 && audit.rolls_cited == audit.rolls_in_log);
        let scan = scan_inputs(&read(&name, "inputs.jsonl"), secrets).unwrap();
        assert!(scan.passed(), "{name}: {:#?}", scan.leaks);
        assert!(scan.inputs > 0 && scan.human_lines > 0, "{name}: {scan:?}");
    }
}

/// The regression D4 asked for: the human's own roll line, as the human saw it, passes against
/// the player view, and the DM's line for the same roll can't stand in for it.
#[test]
fn the_humans_roll_line_is_held_to_the_player_view() {
    let mut transcript = read_transcript(&read("m5_yard", "transcript.jsonl")).unwrap();
    let log = read_session_log(&read("m5_yard", "session-log.jsonl")).unwrap();
    let human = transcript
        .iter()
        .position(|r| r.channel == "to:bren" && r.rolls.len() == 1 && r.text.contains("vs "))
        .expect("an attack roll on the human's screen");
    let id = transcript[human].rolls[0].clone();
    assert!(
        !transcript[human].text.contains(" vs AC "),
        "{}",
        transcript[human].text
    );
    assert!(audit_game(&transcript, &log, true).passed());

    transcript[human].text = transcript
        .iter()
        .find(|r| r.channel == "dm" && r.rolls == [id.clone()])
        .unwrap()
        .text
        .clone();
    assert!(transcript[human].text.contains(" vs AC "));
    let report = audit_game(&transcript, &log, true);
    assert!(
        report
            .problems
            .iter()
            .any(|p| p.contains("not the next engine event bren sees")),
        "{:#?}",
        report.problems
    );
}

#[test]
fn an_edited_roll_or_an_uncited_one_fails_the_audit() {
    let transcript = read_transcript(&read("m3_trail", "transcript.jsonl")).unwrap();
    let log = read_session_log(&read("m3_trail", "session-log.jsonl")).unwrap();
    let roll = transcript
        .iter()
        .position(|r| r.channel == "dm" && r.rolls.len() == 1)
        .unwrap();

    let mut edited = transcript.clone();
    edited[roll].text = edited[roll].text.replacen(" = ", " = 1", 1);
    assert!(!audit_game(&edited, &log, true).passed());

    let id = &transcript[roll].rolls[0];
    let dropped: Vec<TranscriptRecord> = transcript
        .iter()
        .filter(|r| !r.rolls.contains(id))
        .cloned()
        .collect();
    let report = audit_game(&dropped, &log, true);
    assert_eq!(
        report.problems,
        [format!("engine roll {id} is cited on no channel")]
    );
}

/// The scan is not vacuous: every line of the DM's channel in the trail, given to the human, trips
/// it in each of the ways the DM's view differs.
#[test]
fn the_dms_channel_given_to_a_player_fails_the_leak_scan() {
    let secrets = Secrets::of_pack(&pack()).unwrap();
    let transcript = read_transcript(&read("m3_trail", "transcript.jsonl")).unwrap();
    let leaks: Vec<String> = transcript
        .iter()
        .filter(|r| r.channel == "dm")
        .flat_map(|r| leaks_in("bren", &r.text, &secrets))
        .collect();
    for kind in [
        "an AC or DC number",
        "a DM-only event",
        "another creature's Hit Points",
    ] {
        assert!(
            leaks.iter().any(|l| l.starts_with(kind)),
            "no {kind}: {leaks:#?}"
        );
    }
}

#[test]
fn the_cli_passes_a_clean_run_and_fails_a_planted_leak() {
    let run = std::env::temp_dir().join(format!("nat20-audit-{}", std::process::id()));
    fs::create_dir_all(&run).unwrap();
    for file in ["transcript.jsonl", "session-log.jsonl", "inputs.jsonl"] {
        fs::write(run.join(file), read("m5_yard", file)).unwrap();
    }
    let audit = || {
        Command::new(env!("CARGO_BIN_EXE_nat20-audit"))
            .arg("--pack")
            .arg(pack())
            .arg(&run)
            .output()
            .unwrap()
    };
    let clean = audit();
    let stdout = String::from_utf8_lossy(&clean.stdout).to_string();
    assert!(clean.status.success(), "{stdout}");
    assert!(
        stdout.contains("0 problems") && stdout.contains("0 leaks"),
        "{stdout}"
    );

    let planted = r#"{"seat":"maren","text":"What happened:\nThe DM starts yard_fight."}"#;
    fs::write(
        run.join("inputs.jsonl"),
        read("m5_yard", "inputs.jsonl") + planted + "\n",
    )
    .unwrap();
    let leaky = audit();
    let stdout = String::from_utf8_lossy(&leaky.stdout).to_string();
    assert_eq!(leaky.status.code(), Some(1), "{stdout}");
    assert!(
        stdout.contains("leak: inputs line") && stdout.contains("yard_fight"),
        "{stdout}"
    );
    fs::remove_dir_all(&run).unwrap();
}
