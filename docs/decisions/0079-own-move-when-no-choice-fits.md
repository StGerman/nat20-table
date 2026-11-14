# 0079. An own move may name no failure choice; words no choice fits are answered and nothing more

- **Status:** Proposed
- **Date:** 2026-11-14
- **Decided by:** pending. Stas chose the direction after exit run 2 (2026-11-14 02:23Z: «поправить дизайн через Льва»); the shape below is Lev's proposal (`docs/design/m12-own-move-amendment.md`). It refines decision 0068 and does not replace it.

## Context

Exit run 2 of Milestone 12 (`full-2026-11-14T01-42-04-072Z`, build ecd1f9e, Stas as Bren): 9 times he answered a card in his own words, and no own move reached a card. Seven were questions or jokes, and an answer in the scene was right. Two were plans:

1. `bog_wifes_toll`, «Дать хлеб ворону НО не ведьме!». The success is `bread`. Nothing can take the failure: `walk_past` breaks a custom (the engine refuses it) and `true_word` is an act the words did not ask for (the prompt forbids it). 0068 wants two different choices, so the card can hold no own move for these words.
2. `salt_on_credit`, «Предложить пойти дальше с вами и парня с собой забрать». No choice is "take them along", so there is no success either. The DM told the woman's refusal as a fact, with no roll, and kept it with `remember`.

Counted over the 44 cards in the decks today: the engine's rule alone (a failure may not break a custom, and must differ from the success) leaves one card with a success that has no legal failure, `peddler`. The prompt's rule (no deliberate act the words did not ask for) is judged against the words each time; in this run it closed one card of the two that got a plan.

A success gives the party nothing a number would not: the named choice runs in full either way (0068). What the roll decides is whether the deed is done the player's way.

## Options

### A. The failure choice is optional; with none, a failed roll leaves the card waiting (proposed)
The move names a check and a success choice. If the vote goes to it and the roll fails, no choice runs, the card stays on the table for a written choice, and the move is spent.
- Pro: the bog-wife's card takes the move; a failed roll never acts for the player, by structure and not by prompt; moves that name a failure keep their teeth and their fixtures.
- Con: the card's decision is no longer final at the vote for such a move: the server rolls before it logs `card_resolved`. A failed attempt costs only the move.

### B. No failure choice, ever: every failed own move leaves the card waiting
- Pro: one rule; `bad_own_move` and the "deliberate act" line in the prompt go away.
- Con: it removes the cost where a choice honestly is what a failure brings (the toll is paid after all); it re-records the accepted fixture and rewrites more of 0068 than the run asks for.

### C. Roll at once from the table, with `request_check`, and give the proposer's word to the success choice
- Pro: no contract change.
- Con: the table never votes on the move (0068, option A), and the engine writes no deed. After a failure the same seat can press the same number, but that is true of A as well (below).

### D. A failed roll with no failure choice settles the card with no effects
- Pro: the card's decision stays final at the vote.
- Con: a free way off a card whose every choice costs something. On `bog_wifes_toll` it is walking past without the broken custom and without `snubbed_sedge`.

### E. Fix the cards: give each one a choice that can take a failure
- Pro: no mechanism changes.
- Con: content on every card a plan can hit, in this pack and the next; it does nothing for words no choice fits.

### The deed for a tried move (within A)
- The same deed, `own_move_<card>` (proposed): 0068 says the deed carries no result, so "the party made an own move on this card" is as true of a failed one. No new id, no validator change, no new owed row on Zoya's board.
- A second deed, `own_move_tried_<card>`: con, a second id that nothing reads in Milestone 12, when the first already waits for a reader.

### Words no choice fits (the `salt_on_credit` case)
- The DM answers the words and nothing more (proposed): nobody in the scene agrees, refuses or gives way, and no outcome goes into `remember`. Con: an honest plan gets an answer that settles nothing.
- The DM rules it in the scene, as in run 2: con, the narrator decides an outcome the engine never rolled, and its memory carries that through the rest of the run.
- The table says in plain words that this card cannot carry the plan: con, the DM would have to label its own answer, and a first-time player may read the line as "you typed it wrong". Left out; see Revisit.

### What A buys, honestly
Under A a fall can still end on the success choice by its number (on `bog_wifes_toll`: `bread`), so the end on the card is the same as C's. What A buys over C is the table's vote on the player's words and the deed in the engine's book; what it costs is a contract version, a card that stays pending across the roll, words taken back and a re-ask. Zoya (amendment §16): both ends equal a written choice until a reader can tell a fall from a success, which is question 1.

## Decision

A, with the same deed, and answers only for words no choice fits. A failed roll with no failure choice costs the move and nothing else, on purpose: a success gives nothing a number would not, so a failure takes nothing a number would not.

## Consequences

- One more contract version in dev (dev.72 if it lands first): `own_move.failure` becomes optional; `own_move_ran.choice` is `null` when no choice ran; for such a move `card_resolved` is logged after the roll and only on a success. A move that names a failure behaves and replays as before.
- 0068's sentences "the success and failure choices must be two different choices" and "a failure decides the card" now hold only for a move that names a failure. One own move per card stays, tried or not.
- The DM prompt's `card_words` rule and the `remember` tool's description change; no code can test what a narration rules, so the run report lists every answer that made no move, with the words and any fact the DM kept in that wake.
- Exit row 2 as the scope words it ("a card decided by Stas's own move") does not count a move that failed and left the card waiting; whether it should is question 2 of the amendment.
- The seat gains one line, shown when an own move fails and the card waits.

## Revisit when

- An exit run shows the DM leaving the failure out where a choice plainly is what failing brings, in more than half of the own moves made: then B's simplicity is being paid for anyway, and B is the honest rule.
- The report's list shows a plan no choice could carry on two runs in a row: then the plain table line, or a card change, is due.
- The dramaturg mechanism wants a reader that tells a tried move from a successful one: then the deed needs the result in it, which 0068 already lists.

## Sources

- `docs/design/m12-own-move-amendment.md` (the amendment); `docs/design/m12-system-design.md` §1.4, §1.8, §11; decision 0068.
- Run `full-2026-11-14T01-42-04-072Z`: `seat.jsonl` lines 01:55:19 to 02:06:29, `report.md` "Words on a card that got no own move: 9"; analysis in the project files, `engine/m12/runs/full-2026-11-14T01-42-04-072Z/analysis.md`.
- The cards: `worlds/wend/deck/hills.json` (`bog_wifes_toll`, `peddler`), `scenarios/the_way_back/deck/fenn.json` (`salt_on_credit`).
