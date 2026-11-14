# Milestone 12 amendment: an own move when no choice fits

Status: Proposed (2026-11-14). Amends `docs/design/m12-system-design.md` §1.1, §1.2, §1.4, §1.5, §1.8, §8 and §11; decision 0079 (Proposed) refines 0068. The direction is Stas's (exit run 2 thread, 2026-11-14 02:23Z); the shape is for him to accept or reject.

Why a file of its own: the M12 design is Accepted, and Lev edits only Proposed drafts. The rule itself is folded into the accepted design in table #381 (§13); this file keeps the reasons, the contract goals, the PR list and the readers' quotes.

**Goals, from the ask** (no scope of its own):
1. When a choice fits the words' success and none can take the failure, the own move still goes on the card.
2. When no choice fits at all, the DM answers the words and never rules how the attempt turned out.
3. Four seat lines from the same run stop a first-time reader no longer.

**Evidence.** Stas's exit run 2, `full-2026-11-14T01-42-04-072Z`, build ecd1f9e: 9 answers in his own words, 0 own moves. Seven were questions or jokes. Two were plans: «Дать хлеб ворону НО не ведьме!» on `bog_wifes_toll` (success `bread`; `walk_past` breaks a custom, `true_word` is an act not asked for, so no failure is legal), and «Предложить пойти дальше с вами и парня с собой забрать» on `salt_on_credit` (no choice is "take them along"; the DM told the woman's refusal as fact and kept it with `remember`). Counted over the 44 cards in the decks: the engine's rule alone leaves one success with no legal failure (`peddler`); the prompt's "deliberate act" rule is judged per words and closed one of the two cards that got a plan.

## 1. Summary

- A player's own move no longer needs a failure choice. If the table votes for it and the roll fails, nothing is decided for them: the DM tells how it fell short, the card is still there, and they pick a written choice. Words the card cannot carry get an answer in the scene and nothing is ruled.
- The seat stops repeating itself: no "the road still waits" line after every answer, the card's paragraph once, a payment that is not a toll not called one, no Second Wind offered to a healthy fighter on the road.
- **The moment a player would retell:** "I tried to feed the raven and not the witch. The dice said no, the old woman laughed at me, and Maren gave her the bread after all."

## 2. Records

| Fact | Who writes it, when | Who reads it | Where the player sees it |
| --- | --- | --- | --- |
| `own_move_set` with no `failure` | the server, when the DM puts the move on the card | the run report (moves with and without a failure), the verdict row | the move as a numbered choice in their own words (§1.6 of the design, unchanged) |
| `own_move_ran {choice: null, roll}` | the server, when the move named no failure and the roll fails, the proposer is down, or the engine cannot roll | the game loop (the DM's wake for the fall, the card back to the seats), the run report, the verdict row | the roll line, the DM's one or two sentences, a line that the move did not work (draft, §12), the written choices again |
| the pending card's own move, marked spent (`CardDm.own_move.spent`) | the world crate, on that fall | the views (`own_move` is no longer among the card's choices) and the `own_move` command (`own_move_taken`) | no own-move line and no "Your move" choice on the card |
| the deed `own_move_<card>` | the world, whenever `own_move_ran` is logged, whatever it brought | the run report and the verdict row; no card in M12 | nowhere yet: owed on Zoya's board, left unread on purpose by decision 0068 |
| `wake` on a transcript `memory` record | the game loop, when the DM calls `remember` | the run report: facts kept in a `card_words` wake that made no move | nowhere; it is the check on rule 6 below |

No new deed id: `own_move_tried_<card>` would be a second deed nothing reads (question 1).

## 3. The rule

The one statement is the first bullet of §1.8 in the accepted design. As tests:

1. `own_move` with no `failure` is accepted when `success` is offered on the card; every refusal of today stands.
2. For a move with no `failure`, `card_resolved` is logged only after a successful roll. A failed roll, a downed proposer or an engine error at the roll (both `roll: null`) logs `own_move_ran` with `choice: null` and no `card_resolved`; the card is still on the table.
3. After that fall: every word given for `own_move` is taken back (advice included) and the other words stand; on a player owner's card the freed Blades advise again before the owner calls; the card's choices no longer list `own_move`; a second `own_move` is refused `own_move_taken`; the words left are tallied at once and may settle the card; otherwise the freed seats that can still speak are asked, and the card settles by `choose_card` as a card with no own move would (one word per seat, the tally as today). An engine error at the roll is a fall with `roll: null`.
4. The deed `own_move_<card>` is in the deed book after every `own_move_ran`, with the `by` §1.5 of the design gives (the seats whose word was for `own_move`, or the owner alone on an owner's call).
5. A move that names a `failure` replays the accepted fixture byte for byte.
6. Not testable, so counted (§8 here): a narration from a `card_words` wake that put no move on the card tells no outcome, and no `remember` in that wake keeps one.

**What a fall costs: the move, and nothing else.** The party may still press the success choice's number. That is deliberate. A success gives nothing a number would not (the named choice runs in full, 0068), so a failure takes nothing a number would not; the roll decides whether the deed is done the player's way. Anything harsher (the success choice closing, lost time) punishes speaking in your own words, which is the opposite of the milestone.

## 4. Carrier per owed row

No new owed row. A tried move writes the deed 0068 already owes, `own_move_<card>`; Zoya's board keeps one row for it.

## 5. Contract

**Goals.**
- G1. An own move may name no failure choice.
- G2. With none, a failed roll or a downed proposer runs no choice and leaves the card on the table.
- G3. For a move with no failure, `card_resolved` is logged only after the move's own roll succeeds, so no client sees such a card resolved and then waiting. (The success choice's own check may still error after it, as any choice's does today.) A move that names a failure keeps the accepted order (G6).
- G4. One own move per card, tried or not.
- G5. Nothing hidden reaches a player view (Rule 3): players learn of the fall from their own view (`CardPlayer.own_move.spent`, the card's choices) and, when there was one, the public roll; `success`, `failure` and the DC stay DM only.
- G6. A move that names a failure, and every fixture line recorded for one, is unchanged.

**Proposal** (one PR, Rule 1 order; the next free version, dev.72 if it lands first): the shape is in the accepted design, §1.2 (command table, world crate, server, events, protocol §4.13, fixture cases, CHANGELOG line), not repeated here. In short: `own_move.failure` optional; `own_move_ran.choice` nullable; for a move with no failure the roll comes before `card_resolved`; no new event or reject reason; `CardDm.own_move` and `CardPlayer.own_move` gain `spent`. A new event (`own_move_fell`) was the alternative; the existing one already records "what the roll brought", and the verdict row reads it.

**Additive or breaking (Rule 2).** The request change is additive. Three response fields widen from a string to optional or null, which `check-breaking` will list; dev allows it with the CHANGELOG line.

## 6. Failure

- **The roll fails, no failure named:** §3. The party gets the roll line, the DM's sentences, and the card.
- **The `card_words` wake fails or times out:** as today: no move, the "Said at the table" line, the card waits.
- **The DM's wake for a fall fails:** the logged fallback; the seat still shows the roll line and the "did not work" line, and the card goes to the seats.
- **The DM names a failure the engine refuses:** as today it corrects within its retries; the refusal's message now says "or none".

## 7. The seat's lines from run 2

Each is one change, with where it lives.

- **(a) "The road still waits" after every answer.** After the DM answered the words, the seat adds no line: the choices are still pinned above the prompt. `game/src/table/loop.ts`, `humanCard`: drop the `saidAtTable` / `stillWaits` info after `cardWords` returns an answer; keep it only when the wake gave none. A correction to the run's read: at the Ink seat an `options` event is pinned above the prompt, not printed into the story (`game/src/ui/ink-seat.ts`, `show`, case `options`), so Stas's screen repeated the two-line info nine times, not the whole block. `seat.jsonl` logged the block nine times because `drawn` records every `show`; it should skip an `options` event equal to the list already pinned, so the next blind read sees what the screen showed.
- **(b) The card's paragraph twice.** Each card's text shows once at the seat. `game/src/table/seat-lines.ts`, `case "card_drawn"` (and the English path beside it): no line at call site `seat` when the loop's card panel follows (`humanCard`, the `onTheRoad` info); `/log` keeps it. Test: in a `seat.jsonl`, a drawn card's text appears once.
- **(c) A salt purchase called a toll.** Every card `pay` effect reaches the wire as `toll` (`crates/nat20-api-server/src/session/cards.rs`, `pay_world(…, LedgerReason::Toll)`), so the seat stops naming it: `game/src/table/seat-lines.ts` (the two `case "toll"` lines) and `game/src/view.ts` (`You pay … toll.`). The DM's narration says what the coins were for.
- **(d) Second Wind and potions on the road at full health.** Out of a fight, with the human's character at full Hit Points (their own sheet), the list has no Second Wind line and one potion line that opens its targets, never a line per target or "another target". `game/src/table/choices.ts`: `buildChoices`, `fightOnly`, and `optionItems`' `single` case; called from `offerChoices(false)` in `loop.ts`.

## 8. What the run report counts

In `game/src/play/exit.ts`, beside what §8 of the design lists:
- own moves put on a card: with a failure choice, without one; for each, rolled or not, and what `own_move_ran` named (a choice, or none);
- every answer in words that made no move: the card, the player's words, the DM's answer in full, and each `remember` fact kept in that wake. At most a dozen lines a run; Stas reads them for an outcome ruled in words (rule 6). Zoya reads the same list for cards whose choices the players keep walking around.

## 9. Out

- **A plain table line saying "this card cannot carry that"** for a plan like the salt one. It needs the DM to label its own answer, and a first-time player may hear "you typed it wrong". The report's list shows whether it is needed (question 3).
- **`remember` called in 2 of 9 `card_words` wakes** (lost: Fenn never sold his notes in twelve years; Rufus rides in from Saltmouth in spring). A backlog row, not this amendment: it is the DM's own voice across a run (decision 0034), a different concern, and this amendment narrows what `remember` may keep; asking for more of it in the same PR would blur what the next run shows. For that row: the loop already holds each answer (`cardAnswer` in `tools.ts`) and could keep it for the DM without a tool call.
- **The ledger's reason stays `toll`** for every card payment, and the wire's English text ("pays … in toll") with it: a reason per `pay` effect is a deck-format change that only line (c) would read.
- **A cost for a failed move** beyond the move itself: §3 says why not.

## 10. PRs

In order. Row ids, sizes and prices are Yan's.

| PR | What it lands | Depends on |
| --- | --- | --- |
| 0 | This amendment and decision 0079, with §13 folded into the accepted design, Zoya's board check and Vera's read of the lines in §12 | - |
| 1 | `own_move` without a failure on the wire: contract, protocol §4.13, the world crate's pending card, the server's roll-then-log, the fixture cases of design §1.2 (five new, the roster save and load after a fall among them), CHANGELOG | 0 accepted |
| 2 | The same at the table: `own_move_or_answer`'s `move.failure` optional; the `card_words` rule in `dm.ts` and `loop.ts` (`cardWords`); the `remember` tool's description; the fall (a `road` wake tells it, the "did not work" line, the seats asked again); words on a card that already has a move are only answered; `seat-lines.ts` takes a null `choice` | 1 |
| 3 | The run report and `m12-own-move`: §8 here, `wake` on `memory` records, the row's reading as Stas rules question 2 | 2 |
| 4 | The seat's four lines (a) to (d), one commit each, with a Vera read of a `seat.jsonl` stretch | - |
| 5 | Optional, drop first: a narration-judge flag kind for an answer to words on a card that tells an outcome with no roll in its engine lines. Without it the §8 list is read by a person | 3 |

## 11. What the next exit pair must show

On one build that carries PRs 1 to 4, the all-AI run first (decision 0066), then Stas's:
- `m12-own-move` passes as the scope words it, or as question 2 widens it;
- for every move with no failure in either run, the log holds the order of rule 2, and a fall is followed by the card settled on a written choice;
- the §8 list is in both reports, and Stas has read run 2's for an outcome ruled in words;
- in run 2's `seat.jsonl`: no "road still waits" line after an answered word, each card's text once, no "toll" on a payment that is not one, no Second Wind line on the road at full Hit Points;
- the Vera fallback reads from `seat.jsonl` a card where words were answered and, if the run has one, a fall; her answer is quoted verbatim.

## 12. Player-facing lines introduced or changed

For Vera, without this file:

| Where | Russian | English |
| --- | --- | --- |
| own move failed, the human's (new, draft: PR 2 rewords it with its own Vera read, §16) | «Ваш ход не удался. Теперь выберите из написанного.» | "Your move did not work. Now pick one of the written choices." |
| own move failed, another seat's (new, draft as above) | «Ход Брена не удался. Теперь выберите из написанного.» | "Bren's move did not work. Now pick one of the written choices." |
| a card payment, the human's (changed) | «Вы платите: 4 серебряных.» (was «Вы платите пошлину: 4 серебряных.») | "You pay 4 silver pieces." (was "You pay 4 silver pieces toll.") |
| a card payment, another's, Russian seat (changed) | «Брен платит: 4 серебряных.» (was «Брен платит пошлину: …») | unchanged: the wire's text |
| after an answered word on a card (removed) | «Сказано за столом: Дорога всё ещё ждёт вашего слова: выбор от 1 до 3 или своими словами.» no longer shows | "Said at the table: The road still waits for your word…" no longer shows |

## 13. Text for the accepted design

Folded into `docs/design/m12-system-design.md` in table #381: §1.1 steps 3, 5, 6, 7; §1.2 (the command table, `bad_own_move`, world crate, server, events, protocol, fixture, CHANGELOG); §1.4; §1.5; §1.8 (the rule's three cases, the DM tool, a fall, what it costs, the deed, tests, the run report); §8 `m12-own-move`; §11. The design is the one statement; this file does not repeat it.

## 14. Risks

- **Most likely to sink it: the DM stops naming failures** (the new §11 risk in the design). Cheapest test: the count in the all-AI run's report.
- **The card un-settled.** The world crate today takes a card off the table the moment the vote settles it; a move with no failure keeps it there until the roll. The fixture's fall case, then `choose_card`, is the test, and it is the first thing PR 1 writes.
- **The narration still rules.** A prompt line cannot stop a model telling a refusal. The §8 list makes it a dozen lines a person reads, and PR 5 an independent flag.
- **Exit row 4 and the seated count.** After a fall the loop logs `card <id> goes to the seats` again for the same card. Row 4's check already passes a repeated line (it looks for a framing narration before each); the report's count of cards seated would count the card twice, so PR 3 counts a card once.

## 15. Decisions for Stas

1. **One deed, not two.** A tried move writes `own_move_<card>`, the same deed as any own move, with no `own_move_tried_<card>`. Your direction named the second id as an example. Recommendation: one. 0068 gave the deed no result, and a second id is a second record nothing reads.
2. **Does a fall count for exit row 2?** The scope says "a card decided by Stas's own move". Today any rolled move passes, because a failed roll still decides the card. Under this amendment a move with no failure that fails decides nothing, so the row would hang on a d20. Recommendation: the row passes on Stas's own move rolled, its roll cited, its deed kept, and what the log names true (a branch run, or the card waiting and then settled on a written choice). It is a departure from scope §4 row 2, yours to accept. The amendment also departs from scope §2 item 1, which says the DM "names which of the card's existing choices a success and a failure bring" and, when no choice fits, "says so": a failure may now be absent, and words no choice fits get an answer in the scene, not a line saying the card cannot take them (§9, question 3). Accepting this PR accepts both departures; the scope file changes only with your agreement, in the PR that closes M12.
3. **A plan the card cannot carry still gets only words.** The salt plan would get an answer that settles nothing: the woman neither comes nor refuses. That is the direction as given, and it costs the player an honest "no". The alternative is a plain table line ("this card cannot take that; pick a written choice or try another way"), which needs the DM to label its answer. Recommendation: leave it for this pair and read the §8 list; two such plans in the next pair's reports, and the line or a card change is due (0079, Revisit).

## 16. Vera and Zoya

Both run on 2026-11-14 by the calling thread with the repo's `vera` and `zoya` agents. Vera read a seat stretch built from §12 (a card, an answer to words, the move as choice 4, a failed roll line, the fall line, the choices again, two payment lines), never this file.

**What the thread takes from them** (for Stas):
- The fall line «Ваш ход не удался. Теперь выберите из написанного.» is where Vera became a passenger, and Zoya hears «Ваш ход» as "your turn" and «выберите из написанного» as officialese. The wording is redone in PR 2 with its own Vera read; the rule (the move is spent) stays unless Stas changes it.
- Zoya disagrees with question 1: one id with no result means no reader can ever pay a fall off. Her smaller fix is the result inside the deed (already in 0079 Revisit), not a second id.
- Question 3: Zoya agrees answer-only, but "nothing is ruled" must not read as "nothing happens": the person reacts with what the plan costs them or asks something back, and a companion speaks. Its sentence is folded into the §1.8 prompt ("The scene still answers…"); Stas may strike it with question 3.
- «Вы платите: 4 серебряных.»: drop the colon (Zoya), and Vera asks whom and what for; the DM's narration carries that.

### Vera (repo `vera` agent), verbatim

> 1. Что я поняла
>
> Я Брен, на тропе у болота мне встретилась старуха с вороном. Она просит корку, монету или правдивое слово, а взамен даёт обереги. Мне захотелось её подразнить: хлеб отдать ворону, а ей не давать. Рассказчик сначала принял мою затею («отламываешь корку и протягиваешь её не старухе, а ворону»), и я подумала, что ход уже сделан. Потом мне всё-таки пришлось нажать 4. Дальше что-то бросили, у меня «не вышло», ворон отнёс корку старухе, и мне велели выбирать из трёх готовых вариантов. Скорее всего, я бы выбрала «Сказать ей что-то правдивое»: после её реплики про корзинку старуха мне стала интересна. Последние строки про серебро я поняла так: я и некая Торва заплатили по четыре монеты. За что и кому, не знаю.
>
> 2. Что я бы переспросила вслух
>
> - «Ваш ход: «Дать хлеб ворону, но не ведьме!»» под номером 4. Рассказчик ведь уже описал, как я протягиваю корку. Зачем нажимать ещё раз? Я решила, что без кнопки игра мой ход не засчитает, но тогда непонятно, что было в первом абзаце: уже действие или только примерка.
> - «Ловкость рук». Это про меня? Я ведь ничего не крала, я просто кормила ворона. По-моему, это какое-то умение моего героя, но никто не спросил, хочу ли я его применять.
> - «На кости 6, с навыком 8». Какие кости, я ничего не бросала. Почему восемь, это хорошо или плохо, и сколько нужно было выбросить? Цифры мне ничего не говорят.
> - «[r81]». Похоже на номер в каталоге, понятия не имею, что это.
> - «Ваш ход не удался. Теперь выберите из написанного». Звучит так, будто я ошиблась и меня поправили. Текст при этом ещё и противоречит сам себе: рассказчик рассказал, как всё вышло (ворон взял корку, старуха засмеялась), а меня называют проигравшей. Второе «своими словами» мне уже не предложили. Значит, теперь нельзя?
> - «ведьме». Это слово моё, и оно резкое, а рассказчик бережно держится за «старуху» и «болотную бабку». Я это заметила и одобряю. Но «старуха» стоит трижды на шести строках, это слишком близко.
> - «Вы платите: 4 серебряных. / Торва платит: 4 серебряных». Кто такая Торва, кому мы платим и за что? И почему «Вы», когда рассказчик говорит мне «ты»?
> - «Выборы». По-русски так говорят о голосовании. Я ждала «Что делать?» или «Варианты».
>
> 3. Где я стала пассажиром
>
> На строчке «Ваш ход не удался. Теперь выберите из написанного». Я написала своё, а мне выставили цифры, которых я не понимаю, сообщили о неудаче и забрали возможность писать самой. После этого я бы нажимала то, что предлагают. Ноутбук я бы не закрыла, но второй раз своими словами писать уже не стала бы.

Note: the DM sentences, the roll line's format and «Выборы» in that stretch are the thread's sample or today's seat, not lines this amendment adds.

### Zoya (repo `zoya` agent), board check of `wend` with this file, verbatim

> **Board check, wend, with the own-move amendment. Verdict: it holds the bible, with one tightening and two owed rows. The page stays open: the fall row is owed, not struck.**
>
> **Commandments**
> - **Guardrail 8 and Story-space 5: holds, by structure.** With no failure named, a failed roll runs no choice, and the card goes back to the human first. Case 1 still runs a failure choice the table never saw, because 0068 keeps it DM-only. My earlier ask to show it before the vote is still open.
> - **"A failed roll never acts for the player" is not in the bible.** The nearest rule is guardrail 8. I have queued it below.
> - **Story-space 1: half holds.** The human decides again. What they tried stays only in the DM's sentence and a bare id.
> - **Story-space 3, card test 4, failure as content: fails on the move.** On `bog_wifes_toll` a success runs `bread`, and a fall ends with someone pressing `bread`. Both ends equal a written choice. The only difference is `own_move_bog_wifes_toll`, and nothing reads it. Lev is right that a cost at the table punishes speaking. The cost belongs later, in the people: the card's note says Sedge talks to Gwyn. That needs a deed that tells a fall from a success.
> - **Question 1: I disagree with "one deed".** With one deed, no reader can ever pay off a fall. The smaller fix is not a second id but the result inside the deed, which 0068 and 0079's Revisit already list. Stas's call.
> - **§13 reverses my M12 note (d).** Words that simply are a choice now wait for that choice instead of deciding the card. That fits guardrail 8 better; taken.
>
> **Board (Milestone 12 rows)**
>
> | Setup | Set up | Pay-off | Carrier |
> | --- | --- | --- | --- |
> | `own_move_<card>` | any road card, own move | owed | none: a bare id gives a reader no cause to say aloud |
> | a fall (new) | any card, a move with no failure, roll failed | owed | none: it writes the same id as a success |
>
> The salt plan is not a deed, so it has no row; see the continuity read below.
>
> **Question 3**
> - **Answer-only is right.** A refusal with no roll is a failure ruled in narration, which guardrail 1 forbids. Run 2's `remember` carried that ruling forward.
> - **"Neither accepts nor refuses" must not mean nothing happens.** Story-space 2 says a scene resists. Rule for the prompt: the woman reacts with what the plan costs her or asks something back, and Maren speaks (Story-space 7; the card's note has Maren speak first). That is a reaction, not a verdict.
> - **Keep the plain table line out.** It risks guardrail 5 (a player told they typed it wrong).
> - **Continuity read, a question for Stas, not a draft:** the plan reached for the boy, who is the card's consequence on the young, and no choice on `salt_on_credit` touches him.
>
> **Vera**
> Not run here: this thread has no subagent tool. The §12 lines still need her blind read. Flags from me:
> - «Ваш ход» also reads as "your turn".
> - «выберите из написанного» reads as officialese.
> - In «Вы платите: 4 серебряных.» the colon reads like a form; drop it.
>
> **Amendment queue**
> 1. Guardrail: "A failed roll never runs a choice the table did not see." Why: case 2 holds this by structure, case 1 does not. Blocks: nothing.
> 2. Story-space 5, an added line: "With no roll, a person reacts to a plan; nobody accepts or refuses it." Why: the salt plan. Guardrail 1 implies it, but nothing says it. Blocks: the prompt wording in §13.
>
> Two rows owed, nothing struck. The page stays open until Stas rules on question 1 or strikes the fall row with a reason.
