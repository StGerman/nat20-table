# 0042. A reply to a hand-off isn't carried

- **Status:** Proposed
- **Date:** 2026-10-27
- **Decided by:** Stas, on a decision card in the party-talk thread (pending)

## Context

Under decision 0040 a line an AI player speaks to a companion takes the round's one hand-off. Table #145 also carried every address the round couldn't answer: its addressee has the floor first in the next round. In the Russian run of 2026-10-27 19:06Z (`analysis.md` F6 next to the run in the project folder) the only carried address was Ilsa's reply to Torva, made in the floor wake Torva's own line had handed her. Had the next round been talk, Torva would have opened it to answer a line that closed the exchange. Two players who keep speaking to each other can trade lines this way round after round, taking two of the round's three floor wakes each time, until one stops using `to` or a fight starts. Every line still reaches its addressee's brief whether it is carried or not.

## Options

### A. Carry every missed address (table #145)
- Pro: nothing said to a companion goes unanswered for long.
- Con: an exchange between two players never ends by itself; each reply opens the next round.

### B. Carry, except a reply back to the line that handed the speaker the floor
- Pro: the exchange ends with the reply, while a request made after the hand-off to anyone else still gets its answer next round.
- Con: a reply that asks something new of the one who handed off waits until that player is woken for another reason.

### C. Never carry a missed address
- Pro: the simplest rule; at most one floor wake a round goes to addresses.
- Con: a request made after the hand-off, or in a granted action, waits until its addressee is woken for another reason.

## Decision

B, as recommended on the card (pending Stas's choice). A line back to the companion whose line handed its speaker the floor reaches that companion's brief but neither hands off nor is carried; every other missed address is carried as before.

## Consequences

- `answersHandOff()` in `game/src/table/floor.ts` tells a reply back; the talk round in `game/src/table/loop.ts` hears it in the brief only.
- The exchange A to B, B to A ends inside one round. A floor wake opened by a carry isn't a hand-off, so its speaker's line back can still take the round's hand-off; the reply to that hand-off then ends it.
- Decision 0040's carry of every missed address is superseded in this one case.

## Revisit when

A run report shows a reply back that asks a new question going unanswered, or players who keep trading lines with `to` across rounds anyway.

## Sources

- [`docs/design/party-talk.md`](../design/party-talk.md) §4.4
- [0040](0040-every-address-hands-off.md)
- `analysis.md` F6, next to the run `scene-2026-10-27T19-06-55-414Z` in the project folder
