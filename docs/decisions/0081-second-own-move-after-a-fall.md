# 0081. After a fall a card takes one more own move, by another way

- **Status:** Proposed
- **Date:** 2026-11-14
- **Decided by:** nobody yet. Stas reopened the rule on 2026-11-14 («пересматриваем!») after a blind Vera read; the options and the recommendation are Lev's, the verdict is Stas's. If accepted it amends decision 0079 ("One own move per card stays, tried or not") and decision 0068 ("One own move per card, no retry"), and replaces neither.

Author's read: Lev proposed the rule this record reopens (0079, "the rest of the shape is Lev's proposal"), and proposes its replacement. Nothing below is evidence at a milestone exit. Zoya's board check and Vera's read of the lines in "Lines for Vera" are owed before this goes to Stas.

In one sentence: as accepted, the first failed idea closes the card to the player's own words while the seat goes on inviting them; I would let the card take one more move, by another way, and have the seat stop inviting words once the card can take none.

## Context

**The rule today** (0079; design `m12-system-design.md` §1.4, §1.8 case 2). An own move that names no failure and falls (a failed roll, or no roll at all) is spent. The words given for it are taken back, the card waits for a written choice, a second `own_move` is refused `own_move_taken`, and new words are answered in the scene and nothing more. The prompt still reads «Номер выбора или своими словами.»

**What the record shows.**
- Five blind Vera reads of a fall exist: one in the amendment (§16), three in table #386's description, and the one in the ask. In all five she names a point after the fall where she stops offering her own idea. The fall line was reworded three times; the point moved and did not go away.
- The read in the ask (the excerpt the calling thread gave; the full read is not in the repo and belongs here verbatim): she typed a new idea after her first one failed, the storyteller answered it in one line, and the seat asked for a number again. «…моё предложение прозвучало как реплика в сторону, а игра терпеливо подождала, пока я замолчу, и повторила вопрос. После этого я перестала бы предлагать своё и просто нажимала бы 1 или 2.»
- Read 3 in table #386, on a move that was never rolled: «моё предложение про вола пропало, а я его ни разу не попробовала. Можно ли попросить ещё раз, «своими словами»? … последняя строка говорит «или своими словами». Так можно или нельзя?»
- The line she quotes, «Дорога всё ещё ждёт вашего слова…», is the one amendment §7 (a) already removes (AGT-114, todo, not on this branch). Removing it takes the echo away. It does not change that her second idea did nothing.
- No exit run has had a fall: no run exists on a build with 0079. The count of falls seen in play is 0.
- A fall happens only to a move that names no failure. A move that names one decides the card either way, and this record does not touch it.

**Two things are wrong, and they are separate.** The seat invites words the card cannot take (a choice the world ignores). And one failed roll, or one roll that never happened, ends the player's say in their own words on that card.

**What bounds any answer.**
- A success gives nothing a number would not (0068, 0079): the named choice runs in full either way. So more tries win the party nothing in coin, cargo or deeds. A limit is about pace and about a loop, not about balance.
- One own move at a time: the vote has one choice id, `own_move`.
- A card must settle. The loop's guard ("the road card … won't settle") fires only when a whole ask round logs nothing; a fresh move logs events, so the bound on moves has to be the engine's.
- The caps: 30 s for a `card_words` wake, 20 s for an AI player's card wake, 12 s for the fall's `road` wake. One more move that three AI Blades vote on and that falls costs at most about 100 s at the caps, and about 40 s at the acceptance p95 (6 s DM, 10 s player). A run has 120 minutes; Stas's two Milestone 11 runs took 39.1 and 26.5 minutes (`docs/roadmap.md`).
- The next exit pair waits for AGT-113 and AGT-114 on top of table #385 and #386 (amendment §11). A pair that passes first time costs about 13 USD and Stas's time at the table (`docs/roadmap.md`); a pair that fails `m12-readable` on this stretch costs that again.

## Options

### A. Keep one move; the seat stops inviting
No engine change. After a fall the prompt drops "or your own words" and the own-move line stays gone. Words typed anyway are still answered.
- Pro: no contract version and no new PR: it rides AGT-114 with that row's Vera read. The seat stops promising what the card ignores.
- Con: it fixes the promise, not the loss. Vera's second idea still does nothing; the seat only says so sooner. A move that was never rolled is still spent.
- Exit pair: 0 PRs added, 0 s added to a run.
- Loop: as today, one fall and two ask rounds a card.

### B. One own move per seat per card
Each seat with a say may put one move on a card; one at a time.
- Pro: one sentence anyone can repeat ("everyone gets one idea"); another seat's fall no longer closes the card to the rest.
- Con: it gives the human nothing in the case Vera read. The human is asked first in every round (0062), so the move that fell is the human's own and their seat is spent: after their own fall the human gets 0 more moves. It pays the AI seats, where nobody asked for it.
- Exit pair: a contract version (a move per seat in the pending card and the views), the world crate, the server, the fixture, the table, the report. Up to one more move per seat: with four seats, three more ask rounds a card, about 5 minutes at the caps.
- Loop: bounded by the seats, 4 falls and 5 ask rounds a card.

### C. One more move after a fall, the card's last, by another way (proposed)
After a fall the card takes a second own move from any seat with a say and no word. The engine, not the DM, judges "another way": after a failed roll it refuses the same skill toward the same success choice. A move that was never rolled may be said again as it was. After the second move the card takes no more, and the seat stops inviting.
- Pro: the human's new idea after a fall can go on the card, and the human gets first claim on it (0062). "No retry" (0068) stays true as a test: no skill-and-choice pair is rolled twice on a card. The DM judges nothing new; it maps words to a check and a choice as it does today. A move never tried is not lost. If the second way is as good as the first, a proposer who passes a check 55% of the time (a +5 bonus against DC 15) sees their own way work on about 80% of the cards where they try twice; one who passes 35% of the time (a +1 bonus), on 58%.
- Con: the second move is still not certain: words no choice fits are answered and nothing more (0079 question 3, decided), and at the second fall the player meets the list again, one round later. A fall still costs nothing but the move (0079, "What A buys, honestly"). A third ask round on a card is slower for every seat.
- Exit pair: one contract version (one optional view field, two meanings), two optional fields in the world crate, one argument in the server, the fixture, one table PR, AGT-113 wider. At most one more move a card: about 100 s at the caps.
- Loop: bounded by the engine: at most 2 `own_move_set`, 2 falls and 3 ask rounds a card, for human and AI alike.

### D. A second move with a price
C, plus one of three prices. Each fails on its own count:
- **A DC one ladder step higher.** The DC is DM-only (Rule 3), so the player cannot see the stake when they choose. It cuts the second try from 55% to 30%, or from 35% to 10%, so the second fall becomes the usual end and Vera's point arrives one round later. It is a house rule on top of the ladder (0057: a labelled variant).
- **A cost the engine applies**, lost time by the `Delay` effect being the one that needs no payer. Visible if the seat says it. It contradicts scope §3 ("an own move never invents … a cost") and the accepted reason of amendment §3 (it "punishes speaking in your own words"), and it needs a number of minutes nobody has tuned.
- **The second move must name a failure.** It always decides the card, so it bounds itself, and it has teeth. But `bog_wifes_toll`, the card 0079 was written for, has no legal failure, so there the second idea is answered and nothing more; and a failed roll would again act for the player unless the failure is shown before the vote, which is DM-only today (design §1.3).
- Exit pair: C's cost, plus the price's rule, line and Vera read.

## Decision

Proposed: **C, with no price.** B does not reach the seat that complained, A reaches it and gives it nothing back, and D's prices are either invisible, already ruled out, or bring back the problem 0079 solved. The limit of two is for pace and for the loop; it balances nothing, because a success wins nothing a number would not.

The question the card now puts to the player after a fall: "That did not work. What now?", and their own words are again an answer, once.

The moment a player would retell: "My first idea failed. I came at it another way, and that one worked." Or its twin: "I tried two things, both failed, and then we paid like everyone else."

## Consequences

### Rules, as tests

1. A card holds at most one own move that can be voted for. `own_move` while one is among the choices is refused `own_move_taken`, as today.
2. After a fall, `own_move` is accepted once more on that card, for a seat with a say and no word. The move it puts on the card is marked the card's last.
3. After a fall that rolled, an `own_move` with the same skill and the same success choice as the fallen move is refused `bad_own_move`, with a message the DM can answer from. After a fall with no roll (`roll: null`) the same skill and choice are accepted. Stated as one check: on one card, no skill-and-success pair is rolled twice.
4. A card whose last move is on it, or fell, refuses `own_move` with `own_move_taken`, across a roster save and load too. So one card logs at most two `own_move_set`, at most two `own_move_ran` with `choice: null`, and goes to the seats at most three times.
5. The second move follows every rule of the first: the three cases of design §1.8, the optional failure, the roll before `card_resolved` when no failure is named, the words taken back on a fall, the same tally. If it names a failure it decides the card either way.
6. The deed `own_move_<card>` does not change: one per card, written at the first `own_move_ran`, first record kept (0079, Stas: «один всегда один»). A second move writes nothing new.
7. The seat shows the own-move line, and "or your own words" in the card prompt, exactly when the card takes a move: it has no own move, or its move fell and was not the last.
8. Words on a card that takes a move go to the DM under the full rule, and the wake names the move that fell: who, their words when this run's log has them, the skill, the success choice, and whether it was rolled. Words on a card that takes none are answered and nothing more, as today.
9. Not testable, so counted: how the DM maps the second words. The report lists both moves of a card side by side, and every answer after a fall that made no move.

### Records

| Fact | Who writes it, when | Who reads it | Where the player sees it |
| --- | --- | --- | --- |
| the pending move is the card's last (`last`; world crate, and `own_move.last` in both views) | the world crate, when a second move goes on the card | `own_move` (refuses a third); the seat, the AI briefing and the AI player's `own_move` tool | the own-move line and "or your own words" are there, or are not |
| the fallen move was never rolled (`untried`; world crate only) | the world crate, on a fall with `roll: null` | `own_move`'s same-way check | the same words said again become a move |
| the fallen move's skill and success choice (held today in the spent move) | nobody new | the same-way check; the DM's `card_words` wake | the same attempt in other words is answered in the scene as already tried |
| a second `card_own_move`, `own_move_set`, `own_move_ran` on one card (the same events) | the server | the game loop, the run report, the verdict row | the second move as a numbered choice in their words, its roll line, the DM's sentences |

No new deed, event or reject reason. The world's record still cannot tell one try from two, or a fall from a success: that stays with the deed's reader (0079, Revisit), and Zoya's row for `own_move_<card>` stays owed.

### Contract

Goals: (1) after a fall a card takes one more own move and then none; (2) the same skill toward the same choice is never rolled twice; (3) a player's view can tell a card that takes a move from one that does not, and learns nothing hidden by it; (4) every accepted fixture line for a first move replays byte for byte.

Proposed, in Rule 1 order, on the next free version (dev.73 if it lands first):
- `OwnMoveDm.last` and `OwnMovePlayer.last`: optional, left out when false. View: DM, owner and other players all see it (protocol §5 gains the row). It is a count of public events, not a statistic: that a move fell is already public (0079, G5).
- Meanings, each with its CHANGELOG line: `own_move` after a fall is accepted once; `own_move_taken` means a move is among the choices or the card had its last; `bad_own_move` also covers the same skill and success as a move that fell after a roll.
- Protocol §4.13: the sentences "A spent move is never offered again: a second `own_move` is `own_move_taken` …" are rewritten to rules 2 to 4.
- Fixture `own_move.jsonl`: two cases are re-recorded (the second `own_move` after a fall, today refused; the roster saved after a fall). New cases: a second move by another way that succeeds; one that falls, then a third refused; the same way refused after a rolled fall and accepted after a `roll: null` fall; a second move that names a failure and fails; a roster saved after the second fall.
- Additive (Rule 2): one optional field in two view types. The changed meanings are allowed in dev with their lines.

### Engine

- `crates/nat20-world/src/deck.rs`: `OwnMove` gains `last` and `untried`, both default false and left out when false, so saved rosters and accepted lines do not change. `Deck::own_move` replaces a spent move that is not `last` after the same-way check, and marks the new one `last`. `Deck::own_move_fell` learns whether there was a roll.
- `crates/nat20-api-server/src/session/cards.rs`: `resolve_own_move_alone` passes that to it. Nothing else: the roll-first order, the fall, the tally and the deed are as API-61 built them.

### Table

- `game/src/table/choices.ts`: one function beside `moveFell` that says whether the card takes a move.
- `loop.ts`: `cardWords` answers only when the card takes no move (today: when it has or had one), logs "no fitting choice" by the same test, and after a fall its wake adds the fallen move (rule 8) and "this would be the card's last own move". `humanCard` shows the own-move line and the prompt by rule 7. `fellSince` must see a second fall; today it returns false once a card has a fallen move, which would let fallback words into the round of the second fall. `cardLines` and `aiCard` tell an AI seat that one more move may be tried another way, with no invite sentence.
- `tools.ts`: the AI player's `own_move` tool refuses by the same function, not by `card.own_move`.
- `words.ts`: the lines below.

### Run report (AGT-113, not yet written)

- Each move is listed with its place on its card, first or second, and the first one's skill and choice beside the second.
- The second move's votes start after the first fall; today `ownMovesMet` would carry the first round's votes into it.
- The second move takes the card's one deed record; today it would read "not written this run".
- `m12-own-move` reads each move on its own (question 4 below). A card is counted as seated once, though it may go to the seats three times.
- The list of answered words marks those said after a fall.

### What stays from table #385 and #386

- **Table #385 (API-61) stays whole but for three things:** the `OwnMoveTaken` test in `Deck::own_move`, the signature of `own_move_fell`, and two fixture cases with protocol §4.13's closing sentences.
- **Table #386 (AGT-112) stays whole but for six:** the `answerOnly` condition in `cardWords`; the own-move line's condition in `humanCard`; `fellSince`; the fall line's two forms, which become four; the AI briefing's fall line; the AI tool's refusal. `OWN_MOVE_RULE`, the optional failure in the DM tool, the `remember` wording, the fall's `road` wake, the never-tried text, the settled-at-once path and the restart of the round are unchanged.
- Nothing is rewritten in either open PR: the change is two PRs on top.

### PRs

In order. Row ids, sizes and prices are Yan's.

| PR | What it lands | Depends on |
| --- | --- | --- |
| 0 | This record with its index row; Zoya's board check and Vera's read quoted in it; the text folded into the accepted design by the calling thread (§1.2, §1.4 third bullet, §1.6, §1.8 case 2 and the fall, §8, §10 item 3, §11), as table #381 did | - |
| 1 | The contract, protocol §4.13 and §5, the world crate, the server, the fixture, CHANGELOG | 0 accepted; table #386 |
| 2 | The table: the six changes above, the lines with their Vera read, loop tests for a second move that wins, one that falls, and the same way refused | 1 |
| 3 | AGT-113, with the report changes above | 2 |

AGT-114 is unchanged and independent. Its line (a) must be on the build before the next Vera read of a seat stretch.

### Failure

- **The second move is refused as the same way:** the DM tool returns the engine's message, shows nothing, and the DM answers the words within its retries. The scene says it has been tried.
- **The second move's roll fails:** today's fall, today's line, the written choices, and no own-move line.
- **The `card_words` wake or the fall's wake fails or times out:** as today (amendment §6).
- **An AI seat's second words make no move:** its one re-ask for `choose_card`, then the fallback, as today.

### Out

- A price on the second move: option D, and question 5.
- Two moves on a card at once: it needs a second choice id.
- A plain table line for words that make no move: decided in 0079, question 3; its Revisit stands.
- Showing the success and failure before the vote: Zoya's ask, still open.
- A human who owns the caravan and calls last, after AI Blades used both moves: the human plays a Hired Blade (0058), who is asked first. Noted, not designed.

### Risks

- **Most likely to sink it:** the DM maps the new words onto the fallen move's skill and choice, the engine refuses, and the player is answered again; or it dodges the refusal with a skill the words do not earn. Cheapest test, before any code: Vera's blind read of a seat stretch built from the lines below (a fall, new words, the second move as a numbered choice, its roll). Then the report's side-by-side list in the all-AI half.
- **Pace:** a card with two falls is three ask rounds. The same Vera read should include that stretch.
- **The second fall is the first fall again, one round later.** Rule 7 is the only answer to it in this record: the seat stops inviting.

## Questions for Stas

1. **Which option?** Recommended: C. It costs two PRs before the pair and at most about 100 s a card in a run.
2. **May a move that was never rolled be said again as it was** (rule 3), while still counting as one of the two? Recommended: yes. Read 3 in table #386 is this case.
3. **May an AI seat make the second move?** Recommended: yes, told plainly and not invited, so the all-AI half can walk the path before Stas sits down, and the bound of two holds for everyone. The alternative is a table rule that only the human's words reopen a card: fewer wakes, and a path the first run never tests.
4. **`m12-own-move` with two moves on a card.** Recommended: each move is read on its own by design §8; the fallback-vote check for a second move starts at the first fall's `own_move_ran`; the deed is the card's one record. This is an exit row's reading, so it is his.
5. **A price?** Recommended: none for this pair. If he wants one, lost time is the only price the player can see and the engine already holds; it needs a number and a seat line, and it reverses amendment §3.
6. **The prompt drops "or your own words" on a card that takes no move** (rule 7). This reverses a sentence of design §1.8 ("the prompt line keeps 'or your own words' on purpose"). Recommended: yes; words typed are still answered, never refused.
7. **A rule I follow where the rules are silent:** after a fall, the seats' written words stand and only the freed seats may make the second move, because `own_move` needs a seat with no word. A seat that picked a number in the first round cannot take it back for a new idea.

## Lines for Vera

Drafts. They go to her as a seat stretch, without this file. Today's two fall lines stay for the last fall.

| Where | Russian | English |
| --- | --- | --- |
| the first move failed its roll (new) | «Не получилось. Можно попробовать по-другому, ещё один раз, или выбрать из списка.» | "It did not work. You can try another way, once more, or pick from the list." |
| the first move was never tried (new) | «До этого дело так и не дошло. Можно попробовать ещё раз или выбрать из списка.» | "It never came to that. You can try once more, or pick from the list." |
| the last move failed, or was never tried (unchanged) | «Не получилось.» or «До этого дело так и не дошло.», then «Решайте, что теперь, по списку ниже.» | "It did not work." or "It never came to that.", then "Decide what now from the list below." |
| the card prompt when the card takes no move (new) | «Номер выбора.» | "A choice's number." |

## Readers

**Vera, the read that opened this record** (blind; the fall line «Не получилось. Решайте, что теперь, по списку ниже.», then words typed and only answered, then «Дорога всё ещё ждёт вашего слова: выбор от 1 до 2.»), section 3 verbatim:

> На строке «Дорога всё ещё ждёт вашего слова: выбор от 1 до 2». Прямо «вы ввели неправильно» мне не сказали, но я услышала именно это: моё предложение прозвучало как реплика в сторону, а игра терпеливо подождала, пока я замолчу, и повторила вопрос. После этого я перестала бы предлагать своё и просто нажимала бы 1 или 2. Ноутбук я бы пока не закрыла, но дальше выбирала бы уже не я, а список.

**Vera, the lines above as a seat stretch** (blind: a first move fails, «Не получилось. Можно попробовать по-другому, ещё один раз, или выбрать из списка.», a second move fails, the last-fall line, the own-move line gone, «Номер выбора.»; the never-tried variant shown too), section 3 verbatim:

> Когда третий пункт исчез и внизу осталось только «Номер выбора.» Мне не сказали, что я написала неправильно, этого не было. Но две мои идеи подряд отклонили без объяснений, и я поняла: моих слов здесь больше не ждут. С этого места я бы просто нажала «2», не думая. Ноутбук я бы не закрыла, но уже не чувствовала бы, что выбираю я.

From her questions, on these lines: «"ещё один раз" Почему именно один? Кто это решил? Я поняла это как правило игры, но никто его не объяснял.» and «"Не получилось." Почему не получилось? Невезение, мой герой плохо уговаривает или я плохо написала?» (Some of her other questions, about the names Ильса and Марен and the river's state, come from the thread's mock narration, not from these lines.)

Thread's read: with C the passenger point moves from the first fall to the second; it does not go away. «Номер выбора.» is where she gives up, so rule 7's dropped invitation costs as much as it saves; the "why it failed" belongs to the DM's fall narration, not the seat line.

**Zoya, board check of `wend` with this file**, verdict verbatim:

> Zoya, board check of `wend` with 0081: the board holds. No row breaks, no deed is added or lost, and the bible argues for the second try (Story-space 1; the failed roll as the better scene), on two conditions for the director: a person who saw the first try answers the second one knowing it, and on a card where someone asked the party a question, the second move never unsays the first. One row stays owed, `own_move_<card>`, with a new note: on a card with two moves, the deed's first record is always the fall.

Her flags on the lines: «Номер выбора.» reads as a field on a form; «Можно попробовать по-другому, ещё один раз…» does not say how to try; «выбрать из списка» and «по списку ниже» are two forms of one instruction. Her two small fixes: the second fall's wake names the first move's words, and one `card_words` clause ("a second move goes on from what the first already said to the person; if the words unsay it, answer them and make no move").

## Revisit when

- An exit pair's reports show a second move refused as the same way, or dodged with an unearned skill, more than once: then the same-way test is the wrong judge.
- An exit pair has falls at the human's seat and no second move after any of them: then the cap was not what stopped her, and A's honest prompt was enough.
- A Vera read of a double fall names the second fall as where she stops: then the price of a third move, or 0079's plain table line, is the next question.
- The dramaturg mechanism designs a reader for `own_move_<card>`: whether "tried twice" travels with the words is that design's question.

## Sources

- The ask (Stas, 2026-11-14) with Vera's verdict; table #386's description (three Vera reads); `docs/design/m12-own-move-amendment.md` §3, §7, §11, §15, §16.
- `docs/design/m12-system-design.md` §1.2, §1.4, §1.6, §1.8, §8, §10 item 3, §11; decisions 0058, 0062, 0068, 0079; `docs/scope/not-a-passenger-scope.md` §3, §4 row 2, §6 question 3.
- The code as it stands on `table/m12-agt-112-own-move-fall-at-table`: `crates/nat20-world/src/deck.rs` (`own_move`, `own_move_fell`, `OwnMove.spent`), `crates/nat20-api-server/src/session/cards.rs` (`resolve_own_move_alone`), `game/src/table/loop.ts` (`ownMoveFell`, `fellSince`, `cardWords`, `humanCard`, `cardLines`), `game/src/table/tools.ts` (`ownMove`, `ownMoveOrAnswer`), `game/src/table/words.ts`, `game/src/play/exit.ts` (`ownMovesMet`, `counted`), `game/src/agents/dm.ts` and `player.ts` (the wake caps).
- The number: 0080 is taken by table #383 (`table/content-test-layers`, Proposed); no branch or open PR holds 0081 (checked 2026-11-14).
