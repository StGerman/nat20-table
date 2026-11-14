# 0080. Scripted tests stay the layer below the exit pair; a card bench is designed before it is decided

- **Status:** Proposed
- **Date:** 2026-11-14
- **Decided by:** not decided; drafted for Stas from his ask of 2026-11-14 06:55Z (testing thread)

## Context

Stas asked for testing of card content and player decisions closer to unit or component tests, and for a bold redesign of the gates. The facts checked (`docs/design/content-test-layers.md` §1, §2):

- Structure is already tested with no model: seeded contract fixtures, and scripted walks of whole contracts in `game/test/campaign-loop.test.ts` that assert the verdict rows. M11's structural exit failures were fixed with tests there.
- What a live model decides is first tested by a run of a whole contract: `play:scene` brings a live DM to a chosen scene, nothing brings one to a chosen road card.
- Milestone 12 has played ten runs and three exit pairs and passed none: 44.29 USD and 3.09 h of Stas at the table (wall time) by 2026-11-14, from the runs' `usage.jsonl` and `run.json` in nat20-runs `master` 65c0e7c.
- Its two failed exit evenings: run 16:05 failed its own-move row on a plan Stas said between cards, where no own move exists, two more gating rows on build defects a scripted test can see, and the time limit with the table waiting on his seat; run 01:42 failed on two cards with no room for his plan, reached after 16 minutes of play.
- Nothing considered would have saved a run or an evening for certain on that record.

## Options

### A. Change nothing
- Pro: nothing to build or review; the scripted layer already takes structural failures.
- Con: the practice is unwritten, so a new exit row can still arrive with no scripted test; a player's line on a road card can only be tried in an evening.

### B. Write the practice down as a rule, and design a card bench before deciding to build it
- Pro: costs one docs PR now; every exit row names its lowest layer, and a run failure a scripted test could see gets one; the bench's six open points (design §4) are answered with a cost before any code.
- Con: a second design for Stas to read; no saving until a bench exists and works.

### C. Build the card bench now
- Pro: the fastest way to learn whether trying lines on one card finds what an evening finds.
- Con: review found its design open on six points, one of them probably a contract change; a cost given today would be a guess.

### D. Change the exit pair now: Stas plays once at milestone close, a fix covered by a lower-layer case does not replay the pair
- Pro: the bold version.
- Con: the record does not support it: both failed M12 evenings would have been replayed anyway; it supersedes 0043's one commit and the scopes' "both runs again" on a promise.

## Decision

Proposed: B. Over A it costs a layer named beside each exit row, a test in the fix's PR when a scripted test could have seen a run's failure, and, only if Stas wants the bench, a second design to read. It beats C and D because both spend, or change accepted rules, on evidence that does not exist yet.

## Consequences

- From the first milestone design written after acceptance, every exit row names the lowest layer that tests it: a scripted test, a full run, or "a person". A full-run failure that a scripted test could have seen gets that test in the fix's PR. The M12 and M13 designs are not amended. The accepting PR adds the rule to CLAUDE.md as one line, where design authors read it.
- If Stas wants it, the card bench gets its own system design; no rows before that is accepted.
- No accepted decision and no scope changes.

## Revisit when

A card bench design is accepted and one milestone has used the bench: then option D is decided on that record. If Stas declines the bench, option D is not reopened by this record.

## Sources

- `docs/design/content-test-layers.md`.
- Runs `full-2026-11-12T19-02-03-994Z` to `full-2026-11-14T01-42-04-072Z`, StGerman/nat20-runs `master` 65c0e7c; analyses in the project files under `engine/m12/runs/`.
- `game/test/campaign-loop.test.ts`; `docs/roadmap.md` § Delivery for the M11 baseline only.
- Decisions 0036, 0043, 0065, 0066, 0074; decision 0079 (Proposed, table #381).
