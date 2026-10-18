# Engine protocol v1

Rules the schema cannot express: ordering, idempotency, lifecycle, visibility. The wire types themselves are defined only in `crates/nat20-api-contract` (CLAUDE.md Rule 1); where this text and the contract crate disagree on a type, the crate wins.
Decision 1 below (definition format) is settled: Rust contract crate, see `docs/design/system-design.md` §5. Decision 5 is settled: the strict roll view, chosen by Stas on 2026-10-16. Decisions 2-4 are settled too: Stas confirmed their defaults on 2026-10-17.

Status (contract 1.0.0-dev.16): every v1 type is in the contract crate, and so is the scene file format (§2.1). The engine (CON-3) serves `hello`, `new_session`, `load_scene`, `start_combat` and `end_combat` (§4.4), `get_state`, `get_sheet` (§4.2), `legal_actions`, `submit`, `react`, `end_turn`, `move` (§4.1), `request_check` in explore mode (§4.3), `short_rest` (§4.5), `spawn` (§4.6), `help` (§4.7) and `events`, with the §5 projection. Dice are seeded per session (§2). Limits of this build, each answered with `not_implemented` rather than ignored: `end_combat{fled}` and options with a `point` (`legal_actions` does not offer them). The core has no condition or exhaustion model yet, so `conditions` is always empty and `exhaustion` 0.

Where the contract differs from the review draft, and why:
- `viewer` is required on every request, not only on commands that return state, because every response carries `events` projected for it.
- A roll's `full` view goes to the DM only. Every player, the roller included, gets the `player` view: dice, total and outcome, no modifiers, no `against`, no `dc_source`. Stas chose this over the draft's default 5 on 2026-10-16; players read their own modifiers and AC from their sheet.
- `hp_after` is gone from `damage_taken` and `healed`. Hit Points after a change travel in a separate `hit_points` event with DM or owner visibility, so a player projection drops the whole event instead of redacting a field.
- Event `visibility` is an object tagged by `scope` (`{"scope":"owner","handle":"lia"}`), not the string `owner:lia`.
- `request_check` takes `check: {kind:"scenario", check_id} | {kind:"ladder", ability, skill?, dc}` and no Advantage grant: Advantage comes only from what the engine tracks, and its reasons are logged in the roll's `advantage_sources` (decision D2 of the Milestone 3 spec). There is no `group_check` (decision D1): the DM picks who rolls.
- `short_rest.hit_dice` is a list of `{handle, count}`; `move.to` is tagged by `kind` (`anchor`, `creature`, `point`).
- `submit`, `react` and `end_turn` return an empty result (`{"cmd":"submit"}`); what happened is in `events`.
- `new_session.seed` is a u32, so it survives JavaScript numbers.
- Error code `not_implemented` is added for commands in the contract that this engine build does not serve yet.


Origin: the v1 draft written by the API contract review on 2026-10-16.

## Decisions (the chosen defaults in bold)

1. Definition format: settled, a standalone Rust contract crate (serde + schemars), see the note at the top.
2. Transport: settled (Stas, 2026-10-17), **stdio JSON-lines only for the demo**. Local HTTP later, reusing the same message types (API-15).
3. Visibility: settled (Stas, 2026-10-17), **projected by the engine per `viewer`**, as well as by the orchestrator's tool binding.
4. Player view of enemy health: settled (Stas, 2026-10-17), **health band only** (`unhurt` / `bloodied` / `down`, where bloodied is the SRD 5.2.1 term for half HP or less). No numbers.
5. Player view of rolls: settled (Stas, 2026-10-16), strict. The DM alone sees modifiers, AC/DC and the DC source; every player, the roller included, sees dice, total and outcome. This hides save DCs from players, which is stricter than many tables run it.

## 1. Transport and envelope

One JSON object per line on stdin, one per line on stdout, strictly request → response. There is one client per engine process, and the client serialises its calls. Engine logs go to stderr.

Request:
```json
{ "v": 1, "id": "c-000123", "cmd": "submit", "viewer": "lia", "...": "command fields" }
```
- `v` (int, required): the protocol major version. A mismatch returns `unsupported_version`.
- `id` (string, required): a client-unique request id. **Idempotency:** a repeated `id` returns the stored response byte for byte and doesn't execute again. The engine keeps the last 256 ids.
- `viewer` (string, required on every command that returns state or events): `"dm"` or a creature handle. It selects the projection (§5).

Response:
```json
{
  "v": 1, "id": "c-000123", "ok": true,
  "result": { },
  "error": null,
  "events": [ ],
  "awaiting": { },
  "log_head": 412
}
```
- `result` is typed per command (§4). `error` is set when `ok` is false (§7).
- `events`: the log entries this request produced, **projected for `viewer`**.
- `awaiting`: who the engine waits on next (§3). It is never projected away, because everyone needs to know whose turn it is.
- `log_head`: the session log length after this request (use it with `events.since`).

## 2. Session, scene and combat lifecycle

```
hello → new_session{seed} → load_scene{scene_id}            (mode: explore)
                              ├─ request_check / move / short_rest / spawn
                              ├─ start_combat{encounter_id}   (mode: combat)
                              │     └─ submit / react / end_turn …  → combat_over (auto) or end_combat{reason}  (mode: explore)
                              └─ load_scene{next}   (party carries over; log continues)
```
- **One log per session.** Sequence numbers and roll ids are unique and monotonic for the whole session and never reused or rewritten. `load_scene` appends a `scene_loaded` event and doesn't clear anything.
- **The party persists.** PCs keep HP, slots, resources and conditions across scenes (API-5). Monsters belong to their scene.
- **One engine per session.** Every scene of a session runs in the same engine, so nothing about a carried creature is copied or rebuilt. `load_scene{party}` keeps the listed creatures of the current scene, places them at the new scene's `party_start` anchors in party order (the last anchor takes any creature beyond the list) and removes every other creature of the previous scene. Then the new scene's own `creatures` are placed. A creature can be carried whatever its side, such as a prisoner. A scene that places no creature of its own needs a party (`bad_request` without one); a scene with no `party_start` takes none (`bad_request`). A carried handle must be in the current scene (`unknown_creature`), may be listed only once (`bad_request`) and must not also be defined by the new scene (`bad_scene`). A refused `load_scene` changes nothing. Scene flags (§4.3) belong to the session and outlive every scene.
- **No scene change mid-fight.** `load_scene` while a fight is running answers `wrong_mode` (not retryable) and changes nothing; the fight ends first, by a side going down or by `end_combat{reason}`. That way every `combat_started` in the log has its `combat_over`.
- **Leaving combat.** Both ways back land in explore mode in the same scene. When a side is down, the engine ends combat by itself: it logs `combat_over`, switches the scene to explore mode and reports `awaiting: combat_over` until a command changes the session (`load_scene`, `start_combat`, or any explore command that acts), after which `awaiting` reads `none`; read-only and rejected commands keep reporting it. Any explore command, `start_combat` or `load_scene` goes on from there; `end_combat`, `legal_actions`, `submit`, `react` and `end_turn` then answer `wrong_mode` (not retryable), because combat is already over and nothing is pending. `end_combat{reason}` is only for ending a fight early.
- **Seed.** `new_session{seed?}` takes a u32. When it's omitted, the engine picks one and logs it in `session_started`. The same seed plus the same request stream gives an identical log and identical responses, so any session replays from its logged seed (fixture `duel.jsonl`). Every u32 is a real seed, 0 included. The core keeps one dice generator per thread and `new_session` re-seeds it, so one engine process runs one session at a time.

### 2.1 Scene files

`load_scene{scene_id}` reads `<data>/scenes/<scene_id>.json`, a `SceneFile` (contract module `scene.rs`, schema `generated/nat20-scene.schema.json`, TS `scene` namespace of the engine client). The DM agent reads the same files, so both sides agree on check ids, anchors, encounters and spawns. A scene file is DM-only data (§5): nothing in it, nor anything derived from it, goes into a player view except anchor names and positions.

- **Contents.** `anchors` (named landmarks), `creatures` (placed on load, each `at` an anchor or a point), `party_start` (anchors for carried creatures, in party order), `checks` (a skill check or save, a DC, and consequences on success and failure), `hazards` (a save and its consequences), `encounters` (participants, a surprise rule, a surrender condition, other allowed early ends) and `spawns` (creatures placed by the DM, by a flag at combat start, or at a round).
- **Checked on load.** Besides the schema (unknown fields are refused), the engine refuses a scene with `bad_scene` and changes nothing when: an id (anchor, check, hazard, encounter, spawn, flag, handle) isn't a plain name or repeats; a handle repeats across `creatures` and spawns; any handle, a carried encounter participant's included, is `dm`; a creature names an unknown pregen or stat block, or both or neither; an `at` or `party_start` names an unknown anchor; a consequence names an unknown hazard, a hazard sets off another hazard, or damage dice aren't `NdM` or `NdM+K` with M one of 4, 6, 8, 10, 12, 20, 100; a DC is outside 1 to 30; an encounter has no participants, lists one twice, or names a creature the scene doesn't define while it has no `party_start` (only a carried creature could fill it); a surrender condition names a non-participant, has no trigger, a fraction outside (0, 1), or a leader that isn't one of its creatures; `surrender` appears in `end_reasons` (a surrender condition governs it); a spawn is empty or fires at round 0; a carried creature shares a handle with the scene's creatures or spawns; a spawn's creature fails a check its placement would run (its stat block, or a side it cannot take beside the scene's and the carried creatures), so a scene that loads can always place its spawns; the `map` isn't a terrain file under `maps/`.
- **Served so far.** Placement of `creatures` at anchors or points, `map`, `party_start` for carried creatures (§2), `anchors` in state and as `move` goals (§4.1), `checks`, `hazards` and the flags they set (§4.3), `encounters` with their surprise rules (§4.4), and `spawns` of every kind (§4.3).

### 2.2 Pregen files

A scene creature with `pregen: "<id>"` is built from `pregens/<id>.json` at the repository root, a `PregenFile` (contract module `pregen.rs`, schema `generated/nat20-pregen.schema.json`, TS `pregen` namespace of the engine client). The engine reads it when the scene loads and builds the character through core's own level-up path, so every number on the sheet is core's.

- **Contents.** Name, species and subspecies, background, class and level (registry ids, `[namespace::]<kind>.<name>`, namespace `nat20_core` by default), ability scores before the background's increases and which two abilities it increases, answers to core's choice prompts by prompt id (`choices`), the class's skill picks (`skills`), the skill picks a species, background or feat asks for, keyed by its registry id (`skill_choices`, e.g. Human Skillful and the Skilled feat), the items carried with the slot each equipped one goes in, and coins. An optional `_comment` string on the file and on each section holds notes for humans; the engine ignores it.
- **Starting equipment.** The engine answers the class's and the background's starting equipment prompts with their gold-only option, then gives the character exactly the file's `equipment` (equipped ones put on in file order) and `money`. An item an equip displaces stays in the inventory.
- **Checked on load.** Besides the schema (unknown fields are refused), the scene is refused with `bad_scene`, naming the pregen and the problem, when: the id isn't a plain name or has no file; the file's `id` isn't its file name; a registry id doesn't parse or isn't registered; the level is outside 1 to 20; core asks a prompt the file does not answer, or refuses an answer (a pick that isn't one of its options, the wrong number of picks or skills, scores the point table doesn't allow); a `choices` or `skill_choices` entry answers no prompt core asked; an equipped item's quantity isn't 1, it can't go in its slot, or a quantity is 0; `money` isn't a coin amount such as `54 GP`. The engine checks every pregen a scene and its spawns name before it places any creature.
