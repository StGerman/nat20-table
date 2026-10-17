# Engine protocol v1

Rules the schema cannot express: ordering, idempotency, lifecycle, visibility. The wire types themselves are defined only in `crates/nat20-api-contract` (CLAUDE.md Rule 1); where this text and the contract crate disagree on a type, the crate wins.
Decision 1 below (definition format) is settled: Rust contract crate, see `docs/design/system-design.md` §5. Decision 5 is settled: the strict roll view, chosen by Stas on 2026-10-16. Decisions 2-4 are settled too: Stas confirmed their defaults on 2026-10-17.

Status (contract 1.0.0-dev.3): every v1 type is in the contract crate. The engine (CON-3) serves `hello`, `new_session`, `load_scene`, `start_combat`, `get_state`, `legal_actions`, `submit`, `react`, `end_turn` and `events`, with the §5 projection, and answers `get_sheet`, `move`, `request_check`, `group_check`, `short_rest` and `spawn` with `not_implemented`. `end_combat` answers `wrong_mode` outside combat and `not_implemented` during a fight, since scenes carry no end-combat reasons yet. Limits of this build, each answered with `not_implemented` rather than ignored: no dice `seed` (the core's dice are not seedable until upstream U2; `seed: 0` in `session_started` means unseeded), no `party` carry-over in `load_scene` (API-5), no `surprised` in `start_combat`, no options with a `point` or `variant` (`legal_actions` does not offer them). The core has no condition or exhaustion model yet, so `conditions` is always empty and `exhaustion` 0.

Where the contract differs from the review draft, and why:
- `viewer` is required on every request, not only on commands that return state, because every response carries `events` projected for it.
- A roll's `full` view goes to the DM only. Every player, the roller included, gets the `player` view: dice, total and outcome, no modifiers, no `against`, no `dc_source`. Stas chose this over the draft's default 5 on 2026-10-16; players read their own modifiers and AC from their sheet.
- `hp_after` is gone from `damage_taken` and `healed`. Hit Points after a change travel in a separate `hit_points` event with DM or owner visibility, so a player projection drops the whole event instead of redacting a field.
- Event `visibility` is an object tagged by `scope` (`{"scope":"owner","handle":"lia"}`), not the string `owner:lia`.
- `request_check` takes `check: {kind:"scenario", check_id} | {kind:"ladder", ability, skill?, dc}` and `advantage: {state, reason}`, so a grant always carries its reason.
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
                              ├─ start_combat{participants, surprised?}   (mode: combat)
                              │     └─ submit / react / end_turn …  → combat_over (auto) or end_combat{reason}  (mode: explore)
                              └─ load_scene{next}   (party carries over; log continues)
```
- **One log per session.** Sequence numbers and roll ids are unique and monotonic for the whole session and never reused or rewritten. `load_scene` appends a `scene_loaded` event and doesn't clear anything.
- **The party persists.** PCs keep HP, slots, resources and conditions across scenes (API-5). Monsters belong to their scene.
- **Leaving combat.** Both ways back land in explore mode in the same scene. When a side is down, the engine ends combat by itself: it logs `combat_over`, switches the scene to explore mode and reports `awaiting: combat_over` until a command changes the session (`load_scene`, `start_combat`, or any explore command that acts), after which `awaiting` reads `none`; read-only and rejected commands keep reporting it. Any explore command, `start_combat` or `load_scene` goes on from there; `end_combat`, `legal_actions`, `submit`, `react` and `end_turn` then answer `wrong_mode` (not retryable), because combat is already over and nothing is pending. `end_combat{reason}` is only for ending a fight early.
- **Seed.** `new_session{seed?}` takes a u32. When it's omitted, the engine picks one and logs it in `session_started`. The same seed plus the same request stream gives an identical log (needs the core RNG change, API-11). Until then this engine answers an explicit `seed` with `not_implemented`, and `session_started` reports `seed: 0`, meaning unseeded.

## 3. Prompts (`awaiting`)

```json
{ "kind": "action",   "prompt_id": "p57", "actor": "lia" }
{ "kind": "reaction", "prompt_id": "p58", "actor": "bren",
  "trigger": { "event_seq": 410, "summary": "goblin moves out of reach" },
  "options": [ { "choice": 0, "option_id": "opportunity_attack/longsword", "name": "Opportunity Attack" } ] }
{ "kind": "none" }                       // explore mode, nothing pending
{ "kind": "combat_over", "winner": "party", "reason": "side_down" }
{ "kind": "no_session" }
```
- Every pending decision has a `prompt_id`. `submit`, `react` and `end_turn` must echo it. In combat, a missing or old id is rejected with `stale_prompt` and changes nothing; in explore mode the command answers `wrong_mode` first. This makes late or duplicated agent decisions harmless.
- Several reactors to one trigger are asked one at a time in initiative order (today it's scene order; switch to initiative).

## 4. Commands

| `cmd` | Fields | `result` | Who may call (orchestrator binding) |
|---|---|---|---|
| `hello` | | `{protocol:"nat20-api", version:"1.0.0", engine_rev, schema_sha256}` | orchestrator |
| `new_session` | `seed?` | `{session_id, seed}` | orchestrator |
| `load_scene` | `scene_id` \| `scene`, `party?` (handles carried in) | `State` | DM |
| `get_state` | `viewer` | `State` (projected) | all |
| `get_sheet` | `actor`, `viewer` | `Sheet` (full if `viewer` = `actor` or `dm`, else `not_visible`) | player (self), DM, UI |
| `legal_actions` | `actor` | `{prompt_id, options: Option[], unavailable: [{option_id, reason, message}], can_end_turn}` | the actor's agent, DM for the human |
| `submit` | `actor`, `prompt_id`, `option_id`, `targets?: handle[]`, `point?: {x_ft,y_ft,z_ft}`, `variant?: string` | `{accepted:true}` | as above |
| `react` | `actor`, `prompt_id`, `choice: int \| null` | `{accepted:true}` | the reactor's agent |
| `end_turn` | `actor`, `prompt_id` | `{accepted:true}` | as above |
| `move` | `actor`, `to: {anchor} \| {handle} \| {point}`, `prompt_id?` (required in combat) | `{moved_ft, provoked: handle[]}` | DM (explore), actor (combat) |
| `request_check` | `actor`, `check_id` \| `{ability, skill?, dc, dc_source:"ladder"}`, `advantage?: "advantage"\|"disadvantage"` (only with a logged reason) | `{roll_id, total, success}` (projected) | DM |
| `group_check` | `actors[]`, `check_id` | `{roll_ids[], success}` | DM |
| `short_rest` | `participants[]`, `hit_dice?: {handle: count}` | `{healed: {handle: hp}}` | DM |
| `start_combat` | `participants[]`, `surprised?: handle[]` | `State` | DM (or a scenario trigger) |
| `end_combat` | `reason: "surrender"\|"fled"\|"scenario"` | `State` | DM, only when the scenario allows the reason |
| `spawn` | `spawn_id` (declared in the scene file) | `State` | DM / scenario trigger |
| `events` | `since`, `viewer` | `{events, next}` | all |

`Option` (from `legal_actions`):
```json
{ "option_id": "melee_attack/longsword", "action": "nat20_core::action.melee_attack",
  "name": "Longsword attack", "cost": {"action": 1},
  "targeting": "single", "targets": [ {"handle":"goblin_1","reach":"in_range","attitude":"hostile"} ],
  "variants": [] }
```
`option_id` stays stable for the life of the prompt and is derived from the action plus its context (weapon slot, spell and level), never from a list index.

## 5. Visibility (projection per `viewer`)

| Data | `dm` | Owner (viewer = that creature) | Other player viewer |
|---|---|---|---|
| HP / max HP / temp HP | yes | yes | no; `health: "unhurt" \| "bloodied" \| "down"` instead |
| AC, saves, stat block, resources, slots | yes | yes | no |
| Conditions | yes | yes | only visible ones (all SRD conditions except `invisible` while unseen) |
| Position, distance (ft) | yes | yes | yes, for creatures the viewer perceives (all of them until vision exists) |
| Roll: dice, total, outcome | yes (`full` view) | yes (`player` view) | yes (`player` view) |
| Roll: modifiers, `against` (AC/DC), `dc_source` | yes | no; own modifiers and AC are on the sheet | no |
| Damage or healing amount | yes | yes | yes (it is said at the table) |
| `hit_points` events (HP after a change) | yes | own creature only | no |
| Scenario data: check DCs, spawns, triggers | yes | no | no |
| `unavailable` reasons in `legal_actions` | yes | yes | n/a |
| `text` in events | rendered for `dm` | rendered for that viewer | rendered for that viewer |

The server projects; it doesn't authenticate. The engine trusts its single client. Projection exists so that a bug in the orchestrator's tool layer can't leak numbers, not to stop a hostile client.

## 6. Events

Every event: `{ seq, kind, round?, scene?, visibility, text }` plus a kind-specific payload. `visibility` is `{scope:"public"}`, `{scope:"dm"}` or `{scope:"owner", handle}`; the projection drops events the viewer may not see and turns `full` rolls into `player` rolls for player viewers.

| `kind` | Payload |
|---|---|
| `session_started` | `seed`, `protocol_version` |
| `scene_loaded` | `scene_id`, `mode` |
| `combat_started` / `combat_over` | `participants` / `winner`, `reason` |
| `round` / `turn_start` / `turn_end` | `number` / `actor` |
| `action` | `actor`, `option_id`, `name`, `targets[]` |
| `roll` | `roll: RollView` (`view: "full"` or `"player"`) |
| `damage_taken` | `target`, `amount`, `damage_type`, `source_roll?` |
| `healed` | `target`, `amount`, `source_roll?` |
| `hit_points` | `target`, `hp`, `hp_max`, `temp_hp` (DM or owner visibility only) |
| `condition_added` / `condition_removed` | `target`, `condition`, `source` |
| `life_state` | `target`, `state: conscious\|unconscious\|stable\|dead` |
| `moved` | `actor`, `from`, `to` (ft), `anchor?` |
| `check_resolved` | `check_id?`, `actor`, `roll_id`, `success` |
| `rest` | `participants`, `rest: short\|long` |
| `spawned` | `spawn_id`, `handles[]` |

`RollView` with `view: "full"`, unchanged from v0 except for the id format and the added fields (the `player` view drops `modifiers`, `against` and `dc_source`):
```json
{ "view": "full", "id": "r412", "kind": "attack|saving_throw|ability_check|skill_check|initiative|damage|healing|death_save",
  "label": "Longsword attack vs goblin_1", "roller": "bren", "target": "goblin_1",
  "dice": [{"source":"d20","dice":"1d20","results":[14,6],"kept":14}],
  "modifiers": [{"source":"Strength","value":3},{"source":"Proficiency","value":2}],
  "total": 19, "against": {"kind":"AC","value":15}, "outcome": "hit",
  "advantage": "advantage", "dc_source": "scenario|ladder|stat_block" }
```
In the `full` view, `against` is always present for `attack` (AC), `saving_throw`, `death_save`, `ability_check` and `skill_check` (DC), and `dc_source` is present for every DC except a death save's fixed DC 10. Only `initiative`, `damage` and `healing` rolls have no `against`.

Audit rule (demo pass criterion): every `[rN]` cited in a transcript exists with the same `total`, and with the same `against` when the transcript states it. Every roll in the session log is cited. The audit runs on the `dm` projection.

## 7. Errors

```json
{ "code": "rejected", "reason": "out_of_range",
  "message": "goblin_1 is 30 ft away; the longsword reaches 5 ft.",
  "retryable": true,
  "hint": { "legal_option_ids": ["melee_attack/longsword", "dash"], "awaiting": {"kind":"action","prompt_id":"p57","actor":"bren"} } }
```
| `code` | When | `retryable` |
|---|---|---|
| `bad_request` | Malformed JSON, missing field, unknown `cmd` | false |
| `unsupported_version` | `v` mismatch | false |
| `no_session` / `no_scene` | Lifecycle order is wrong | false |
| `unknown_creature` / `unknown_option` / `unknown_check` / `unknown_anchor` / `unknown_spawn` | The id isn't in this scene | true |
| `not_your_turn` | `actor` isn't `awaiting.actor` (also returned by `legal_actions`, not an empty list) | true, after waiting |
| `stale_prompt` | `prompt_id` doesn't match | true, with the new `prompt_id` |
| `not_visible` | The viewer asked for something it may not see | false |
| `wrong_mode` | A combat command in explore mode or the reverse | false |
| `rejected` | The engine refused a legal-shaped decision. `reason` is one of: `out_of_range`, `no_valid_target`, `invalid_target`, `insufficient_resource`, `action_already_used`, `condition_prevents`, `not_known`, `needs_target`, `needs_point`, `needs_variant` | true |
| `not_implemented` | The command is in the contract but this engine build does not serve it yet | false |
| `bad_scene` | The scene file, or a pregen or stat block it names, is missing or invalid; nothing changed | false |
| `internal` | An engine bug. The request did nothing, and the engine logs details to stderr | false |

`message` is one plain-English sentence written for a model or a human. It never contains Rust `Debug` output.

## 8. Versioning

- `v` is the major version. Within a major version, changes are additive only: new commands, new optional fields, new event kinds and new error reasons. Clients must ignore unknown fields and unknown event kinds.
- Removing, renaming or changing the meaning of anything bumps the major version.
- `hello.schema_sha256` is a hash of the checked-in schema files. The orchestrator compares it with the hash it was generated against and refuses to start on a mismatch.

## 9. Migration from v0 (milestone 1)

| v0 | v1 |
|---|---|
| no `v`, no `id` | required |
| `awaiting.kind: "action"/"reaction"/"nothing"/"no_scene"` | adds `prompt_id`; `nothing` → `none`; `no_scene` → `no_session` |
| `context: index` | `option_id` |
| `new_events` | `events` (projected) |
| log cleared on `load_scene`, ids restart | one session log |
| `position_m`, `distance_ft` | feet only |
| `error.code: "rejected"` + Debug text | `code` + `reason` + sentence + `retryable` + `hint` |
| `legal_actions` when not your turn → `ok:true`, `[]` | `not_your_turn` error |
| `get_state` shows all HP/AC | projected by `viewer` |

v0 has no consumers outside the milestone 1 tests and the `nat20_duel` driver, so v1 replaces it outright with no compatibility layer.
