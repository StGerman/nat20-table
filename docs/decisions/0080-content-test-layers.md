# 0080. Content is tested in layers; a full run confirms, it does not discover

- **Status:** Proposed
- **Date:** 2026-11-14
- **Decided by:** not decided; drafted for Stas from his ask of 2026-11-14 06:55Z (testing thread)
- **Would supersede:** the consequence of [0043](0043-demo-acceptance-two-runs.md) "a failed run makes a fix and a new commit" with both runs on one commit, as later milestones applied it to every exit pair; and narrow the exit pair of [0065](0065-supply-and-tenders-agent.md). 0043's audit, leak scan, narration check and retry rule stand.

## Context

A card, a DM prompt line and a player prompt line are first tested by a whole playthrough. Milestone 11 played three exit pairs to pass one (35.45 USD, 1.09 h of Stas). Milestone 12 has played ten runs and three exit pairs, passed none, and cost 44.29 USD and 3.09 h of Stas by 2026-11-14. Its own-move row failed four times, each found only after a full run:

- twice because AI players never call `own_move` (0 of 28 card wakes each);
- once because Stas's real plan came between cards, where no own move exists;
- once because a card has no failure the design allows, and another has no choice a plan could land on.

The first needed only the card wakes to show. The second needed a person. Of the third, a rule over the deck JSON finds the first card, and the second needed a plan nobody had written down. The constraint is Stas's hours and the subscription's limits (0065), and a full run spends both.

## Options

### A. Keep the exit pair as the only content gate
- Pro: nothing to build; the pair tests the real thing.
- Con: every structural hole costs a run and, half the time, an evening of Stas; M12 is the record.

### B. Layers below the run, the pair unchanged
- Pro: defects are found sooner; no accepted rule changes.
- Con: a fix after Stas's run still voids both halves, so his hours are saved only when the layers catch everything.

### C. Layers below the run, and the run only confirms
- Deck lint and a scripted contract walk in CI; a DM bench and a seat bench on demand (one card, one state, one line, the live model); one all-AI confirming run; one evening of Stas at milestone close. Every full-run failure becomes a lower-layer case before any rerun. A fix that a lower-layer case covers does not void the runs already played.
- Pro: Stas plays one evening a milestone (0.5 to 2 h) instead of one for every pair attempt (3 evenings and 3.09 h in M12); a bench answers in minutes for about 0.1 USD a case; the golden set starts from his own 13 recorded lines.
- Con: 5 to 6 PRs into a queue of 22 open ones before it pays; no dollar saving (benches cost about what the runs they replace cost); on a milestone that would have passed its first pair, nothing is saved; benches are live calls, so by 0036 Stas runs them on his Mac; "same build" stops being absolute, so a fix can ride on a bench that missed something; two of M12's findings needed a person, so one evening can still fail.

### D. C without Stas's evening as a gate
- Pro: cheapest.
- Con: no layer rules whether it is a game; friends-and-family testing would be the first human filter.

## Decision

Proposed: C. Design: `docs/design/content-test-layers.md`.

## Consequences

- A layer joins a gate only after a backtest: it catches a recorded M11 or M12 failure on the build that had it (Yan's amendment). This holds for L3 too.
- Decision 0036 stands: benches run on Stas's Mac. A cloud bench would need its own record superseding 0036.

- Every exit row in a milestone's design doc names its lowest layer; a row gates on a full run only when no lower layer can see it.
- New commands and CI steps (deck lint, contract walk, `bench:dm`, `bench:seat`); rows only after Stas accepts.
- CLAUDE.md's acceptance wording and `docs/roadmap.md`'s Delivery columns (bench passes and their cost beside exit pairs) change with the accepting PR.

## Revisit when

A milestone closes with every layer green and Stas's evening still finds a mechanics defect twice: the benches are not seeing what they claim to.

## Sources

- `docs/design/content-test-layers.md`.
- Runs `full-2026-11-12T19-02-03-994Z` to `full-2026-11-14T01-42-04-072Z`, StGerman/nat20-runs `master` 65c0e7c; analyses in the project files under `engine/m12/runs/`.
- `docs/roadmap.md` § Delivery; decisions 0043, 0065, 0073, 0074.
