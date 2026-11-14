# 0080. Content is tested in layers; a full run confirms, it does not discover

- **Status:** Proposed
- **Date:** 2026-11-14
- **Decided by:** not decided; drafted for Stas from his ask of 2026-11-14 06:55Z (testing thread)
- **Would supersede:** in [0043](0043-demo-acceptance-two-runs.md), "on the same commit" for a fix that a lower-layer case covers; and the rule "a fail in run 2 means a fix and both runs again" in the scopes that state it (`docs/scope/not-a-passenger-scope.md` §4, `docs/scope/dramaturg-mechanism-scope.md`), from the milestone Stas names. 0043's audit, leak scan, narration check and retry rule stand. The all-AI half first (0065) stands.

## Context

A card, a DM prompt line and a player prompt line are first tested by a whole playthrough. Milestone 11 played three exit pairs to pass one (35.45 USD, 1.09 h of Stas in two evenings). Milestone 12 has played ten runs and three exit pairs, passed none, and cost 44.29 USD and 3.09 h of Stas in three evenings by 2026-11-14. Its own-move row failed four times, each found only after a full run:

- runs 14:15 and 15:33: AI players never call `own_move` (0 of 28 card wakes each). The card wakes alone would have shown it.
- run 16:05: Stas's real plan came between cards, where no own move exists. Only a person at the seat finds that.
- run 01:42: one card has no failure the design allows, which a rule over the deck JSON finds only if choices carry a mark nobody had written; another has no choice Stas's plan could land on, which needed his plan.

The constraint is Stas's hours and the subscription's limits (0065), and a full run spends both.

## Options

### A. Keep the exit pair as the only content gate
- Pro: nothing to build; the pair tests the real thing.
- Con: every structural hole costs a run and often an evening of Stas; M12 is the record.

### B. Layers below the run, the pair's rules unchanged
- Pro: defects are found sooner; no accepted rule changes.
- Con: a fix after Stas's run still means both runs again, so his evenings are saved only when the layers catch everything.

### C. Layers below the run, and the run only confirms
- Deck lint and a scripted contract walk in CI; a DM bench and a seat bench on demand (one card, one state, one line, the live model); one all-AI confirming run; one evening of Stas at milestone close. Every full-run failure becomes a lower-layer case before any rerun, except a row only a person can rule. A fix that a lower-layer case covers does not void the runs already played.
- Pro: Stas plays one evening a milestone instead of one for every pair attempt; a bench answers in minutes with nobody at the seat; the golden set starts from his own 13 recorded lines.
- Con: 5 to 6 PRs into a queue of about 20 open ones before it pays; no dollar saving (about 47 to 100 USD a milestone, unmeasured, against 35.45 and 44.29); of the six failed runs in the design's §1 the layers would have caught four, and neither of Stas's failed M12 evenings; nothing saved on a milestone whose first pair would have passed; benches are live calls, so Stas runs them on his Mac (0036); one commit stops being absolute, so a fix can ride on a bench that missed something; two of M12's findings needed a person, so the one evening can still fail.

### D. C without Stas's evening as a gate
- Pro: cheapest in his hours.
- Con: no layer rules whether it is a game; friends-and-family testing would be the first human filter.

## Decision

Proposed: C. It beats B because B keeps the rule that spent Stas's second and third M12 evenings: any fix replays him. It beats D because readability and "is it a game" have no lower layer. Design: `docs/design/content-test-layers.md`.

## Consequences

- Every exit row in a milestone's design doc names its lowest layer; a row gates on a full run only when no lower layer can see it.
- A layer joins a gate only after a shadow milestone: it reports beside the exit pair under today's rules and has caught a defect a full run also showed, or caught it first (Yan's amendment). Each deck-lint rule starts as a report and turns red in CI only after Stas has ruled its first hits.
- New commands and CI steps (deck lint, contract walk, `bench:dm`, `bench:seat`); rows only after Stas accepts.
- CLAUDE.md gains a short section on the layers, and `docs/roadmap.md`'s Delivery columns gain bench passes and their cost, with the accepting PR.
- Decision 0036 is not changed here: benches run on Stas's Mac. A bench from a cloud thread would need 0036 revisited in its own record.

## Revisit when

A milestone closes with every layer green and Stas's evening still finds a mechanics defect twice: the benches are not seeing what they claim to.

## Sources

- `docs/design/content-test-layers.md`.
- Runs `full-2026-11-12T19-02-03-994Z` to `full-2026-11-14T01-42-04-072Z`, StGerman/nat20-runs `master` 65c0e7c; analyses in the project files under `engine/m12/runs/`.
- `docs/roadmap.md` § Delivery; decisions 0036, 0043, 0065, 0073, 0074.
