//! A scripted Fighter that plays the `duel` scene through the engine API as the DM and writes
//! a transcript citing every engine roll.

use nat20_api_contract::{
    Awaiting, Command, CommandResult, Event, EventKind, Handle, OptionId, PromptId, Response,
    RollView, State,
};
use nat20_api_server::render;

use crate::client::Client;

const FIGHTER: &str = "bren";
const GOBLIN: &str = "goblin";

/// Plays one duel. The Fighter takes Second Wind at half HP or less, otherwise attacks the
/// goblin with the longsword, uses Action Surge once per round for another attack, then ends
/// the turn. It always takes a reaction. Returns the transcript and the full (DM) session log.
pub fn run_duel() -> (String, Vec<Event>) {
    let mut client = Client::default();
    let mut transcript = String::new();
    call(
        &mut client,
        &mut transcript,
        Command::NewSession { seed: None },
    );
    call(
        &mut client,
        &mut transcript,
        Command::LoadScene {
            scene_id: "duel".into(),
            party: Vec::new(),
        },
    );
    let mut response = call(
        &mut client,
        &mut transcript,
        Command::StartCombat {
            participants: vec![Handle(FIGHTER.into()), Handle(GOBLIN.into())],
            surprised: Vec::new(),
        },
    );
    let mut surged_round = None;

    for _ in 0..200 {
        match response.awaiting.clone() {
            Awaiting::Reaction {
                prompt_id, actor, ..
            } => {
                response = call(
                    &mut client,
                    &mut transcript,
                    Command::React {
                        actor,
                        prompt_id,
                        choice: Some(0),
                    },
                );
            }
            Awaiting::Action { prompt_id, actor } => {
                assert_eq!(actor.0, FIGHTER, "scripted creatures act inside the engine");
                let state = client.send("dm", Command::GetState);
                let Some(CommandResult::GetState {
                    state:
                        State::Dm {
                            creatures, round, ..
                        },
                }) = state.result
                else {
                    panic!("get_state failed: {:?}", state.error);
                };
                let me = creatures
                    .iter()
                    .find(|c| c.handle.0 == FIGHTER)
                    .expect("the DM sees Bren");

                let legal = client.send(
                    "dm",
                    Command::LegalActions {
                        actor: Handle(FIGHTER.into()),
                    },
                );
                let Some(CommandResult::LegalActions { options, .. }) = legal.result else {
                    panic!("legal_actions failed: {:?}", legal.error);
                };
                let ids: Vec<&str> = options.iter().map(|o| o.option_id.0.as_str()).collect();
                transcript.push_str(&format!("  options for {FIGHTER}: {}\n", ids.join(", ")));
                let has = |id: &str| ids.contains(&id);

                let submit = |option_id: &str, targets: Vec<Handle>| Command::Submit {
                    actor: Handle(FIGHTER.into()),
                    prompt_id: prompt_id.clone(),
                    option_id: OptionId(option_id.into()),
                    targets,
                    point: None,
                    variant: None,
                };
                let command = if me.hp * 2 <= me.hp_max && has("fighter/second_wind") {
                    submit("fighter/second_wind", Vec::new())
                } else if has("melee_attack/longsword") {
                    submit("melee_attack/longsword", vec![Handle(GOBLIN.into())])
                } else if has("fighter/action_surge") && surged_round != round {
                    surged_round = round;
                    submit("fighter/action_surge", Vec::new())
                } else {
                    end_turn(prompt_id.clone())
                };
                response = call(&mut client, &mut transcript, command);
                if !response.ok {
                    response = call(&mut client, &mut transcript, end_turn(prompt_id));
                }
            }
            Awaiting::CombatOver { .. } | Awaiting::Idle | Awaiting::NoSession => break,
        }
    }

    let state = client.send("dm", Command::GetState);
    if let Some(CommandResult::GetState {
        state: State::Dm { creatures, .. },
    }) = state.result
    {
        transcript.push_str("\nFinal state:\n");
        for c in &creatures {
            transcript.push_str(&format!(
                "  {} ({}): HP {}/{}, AC {}, {:?}\n",
                c.handle.0, c.name, c.hp, c.hp_max, c.ac, c.life_state
            ));
        }
    }
    let log = client.send("dm", Command::Events { since: 0 });
    let Some(CommandResult::Events { events, .. }) = log.result else {
        panic!("events failed: {:?}", log.error);
    };
    (transcript, events)
}

fn end_turn(prompt_id: PromptId) -> Command {
    Command::EndTurn {
        actor: Handle(FIGHTER.into()),
        prompt_id,
    }
}

/// Sends a command as the DM and writes it and the events it produced into the transcript.
/// Roll lines carry their engine citation.
fn call(client: &mut Client, transcript: &mut String, command: Command) -> Response {
    let echo = serde_json::to_value(&command).expect("commands serialize");
    transcript.push_str(&format!("  api> {echo}\n"));
    let response = client.send("dm", command);
    if let Some(error) = &response.error {
        transcript.push_str(&format!("  api! rejected: {}\n", error.message));
    }
    for event in &response.events {
        match &event.kind {
            EventKind::Round { number } => {
                transcript.push_str(&format!("\n== Round {number} ==\n"))
            }
            EventKind::Roll {
                roll: roll @ RollView::Full { id, .. },
            } => {
                debug_assert!(event.text.contains(&render::roll_summary(roll)));
                transcript.push_str(&format!("    [{}] {}\n", id.0, event.text));
            }
            _ => transcript.push_str(&format!("  {}\n", event.text)),
        }
    }
    response
}
