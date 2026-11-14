# Milestone 12 amendment: an own move after a fall

Status: Proposed (2026-11-14). The detail behind decision 0081 (Proposed). The record holds the options, the rules as tests, the questions for Stas and the readers' quotes; this file holds how the recommended option is built, and does not repeat them. If Stas accepts, it amends `docs/design/m12-system-design.md` §1.2, §1.4 (third bullet), §1.6, §1.7, §1.8 (case 2 and the fall), §8, §10 item 3 and §11, and `m12-own-move-amendment.md` §3 rule 3 and §5 G4.

Author's read: Lev wrote the rule this reopens (0079) and writes its replacement. Nothing here is evidence at a milestone exit.

Why a file of its own: the M12 design is Accepted, and Lev edits only Proposed drafts; and the decisions README says the design docs keep the detail.

**Which option this file builds.** Option E of the record: no count of falls at the human's seat, no way twice, AI seats held to two fallen moves a card by the table. §13 says what differs if Stas picks C.

**Goals, from the ask** (no scope of its own):
1. After an own move falls, the player's next words can again become a move.
2. The seat never invites words the card cannot take.
3. A card still settles: no run hangs on one, with a human at the seat or without.
4. No attempt is rolled twice (0068, "no retry").

## 1. Summary

- When a player's own idea fails, they may try another, as often as they have one. The game refuses only the same attempt again: the same skill toward the same end.
- After a fall the seat looks as it did before the try, plus one line: the list, "or something of your own" and the prompt are all there.
- AI players stop after two failed ideas on a card, so a table with no human cannot circle.
- **The moment a player would retell:** "My first idea failed, and so did the second. I came at it a third way, and that one worked." Or: "I ran out of ideas and paid like everyone else." In both the player stopped, not the game.

## 2. Records

| Fact | Who writes it, when | Who reads it | Where the player sees it |
| --- | --- | --- | --- |
| the ways that fell on the card on the table: for each, the skill, the success choice, rolled or not (world crate only, in the pending card) | the world crate, on each fall | `own_move`'s same-way check | the same attempt in other words is answered in the scene as already tried, and makes no move |
| the moves that fell on this card in this run: who, their words, the skill, the success choice, rolled or not (the session log's `card_own_move`, `own_move_set`, `own_move_ran`, as today; the loop keeps them as a list where it keeps one move now) | the server, as today | the DM's `card_words` wake and the fall's wake; the AI player's tool and briefing (their number); the run report | a person on the card answers the next try knowing the earlier ones; an AI companion stops proposing after the second fall |
| a second, third, … `card_own_move`, `own_move_set`, `own_move_ran` on one card (the same events) | the server | the game loop, the run report, the verdict row | each new move as a numbered choice in their own words, its roll line, the DM's sentences |

No new deed, event, reject reason, type or view field. Cut: a "last move" mark (option C's `last`), which E has no reader for. The world's record still cannot tell one try from five, or a fall from a success: that stays with the deed's reader (0079, Revisit).

## 3. The bound, and who can tell a human seat

The rules are in the record ("Rules, as tests"). What bounds a card under them:

- **The engine's bound is the ways, not a count.** A way is a skill and a success choice. There are 18 skills and about three choices a card (130 choices over 43 cards when design §1.4 counted; 44 cards today), so about 54 rolled moves a card, and twice that counting moves that never rolled. That guarantees a card ends. It is not a pace limit, and nobody should read it as one.
- **What stops a human is the dice and the human.** If every try goes to a roll: at 55% a try (+5 against DC 15), 96 cards in 100 are through within four tries; at 35% (+1), 95 in 100 within seven. A written number ends the card at any moment, and the success choice is on the list by its number (0079).
- **What stops AI seats is the table:** two fallen moves a card (rule 5). So a card with no human at it has C's bound exactly: at most two `own_move_set`, two falls, three ask rounds.
- **Can the engine tell a human seat from an AI seat? Core cannot; the rest can, and does today.** `nat20_core` knows no seats at all, and Rule 6 keeps it so; no option here touches core. The contract carries the human's creature (`start_campaign.human`), the server keeps it (`Campaign.human`), and the world crate gets it as `Table.tie_breaker`, "the seat that breaks a tied Blade vote: the human's, when one plays" (`deck.rs`), which `settle` reads for a tied Blade card and nothing else reads. Rule 5 asks of the world crates only serde and no repeated core rule, so a per-seat rule there is allowed.
- **I propose not to put one there.** It would give a field named for breaking ties a second job, or add a second field with the same value; and how many tries a model gets is a rule about agents, which lives in the table beside the fallback word and the re-ask, not in the world. The engine's rule stays the same for every seat. Question 2 of the record.
- **The "card won't settle" guard** (`loop.ts`, `cardRound`) is unchanged. It fires when a whole ask round logs nothing, which a fresh move never does, under C or E. It was never the bound on moves and is not one now.

**Run time.** One more try that goes to a vote and falls costs a `card_words` wake (cap 30 s), a card wake for each freed AI Blade (cap 20 s, at most three), and the fall's `road` wake (cap 12 s): at most 102 s at the caps, about 42 s at the acceptance p95 (6 s DM, 10 s player), plus the human's own reading and typing. Words that make no move cost the `card_words` wake alone. Under C that is at most once a card. Under E it has no ceiling at the human's seat. Against acceptance 1: Stas's two Milestone 11 runs took 39.1 and 26.5 minutes (`docs/roadmap.md`), so the longer one leaves 80.9 minutes, which is 47 fallen tries at the caps or 115 at p95. Exit run 2 had 9 answers in a player's own words in the whole run (0079). The all-AI half costs what it costs under C.

## 4. Carrier per owed row

No new owed row. `own_move_<card>` stays owed on Zoya's board, with her note made wider: on a card with several moves the deed's one record is the first try's, whoever's way worked in the end (record, question 5).

Zoya's two conditions on the second try, as they stand with N tries:

| Condition | Carrier | What was tried first |
| --- | --- | --- |
| a person who saw a try answers the next one knowing it | the `card_words` wake after a fall, and the fall's own wake, list every move that fell on this card in this run, words included (§7 items 3 and 4) | the one last move the loop keeps today: enough for two tries, wrong from the third |
| on a card where someone asked the party a question, a later move never unsays an earlier one | one clause in the `card_words` wake ("a later move goes on from what the earlier tries already said to the person; if the words unsay it, answer them and make no move"), and the report's side-by-side list for a person to read | nothing can test it: it is words against words |

Both get heavier with every try: the list in the wake grows by a line a fall, and the second rests on the DM reading that list each time. The list is given to the DM in every wake; it is never left to its memory.

## 5. Contract

**Goals.**
- G1. After a fall a card takes another own move; the engine counts no falls.
- G2. On one card no skill-and-success pair is rolled twice, and none falls twice.
- G3. No view changes, so nothing new reaches a player (Rule 3): the visibility table has no new row.
- G4. Every accepted fixture line up to and including a first fall replays byte for byte, but for one: the roster saved after a fall, which gains the way that fell.

**Proposal** (one PR, Rule 1 order; the next free version, dev.73 if it lands first).
- No new type, field, event or reject reason. `own_move` in both views is the card's latest move, among the choices or fallen, as today.
- Three meanings change, each with its CHANGELOG line: `own_move` after a fall is accepted; `own_move_taken` means a move is among the card's choices now (today: the card has or had one); `bad_own_move` also covers a pair that was already rolled, or already fell twice, on this card, and its message names the pair.
- Protocol §4.13: "One own move per card: a second is `rejected`, `own_move_taken`" and "A spent move is never offered again: a second `own_move` is `own_move_taken` …" are rewritten to rules 1 to 3 of the record. `choose_card{choice: "own_move"}` on a fallen move stays `unknown_choice`.
- The order of refusals is today's, with one check added: the card and the mode (`no_card`, `wrong_mode`), the choices named (`unknown_choice`), the actor's say (`no_say`, `already_spoke`, `waiting_for_advice`), `own_move_taken`, then `bad_own_move`, the same way before the failure's rules. A move that is both the same way and badly formed is told it is the same way, which is the one the DM can answer the player from.
- Fixture `own_move.jsonl`. Re-recorded, two cases: the second `own_move` after a fall (today refused) and the roster saved after a fall (it gains the list). New cases: another way that succeeds after a fall; three falls by three ways, then a written choice; the same way refused after a rolled fall; the same way accepted once after a `roll: null` fall and refused after the second; a later move that names a failure and fails; a roster saved after two falls that refuses the first way after the load.
- **Additive or breaking (Rule 2).** The schema's shapes do not change; only doc comments do, so `check-breaking` lists nothing. The three meanings are allowed in dev with their lines.

Beside option C: C adds one optional field (`last`) to two view types and a row to protocol §5, and changes the same number of meanings. E adds no field.

## 6. Engine

- `crates/nat20-world/src/deck.rs`: `PendingCard` gains the list of ways that fell (skill, success choice, rolled or not), default empty and left out when empty, so a card with no fall saves as today. `Deck::own_move_fell` learns whether there was a roll and appends to it. `Deck::own_move` refuses `OwnMoveTaken` only while the card's move is not spent, runs the same-way check against the list after the actor's say and before the failure's rules, and replaces a spent move. `OwnMove.spent` and what the views make of it stay.
- `crates/nat20-api-server/src/session/cards.rs`: `resolve_own_move_alone` passes whether it rolled. Nothing else: the roll-first order, the fall, the tally and the deed are as API-61 built them.
- A roster saved after a fall on dev.72 loads with an empty list, so that one way could be rolled once more. Dev only; the CHANGELOG line says so.

Beside option C: C adds two flags to `OwnMove` (`last`, `untried`); E adds one list to the pending card. The server change is the same line.

## 7. Table

Nine changes, all in `game/src/table/`:

1. `choices.ts`: one function beside `moveFell`, whether the card takes a move: it has no move among its choices.
2. `loop.ts`, the loop's own record: `ownMove` (the last move put on a card) becomes the list of moves that fell on the card on the table, from the three events it already reads; cleared when the card resolves or another card is framed, as today.
3. `loop.ts`, `cardWords`: it answers only while a move is among the choices (today: once the card has or had one) and logs "no fitting choice" by the same test. After a fall its wake adds the list of item 2, the sentence that the same skill toward the same choice will be refused, and the clause of §4, whose remedy is Zoya's (board check of E): words that unsay an earlier try are answered by the person holding the table to what it already said, and make no move; a same-way refusal is told the same way, by a person saying it has been tried, never by the seat.
4. `loop.ts`, `ownMoveFell`: the fall's wake names the earlier tries' words on this card, and its sentence on the person widens (Zoya, board check of E): "a person on the card, if there is one, reacts to this try, going on from their answer to the last one: one step further, never to giving way or leaving; the card decides that."
5. `loop.ts`, `humanCard`: the own-move line shows by item 1 (today: only while the card never had a move). The prompt line does not change.
6. `loop.ts`, `fellSince`: it compares the number of falls in item 2. Today it returns false once the card has a fallen move, which would let fallback words into the round of a second fall.
7. `loop.ts`, `cardLines` and `aiCard`: an AI seat is told how many own moves came to nothing on the card and, while fewer than two have, that one more may be tried another way; no invite sentence after a fall; the ask offers `own_move` by the same test.
8. `tools.ts`, the AI player's `ownMove`: it refuses while a move is among the choices, or once two have fallen (the loop gives it the number before the wake), not by `card.own_move`.
9. `words.ts`: `ownMoveFell`'s two forms are reworded (§15). No new string.

`ownMoveOrAnswer` needs no change of its own: it drops a move when `cardWords` says answer only, which item 3 now says less often.

Tests: a second way that wins; three falls and then a number; the same way refused and the words answered; an all-AI card where a fake DM makes every word a move and every roll fails stops at two `own_move_set` and settles on a written choice; a fall line after each fall.

## 8. Run report (AGT-113, not yet written)

- Each move is listed with its place on its card (first, second, …) and the earlier moves' skill and choice beside it.
- A move's votes start after the fall before it; today `ownMovesMet` would carry every earlier round's votes into it.
- A later move takes the card's one deed record; today it would read "not written this run", because a deed done again logs nothing.
- `m12-own-move` reads each move on its own (record, question 4). A card is counted as seated once, however often it goes to the seats.
- The list of answered words marks those said after a fall, with the engine's refusal when the same way was refused.
- New, one line: falls per card, and the most on one card, at the human's seat and among AI seats. Stas reads it against the record's Revisit.

## 9. What stays from table #385 and #386

- **Table #385 (API-61) stays whole but for four things:** the `OwnMoveTaken` test in `Deck::own_move`; the same-way check with the list it reads; `own_move_fell` learning of the roll, with its one caller; two fixture cases, with protocol §4.13's two sentences.
- **Table #386 (AGT-112) stays whole but for the nine changes of §7.** Unchanged: `OWN_MOVE_RULE`, the optional failure in the DM tool, the `remember` wording, the closing sentence of the fall's `road` wake, the settled-at-once path, the restart of the round after a fall.
- Nothing is rewritten in either open PR: the change is two PRs on top.

## 10. Failure

- **The new words are the same way:** the engine refuses `bad_own_move` and names the pair; the DM tool returns the message and shows nothing; within its retries the DM names another check the words earn, or answers only, and the scene says it has been tried.
- **The new move's roll fails:** the fall again, the same line, the list, the own-move line.
- **The proposer is down again, or the engine cannot roll again:** a second `roll: null` fall of the same pair closes it (rule 2). A Blade who is still down has no say and is refused `no_say` before that; a player owner keeps the call when down, as today, and each way they name closes at its second fall.
- **The `card_words` wake or the fall's wake fails or times out:** as today (`m12-own-move-amendment.md` §6).
- **An AI seat's words after two falls:** its tool refuses before any wake; it is asked for a `choose_card`, then the fallback, as today.
- **A card carried over a roster save and load:** the loop's list starts empty, so the wake names no earlier tries and the AI count starts again; the engine still refuses a way that fell, because the world crate saved it. The same gap the fall's text has today for the move's words (design §1.8).

## 11. Out

- **A count of falls in the engine, or a check of who proposes** (`Table.tie_breaker`): §3, and question 2.
- **The fallen moves in the DM's view.** The wake reads the run's log, as the fall's text does today. If a run shows a loaded card told as if nothing had been tried, the fix is one optional DM-only field.
- **A price on a later move:** option D, and question 1.
- **Two moves on a card at once:** it needs a second choice id.
- **A plain table line for words that make no move:** decided in 0079, question 3; its Revisit stands.
- **Showing the success and the failure before the vote:** Zoya's ask, still open.
- **Writing the deed when the card leaves the table,** with everyone who stood behind any move on it: question 5.
- **A narration-judge flag for a later move that unsays an earlier one:** nothing reads it before AGT-115 exists; the report's list is read by a person.

## 12. PRs

In order. Row ids, sizes and prices are Yan's.

| PR | What it lands | Depends on |
| --- | --- | --- |
| 0 | Decision 0081 and this file, with the index row; Vera's read of the §15 stretch and Zoya's board check of option E quoted in the record; the rule folded into the accepted design by the calling thread (the sections named at the top), as table #381 did | - |
| 1 | The contract's three meanings, protocol §4.13, the world crate, the server, the fixture, CHANGELOG (§5, §6) | 0 accepted; table #386 |
| 2 | The table: the nine changes of §7 and its tests; the two reworded lines with their Vera read | 1 |
| 3 | AGT-113, with the report changes of §8 | 2 |

AGT-114 is unchanged and independent. Its line (a) must be on the build before the next Vera read of a seat stretch: it removes the echo after an answered word.

## 13. If Stas picks C instead

- **Rules.** The engine counts: after a fall one more move, marked the card's last, then `own_move_taken`. A move that is both over the count and the same way is refused `own_move_taken`: the card takes no move at all, and the DM must not be told to find another skill. A repeated `roll: null` needs no rule of its own: the count ends it.
- **Contract.** `OwnMoveDm.last` and `OwnMovePlayer.last`, optional, left out when false, seen by the DM, the owner and the others (a row in protocol §5); the same three meanings, with `own_move_taken` wider instead of narrower.
- **Engine.** `OwnMove` gains `last` and `untried`; the spent move itself holds the one way that fell.
- **Table.** §7 without item 8 (the engine bounds AI seats); items 1, 5 and 7 read `last` from the view; the list of item 2 never holds more than two; and there are four fall lines for two, because the first fall invites one more try and the last does not.
- **The seat after the last fall.** C needs the seat to stop inviting what the card ignores, or to go on inviting it. Vera read both: with the invitation kept she stopped at the echo, and with it dropped she stopped at «Номер выбора.», which Zoya also reads as a field on a form. No wording of that prompt has held her, and under C one is owed with its own read.
- **Run.** At most one more try a card: about 100 s at the caps.
- **PRs.** The same four, in the same order.

C's lines, as Vera read them (§17):

| Where | Russian | English |
| --- | --- | --- |
| the first move failed its roll | «Не получилось. Можно попробовать по-другому, ещё один раз, или выбрать из списка.» | "It did not work. You can try another way, once more, or pick from the list." |
| the first move was never tried | «До этого дело так и не дошло. Можно попробовать ещё раз или выбрать из списка.» | "It never came to that. You can try once more, or pick from the list." |
| the last move failed, or was never tried (today's two lines) | «Не получилось.» or «До этого дело так и не дошло.», then «Решайте, что теперь, по списку ниже.» | "It did not work." or "It never came to that.", then "Decide what now from the list below." |
| the card prompt when the card takes no move | «Номер выбора.» | "A choice's number." |

## 14. Risks

- **Most likely to sink it: the DM's mapping on the second and third try.** The words land on a way that fell, the engine refuses, and the player is answered again: the wall moves from the count to the same way. Or the DM gets past the refusal with a skill the words do not earn. Cheapest test, before any code: Vera's blind read of the §15 stretch, which has a same-way answer in it. Then the side-by-side list in the all-AI half's report.
- **Pace with no ceiling at the human's seat.** §3 has the numbers. The report's new line counts it; the record's Revisit says when a count comes back.
- **Several scenes on one card.** A person on the card has now seen three tries, and the DM has to keep them one scene. §4's two carriers are a list and a clause; nothing tests the second.
- **"It did not work" three times.** Vera asked why it did not work. That answer belongs to the DM's fall text, not to the seat line, and no read has yet shown the fall text carries it.
- **The all-AI half never walks a third try.** AI seats stop at two, so before Stas sits down only the loop tests and the fixture have run one.

## 15. Lines for Vera

Drafts. They go to her as a seat stretch, without this file or the record: a first move that fails its roll, the fall line, the list with "or something of your own" under it, the prompt; new words, a second move as a numbered choice, a second fall and the same line; words that are the same way again, answered in the scene; a third way that works. The never-tried form is shown too.

| Where | Russian | English |
| --- | --- | --- |
| a move failed its roll (reworded; today «Не получилось. Решайте, что теперь, по списку ниже.») | «Не получилось. Можно попробовать иначе, своими словами, или выбрать из списка.» | "It did not work. You can try another way, in your own words, or pick from the list." |
| a move was never tried (reworded; today «До этого дело так и не дошло. Решайте, что теперь, по списку ниже.») | «До этого дело так и не дошло. Можно попробовать снова, своими словами, или выбрать из списка.» | "It never came to that. You can try again, in your own words, or pick from the list." |
| the own-move line, now also after a fall (unchanged) | «Или что-то своё: скажите своими словами.» | "Something else: say it in your own words." |
| the card prompt (unchanged, on every card) | «Номер выбора или своими словами.» | "A choice's number, or your own words." |

What these drafts change against the flags of §17 (author's read; whether it answers them is Vera's and Zoya's to say): "once more" is gone; the fall line says how to try; "pick from the list" has one form; «Номер выбора.» is never shown. One thing to listen for: «своими словами» now stands in the fall line, the own-move line and the prompt. If Vera hears it three times, the fall line loses it first.

## 16. Decisions for Stas

The seven numbered questions are in decision 0081, with a recommendation each.

## 17. Vera and Zoya: the rest of the reads of option C

The record's Readers section quotes Vera's two reads and Zoya's verdict verbatim. The rest is kept here as the calling thread wrote it there, unchanged. All of it is about option C's lines (§13) and the build before it, read on 2026-11-14 with the repo's own `vera` and `zoya` agents, not the cloud fallback. Nothing here is a read of option E.

**Vera, from her questions on C's lines:** «"ещё один раз" Почему именно один? Кто это решил? Я поняла это как правило игры, но никто его не объяснял.» and «"Не получилось." Почему не получилось? Невезение, мой герой плохо уговаривает или я плохо написала?» (Some of her other questions, about the names Ильса and Марен and the river's state, come from the thread's mock narration, not from these lines.)

**Thread's read:** with C the passenger point moves from the first fall to the second; it does not go away. «Номер выбора.» is where she gives up, so rule 7's dropped invitation costs as much as it saves; the "why it failed" belongs to the DM's fall narration, not the seat line. ("Rule 7" is the first draft's: the seat shows the own-move line and "or your own words" exactly when the card takes a move.)

**Zoya's flags on C's lines:** «Номер выбора.» reads as a field on a form; «Можно попробовать по-другому, ещё один раз…» does not say how to try; «выбрать из списка» and «по списку ниже» are two forms of one instruction. Her two small fixes: the second fall's wake names the first move's words, and one `card_words` clause ("a second move goes on from what the first already said to the person; if the words unsay it, answer them and make no move"). Both are carried in §4 and §7 items 3 and 4, widened from two tries to any number.

**Owed for option E:** Vera's blind read of the §15 stretch, and Zoya's board check of `wend` with the record and this file. Both go into the record's Readers, verbatim, before it goes to Stas.
