# Engine protocol v1

Rules the schema cannot express: ordering, idempotency, lifecycle, visibility. The wire types themselves are defined only in `crates/nat20-api-contract` (CLAUDE.md Rule 1); where this text and the contract crate disagree on a type, the crate wins.
Decision 1 below (definition format) is settled: Rust contract crate, see `docs/design/system-design.md` §5. Decision 5 is settled: the strict roll view, chosen by Stas on 2026-10-16. Decisions 2-4 are settled too: Stas confirmed their defaults on 2026-10-17.

Status (contract 1.0.0-dev.29): every v1 type is in the contract crate, and so is the scene file format (§2.1). The engine (CON-3) serves `hello`, `new_session`, `load_scene`, `start_combat` and `end_combat` (§4.4), `get_state`, `get_sheet` (§4.2), `legal_actions` and `submit` (in combat, and out of it, §4.8), `react`, `end_turn`, `move` (§4.1), `request_check` in explore mode (§4.3), `short_rest` (§4.5), `spawn` (§4.6), `help` (§4.7) and `events`, with the §5 projection. Dice are seeded per session (§2). Area options are offered and aimed (§4.4); no option has `targeting: "point"` yet. The core has no exhaustion model yet, so `exhaustion` is 0. Conditions are filled from what core models: Unconscious for a creature at 0 Hit Points that isn't dead, Incapacitated, Paralyzed and Poisoned when an effect applies them, and Prone (§5). A Prone creature stands at the start of its turn, spending half its Speed; when a fight ends, every conscious creature still Prone stands, and `condition_removed{prone}` is logged after `combat_over`.

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
                              ├─ start_combat{encounter_id} or start_fight{participants}   (mode: combat)
                              │     └─ submit / react / end_turn …  → combat_over (auto) or end_combat{reason}  (mode: explore)
                              └─ load_scene{next}   (party carries over; log continues)
```
- **One log per session.** Sequence numbers and roll ids are unique and monotonic for the whole session and never reused or rewritten. `load_scene` appends a `scene_loaded` event and doesn't clear anything.
- **The party persists.** PCs keep HP, slots, resources and conditions across scenes (API-5). Monsters belong to their scene.
- **One engine per session.** Every scene of a session runs in the same engine, so nothing about a carried creature is copied or rebuilt. `load_scene{party}` keeps the listed creatures of the current scene, places them at the new scene's `party_start` anchors in party order (the last anchor takes any creature beyond the list) and removes every other creature of the previous scene. Then the new scene's own `creatures` are placed. A creature can be carried whatever its side, such as a prisoner. A scene that places no creature of its own needs a party (`bad_request` without one); a scene with no `party_start` takes none (`bad_request`). A carried handle must be in the current scene (`unknown_creature`), may be listed only once (`bad_request`) and must not also be defined by the new scene (`bad_scene`). A refused `load_scene` changes nothing. Scene flags (§4.3) belong to the session and outlive every scene.
- **Time between scenes.** Every `load_scene` after the first passes ten minutes for the creatures of the scene being left, carried or not (decision D9): a hundred rounds of their turns. Whatever lasts until someone's next turn (a Help's Advantage) ends, and so does every spell of ten minutes or less (Bless, Guidance, Shield of Faith) together with the Concentration that held it. The creatures' own clocks move on by the ten minutes too, so the 16 hours before the next Long Rest (§4.12) count them. Each Concentration that ends this way is logged as `concentration_ended{expired}` right before `scene_loaded` (§6). An effect with no Concentration ends without an entry: v1 has no event for it.
- **No scene change mid-fight.** `load_scene` while a fight is running answers `wrong_mode` (not retryable) and changes nothing; the fight ends first, by a side going down or by `end_combat{reason}`. That way every `combat_started` in the log has its `combat_over`.
- **Leaving combat.** Both ways back land in explore mode in the same scene. When a side is down, the engine ends combat by itself: it logs `combat_over`, switches the scene to explore mode and reports `awaiting: combat_over` until a command changes the session (`load_scene`, `start_combat`, or any explore command that acts), after which `awaiting` reads `none`; read-only and rejected commands keep reporting it. Any explore command, `start_combat` or `load_scene` goes on from there; `end_combat`, `react`, `end_turn` and a `submit` with a `prompt_id` then answer `wrong_mode` (not retryable), because combat is already over and nothing is pending. `legal_actions` and a `submit` without one are explore actions there (§4.8). `end_combat{reason}` is only for ending a fight early.
- **Seed.** `new_session{seed?}` takes a u32. When it's omitted, the engine picks one and logs it in `session_started`. The same seed plus the same request stream gives an identical log and identical responses, so any session replays from its logged seed (fixture `duel.jsonl`). Every u32 is a real seed, 0 included. The core keeps one dice generator per thread and `new_session` re-seeds it, so one engine process runs one session at a time.

### 2.1 Scene files

`load_scene{scene_id}` reads `<data>/scenes/<scene_id>.json`, a `SceneFile` (contract module `scene.rs`, schema `generated/nat20-scene.schema.json`, TS `scene` namespace of the engine client). The DM agent reads the same files, so both sides agree on check ids, anchors, encounters and spawns. A scene file is DM-only data (§5): nothing in it, nor anything derived from it, goes into a player view except anchor names and positions.

- **Where content is read from.** `<data>` is the directory in the engine's `NAT20_DATA_DIR` environment variable; the game passes a scenario pack's folder there. Unset or empty, it is the server crate's `data/` in the checkout the engine was built in. In the same way `NAT20_PREGENS_DIR` names the pregen directory (§2.2) and `NAT20_MAPS_DIR` the terrain directory a scene's `map` names; unset, they are `pregens/` and `maps/` at the repository root. The engine logs the three directories on stderr at start-up. They change no command, response or event.
- **Contents.** `anchors` (named landmarks), `creatures` (placed on load, each `at` an anchor or a point, optionally with `carries`: the coins and pack items it holds, §4.9), `party_start` (anchors for carried creatures, in party order), `checks` (a skill check or save, a DC, and consequences on success and failure), `hazards` (a save and its consequences), `encounters` (participants, a surprise rule, a surrender condition, other allowed early ends) and `spawns` (creatures placed by the DM, by a flag at combat start, or at a round).
- **Checked on load.** Besides the schema (unknown fields are refused), the engine refuses a scene with `bad_scene` and changes nothing when: an id (anchor, check, hazard, encounter, spawn, flag, handle) isn't a plain name or repeats; a handle repeats across `creatures` and spawns; any handle, a carried encounter participant's included, is `dm` or `world` (the ledger's account outside the table, §4.9); a creature names an unknown pregen or stat block, or both or neither; an `at` or `party_start` names an unknown anchor; a consequence names an unknown hazard, a hazard sets off another hazard, or damage dice aren't `NdM` or `NdM+K` with M one of 4, 6, 8, 10, 12, 20, 100; a DC is outside 1 to 30; an encounter has no participants, lists one twice, or names a creature the scene doesn't define while it has no `party_start` (only a carried creature could fill it); a surrender condition names a non-participant, has no trigger, a fraction outside (0, 1), or a leader that isn't one of its creatures; `surrender` appears in `end_reasons` (a surrender condition governs it); a spawn is empty or fires at round 0; a carried creature shares a handle with the scene's creatures or spawns; a spawn's creature fails a check its placement would run (its stat block, or a side it cannot take beside the scene's and the carried creatures), so a scene that loads can always place its spawns; the `map` isn't a terrain file in the terrain directory (`maps/` unless `NAT20_MAPS_DIR` names another).
- **Served so far.** Placement of `creatures` at anchors or points, `map`, `party_start` for carried creatures (§2), `anchors` in state and as `move` goals (§4.1), `checks`, `hazards` and the flags they set (§4.3), `encounters` with their surprise rules (§4.4), and `spawns` of every kind (§4.3).
- **Coordinates.** `x_ft` east-west, `y_ft` north-south, `z_ft` up, in feet. The engine places a creature on the ground below its point.
- **Test scenario.** `m3_s1_green` to `m3_s5_cellar` (`m3_trail`, 5 scenes, Bren and Goblin Warriors) exercise every part of the format; Milestone 3 replays them end to end (API-23).

### 2.2 Pregen files

A scene creature with `pregen: "<id>"` is built from `pregens/<id>.json` at the repository root (or in `NAT20_PREGENS_DIR`, §2.1), a `PregenFile` (contract module `pregen.rs`, schema `generated/nat20-pregen.schema.json`, TS `pregen` namespace of the engine client). The engine reads it when the scene loads and builds the character through core's own level-up path, so every number on the sheet is core's.

- **Contents.** Name, species and subspecies, background, class and level (registry ids, `[namespace::]<kind>.<name>`, namespace `nat20_core` by default), ability scores before the background's increases and which two abilities it increases, answers to core's choice prompts by prompt id (`choices`), the class's skill picks (`skills`), the skill picks a species, background or feat asks for, keyed by its registry id (`skill_choices`, e.g. Human Skillful and the Skilled feat), the items carried with the slot each equipped one goes in, and coins. An optional `_comment` string on the file and on each section holds notes for humans; the engine ignores it.
- **Starting equipment.** The engine answers the class's and the background's starting equipment prompts with their gold-only option, then gives the character exactly the file's `equipment` (equipped ones put on in file order) and `money`. An item an equip displaces stays in the inventory.
- **Checked on load.** Besides the schema (unknown fields are refused), the scene is refused with `bad_scene`, naming the pregen and the problem, when: the id isn't a plain name or has no file; the file's `id` isn't its file name; a registry id doesn't parse or isn't registered; the level is outside 1 to 20; core asks a prompt the file does not answer, or refuses an answer (a pick that isn't one of its options, the wrong number of picks or skills, scores the point table doesn't allow); a `choices` or `skill_choices` entry answers no prompt core asked; an equipped item's quantity isn't 1, it can't go in its slot, or a quantity is 0; `money` isn't a coin amount such as `54 GP`. The engine checks every pregen a scene and its spawns name before it places any creature.

## 3. Prompts (`awaiting`)

```json
{ "kind": "action",   "prompt_id": "p57", "actor": "lia" }
{ "kind": "reaction", "prompt_id": "p58", "actor": "bren",
  "trigger": { "event_seq": 410, "summary": "goblin moves out of reach" },
  "options": [ { "choice": 0, "option_id": "opportunity_attack/longsword", "name": "Opportunity Attack (Longsword)" } ] }
{ "kind": "none" }                       // explore mode, nothing pending
{ "kind": "combat_over", "winner": "party", "reason": "side_down" }
{ "kind": "level_up", "prompt_id": "l1", "actor": "maren" }   // out of combat, §4.14
{ "kind": "no_session" }
```
- Every pending decision has a `prompt_id`. `submit`, `react` and `end_turn` must echo it. In combat, an old id is rejected with `stale_prompt` and changes nothing (a missing one is `bad_request`); in explore mode a command that carries one answers `wrong_mode` first. This makes late or duplicated agent decisions harmless. An explore `submit` carries no `prompt_id` (§4.8).
- `trigger.event_seq` is the `seq` of the event the reaction answers, not the log head: the mover's `moved` for an Opportunity Attack, the attacker's `action` for a reaction to an attack (Shield, a Barbarian's Reckless Attack). A reaction to an attack roll is offered before the roll is logged; the roll is logged once the reaction resolves, against the final AC (Shield's +5 included), so the log never shows a hit that became a miss. A move that provokes pauses where the reaction was offered and walks on once the reaction is resolved; leaving the next creature's reach on the way offers that creature its own reaction (§4.1).
- Several reactors to one trigger are asked one at a time in initiative order (today it's scene order; switch to initiative).

## 4. Commands

| `cmd` | Fields | `result` | Who may call (orchestrator binding) |
|---|---|---|---|
| `hello` | | `{protocol:"nat20-api", version:"1.0.0", engine_rev, schema_sha256}` | orchestrator |
| `new_session` | `seed?`, `roster?` (§4.15) | `{session_id, seed}` | orchestrator |
| `load_scene` | `scene_id` \| `scene`, `party?` (handles carried in) | `State` | DM |
| `get_state` | `viewer` | `State` (projected) | all |
| `get_sheet` | `actor`, `viewer` | `Sheet` (full if `viewer` = `actor` or `dm`, else `not_visible`) | player (self), DM, UI |
| `legal_actions` | `actor` | `{prompt_id, options: Option[], unavailable: [{option_id, reason, message}], can_end_turn, budget?}`; in explore mode `prompt_id` is empty, `can_end_turn` false and `budget` absent (§4.8); a creature viewer other than `actor` gets `not_visible` | the actor's agent, DM for the human |
| `submit` | `actor`, `prompt_id?` (required in combat, absent in explore mode, §4.8), `option_id`, `targets?: handle[]`, `aim?: {creature} \| {anchor} \| {point}` (area options), `point?: {x_ft,y_ft,z_ft}` (the same as `aim: {kind: point}`), `variant?: string` | `{accepted:true}` | as above |
| `react` | `actor`, `prompt_id`, `choice: int \| null` | `{accepted:true}` | the reactor's agent |
| `end_turn` | `actor`, `prompt_id` | `{accepted:true}` | as above |
| `move` | `actor`, `to: {anchor} \| {handle} \| {point}`, `prompt_id?` (required in combat), `partial?` | `{moved_ft, provoked: handle[], reached}` | DM (explore), actor (combat) |
| `request_check` | `actor`, `check: {kind:"scenario", check_id} \| {kind:"ladder", ability, skill?, dc}` | `{roll_id, total, success}` | DM |
| `short_rest` | `participants[]`, `hit_dice?: [{handle, count}]` | `{healed: [{handle, amount}]}` | DM |
| `start_combat` | `encounter_id` | `State` | DM (or a scenario trigger) |
| `end_combat` | `reason: "surrender"\|"fled"\|"scenario"` | `State` | DM, only when the encounter allows the reason (§4.4) |
| `spawn` | `spawn_id` (declared in the scene file) | `State` | DM / scenario trigger |
| `events` | `since`, `viewer` | `{events, next}` | all |
| `help` | `actor`, `help: {assist_check} \| {stabilize}` | `{}` | DM, out of combat (§4.7) |
| `give` | `actor`, `to`, `what: Goods` | `{}` | DM, out of combat (§4.9) |
| `steal` | `actor`, `target`, `what: Goods` | `{roll_id, success}` (thief and DM only) | DM, out of combat (§4.9) |
| `loot` | `actor`, `from` | `{}` | DM, out of combat (§4.9) |
| `place_creature` | `handle`, `monster`, `side`, `at`, `name?`, `carries?` | `{state, handle}` | DM (§4.10) |
| `start_fight` | `participants[]` | `State` | DM, for a fight no authored encounter fits (§4.4) |
| `start_campaign` | `party[]`, `human?` (the human's creature, a party member) | `State` with `world` | game loop as DM, once (§4.11) |
| `travel` | `actor`, `to?` (place or road id), `pace: fast\|normal\|slow` | `{leg, state}` | the caravan's driver, as itself (§4.11) |
| `rest_night` | `actor`, `where: inn\|camp` | `{night, state}` | the caravan's driver, as itself (§4.12) |
| `choose_card` | `actor`, `choice` | `State` | a Hired Blade or a player owner, as itself (§4.13) |
| `save_roster` | | `{roster}` | the game loop as DM (§4.15) |
| `level_up` | `actor` | `{choice?, state}` | the levelling character's player, as itself (§4.14) |
| `answer_level_up` | `actor`, `prompt_id`, `picks?: string[]` | `{choice?, state}` | as above (§4.14) |

### 4.1 Moving

- `to` is an anchor of the scene, a point, or a creature (the move ends within 5 ft of it). An anchor the scene doesn't define answers `unknown_anchor`; the DM's error carries the scene's anchor ids in `hint.known_ids`, a player's carries none.
- **Explore mode.** Anyone may be moved and `prompt_id` is ignored. The creature walks the whole route on the map at no movement cost and provokes nobody, since nobody is fighting. A creature at 0 HP can't move (`rejected`, `condition_prevents`).
- **Combat.** `move` is a decision at the actor's action prompt, so it needs that prompt's id (`bad_request` without one, `stale_prompt` for an old one) and gets a new prompt like `submit`. The whole route must fit in the movement left this turn, else `rejected` with `insufficient_resource` and nobody moves. With `partial: true` (API-35, `1.0.0-dev.37`) such a route is walked as far as the movement left goes instead, stepped back to the last free spot along it, since a creature can't end its move in another's space; the result's `reached` is then `false`. A partial move that can't get anywhere (no movement left, or no free spot before it) is still `rejected` with `insufficient_resource` and keeps its prompt, so a caller never mistakes standing still for a move. In explore mode `partial` is ignored: there is no movement to run out of. `reached` is `true` for every move that isn't cut short, including one an opportunity attack holds on the way, and every explore move. Leaving a creature's reach offers it an opportunity attack, an ally's included, as SRD 5.2.1 allows one against any creature the reactor can see: the attack interrupts the move, it doesn't end it (SRD 5.2.1, Opportunity Attacks). The mover pauses where it provoked while the reaction is open. `provoked` names every creature the move gave a window during the command, in prompt order, including one a scripted creature settled inside it, and `moved_ft` is the distance covered by the time of the response. Once the reaction is resolved, taken or declined, the mover walks on along its route to the goal; that walk is logged as its own `moved` in the response that resolves the reaction, after the reaction's entries, and its movement is spent. Each creature gets one chance per move, and leaving a further creature's reach on the way pauses the walk again for that creature's reaction. A creature that can't see the mover where it leaves its reach gets no reaction, and the walk doesn't pause for it. When a scripted creature resolves the reaction inside the `move` itself, the creature walks on before the response, and `moved_ft` counts that walk too. A creature the attack drops, or leaves unable to move, walks no further. A creature can move through another creature's space but can't end its move there (SRD 5.2.1, Moving Around Other Creatures); a route always ends on a free spot. A scripted monster takes an opportunity attack only against a creature hostile to it; a client decides for its own creatures.
- No route to the goal (off the map, or blocked) answers `rejected` with `no_path`.
- Every move logs a public `moved` event with `from`, `to` and the anchor, when the creature reached one (a partial move cut short names none). So does a walk the engine makes on its own for an option: a `submit` on a target out of reach (§4.4), and a scripted monster walking to its target. That `moved` is logged once the walker stops, right before the `action` it walked for (or the `action_dropped`, when it didn't get to take it), in the same response as that `action` even when a reaction to it is still pending, and an Opportunity Attack the walk provokes names it as its `trigger.event_seq`. When that walk provokes, the walk so far is logged in the response that opens the reaction, so the reaction can name it; once the reaction is resolved the walker walks on, and that walk is logged as its own `moved`, right before the `action` it walked for.

### 4.2 Sheets

- `get_sheet` answers the owner (`viewer` = `actor`) and the DM with the full `Sheet`; any other creature viewer gets `not_visible`. An actor not in the scene answers `unknown_creature`.
- It is read-only and works in either mode: it rolls nothing, logs no event and does not advance the seeded dice, so asking for a sheet never changes what a later roll comes up.
- Check and save bonuses are what the engine adds to the d20 when it rolls: ability modifier, proficiency and lasting effects. Dice bonuses such as Bless are left out. `initiative_bonus` is the engine's initiative check; Passive Perception is core's passive score: 10 plus the Perception bonus, plus 5 with Advantage on Perception checks or minus 5 with Disadvantage (SRD 5.2.1).
- `spellcasting` has a line per class with the Spellcasting feature: the ability, the spell save DC (8 + ability modifier + Proficiency Bonus) and the spell attack bonus (ability modifier + Proficiency Bonus, Bless left out as above). `spells` lists what the creature can cast or prepare, cantrips first, then by level and name: cantrips and prepared spells are `prepared: true`; a learned spell that isn't prepared (a Wizard's spellbook) is `false`. A class that prepares from its entire list, such as the Cleric, lists only what it has prepared. `concentration` says whether casting the spell starts Concentration.
- The sheet's own `concentration{spell}` names the spell the creature is concentrating on now; it is absent when there is none.
- A resource whose expended uses all come back on a Long Rest but some on a Short Rest (Second Wind, Rage, Channel Divinity: one use) says how many in `short_rest_regain`.
- `hit_dice` lists the Hit Point Dice by die size, smallest first; a creature without them (a monster) has none.
- `conditions` are the creature's conditions as in state (§5). `effects` lists its lasting effects in the order they began: whatever runs out at a turn boundary or came from an action (Bless, Guidance, Shield of Faith, a Help's Advantage, Action Surge, Rage, Dash), with `id` (the registry id with `/`, e.g. `spell/bless`), `name` and `source`, the creature whose action put it there. Features that last for good are in `features`. Not filled yet: `exhaustion` (as in state).

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
- `start_fight{participants}` (API-34, decision 0035) is the one exception to "participants come from the scene file". It is the DM's command for a fight that no authored encounter fits, such as a robbery on the road or a creature placed with `place_creature` (§4.10).
  - **Who can fight.** Each participant must be a creature of the scene (`unknown_creature`), listed once (`bad_request`), conscious (`rejected` with `condition_prevents`) and on the party or the hostile side, not neutral (`bad_request`). At least one participant must be on each side (`bad_request`). While a fight runs, it answers `wrong_mode`.
  - **How it runs.** Initiative is rolled as for an authored fight, with no surprise. A flag spawn whose flag is set arrives and joins, as with `start_combat`. There is no surrender condition and no early end, so `end_combat` answers `rejected` with `condition_not_met`; the fight ends when a side is down.
  - **In the DM's view.** The fight is listed among the scene's `encounters` as `fight_<n>` (the first number the scene doesn't use) until the next scene loads.
- **Surprise:** when the encounter has a surprise rule and its `when_flag` is set, every participant on the `surprised` side rolls initiative with Disadvantage (SRD 5.2.1 Surprise). The DM never names who is surprised (decision D4). Those `initiative` rolls show `advantage: "disadvantage"` in every view; the DM's also carry the reason in `advantage_sources`. Without the flag, everyone rolls normally.
- The DM state lists the scene's `encounters` (`EncounterView`): each one's id, whether it is `running`, `surrender_available`, and `surrendering`. `surrender_available` is true only for the running encounter, while its surrender condition holds. `surrendering` names the creatures an `end_combat{surrender}` would make `neutral` now (the condition's creatures still conscious, in the condition's order), and is left out while no surrender is available; a participant the condition doesn't name never appears there. The engine evaluates the condition from the current state of its creatures that are in the scene: `hp_fraction_at_most` sums their current and maximum Hit Points; `standing_at_most` counts the conscious ones; `leader_down` holds when the leader is at 0 Hit Points or dead. A condition with none of its creatures in the scene never holds, and a leader who is not in the scene is not down. The engine never surrenders on its own (decision D5).
- `end_combat{reason}` ends the running fight early and answers the state in explore mode, with `awaiting: none`:
  - `surrender` is accepted only while `surrender_available` is true; otherwise it answers `surrender_not_available` (not retryable as it stands) and changes nothing. On success the condition's creatures that are still conscious become `neutral` and stay in the scene, and in the engine their attitude toward the winners' factions becomes neutral, and so does each winner's attitude toward them (only toward them; the rest of the winners' factions keep theirs), so a later scene can carry them in with their captors. The engine logs `surrendered{handles}` (public), then `combat_over{reason: "surrender"}` with the other side as `winner`.
  - `scenario` is accepted only when the encounter lists it in `end_reasons`; otherwise `rejected` with `condition_not_met`. It logs `combat_over{reason: "scenario"}` with no winner.
  - `fled` is accepted only when the encounter lists it in `end_reasons`; otherwise `rejected` with `condition_not_met`. "The other side" is every participant of the running fight that is not on the party's side. Those still conscious leave the scene: the engine logs `fled{handles}` (public, in scene order), removes them, and they are gone from every later state; those at 0 Hit Points stay where they fell. It then logs `combat_over{reason: "fled"}` with `winner: "party"`. Creatures that are not participants, a surrendered captive among them, stay. The engine never decides a retreat on its own; the DM calls it (Milestone 5 spec D7, D11).
  - Outside combat, including after a fight ended by itself, `end_combat` answers `wrong_mode`.
  - A player viewer's `surrender_not_available` and `condition_not_met` messages say only that the fight cannot end that way right now; the DM's name the encounter and why (scenario data, §5).

`Option` (from `legal_actions`):
```json
{ "option_id": "melee_attack/longsword", "action": "nat20_core::action.melee_attack",
  "name": "Longsword attack",
  "summary": "Attack a creature within the weapon's reach. A hit deals the weapon's damage.",
  "cost": {"action": 1},
  "targeting": "single", "targets": [ {"handle":"goblin_1","reach":"in_range","attitude":"hostile"} ],
  "variants": [] }
```
`option_id` stays stable for the life of the prompt and is derived from the action plus its context (weapon slot, spell and level), never from a list index.

- A weapon attack is `melee_attack/<weapon>` or `ranged_attack/<weapon>`, named after the weapon ("Longsword attack"); an Unarmed Strike is `unarmed_attack` ("Unarmed Attack"). Any other action made with an attack keeps its own name and says what it attacks with: `barbarian/reckless_attack/greataxe` is "Barbarian Reckless Attack (Greataxe)", its Unarmed Strike context `barbarian/reckless_attack` is "Barbarian Reckless Attack (Unarmed)", and an Opportunity Attack is "Opportunity Attack (Longsword)". The `action` event of the option carries the same name.

- A spell is `cast/<spell>/<level>` for the slot level it is cast at (`cast/bless/1`), or `cast/<spell>` for a cantrip (`cast/sacred_flame`), named after the spell ("Bless"). Its option carries `spell{id, level, concentration}`: the spell's registry id, the level it is cast at (0 for a cantrip) and whether casting it means Concentration. Options that are not spells have no `spell`.
- A carried item that is used up, a Potion of Healing, is `use/<item>` (`use/potion_of_healing`), named after the item ("Potion of Healing"), one option however many the actor carries. Its option carries `item{id, remaining}`: the item's id as on the sheet and how many the actor carries now. It costs a Bonus Action and names one creature within 5 feet, the actor included: the actor drinks it, or gives it to someone else (SRD 5.2.1 "Using a Potion"). Taking it logs `action`, then `item_used` (§6), then the healing roll and `healed`, and removes one from the actor's equipment. When the last one is gone the option is gone, and a `submit` of it answers `rejected` with `no_item_left`. Options that use no item have no `item`.
- An area spell (Burning Hands, Thunderwave, Acid Splash) has `targeting: "area"`, `max_targets: 0` and `area{shape, size_ft, from_self, aims}`. `shape` is `cone`, `sphere`, `cube`, `cylinder` or `line`; `size_ft` is a cone's or line's length, a cube's side, a sphere's or cylinder's radius. When `from_self` is true the area starts at the actor (Burning Hands' cone, Thunderwave's cube) and the aim only points it, so there is no `range_ft`; otherwise the aim is its centre and must be within `range_ft`. `aims` previews, for each other living creature and each anchor of the scene, the creatures that aim would catch, allies included, leaving out aims that catch nobody (Milestone 4 decision D8). `submit` names the area with `aim` instead of `targets`: `{kind: creature, handle}`, `{kind: anchor, anchor}` or `{kind: point, point}`, and the older `point` field means `{kind: point}`. An area option without an aim is `rejected` with `needs_point`, with `targets` `invalid_target`; an aim beyond `range_ft` is `rejected` with `out_of_range`; an aim that catches no creature is `rejected` with `area_empty` and spends nothing; an aim on an option that is not an area, or both `aim` and `point`, is `bad_request`; an unknown anchor is `unknown_anchor`. The `action` entry's `targets` are the creatures the area caught, in scene order, including any it kills. Out of combat an area that would catch a creature of the other side answers `wrong_mode`, as any action on an enemy does (§4.8).
- `budget` says what the actor has left of its turn in a fight: `action`, `bonus_action` and `reaction` (uses left; Action Surge adds one action, a spent one is 0), `movement_ft` (whole feet left this turn, rounded down) and `speed_ft` (this turn's movement, Dash included, which `movement_ft` counts down from). It is the same resource state the options are checked against, so an option that needs a spent action is in `unavailable`, and a `move` longer than `movement_ft` is `rejected` with `insufficient_resource`. Explore mode has no turn and no `budget`; that is the only time it is absent. Like a sheet, the whole listing answers only the actor's own viewer and `dm`: any other creature viewer gets `not_visible` (§5).
- `summary` says what the option does in one to three plain sentences: the rule's own short text from the engine's registry (the spell's for a cast, the action's otherwise), the same for every viewer and the same every time the option is offered. It never carries a DC, odds or a computed number, so it is safe in any view that carries the option (§5). It is absent when the rule has none, as for a monster's own attacks; clients show nothing then and never fall back to other text.
- `unavailable` entries use the same `option_id` as the option would have if it were offered (`melee_attack/longsword`, `cast/guiding_bolt/1`).
- An option whose target is out of reach or out of sight (`in_range: false`) is still offered; `submit` walks the actor to a spot the engine picks, then acts. A creature standing between caster and target blocks the line of sight. When the actor doesn't get to take the option, the submit is still accepted and the log says so with `action_dropped` (§6) in place of the `action`: the Opportunity Attack the walk provoked dropped the actor or left it unable to move (§4.1), or the option couldn't be taken where the walk ended. Nothing the option costs is spent; the movement is. In a fight the actor's action prompt comes back once any reaction is resolved, so it can choose again. The walk is logged as a `moved` before the `action_dropped` (§4.1), and a reaction prompt it opens names that `moved` as its `trigger.event_seq`.

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
- **In combat**, `legal_actions` offers Help as up to three options, each costing the action and each listed only when it has a target (`in_range` for one within 5 feet; for one farther away the engine walks the helper into reach first, spending movement and logging a `moved`, as it does for an attack (§4.1)): `help/assist_ability_check` (an ally; one `variant` per skill the helper is proficient in, such as `help/athletics`, which `submit` must name), `help/assist_attack_roll` (a hostile creature: the next attack roll an ally makes against it has Advantage, until the start of the helper's next turn) and `help/stabilize` (a creature at 0 Hit Points that is not yet Stable). The `action` event and the rolls are logged as for any submit. A failed Medicine check can open Tactical Mind for a fighter helper, as any failed check does: taking it adds 1d10 to the check, which can turn it into a success, and the Help goes on with the new result.
- Every `help` logs a public `action` event with the helper and the other creature; its result is empty. Refused, rolling and logging nothing: a helper who is down (`condition_prevents`), the helper as the other creature or a target that is not dying (`invalid_target`), a skill the helper is not proficient in (`not_proficient`), and a creature more than 5 feet away (`out_of_range`; `move` there first). A refused `help` does not start the helper's next turn, so a Help it gave before still stands. A fighter's Tactical Mind after a failed Medicine check is declined, as for any check out of combat (§4.3).

### 4.8 Actions out of combat

- Out of combat any creature can take its options as a turn of its own (decision D7 of the Milestone 4 spec): a Cleric casts Cure Wounds or Guidance at camp, a Fighter uses Second Wind. The DM decides that the fiction allows it; a player agent asks through the orchestrator.
- `legal_actions{actor}` in explore mode lists the options `actor` could take on a turn that began now: its action and Bonus Action are back, whatever a fight or an earlier explore action spent. `prompt_id` is empty, since nothing is pending, `can_end_turn` is false and there is no `budget`. The listing changes nothing.
- `submit{actor, option_id, targets?, variant?}` without a `prompt_id` takes one option the same way. It first starts `actor`'s next turn, as `help` does (§4.7): its action and Bonus Action come back, and whatever lasted until the start of its turn ends. Then the option resolves as in combat, with the same `action` event, rolls and effects. Each submit is its own turn, so a creature can take one action after another. Out of combat nobody is asked to react (§4.3). After a fight that ended by itself it closes `combat_over`, as `move` does.
- Checked before anything changes, so a refused submit starts no turn: a creature that is down answers `rejected` with `condition_prevents`, an option it doesn't have now `unknown_option`, a missing or unknown variant as in combat. A `submit` that carries a `prompt_id` in explore mode is a late combat decision and answers `wrong_mode`. So does one aimed at an enemy (a party creature at a hostile one, or the reverse): that starts a fight, which only `start_combat` does, so Initiative and surprise come from the scene.
- `help` stays the dedicated Help command out of combat (§4.7).

### 4.9 Coin and items changing hands

Out of combat (`wrong_mode` in a fight), between two creatures within 5 feet of each other (`out_of_range` otherwise; `move` there first), a creature can hand over, steal or take coin and items (ITM-6). Core moves them (ENG-28); every movement is logged as a `ledger` event and posted to the session's ledger (`nat20-ledger`, decision 0057), which the run audit balances against the purses. Worn and wielded gear never changes hands this way: only what is carried in the pack.

- **What moves.** `Goods` is `{kind:"coins", coins}` (any mix of CP, SP, EP, GP and PP) or `{kind:"item", item}` (one of a carried item, by its registry id without the namespace, such as `potion_of_healing`). A purse pays with change: 5 SP can come out of a purse holding only gold, as SRD coins convert. Each move is all or nothing: a purse that holds less than the amount, counted with change, answers `insufficient_funds`; an item that isn't carried answers `not_carried`. A `coins` with nothing in it, or an unknown item id, is `bad_request`.
- **`give{actor, to, what}`** hands `what` to `to`, conscious or not but alive (`invalid_target` for a dead creature). The giver must be conscious (`condition_prevents`). It logs one public `ledger` entry with `reason: "trade"`. The result is empty.
- **`steal{actor, target, what}`** is a Dexterity (Sleight of Hand) check against the target's passive Perception (core's `passive_score`, ENG-32), logged with `dc_source: "passive"`. The roll is visible to the thief and the DM only. On a success `what` moves to the thief and one `ledger` entry with `reason: "theft"` cites the roll; it is visible to the thief and the DM only, so the victim's own view shows nothing. A success against a target that doesn't carry `what` takes nothing and logs no entry: the thief finds out from their sheet. On a failure nothing moves and a public `theft_noticed` names the thief and the target; what the target does about it is the fiction's. The result is `{roll_id, success}`, so only the thief's own viewer and `dm` may send it: any other creature viewer gets `not_visible` and nothing is rolled. Out of combat a target that is down can still be robbed, and the check is still rolled.
- **`loot{actor, from}`** takes everything `from` carries: every coin and every pack item, from a creature that is dead, at 0 Hit Points, or one that surrendered (`not_fallen` for one still on its feet; `nothing_carried` when there is nothing). It logs one public `ledger` entry for the coin (`reason: "loot"`) and one per item stack. The result is empty.
- **Purses on the sheet.** `get_sheet` carries `purse`: the coins by kind and `total_cp`, the whole purse in copper pieces. It is the owner's and the DM's (§5).
- **Monsters' purses.** A scene creature may carry `carries`: coins and items it holds when placed (§2.1). Monsters have no purse otherwise. What a monster carries is the scene's, DM-only data, until it moves to someone in a `ledger` entry.

### 4.10 Creatures the scene file doesn't list

`place_creature{handle, monster, side, at, name?, carries?}` places one monster for a story beat no authored spawn fits (API-33, decision 0035). It is the DM's command; a player's tools never bind it. The game's DM tool takes `monster` and `carries` only from the pack's `stat_blocks` list in `adventure.json`, so the coin a creature carries is authored, never named by the DM; the engine doesn't read `adventure.json` and trusts its single client for that, as for everything else (§5).

- **Checked before anything changes:**
  - `handle` must be a plain name that no creature of the scene and no spawn of the scene file uses, and not `dm` or `world`; otherwise `bad_request`.
  - `name`, when given, is one line of at most 40 characters with no control characters (`bad_request`).
  - An anchor the scene doesn't have answers `unknown_anchor`, with the scene's anchor ids in the DM's hint.
  - A stat block the registry doesn't have answers `unknown_stat_block`.
  - `carries` with an unknown item, more than 100 of one item, or more coin than a purse can hold is `bad_request`; a scene file's or a world's `carries` with the same faults is `bad_scene`.
- **Where it stands.** On the ground at `at`, or else on the nearest free spot of the 5-foot grid around it, up to 10 feet away, tried in a fixed order: the ring at 5 feet first, then the ring at 10. When every spot is taken, or there is no ground there, it answers `rejected` with `no_room` and nothing is placed.
- **What follows.**
  - The creature takes the side it is placed on (MON-11). Where its faction disagrees, such as a townsfolk Guard placed `hostile` or a goblin placed with the party, the engine sets the attitude between it and each creature of the scene, both ways, to match their sides: hostile across party and hostile, friendly on one side, neutral otherwise. A scene file's own creatures and spawns still must agree with their sides (§2.1).
  - The engine runs the creature with its scripted policy, as any scene monster.
  - `name` replaces the stat block's name in every view.
  - The engine logs a DM-only `creature_placed{handle, monster}`; players see the creature in their state like any other, with its health band and visible conditions.
  - During a fight it joins it as a spawn does: it rolls initiative, and the roll is logged.
  - Out of combat it stays out of any fight until one includes it (API-34).
  - Like the scene's own creatures, it is gone when the next scene loads, unless that `load_scene` names it in `party` (a prisoner led away, say), which carries it as any scene creature.
  - A pending prompt keeps its id.
- The result is the state after the placement and the new `handle`.

### 4.11 The living world: campaign and travel

`start_campaign{party}` starts the living world (API-41, Milestone 9). The game loop calls it once as `dm`, out of combat, after loading the start place's scene. The engine reads the scenario pack's `campaign.json`, only its `world` block: `map` (a world id), `start` (a place), `day` (from 1, default 1), `hour`, `caravan` (owner and wagons), `route` and `road_scene`. The world's `map.json` and `goods.json` come from `<pack>/worlds/<id>/`, else from the shared worlds directory (`$NAT20_WORLDS_DIR`, else `worlds/` in the checkout).

- **Checked before anything changes.** A creature viewer gets `not_visible`; a second call `bad_request`; a running fight `wrong_mode`. The party must be non-empty, listed once each, and in the current scene (`unknown_creature`). A missing or invalid campaign, map or goods file, an unknown start or route place, a caravan over its limit, a deck directory that exists but doesn't read, a player owner who is not in the party, and any place scene or road scene that doesn't read answer `bad_scene`. A refused `start_campaign` leaves no campaign started.
- **The caravan owner.** `caravan.owner` is a player creature's handle (that player plays the Merchant) or `npc:<id>`. The owner is the only creature whose `travel` the engine accepts; when an NPC owns the caravan, any party member may call it, and `travel` without `to` follows `route`. The DM never calls `travel`: the engine refuses it as `dm` with `not_driver`.
- After `start_campaign` every `State` carries `world`: the DM's `WorldDm`, a player's `WorldPlayer` (§5).

`travel{actor, to?, pace}` travels one leg along one road. `actor` must be the viewer itself and a driver (`rejected`, `not_driver`); before `start_campaign` it answers `no_campaign`, in a fight `wrong_mode`, while a level-up is open `rejected`, `level_up_open` (§4.14), and with a party member missing from the scene `unknown_creature`.

- **Where.** `to` is a place id at the other end of a road from here, or a road id from here. Without `to` the caravan goes on along the road it stands on, or, when an NPC owns it, to the next place of the route; a player owner without `to` is `bad_request`. On a road, `to` may name the end the caravan heads for or the one it came from (turning back). Anything else is `rejected`, `no_road`, as is an NPC route with no next place.
- **Pace (SRD 5.2.1).** Fast is 4 miles an hour and 30 a day, Normal 3 and 24, Slow 2 and 18. A road's terrain sets its maximum pace (Travel Terrain), a good road raises it by one step, and a pace faster than that is `rejected`, `pace_too_fast`, with the fastest in the message. A party member at half Speed or less forces Slow (Slower Travelers); nothing halves Speed out of combat until exhaustion (ENG-29).
- **How far.** A day of travel is one day's distance at the pace. Mixed paces share it: a mile at Fast spends 1/30 of the day, at Normal 1/24, at Slow 1/18, and `world.today` shows the miles left at each pace. A leg goes as far as the day allows and stops on the road when it is spent; once nothing is left, `travel` is `rejected`, `day_over`, until a night's rest (API-42). Extended travel past a day (the Constitution saves) is not offered. A wagon over its limit (five times its team's carrying capacity, including the vehicle; Mounts and Cargo) stops the caravan: `rejected`, `overloaded`.
- **What follows, in order.** The world clock moves on by the leg's minutes and core's time with it, less the ten minutes the scene change itself passes (§2), so effects that run out end and are logged. `traveled{leg}` is logged (public), then `place_discovered{place, name}` (public) when the leg reached a place the party didn't know. Then the engine loads the scene the leg ended in, carrying the party as `load_scene` does: the place's own scene on arrival, else the campaign's `road_scene`, which also stands for the road. `scene_loaded` follows. If that load fails, the world has still moved and the error says why.
- The result is the `leg` (also in `traveled`) and the state in the new scene.
- **Plans (API-49).** A player's `world` says how long the way ahead takes, worked out by the world with the rule above on a copy of itself, so nothing changes and no client repeats the rule. Each road out of the caravan's place (in `roads` or `unexplored`) carries `reach{pace, minutes, nights, arrives}`: at a Normal pace, or the road's slower maximum; the minutes on the move; the nights spent on the road when the day's distance runs out first (a night lasts as `rest_night`'s does, and the party goes on at dawn); and the clock on arrival. On the road no road carries it. While an escort contract is under way and an NPC owner follows its route from a place on it, `trip{legs, complete}` lists the legs to the destination in order, each `{road, to, pace, miles, minutes, nights, arrives}` with the day's distance shared across legs; the legs stop before the first place the party hasn't discovered (`complete: false`), so a trip never names one. A caravan the rule would refuse (overloaded) has no `reach` and no `trip`. Clients show the times as prose and a watch.

### 4.12 Nights

`rest_night{actor, where}` ends the day (API-42). The callers and the refusals before anything happens are `travel`'s (§4.11): `no_campaign`, `not_driver`, `wrong_mode`, `level_up_open`, `unknown_creature`.

- **Where.** `inn` needs the caravan in a place with an inn (`inn_cp` in its place view), else `rejected`, `no_inn`. Every party member pays `inn_cp` for room and board, which is a full day's food; if any purse holds less, counted with change, nothing happens: `rejected`, `insufficient_funds`. `camp` works anywhere: party members eat one unit of the caravan's `rations` each, in party order, while they last.
- **How long.** Until the next dawn (06:00), and never shorter than a Long Rest's 8 hours (SRD 5.2.1). A night called in the morning waits the day out.
- **What follows, in order.** Each inn fee is a `ledger` entry (public, reason `inn`, to `world`). Each party member's day ends through core with what they ate: a full day's food, or nothing. Core runs Malnutrition (SRD 5.2.1, Gameplay Toolbox): five days without food bring an Exhaustion level, and each day after another; levels from malnutrition stay until a full day's food. Any saving throw it calls is logged as one. Then the night's hours pass up to its last 8, as the party keeps the evening, and the Long Rest takes those last 8: each party member who can take one then (at least 1 Hit Point, and 16 hours since the end of their last) takes it through core, which removes one Exhaustion level a Long Rest can remove. A night called in the afternoon thus sleeps from the evening, and the party that woke at dawn rests again. The world clock and core's time move on by the night, effects that run out end, and the `rest` event is logged. Core's clocks keep step with the world's: the ten minutes between two scenes (§2) pass on them too. A new day of travel starts, and `night{night}` is logged last (public).
- The result is the `night` (also in the event): `minutes`, and who `rested`, who was `not_rested` and who went `hungry`, and the state at dawn. The world crate takes the rations; the ledger does not log food yet.
- After a night in camp the engine draws a night card (§4.13).

### 4.13 Road cards

A world's deck is `worlds/<id>/deck/*.json` (API-43). Each card belongs to a zone: a road's `zone`, or a place id for a night in camp there; a card drawn after a leg (`when: road`) must be in a road's zone (`bad_scene`). A card joins the deck when the place it `requires` is discovered, or when a choice adds it (a chained card); a drawn card goes to the discard until its zone's pile runs dry, and a `once` card leaves the game.

- **The draw.** After every `travel` leg (on the leg's road zone, once the scene has loaded), except the leg that settles the escort contract, which ends the journey and draws nothing, and after every `rest_night{where: camp}` (on the road zone, or the place), the engine rolls a d100 on the zone's pile in file order. The roll is a `roll` event with an `rN` id, roller `world`, kind `table`, **DM only**: its die face would tell players the pile's size. A zone with no card in play rolls nothing. Then `card_drawn{target, card_text, choices}` (public): `card_text` is the card's words, and the event's own `text` the rendered sentence. The card id, its zone and the deck appear only in the DM's `world.card`.
- **While a card waits,** `travel` and `rest_night` are `rejected`, `card_pending`. `world.card` (both views) shows the text, the choices, what each Blade has `said`, and who the engine is `waiting_for`.
- **Who speaks** (`choose_card{actor, choice}`, as the actor itself). The Hired Blades are the party members, less a player owner, who are in the scene and up (alive and conscious).
  - *Caravan card* (`target: caravan`): each Blade's word is advice, logged as `card_advice` (public). A player owner decides with their own `choose_card`, and only after every Blade has advised (`rejected`, `waiting_for_advice`). An NPC owner takes the Blades' majority once all have advised; a tie goes to the card's own pick, and a choice the card marks as the owner's insistence wins whatever the advice (the DM narrates why).
  - *Blade card* (`target: blades`): each Blade's word is a vote (`card_advice`). Once all have voted the majority wins; a tie goes to the human's creature (`start_campaign.human`) when it voted for one of the tied choices, else the card's pick, else the first tied choice.
  - A creature with no say is `rejected`, `no_say`; a second word `already_spoke`; a choice the card lacks `unknown_choice`; no card `no_card`. In a fight the card waits: `wrong_mode`. A card nobody can speak on is settled at once by its default.
- **What follows, in order.** `card_resolved{choice, decided}` (public), then the choice's effects in order. A group check rolls a ladder check through core for each creature named and succeeds when at least half succeed (SRD 5.1, Group Checks); its rolls and their outcome are logged as any `request_check`'s. Coin paid to or taken from the world is a `ledger` entry (reason `toll` or `reward`; a payer pays what their purse holds, up to the price). Goods gained or lost are `cargo_changed{good, change}` (public), time lost `time_lost{minutes}` (public), with the clock, core's time and the day's travel moving on. Exhaustion goes through core. A check or a fight takes the creatures named who are up; a payment, a gain and Exhaustion take every one named who is not dead. A fight places each stat block hostile at the scene's first anchor (`creature_placed`, DM only) and starts a fight with the party as `start_fight` does; it always comes last.

### 4.14 Experience and level-ups

XP and levels are core's (ENG-31); the engine awards XP and runs core's `LevelUpSession` (API-44).

- **XP.** When a fight ends with the party's side the winner (`side_down`, `fled` or `surrender`), the XP of every hostile creature in it (SRD 5.2.1, by Challenge Rating) is split evenly among the party's characters in it, rounded down, standing or not. Each gets `xp_awarded{actor, xp, total, can_level_up}` (owner and DM), logged after `combat_over`. A fight that ends by `scenario`, or that the party loses, earns nothing. The sheet's `xp` shows `points`, the `next_level` threshold and `can_level_up`.
- **Opening.** `level_up{actor}`, as the actor itself (else `rejected`, `no_say`), out of combat (`wrong_mode`), for a character whose `xp.can_level_up` holds (`rejected`, `not_enough_xp`). One level-up is open at a time: another character's is `rejected`, `level_up_open`. Core applies the level at once (Hit Points, features, the subclass); the engine answers every prompt that has one answer (the class, a subclass with one option, a choice with as many options as picks). The result's `choice` is the first prompt left for the player; none means the level-up is done. Sent again while open, `level_up` returns the open choice unchanged. The open level-up stays with its character: a `load_scene` whose `party` leaves that character behind is `rejected`, `level_up_open`, and changes nothing; `travel` and `rest_night` wait for it the same way.
- **The choice** (`LevelUpChoice`) goes only to the levelling player, in the command result: `prompt_id` (`l1`, `l2`, ... per session), `level`, `label`, `picks`, `options` (each `id`, `name` and, for a spell, core's `summary`; a skill says its ability), sorted by id, and `recommended`: as many option ids as `picks`, from the pregen file's `recommended` for that level and prompt (a skill prompt is `choice.skills`), else the first options. While it is open, `awaiting` is `{kind: level_up, prompt_id, actor}` for everyone, with no options.
- **Answering.** `answer_level_up{actor, prompt_id, picks}`; no `picks` takes `recommended`. A `prompt_id` that is not the open choice's is `stale_prompt`; no level-up open for the actor is `rejected`, `no_level_up`; picks that are not options, repeat one or miss the count are `rejected`, `bad_picks`, with the options in the message. The result carries the next choice, or none once done; then `leveled_up{actor, level}` (public) is logged.
- **Answering.** In a fight, `answer_level_up` is `wrong_mode`; the choice waits until the fight is over.
- **Not served yet.** A prompt for ability scores or a spell swap (from level 4) is `not_implemented`, and closes the level-up where it stopped, as an `internal` error does, so it never blocks another character's.

### 4.15 The roster between game sessions

A roster carries the party from one game session to the next (API-45). The engine writes it; the game loop keeps it as a file (`rosters/<name>.json`, outside the repository) and records its sha256 going in and coming out.

- **Saving.** `save_roster` (as `dm`; another viewer is `not_visible`) returns `{format: 1, characters, world?}`. `characters` are the campaign's party in its order, else every party character of the scene, each built from a pregen (a placed stat block is not saved): `handle`, `pregen`, `level`, `xp`, the level-up `choices` made in play (`level`, `prompt_id`, `picks`), `equipment` (equipped items with their slot, then carried ones, as in a pregen file; an item in a slot a pregen file can't name is saved as carried), `purse`, and `exhaustion`, `malnutrition` and `days_without_food`. Hit Points are not saved. A character whose level-up is still open is saved at the level before it, without that level's picks, so the next session offers it again. A party member who is not in the scene keeps the entry the roster was loaded with. `world` is present once a campaign runs: the map id and the world state (clock, where the caravan is, wagons and cargo, places discovered, the deck with a card on the table), opaque to clients. `save_roster` reads only: it changes nothing and can run at any time, mid-fight included.
- **Loading.** `new_session{roster}` checks the roster first and refuses it with `bad_roster`, leaving the running session as it was, when its `format` is not 1, a handle repeats, or a `pregen` has no file. A scene pregen creature whose handle is in the roster is then rebuilt as saved: its pregen at the pregen's level, each level since through core's level-up with the saved `choices` (prompts with one answer answer themselves, as in `level_up`), its XP, gear and coins, then one Long Rest by the rule: full Hit Points and uses, the saved Exhaustion and hunger put back through core and one level removed unless malnutrition holds it. A character the roster cannot rebuild (a missing answer, a pick that is not an option) refuses the `load_scene` with `bad_roster`, and nothing changes. A saved escort contract under way belongs to its Blades: `start_campaign` with another party is `bad_roster`. `start_campaign` on the roster's map takes up its world where it was left: the caravan's place, the clock, the card on the table, an unfinished escort contract with what it has paid (no second advance). When the caravan stands somewhere other than the scene loaded (a place with another scene, or out on the road), `start_campaign` loads that scene with the party and logs its `scene_loaded` before it answers. On another map, or when the saved escort contract is done, the campaign starts fresh from `campaign.json`: the characters carry over, the world and the contract start again, and the advance is paid.
- **Not saved yet:** Hit Points, a character's death and rumours. Place NPCs travel in the world state (§4.16).

### 4.16 Place NPCs

Townsfolk who live in one place and are there, as the party left them, when it comes back (API-48). A world's optional `npcs.json` names each once: `id` (also the creature's handle), `name`, `monster` (the stat block), `place`, `anchor` (in the scene that place loads), `attitude` (`friendly`, `indifferent`, the default, or `hostile`), `carries` (coins and items) and DM `notes`. `start_campaign` refuses a file whose NPC is in an unknown place, stands at an anchor the place's scene lacks, takes a handle that scene or the party already uses (or `world`), names an unknown stat block, has a name of more than one line, or carries what a scene creature can't (`bad_scene`).

- **Arrival.** When the party is in an NPC's place and the scene loaded is that place's (after `start_campaign` in the start scene, after a `travel` leg that arrives, or a `load_scene` of it while the caravan is there), each living NPC of the place is placed at their anchor, scripted, on the `hostile` side if hostile and `neutral` otherwise, with what they carry and the Hit Points the party left them with, through core. Each placing logs `creature_placed` (DM only), and the NPC is met from then on. An NPC with no free spot near their anchor is not there this visit; the scene has loaded, so nothing is refused.
- **Leaving.** Before any other scene loads, each NPC placed in the scene is written back from core: Hit Points (at least 1 when they come back), dead or alive, coin and items. Between visits nothing happens to them. The dead are not placed again.
- **Coin.** While present, an NPC's coin is a creature holder like any other (`ledger` entries name their handle), so the trial balance holds across visits: they come back with what they left with.
- **In the roster.** The world state saves each NPC as they are now, those in the scene included.

### 4.17 The escort contract

The party is hired to see the caravan to a place (API-47). The terms sit in `campaign.json`'s `world.escort`: `destination` (a place), `wage_cp` (per Blade per day, by default 200, the SRD 5.2.1 skilled hireling's 2 GP), `advance_days` and `purse_cp` (the merchant's purse). The caravan's owner must be an NPC (`npc:<id>`), who pays; a player merchant pays by hand with `give`. The Hired Blades are the campaign's party. There is no shared pot.

- **The advance.** `start_campaign` pays each Blade `advance_days` days of wages.
- **Days served.** Each `rest_night` adds a day for each Blade who is not dead, and arriving at the destination adds the day of arrival.
- **Settling.** When a `travel` leg arrives at the destination, after `scene_loaded`, each Blade, a fallen one included, is paid the days served less what was paid, and `escort_settled{destination}` follows (public). It settles once.
- **Each payment** is one `ledger` entry, reason `wage`, from the merchant's holder (`npc:<id>`) to the Blade (public), each logged before the next. The coin goes into the Blade's purse in core and out of the merchant's purse in the world. When the purse runs short, a Blade gets what is left, and the rest stays owed. A wage larger than one ledger entry can carry is paid in several entries.
- **Trial balance.** The journal's account for the merchant opens with what the purse held before the first payment, and after each batch it must equal the world's purse, as the creatures' accounts must equal core.
- **In the roster.** The world state keeps the days, the pay and the purse. A campaign taken up from a roster pays no second advance.

### 4.18 Time in a place

`pass_time{span}` lets time pass out of combat at the DM's call (API-50, decision 0061): a meal at the alehouse, a talk with the reeve, a search of a hut. Travel and nights move the clock themselves (§4.11, §4.12); nothing else did, so a whole stop in a village took no time.

- **Who and when.** Only `dm` sends it; a creature viewer gets `not_visible`. Before `start_campaign` it answers `no_campaign`, in a fight `wrong_mode`, while a road card waits `rejected`, `card_pending`, and while a level-up is open `rejected`, `level_up_open`.
- **How long.** `short_while` is 30 minutes, `hour` 60, and `watch` runs until the next watch begins (0:00, 4:00, 8:00, noon, 16:00, 20:00). A span that would reach midnight is `rejected`, `night_falls`: the day ends with `rest_night`.
- **What follows.** As a card's lost time (§4.13): the world clock and core's time move on, effects that run out end and are logged, and the day's travel shrinks by as much, an 8-hour travel day being the whole day's distance. Then `time_passed{minutes, clock}` (public).
- The result is the `minutes` (also in the event) and the state after it.

## 5. Visibility (projection per `viewer`)

| Data | `dm` | Owner (viewer = that creature) | Other player viewer |
|---|---|---|---|
| HP / max HP / temp HP | yes | yes | no; `health: "unhurt" \| "bloodied" \| "down"` instead |
| AC, saves, stat block, resources, slots; spellcasting (spell save DC, spell attack bonus), spells and the sheet's `concentration` | yes | yes | no |
| Conditions | yes | yes | only visible ones (all SRD conditions except `invisible` while unseen) |
| Lasting effects on a creature (state and sheet `effects`, the events `effect_started` and `effect_ended`) | yes | yes | no; the table hears the spell or action, not its effect |
| Position, distance (ft) | yes | yes | yes, for creatures the viewer perceives (all of them until vision exists) |
| The option a creature takes (`action`), or walks to take and doesn't get to (`action_dropped`) | yes | yes | yes (the table sees the swing, the cast or the walk) |
| Roll: dice, total, outcome | yes (`full` view) | yes (`player` view) | yes (`player` view) |
| Roll: modifiers, `against` (AC/DC), `dc_source`, `advantage_sources` | yes | no; own modifiers and AC are on the sheet | no |
| Damage or healing amount | yes | yes | yes (it is said at the table) |
| Which spell a creature concentrates on, and when it starts and ends (`concentration_started`, `concentration_ended`) | yes | yes | yes (a caster visibly maintains a spell) |
| An item used up, and on whom (`item_used`) | yes | yes | yes (drinking or handing over a potion is seen) |
| `hit_points` events (HP after a change) | yes | own creature only | no |
| Scenario data: the scene file's check DCs, hazards, encounters, surrender conditions, flags, spawns; in state, `flags`, `checks`, `encounters` (with `surrender_available` and `surrendering`) and `spawns`; the events `check_resolved`, `flag_set`, `hazard_triggered` and `spawned` | yes | no | no |
| Anchors: id, name, position | yes | yes, with `distance_ft` from the viewer | yes, with `distance_ft` from the viewer |
| `known_ids` in an error hint (the scene's anchor ids after `unknown_anchor`, its check ids after `unknown_check`, its encounter ids after `unknown_encounter`) | yes | no | no |
| `unavailable` reasons in `legal_actions` | yes | yes | no (`legal_actions` for another actor is `not_visible`) |
| `budget` in `legal_actions` (actions, Bonus Action, Reaction and movement left) | yes | yes | no (`legal_actions` for another actor is `not_visible`) |
| `summary` on an option (the rule's own short text, the same for everyone) | yes | yes | no (`legal_actions` for another actor is `not_visible`) |
| Purse (sheet `purse`: coins by kind and `total_cp`) | yes | yes | no |
| What a scene creature `carries` (scene file, or `place_creature`'s) | yes | no | no |
| `creature_placed` (the stat block id) | yes | no | no (the creature itself is in state) |
| `ledger` entries for `trade` and `loot`, and `theft_noticed` | yes | yes | yes (handing over or picking up is seen) |
| A `steal`'s Sleight of Hand roll and its `theft` ledger entry | yes | the thief only | no (the victim doesn't know) |
| `world.clock`, `world.at`, `world.today`, `world.caravan` (wagons, limits, loads, cargo) | yes | yes | yes |
| `world.places`: undiscovered places, and each place's `discovered` and `scene` | yes | no; discovered places only, without `scene` | no; discovered places only |
| `world.roads`: a road to an undiscovered place, and every road's deck `zone` | yes | no; the road's known end in `unexplored`, never where it leads; no `zone` | no; as the owner |
| `world.route` (where an NPC owner travels) | yes | no | no |
| `reach` on each road out of here, and `world.trip` (the route's legs over discovered places only, §4.11) | no (the DM reads `route` and the roads) | yes | yes |
| `world.drives` (whether this player may call `travel`) | n/a | yes | yes, for themselves |
| `world.card.id`, `world.card.zone`, the deck, the draw roll | yes | no | no |
| `world.card` text, choices, `said`, `waiting_for` | yes | yes | yes |
| `traveled`, `place_discovered`, `night`, `card_drawn`, `card_advice`, `card_resolved`, `cargo_changed`, `time_lost`, `time_passed` | yes | yes | yes |
| `world.npcs`: every place NPC with `monster`, `attitude`, `met`, `hp` and `notes` | yes | no; met NPCs only, with `id`, `name`, `place` and `alive` | no; as the owner |
| `world.escort`: the terms, each Blade's days served and pay, `done`; `escort_settled` | yes | yes | yes |
| `world.escort.purse_cp` (the merchant's purse) | yes | no | no |
| Sheet `xp` (points, next level, `can_level_up`) and `xp_awarded` | yes | yes | no |
| A level-up's choice (`level_up`, `answer_level_up` results) | n/a | yes | no; `awaiting` says only whose level-up is open |
| `leveled_up` | yes | yes | yes (the table hears that a character grew) |
| The roster (`save_roster`) | yes | no | no |
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
| `fled` | `handles[]` (public): the creatures that ran and left the scene, logged before `combat_over{reason: fled}` |
| `round` / `turn_start` / `turn_end` | `number` / `actor` |
| `action` | `actor`, `option_id`, `name`, `targets[]` |
| `action_dropped` | `actor`, `option_id`, `name`, `targets[]` (public): the option a `submit` walked to take and didn't (§4.4) |
| `roll` | `roll: RollView` (`view: "full"` or `"player"`) |
| `damage_taken` | `target`, `amount`, `damage_type`, `source_roll?` |
| `healed` | `target`, `amount`, `source_roll?` |
| `hit_points` | `target`, `hp`, `hp_max`, `temp_hp` (DM or owner visibility only) |
| `condition_added` / `condition_removed` | `target`, `condition`, `source` |
| `effect_started` / `effect_ended` | `target`, `effect`, `name`, and `source` on start (DM and the target's owner only) |
| `concentration_started` | `actor`, `spell` (public: a caster visibly maintains a spell) |
| `concentration_ended` | `actor`, `spell`, `reason: replaced\|failed_save\|incapacitated\|expired\|ended` (public) |
| `item_used` | `actor`, `item`, `target` (public; `target` is the actor when it drinks the item) |
| `life_state` | `target`, `state: conscious\|unconscious\|stable\|dead` |
| `moved` | `actor`, `from`, `to` (ft), `anchor?` |
| `check_resolved` | `check_id?`, `actor`, `roll_id`, `success` (DM only) |
| `flag_set` | `flag` (DM only) |
| `hazard_triggered` | `hazard_id`, `actor` (DM only) |
| `rest` | `participants`, `rest: short\|long` |
| `ledger` | `from`, `to` (holder strings: a handle, `world`, `wagon:<n>`, `market:<place>`, `npc:<id>`), `what` (`coins{copper}` or `item{item, quantity}`), `reason: trade\|wage\|loot\|toll\|inn\|theft\|reward`, `roll_id?` (public, except `theft`: the thief and the DM) |
| `theft_noticed` | `thief`, `target` (public) |

- `concentration_started` follows the cast that applied the spell's effect, once per cast however many targets it has. `concentration_ended` comes when the engine ends it: a failed Concentration save after damage (`failed_save`; the save is logged first, a Constitution save with `dc_source: "rule"` and DC 10 or half the damage), dropping to 0 Hit Points (`incapacitated`), or casting another Concentration spell (`replaced`, logged before the new cast's `action` and its `concentration_started`). When the spell's duration runs out (`expired`), its effects end and so does the Concentration: in a fight that is at the start of the caster's turn, and the entry comes right after that `turn_start`; between scenes it comes right before `scene_loaded` (§2).
- `condition_added`, `condition_removed`, `effect_started` and `effect_ended` are found by comparing each creature with what the log last showed, since core logs none of them. Each comes right after the entry that explains it: Unconscious after the creature's `life_state`; an effect that runs out at a turn boundary after that `turn_start` or `turn_end`; a spell's effect after its caster's `concentration_ended` for that spell. Anything else, such as an effect a spell or Help applies, or a Help's Advantage used up by a roll, comes at the end of the command's entries. Ends come before starts, so a spell cast again shows its old effect ending first. `condition_*` is public with `source` absent for now; `effect_*` goes to the DM and the target's owner.
| `spawned` | `spawn_id`, `handles[]` (DM only) |
| `creature_placed` | `handle`, `monster` (DM only): a `place_creature` (§4.10) |
| `traveled` | `leg: {actor, road, pace, miles, minutes, arrived, at}` (public): one `travel` leg (§4.11) |
| `place_discovered` | `place`, `name` (public): the party found a place it did not know (§4.11) |
| `night` | `night: {actor, lodging, minutes, rested, not_rested, hungry}` (public): one `rest_night` (§4.12) |
| `card_drawn` | `target`, `card_text`, `choices` (public): a road card was drawn (§4.13) |
| `card_advice` | `actor`, `choice` (public): a Blade's advice or vote |
| `card_resolved` | `choice`, `decided: owner\|majority\|tie\|owner_insists\|default` (public) |
| `cargo_changed` | `good`, `change` (public): a card added or took goods from the caravan |
| `xp_awarded` | `actor`, `xp`, `total`, `can_level_up` (owner and DM): a won fight's XP share |
| `leveled_up` | `actor`, `level` (public) |
| `time_lost` | `minutes` (public): a card cost the party time |
| `time_passed` | `minutes`, `clock` (public): one `pass_time` (§4.18) |
| `escort_settled` | `destination` (public): the caravan reached the escort's destination and the Blades were paid (§4.17) |

`RollView` with `view: "full"`, unchanged from v0 except for the id format and the added fields (the `player` view drops `modifiers`, `against`, `dc_source` and `advantage_sources`):
```json
{ "view": "full", "id": "r412", "kind": "attack|saving_throw|ability_check|skill_check|initiative|damage|healing|death_save",
  "label": "Longsword attack vs goblin_1", "roller": "bren", "target": "goblin_1",
  "dice": [{"source":"d20","dice":"1d20","results":[14,6],"kept":14}],
  "modifiers": [{"source":"Strength","value":3},{"source":"Proficiency","value":2}],
  "total": 19, "against": {"kind":"AC","value":15}, "outcome": "hit",
  "advantage": "advantage", "dc_source": "scenario|ladder|stat_block|rule|spell_save_dc|passive",
  "advantage_sources": ["Effect: some_effect (advantage)"] }
```
In the `full` view, `against` is always present for `attack` (AC), `saving_throw`, `death_save`, `ability_check` and `skill_check` (DC), and `dc_source` is present for every DC: `rule` for the fixed DC 10 of a death save and of Help's stabilize, and for a Concentration save; `spell_save_dc` for a save against a caster's spell save DC (Sacred Flame, Divine Spark's damage); `stat_block` for a monster's own DC; `passive` for a passive score used as the DC (a `steal`'s target's passive Perception, §4.9). Only `initiative`, `damage` and `healing` rolls have no `against`.

Audit rule (demo pass criterion): every `[rN]` cited in a transcript exists with the same `total`, and with the same `against` when the transcript states it. Every roll in the session log is cited. A plain transcript (the Milestone 1 to 5 drivers) is audited against the `dm` projection. A game transcript is audited per channel against the projection for whoever hears it, so a line a player saw matches the `player` roll view and gains nothing hidden (decision 0033, `nat20-audit`).

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
| `unknown_stat_block` | `place_creature` names a stat block the registry doesn't have | true |
| `no_campaign` | A world command (`travel`, `rest_night`, `choose_card`) before `start_campaign` | false |
| `not_your_turn` | `actor` isn't `awaiting.actor` (also returned by `legal_actions`, not an empty list) | true, after waiting |
| `stale_prompt` | `prompt_id` doesn't match | true, with the new `prompt_id` |
| `not_visible` | The viewer asked for something it may not see | false |
| `wrong_mode` | A combat command in explore mode or the reverse | false |
| `rejected` | The engine refused a legal-shaped decision. `reason` is one of: `out_of_range`, `no_valid_target`, `invalid_target`, `insufficient_resource`, `action_already_used`, `condition_prevents`, `not_known`, `needs_target`, `needs_point`, `needs_variant`, `no_path`, `already_attempted`, `condition_not_met`, `automatic`, `already_spawned`, `not_proficient`, `no_item_left`, `area_empty`, `not_carried`, `insufficient_funds`, `not_fallen`, `nothing_carried`, `no_room`, `not_driver`, `no_road`, `pace_too_fast`, `day_over`, `overloaded`, `no_inn`, `card_pending`, `no_card`, `no_say`, `already_spoke`, `waiting_for_advice`, `unknown_choice`, `not_enough_xp`, `level_up_open`, `no_level_up`, `bad_picks`, `night_falls` | true |
| `surrender_not_available` | `end_combat{surrender}` while the running encounter's surrender condition does not hold, or it declares none; nothing changed | false |
| `not_implemented` | The command is in the contract but this engine build does not serve it yet | false |
| `bad_scene` | The scene file, or a pregen or stat block it names, is missing or invalid; nothing changed | false |
| `bad_roster` | `new_session`'s roster can't be read (another format, a repeated handle, a pregen with no file), or a scene's roster character can't be rebuilt; nothing changed | false |
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
