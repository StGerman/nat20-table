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
- **Coordinates.** `x_ft` east-west, `y_ft` north-south, `z_ft` up, in feet. The engine places a creature on the ground below its point.
- **Test scenario.** `m3_s1_green` to `m3_s5_cellar` (`m3_trail`, 5 scenes, Bren and Goblin Warriors) exercise every part of the format; Milestone 3 replays them end to end (API-23).

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
| `request_check` | `actor`, `check: {kind:"scenario", check_id} \| {kind:"ladder", ability, skill?, dc}` | `{roll_id, total, success}` | DM |
| `short_rest` | `participants[]`, `hit_dice?: [{handle, count}]` | `{healed: [{handle, amount}]}` | DM |
| `start_combat` | `encounter_id` | `State` | DM (or a scenario trigger) |
| `end_combat` | `reason: "surrender"\|"fled"\|"scenario"` | `State` | DM, only when the encounter allows the reason (§4.4) |
| `spawn` | `spawn_id` (declared in the scene file) | `State` | DM / scenario trigger |
| `events` | `since`, `viewer` | `{events, next}` | all |

### 4.1 Moving

- `to` is an anchor of the scene, a point, or a creature (the move ends within 5 ft of it). An anchor the scene doesn't define answers `unknown_anchor`; the DM's error carries the scene's anchor ids in `hint.known_ids`, a player's carries none.
- **Explore mode.** Anyone may be moved and `prompt_id` is ignored. The creature walks the whole route on the map at no movement cost and provokes nobody, since nobody is fighting. A creature at 0 HP can't move (`rejected`, `condition_prevents`).
- **Combat.** `move` is a decision at the actor's action prompt, so it needs that prompt's id (`bad_request` without one, `stale_prompt` for an old one) and gets a new prompt like `submit`. The whole route must fit in the movement left this turn, else `rejected` with `insufficient_resource` and nobody moves. Leaving a hostile creature's reach gives it an opportunity attack: the mover stops where it provoked, `provoked` names the reactor, and `moved_ft` is the distance actually covered.
- No route to the goal (off the map, or blocked) answers `rejected` with `no_path`.
- Every move logs a public `moved` event with `from`, `to` and the anchor, when the creature reached one.

### 4.2 Sheets

- `get_sheet` answers the owner (`viewer` = `actor`) and the DM with the full `Sheet`; any other creature viewer gets `not_visible`. An actor not in the scene answers `unknown_creature`.
- It is read-only and works in either mode: it rolls nothing, logs no event and does not advance the seeded dice, so asking for a sheet never changes what a later roll comes up.
- Check and save bonuses are what the engine adds to the d20 when it rolls: ability modifier, proficiency and lasting effects. Dice bonuses such as Bless are left out. `initiative_bonus` is the engine's initiative check; Passive Perception is 10 plus the Perception bonus.
- `hit_dice` lists the Hit Point Dice by die size, smallest first; a creature without them (a monster) has none.
- Not filled yet: `conditions` and `exhaustion` (as in state).

### 4.3 Checks, hazards and flags

- `request_check` works in explore mode; in combat it answers `not_implemented`, since a check there is an action. The engine rolls, decides success and logs, in order: the `roll` (`full` view with `against` and `dc_source`), `check_resolved` (DM only), then what the check's consequences log. The result's `roll_id` is that roll's id.
- **Scenario checks.** `check_id` names a check of the loaded scene: a skill check or a saving throw with its DC. An id the scene doesn't define answers `unknown_check`; the DM's error carries the scene's check ids in `hint.known_ids`, a player's carries none. Each scenario check is rolled at most once per scene, by anyone: a second request answers `rejected` with `already_attempted` (decision D3). The once-per-scene record starts empty when a scene loads.
- **Ladder checks.** For a check no scenario check covers, the DM names a skill and a DC from the SRD ladder: 5, 10, 15, 20, 25 or 30 (`bad_request` otherwise). `ability` must be the skill's own ability. Not served yet, each answering `not_implemented`: a check without a skill, or a skill with another ability. Ladder checks have no consequences and no once-per-scene limit.
- A creature at 0 Hit Points can't make a check (`rejected`, `condition_prevents`). A refused check rolls nothing and logs nothing.
- **Consequences** run in scene file order. `flag` sets a session flag and logs `flag_set` (DM only) the first time it is set; flags outlive the scene and appear in the DM state, sorted. `hazard` logs `hazard_triggered` (DM only), rolls the hazard's saving throw for the same creature (`dc_source: "scenario"`), then runs the hazard's own consequences for that save. `damage` rolls the dice and applies them to that creature: a `damage` roll, `damage_taken` citing it, `hit_points` (owner and DM), and `life_state` if it changed.
- Advantage comes only from what the engine tracks (a pending Help, conditions, features); each reason is in the roll's `advantage_sources`, DM view only.
- A check goes through the engine's own event handling, so whatever waits on it acts: a pending Help for that skill is spent by it (§4.7). A reaction a check would offer out of combat (the Fighter's Tactical Mind after a failed check) is declined, since explore mode has no reaction prompt (CHK-6).

### 4.4 Encounters and ending a fight

- `start_combat{encounter_id}` starts one of the loaded scene's encounters. Participants, surprise, surrender and allowed early ends all come from the scene file, never from the caller (decision D4). An id the scene doesn't declare answers `unknown_encounter`; the DM's error carries the scene's encounter ids in `hint.known_ids`, a player's carries none. A participant not in the scene (a party member who wasn't carried in) is left out. The fight needs at least one conscious party creature and one conscious hostile creature among the participants (`bad_request` otherwise). While a fight runs, `start_combat` answers `wrong_mode`.
- **Surprise:** when the encounter has a surprise rule and its `when_flag` is set, every participant on the `surprised` side rolls initiative with Disadvantage (SRD 5.2.1 Surprise). The DM never names who is surprised (decision D4). Those `initiative` rolls show `advantage: "disadvantage"` in every view; the DM's also carry the reason in `advantage_sources`. Without the flag, everyone rolls normally.
- The DM state lists the scene's `encounters` (`EncounterView`): each one's id, whether it is `running`, and `surrender_available`. `surrender_available` is true only for the running encounter, while its surrender condition holds. The engine evaluates the condition from the current state of its creatures that are in the scene: `hp_fraction_at_most` sums their current and maximum Hit Points; `standing_at_most` counts the conscious ones; `leader_down` holds when the leader is at 0 Hit Points or dead. A condition with none of its creatures in the scene never holds, and a leader who is not in the scene is not down. The engine never surrenders on its own (decision D5).
- `end_combat{reason}` ends the running fight early and answers the state in explore mode, with `awaiting: none`:
  - `surrender` is accepted only while `surrender_available` is true; otherwise it answers `surrender_not_available` (not retryable as it stands) and changes nothing. On success the condition's creatures that are still conscious become `neutral` and stay in the scene, and in the engine their attitude toward the winners' factions becomes neutral, and so does each winner's attitude toward them (only toward them; the rest of the winners' factions keep theirs), so a later scene can carry them in with their captors. The engine logs `surrendered{handles}` (public), then `combat_over{reason: "surrender"}` with the other side as `winner`.
  - `scenario` is accepted only when the encounter lists it in `end_reasons`; otherwise `rejected` with `condition_not_met`. It logs `combat_over{reason: "scenario"}` with no winner.
  - `fled` answers `not_implemented` until MON-6.
  - Outside combat, including after a fight ended by itself, `end_combat` answers `wrong_mode`.
  - A player viewer's `surrender_not_available` and `condition_not_met` messages say only that the fight cannot end that way right now; the DM's name the encounter and why (scenario data, §5).

`Option` (from `legal_actions`):
```json
{ "option_id": "melee_attack/longsword", "action": "nat20_core::action.melee_attack",
  "name": "Longsword attack", "cost": {"action": 1},
  "targeting": "single", "targets": [ {"handle":"goblin_1","reach":"in_range","attitude":"hostile"} ],
  "variants": [] }
```
`option_id` stays stable for the life of the prompt and is derived from the action plus its context (weapon slot, spell and level), never from a list index.

- An option is listed only when it has a target, if it needs one. `targets` are the creatures in the scene that the action may target, except the actor and dead creatures: a creature at 0 Hit Points is a target, for Help's stabilize and for an attack.
- An option with `variants` (Help's skills, §4.7) needs one in `submit.variant`: without one it is `rejected` with `needs_variant`, and a variant the option does not list answers `unknown_option`. A `variant` on an option without variants answers `bad_request`.
- A dying creature's turn is its death save: the engine rolls it at the start of the turn (`death_save`, DC 10, `dc_source: "rule"`) and ends the turn, so the creature gets no prompt.

### 4.5 Short rest

- `short_rest{participants, hit_dice}` is explore mode only: rolling Initiative interrupts a rest, so during combat it answers `wrong_mode`. After a fight that ended by itself it is an explore command that acts, so it closes `combat_over` as `move` and `request_check` do.
- Everything is checked first, and a refused rest changes nothing and rolls nothing:
  - `participants` must be non-empty and list each creature once (`bad_request`), and each must be in the scene (`unknown_creature`).
  - Every participant needs at least 1 Hit Point (SRD 5.2.1 Short Rest), else `rejected` with `condition_prevents`.
  - Each `hit_dice` entry names a participant, once (`bad_request`). A count above the dice it has left answers `rejected` with `insufficient_resource`. The message names only the count asked for, since dice left are on the owner's sheet.
- Then each participant, in order, spends its dice, largest die size first. Each die logs a public `healing` roll labelled "a dN Hit Point Die" (the die plus the Constitution modifier), a public `healed` citing it, with what was regained: at least 1, at most what was missing. It also logs `hit_points` (owner and DM). Last, the engine finishes the rest, short-rest resources recharge, and a public `rest` event names the participants.
- The result lists the Hit Points each participant regained, in `participants` order, 0 for one that spent none. The dice count is declared up front, a simplification of "decide after each roll": the DM can call `short_rest` again with another die.
- A rest is never interrupted (ENG-9): the command is atomic, so nothing can happen during it.

### 4.6 Spawns

- A scene's `spawns` place more creatures later, each at its own `at`. A spawn is placed at most once per scene, and its creatures then stay in the scene like any other: they can be carried into the next scene, and a later encounter that lists them among its `participants` includes them.
- **Flag spawns** (`when: {kind: "flag"}`): when `start_combat` starts any fight in the scene while the flag is set, the engine places the spawn's creatures before rolling initiative, and they join that fight whether or not the encounter lists them. They count toward the conscious party and hostile creatures a fight needs, and they are surprised with their side.
- **DM spawns** (`when: {kind: "dm"}`): `spawn{spawn_id}` places them and answers the state plus their `handles`. During a fight they join it (below).
- **Round spawns** (`when: {kind: "round", round}`): when a fight in the scene reaches that round, the engine places them, unless the spawn's `unless` holds then (`any_party_bloodied`: a party creature is down or at half its Hit Points or fewer). A cancelled spawn is not placed later, not even in a later fight of the scene. A round spawn fires in the first fight of the scene that reaches its round.
- **Joining a running fight.** Creatures placed during a fight (a DM spawn or a round spawn) join it: each rolls initiative, logged as an `initiative` roll after `spawned`, and takes its turn at its place in the order, this round if its count has not come up yet, otherwise from the next round. Ties go after the creatures already in the order. A spawn is not a decision: a pending action or reaction prompt keeps its `prompt_id`, and a reaction keeps its `trigger.event_seq`.
- `spawn` refuses, changing nothing: an id the scene doesn't declare (`unknown_spawn`; the DM's error carries the scene's spawn ids in `hint.known_ids`), a flag or round spawn (`rejected` with `automatic`), and a spawn already placed in this scene (`rejected` with `already_spawned`). A player viewer's `automatic` message doesn't name the trigger.
- Each placement logs `spawned{spawn_id, handles}`, DM only; players see the new creatures in their state. The DM state lists the scene's `spawns` (`SpawnView`): id, `when` as the scene declares it, and whether it was `placed`.

### 4.7 Help

- `help{actor, help}` is the Help action out of combat (SRD 5.2.1 Rules Glossary, Help). The engine runs its own Help action (core U6), so its range, proficiency and Medicine check are the engine's rules. In combat Help is an option at the action prompt (below), and `help` answers `wrong_mode`. After a fight that ended by itself it closes `combat_over`, as `move` does.
- `assist_check{ally, skill}` gives the ally Advantage on their next ability check with that skill. The helper needs proficiency in the skill. The benefit is spent by that check, made with `request_check` (the roll's `advantage_sources` names it, DM view only), and lasts until the start of the helper's next turn: out of combat that is the helper's next `help`, the helper's first turn of a fight, or the next scene (even one the helper is left out of).
- `stabilize{target}` makes a DC 10 Wisdom (Medicine) check for a creature at 0 Hit Points that is not yet Stable. The roll is logged like any roll, with `dc_source: "rule"`. On a success the target becomes Stable (`life_state`, public); on a failure nothing changes and the helper can try again.
- Each `help` is an action, and out of combat each one starts the helper's next turn first, as the engine does for a creature outside an encounter: its action is back, and whatever lasted until the start of its turn ends, on any creature (a Help it gave before). Out of combat time passes only with these turns, never while the engine plays out a move or an action, and a creature outside a fight sees the turns of the creatures in it. No `turn_start` or `turn_end` is logged.
- **In combat**, `legal_actions` offers Help as up to three options, each costing the action and each listed only when it has a target (`in_range` for one within 5 feet; for one farther away the engine walks the helper into reach first, spending movement, as it does for an attack (API-25: that walk logs no `moved` yet)): `help/assist_ability_check` (an ally; one `variant` per skill the helper is proficient in, such as `help/athletics`, which `submit` must name), `help/assist_attack_roll` (a hostile creature: the next attack roll an ally makes against it has Advantage, until the start of the helper's next turn) and `help/stabilize` (a creature at 0 Hit Points that is not yet Stable). The `action` event and the rolls are logged as for any submit. A failed Medicine check can open Tactical Mind for a fighter helper, as any failed check does: taking it adds 1d10 to the check, which can turn it into a success, and the Help goes on with the new result.
- Every `help` logs a public `action` event with the helper and the other creature; its result is empty. Refused, rolling and logging nothing: a helper who is down (`condition_prevents`), the helper as the other creature or a target that is not dying (`invalid_target`), a skill the helper is not proficient in (`not_proficient`), and a creature more than 5 feet away (`out_of_range`; `move` there first). A refused `help` does not start the helper's next turn, so a Help it gave before still stands. A fighter's Tactical Mind after a failed Medicine check is declined, as for any check out of combat (§4.3).

## 5. Visibility (projection per `viewer`)

| Data | `dm` | Owner (viewer = that creature) | Other player viewer |
|---|---|---|---|
| HP / max HP / temp HP | yes | yes | no; `health: "unhurt" \| "bloodied" \| "down"` instead |
| AC, saves, stat block, resources, slots | yes | yes | no |
| Conditions | yes | yes | only visible ones (all SRD conditions except `invisible` while unseen) |
| Position, distance (ft) | yes | yes | yes, for creatures the viewer perceives (all of them until vision exists) |
| Roll: dice, total, outcome | yes (`full` view) | yes (`player` view) | yes (`player` view) |
| Roll: modifiers, `against` (AC/DC), `dc_source`, `advantage_sources` | yes | no; own modifiers and AC are on the sheet | no |
| Damage or healing amount | yes | yes | yes (it is said at the table) |
| `hit_points` events (HP after a change) | yes | own creature only | no |
| Scenario data: the scene file's check DCs, hazards, encounters, surrender conditions, flags, spawns; in state, `flags`, `checks`, `encounters` (with `surrender_available`) and `spawns`; the events `check_resolved`, `flag_set`, `hazard_triggered` and `spawned` | yes | no | no |
| Anchors: id, name, position | yes | yes, with `distance_ft` from the viewer | yes, with `distance_ft` from the viewer |
| `known_ids` in an error hint (the scene's anchor ids after `unknown_anchor`, its check ids after `unknown_check`, its encounter ids after `unknown_encounter`) | yes | no | no |
| `unavailable` reasons in `legal_actions` | yes | yes | n/a |
| `text` in events | rendered for `dm` | rendered for that viewer | rendered for that viewer |

The server projects; it doesn't authenticate. The engine trusts its single client. Projection exists so that a bug in the orchestrator's tool layer can't leak numbers, not to stop a hostile client.

## 6. Events

Every event: `{ seq, kind, round?, scene?, visibility, text }` plus a kind-specific payload. `visibility` is `{scope:"public"}`, `{scope:"dm"}` or `{scope:"owner", handle}`; the projection drops events the viewer may not see and turns `full` rolls into `player` rolls for player viewers.

| `kind` | Payload |
|---|---|
| `session_started` | `seed`, `protocol_version` |
| `scene_loaded` | `scene_id`, `mode` |
| `combat_started` / `combat_over` | `participants` / `winner`, `reason: side_down\|surrender\|fled\|scenario` |
| `surrendered` | `handles[]` (public) |
| `round` / `turn_start` / `turn_end` | `number` / `actor` |
| `action` | `actor`, `option_id`, `name`, `targets[]` |
| `roll` | `roll: RollView` (`view: "full"` or `"player"`) |
| `damage_taken` | `target`, `amount`, `damage_type`, `source_roll?` |
| `healed` | `target`, `amount`, `source_roll?` |
| `hit_points` | `target`, `hp`, `hp_max`, `temp_hp` (DM or owner visibility only) |
| `condition_added` / `condition_removed` | `target`, `condition`, `source` |
| `life_state` | `target`, `state: conscious\|unconscious\|stable\|dead` |
| `moved` | `actor`, `from`, `to` (ft), `anchor?` |
| `check_resolved` | `check_id?`, `actor`, `roll_id`, `success` (DM only) |
| `flag_set` | `flag` (DM only) |
| `hazard_triggered` | `hazard_id`, `actor` (DM only) |
| `rest` | `participants`, `rest: short\|long` |
| `spawned` | `spawn_id`, `handles[]` (DM only) |

`RollView` with `view: "full"`, unchanged from v0 except for the id format and the added fields (the `player` view drops `modifiers`, `against`, `dc_source` and `advantage_sources`):
```json
{ "view": "full", "id": "r412", "kind": "attack|saving_throw|ability_check|skill_check|initiative|damage|healing|death_save",
  "label": "Longsword attack vs goblin_1", "roller": "bren", "target": "goblin_1",
  "dice": [{"source":"d20","dice":"1d20","results":[14,6],"kept":14}],
  "modifiers": [{"source":"Strength","value":3},{"source":"Proficiency","value":2}],
  "total": 19, "against": {"kind":"AC","value":15}, "outcome": "hit",
  "advantage": "advantage", "dc_source": "scenario|ladder|stat_block|rule",
  "advantage_sources": ["Effect: some_effect (advantage)"] }
```
In the `full` view, `against` is always present for `attack` (AC), `saving_throw`, `death_save`, `ability_check` and `skill_check` (DC), and `dc_source` is present for every DC: `rule` for the fixed DC 10 of a death save and of Help's stabilize. Only `initiative`, `damage` and `healing` rolls have no `against`.

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
| `unknown_creature` / `unknown_option` / `unknown_check` / `unknown_anchor` / `unknown_spawn` / `unknown_encounter` | The id isn't in this scene | true |
| `not_your_turn` | `actor` isn't `awaiting.actor` (also returned by `legal_actions`, not an empty list) | true, after waiting |
| `stale_prompt` | `prompt_id` doesn't match | true, with the new `prompt_id` |
| `not_visible` | The viewer asked for something it may not see | false |
| `wrong_mode` | A combat command in explore mode or the reverse | false |
| `rejected` | The engine refused a legal-shaped decision. `reason` is one of: `out_of_range`, `no_valid_target`, `invalid_target`, `insufficient_resource`, `action_already_used`, `condition_prevents`, `not_known`, `needs_target`, `needs_point`, `needs_variant`, `no_path`, `already_attempted`, `condition_not_met`, `automatic`, `already_spawned` | true |
| `surrender_not_available` | `end_combat{surrender}` while the running encounter's surrender condition does not hold, or it declares none; nothing changed | false |
| `not_implemented` | The command is in the contract but this engine build does not serve it yet | false |
| `bad_scene` | The scene file, or a pregen or stat block it names, is missing or invalid; nothing changed | false |
| `internal` | An engine bug. The request did nothing, and the engine logs details to stderr | false |

`message` is one plain-English sentence written for a model or a human. It never contains Rust `Debug` output.

## 8. Versioning

- `v` is the major version. Within a major version, changes are additive only: new commands, new optional fields, new event kinds and new error reasons. Clients must ignore unknown fields and unknown event kinds.
- Removing, renaming or changing the meaning of anything bumps the major version.
- `hello.schema_sha256` is the sha256 over the checked-in wire schema followed by the scene schema, so a change to either changes it. The orchestrator compares it with the hash it was generated against and refuses to start on a mismatch.

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
