# 0034. Agent memory lasts one run: typed player notes and a DM memory of invented facts

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decided by:** Stas, Milestone 6 spec decision card D9, 2026-10-23 (he raised the question the same day)

## Context

Stas asked whether agents should have memory in Milestone 6: to keep the game consistent, and so that each AI character remembers in its own way. The spec already gave AI players private notes and a summary at every scene change. The DM had no memory, so anything it made up that the engine doesn't track (an NPC's name, a promise, a locked door) lived only in its current scene's context. Memory across runs is campaign saving, which Stas placed after the demo (North Star question 6, 2026-10-21).

## Options

### A. Memory for one run, for players and the DM
- Pro: the DM's memory of invented facts stops narration contradicting earlier narration where it starts; typed player notes make characters remember in character.
- Con: two tools and one store per agent; DM memory needs the same guard as narration.

### B. Also keep memory across runs in Milestone 6
- Pro: characters remember earlier runs.
- Con: needs saving and loading, and rules for what carries over; pulls campaign persistence into the demo.

### C. Player notes only, as the spec had them
- Pro: nothing new to build.
- Con: the DM forgets its own inventions; contradictions wait for the narration check in Milestone 7 (AGT-9).

## Decision

A. Players keep `note{kind, text}` notes; the DM keeps `remember{fact}` entries. Both are appended, always in their owner's context, fiction only (the engine stays the source of every number), never deciding an outcome, and written to the transcript.

## Consequences

- DM memory is DM-only and passes the narration guard; the leak scan covers it (Rule 3).
- Memory can change which check the DM asks for, never whether it succeeds (Rule 4).
- New TASKS.md row AGT-21, built in spec steps 9 and 10.

## Revisit when

Campaign saving is planned after Milestone 7, or playtests show agents forgetting things that matter within a run despite their notes.

## Sources

- `docs/milestones/milestone-6-agents-at-the-table.md` §3.6, D9; `/mnt/project-files/demo/north-star-vs-scope-questions.md` question 6; scope §4.3.
