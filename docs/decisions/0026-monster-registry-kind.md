# 0026. Monster stat blocks are a thin core registry kind

- **Status:** Accepted
- **Date:** 2026-10-20
- **Decided by:** Stas, 2026-10-20, in the Milestone 5 spec thread ("yes for all recommendations", after Claude's scope challenge); spec `docs/milestones/milestone-5-monsters.md` D1, D2

## Context

The demo fights four SRD 5.2.1 monsters: Goblin Warrior, Goblin Boss, Wolf and Giant Rat. Since Milestone 1 the Goblin Warrior has been a JSON file in this repo (`crates/nat20-api-server/data/monsters/`), turned into core's `Monster` bundle by `adapter/monster.rs`. That file has a stopgap shield effect and a list of what it can't express. Core has a `Monster` entity bundle but no monster registry kind.

Upstream declined our proposal for a monster format (upstream #4, 2026-10-18). The fork is ours (0023), and Rule 6 puts generic SRD content in core's registry tree on `demo`. On 2026-10-18 Stas chose a new core registry kind that reuses core's actions, effects and items.

Upstream's unmerged `save-to-file` branch reworks effect serialization, encounters and actions. A trial merge conflicts with `demo` in six core files, so new core work should stay out of them until that branch reaches upstream `main`.

Data sources (Rule 7, decided 2026-10-16): 5e-bits owns monster base numbers. Foundry's CC-BY-4.0 2024 records show how riders are structured. 5e-bits applies the Goblin's extra 1d4 on every hit, which is wrong.

## Options

### A. Thin core registry kind
`monsters/` in core's registry: the numbers the `Monster` bundle holds, plus references to existing action, effect and item ids. Behaviours are ordinary effect JSON and Lua.
- Pro: generic SRD content sits where Rule 6 puts it, and core validates every reference when the registry loads.
- Pro: the format adds no mechanics vocabulary, so upstream's effect rework touches only the effect files we add, not a second language.
- Con: a new kind costs a serializer, a schema, validation and a pin bump before the table can use it.

### B. Keep stat blocks in the table
Keep `data/monsters/`, and put only the behaviours in core as effects.
- Pro: no new core kind; the fewest core PRs.
- Con: generic SRD data stays outside core, against Rule 6, and references to core ids are checked only when a scene loads.
- Con: the demo would migrate later anyway.

### C. Rich core registry kind
Attacks, riders and traits as new fields in the monster format (an attack list with "on Advantage" and "on hit" clauses).
- Pro: a stat block reads like the SRD.
- Con: a second mechanics language beside effects and actions, for four creatures; more surface for upstream's effect rework to break.

### D. Generate the blocks from a 5e-bits typed import
- Pro: scales to the whole SRD bestiary later.
- Con: a pipeline for four blocks, and 5e-bits gets one of those blocks wrong.

## Decision

A, with the four blocks typed by hand from SRD 5.2.1. A table test compares the engine's derived numbers with a vendored, numbers-only excerpt of the SRD stat blocks. A gives Rule 6 placement and load-time validation without adding a mechanics language. The importer (D) is deferred to DAT-4.

## Consequences

- Core gains `MonsterId`, `registry/serialize/monster.rs`, a `monsters` field on `RegistrySet` and a spawn function. The new kind avoids the `save-to-file` conflict files; the spec's §6.1 lists every file it touches.
- The only new mechanic is a condition, Prone, as effect JSON and Lua. Pack Tactics, the Advantage rider, the Bite's Prone and Nimble Escape are effects and actions referenced by id.
- The table deletes `data/monsters/` and `MonsterDef`, and the adapter spawns from core's registry. Scene files keep short ids (`goblin_warrior`), which the adapter resolves to `nat20_core::monster.<id>` (spec D10).
- Adventure-only monsters, if any appear, go in `content/registries/` under `nat20_demo::`.
- TASKS.md: MON-1 reworded, DAT-4 added (P2).

## Revisit when

- A monster needs a behaviour that effects and actions can't express without new format vocabulary (Redirect Attack, MON-7, is the first candidate).
- More than about ten monsters are needed: build DAT-4.
- `save-to-file` reaches upstream `main` and changes the effect format the blocks reference.

## Sources

- `docs/milestones/milestone-5-monsters.md` §2, §6, D1, D2.
- Decisions 0010, 0011, 0023; `/mnt/project-files/engine/upstream/save-to-file-assessment-2026-10-20.md`.
- Fork `demo` 8add3fa: `core/src/entities/creature.rs`, `core/src/registry/registry.rs`.
