# 0080. A card bench before the exit pair; the pair's rules wait for the record

- **Status:** Proposed
- **Date:** 2026-11-14
- **Decided by:** not decided; drafted for Stas from his ask of 2026-11-14 06:55Z (testing thread)

## Context

Structure is already tested with no model: seeded contract fixtures, and scripted walks of whole contracts in `game/test/campaign-loop.test.ts` that assert the verdict rows. What a live model decides is not: how the DM reads a player's words, and whether a card can hold a person's plan, are first tested by a full run and its analysis thread.

Milestone 12 has played ten runs and three exit pairs, passed none, and cost 44.29 USD and 3.09 h of Stas at the table (wall time) by 2026-11-14 (`docs/design/content-test-layers.md` §2). Its two failed exit evenings:

- run 16:05: Stas's real plan came between cards, where no own move exists. Only a person at the seat finds that.
- run 01:42: one card has no failure the design allows for his plan, another no choice his plan could land on; it took 16 minutes of play to reach the first. On the second the DM also narrated an outcome with no roll.

The constraint is Stas's hours and the subscription's limits (0065).

## Options

### A. Keep the full run as the first test of live behaviour
- Pro: nothing to build; the pair tests the real thing; on the record, nothing proposed below would have saved a run or an evening for certain.
- Con: the only way to learn what the live DM does with a line on a road card is to play a contract up to that card.

### B. A card bench before the pair; the pair's rules unchanged

One command walks to a named card with no model and hands the live DM the table. A person types lines; recorded lines replay from a file and are checked on the DM's tool calls; later, a model writes plans (the plan fuzz). A full-run failure is added as a case at the lowest layer that can see it, in the fix's PR. One milestone's close records what the bench caught, missed and cost.

- Pro: no accepted rule changes; a mechanism can be tried on one chosen card without an evening around it; the recorded lines start from Stas's own 13; the record is what a later gate change needs.
- Con: 1 to 2 PRs into a queue of about 20 open ones; no dollar saving; no run or evening saved, and no defect shown, for certain on the record; nothing addresses a plan said between cards; the plan fuzz is unproven; the bench draws on the same subscription limits as the runs.

### C. B, and the gates change now: Stas plays once at milestone close, a fix covered by a bench case does not replay the pair
- Pro: the bold version; if the bench catches what it claims, three evenings become one.
- Con: the record does not support it: nothing proposed catches what failed run 16:05, and nothing certain catches what failed run 01:42, so under C both evenings would have been replayed anyway; it supersedes 0043's one commit and the scopes' "both runs again" on a promise.

## Decision

Proposed: B, on a judgement the record cannot prove: that trying lines on one chosen card will find holes that an evening took sixteen minutes of play to reach. It beats C because C changes accepted rules on evidence that does not exist yet; B produces that evidence in one milestone. A stays the honest fallback if Stas would rather not spend the PRs.

## Consequences

- From the first milestone design written after acceptance, every exit row names the lowest layer that tests it, or "a person". The M12 and M13 designs are not amended.
- A bench command is added, after the M12 stack is on main; rows only after Stas accepts.
- Decisions 0036, 0043, 0065, 0066 and 0074 and the milestone scopes are not changed. Who runs the bench is question 2 of the design; an answer that puts it on a cloud API key needs 0036 revisited in its own record.
- `docs/roadmap.md`'s Delivery section gains, at that milestone's close, what the bench caught, missed and cost.

## Revisit when

The milestone that first uses the bench closes: then the gate change of option C is decided on its record, for or against.

## Sources

- `docs/design/content-test-layers.md`.
- Runs `full-2026-11-12T19-02-03-994Z` to `full-2026-11-14T01-42-04-072Z`, StGerman/nat20-runs `master` 65c0e7c; analyses in the project files under `engine/m12/runs/`.
- `game/test/campaign-loop.test.ts`; `docs/roadmap.md` § Delivery.
- Decisions 0036, 0043, 0065, 0066, 0073, 0074; decision 0079 (Proposed, table #381).
