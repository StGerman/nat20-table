# 0101. People, places and the picture book exits on scene-size runs and Stas's iPhone game, not on 0043's pair

- **Status:** Proposed
- **Date:** 2026-11-28
- **Decided by:** Stas, card in the "Merge registries and picture-book milestone" thread, 2026-11-28 23:29Z ("Да, все": all 13 recommendations of the design's §9); accepted on merge

## Context

Decision 0043 closes a milestone on a pair on one build: an all-AI full run, then Stas's. This milestone (`tasks/registries/milestone.md`, design `docs/design/registries-and-picture-book-design.md`) changes what the page shows and which picture the table picks, and adds reading for three deaths. Facts checked:

- The all-AI half plays at no seat that draws a page, so it tests none of the picture book.
- What the milestone changes in play lives in two branches a full run may never reach: a goblin yielding in Scene 3 (the Snitt storeroom, `snitt_yielded`) and a Mill person's death carried into Scene 6.
- Glass Table closed on Stas's iPhone game without its pair (decision 0099), which is the nearest precedent.

## Options

### A. 0043's pair: one all-AI full run, then Stas's
- Pro: the rule every closed milestone has followed; one build, end to end.
- Con: the AI half sees no page and may roll neither branch; a full run costs a Plus window or an evening.

### B. Scene-size live runs that force each branch, then Stas plays the Mill on his iPhone, on one build
- Pro: each run aims at what changed; cheaper; Stas's game covers the page end to end.
- Con: no all-AI Scene 1 to 6 on this build; a regression between scenes shows only in Stas's game.

### C. Stas's game alone
- Con: whether a branch is reached is left to chance and to one person.

## Decision

B. Live runs smaller than an exit run, judge on: Scene 3 into Scene 4 on both yard endings, and a death into Scene 6; then Stas plays *The Silent Mill* Scene 1 to 6 on his iPhone on the same build (exit row 9, AGT-160). It beat A because A's AI half cannot see the page and may miss both branches.

## Consequences

- Decision 0043 stays for other milestones; this one waives its all-AI half.
- AGT-160 carries the runs; the run folders go to `/mnt/project-files/engine/registries/runs/` and nat20-runs as usual.

## Revisit when

A regression between scenes reaches Stas's game that a full all-AI run would have caught, or the next milestone that changes the Narrator's brief more than this one does.

## Sources

- Design §9.13 and §8; milestone exit row 9
- Decisions 0043, 0099
