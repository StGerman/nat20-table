# 0080. Content is tested in layers before the exit pair; the pair's rules wait for the record

- **Status:** Proposed
- **Date:** 2026-11-14
- **Decided by:** not decided; drafted for Stas from his ask of 2026-11-14 06:55Z (testing thread)

## Context

A card, a DM prompt line and a player prompt line are first tested by a whole playthrough. Milestone 11 played three exit pairs to pass one (35.45 USD, 1.09 h of Stas in two evenings). Milestone 12 has played ten runs and three exit pairs, passed none, and cost 44.29 USD and 3.09 h of Stas in three evenings by 2026-11-14.

What the failed runs found (`docs/design/content-test-layers.md` §1):

- M11 pair 1, both halves: no arrival card could be met. A scripted walk of the contract shows it with no model.
- M12 runs 14:15 and 15:33: AI players never call `own_move` (0 of 28 card wakes each). The card wakes alone show it.
- M12 run 16:05, Stas's evening: his real plan came between cards, where no own move exists. Only a person at the seat finds that.
- M12 run 01:42, Stas's evening: one card has no failure the design allows for his plan, another no choice his plan could land on. A rule over the deck JSON does not find either as the data stands.

So lower layers would have caught, for certain, 24.34 USD of runs and one 39-minute evening, and neither of Stas's two failed M12 exit evenings. The constraint is Stas's hours and the subscription's limits (0065).

## Options

### A. Keep the exit pair as the only content gate
- Pro: nothing to build; the pair tests the real thing.
- Con: structural holes and agent rates keep costing full runs; M11 pair 1 cost Stas an evening a script would have saved.

### B. Layers before the pair, in shadow for one milestone; the pair's rules unchanged
- Deck lint and a scripted contract walk in CI; a DM bench with a plan fuzz, and a seat bench, as one command Stas runs before the all-AI run. A full-run failure becomes a case at the layer that should have seen it, when that layer exists. The milestone's close records what each layer caught, missed and cost.
- Pro: no accepted rule changes; no full run is spent on what a script or thirty model calls can show; the DM bench starts from Stas's own 13 recorded lines; the record it produces is what a later gate change needs.
- Con: 4 to 5 PRs into a queue of about 20 open ones; no dollar saving (a bench pass costs about what an all-AI run costs, unmeasured); it does not promise Stas fewer evenings; the plan fuzz, the one tool aimed at what cost him two evenings, is unproven.

### C. B, and the gates change now: Stas plays once at milestone close, a fix covered by a lower-layer case does not replay the pair
- Pro: the bold version; if the layers catch what they claim, three evenings become one.
- Con: the record does not support it: both failed M12 evenings failed on things no built layer would have caught, so under C they would have been replayed anyway; it supersedes 0043's one commit and the scopes' "both runs again" on a promise.

## Decision

Proposed: B. It beats A on M11 pair 1 and the two M12 runs alone. It beats C because C changes accepted rules on evidence that does not exist yet; B produces that evidence in one milestone. Design: `docs/design/content-test-layers.md`.

## Consequences

- Every exit row in a milestone's design doc names its lowest layer, or "a person".
- New warnings in the deck validator, a contract walk in CI, and a bench command; rows only after Stas accepts. Each lint rule starts as a warning and becomes an error only after Stas has ruled its first hits.
- Decisions 0036, 0043, 0065 and 0074 and the milestone scopes are not changed. Benches run on Stas's Mac (0036); a bench from a cloud thread would need 0036 revisited in its own record.
- `docs/roadmap.md`'s Delivery section gains, at the shadow milestone's close, what each layer caught, missed and cost.

## Revisit when

The shadow milestone closes: then the gate change of option C is decided on its record, for or against.

## Sources

- `docs/design/content-test-layers.md`.
- Runs `full-2026-11-12T19-02-03-994Z` to `full-2026-11-14T01-42-04-072Z`, StGerman/nat20-runs `master` 65c0e7c; analyses in the project files under `engine/m12/runs/`.
- `docs/roadmap.md` § Delivery; decisions 0036, 0043, 0065, 0073, 0074.
