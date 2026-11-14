# 0081. After a fall a card takes another own move, by another way

- **Status:** Accepted (Stas, 2026-11-14: option E on the decision card, 14:46Z; merged by decision 0082)
- **Date:** 2026-11-14
- **Decided by:** Stas chose option E on 2026-11-14 (the thread's decision card, 14:46Z); the record is accepted when he merges it. Questions 2 to 6 below are still his, and the work goes ahead on their recommendations until he says otherwise. Stas reopened the rule on 2026-11-14 («пересматриваем!») after a blind Vera read, and after her second read asked «Может быть не лимитировать провалы?», which is option E. The options and the recommendation are Lev's, the verdict is Stas's. If accepted it amends decision 0079 ("One own move per card stays, tried or not") and decision 0068 ("One own move per card, no retry"), and replaces neither.

Author's read: Lev proposed the rule this record reopens (0079, "the rest of the shape is Lev's proposal") and both replacements weighed here, C and E. Nothing below is evidence at a milestone exit. Vera's two reads and Zoya's board check are quoted under Readers; three read option C or the build before it, and two read option E.

In one sentence: every blind read stops where the card stops taking the player's words, wherever a count puts that place; I would take the count off the human's seat, refuse only the same attempt twice, and hold AI seats to two. The detail (records, contract, engine, table, run report, failure, PRs, the lines for Vera, what differs under C) is in `docs/design/m12-own-move-after-a-fall-amendment.md` (Proposed), "the amendment" below.

## Context

**The rule today** (0079; design `m12-system-design.md` §1.4, §1.8 case 2). An own move that names no failure and falls (a failed roll, or no roll at all) is spent. The words given for it are taken back, the card waits for a written choice, a second `own_move` is refused `own_move_taken`, and new words are answered in the scene and nothing more. The prompt still reads «Номер выбора или своими словами.» A move that names a failure decides the card either way, and this record does not touch it.

**What the record shows.**
- Six blind Vera reads of a fall exist: one in `m12-own-move-amendment.md` §16, three in table #386's description, the one in Stas's ask, and one of option C's lines (the last two under Readers). In all six she names a point after a fall where she stops offering her own idea. The fall line was reworded three times and the count was moved once, from one move to two; the point moved with them and did not go away.
- Read 3 in table #386, on a move that was never rolled: «моё предложение про вола пропало, а я его ни разу не попробовала. Можно ли попросить ещё раз, «своими словами»? … последняя строка говорит «или своими словами». Так можно или нельзя?»
- The echo after an answered word, «Дорога всё ещё ждёт вашего слова…», is already removed by `m12-own-move-amendment.md` §7 (a) (AGT-114, todo, not on this branch). Removing it does not change that her second idea did nothing.
- No exit run has had a fall: no run exists on a build with 0079. The count of falls seen in play is 0.

**Two things are wrong, and they are separate.** The seat invites words the card cannot take (a choice the world ignores). And one failed roll, or one roll that never happened, ends the player's say in their own words on that card.

**What bounds any answer.**
- A success gives nothing a number would not (0068, 0079): the named choice runs in full either way. So more tries win the party nothing in coin, cargo or deeds, and a limit is about pace and about a loop, not about balance.
- One own move at a time: the vote has one choice id. And a card must settle: the loop's guard ("the road card … won't settle") fires only when a whole ask round logs nothing, and a fresh move logs events, so that guard bounds no moves under any option.
- Core knows no seats (Rule 6). The rest of the engine knows the human's: `start_campaign.human` on the wire, `Campaign.human` in the server, `Table.tie_breaker` in the world crate, read today only to break a tied Blade vote.
- One more move that three AI Blades vote on and that falls costs at most 102 s at the caps (30 s `card_words` wake, 20 s a player's card wake, 12 s the fall's wake), about 42 s at the acceptance p95. A run has 120 minutes; Stas's two Milestone 11 runs took 39.1 and 26.5 (`docs/roadmap.md`). A pair that passes first time costs about 13 USD and his time at the table; one that fails `m12-readable` on this stretch costs that again.

## Options

### A. Keep one move; the seat stops inviting
After a fall the prompt drops "or your own words" and the own-move line stays gone. Words typed anyway are still answered.
- Pro: no engine change, no contract version, no new PR: it rides AGT-114. The seat stops promising what the card ignores.
- Con: it fixes the promise, not the loss. Vera's second idea still does nothing, and the seat says so with the line she gave up at under C. A move never rolled is still spent.

### B. One own move per seat per card
- Pro: one sentence anyone can repeat ("everyone gets one idea"); another seat's fall no longer closes the card to the rest.
- Con: it gives a human Blade nothing after any fall. If the move that fell was their own, their seat is spent. If it was an AI Blade's, made after the human picked a number, the human's number stands and they are not asked again. Only a human who owns the caravan and called an AI Blade's move gets one of their own after its fall, and the human plays a Hired Blade (0058). It costs a contract version with a move per seat, and with four seats three more ask rounds a card, about 5 minutes at the caps.

### C. One more move after a fall, the card's last, by another way
After a fall the card takes a second own move from any seat with a say and no word. The engine, not the DM, judges "another way": after a failed roll it refuses the same skill toward the same success choice. After the second move the card takes no more, and the seat stops inviting.
- Pro: the human's new idea after a fall can go on the card. "No retry" (0068) stays true as a test: no skill-and-choice pair is rolled twice on a card. One bound in the engine for every seat: at most 2 `own_move_set`, 2 falls and 3 ask rounds a card. At 55% a try (+5 against DC 15) a proposer sees their own way work on about 80% of the cards where they try twice; at 35% (+1), on 58%.
- Con: Vera read it. The point moved from the first fall to the second and stayed: «две мои идеи подряд отклонили без объяснений, и я поняла: моих слов здесь больше не ждут». She gave up at «Номер выбора.», the line C adds so the seat stops inviting, and asked of "once more": «Почему именно один?» Kept or dropped, no wording of the seat after the last fall has held her.
- Cost: one contract version (one optional view field in two view types, three meanings), two flags in the world crate, one argument in the server, the fixture, one table PR, AGT-113 wider. At most one more move a card: about 100 s at the caps.

### D. A later move with a price
C or E, plus a price. Each fails on its own count: a DC one ladder step higher is DM-only (Rule 3), so the stake is invisible when the player chooses, and it cuts a try from 55% to 30%; lost time contradicts scope §3 ("an own move never invents … a cost") and `m12-own-move-amendment.md` §3 (it "punishes speaking in your own words"), and needs a number nobody has tuned; a later move that must name a failure cannot be made on `bog_wifes_toll`, the card 0079 was written for.

### E. No count at the human's seat; no way twice; AI seats stop at two (proposed)
Stas's question. After a fall the card takes another own move whenever a seat with a say and no word has one. The engine refuses the same skill toward the same success choice, as in C, and counts nothing. "Or your own words" never leaves the seat. AI seats are bounded by the table: an AI player's `own_move` tool is refused once two moves have fallen on the card.
- Pro: there is no last fall, so the place where the reads stop is never built: the player stops, not the game. «Номер выбора.» and "once more" are never shown, and the prompt sentence of design §1.8 stands. No new view field. "No retry" stays a test. The limit that C keeps "for pace and for the loop" stays where the loop is, at the AI seats, and goes where the pace is the player's own.
- Con: no ceiling on time at the human's seat. The dice decide less: a player who keeps finding ways gets one through by the third try on 91% of cards at 55%, 73% at 35%. The wall moves and does not vanish: the same way again, and words no choice fits, are still answered and nothing more. Zoya's two conditions get heavier with every try and rest on a list and a clause in the DM's wake. The all-AI half never walks a third try.
- Cost: one contract version (no field, three meanings), one list in the world crate, one argument in the server, the fixture, one table PR, AGT-113 wider: the same PRs as C. About 100 s at the caps for every further try that falls.
- The real bound a card: in the engine, the ways: 18 skills times the choices offered, about 54 rolled moves on a three-choice card, which is an end and not a pace. At AI seats, 2 falls and 3 ask rounds. For the human, the dice (if every try is rolled, 96 cards in 100 are through within four tries at 55%, 95 in 100 within seven at 35%) and their own patience.

## Decision

Proposed: **E, with no price.** A count was tried at one and read at two, and both times Vera named its edge as where she stops. I wrote of C that its limit "balances nothing"; then all it buys is pace and a loop guard. E gets the loop guard from the table and leaves the pace to the person whose time it is. A gives the player nothing back, B reaches the human only as an owner, and D's prices are invisible, already ruled out, or bring back the problem 0079 solved. If Vera's read of E's lines stops at the second fall all the same, E buys her nothing over C and C is cheaper in run time: then C.

**On the cost the thread gave Stas** ("E costs no more than C in contract and engine: the counter becomes a check of who proposes"). The first half holds: E's contract is one view field smaller, its world crate keeps one list where C keeps two flags, the server change is the same line and the PR list is the same. The second half is wrong: no check of who proposes goes into the engine. The engine could make one, since it holds the human's seat as `Table.tie_breaker`; I propose it does not (question 2), and the bound on AI seats is a table rule in the AI player's tool. What E costs more than C is not code: run time with no ceiling at the human's seat, and a DM that must keep several tries on one card in one scene.

The question the card puts to the player after a fall: "That did not work. What now?", and their own words are an answer every time they are a new way. The moment a player would retell: "My first idea failed, and so did the second. I came at it a third way, and that one worked." Or: "I ran out of ideas and paid like everyone else."

## Consequences

**Rules, as tests** (for E; under C, and the order of refusals, amendment §5 and §13).
1. One own move at a time. `own_move` while a move is among the card's choices is refused `own_move_taken`; after a fall it is accepted again from a seat with a say and no word. The engine counts no falls.
2. No way twice. On one card no skill-and-success pair is rolled twice, and none falls twice: after a fall that rolled, the same pair is refused `bad_own_move`; after a fall with no roll (`roll: null`: the proposer down, or an engine error) it is accepted once more, and refused after its second fall of either kind. The refusal names the pair, so the DM can answer from it.
3. Every move follows every rule of the first: the three cases of design §1.8, the optional failure, the roll before `card_resolved` when no failure is named, the words taken back on a fall, the same tally. A move that names a failure decides the card either way.
4. The human's seat shows the own-move line whenever no move is among the choices, after any number of falls, and the card prompt is the same line on every card.
5. A table rule: an AI player's `own_move` tool is refused on a card where two own moves have fallen, whoever made them, and its briefing invites a move only before the first fall. So a card with no human at it logs at most two `own_move_set`, two falls and three ask rounds.
6. The deed `own_move_<card>` does not change: one per card, written at the first `own_move_ran`, first record kept (0079, Stas: «один всегда один»). So its `by` is the first try's voters, whichever move worked in the end (question 5).
7. After a fall the `card_words` wake, and the next fall's wake, name every move that fell on this card in this run: who, their words, the skill, the success choice, rolled or not.
8. Not testable, so counted: how the DM maps later words, and whether a later move unsays an earlier one. The report lists a card's moves side by side, every answer after a fall that made no move, and the falls per card.

**What follows.**
- 0068's "no retry" now reads "no skill-and-success pair is rolled twice on a card", and 0079's "one own move per card, tried or not" becomes "one own move at a time". One contract version with no change of shape, two PRs on top of table #386, AGT-113 wider, AGT-114 unchanged (amendment §5 to §9, §12).
- The seat gains no line: the two fall lines are reworded, and the first draft's rule 7, its question 6 and «Номер выбора.» are gone, because under E no card stops taking the human's words after a fall (amendment §15). Zoya's two conditions are carried by rule 7 and one clause in the wake; nothing tests the second (amendment §4).
- **Most likely to sink it:** on a second or third try the DM lands on a way that fell and the player is answered again, or it gets past the refusal with a skill the words do not earn. Then the wall has moved from the count to the same way. Cheapest test, before any code: Vera's blind read of the amendment's §15 stretch, which has a same-way answer in it; then the side-by-side list in the all-AI half.

## Questions for Stas

1. **C or E?** Recommended: E, with no price (option D). The PRs are the same. C adds at most about 100 s a card to a run; E adds about 100 s for every further try that falls, with no ceiling at the human's seat, where a 39-minute run has room for 47 such tries at the caps. Owed first: Vera's read of E's lines and Zoya's check of E.
2. **Where are AI seats bounded, and at what?** Recommended: in the table, in the AI player's tool, at two fallen moves a card, so the all-AI half walks a second try before he sits down. Alternatives: the first move only (today's tool unchanged, and a path the first run never tests); or a rule in the world crate on `Table.tie_breaker` (it can be built, and gives the tie-breaker a second job).
3. **May a move that was never rolled be said again as it was, once** (rule 2)? Recommended: yes. Read 3 in table #386 is this case. A second `roll: null` closes that way.
4. **`m12-own-move` with several moves on a card.** Recommended: each move is read on its own by design §8; a fall counts once its card is settled, on a written choice or on a later move; a later move's fallback-vote check starts at the fall before it; the deed is the card's one record. This is an exit row's reading, so it is his.
5. **The deed names the first try's voters** (rule 6), also when another seat's later way is the one that worked. Recommended: leave it for this milestone. Nothing reads `by` on this deed but the report, which lists every move's voters. The alternative, one record written when the card leaves the table with everyone who stood behind any move, re-records API-61's fall cases and rewords design §8; it belongs to the design of the deed's reader. His «один всегда один» settled the id, not whose names.
6. **A rule I follow where the rules are silent:** after a fall the seats' written words stand, and only the freed seats, those whose word was for the move, may make the next one, because `own_move` needs a seat with no word. A seat that picked a number cannot take it back for a new idea.
7. **Only if he picks C: the seat after the last fall.** Recommended: the seat stops inviting, because it must not offer what the card ignores; and the wording is unsolved, since «Номер выбора.» is where Vera gave up. A new wording with its own read is owed before C ships.

## Readers

All five were run by the calling thread on 2026-11-14 with the repo's own `vera` and `zoya` agents (`.claude/agents/`), not the cloud fallback. The last two are reads of option E. Vera's questions on C's lines, the thread's read and Zoya's flags and fixes are in the amendment's §17, unchanged.

**Vera, the read that opened this record** (blind; the fall line «Не получилось. Решайте, что теперь, по списку ниже.», then words typed and only answered, then «Дорога всё ещё ждёт вашего слова: выбор от 1 до 2.»). That last line was a wording the thread tried and then reverted: on the branch `stillWaits` reads «Дорога всё ещё ждёт вашего слова: выбор от 1 до ${count} или своими словами.» (`game/src/table/words.ts`). So the echo she read did not repeat the invitation, and the one on the branch does. Section 3 verbatim:

> На строке «Дорога всё ещё ждёт вашего слова: выбор от 1 до 2». Прямо «вы ввели неправильно» мне не сказали, но я услышала именно это: моё предложение прозвучало как реплика в сторону, а игра терпеливо подождала, пока я замолчу, и повторила вопрос. После этого я перестала бы предлагать своё и просто нажимала бы 1 или 2. Ноутбук я бы пока не закрыла, но дальше выбирала бы уже не я, а список.

**Vera, option C's lines as a seat stretch** (blind: a first move fails, «Не получилось. Можно попробовать по-другому, ещё один раз, или выбрать из списка.», a second move fails, the last-fall line, the own-move line gone, «Номер выбора.»; the never-tried variant shown too), section 3 verbatim:

> Когда третий пункт исчез и внизу осталось только «Номер выбора.» Мне не сказали, что я написала неправильно, этого не было. Но две мои идеи подряд отклонили без объяснений, и я поняла: моих слов здесь больше не ждут. С этого места я бы просто нажала «2», не думая. Ноутбук я бы не закрыла, но уже не чувствовала бы, что выбираю я.

**Zoya, board check of `wend` with this file as it stood with option C proposed**, verdict verbatim:

> Zoya, board check of `wend` with 0081: the board holds. No row breaks, no deed is added or lost, and the bible argues for the second try (Story-space 1; the failed roll as the better scene), on two conditions for the director: a person who saw the first try answers the second one knowing it, and on a card where someone asked the party a question, the second move never unsays the first. One row stays owed, `own_move_<card>`, with a new note: on a card with two moves, the deed's first record is always the fall.

**Vera, option E's lines as a seat stretch** (blind; the amendment's §15 stretch: two moves that fail with «Не получилось. Можно попробовать иначе, своими словами, или выбрать из списка.», the same way said again and answered by the person in the scene, then «Дорога всё ещё ждёт вашего слова: выбор от 1 до 2 или своими словами.», a fourth way that works), section 3 verbatim:

> Нигде. Каждый раз я выбирала сама, и последняя моя мысль, с верёвкой и ивой, сработала, а это приятно. Ближе всего к «вы ввели неправильно» было «Сказано за столом» вместе с «выбор от 1 до 2». Возница уже ответил мне по-человечески, а тут сверху ещё голос анкеты, и я на миг почувствовала себя ученицей, которую поправили. Ноутбук я бы не закрыла.

From her questions: «"Не получилось." Дважды подряд, слово в слово... Во второй раз я это уже слышу как автоответчик.» and «"своими словами" на одном экране три-четыре раза». Thread's read: E is the first shape in which she is nowhere a passenger; what is left is AGT-114's work (the «Сказано за столом» echo after a person already answered, the repeated fall line, «своими словами» three times).

**Zoya, board check of `wend` with this file and the amendment, option E proposed**, verdict verbatim:

> Zoya, board check of `wend` with 0081 as revised to option E: the board holds. No row breaks, no deed is added or lost, and the bible argues for E over C (Story-space 1, never a passenger; guardrail 5; the failed roll as the better scene). That is on my two conditions, and the amendment's carriers hold them only with two small fixes. First, in the fall's wake the person on the card answers each try from where their last answer left off, one step further, and never so far that they give way or leave, so the world does not sit and wait while the table tries again. Second, words that unsay an earlier try are answered by that person holding the table to what it already said, not by a bare answer. One row stays owed, `own_move_<card>`: on a card with several moves its one record is the first try's, which is always a fall, whoever's way worked in the end.

Her two fixes are folded into the amendment's §7 (items 3 and 4), and she queues one bible line for Consequence 2.

## Revisit when

- An exit pair's report shows more than three falls on one card at the human's seat, or a run past 120 minutes where further tries are the overrun: then a count comes back, set from that report.
- An exit pair's reports show a later move refused as the same way, or let through with a skill the words did not earn, more than once: then the same-way test is the wrong judge.
- A Vera read of several falls names a later fall as where she stops, or an exit pair has falls at the human's seat and no new move after any of them: then the count was never the wall, and the next question is the fall's text (why it failed), 0079's plain table line, or A's honest prompt.
- The dramaturg mechanism designs a reader for `own_move_<card>`: whose names it carries, and whether "tried three times" travels with the words, are that design's questions.

## Sources

- Stas's ask and his question on option E (2026-11-14), with Vera's two reads; table #386's description (three Vera reads); `docs/design/m12-own-move-amendment.md` §3, §7, §11, §15, §16; `docs/design/m12-own-move-after-a-fall-amendment.md`; `docs/design/m12-system-design.md` §1.2, §1.4 to §1.8, §8, §10 item 3, §11; decisions 0057, 0058, 0062, 0068, 0079; `docs/scope/not-a-passenger-scope.md` §3, §4 row 2; CLAUDE.md Rules 3, 5 and 6.
- The code as it stands on `table/m12-agt-112-own-move-fall-at-table`: `crates/nat20-world/src/deck.rs` (`own_move`, `own_move_fell`, `settle`, `OwnMove.spent`, `Table.tie_breaker`), `crates/nat20-api-server/src/session/cards.rs` (`resolve_own_move_alone`) and `campaign.rs` (`table`), `crates/nat20-api-contract/src/envelope.rs` (`start_campaign.human`), `game/src/table/loop.ts` (`ownMoveFell`, `fellSince`, `cardRound`, `cardWords`, `humanCard`, `cardLines`), `game/src/table/tools.ts` (`ownMove`, `ownMoveOrAnswer`), `game/src/table/words.ts`, `game/src/play/exit.ts` (`ownMovesMet`, `counted`), `game/src/agents/dm.ts` and `player.ts` (the wake caps).
- The number: 0080 is taken by table #383 (`table/content-test-layers`, Proposed); no branch or open PR holds 0081 (checked 2026-11-14).
