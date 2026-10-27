# 0040. Every address to a companion hands it the floor

- **Status:** Accepted (its carry of a reply to the line that handed its speaker the floor superseded by [0042](0042-reply-to-a-hand-off-is-not-carried.md): that reply reaches the brief only)
- **Date:** 2026-10-27
- **Decided by:** Stas, on a decision card in the party-talk thread, after table #139 shipped option A as a proposal

## Context

Party talk §4.4 (decision 0039) lets an AI player speak to a companion with an optional `to` on `say`. Out of combat the addressee may get the floor next in the same round, at most once a round (the hand-off) and inside the round's bound of three floor wakes. The design first gave the hand-off only to a request or a proposal, not to a remark or an opinion, but it didn't say how the loop tells them apart; table #139 filled that gap with option A. A floor wake costs about 5.7 s and $0.03, and since there is one hand-off a round, the options differ by at most one wake a round. In the exit run of 2026-10-27 the AI players answered each other 0 times.

## Options

### A. The speaker marks a request or a proposal: `asks` on `say`
- Pro: no wake for a remark that wants no answer, so the round's slot stays free for a raised hand.
- Con: one more field the model must set right; a request without `asks` goes unanswered until the addressee's next brief.

### B. The loop reads the form from the text
- Pro: no new field.
- Con: a question mark or an imperative is a weak signal, weaker in Russian: «Ильса, ты слышишь?» is a question but not a request, and «Держи фонарь» has no mark at all.

### C. Every address hands off
- Pro: the simplest rule and no failure mode: whoever is spoken to gets the chance to answer, which is what party talk is for.
- Con: at most one extra floor wake a round that has an address, some of them ending in PASS or a filler line, and the hand-off can take a slot a raised hand would have used.

## Decision

C. Any `say` with `to` an AI player takes the round's hand-off, whatever its form. `asks` is gone. Stas chose replies over the saved wake: the addressee decides whether a remark gets an answer, and may stay silent.

## Consequences

- `say` takes `text` and `to` only (`game/src/agents/player.ts`); `Address` in `game/src/table/floor.ts` has no `asks`, and `handOff()` hands off on the round's first address.
- An address the round can't answer (after the hand-off, past the bound, made in a granted action) is carried: its addressee has the floor first next round. A fight drops it.
- The prompt asks for `to` only when a line is meant for one companion; a line for the whole party has none.
- Goal 6 (party talk §2) still counts requests and proposals from the transcript, by reading the words.

## Revisit when

A run report shows hand-off wakes mostly ending in PASS, or raised hands lapsing because a remark took the slot, often enough to cost the silence or latency targets. Option A is then a small change back.

## Sources

- [`docs/design/party-talk.md`](../design/party-talk.md) §4.4
- [0039](0039-party-talk-hand-raise-floor.md)
- table #139 (option A, merged 2026-10-27) and the PR that replaces it with C
