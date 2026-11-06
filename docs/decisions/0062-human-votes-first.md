# 0062. The human gives their word on a road card first

- **Status:** Proposed (accepted when Stas merges table: AGT-87)
- **Date:** 2026-11-06
- **Decided by:** Stas, in the post-M9 hygiene thread, 2026-11-06 16:10Z ("always ask the human first, so the player can sway the others; asked last, the decision is mostly made already"). It supersedes the "asked last" sentence of [0058](0058-human-plays-hired-blade.md) only; the rest of 0058 stands.

## Context

Decision 0058 (card kinds) says: "While a human is at the table no card resolves without them; the human seat is asked last, in plain words, and Enter goes with the others." The game loop (AGT-80) does that: each AI Blade gives its word, then the human. In a party of one human and two or three AI Blades, a majority is usually there before the human speaks, so on a Blade card the human's vote rarely changes anything, and their reasons never reach the AI players at all.

The engine sets no order: `waiting_for` lists the seats, and the game loop chooses whom to ask first. AI players already hear what was said before them ("Said so far" in their card briefing, and table speech).

## Options

### A. The human is asked first as a Blade; an owner still calls last
- Pro: the human's word and reasons reach every AI Blade before they vote, so the human can sway the vote: the play experience Stas asked for.
- Pro: it is a game loop change only; no contract or engine change.
- Con: Enter can't mean "go with the others" when nobody has spoken; it takes the first choice instead.
- Con: AI players may follow the human more often, so a card's outcome leans to the human's taste.

### B. Keep the human last (0058 as written)
- Pro: the human sees what everyone thinks before choosing.
- Con: the vote is mostly decided before the human speaks.

### C. Ask the human in a random place in the order
- Pro: no fixed advantage either way.
- Con: hard to explain to a first-time player, and half the time it is B.

## Decision

A. As a Hired Blade the human gives their word first. A human who owns the caravan still makes the call last, after the Blades' advice, because the owner's call is meant to weigh that advice (0058 S2). With nobody spoken yet, Enter takes the first choice.

## Consequences

- `game/src/table/loop.ts` `cardRound` asks the human before the AI loop; `humanCard` words the Enter help to match; the input prompt says "Enter for the marked choice".
- `docs/design/m9-system-design.md` "The human seat" is updated; `docs/scope/living-world-scope.md` still points at 0058, which this record supersedes in part.
- TASKS.md AGT-87.

## Revisit when

A judged run shows the AI Blades only echo the human's word (no real vote left), or a first-time player at the table finds speaking first harder than following the others.

## Sources

- The post-M9 hygiene thread, Stas, 2026-11-06 16:10Z.
- table #296 (AGT-87).
