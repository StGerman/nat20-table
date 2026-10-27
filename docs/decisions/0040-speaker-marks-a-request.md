# 0040. The speaker marks a request or a proposal with `asks` on `say`

- **Status:** Proposed
- **Date:** 2026-10-27
- **Decided by:** Claude, in table #139 (AGT-33), for Stas's review there

## Context

Party talk §4.4 (decision 0039) lets an AI player speak to a companion with an optional `to` on `say`. Out of combat, Stas's pick gives the addressee the floor next only for a request or a proposal, not for a remark or an opinion. The design says the four forms aren't a field and that the model reads them from the words, but the loop has to know, before the next wake, whether a line wants an answer. Each extra floor wake costs about 5.7 s and $0.03, and the round holds at most three.

## Options

### A. The speaker marks it: `asks` on `say`
- Pro: exact, and it costs nothing: the speaking model knows what it means. One boolean, the "Expects an answer?" column of §4.4's table.
- Pro: the four forms stay unlabelled, as the design wants; only the bit the loop acts on is marked.
- Con: a model may forget `asks` on a real request, so the addressee hears it only in its next brief, or set it on a remark, which costs one floor wake inside the bound.

### B. The loop reads it from the text
- Pro: no new tool field.
- Con: a question mark or an imperative is a weak signal, weaker still in Russian, where the table plays: «Ильса, ты слышишь?» is a question but not a request, and «Держи фонарь» has no mark at all. The DM-address rule (party talk §4.2.1) already shows how much such a rule needs.

### C. Every `to` hands off
- Pro: the simplest rule.
- Con: it goes against Stas's pick (only requests and proposals earn a word), and every remark costs a floor wake.

## Decision

A. The speaker sets `asks` for a request or a proposal. It beats B because the model that wrote the line already knows its purpose, and it beats C because it keeps Stas's rule.

## Consequences

- `say` takes `to` and `asks` (`game/src/agents/player.ts`); neither touches the engine contract.
- `handOff()` in `game/src/table/floor.ts` acts on `asks`; a line to a companion whose hand is up moves it first whatever `asks` says.
- The report's address line counts lines spoken to a companion by pair. It doesn't count `asks`, which goal 6 can read from the transcript if it needs to.

## Revisit when

A run transcript shows requests sent without `asks` (unanswered "Spoken to you" lines), or remarks with it that waste floor wakes, often enough to move goal 6.

## Sources

- [`docs/design/party-talk.md`](../design/party-talk.md) §4.4
- [0039](0039-party-talk-hand-raise-floor.md)
- table #139
