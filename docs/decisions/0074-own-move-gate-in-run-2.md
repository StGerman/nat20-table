# 0074. The own-move gate is Stas's run

- **Status:** Accepted
- **Date:** 2026-11-13
- **Decided by:** Stas (decision card in the run 1 analysis thread, 2026-11-13 15:57Z: «Гейт в run 2»)
- **Supersedes:** answer 1 of `docs/scope/not-a-passenger-scope.md` §9 ("The AI half also decides a card by an own move: yes") and the clause "In run 1 too, by an AI player" of its §4 item 2; the rest of the scope stands.

## Context

Run 1 of the Milestone 12 exit pair (all AI, *Fair in Wend*) gated on an AI player deciding a card by an own move. Two runs on the exit build line put 0 own moves on a card: 0 of 28 card wakes each, every seat shown the invite on every card.

- 2026-11-13 14:15Z, build 970023d, Bren asked first: Bren's vote was the majority on 7 of 7 cards.
- 2026-11-13 15:33Z, build 162de4c, Torva asked first with a new Temperament line (table #373): 0 again. Torva was outvoted twice; Bren, Maren and Ilsa never split in 14 cards.

The AI players put their own idea in the line they say beside a written vote ("the boy gets my bread", "get the warden's chalk mark") instead of calling `own_move`. Two prompt changes (table #364, table #373) did not move it. Each rerun costs about 9 USD and Stas's time to run it, and the scope's own failure rule (§4) blocks Stas's run until run 1 passes.

## Options

### A. One more prompt line and run 1 again
- Pro: keeps the scope as written; the line aims at the failure seen ("a choice plus your own condition is an own move").
- Con: a third prompt fix with no evidence it moves Sonnet; another rerun and another evening if it does not.

### B. The gate moves to run 2
- Pro: the milestone is about the human not being a passenger; run 2 tests exactly that, with Stas's words at the seat. Run 1 stops failing on agent temperament.
- Con: the live DM's own-move path (`card_words`, the SRD DC check, the engine's roll) is first proven with Stas at the table. If it breaks there, scope §4 means a fix and both runs again.

### C. Change the order in which the seats are asked
- Pro: no prompt change.
- Con: the order already changed between the two runs and the count stayed 0.

## Decision

B. Run 2's own move by Stas is the gate. In run 1 an AI player's own move is reported, not gated.

## Consequences

- Scope §4 item 2 and §9 answer 1 say so (this PR).
- Run 1 on 162de4c (`full-2026-11-13T15-33-03-495Z`) is ruled with its `m12-own-move` row read as reported. The report code on the exit build is not changed, so the pair stays on one build (0043); Stas records the reading with the run's verdict.
- The live own-move path is unproven before Stas sits down. Its CI fixtures and loop tests stand; the first live roll is his.
- AI own moves stay in every run's report, so a later fix to the AI players can be measured.

## Revisit when

Stas's own move in run 2 fails on the DM or engine side, or a later milestone needs AI players to act off the card on their own.

## Sources

- Run analyses: project files `engine/m12/runs/full-2026-11-13T14-15-37-051Z/analysis.md`, `engine/m12/runs/full-2026-11-13T15-33-03-495Z/analysis.md`.
- Runs: StGerman/nat20-runs `runs/full-2026-11-13T14-15-37-051Z`, `runs/full-2026-11-13T15-33-03-495Z`.
- Scope `docs/scope/not-a-passenger-scope.md` §4, §9; decision 0043.
