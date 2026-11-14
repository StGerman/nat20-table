# 0079. An own move may name no failure choice; words no choice fits are answered and nothing more

- **Status:** Proposed
- **Date:** 2026-11-14
- **Decided by:** Stas, in part: the direction after exit run 2 (2026-11-14 02:23Z, «поправить дизайн через Льва») and the amendment's three questions (06:20Z, quoted in `docs/design/m12-own-move-amendment.md` §15): one deed with no result in it, a fall counts for exit row 2, and words no choice fits get only an answer. The rest of the shape is Lev's proposal; the record is Accepted when Stas merges table #381, and PR 1 marks it so (amendment §10). It refines decision 0068 and does not replace it.

## Context

Exit run 2 of Milestone 12 (`full-2026-11-14T01-42-04-072Z`, build ecd1f9e, Stas as Bren): 9 times he answered a card in his own words, and no own move reached a card. Seven were questions or jokes, and an answer in the scene was right. Two were plans:

1. `bog_wifes_toll`, «Дать хлеб ворону НО не ведьме!». The success is `bread`. Nothing can take the failure: `walk_past` breaks a custom (the engine refuses it) and `true_word` is an act the words did not ask for (the prompt forbids it). 0068 wants two different choices, so the card can hold no own move for these words.
2. `salt_on_credit`, «Предложить пойти дальше с вами и парня с собой забрать». No choice is "take them along", so there is no success either. The DM told the woman's refusal as a fact, with no roll, and kept it with `remember`.

Counted over the 44 cards in the decks today: the engine's rule alone (a failure may not break a custom, and must differ from the success) leaves one card with a success that has no legal failure, `peddler`. The prompt's rule (no deliberate act the words did not ask for) is judged against the words each time; in this run it closed one card of the two that got a plan.

A success gives the party nothing a number would not: the named choice runs in full either way (0068). What the roll decides is whether the deed is done the player's way.

## Options

### A. The failure choice is optional; with none, a failed roll leaves the card waiting (chosen)
The move names a check and a success choice. If the vote goes to it and the roll fails (or the proposer is down, or the engine cannot roll), no choice runs, the card is decided on a written choice (at once if the words left settle it), and the move is spent.
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

### The deed for a tried move (within A; decided by Stas, 2026-11-14)
- The same deed, `own_move_<card>`, with no result in it (chosen): 0068 says the deed carries no result, so "the party made an own move on this card" is as true of a failed one. No new id, no validator change. Con: nothing in the world's record tells a fall from a success, so no later reader can pay a fall off.
- A second deed, `own_move_tried_<card>`: con, a second id that nothing reads in Milestone 12, when the first already waits for a reader.
- The result inside the one deed (Zoya's fallback, amendment §16): pro, a later reader could tell a fall from a success. Con, Stas's: a "failed" mark says nothing while what was tried is free words no reader has.

### Words no choice fits (the `salt_on_credit` case)
- The DM answers the words and nothing more (chosen; Stas, 2026-11-14): nobody in the scene agrees, refuses or gives way, and no outcome goes into `remember`. Con: an honest plan gets an answer that settles nothing.
- The DM rules it in the scene, as in run 2: con, the narrator decides an outcome the engine never rolled, and its memory carries that through the rest of the run.
- The table says in plain words that this card cannot carry the plan: con, the DM would have to label its own answer, and a first-time player may read the line as "you typed it wrong". Left out; see Revisit.

### What A buys, honestly
Under A a fall can still end on the success choice by its number (on `bog_wifes_toll`: `bread`), so the end on the card is the same as C's. What A buys over C is the table's vote on the player's words and the deed in the engine's book; what it costs is a contract version, a card that stays pending across the roll, words taken back and a re-ask. Zoya (amendment §16): both ends equal a written choice until a reader can tell a fall from a success, which is question 1. Stas ruled it on 2026-11-14: one deed, no result; what a fall then brings is in the amendment's §15.1.

## Decision

A, with the same deed and no result in it, and answers only for words no choice fits. A failed roll with no failure choice costs the move and nothing else, on purpose: a success gives nothing a number would not, so a failure takes nothing a number would not.

## Consequences

- One more contract version in dev (dev.72 if it lands first): `own_move.failure` becomes optional; `own_move_ran.choice` is `null` when no choice ran; for such a move `card_resolved` on `own_move` is logged after the roll and only on a success. A move that names a failure behaves and replays as before.
- 0068's sentences "the success and failure choices must be two different choices" and "a failure decides the card" now hold only for a move that names a failure. One own move per card stays, tried or not.
- 0068's Revisit line "a reader for the deed, which needs the player's words or the result in it" narrows to the words: the deed carries no result (Stas, amendment §15 question 1).
- The DM prompt's `card_words` rule and the `remember` tool's description change; no code can test what a narration rules, so the run report lists every answer that made no move, with the words and any fact the DM kept in that wake, and every fact kept with `remember` in a wake that told a fall.
- Exit row 2 counts a move that fell, whether the card then waited or was settled at once by the words left (Stas, amendment §15 question 2): a departure from scope §4 row 2 (design §10 item 12).
- A fall leaves nothing in the world's record that a success does not: the deed is the same, and only the run's own log (`own_move_ran` with `choice: null`) tells them apart. What a fall brings is the roll, the DM's one or two sentences and the written choice the table then picks (amendment §15.1). Zoya folds her board row for a fall into the `own_move_<card>` row, which stays owed (amendment §16, follow-up).
- The seat gains two lines (the move did not work after a roll; it could not be tried with `roll: null`), shown to the Blades the card waits for and a player owner after an own move fails and the card still waits (not when the words left settle it).

## Revisit when

- An exit run shows the DM leaving the failure out where a choice plainly is what failing brings, in more than half of the own moves made: then B's simplicity is being paid for anyway, and B is the honest rule.
- The report's list shows two plans no choice could carry in one exit pair's reports: then the plain table line, or a card change, is due.
- The dramaturg mechanism designs a reader for `own_move_<card>`: it carries the player's words first (the deed stays one id, Stas, 2026-11-14), and whether the result travels with the words is that design's question: it forbids telling the result, or asks Stas (amendment §15.1).

## Sources

- `docs/design/m12-own-move-amendment.md` (the amendment); `docs/design/m12-system-design.md` §1.4, §1.5, §1.8, §8, §10 item 12, §11; decision 0068.
- Run `full-2026-11-14T01-42-04-072Z`: `seat.jsonl` lines 01:55:19 to 02:06:29, `report.md` "Words on a card that got no own move: 9"; analysis in the project files, `engine/m12/runs/full-2026-11-14T01-42-04-072Z/analysis.md`.
- The cards: `worlds/wend/deck/hills.json` (`bog_wifes_toll`, `peddler`), `scenarios/the_way_back/deck/fenn.json` (`salt_on_credit`).
