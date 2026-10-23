# 0031. The DM's adventure file is typed in game/, not in the contract crate

- **Status:** Proposed
- **Date:** 2026-10-23
- **Decided by:** Stas, Milestone 6 spec decision card D3 (pending)

## Context

The engine reads scene files (anchors, checks, DCs, encounters, spawns), typed in the contract crate. The DM agent also needs content the engine never reads: read-aloud openings, NPC notes, which check fits which player intent, scene order, exits and time targets. Rule 1 keeps the contract crate to engine wire types.

## Options

### A. A game-side type and JSON Schema in `game/`
- Pro: the contract stays engine-only; a CI test loads the file with the scene files and fails on any id that doesn't resolve.
- Con: a second schema pipeline, small and TS-only.

### B. A contract crate type, like scene and pregen files
- Pro: one codegen path.
- Con: the contract grows types no engine code reads, and its schema hash changes with story edits.

### C. Untyped Markdown notes
- Pro: fastest to write.
- Con: nothing checks the ids it names; a renamed check breaks the DM silently.

## Decision

A. `scenarios/the_silent_mill/adventure.json`, JSON with `_comment` keys like pregens (0025), typed and validated in `game/`.

## Consequences

- Adventure content lives in `scenarios/`, setting text in `lore/`, never in core (Rule 6).
- Both the adventure file and the scene files are DM-only; only the DM agent's prompt includes them (Rule 3).

## Revisit when

The engine needs to read any of this content; that part then moves into the scene file through the contract.

## Sources

- `docs/milestones/milestone-6-agents-at-the-table.md` §4, D3; decisions 0018, 0025.
