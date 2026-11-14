# 0080. A live bench before the exit pair; the pair's rules wait for the record

- **Status:** Proposed
- **Date:** 2026-11-14
- **Decided by:** not decided; drafted for Stas from his ask of 2026-11-14 06:55Z (testing thread)

## Context

Structure is already tested with no model: seeded contract fixtures, and scripted walks of whole contracts in `game/test/campaign-loop.test.ts` that assert the verdict rows; M11's structural exit failures became tests there. What a live model decides is not: how the DM reads a player's words, whether AI players use a tool, whether a card can hold a person's plan are first tested by a full run and its analysis thread.

Milestone 12 has played ten runs and three exit pairs, passed none, and cost 44.29 USD and 3.09 h of Stas at the table (wall time) by 2026-11-14 (`docs/design/content-test-layers.md` §2):

- runs 14:15 and 15:33: AI players never call `own_move` (0 of 28 card wakes each); 0074 has since made that row reported.
- run 15:26: void, played on a stale checkout with local changes.
- run 16:05, Stas's evening: his real plan came between cards, where no own move exists. Only a person at the seat finds that.
- run 01:42, Stas's evening: one card has no failure the design allows for his plan, another no choice his plan could land on.

The constraint is Stas's hours and the subscription's limits (0065).

## Options

### A. Keep the full run as the first test of live behaviour
- Pro: nothing to build; the pair tests the real thing.
- Con: a misread player line or a card that cannot hold a plan is first seen in a run and its analysis thread, often in Stas's evening.

### B. A live bench before the pair; the pair's rules unchanged

An exit run refuses a dirty checkout. A DM bench (one card, one player line, the live DM, checked on its tool calls) with a plan fuzz, as one command on Stas's Mac before the all-AI run, reported for one milestone. A full-run failure is added as a case at the lowest layer that can see it, in the fix's PR. The milestone's close records what the bench caught, missed and cost.

- Pro: no accepted rule changes; the DM's reading is tested on one card in minutes; the bench starts from Stas's own 13 recorded lines; the record is what a later gate change needs.
- Con: 2 to 3 PRs into a queue of about 20 open ones; no dollar saving; for certain it would have saved one run on record (the void 15:26, 8.83 USD) and no evening; the plan fuzz, the one tool aimed at what cost Stas the 01:42 evening, is unproven.

### C. B, and the gates change now: Stas plays once at milestone close, a fix covered by a bench case does not replay the pair
- Pro: the bold version; if the bench catches what it claims, three evenings become one.
- Con: the record does not support it: nothing proposed catches what failed run 16:05, and only the unproven fuzz is aimed at what failed run 01:42, so under C both evenings would have been replayed anyway; it supersedes 0043's one commit and the scopes' "both runs again" on a promise.

## Decision

Proposed: B. It beats A because it is the only proposed way to test a player's line against the live DM without a full run. It beats C because C changes accepted rules on evidence that does not exist yet; B produces that evidence in one milestone. Design: `docs/design/content-test-layers.md`.

## Consequences

- From the first milestone design written after acceptance, every exit row names the lowest layer that tests it, or "a person". The M12 and M13 designs are not amended.
- The exit profiles refuse a dirty checkout; a bench command is added; rows only after Stas accepts.
- Decisions 0036, 0043, 0065, 0066 and 0074 and the milestone scopes are not changed. The bench runs on Stas's Mac, by his hand or through a Remote Control session he approves (0036); a bench on a cloud API key would need 0036 revisited in its own record.
- `docs/roadmap.md`'s Delivery section gains, at that milestone's close, what the bench caught, missed and cost.

## Revisit when

The milestone that first runs the bench closes: then the gate change of option C is decided on its record, for or against.

## Sources

- `docs/design/content-test-layers.md`.
- Runs `full-2026-11-12T19-02-03-994Z` to `full-2026-11-14T01-42-04-072Z`, StGerman/nat20-runs `master` 65c0e7c; analyses in the project files under `engine/m12/runs/`.
- `game/test/campaign-loop.test.ts`; `docs/roadmap.md` § Delivery.
- Decisions 0036, 0043, 0065, 0066, 0073, 0074; decision 0079 (Proposed, table #381); `docs/scope/not-a-passenger-scope.md` §4.
