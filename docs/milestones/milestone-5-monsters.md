# Milestone 5: monsters

- **Status:** Proposed (spec only; nothing here is built yet)
- **Date:** 2026-10-20
- **Owner:** Stas
- **Depends on:** Milestone 4 steps on `main` up to table #64's base (pregens, Shield, Cleric, concentration). Steps 1 to 5 below need nothing from Milestone 4 that isn't merged. Step 6 needs API-20 (Milestone 4 step 12, conditions in state); if that step is still open when step 6 starts, step 6 takes it over. Core is fork `demo` 8add3fa; table `main` is 43619e3, contract `1.0.0-dev.23`.
- **Exit criterion** (`TASKS.md` § Milestones): Goblin Warrior, Goblin Boss, Wolf and Giant Rat fight with their SRD 5.2.1 mechanics and fractional CR, except Redirect Attack (MON-7, P2); both fights of *The Silent Mill* replay from a seed.

Milestone 1 brought in one monster, the Goblin Warrior, as a table-side JSON stat block (`crates/nat20-api-server/data/monsters/goblin_warrior.json`) that the adapter turns into core's `Monster` bundle. It has a stopgap shield, no 1d4 rider, no Nimble Escape and CR 1 instead of 1/4. This milestone moves stat blocks into core as a registry kind. It adds the other three monsters, builds the mechanics the two fights use (Prone above all), and gives the table's scripted policy enough sense to use them. It also lets a fight end with the monsters running away.

## 1. Goal and non-goals

**Goal.** The four SRD 5.2.1 monsters of scope §3 load from core's registry with SRD numbers, and everything they do in Scenes 3 and 5 resolves in the engine and replays from a seed:
- Goblin Warrior and Goblin Boss: real Leather Armor, Chain Shirt and Shield; Scimitar and Shortbow with the extra 1d4 **only when the attack roll had Advantage**; Nimble Escape (Disengage as a Bonus Action); the Boss's two attacks;
- Wolf: Pack Tactics; a Bite hit knocks a Medium or smaller target Prone;
- Giant Rat: Pack Tactics, and nothing else;
- Prone, with its effects on attacks and movement, shown in state to every viewer;
- a scripted policy that sets up Pack Tactics, uses Nimble Escape and stands up from Prone, deterministically under a fixture seed;
- `end_combat{fled}`: the DM ends a fight because the monsters ran, and they leave the scene;
- fractional CR (1/8, 1/4) with SRD XP.

**Non-goals** (each has its own row or is out of scope):
- **Redirect Attack** (Goblin Boss reaction): deferred to P2 (D5, MON-7). The Boss ships without it, and the stat block's `_comment` says so.
- Darkvision, the Giant Rat's Climb Speed, Hide (Nimble Escape's other half), and Stealth or Perception beyond plain skill data. Vision, Hide and Stealth are out of scope (scope §2).
- A 5e-bits or Foundry importer (D2; DAT-4, P2).
- The core test fixture goblin (`test_utils/fixtures.rs`, HP `10 × CR`): we never load it, so it stays as upstream wrote it.
- Monsters choosing to flee on their own: the DM decides a retreat (D7). The policy never retreats.
- Monster control by an LLM: monster turns stay a scripted policy (decision 0015), in this repo.
- Crawling while Prone (D8).

## 2. What core already does, checked against the pinned rev

Findings at fork `demo` 8add3fa and table `main` 43619e3:

| Need | Core and table today | Consequence |
|---|---|---|
| A creature without class levels | `entities::creature::Monster` bundle: CR, HP, size, type, speed, abilities, skills, saves, loadout, effects, actions, factions | **No new entity.** The registry kind fills this bundle |
| Monster data in a registry | `RegistrySet` has actions, effects, items, classes, species and the rest, but no monsters. The table reads `data/monsters/*.json` itself (`adapter/monster.rs`, 229 lines) | **Fork item U19**: a `monsters/` registry kind (D1) |
| Fractional CR (ENG-2) | `ChallengeRating(u8)` panics on 0; XP is keyed by `u8`. PB comes from `total_level()`, so CR 1 gives PB +2, which every CR from 1/8 to 4 has | **Fork item U25.** Only XP is wrong today, and the demo never awards XP, so this is P1, not P0 (D3) |
| Armour and weapons | `shield.json`, `leather_armor.json`, `scimitar.json`, `shortbow.json` exist; no Chain Shirt; no Bite | **Fork item U23**: Chain Shirt, Wolf Bite, Giant Rat Bite (finesse) as item JSON |
| AC from gear | Monster AC comes from the loadout as for PCs | Every block's AC follows from its gear and Dexterity (§3): no natural-armour field is needed |
| Conditions | Effect JSON for Incapacitated, Paralyzed, Poisoned only. **No Prone** anywhere in core. The table maps no condition (API-20; Milestone 4 step 12) | **Fork item U21**: Prone. The contract already has `Condition::Prone` (`vocab.rs`) and the visibility row for conditions (protocol §5) |
| Advantage hooks | `on_attack_roll` (attacker), `on_attacked` (target), `pre_damage_roll`, `on_action_result`, `on_turn_start` and `on_speed` hooks with Lua scripts; `d20_check:add_advantage`; `speed` modifiers take a multiplier | Pack Tactics, Prone and the riders are effect JSON plus Lua, in the maintainer's pattern (Guiding Bolt, Reckless Attack, Brutal Strike) |
| What Lua can ask | `engine_state` offers HP, attitude, effects, class level, ability modifiers. It has **no distance, no "creatures near", no size**. A damage hook's `resolution` says hit or crit, **not whether the roll had Advantage** | **Fork item U20**: four read-only script functions in `scripts/script_api.rs` (§6) |
| Two attacks | `effect.extra_attack` (Lua) gives the Attack action a second attack | The Boss's Multiattack reuses it (D9) |
| Disengage | `action.disengage` costs an Action | Nimble Escape is an action JSON costing a Bonus Action, granted by an effect, as Tactical Shift grants its Disengage |
| Monster turns | Core's `RandomController` picks a random legal action. The table turns it off (`PlayerControlledTag`) and runs `adapter/game.rs` `scripted_action`: nearest hostile, melee in reach first, then ranged, then move | **Ours (MON-6)**, no core change. TASKS.md lists MON-6 as `Fork`; §8 moves it to `Ours` |
| Ending a fight because a side fled | `end_combat{fled}` is in the contract and answers `not_implemented` (`game.rs:1548`). `end_combat{scenario}` ends a fight but leaves every creature in the scene | **Ours (API-9)**, no core change (D7) |

**Result:** stat blocks, Prone, the script functions, the traits, three items and fractional CR are fork items (U19 to U25). Prone in state, the policy and `fled` are ours.

## 3. The stat blocks

Numbers are SRD 5.2.1 (CC-BY-4.0). Hit Points are the stat block's fixed average. To-hit and damage are what core computes from the ability score, PB +2 and the weapon. A step 3 test checks those against the stat block (§9).

| Monster | Size, type | CR (XP) | AC | HP | Speed | STR DEX CON INT WIS CHA | Attacks | Skills, saves | Traits and actions |
|---|---|---|---|---|---|---|---|---|---|
| Goblin Warrior | Small Fey (Goblinoid) | 1/4 (50) | 15 = Leather 11, Dex 2, Shield 2 | 10 (3d6) | 30 ft | 8 15 10 10 8 8 | Scimitar +4, 1d6+2 Slashing; Shortbow +4, 80/320 ft, 1d6+2 Piercing; +1d4 of the same type if the roll had Advantage | Stealth +6 | Nimble Escape |
| Goblin Boss | Small Fey (Goblinoid) | 1 (200) | 17 = Chain Shirt 13, Dex 2, Shield 2 | 21 (6d6) | 30 ft | 10 15 10 10 8 10 | As the Warrior | Stealth +6 | Multiattack (two attacks, any mix); Nimble Escape; Redirect Attack deferred (MON-7) |
| Wolf | Medium Beast | 1/4 (50) | 12 = 10, Dex 2 | 11 (2d8+2) | 40 ft | 14 15 12 3 12 6 | Bite +4, 1d6+2 Piercing; a Medium or smaller target has the Prone condition | Perception +5, Stealth +4 | Pack Tactics |
| Giant Rat | Small Beast | 1/8 (25) | 13 = 10, Dex 3 | 7 (2d6) | 30 ft | 7 16 11 2 10 4 | Bite +5 (finesse), 1d4+3 Piercing | Perception +2; Dex save +5 | Pack Tactics |

- Encounter budgets check out against scope §3: Fight 1 is 4 Warriors and 3 Wolves, 350 XP; Fight 2 is the Boss, 3 Warriors and 2 Wolves, 450 XP, plus 50 XP for the round-3 rats.
- Skill bonuses become proficiency levels: Stealth +6 and the Wolf's Perception +5 are expertise; the Wolf's Stealth +4, the Rat's Perception +2 and the Rat's Dexterity save +5 are proficiency.
- Every PC in the party is Medium, so every Bite hit on a PC knocks it Prone.
- Interactions the fights depend on, each a fixture assertion (§9): a Prone PC gives adjacent goblins Advantage, which triggers the 1d4; a goblin's Shortbow against a Prone PC beyond 5 feet has Disadvantage; Pack Tactics needs a conscious ally that isn't Incapacitated within 5 feet of the target.

## 4. Contract changes (Rule 1)

Each change lands in the PR that serves it (§7), with its fixture and a CHANGELOG line, from the next `1.0.0-dev.N` after main's value at the time. Nothing here is breaking.

| Where | Change | Visibility |
|---|---|---|
| `scene.rs` `SceneCreature.monster` | Doc comment only: the id names a core registry stat block (`goblin_warrior` resolves to `nat20_core::monster.goblin_warrior`, a `nat20_demo::` id to our overlay). Short ids stay valid (D10) | Scenario data: DM only, as today |
| `get_state` creature views | `conditions` carries `prone` (API-20 fills the field; this adds the value) | Everyone (protocol §5 row "Conditions") |
| Events | `condition_added{target, condition: prone, source}` and `condition_removed` start being logged for Prone. New event `fled{handles}`, public, before `combat_over{reason: fled}` | Public |
| Rolls | `advantage_sources` gains the ids of Pack Tactics and Prone | DM only, as today |
| `end_combat{fled}` | Served (D7). Accepted only when the encounter lists `fled` in `end_reasons`, else `rejected` with `condition_not_met` | DM only |
| `contract/protocol.md` | Status paragraph: `end_combat{fled}` is served, and Prone is filled. §4.4: what `fled` does. §5: no new row (conditions, health band and stat blocks are already placed). §6: the `fled` event | |

The player-facing monster card doesn't change: name, health band (`unhurt` / `bloodied` / `down`, decided by Stas 2026-10-17) and visible conditions. Stat blocks, AC, HP, CR, XP and `advantage_sources` stay in the DM view only (Rule 3). `fled` isn't hidden information: the party sees the goblins run.

## 5. What the engine resolves and what the agents decide

| Decision | Engine (core or table policy) | Agents |
|---|---|---|
| Pack Tactics, Prone's Advantage and Disadvantage, the 1d4 rider | Core, on every roll | Never |
| Bite knocks Prone | Core, on a hit against a Medium or smaller target | Never |
| Standing up | Core, at the start of the Prone creature's turn, for half its Speed (D8) | Never |
| Which target a monster attacks, when it uses Nimble Escape | The table's scripted policy (MON-6), deterministic | Never; the DM narrates consecutive monster turns together (decision 0015) |
| That the goblins run | Nothing: the policy never retreats | The DM decides and calls `end_combat{fled}`; the DM agent's prompt forbids narrating a retreat without that call (Milestone 6, AGT rows) |
| Surrender | Unchanged (decision 0021) | DM |

## 6. Fork items

Each item is a `core/<topic>` branch off `demo` and a `core:` PR into `demo`, merged with a merge commit, with a test in `core/tests/`, regenerated `.schemas` and `cargo test --locked` green (Rule 6). Registry JSON comes before code, and Lua only where logic needs it. Each pin bump is its own table PR (Rule 5). Generic SRD content gets core ids under `nat20_core::`; nothing here is adventure-only.

| Item | Change in core | Row | Size |
|---|---|---|---|
| U19 Monster registry kind | `MonsterId` (`monster`), `registry/serialize/monster.rs` (new), a `monsters` field on `RegistrySet`, schema and validation (every action, effect, item and faction id must resolve), and a spawn function that builds the `Monster` bundle from a definition. The format holds what the bundle holds: name, size, type, CR, HP average and dice, speed, ability scores, skill and save proficiencies, gear (equipped items), effects, default factions, `_comment`. No mechanics vocabulary: behaviour comes only from existing effect, action and item ids (D1). The Goblin Warrior block lands with it, on a real Shield (MON-2) | MON-1, MON-2 | M |
| U20 Script functions | Read-only, in `scripts/script_api.rs`: `engine_state:distance_ft(a, b)`, `engine_state:creatures_within(entity, feet)`, `engine_state:size(entity)`, `resolution:had_advantage()` | MON-4 | S |
| U21 Prone | `effect.condition.prone`: Disadvantage on the creature's attack rolls (existing modifier); an `on_attacked` hook giving Advantage within 5 feet and Disadvantage beyond; an `on_turn_start` hook that ends Prone and halves Speed for that turn (D8); a Speed of 0 can't stand | MON-8 (new) | S |
| U22 Monster traits | `effect.monster.pack_tactics` (an ally that isn't Incapacitated within 5 feet of the target); `effect.monster.advantage_rider` (a `pre_damage_roll` hook: +1d4 of the first damage component's type if `had_advantage`); `effect.monster.knock_prone_on_bite` (`on_action_result`: on a Bite hit against a Medium or smaller target, apply Prone); `action.monster.nimble_escape` plus its granting effect (Disengage for a Bonus Action). Multiattack reuses `effect.extra_attack` | MON-2..5 | M |
| U23 Items | `item.chain_shirt` (Medium armour, AC 13 + Dex up to 2), `item.wolf_bite` (1d6 Piercing, Strength), `item.giant_rat_bite` (1d4 Piercing, finesse), each Bite with a `_comment` marking it a natural weapon | ITM-3, MON-4, MON-5 | S |
| U24 Stat blocks | `monsters/goblin_boss.json`, `wolf.json`, `giant_rat.json` per §3; trait effects attached once U22 lands. The Boss's `_comment` names Redirect Attack as deferred (MON-7) | MON-3..5 | S |
| U25 Fractional CR | `ChallengeRating` holds 0, 1/8, 1/4, 1/2 and whole numbers, parses `"1/4"`, gives SRD XP (25, 50, 100) and keeps PB +2 below CR 5. `new(u8)` keeps its signature for upstream call sites | ENG-2 | S |

### 6.1 Staying clear of upstream `save-to-file`

Upstream's unmerged `save-to-file` branch (e05321d) conflicts with `demo` in `components/actions/action.rs`, `engine/encounter.rs`, `engine/engine_state.rs`, `lib.rs`, `registry/serialize/action.rs` and `registry/serialize/effect.rs`. It also edits `execution.rs`, `reaction.rs`, `effects/effect.rs`, `modifier.rs`, `d20.rs`, `level.rs`, `id.rs`, `creature.rs` and `registry.rs` (assessment of 2026-10-20). The standing rule is to keep new core work out of those files until the branch reaches upstream `main`. This milestone touches:

| File | Upstream change there | Our hunk |
|---|---|---|
| `registry/serialize/monster.rs`, the spawn module, `effects/condition/prone.*`, `effects/monster/*`, `actions/monster/*`, `items/*`, `monsters/*` | none (new files) | new |
| `scripts/script_api.rs` | none | U20: four methods |
| `registry/registry.rs` | `static` to `const` on one line | U19: one field plus its load call, away from that line |
| `components/id.rs` | renames `AIControllerId`'s prefix, inside the `id_newtypes!` list | U19: `MonsterId` at the **head** of the list or in its own `id_newtypes!` call, so no hunk sits next to that line |
| `components/level.rs` | adds `Serialize, Deserialize` to `ChallengeRating`'s derive | U25: one hunk; expect one trivial conflict at the next sync |
| `registry/schema.rs`, `registry_validation.rs`, `serialize.rs`, `systems.rs` | none | `mod` lines and the schema root |

- Not touched: `action.rs`, `execution.rs`, `reaction.rs`, `encounter.rs`, `engine_state.rs`, `lib.rs`, `effect.rs`, `modifier.rs`, `d20.rs`, `creature.rs`. That is the main reason Redirect Attack is deferred: it needs to retarget an attack in flight, which means `action.rs`, `execution.rs` and `reaction.rs`.
- Every effect JSON added here gets re-validated, and `.schemas` regenerated, when the sync takes upstream's `serialize/effect.rs` rework. The sync row (UPS) budgets it.
- Each core PR lands before any upstream sync, small and with one hunk per touched file.

## 7. Ordered task breakdown

Each step is one PR (Rule 8, one concern), green on all CI jobs, with its contract change, fixture, CHANGELOG line and TASKS.md row update. Core comes first wherever the server would map something core lacks. Inside each table step, Rule 1's order holds (contract, fixture, CHANGELOG, gen, then code). Steps marked † re-record fixtures that include the Goblin Warrior; each says so in its PR.

| # | PR | Rows | Needs | Size |
|---|---|---|---|---|
| 1 | Fork U19 registry kind with the Goblin Warrior block, plus U23 items | MON-1, MON-2, ITM-3 | | M + S |
| 2 | Fork U24 Boss, Wolf and Giant Rat blocks (numbers and gear; no traits yet) | MON-3..5 | 1 | S |
| 3 | Pin bump; the adapter spawns from core's registry; `data/monsters/` and `MonsterDef` deleted; scene ids resolve (D10); stat-block guard test (§9) † | MON-1 | 2 | S + M |
| 4 | Fork U20 script functions and U21 Prone | MON-8 | | S + S |
| 5 | Fork U22 traits, attached to the four blocks | MON-2..5 | 2, 4 | M |
| 6 | Pin bump; Prone in state and events, `advantage_sources`; fixture `monsters.jsonl` (§9) † | MON-8, API-20 | 3, 5 | S + S |
| 7 | Scripted policy (MON-6, D6): Pack Tactics set-up, Prone targets first, Nimble Escape, ties broken by handle order; fixture `pack.jsonl` | MON-6 | 6 | M |
| 8 | `end_combat{fled}` (D7): contract, protocol, the `fled` event, fleeing creatures leave the scene; fixture `fled.jsonl` | API-9 | 3 | S |
| 9 | Fork U25 fractional CR; pin bump (the engine log's XP changes, so any fixture that logs it is re-recorded) | ENG-2 | | S + S |
| 10 | Exit fixture `m5_fights.jsonl`: Scene 3 (4 Warriors and 3 Wolves) and Scene 5 (Boss, 3 Warriors, 2 Wolves, rats on round 3) against the Milestone 4 pregens on `main`, from one seed; the `nat20-duel` audit covers every monster roll | MON-9 (new) | 1-9 | S |

Fork steps 1, 2, 4, 5 and 9 can run beside table steps once their predecessors are merged. Step 8 needs only step 3, so it can go before 4 to 7. That makes about 14 PRs counting pin bumps, and roughly 2 to 3 weeks of single-thread work. The risk sits in step 5 (Lua over a 3D navmesh: "within 5 feet" is a distance between poses, not grid squares) and step 7 (a policy that sets up Pack Tactics without looking silly).

## 8. TASKS.md changes made with this spec

- MON-1: reworded as the core registry kind, Dest `Fork`, Size M; the 5e-bits importer moves to new row **DAT-4** (P2).
- MON-2 to MON-5: Dest `Fork`. MON-3 loses Redirect Attack, which goes to new row **MON-7** (P2, won't build for the demo; RAW deviation accepted by Stas 2026-10-20).
- MON-6: Dest `Ours` (the policy lives in `adapter/game.rs`); the surrender trigger part is already done (table #26); "flank" becomes "set up Pack Tactics".
- ENG-2: P0 to P1, Dest `Fork`. PB is right today; only XP is wrong.
- API-9: `fled` joins Milestone 5 as a DM call, independent of MON-6.
- ENG-1: Redirect Attack leaves it (MON-7).
- API-20: adds Prone when step 6 lands.
- New rows: **MON-8** Prone condition (P0, Fork, S); **MON-9** Milestone 5 exit fixture (P0, Ours, S); **MON-7** Redirect Attack (P2); **DAT-4** 5e-bits monster import (P2).
- The Milestone 5 row lists MON-1..9, ENG-2, API-9 and points here.

## 9. Test and fixture plan

| Fixture (`contract/fixtures/`) | Shows |
|---|---|
| `monsters.jsonl` | A Wolf's Bite knocks a PC Prone (`condition_added{prone}`, public); the Prone PC's own attack has Disadvantage; an adjacent goblin's attack on it has Advantage and adds the 1d4; a goblin's Shortbow from 30 feet has Disadvantage; the PC stands at its turn start with half its Speed left; Pack Tactics in `advantage_sources` (DM view), absent from the player view; a Wolf with no ally near the target rolls straight |
| `pack.jsonl` | Two Wolves and a Goblin Warrior against two PCs: the policy brings the second Wolf to the target its ally engages, prefers a Prone target, and a Bloodied goblin in melee uses Nimble Escape and shoots. Replays byte-identically from its seed |
| `fled.jsonl` | `end_combat{fled}` refused when the encounter doesn't list it; accepted when it does; `fled{handles}` then `combat_over{reason: fled}`; the creatures are gone from `get_state`; a surrendered creature stays |
| Re-recorded † | Fixtures with the Goblin Warrior, after step 3 (real Shield, same AC) and step 6 (Nimble Escape and the rider can change its turns) |
| `m5_fights.jsonl` | The exit run |

Other tests:
- **Stat-block guard** (table, step 3): spawn each of the four from core's registry and compare AC, HP, speed, ability scores, CR, XP (after step 9), to-hit and damage dice against a vendored excerpt of the four SRD 5.2.1 stat blocks. The excerpt holds numbers only, in `crates/nat20-api-server/tests/data/srd-5.2.1-monsters.json`, taken from the project wiki's SRD export. A sibling `ATTRIBUTION.md` carries the SRD 5.2.1 CC-BY-4.0 paragraph. The test reads the engine's derived values, so it catches a wrong item as well as a typo.
- **Visibility scan** (CI job `visibility`): no player-projected line carries a monster's AC, HP, CR, XP, `advantage_sources`, or a stat block id.
- **Fork tests** in `core/tests/`: U19 the four blocks load and spawn, and an unknown effect id in a block fails validation; U20 distance and creatures-within on known poses; U21 Prone's Advantage and Disadvantage by distance, standing for half Speed, Speed 0 can't stand; U22 Pack Tactics with and without an ally, with an Incapacitated ally, the rider only on Advantage, Prone only on a Medium or smaller target, Nimble Escape costs the Bonus Action, the Boss attacks twice; U25 CR 1/8 and 1/4 parse, XP 25 and 50, PB +2.
- **Audit:** `nat20-duel` audits `m5_fights` and fails on any uncited monster roll, rider die included.

## 10. Acceptance, tied to the demo criteria

| Demo criterion (scope §6) | What this milestone proves |
|---|---|
| 1. Scene 1 to 6 unattended | Both fights run from the scene files with the real monsters, the round-3 rats included, and end by side down, surrender or `fled` |
| 2. Every roll in the engine log | Rider dice, Pack Tactics and Prone rolls all carry `rN` ids; the audit passes on `m5_fights` |
| 3. No narration contradicts state | Prone is engine state everyone can see; a retreat is an engine event, so "the goblins flee" matches a scene without them |
| 4. Latency | Monster turns stay scripted; the exit run logs the time per monster turn with 7 monsters on the field as a baseline for API-17 |
| 5. Recovery within 2 retries | `end_combat{fled}` refused with `condition_not_met` and a sentence |
| 6. First-time player | `/sheet` and the state show "Prone" on the human's Fighter after a Bite, and the turn options reflect it |

**Done when:** the exit criterion holds on nat20-table `main` with CI green, `m5_fights.jsonl` replays byte-identically, every Milestone 5 row is `done` or explicitly moved, and the TASKS.md milestone row shows the date.

## 11. Decisions

D1 to D7 were decided by Stas on 2026-10-20 in this spec's thread ("yes for all recommendations", after the scope challenge). D8 to D11 are new here: each is recommended and stands unless Stas changes it in review. The format decision is recorded as `docs/decisions/0026-monster-registry-kind.md` in this PR.

| # | Question | Decision | Options | Why |
|---|---|---|---|---|
| D1 | Where stat blocks live | **Thin core registry kind** (decided) | **Thin core kind**: `monsters/` in core's registry, numbers plus references to existing effect, action and item ids · **Table JSON**: keep `data/monsters/` and add behaviours as core effects · **Rich core kind**: traits, riders and attacks as new registry vocabulary | Rule 6 puts generic SRD content in core. References resolve at registry load, not at scene load. A rich format means a new mechanics language for four creatures, and more files that upstream's effect rework would hit. The one new mechanic is a condition, Prone |
| D2 | Where the numbers come from | **Hand-typed from SRD 5.2.1, guarded by a test** (decided) | **By hand**: four blocks, each `_comment` naming its source; numbers per the 2026-10-16 split (5e-bits for numbers, Foundry CC-BY-4.0 2024 records for rider shapes), with the SRD winning any disagreement · **Importer**: 5e-bits typed import now | Four blocks don't pay for a pipeline, and 5e-bits gets the Goblin's 1d4 rider wrong (it applies it on every hit). The importer is DAT-4, P2 |
| D3 | Fractional CR | **In Milestone 5, P1** (decided) | **Now, P1**: U25 · **P0**: as TASKS.md had it · **Later** | PB is already right; the registry still has to hold "1/4", and XP should be right in the log. The placeholder fixture goblin is won't do |
| D4 | Which behaviours | **Pack Tactics, Bite to Prone, the 1d4 rider, Multiattack, Nimble Escape (Disengage only), Chain Shirt** (decided) | as listed · fewer | These are the mechanics both fights exercise. Prone drives the rider: without it, five Wolves are weak and the rider almost never fires |
| D5 | Redirect Attack | **Defer to P2** (decided; RAW deviation accepted) | **Defer**: MON-7, `_comment` on the Boss · **Build**: retarget an attack in flight | Building it means `action.rs`, `execution.rs` and `reaction.rs`, the heart of upstream's rework, plus a new wire event, for one reaction of one creature |
| D6 | Monster policy | **Minimal MON-6 in the table** (decided) | **Minimal**: Pack Tactics set-up, Prone targets first, Nimble Escape when Bloodied in melee, deterministic · **None**: nearest-hostile as today · **DM agent**: an LLM picks | Decision 0015 keeps monster turns scripted. Without set-up, Pack Tactics fires by luck |
| D7 | `fled` | **Minimal, DM-called** (decided) | **Minimal**: `end_combat{fled}`, the monsters leave, `fled{handles}` · **Won't do**: the DM narrates a retreat over `scenario` · **Policy-driven**: monsters decide to run | With `scenario`, the goblins stay in the yard while the narration says they ran: a contradiction (scope §6.3) |
| D8 | Standing up from Prone | **Recommend: automatic at turn start, half Speed** | **Automatic**: Prone ends at the start of the creature's turn, Speed halved that turn · **Option**: a "stand up" entry in `legal_actions` | Staying down is almost never right in these fights, and an option means a new option kind, a rejection reason and a policy choice. Cost: a PC can't choose to stay Prone against archers. Crawling isn't modelled |
| D9 | Multiattack | **Recommend: reuse `effect.extra_attack`** | **Reuse**: the Attack action makes two attacks · **New action**: a Multiattack action | The SRD text ("two attacks, using Scimitar or Shortbow in any combination") resolves identically, and reuse adds no format |
| D10 | Scene file monster ids | **Recommend: short ids resolved by the adapter** | **Short**: `goblin_warrior` means `nat20_core::monster.goblin_warrior`; a namespaced id passes through · **Full ids only** | No scene file or fixture changes, and the field's meaning changes only in its doc comment |
| D11 | Where fled creatures go | **Recommend: removed from the scene** | **Removed**: despawned after `fled{handles}` · **Kept**: marked fled in state | A creature that ran isn't in the scene; keeping it invites the narration contradiction D7 exists to stop |

Not asked, because already settled: monster turns are scripted (0015); the player's view of enemy health is a band (2026-10-17); the fork is ours (0023); 2024 rules (0009).

## Sources

- `TASKS.md` (project copy `/mnt/project-files/engine/TASKS.md`) § Milestones and rows MON, ENG-1, ENG-2, API-9, API-20, DAT.
- `docs/scope/demo-run-scope.md` §2, §3, §6; decisions 0015, 0021, 0023.
- `contract/protocol.md` §4.4, §5, §6; `crates/nat20-api-contract/src/{scene,state,envelope,vocab}.rs`; `crates/nat20-api-server/src/adapter/{monster,game}.rs`; `crates/nat20-api-server/data/monsters/goblin_warrior.json`.
- Fork `StGerman/nat20` at 8add3fa: `core/src/entities/creature.rs`, `core/src/components/{level,id}.rs`, `core/src/registry/{registry,ai}.rs`, `core/src/registry/serialize/effect.rs`, `core/src/scripts/script_api.rs`; `assets/registries/{effects,actions,items}/`.
- Upstream `save-to-file` e05321d (anonymous fetch) and `/mnt/project-files/engine/upstream/save-to-file-assessment-2026-10-20.md`.
- SRD 5.2.1 (CC-BY-4.0) via `/mnt/project-files/dnd-wiki/`: Goblin Warrior, Goblin Boss, Wolf, Giant Rat, Prone, Incapacitated, Disengage, Experience Points by Challenge Rating.
