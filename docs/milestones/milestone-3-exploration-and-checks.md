# Milestone 3: exploration and checks

- **Status:** Proposed (spec only; nothing here is built yet)
- **Date:** 2026-10-17
- **Owner:** Stas
- **Depends on:** Milestone 2 done (seeded dice API-11 and the core pin bump), because every fixture below replays with a seed.
- **Exit criterion** (`TASKS.md` § Milestones): a non-combat scene loads; checks and saves resolve against scenario DCs; short rest; combat starts and ends on triggers; the party carries over between scenes.

The surface is mostly fixed already: contract v1 has `move`, `request_check`, `group_check`, `short_rest`, `start_combat{surprised}`, `end_combat`, `spawn`, `get_sheet` and `load_scene{party}`, and the server answers each with `not_implemented`. This milestone serves them, changes the few that let the DM agent rule instead of the engine, and moves the scene file into the contract so the DM agent and the engine read the same scenario data.

## 1. Goal and non-goals

**Goal.** Everything *The Silent Mill* does outside a fight, and the joins between scenes and fights, resolves in the engine and replays from a seed:
- explore-mode scenes;
- skill checks and saving throws against scenario DCs or the SRD ladder;
- hazards that roll damage;
- Hit Point Dice on a short rest;
- movement to named anchors;
- surprise derived from an earlier check;
- surrender the DM calls within a scene condition the engine enforces, and reinforcements as scene triggers;
- one party, with its HP, resources and flags, carried from scene to scene.

**Non-goals** (each has its own milestone or row):
- The real *Silent Mill* scenario file, maps and pregens: MAP-2..4 and CHR-4 (Milestones 4 and 6). This milestone uses a small test scenario built from what exists today: Bren (`fighter_l2`) and the Goblin Warrior.
- Healing, the Cleric and Potions (Milestone 4); monster mechanics and the flee policy (MON-*, Milestone 5); agents, game loop and UI (Milestone 6).
- Reactions tested end to end (ENG-1, Milestone 4). `move` in combat reports who it provoked, but the Opportunity Attack fixture comes with ENG-1.
- Plain ability checks with no skill (core's `D20CheckKind` has only skills, saves and attacks), Hide and Stealth, vision, travel pace, the Influence action, long rests.
- Conditions beyond what core models today (API-20 stays in Milestone 4). This milestone maps only `unconscious`, from core's life state.

## 2. What core already does, checked against the pinned rev

This decides what is ours and what is an upstream item. Findings at fork `main` 9aaca2f:

| Need | Core today | Consequence |
|---|---|---|
| Skill check or save against a DC | `systems::d20::check(engine, entity, &D20CheckDC::{Skill, SavingThrow})`, with advantage sources and modifiers | **Ours**: the adapter calls it. No core change. |
| Plain ability check (no skill) | Not modelled (`D20CheckKind` = save, skill, attack) | Out of scope; ladder checks require a skill (new row API-24, P2) |
| Damage outside combat | Damage and HP systems work outside encounters | **Ours**: hazards roll and apply damage through core |
| Movement | `systems::movement::path` and `move_entity` on the navmesh | **Ours**: anchors are scene data mapped to points (design §6: anchor formats never go upstream) |
| Short rest | `start_rest`/`finish_rest` recharge short-rest resources, then heal **half max HP** (`systems/time.rs:203`, "for now") | **Upstream U4 (ENG-4)**: core tracks no Hit Point Dice pool at all, so this is a pool plus spending, size M, not S. The fork carries it until Milestone 8. |
| Surprise | `Encounter::new` rolls initiative internally; there is no per-creature input | **Upstream U5 (new)**: Disadvantage on initiative for surprised creatures. Design question, so an upstream issue first; the fork carries it. |
| Help (assist a check, stabilise) | No Help action | **Upstream U6 (new)**: a Help action in core. The fork carries it. |
| Death saves, stable | `LifeState::{Unconscious(DeathSavingThrows), Stable}`, rolled on turn start in an encounter | **Ours**: expose them; stabilising goes through U6 |
| Party across scenes | One `EngineState` holds the world; `geometry` is a public field | **Ours**: keep one engine per session and swap `geometry` per scene. Today the server builds a new `EngineState` on every `load_scene`, which is why carry-over is `not_implemented`. |
| Joining a running fight | `Encounter::remove_participant` exists; there is no way to add one | **Upstream U7 (new)**: add a participant mid-encounter and roll its initiative. A spawn before `start_combat` needs no core change; the round-3 rats do. |
| Conditions | Only `incapacitated`, `paralyzed`, `poisoned` exist as effects; no Prone | `unconscious` only, from the life state (rest stays in API-20) |

**Result:** of this milestone's rows, only ENG-4, API-12, CHK-4 and the mid-fight half of API-8 need core. TASKS.md lists API-2..5, API-7, API-9, CHK-1, CHK-2 and MAP-1 as `Up` or `Up?` with Gate Y; the checks above show they are adapter and scene-data work. §8 moves them to `Ours`, Gate N, which takes 9 rows off the upstream gate.

## 3. Flows in *The Silent Mill*

The engine owns every number and every state change. The DM agent's job is to pick a scenario check (or a ladder check when none fits), choose which actor makes it, and narrate the result it gets back.

### Scene 1: hook at the village green (social)
1. DM: `load_scene{scene_id:"s1_green"}`. The party comes from the scene file; mode is `explore`.
2. Human: "Does the reeve seem to be hiding something?" The DM maps this to scenario check `reeve_insight` (Insight DC from the scene) and calls `request_check{actor:"bren", check:{kind:"scenario", check_id:"reeve_insight"}}`.
3. Engine: rolls; logs `roll` (DM sees `full` with `against` and `dc_source:"scenario"`, players see `player`), then `check_resolved` (DM only) and `flag_set` (DM only) if the scene declares a flag on success. Result `{roll_id, total, success}`.
4. DM narrates what the scene file says success unlocks. A second Insight attempt on the same check by the same actor is refused (`rejected`, `already_attempted`, decision D3).

### Scene 2: road to the mill (exploration)
1. DM: `load_scene{scene_id:"s2_road", party:["bren","lia","oren"]}`. The party keeps HP, slots, resources and session flags.
2. Survival DC 12 to follow the tracks (`find_tracks`). The scene declares `on_failure: [hazard snare]`, so on a failure the engine immediately rolls the snare's DEX save (DC 12) for the same actor and, on a failed save, 1d6 damage. Every roll has an id; the DM narrates from the events.
3. Perception DC 13 to spot the lookouts (`spot_lookouts`), `on_success: [flag party_ambushes]`.
4. DM: `move{actor, to:{kind:"anchor", anchor:"mill_gate"}}` per creature. In explore mode a move costs no movement but needs a path.

### Scene 3: mill yard (Fight 1)
1. DM: `load_scene{scene_id:"s3_yard", party:[...]}`, then `start_combat{encounter_id:"yard_fight"}`.
2. Engine: the encounter declares `surprise: {when_flag:"party_ambushes", surprised:"hostile"}`, so every hostile rolls initiative with Disadvantage. The DM never names who is surprised (decision D4).
3. The fight runs as in Milestone 1. The encounter declares a surrender condition, for example `surrender: {creatures:[goblin handles], any_of:[{hp_fraction_at_most: 0.25}, {standing_at_most: 1}]}`. The engine evaluates it after every turn and shows the result in the DM view only, as `surrender_available` on the running encounter. The DM never works out HP fractions itself.
4. While the condition holds, the DM may end the fight with `end_combat{reason:"surrender"}`, balancing story and engagement as its instructions say. The engine moves the encounter's surrendering creatures that are still conscious to `neutral`, logs `surrendered` and `combat_over{reason:"surrender"}`, and returns to explore mode. The surrendered goblins stay in the scene, so Scene 4 can carry one in and target it with checks. Called while the condition does not hold, `end_combat` answers `surrender_not_available` (not retryable) and changes nothing. The engine never surrenders on its own; it ends combat by itself only when a side is down (decision D5).

### Scene 4: the captured goblin (social), short rest
1. DM: `load_scene{scene_id:"s4_prisoner", party:["bren","lia","oren","goblin_2"]}`. The carried prisoner keeps its HP; carried creatures are not limited to PCs.
2. Intimidation or Persuasion DC 13 (`interrogate`), `on_failure: [flag boss_warned]`.
3. DM: `short_rest{participants:[...], hit_dice:[{handle:"bren", count:1}]}`. The engine refuses a participant at 0 HP (`rejected`, `condition_prevents`), rolls each Hit Point Die plus the Constitution modifier (minimum 1), recharges short-rest resources (Second Wind and Action Surge), and logs `roll`, `healed`, `hit_points` and `rest`.

### Scene 5: mill cellar (Fight 2), triggers only
- Scene 5's content is Milestone 5 (Goblin Boss, Wolf, Giant Rat), but its two triggers are this milestone's work, tested with goblins:
  - spawn `extra_warrior`, `when: {flag:"boss_warned"}`, placed at combat start;
  - spawn `rats`, `when: {round: 3, unless:"any_party_bloodied"}`.
- The engine evaluates both. The `spawn` command stays for spawns declared `when: "dm"`.

### Between fights, death saves
- After a fight, a PC at 0 HP stays `unconscious` and makes no death saves (no turns outside combat).
- Another PC can stabilise them with Help (Medicine DC 10, SRD 5.2.1 "Stabilizing a Character"), once U6 lands.
- In combat, death saves are core's and are exposed as `death_save` rolls (API-14).

## 4. Contract changes (Rule 1)

Each change lands in the PR that serves it (§7), with its fixture and a CHANGELOG line, under the next `1.0.0-dev.N`. Breaking changes are allowed before v1 and are marked **breaking**.

### 4.1 The scene file becomes a contract type
Today `SceneFile` is a private serde struct in `adapter/game.rs`. The DM agent needs the same scenario data (check ids, encounters, anchors) that the engine reads, and Rule 1 says shared formats are defined once.
- New module `scene.rs` in `nat20-api-contract`, exported as a second schema `generated/nat20-scene.schema.json` and as TS types.
- `npm run gen` and `check:contract` cover it like the wire schema. The schema hash in `hello` covers both files.
- `load_scene` keeps taking a `scene_id`; the inline `scene` variant mentioned in protocol §4 stays unserved.

```text
SceneFile { id, description, map?, anchors[], creatures[], party_start[], checks[], hazards[], encounters[], spawns[] }
Anchor        { id, name, position_ft }
SceneCreature { handle, pregen | monster, side, control, at: anchor | position_ft }
ScenarioCheck { id, test: {kind:"skill", skill} | {kind:"save", ability}, dc, attempts: "once_per_actor" | "unlimited",
                on_success[], on_failure[] }
Hazard        { id, save: {ability, dc}, on_failure[], on_success[] }
Consequence   = {kind:"flag", flag} | {kind:"hazard", hazard_id} | {kind:"damage", dice, damage_type}
Encounter     { id, participants[], surprise?: {when_flag, surprised: side}, surrender?: {creatures[], any_of[]: {hp_fraction_at_most} | {standing_at_most} | {leader_down: handle}},
                end_reasons[] }
Spawn         { id, creatures[], when: "dm" | {flag} | {round, unless?: "any_party_bloodied"} }
```
- `party_start` lists the anchors where carried creatures are placed, in order.
- A creature defined in the scene and also carried in is a `bad_scene` error.
- A surrender condition is DM-only data (Rule 3). No player view carries it, or anything derived from it.
- Consequences are deliberately few. Anything that only changes the story ("the reeve mentions the debt") stays in the DM's scenario notes, not in the engine.

### 4.2 Commands

| Command | Change | Visibility of the result |
|---|---|---|
| `load_scene` | Served with `party`: the handles carried from the previous scene (any creature, not only PCs). Creatures not carried are removed. Session flags persist. | `State` projected as today |
| `get_state` | `State::Dm` gains `anchors`, `flags`, `checks` (id, test, DC, attempts left per actor), `encounters` (with `surrender_available` on the running one) and `spawns`. `State::Player` gains `anchors` only, with `distance_ft` from the viewer. Additive. | Anchors: everyone. Flags, checks, DCs, encounters, spawns: DM only, as fields of the DM type alone (Rule 3) |
| `get_sheet` | Served (API-19), including `hit_dice` once U4 lands | Owner and DM, else `not_visible` |
| `move` | Served. Explore: no movement cost, needs a path. Combat: needs `prompt_id`, spends movement, returns `provoked`. | Result to the caller; `moved` event public |
| `request_check` | Served for `scenario` (skill or save) and `ladder` (skill required; a missing skill answers `not_implemented`). **Breaking:** `advantage` is removed. Advantage now comes only from what the engine knows: a pending Help, conditions, or the scene check itself (decision D2). | Result `{roll_id, total, success}`; `check_resolved` DM only |
| `group_check` | **Breaking: removed** (decision D1). SRD 5.2.1 has no group check; the DM picks the actor, as the 2024 rules do. | n/a |
| `help` | **New**, explore mode: `{actor, kind:"assist_check", ally, skill}` or `{actor, kind:"stabilize", target}`. In combat, Help is an action option from `legal_actions` once U6 lands. | `action` event public; the stabilise check's roll as any roll |
| `short_rest` | Served once U4 lands. `hit_dice` stays a count per creature, declared up front: a simplification of "decide after each roll" that the agent can repeat with another `short_rest`. Only allowed in explore mode. | `healed` public; `hit_points` owner and DM |
| `start_combat` | **Breaking:** `{encounter_id}` replaces `{participants, surprised}`. Participants, surprise, surrender and end reasons come from the scene's encounter (decision D4). | `State` |
| `end_combat` | Served. `surrender` is accepted only while the encounter's surrender condition holds, else error `surrender_not_available` (D5). `scenario` is accepted only when the encounter declares it. `fled` answers `not_implemented` until MON-6. | `State` |
| `spawn` | Served for spawns declared `when:"dm"`; automatic spawns are refused with `rejected`. | `State` |

### 4.3 Events, errors, roll view
- New event kinds, all additive:
  - `flag_set{flag}`, DM only;
  - `surrendered{handles}`, public;
  - `hazard_triggered{hazard_id, actor}`, DM only (players see the save roll and the damage).
- Visibility changes in protocol §5 and §6:
  - `check_resolved` is DM only, because `check_id` is scenario data;
  - `spawned` is DM only, because players see the new creatures in their state;
  - `rest` and `moved` are public.
- `RollView::Full` gains `advantage_sources: [string]`, the logged reason behind any Advantage or Disadvantage, so the audit can check it. It is additive and stays out of `RollView::Player`.
- New `RejectReason`s, additive:
  - `no_path`: no route to the anchor or point;
  - `already_attempted`: a once-per-actor scenario check (D3);
  - `condition_not_met`: `end_combat{scenario}` for an encounter that does not declare it;
  - `automatic`: a trigger-only spawn.
- `ErrorHint` gains `known_ids: [string]` for `unknown_check`, `unknown_anchor`, `unknown_spawn` and `unknown_encounter`, so a model recovers within 2 retries (acceptance §6.5). It is filled only for the DM viewer, because ids are scenario data.
- New error codes, additive: `unknown_encounter`; `surrender_not_available` (not retryable), for `end_combat{surrender}` while the encounter's condition does not hold.

### 4.4 Protocol text
`contract/protocol.md` changes in the same PRs:
- §2: one engine per session, carry-over rules, session flags.
- §4: the command table above.
- §5: rows for anchors, flags, checks, encounters and spawns.
- §6: the new event kinds.
- The status paragraph lists what is still `not_implemented`.
- The `request_check`/`advantage` deviation note is replaced.

## 5. What the engine resolves and what the DM agent decides

| Decision | Engine | DM agent |
|---|---|---|
| Whether a roll happens | Yes, always: it rolls on `request_check`, hazards, rests, combat | Chooses which scenario check applies, or a ladder DC (5 to 30) when none fits |
| Who rolls | | Names the actor |
| DC, success, damage, HP | Yes | Never; it reads the result |
| Advantage on a check | Yes, from Help, conditions or the scene check | No grants (D2) |
| Retrying a check | Enforces `attempts` | Picks another check or actor, or moves the story on |
| Surprise | Yes, from encounter rules and flags | No (D4) |
| Combat start | Rolls initiative | Calls `start_combat{encounter_id}` when the fiction says the fight starts |
| Combat end | Side down; evaluates the surrender condition every turn and refuses a surrender outside it | Decides whether and when to call `end_combat{surrender}` while `surrender_available` is true. A never-surrender DM persona just never calls it (Milestone 6) |
| Reinforcements | Flag and round triggers | `spawn` only for `when:"dm"` spawns |
| Short rest | Rolls Hit Point Dice, recharges, refuses at 0 HP | Offers it when the scene says, passes each character's dice count (the agents choose) |
| Scene order, narration, NPC voice | | Yes |

## 6. Fork and upstream items

Fork rules (Rule 6): one branch per item off upstream `main`, in the maintainer's style, merged into `demo`, with the pin bumped in its own nat20-table PR. Per Stas's 2026-10-17 call, only U1 and U2 go upstream now; these go at Milestone 8.

| Item | Change in core | Row | Upstream route |
|---|---|---|---|
| U4 Hit Point Dice | A Hit Point Dice pool per class die (current, max), spent on a short rest (roll + CON mod, minimum 1), all restored on a long rest (SRD 5.2.1). Replaces the half-HP heal. Test in `core/tests/`, PROGRESS row. | ENG-4 (resized to M) | PR at Milestone 8 |
| U5 Surprise | Disadvantage on initiative for named participants at encounter start (a `start_encounter` argument or an effect; his call) | API-12 | Issue first (design question), PR at Milestone 8. The issue goes out under Stas's account only when he says so (UPS-3). |
| U6 Help | Help action: assist an ability check (Advantage on the ally's next check with that skill before the helper's next turn; the helper needs the proficiency) and assist an attack; stabilise a creature at 0 HP (DC 10 Medicine) | CHK-4 | PR at Milestone 8 |
| U7 Join a fight | Add a participant to a running encounter, with an initiative roll | API-8 | PR at Milestone 8 |

**Removed from UPS-3:** the named-anchor issue. Anchors are scene data in our scene file, and design §6 lists anchor formats as never going upstream. UPS-3 keeps the monster format and the headless-API courtesy issue.

## 7. Ordered task breakdown

Each step is one PR (Rule 8, one concern), green on all CI jobs, with its contract change, fixture, CHANGELOG line and TASKS.md row update.

| # | PR | Rows | Needs | Size |
|---|---|---|---|---|
| 1 | Scene file into the contract crate, scene schema, TS types, the test scenario `m3_trail` (5 scenes, Bren and Goblin Warriors), protocol §2 text | API-21 (new) | Milestone 2 done | M |
| 2 | One engine per session: carry-over in `load_scene`, despawn the rest, `party_start`, geometry swap, session flags, `flag_set` | API-4, API-5 | 1 | M |
| 3 | Anchors and `move` (explore and combat), anchors in state, `no_path` | MAP-1, API-7 | 2 | M |
| 4 | `get_sheet` | API-19 (pulled into M3) | 2 | S |
| 5 | `request_check` (scenario and ladder), `attempts`, hazards with save and damage, `advantage_sources`, `known_ids`; drop `group_check` and `advantage` | API-2, CHK-1, CHK-2, CHK-3, CHK-5, API-13 | 2 | M |
| 6 | Fork U4 Hit Point Dice; then pin bump PR; then `short_rest` | ENG-4, API-3 | 4, fork | M + S + S |
| 7 | Encounters: `start_combat{encounter_id}`, surrender condition and `surrender_available`, `end_combat{surrender}` gated by it, `surrendered`, `end_combat{scenario}` | API-9, API-22 (new) | 2 | M |
| 8 | Fork U5 surprise, pin bump, surprise from encounter rules | API-12 | 7, fork | S + S + S |
| 9 | Spawn triggers: flag spawns at combat start, then fork U7 and a pin bump for round spawns; `spawn` for `when:"dm"` | API-8 | 7, fork | S + S + S |
| 10 | Fork U6 Help, pin bump, `help` command and the Help option in combat; death saves and stabilise exposed | CHK-4, API-14 | 5, fork | M + S + S |
| 11 | Exit fixture: `m3_trail` replayed end to end from a seed, plus the `nat20-duel` audit extended to explore-mode rolls | API-23 (new) | 1-10 | S |

Fork PRs (6, 8, 9, 10) can run in parallel with steps 2 to 5 once Milestone 2's pin bump is in. Realistic total: about 3 to 4 weeks of single-thread work. The core items carry the schedule risk, not the API.

## 8. TASKS.md changes made with this spec

- New rows:
  - API-21: scene file in the contract;
  - API-22: encounters in the scene file;
  - API-23: exit fixture;
  - API-24 (P2): plain ability checks, needs core.
- Dest and Gate corrected to `Ours`, `N`, per §2: API-2, API-3, API-4, API-5, API-7, API-9, CHK-1, CHK-2, MAP-1. ENG-4 resized to M. CHK-5 moves from `Fork` to `Ours`.
- CHK-3 group check: dropped (D1, Stas 2026-10-17).
- The Milestone 3 row lists the tasks above, with API-19 added.
- UPS-3 loses the anchors issue.

## 9. Test and fixture plan

| Fixture (`contract/fixtures/`) | Shows |
|---|---|
| `explore.jsonl` | Load an explore scene; anchors in DM and player state; `move` to an anchor; `no_path`; `unknown_anchor` with `known_ids` for the DM, none for a player |
| `checks.jsonl` | A scenario skill check (seeded success and failure), a ladder check, `already_attempted`, `unknown_check`, a missing ladder skill answering `not_implemented`; player projection of the roll has no `against` |
| `hazard.jsonl` | A failed Survival check triggers the snare save and 1d6 damage; `hit_points` is in the owner and DM views only |
| `carry.jsonl` | Two scenes: HP lost in the first is still lost in the second; a carried prisoner; flags persist; a carried handle also defined in the scene answers `bad_scene` |
| `rest.jsonl` | Short rest spends 1 Hit Point Die, recharges Second Wind, refuses a creature at 0 HP and a spend beyond the pool |
| `encounter.jsonl` | `start_combat{encounter_id}`; surprise from a flag (hostile initiative rolls show `advantage: disadvantage`); `end_combat{surrender}` refused with `surrender_not_available` before the condition holds and accepted after it; `combat_over{reason:"surrender"}`; the surrendered goblin stays in the scene |
| `spawn.jsonl` | A flag spawn at combat start; a round-3 spawn suppressed by `unless`; a manual spawn; an automatic spawn refused |
| `help.jsonl` | Assist check gives Advantage on the ally's next check (`advantage_sources` in the DM view); stabilise at 0 HP |
| `sheet.jsonl` | Owner and DM get the sheet; another player gets `not_visible` |
| `m3_trail.jsonl` | The exit run: 5 scenes from one seed, byte-identical replay |

Other tests:
- **Visibility scan** (CI job `visibility`): no player-projected line in any fixture contains `against`, `dc`, `dc_source`, `flags`, `checks`, `encounters`, `spawns`, `known_ids`, a `check_resolved`, `flag_set`, `hazard_triggered` or `spawned` event, or another creature's `hit_points`.
- **Fork tests** in `core/tests/`:
  - U4: dice spent, CON minimum, pool exhausted;
  - U5: surprised creatures roll with Disadvantage;
  - U6: Advantage consumed once, expires at the helper's next turn, stabilise on DC 10;
  - U7: a creature added in round 3 gets an initiative slot and acts that round or the next by its roll.
- **Server unit tests:** carry-over keeps every component the sheet shows (HP, slots, resources, Hit Point Dice, death saves); a scene swap removes every non-carried creature; `against` and `dc_source` are present on every check and save in the DM log.
- **Audit:** the `nat20-duel` audit runs on `m3_trail` and fails on any uncited or edited roll, including explore-mode checks, hazard saves, damage and Hit Point Dice rolls.

## 10. Acceptance, tied to the demo criteria

| Demo criterion (scope §6) | What this milestone proves |
|---|---|
| 1. Scene 1 to 6 unattended | Scene transitions, carry-over and the combat-to-explore joins run without manual steps in `m3_trail` |
| 2. Every roll in the engine log | Checks, saves, hazards, Hit Point Dice and initiative under surprise all carry `rN` ids; the audit passes on `m3_trail` |
| 3. No narration contradicts state | Carried HP and flags are engine state the narration-vs-state check (AGT-9) can read; `get_state` for the DM exposes flags and attempts |
| 4. Latency | Not measured here; `move` path probes are timed in the fixture run and logged to stderr as a baseline |
| 5. Recovery within 2 retries | Every new refusal has a sentence, `retryable`, and `known_ids` or `awaiting`; `checks.jsonl` and `explore.jsonl` show a wrong id followed by a correct one |
| 6. First-time player | `get_sheet` serves `/sheet` (API-19) |

**Done when:** the exit criterion holds on nat20-table `main` with CI green, `m3_trail.jsonl` replays byte-identically, every Milestone 3 row is `done` or explicitly moved, and the TASKS.md milestone row shows the date.

## 11. Decisions for Stas

D1, D2, D4 and D6 were decided by Stas on 2026-10-17 in the Milestone 3 spec thread. Stas delegated D5 to the coordinator, which decided it on 2026-10-17; the record is [decision 0021](../decisions/0021-surrender-dm-call-engine-gate.md). D3 is still open; the spec body describes once per actor until it is settled.

| # | Question | Status | Answer or options | Why |
|---|---|---|---|---|
| D1 | Group checks | **Decided: drop `group_check`** | | SRD 5.2.1 has no group check; Rule 7 allows 2014 data only to fill fields, not to add rules |
| D2 | DM-granted Advantage on checks | **Decided: remove it.** Advantage comes only from Help, conditions or the scene check | | Scope §7.3: LLM DMs drift toward granting success; free-text Advantage is a ruling by another name |
| D3 | Retrying a scenario check | Open | **Once per check per scene (one roll for the party; others contribute with Help)**; once per actor; no retries but the scene can mark a check retryable | Once per actor still gives four characters four tries at the same Persuasion, which is close to a free pass |
| D4 | Who decides surprise | **Decided: the engine**, from encounter rules and flags; `surprised` is dropped from `start_combat` | | Same reason as D2 |
| D5 | Goblin surrender | **Decided: the DM decides, within a scene surrender condition the engine enforces** ([0021](../decisions/0021-surrender-dm-call-engine-gate.md)) | | Keeps the call with the DM, as Stas wants, while stopping it from ending a fight the party is losing; the call replays as a request like any other |
| D6 | Pull `get_sheet` (API-19) from Milestone 6 into Milestone 3 | **Decided: yes** | | Short-rest and carry-over fixtures need the sheet to show Hit Point Dice and resources; it is size S |

Not asked, because already settled: U4 to U7 go upstream at Milestone 8 (Stas, 2026-10-17); anchors stay ours (design §6).

## Sources

- `TASKS.md` (project copy `/mnt/project-files/engine/TASKS.md`) § Milestones and rows API, CHK, ENG, MAP, UPS.
- `contract/protocol.md`, `crates/nat20-api-contract/src/{envelope,events,state,errors}.rs`, `crates/nat20-api-server/src/{session.rs,adapter/game.rs}`.
- Fork `StGerman/nat20` at 9aaca2f: `core/src/systems/{d20,time,movement}.rs`, `core/src/engine/{encounter,engine_state}.rs`, `core/src/components/{d20,skill}.rs`, `assets/registries/effects/conditions/`.
- `docs/scope/demo-run-scope.md` §3, §4.4, §6, §7.3; `docs/design/system-design.md` §6; decisions 0005, 0006, 0012.
- SRD 5.2.1 (CC-BY-4.0) via `/mnt/project-files/dnd-wiki/`: Short Rest, Hit Point Dice, Surprise, Help, Passive Perception, Typical Difficulty Classes, Stabilizing a Character, Death Saving Throws.
