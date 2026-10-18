# nat20-api-server

The engine process: JSON lines on stdin and stdout, speaking the contract in [`nat20-api-contract`](../nat20-api-contract) ([protocol](../../contract/protocol.md)). Engine logs go to stderr.

```bash
cargo run -p nat20-api-server
{"v":1,"id":"c-1","viewer":"dm","cmd":"new_session"}
{"v":1,"id":"c-2","viewer":"dm","cmd":"load_scene","scene_id":"duel"}
{"v":1,"id":"c-3","viewer":"dm","cmd":"start_combat","encounter_id":"duel"}
{"v":1,"id":"c-4","viewer":"bren","cmd":"legal_actions","actor":"bren"}
```

## Layout
- `src/server.rs`: envelope, request ids, viewer checks, dispatch.
- `src/session.rs`: one session log (`seq` from 1 and roll ids `r<seq>`, never reused), prompt ids that retire on each decision, `source_roll` links.
- `src/projection.rs`: what each viewer may see (protocol §5). The DM sees everything; a player gets the `player` state and roll views and never an event outside its visibility.
- `src/render.rs`: the one-line text of each event, rendered from the projected event, so the text never says more than the fields.
- `src/scene.rs`: reads a scene file (the contract's `SceneFile`) and checks what its schema can't: ids that refer to each other, dice, DCs (protocol §2.1).
- `src/adapter/`: the only code that uses `nat20_core` (CLAUDE.md Rule 5). It places a scene's creatures, loads monsters and pregens, runs scripted turns, reads sheets (`adapter/sheet.rs`), rolls explore checks and applies their consequences, and turns engine events into contract events.
- `data/scenes/`, `data/monsters/`: scene files and SRD 5.2.1 stat blocks. `m3_s1_green` to `m3_s5_cellar` are the Milestone 3 test scenario `m3_trail`; `help_yard` puts two fighters side by side for the Help fixture, and `help_brawl` adds a goblin and an encounter for Help in a fight. Pregens are built in code for now (`adapter/pregen.rs`).

## Known gaps (milestone 1)
- Not served yet: `end_combat{fled}`, point and variant options, `request_check` in combat, a ladder check without a skill or with another ability than the skill's. Each answers `not_implemented`.
- Second Wind recharges only on a Long Rest in core; SRD 5.2.1 gives back one use on a Short Rest (ENG-10).
- Explore checks are rolled outside the engine's event loop, so nothing can react to them: a Fighter's Tactical Mind (spend Second Wind to add 1d10 to a failed check) is not offered yet (CHK-6).
- Dice are seeded per session (`new_session.seed`, core's `components::rng` from upstream item U2), so a fight replays exactly: `contract/fixtures/duel.jsonl` is the Milestone 1 duel with seed 1. Regenerate it with `cargo run -p nat20-duel -- --seed 1 --fixture contract/fixtures/duel.jsonl` after a deliberate behaviour change.
- The Goblin Warrior wears a +2 AC stopgap for its missing shield, and its extra 1d4 on Advantage and Nimble Escape are not modelled.
