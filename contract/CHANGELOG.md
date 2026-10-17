# Contract changelog

Every change to `crates/nat20-api-contract` gets a line here with the new `CONTRACT_VERSION` (CLAUDE.md Rule 1, Rule 2).
Within major 1, changes are additive only. Nothing is released yet, so versions carry a `-dev.N` suffix until v1 is complete (CON-2).

## 1.0.0-dev.8 (2026-10-17)
- Docs only, no wire type change: `get_sheet` is served (API-19, Milestone 3 spec §7 step 4). The owner and the DM get the `Sheet`; any other creature viewer gets `not_visible`; an unknown actor gets `unknown_creature`. It is read-only: it rolls nothing, logs nothing, and leaves the seeded dice where they were (protocol.md §4.2).
- `Sheet` field docs now say what the engine fills in: bonuses are the flat part the engine adds to the d20 (dice such as Bless left out); `skills` are alphabetical; `resources` leave out per-turn action economy and use ids like `fighter.second_wind`; `hit_dice` stays empty until the engine has a Hit Point Dice pool (ENG-4); `conditions` and `exhaustion` stay empty and 0 as in state.
- Fixture `sheet.jsonl`; `not_implemented.jsonl` loses its `get_sheet` line.

## 1.0.0-dev.7 (2026-10-17)
- `move` is served (API-7, MAP-1, Milestone 3 spec §7 step 3): to an anchor, a point, or within 5 ft of a creature. Free in explore mode; in combat it needs the action prompt, the whole route must fit in the movement left, and an opportunity attack stops the mover (protocol.md §4.1). Each move logs a public `moved` event.
- Additive: `State::Dm.anchors` (`AnchorView`: id, name, position) and `State::Player.anchors` (`AnchorObserved`: the same plus `distance_ft` from the viewer).
- Additive: `RejectReason::no_path`; `ErrorHint.known_ids`, filled with the scene's anchor ids after `unknown_anchor` for the DM only.
- Fixture `explore.jsonl`; every fixture with a state now shows `anchors`. `not_implemented.jsonl` loses its `move` line.

## 1.0.0-dev.6 (2026-10-17)
- Docs only, no wire type change: `load_scene{party}` is served (API-5, Milestone 3 spec §7 step 2). The session keeps one engine across scenes; carried creatures keep HP, resources and conditions and are placed at `party_start` (the last anchor takes any extra); every other creature of the previous scene leaves (protocol.md §2). New refusals: `bad_request` for a party listed twice, a party given to a scene with no `party_start`, or no party for a scene that places no creature of its own; `unknown_creature` for a handle not in the current scene; `bad_scene` for a handle both carried and defined by the scene. Fixture `carry.jsonl`.
- Behaviour change, breaking while pre-release: `load_scene` during a fight answers `wrong_mode` instead of abandoning the fight, so every `combat_started` has its `combat_over`. Migration: end the fight first (a side down, or `end_combat` once API-9 serves it).
- Scene flags are not served yet: nothing can set one until checks land (step 5), so they come with that step.
- Test scene `m3_s3_yard`: the woodpile and mill door anchors moved next to the gate, since nobody can `move` yet.

## 1.0.0-dev.5 (2026-10-17)
- The scene file joins the contract (API-21, Milestone 3 spec §4.1): module `scene.rs` with `SceneFile`, `Anchor`, `SceneCreature`, `Control`, `Placement`, `ScenarioCheck`, `CheckTest`, `Hazard`, `HazardSave`, `Consequence`, `Encounter`, `Surprise`, `SurrenderCondition`, `SurrenderTrigger`, `Spawn`, `SpawnWhen`, `SpawnUnless`; its own schema `generated/nat20-scene.schema.json` and TS module (`scene` namespace in the engine client). No wire type changes.
- `hello.schema_sha256` now covers the wire schema followed by the scene schema (protocol.md §8).
- Scene files, breaking for scene authors (nothing on the wire): a creature's `position` becomes `at: {kind:"anchor", anchor} | {kind:"point", point}`. The engine now checks a scene's cross-references and answers `bad_scene` on a broken one (protocol.md §2.1). Migration: `duel.json` moved to `at`; fixture `scene.jsonl` loads the `m3_trail` test scenes.
- Docs only: `PointFt.y_ft` is north-south and `z_ft` is up, as documented; the engine now places and reports them that way (it used to pass `y_ft` to the core's vertical axis).

## 1.0.0-dev.4 (2026-10-17)
- Docs only, no wire change: `new_session.seed` is honoured (API-11, core upstream item U2). An explicit seed no longer answers `not_implemented`; an omitted seed is picked by the engine and logged, and is no longer `0`. `0` is now an ordinary seed, not "unseeded". The same seed and request stream replay byte-identical responses (protocol.md §2, fixture `duel.jsonl`, the Milestone 1 duel replayed with seed 1).

## 1.0.0-dev.3 (2026-10-16)
- Error code `bad_scene`: the scene file, or a pregen or stat block it names, is missing or invalid (CON-3, the server port).
- Docs only: `awaiting: combat_over` is reported until a command changes the session (`load_scene`, `start_combat`, or an explore command that acts); read-only and rejected commands keep reporting it. `end_combat`, `legal_actions`, `submit`, `react` and `end_turn` answer `wrong_mode` outside combat, before any prompt check (protocol.md §2, §3). Error responses carry the events a refused command still logged (§1).
- Docs only: in the `full` roll view, `against` is required for attack, save, death save and check rolls, and `dc_source` for every DC but a death save's (protocol.md §6). Enforced by the engine's tests, since a per-kind requirement can't be expressed on the shared `RollView` without reshaping it.

## 1.0.0-dev.2 (2026-10-16)
- All v1 commands from the review draft (CON-2): `new_session`, `load_scene`, `get_state`, `get_sheet`, `legal_actions`, `submit`, `react`, `end_turn`, `move`, `request_check`, `group_check`, `short_rest`, `start_combat`, `end_combat`, `spawn`, `events`, each with a typed result.
- Views: `State` (`dm` or `player`), `CreatureFull`, `CreatureObserved` (no HP or AC field), `Sheet`, `ActionOption`, `Awaiting` with `prompt_id`.
- Events: `Event` with `seq`, `visibility` and 19 kinds; `RollView` (`full` for the DM, `player` for players); `hit_points` replaces `hp_after`.
- Errors: `not_implemented` code and `hint` (`legal_option_ids`, `awaiting`).
- Envelope, breaking while pre-release: `viewer` is required on every request; `Response` always carries `events`, `awaiting` and `log_head`.
- Lifecycle: combat that ends by itself (a side is down) returns the scene to explore mode. `awaiting: combat_over` is reported until the next command and needs no `end_combat` (protocol.md §2).
- Deviations from the review draft are listed at the top of `contract/protocol.md`.

## 1.0.0-dev.1 (2026-10-16)
- Envelope: `Request { v, id, cmd }`, `Response { v, id, ok, result, error }`; `result` is tagged by the same `cmd` as the request.
- Command `hello` returning `protocol`, `version`, `engine_rev`, `schema_sha256`.
- Error model: `ErrorCode` (15 codes) and `RejectReason` (10 reasons) from the v1 draft.
- Request ids are idempotent: a repeated id returns the stored response (last 256 ids).
