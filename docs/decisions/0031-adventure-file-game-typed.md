# 0031. Adventures are scenario packs: a JSON skeleton plus Markdown prose, loadable from any path

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decided by:** Stas, Milestone 6 spec thread (decision card "Which adventure format should scenario packs use?", 2026-10-23)

## Context

The engine reads typed scene files (anchors, checks, DCs, encounters, spawns), defined in the contract crate. The DM agent also needs content the engine never reads: read-aloud openings, NPC notes, which check fits which player intent, scene order, exits and time targets. Rule 1 keeps the contract crate to engine wire types. Stas wants to add adventures outside this repo and to port parts of existing adventures, and wants a choice that can be changed later.

## Options

### A. Scenario pack: a JSON skeleton plus Markdown prose
- Pro: porting prose is pasting Markdown; the parts that can break the game (scene order, exits, NPC list, check ids, file links) are typed and checked.
- Pro: a pack is a folder loaded from any path, so adventures can live outside the repo.
- Con: two kinds of file per pack.

### B. Everything in one JSON file
- Pro: fully typed.
- Con: prose escaped into JSON strings; porting and editing are clumsy.

### C. Markdown only, no schema
- Pro: easiest to write.
- Con: nothing checks the ids it names, and every pack written this way is harder to migrate later: the one-way door.

## Decision

A. Each adventure is a folder holding `adventure.json` (the skeleton, with a `format_version`), `prose/*.md`, the engine's `scenes/` and the party's `cards/`. The game loads a pack from any path and hands its scene folder to the engine (API-18). The skeleton's type and JSON Schema live in `game/` for now, since the engine never reads it.

## Consequences

- A pack check validates the skeleton, its `format_version`, every id against the pack's scene files, every linked file, and that every scene loads in order. CI runs it on packs in the repo; anyone can run it on a pack outside it.
- Moving the skeleton's type into the contract crate later keeps every pack valid, because packs depend on the JSON shape and version, not on where the type is defined. A format change bumps `format_version`.
- Only our own or CC-BY text goes into a pack committed, shown or shared (Rule 7). A private pack of a published adventure stays outside the repo.
- The skeleton, prose and scene files are DM-only (Rule 3).

## Revisit when

The engine needs to read part of the skeleton (that part moves into the scene file through the contract), or porting shows the skeleton is missing something adventures commonly need.

## Sources

- `docs/milestones/milestone-6-agents-at-the-table.md` §4, D3; decisions 0018, 0025; scope §2.
