# 0042. In a fight, every AI player who may react is woken, and the first line shows at once

- **Status:** Accepted
- **Date:** 2026-10-27
- **Decided by:** Stas, on the R1 spec in the party-talk thread (its D1 and D2), after including AGT-34 in Milestone 7

## Context

Party talk goal 4 asks for about one AI line every two fight rounds. With R0 alone (a line on the player's own turn) the Russian run of 2026-10-27 gave one line in six rounds: when an ally drops on a goblin's turn, nobody says a word until somebody's next turn. R1 (party talk §5) wakes AI players who aren't acting for one line or a pass when something salient happens, and the fight never waits for it. Two things were left open: who gets the wake, and when the line shows. A reaction wake costs about $0.02–0.03 and is off the turn path. Decision 0041 holds engine lines on the table screen until the DM narrates them; speech is not held.

## Options

### D1, who gets the wake

#### A. The loop picks one
The player the trigger happened to (hit, or back up), else the first eligible player in seat order, turned each round.
- Pro: one wake a trigger, the cheapest.
- Con: a bystander rule picks the speaker, not the character; the picked player may pass, so many triggers give no line.

#### B. Every eligible player is woken, and the first line is heard
- Pro: each character decides from its own card, as in the hand-raise (decision 0039); the likeliest to reach goal 4.
- Con: one wake per eligible player per trigger; the fastest model, not the most moved character, can win.

### D2, when the line shows

#### A. After the DM's narration of its trigger
- Pro: keeps 0041's reading order: the table hears what happened, then the reaction.
- Con: a line not ready by the next narration is lost.

#### B. The moment it is ready
- Pro: no line is lost to the narration.
- Con: the human can read «Марен! Держись!» before the DM says that Maren fell.

## Decision

D1 B and D2 B. Every AI player who may react gets the wake at once, the first `say` is heard, and the others' lines are refused and their wakes cancelled. The line shows as soon as it arrives: it is speech, not an engine line, so 0041's hold doesn't apply. Stas chose the character's own choice and no lost lines over the cost and the reading order.

## Consequences

- `game/src/table/reactions.ts` picks a batch's trigger and who may react; `TableLoop.startReactions` wakes them; `BarkTools` and `ReactionFloor` (`game/src/table/tools.ts`) let only the first line through.
- A session can now have a wake the loop no longer wants: `AgentSession.cancel()` interrupts it the way a turn timeout does (`TurnCancelled`), and any other wake of that player waits for its reaction at most 5 s first.
- A refused reaction line is dropped, not retried (`TableState.speak` with `once`), so a reaction never costs a retry.
- Scripted players react only with a `bark` policy, so scripted runs and the game fixtures play as before.
- The run report adds fight talk per round and the reaction counts; M7 reads goal 4 from them.

## Revisit when

A run report shows one character winning nearly every reaction, reactions costing more than a few percent of a run's plan usage, or a playtester confused by a reaction that comes before its narration. D1 A or D2 A is then a small change in `startReactions`.

## Sources

- [`docs/design/party-talk.md`](../design/party-talk.md) §5 and §9
- The R1 spec, `party-talk-r1-spec.md` in the project folder (M7)
- [0039](0039-party-talk-hand-raise-floor.md), [0041](0041-engine-lines-wait-for-narration.md)
