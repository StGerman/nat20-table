# Contract changelog

Every change to `crates/nat20-api-contract` gets a line here with the new `CONTRACT_VERSION` (CLAUDE.md Rule 1, Rule 2).
Within major 1, changes are additive only. Nothing is released yet, so versions carry a `-dev.N` suffix until v1 is complete (CON-2).

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
