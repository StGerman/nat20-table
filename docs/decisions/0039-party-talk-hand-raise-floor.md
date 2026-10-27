# 0039. Party talk: each AI player raises its hand, and speakers take the floor in turn

- **Status:** Accepted
- **Date:** 2026-10-27
- **Decided by:** Stas, on decision cards in the party-talk design thread (the hand-raise floor; the first block of Milestone 7)

## Context

Out of combat the game loop wakes every AI player at once and holds their lines until all have answered, so none of them hears the others before it speaks. In the exit run of 2026-10-27 the three AI players spoke 11 times in 12 slots and answered each other 0 times. The scope asks AI players to "join conversation without talking over the human". Stas asked for players who hear each other, who can stay silent, and who choose from their character's role and values.

Players can only hear each other if their wakes run in sequence. A `declare` wake costs p50 5.7 s and about $0.03 today, so every sequential wake adds to the round. The design is in [`docs/design/party-talk.md`](../design/party-talk.md).

## Options

### A. Everyone in turn
- Pro: the simplest code.
- Con: about 17 s every round, even when nobody has anything to say.

### B. Two parallel passes
- Pro: the second pass hears the first.
- Con: twice the wakes, and the second pass still talks in chorus.

### C. The loop picks the speakers by a timer (named player first, then the longest silent)
- Pro: the cheapest sequential design, at most two wakes.
- Con: the timer makes a character speak when it has nothing to say, and can't tell speaking from acting without a word (Stas rejected it).

### H. Each player raises its hand
- Pro: the character decides, from its own card, its values and its private notes.
- Pro: silence costs one short wake that reads from cache.
- Con: a short wake per player per round on top of the speakers.
- Con: a hand goes up before the player has heard the others; the player may still pass when its turn comes.

### R. A director model picks the speakers
- Pro: one small call, faster and cheaper than H.
- Con: a bystander decides for the character, and it can't read the players' private notes, which it must never see.

## Decision

H. The named player answers first; every other AI player answers a short wake with speak, act silently, both, or pass; speakers then take the floor one at a time, each hearing everything said before it, within a bound of three floor wakes a round. H is the only option where the character itself decides, which is what Stas asked for, at a cost close to today's.

The work is the first block of Milestone 7, before the timed playthroughs, because it changes the round length those runs measure.

## Consequences

- `game/src/table/loop.ts` replaces the parallel declaration round with the hand-raise round; lines reach the table as they are spoken.
- Player agents get a `hand` wake and an optional `to` on `say`. Neither touches the engine contract.
- The scenario cards get an "At the table" section: when the character speaks, acts silently, stays silent, and addresses its companions.
- The run report measures speakers per round, the silent share, the time to the first line and the round's wall time.
- Rows AGT-31 to AGT-34 in `TASKS.md`.

## Revisit when

- Runs show hands misjudged: named players not answering, or more than one round in ten where a character spoke with nothing to add. R (a director) then comes back as a cheaper pre-filter.
- A front end beyond the terminal (the North Star) needs turn-taking that runs without a human line to start each round.

## Sources

- [`docs/design/party-talk.md`](../design/party-talk.md).
- The exit-run transcript Stas pasted in the project chat, 2026-10-27; `usage.jsonl` of the Scene 3 run of 2026-10-27.
- `docs/scope/demo-run-scope.md`, AI players, Behaviour.
