# 0080. Every exit row names the lowest layer that tests it; a card bench is designed and tried on Milestone 13

- **Status:** Accepted (Stas, 2026-11-14, in two answers; the CLAUDE.md line's wording when he merges table #383)
- **Date:** 2026-11-14
- **Decided by:** Stas, 2026-11-14 16:59Z (testing thread: «Да давай добавим в CLAUDE.md»), on the rule as quoted to him in two sentences: every exit row in a new scope or design names the cheapest layer that tests it, and a run failure a test with no model could have seen gets that test in the fix's PR. The CLAUDE.md line adds a start date, the analysis step and "the rerun is still played"; those three he accepts by merging table #383, not by that answer. Drafted from his ask of 06:55Z. At 19:42Z, on the card bench: «Проектировать стенд карточки давай потестируем на M13 и если пойдет сделаем это правило постоянным»

## Context

Stas asked for testing of card content and player decisions closer to unit or component tests, and for a bold redesign of the gates. The facts checked (`docs/design/content-test-layers.md` §1, §2):

- Structure is already tested with no model: seeded contract fixtures, and scripted walks of whole contracts in `game/test/campaign-loop.test.ts` that assert the verdict rows. M11's structural exit failures were fixed with tests there.
- What a live model decides is first tested by a run of a whole contract: `play:scene` brings a live DM to a chosen scene, nothing brings one to a chosen road card.
- By 07:00Z on 2026-11-14 Milestone 12 had played ten runs and three exit pairs and passed none: 44.29 USD and 3.09 h of Stas at the table (wall time; for 81 of those minutes he had stepped away and the table waited on his seat), from the runs' `usage.jsonl` and `run.json` in nat20-runs `master` 65c0e7c.
- Its two failed exit evenings: run 16:05 failed its own-move row on a plan Stas said between cards, where no own move exists, two more gating rows on build defects a scripted test can see, and the time limit after Stas stepped away with the contract unfinished; run 01:42 failed on two cards with no room for his plan, reached after 16 minutes of play.
- Nothing considered would have saved a run or an evening for certain on that record.

## Options

### A. Change nothing
- Pro: nothing to build or review; the scripted layer already takes structural failures.
- Con: the practice is unwritten, so a new exit row can still arrive with no test below a full run; a player's line on a road card can only be tried in an evening.

### B. Write the practice down as a rule, and design a card bench before deciding to build it
- Pro: costs one docs PR now; every exit row names its lowest layer, and a run failure a test with no model could see gets one; the bench's six open points (design §4) are answered with a cost before any code.
- Con: a second design for Stas to read; no saving until a bench exists and works.

### C. Build the card bench now
- Pro: the fastest way to learn whether trying lines on one card finds what an evening finds.
- Con: review found its design open on six points, one of them probably a contract change; a cost given today would be a guess.

### D. Change the exit pair now: Stas plays once at milestone close, a fix covered by a lower-layer case does not replay the pair
- Pro: the bold version.
- Con: the record does not support it: nothing considered would have passed either failed M12 evening for certain; it supersedes 0043's one commit and the scopes' "both runs again" on a promise.

## Decision

Accepted: B, in two answers. The rule at 16:59Z. The bench at 19:42Z: it is designed and tried on Milestone 13, and whether it then becomes a standing rule is a later decision, taken on what the trial shows.

Why B: over A it costs a layer named beside each exit row, a test in the fix's PR when a test with no model could have seen a run's failure, and a second design to read. It beats C and D because both spend, or change accepted rules, on evidence that does not exist yet.

## Consequences

- From 2026-11-15, every exit row in a milestone scope or design first drafted from that date names the lowest layer that tests it: a test with no model, a live run smaller than the exit run, a full run, or "a person". Scopes and designs drafted earlier (M12, M13, the Allies in fights scope) are not amended.
- From 2026-11-15: when a full run fails, its analysis says whether a test with no model could have seen it, and if one could, the fix's PR adds that test. The rerun the pair's rules require is still played.
- The rule is one bullet in CLAUDE.md under Rule 8, and its exit-row sentence is in Yan's scope reference and Lev's design reference, all added in this PR. Where a doc and CLAUDE.md differ on the wording, CLAUDE.md is the rule.
- The card bench gets its own system design, in its own PR, to be tried on Milestone 13; no rows before that design is accepted. Making the bench a standing rule needs its own record after the trial.
- No accepted decision and no scope changes.

## Revisit when

At Milestone 13's close: Stas's 19:42Z words can also be read as putting this rule, and not only the bench, on trial for that milestone, so the close sweep reports what the bench and the rule's fix-PR half each caught, and he keeps or drops them. The exit-row half has nothing to show there: Milestone 13's scope and design were drafted before it. And when a layer below the full run, the card bench or another, has caught a failure that a full run also showed (Yan's amendment, design §7): then option D is decided on that record. The rule itself is reopened when two milestone scopes or designs in a row name only "a full run" or "a person" beside every exit row: then it is changing nothing.

## Sources

- `docs/design/content-test-layers.md`.
- Runs `full-2026-11-12T19-02-03-994Z` to `full-2026-11-14T01-42-04-072Z`, StGerman/nat20-runs `master` 65c0e7c; analyses in the project files under `engine/m12/runs/`.
- `game/test/campaign-loop.test.ts`; `docs/roadmap.md` § Delivery for the M11 baseline only.
- Decisions 0036, 0043, 0065, 0066, 0074; decisions 0079, 0081 and 0082 (Accepted 2026-11-14, after this record was drafted).
