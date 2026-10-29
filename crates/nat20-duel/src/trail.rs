//! Milestone 3's exit run: Bren plays the five scenes of the test scenario `m3_trail` through
//! the engine API as the DM drives them, and the transcript cites every engine roll. Scene 1
//! asks the reeve (a check), scene 2 follows the tracks (a check that can set off the snare
//! hazard) and spots the lookouts (a flag that surprises them), scene 3 is the yard fight with
//! its surrender, scene 4 questions the prisoner and takes a short rest, and scene 5 is the
//! cellar fight with its spawns, ended by the DM.

use nat20_api_contract::{
    Awaiting, CONTRACT_VERSION, CheckSpec, Command, CommandResult, EndCombatReason, Event, Handle,
    HitDiceSpend, LifeState, MoveTarget, OptionId, Side, State,
};

use crate::{client::Client, duel::call};

const BREN: &str = "bren";

/// The round of the cellar fight in which the DM calls the reserve.
const RESERVE_ROUND: u32 = 2;
/// The round of the cellar fight at whose first turn for Bren the DM ends it.
const CELLAR_LAST_ROUND: u32 = 4;

/// Plays the trail once. Returns the transcript and the full (DM) session log. `seed` seeds the
/// dice; `None` lets the engine pick one.
pub fn run_trail(seed: Option<u32>) -> (String, Vec<Event>) {
    play(&mut Client::default(), seed)
}

/// Plays the seeded trail and returns it as conformance fixture lines, request ids `t-N`, ending
/// with Bren's player view of the whole log.
pub fn record_fixture(seed: u32) -> String {
    let mut client = Client::with_id_prefix(Default::default(), "t");
    play(&mut client, Some(seed));
    client.send(BREN, Command::GetState);
    client.send(BREN, Command::Events { since: 0 });
    client
        .lines
        .iter()
        .map(|(request, response)| {
            let response = response.replace(CONTRACT_VERSION, "$CONTRACT_VERSION");
            format!("{{\"request\": {request}, \"response\": {response}}}\n")
        })
        .collect()
}

fn play(client: &mut Client, seed: Option<u32>) -> (String, Vec<Event>) {
    let mut t = String::new();
    call(client, &mut t, Command::NewSession { seed });
    scenes(client, &mut t);

    t.push_str("\nFinal state:\n");
    let state = client.send("dm", Command::GetState);
    if let Some(CommandResult::GetState {
        state: State::Dm { creatures, .. },
    }) = state.result
    {
        for c in &creatures {
            t.push_str(&format!(
                "  {} ({}): HP {}/{}, {:?}\n",
                c.handle.0, c.name, c.hp, c.hp_max, c.life_state
            ));
        }
    }
    let log = client.send("dm", Command::Events { since: 0 });
    let Some(CommandResult::Events { events, .. }) = log.result else {
        panic!("events failed: {:?}", log.error);
    };
    (t, events)
}

/// The five scenes in order. The run stops after the yard fight if it leaves Bren down: with no
/// one standing there is no one to carry on.
fn scenes(client: &mut Client, t: &mut String) {
    t.push_str("\n=== Scene 1: the village green ===\n");
    load(client, t, "m3_s1_green", &[]);
    walk(client, t, "reeve_porch");
    check(client, t, "reeve_insight");

    t.push_str("\n=== Scene 2: the road to the mill ===\n");
    load(client, t, "m3_s2_road", &[BREN]);
    walk(client, t, "snare_bend");
    check(client, t, "find_tracks");
    walk(client, t, "mill_gate");
    check(client, t, "spot_lookouts");

    t.push_str("\n=== Scene 3: the mill yard ===\n");
    load(client, t, "m3_s3_yard", &[BREN]);
    fight(client, t, "yard_fight", |_, _| None);
    if !bren_standing(client, t) {
        return;
    }
    // The goblins that surrendered and are still up come along as prisoners
    let prisoners: Vec<String> = dm_state(client)
        .1
        .into_iter()
        .filter(|(_, side, life)| *side == Side::Neutral && *life == LifeState::Conscious)
        .map(|(handle, ..)| handle)
        .collect();

    t.push_str("\n=== Scene 4: the storeroom ===\n");
    let mut party = vec![BREN];
    party.extend(prisoners.iter().map(String::as_str));
    load(client, t, "m3_s4_prisoner", &party);
    check(client, t, "interrogate");
    call(
        client,
        t,
        Command::ShortRest {
            participants: vec![Handle(BREN.into())],
            hit_dice: vec![HitDiceSpend {
                handle: Handle(BREN.into()),
                count: 1,
            }],
        },
    );

    t.push_str("\n=== Scene 5: the cellar ===\n");
    load(client, t, "m3_s5_cellar", &[BREN]);
    let mut reserve_called = false;
    fight(client, t, "cellar_fight", |round, _| {
        if round >= CELLAR_LAST_ROUND {
            Some(Command::EndCombat {
                reason: EndCombatReason::Scenario,
            })
        } else if round >= RESERVE_ROUND && !reserve_called {
            reserve_called = true;
            Some(Command::Spawn {
                spawn_id: "reserve".into(),
            })
        } else {
            None
        }
    });
}

fn load(client: &mut Client, t: &mut String, scene_id: &str, party: &[&str]) {
    let response = call(
        client,
        t,
        Command::LoadScene {
            scene_id: scene_id.into(),
            party: party.iter().map(|h| Handle((*h).into())).collect(),
        },
    );
    assert!(response.ok, "load_scene {scene_id}: {:?}", response.error);
}

fn walk(client: &mut Client, t: &mut String, anchor: &str) {
    let response = call(
        client,
        t,
        Command::Move {
            actor: Handle(BREN.into()),
            to: MoveTarget::Anchor {
                anchor: anchor.into(),
            },
            prompt_id: None,
            partial: false,
        },
    );
    assert!(response.ok, "move to {anchor}: {:?}", response.error);
}

fn check(client: &mut Client, t: &mut String, check_id: &str) {
    let response = call(
        client,
        t,
        Command::RequestCheck {
            actor: Handle(BREN.into()),
            check: CheckSpec::Scenario {
                check_id: check_id.into(),
            },
        },
    );
    assert!(response.ok, "check {check_id}: {:?}", response.error);
}

/// Whether Bren is still conscious after a fight; if not, the transcript says the run ends.
fn bren_standing(client: &mut Client, t: &mut String) -> bool {
    let standing = dm_state(client)
        .1
        .iter()
        .any(|(handle, _, life)| handle == BREN && *life == LifeState::Conscious);
    if !standing {
        t.push_str("\nBren is down, so the trail ends here.\n");
    }
    standing
}

/// The round and every creature's handle, side and life state, as the DM sees them.
fn dm_state(client: &mut Client) -> (Option<u32>, Vec<(String, Side, LifeState)>) {
    let state = client.send("dm", Command::GetState);
    let Some(CommandResult::GetState {
        state: State::Dm {
            round, creatures, ..
        },
    }) = state.result
    else {
        panic!("get_state failed: {:?}", state.error);
    };
    (
        round,
        creatures
            .into_iter()
            .map(|c| (c.handle.0, c.side, c.life_state))
            .collect(),
    )
}

/// Starts the encounter and plays Bren until the fight is over. At each of Bren's action
/// prompts the DM first calls a surrender the engine allows, then whatever `dm_call` returns
/// for the round. Bren takes Second Wind at half HP or less, otherwise walks up to the nearest
/// standing hostile creature and attacks it with the longsword, uses Action Surge once per
/// round for another attack, then ends the turn. He always takes a reaction.
fn fight(
    client: &mut Client,
    t: &mut String,
    encounter_id: &str,
    mut dm_call: impl FnMut(u32, &mut Client) -> Option<Command>,
) {
    let mut response = call(
        client,
        t,
        Command::StartCombat {
            encounter_id: encounter_id.into(),
        },
    );
    assert!(
        response.ok,
        "start_combat {encounter_id}: {:?}",
        response.error
    );
    let mut surged_round = None;
    let mut dm_round = None;

    for _ in 0..300 {
        match response.awaiting.clone() {
            Awaiting::Reaction {
                prompt_id, actor, ..
            } => {
                response = call(
                    client,
                    t,
                    Command::React {
                        actor,
                        prompt_id,
                        choice: Some(0),
                    },
                );
            }
            Awaiting::Action { prompt_id, actor } => {
                assert_eq!(actor.0, BREN, "scripted creatures act inside the engine");
                let state = client.send("dm", Command::GetState);
                let Some(CommandResult::GetState {
                    state:
                        State::Dm {
                            creatures,
                            round,
                            encounters,
                            ..
                        },
                }) = state.result
                else {
                    panic!("get_state failed: {:?}", state.error);
                };
                let round = round.unwrap_or(1);
                if encounters
                    .iter()
                    .any(|e| e.running && e.surrender_available)
                {
                    response = call(
                        client,
                        t,
                        Command::EndCombat {
                            reason: EndCombatReason::Surrender,
                        },
                    );
                    assert!(response.ok, "surrender: {:?}", response.error);
                    continue;
                }
                if dm_round != Some(round) {
                    dm_round = Some(round);
                    if let Some(command) = dm_call(round, client) {
                        response = call(client, t, command);
                        assert!(response.ok, "DM call: {:?}", response.error);
                        continue;
                    }
                }

                let me = creatures
                    .iter()
                    .find(|c| c.handle.0 == BREN)
                    .expect("the DM sees Bren");
                let legal = client.send(
                    "dm",
                    Command::LegalActions {
                        actor: Handle(BREN.into()),
                    },
                );
                let Some(CommandResult::LegalActions { options, .. }) = legal.result else {
                    panic!("legal_actions failed: {:?}", legal.error);
                };
                let ids: Vec<&str> = options.iter().map(|o| o.option_id.0.as_str()).collect();
                t.push_str(&format!("  options for {BREN}: {}\n", ids.join(", ")));
                let has = |id: &str| ids.contains(&id);
                let submit = |option_id: &str, targets: Vec<Handle>| Command::Submit {
                    actor: Handle(BREN.into()),
                    prompt_id: Some(prompt_id.clone()),
                    option_id: OptionId(option_id.into()),
                    targets,
                    point: None,
                    aim: None,
                    variant: None,
                };
                let standing = |side: Side| {
                    creatures
                        .iter()
                        .filter(move |c| c.side == side && c.life_state == LifeState::Conscious)
                };
                let nearest = standing(Side::Hostile).min_by(|a, b| {
                    distance(&me.position_ft, &a.position_ft)
                        .total_cmp(&distance(&me.position_ft, &b.position_ft))
                });
                let attack = options
                    .iter()
                    .find(|o| o.option_id.0 == "melee_attack/longsword");
                let in_reach = |handle: &Handle| {
                    attack.is_some_and(|o| {
                        o.targets.iter().any(|c| &c.handle == handle && c.in_range)
                    })
                };

                let command = if me.hp * 2 <= me.hp_max && has("fighter/second_wind") {
                    submit("fighter/second_wind", Vec::new())
                } else if let Some(target) = nearest {
                    if in_reach(&target.handle) {
                        submit("melee_attack/longsword", vec![target.handle.clone()])
                    } else if attack.is_some() {
                        // Walk up with a `move` of its own, as the trail was recorded before
                        // a submit's walk was logged (API-25)
                        Command::Move {
                            actor: Handle(BREN.into()),
                            to: MoveTarget::Creature {
                                handle: target.handle.clone(),
                            },
                            prompt_id: Some(prompt_id.clone()),
                            partial: false,
                        }
                    } else if has("fighter/action_surge") && surged_round != Some(round) {
                        surged_round = Some(round);
                        submit("fighter/action_surge", Vec::new())
                    } else {
                        end_turn(&prompt_id)
                    }
                } else {
                    end_turn(&prompt_id)
                };
                response = call(client, t, command);
                if !response.ok {
                    response = call(client, t, end_turn(&prompt_id));
                }
            }
            Awaiting::CombatOver { .. } | Awaiting::Idle | Awaiting::NoSession => return,
        }
    }
    panic!("{encounter_id} never ended");
}

fn end_turn(prompt_id: &nat20_api_contract::PromptId) -> Command {
    Command::EndTurn {
        actor: Handle(BREN.into()),
        prompt_id: prompt_id.clone(),
    }
}

fn distance(a: &nat20_api_contract::PointFt, b: &nat20_api_contract::PointFt) -> f32 {
    ((a.x_ft - b.x_ft).powi(2) + (a.y_ft - b.y_ft).powi(2) + (a.z_ft - b.z_ft).powi(2)).sqrt()
}
