# Milestone 12 amendment: an own move when no choice fits

Status: Proposed (2026-11-14). Amends `docs/design/m12-system-design.md` the Summary, §1.1, §1.2, §1.3, §1.4, §1.5, §1.6, §1.8, §8, §10 items 3 and 12 and §11; decision 0079 (Proposed) refines 0068. The direction is Stas's (exit run 2 thread, 2026-11-14 02:23Z), and so are the three answers in §15 (06:20Z); the whole is accepted when he merges table #381.

Why a file of its own: the M12 design is Accepted, and Lev edits only Proposed drafts. The rule itself is folded into the accepted design in table #381 (§13); this file keeps the reasons, the contract goals, the PR list and the readers' quotes.

**Goals, from the ask** (no scope of its own):
1. When a choice fits the words' success and none can take the failure, the own move still goes on the card.
2. When no choice fits at all, the DM answers the words and never rules how the attempt turned out.
3. Four seat lines from the same run stop a first-time reader no longer.

**Evidence.** Stas's exit run 2, `full-2026-11-14T01-42-04-072Z`, build ecd1f9e: 9 answers in his own words, 0 own moves. Seven were questions or jokes. Two were plans: «Дать хлеб ворону НО не ведьме!» on `bog_wifes_toll` (success `bread`; `walk_past` breaks a custom, `true_word` is an act not asked for, so no failure is legal), and «Предложить пойти дальше с вами и парня с собой забрать» on `salt_on_credit` (no choice is "take them along"; the DM told the woman's refusal as fact and kept it with `remember`). Counted over the 44 cards in the decks: the engine's rule alone leaves one success with no legal failure (`peddler`); the prompt's "deliberate act" rule is judged per words and closed one of the two cards that got a plan.

## 1. Summary

- A player's own move no longer needs a failure choice. If the table votes for it and the roll fails, nothing is decided for them: the DM tells how it fell short, and the card is decided on a written choice (at once if the other words settle it). Words the card cannot carry get an answer in the scene and nothing is ruled.
- The seat stops repeating itself: no "the road still waits" line after every answer, the card's paragraph once, a payment that is not a toll not called one, no Second Wind offered to a healthy fighter on the road.
- **The moment a player would retell:** "I tried to feed the raven and not the witch. The dice said no, the old woman laughed at me, and Maren gave her the bread after all."

## 2. Records

| Fact | Who writes it, when | Who reads it | Where the player sees it |
| --- | --- | --- | --- |
| `own_move_set` with no `failure` | the server, when the DM puts the move on the card | the run report (moves with and without a failure), the verdict row | the move as a numbered choice in their own words (§1.6 of the design; its own-move line and the AI tool are gone once a card has or had a move) |
| `own_move_ran {choice: null, roll}` | the server, when the move named no failure and the roll fails, the proposer is down, or the engine cannot roll | the game loop (the DM's wake for the fall, the card back to the seats), the run report, the verdict row | the roll line if there was a roll, the DM's one or two sentences, a line that the move did not work, or could not be tried with `roll: null` (drafts, §12), the written choices again, unless the words left settle the card (then only its settled wake) |
| the pending card's own move, marked spent (world crate only; the views show it as `own_move` no longer among the choices) | the world crate, on that fall | the views (`own_move` is no longer among the card's choices); the `own_move` command (`own_move_taken`) and `choose_card {choice: "own_move"}` (`unknown_choice`) | no own-move line and no "Your move" choice on the card |
| the deed `own_move_<card>` | the world, whenever `own_move_ran` is logged, whatever it brought | the run report and the verdict row; no card in M12 | nowhere yet: owed on Zoya's board, left unread on purpose by decision 0068 |
| `wake` on a transcript `memory` record | the game loop, when the DM calls `remember` | the run report: facts kept in a `card_words` wake that made no move | nowhere; it is the check on rule 6 below |

No new deed id: `own_move_tried_<card>` would be a second deed nothing reads (question 1).

## 3. The rule

The one statement is the first bullet of §1.8 in the accepted design. As tests:

1. `own_move` with no `failure` is accepted when `success` is offered on the card; every refusal of today stands.
2. For a move with no `failure`, `card_resolved` on `own_move` is logged only after a successful roll. A failed roll, a downed proposer or an engine error at the roll (both `roll: null`) logs `own_move_ran` with `choice: null` and no `card_resolved` on `own_move`; the card is still on the table unless the words left settle it (rule 3).
3. After that fall: every word given for `own_move` is taken back (advice included) and the other words stand; on a player owner's card the freed Blades who can still speak advise again before the owner calls; the card's choices no longer list `own_move`; a second `own_move` is refused `own_move_taken`; the words left are tallied at once and may settle the card; otherwise the Blades the card waits for (its `waiting_for`, read before each ask) and then a player owner (who keeps the call even when down) are asked, with no fallback in the round the fall happened in, and the card settles by `choose_card` as a card with no own move would (one word per seat, the tally as today). An engine error at the roll is a fall with `roll: null`.
4. The deed `own_move_<card>` is in the deed book after every `own_move_ran`, with the `by` of the vote that settled on `own_move`, unchanged, as §1.5 of the design gives (today's rules: the voters for `own_move` who were up at that settle, or the owner on an owner's call, even when down; it may be empty).
5. A move that names a `failure` replays the accepted fixture byte for byte.
6. Not testable, so counted (§8 here): a narration from a `card_words` wake that put no move on the card tells no outcome, and no `remember` in that wake keeps one.

**What a fall costs: the move, and nothing else.** The party may still press the success choice's number. That is deliberate. A success gives nothing a number would not (the named choice runs in full, 0068), so a failure takes nothing a number would not; the roll decides whether the deed is done the player's way. Anything harsher (the success choice closing, lost time) punishes speaking in your own words, which is the opposite of the milestone.

## 4. Carrier per owed row

No new owed row. A tried move writes the deed 0068 already owes, `own_move_<card>`; Zoya's board keeps one row for it. Her first check (§16) added a row for a fall; after Stas's ruling on question 1 she folds it into the `own_move_<card>` row (§16, follow-up), and the reason is in §15.1.

## 5. Contract

**Goals.**
- G1. An own move may name no failure choice.
- G2. With none, a failed roll, a downed proposer or an engine error at the roll runs no choice and leaves the card on the table, unless the words left settle it.
- G3. For a move with no failure, `card_resolved` on `own_move` is logged only after the move's own roll succeeds, so no client sees such a card resolved and then waiting. (The success choice's own check may still error after it, as any choice's does today.) A move that names a failure keeps the accepted order (G6).
- G4. One own move per card, tried or not.
- G5. Nothing hidden reaches a player view (Rule 3): players learn of the fall from their own view (`own_move` set but no longer among the choices) and, when there was one, the public roll; `success`, `failure` and the DC stay DM only.
- G6. A move that names a failure, and every fixture line recorded for one, is unchanged.

**Proposal** (one PR, Rule 1 order; the next free version, dev.72 if it lands first): the shape is in the accepted design, §1.2 (command table, world crate, server, events, protocol §4.13, fixture cases, CHANGELOG line), not repeated here. In short: `own_move.failure` optional; `own_move_ran.choice` nullable; for a move with no failure the roll comes before `card_resolved`; no new event or reject reason; no new view field: a fallen move stays in both views and leaves the choices. A new event (`own_move_fell`) was the alternative; the existing one already records "what the roll brought", and the verdict row reads it.

**Additive or breaking (Rule 2).** The request change is additive. Three response fields widen from a string to optional or null, which `check-breaking` will list; dev allows it with the CHANGELOG line.

## 6. Failure

- **The roll fails, no failure named:** §3. Every seat gets the roll line (if there was a roll) and the DM's sentences; the Blades the card waits for, then a player owner, get the card again (design §1.8).
- **The `card_words` wake fails or times out:** as today: no move, the "Said at the table" line, the card waits.
- **The DM's wake for a fall fails** (the fall's own wake, or the settled card's wake that tells a fall settled at once): the logged fallback; the seat still shows the roll line, if any; when the card still waits, the Blades it waits for and a player owner (as in design §1.8's fall bullet) also get the "did not work" or "never tried" line and are asked again; when it settled, no fall line shows (design §1.8).
- **The DM names a failure the engine refuses:** as today it corrects within its retries; the refusal's message now says "or none".

## 7. The seat's lines from run 2

Each is one change, with where it lives.

- **(a) "The road still waits" after every answer.** After the DM answered the words, the seat adds no line: the choices are still pinned above the prompt. `game/src/table/loop.ts`, `humanCard`: drop the `saidAtTable` / `stillWaits` info after `cardWords` returns an answer; keep it only when the wake gave none. A correction to the run's read: at the Ink seat an `options` event is pinned above the prompt, not printed into the story (`game/src/ui/ink-seat.ts`, `show`, case `options`), so Stas's screen repeated the two-line info nine times, not the whole block. `seat.jsonl` logged the block nine times because `drawn` records every `show`; it should skip an `options` event equal to the list already pinned, so the next blind read sees what the screen showed.
- **(b) The card's paragraph twice.** Each card's text shows once at the seat. `game/src/table/seat-lines.ts`, `case "card_drawn"` (and the English path beside it): no line at call site `seat` when the loop's card panel follows (`humanCard`, the `onTheRoad` info); `/log` keeps it. Test: in a `seat.jsonl`, a drawn card's text appears once.
- **(c) A salt purchase called a toll.** Every card `pay` effect reaches the wire as `toll` (`crates/nat20-api-server/src/session/cards.rs`, `pay_world(…, LedgerReason::Toll)`), so the seat stops naming it, for every payer and in both languages, by rewording each toll case, never deleting one (a deleted case falls to a default that names `world` as a person, or to no line at all): `game/src/table/seat-lines.ts` (the two `case "toll"` lines in `ledgerRu` and the English `enLine` ledger case, which today returns the wire text) and `game/src/view.ts` (`You pay … toll.`, and another seat's card payment, which today falls through to the wire's English "pays … in toll"). The DM's narration says what the coins were for.
- **(d) Second Wind and potions on the road at full health.** Out of a fight, with the human's character at full Hit Points (their own sheet), the list has no Second Wind line and one potion line that opens its targets, never a line per target or "another target". `game/src/table/choices.ts`: `buildChoices`, `fightOnly`, and `optionItems`' `single` case; called from `offerChoices(false)` in `loop.ts`.

## 8. What the run report counts

In `game/src/play/exit.ts`, beside what §8 of the design lists:
- own moves put on a card: with a failure choice, without one; for each, rolled or not, and what `own_move_ran` named (a choice, or none);
- every answer in words that made no move: the card, the player's words, the DM's answer in full, and each `remember` fact kept in that wake. At most a dozen lines a run; Stas reads them for an outcome ruled in words (rule 6). Zoya reads the same list for cards whose choices the players keep walking around.

## 9. Out

- **A plain table line saying "this card cannot carry that"** for a plan like the salt one. It needs the DM to label its own answer, and a first-time player may hear "you typed it wrong". The report's list shows whether it is needed (question 3).
- **`remember` called in 2 of 9 `card_words` wakes** (lost: Fenn never sold his notes in twelve years; Rufus rides in from Saltmouth in spring). A backlog row, not this amendment: it is the DM's own voice across a run (decision 0034), a different concern, and this amendment narrows what `remember` may keep; asking for more of it in the same PR would blur what the next run shows. For that row: the loop already holds each answer (`cardAnswer` in `tools.ts`) and could keep it for the DM without a tool call.
- **The ledger's reason stays `toll`** for every card payment, and the wire's English text ("pays … in toll") with it, which the seat no longer prints (§7 c): a reason per `pay` effect is a deck-format change that only line (c) would read.
- **A cost for a failed move** beyond the move itself: §3 says why not.

## 10. PRs

In order. Row ids, sizes and prices are Yan's.

| PR | What it lands | Depends on |
| --- | --- | --- |
| 0 | This amendment and decision 0079, with §13 folded into the accepted design, Zoya's board check and Vera's read of the lines in §12 | - |
| 1 | `own_move` without a failure on the wire: contract, protocol §4.13, the world crate's pending card, the server's roll-then-log, the fixture cases of design §1.2 (six new, the roster save and load after a fall among them), CHANGELOG; 0079, its index row and 0068's row ("amended by 0079") marked Accepted | 0 accepted |
| 2 | The same at the table: `own_move_or_answer`'s `move.failure` optional; the `card_words` rule in `dm.ts` and `loop.ts` (`cardWords`); the `remember` tool's description; the fall (a `road` wake tells it, the "did not work" and "never tried" lines with one Vera read, the seats asked again, the settled card's wake told of a fall); words on a card that already has a move are only answered; `seat-lines.ts` takes a null `choice` | 1 |
| 3 | The run report and `m12-own-move`: §8 here, `wake` on `memory` records, the row counts a fall (question 2, Stas: yes) | 2 |
| 4 | The seat's four lines (a) to (d), one commit each, with a Vera read of a `seat.jsonl` stretch | - |
| 5 | Optional, drop first: a narration-judge flag kind for an answer to words on a card that tells an outcome with no roll in its engine lines. Without it the §8 list is read by a person | 3 |

## 11. What the next exit pair must show

On one build that carries PRs 1 to 4, the all-AI run first (decision 0066), then Stas's:
- `m12-own-move` passes on a card decided by the run's own move, or on a move that fell (question 2);
- for every move with no failure in either run, the log holds the order of rule 2, and a fall is followed by the card settled on a written choice;
- the §8 list is in both reports, and Stas has read run 2's for an outcome ruled in words;
- in run 2's `seat.jsonl`: no "road still waits" line after an answered word, each card's text once, no "toll" or «пошлин» on any card payment, for any payer, in either language, no Second Wind line on the road at full Hit Points;
- the Vera fallback reads from `seat.jsonl` a card where words were answered and, if the run has one, a fall; her answer is quoted verbatim.

## 12. Player-facing lines introduced or changed

For Vera, without this file:

| Where | Russian | English |
| --- | --- | --- |
| own move failed, the human's (new, draft: PR 2 rewords it with its own Vera read, §16) | «Ваш ход не удался. Теперь выберите из написанного.» | "Your move did not work. Now pick one of the written choices." |
| own move never tried (`roll: null`), the human's or another's (new) | wording in PR 2, with the same Vera read | wording in PR 2 |
| own move failed, another seat's (new, draft as above) | «Ход Торвы не удался. Теперь выберите из написанного.» | "Torva's move did not work. Now pick one of the written choices." |
| a card payment, the human's (changed) | «Вы платите: 4 серебряных.» (was «Вы платите пошлину: 4 серебряных.») | "You pay 4 silver pieces." (was "You pay 4 silver pieces toll.") |
| a card payment, another's, Russian seat (changed) | «Торва платит: 4 серебряных.» (was «Торва платит пошлину: …») | "Torva pays 4 silver pieces." (was the wire's "pays … in toll") |
| after an answered word on a card (removed) | «Сказано за столом: Дорога всё ещё ждёт вашего слова: выбор от 1 до 3 или своими словами.» no longer shows | "Said at the table: The road still waits for your word…" no longer shows |

## 13. Text for the accepted design

Folded into `docs/design/m12-system-design.md` in table #381: §1.1 steps 3, 5, 6, 7; §1.2 (the command table, `bad_own_move`, world crate, server, events, protocol, fixture, CHANGELOG); §1.4; §1.5; §1.6 (the own-move line and the AI tool after a fall); §1.8 (the rule's three cases, the DM tool, a fall, what it costs, the deed, tests, the run report); §8 `m12-own-move`; §10 item 12 (the scope departures); §11. The design is the one statement; this file does not repeat it.

## 14. Risks

- **Most likely to sink it: the DM stops naming failures** (the new §11 risk in the design). Cheapest test: the count in the all-AI run's report.
- **The card un-settled.** The world crate today takes a card off the table the moment the vote settles it; a move with no failure keeps it there until the roll. The fixture's fall case, then `choose_card`, is the test, and it is the first thing PR 1 writes.
- **The narration still rules.** A prompt line cannot stop a model telling a refusal. The §8 list makes it a dozen lines a person reads, and PR 5 an independent flag.
- **Exit row 4 and the seated count.** After a fall the loop logs `card <id> goes to the seats` again for the same card. Row 4's check already passes a repeated line (it looks for a framing narration before each); the report's count of cards seated would count the card twice, so PR 3 counts a card once.

## 15. Decisions for Stas

1. **One deed, with no result in it: decided (Stas, 2026-11-14 06:20Z).** «Поступок own_move_\<card> один всегда один! Как ты можешь написать провал если сам поступок не известен - согласан со Львом, вопрос к нему тогда как мы решаем за последствия от провала». A tried move writes `own_move_<card>`, the same deed as any own move: no `own_move_tried_<card>`, and no result inside the deed either (Zoya's fallback, §16), because a "failed" mark says nothing while what was tried is free words no reader has. His follow-up, how the consequences of a fall are then decided, is answered in §15.1.
2. **Does a fall count for exit row 2? Yes: decided (Stas, 2026-11-14 06:20Z, «Засчитывать ли провал в m12-own-move? Да»).** The scope says "a card decided by Stas's own move". Today any rolled move passes, because a failed roll still decides the card. Under this amendment a move with no failure that fails decides nothing, so the row would hang on a d20. For the run's own move (an AI's in run 1, yours in run 2): the row passes on the move put on the card and decided on, its roll cited when there was one (a `roll: null` fall counts, the proposer down or an engine error: the move was put on the card and decided on, and a rare engine fault should not fail the player's row), its deed kept, and what the log names true (a branch run, or the card then settled on a written choice). It is a departure from scope §4 row 2. The amendment also departs from scope §2 item 1, which says the DM "names which of the card's existing choices a success and a failure bring" and, when no choice fits, "says so": a failure may now be absent, and words no choice fits get an answer in the scene, not a line saying the card cannot take them (§9, question 3). Stas's yes accepts the first; his answer to question 3 accepts the second's "says so" half, and an optional failure is accepted with the merge (design §10 item 12). The scope file changes only in the PR that closes M12.
3. **A plan the card cannot carry still gets only words: decided (Stas, 2026-11-14 06:20Z, «План с солью: только ответ в сцене, человек реагирует и это логично»).** The salt plan would get an answer that settles nothing: the woman neither comes nor refuses. That is the direction as given, and it costs the player an honest "no". The alternative is a plain table line ("this card cannot take that; pick a written choice or try another way"), which needs the DM to label its answer. Leave it for this pair and read the §8 list; two such plans in the next pair's reports, and the line or a card change is due (0079, Revisit). Zoya's sentence that the person still reacts stays in the §1.8 prompt.

### 15.1 What a fall brings (answer to Stas's follow-up on question 1)

**Today, under this amendment.** Nobody decides a consequence for a fall, because it has none of its own. The example is `bog_wifes_toll`, the move «Дать хлеб ворону НО не ведьме!», success `bread`, no failure named.

| Part of a fall | Who decides it | Record | The player sees | Met again later |
| --- | --- | --- | --- | --- |
| that the move fell | the engine: the proposer's roll against the ladder DC (Rule 4); no roll when the proposer is down or the engine cannot roll | the roll in the engine log, cited in the transcript; `own_move_ran {choice: null, roll}` in the run's log, DM only | the roll line (none with `roll: null`) | no |
| how it fell short | nobody: the DM tells it in one or two sentences from the player's words and the roll, and its wake forbids it to change anything or tell a choice happening (design §1.8) | the transcript, read by the narration judge; the DM may keep it in its own notes for the run (decision 0034), which are its voice and not the world's record | the sentences | only if the DM brings it up in the same run; nothing promises it |
| the move is spent | the world crate | the waiting card (`own_move` set, no longer offered); gone when the card resolves | the line that the move did not work, and no own-move choice | no |
| what happens in the world | the table, by a written choice; the deck file says what that choice brings | the deed book, the customs, the cargo: `bread` takes one ration, writes `sedge_charm` and keeps `bread_shared`; `true_word` writes `sedge_charm` and `told_sedge_a_true_word`; `walk_past` writes `snubbed_sedge` and breaks `bread_shared` | the choice's own lines and the DM's narration | yes: five choices in the Wend decks read `sedge_charm` or `snubbed_sedge` |
| that a move was made here | the world, on `own_move_ran` | the deed `own_move_bog_wifes_toll {by, day, contract}`, the same after a success | nothing | no reader in M12 (0068) |

**Not remembered by the world:** that the move fell, and what was tried. After the run only its own log tells a fall from a success (`own_move_ran.choice` is null) and holds the words (`card_own_move`); the deed book holds neither. A fall is a scene at the table and nothing after it; what the world keeps is the written choice the table then picks.

**Is that enough for M12: yes, nothing is due now.** This is the author's read of his own mechanism; Zoya's objection (§16) stands beside it.
- Zoya is right about the record: after a fall and then `bread`, the deed book equals a success's. At the seat the two differ only in the telling: the player's way, or the plain way after the try. With one deed and no result that is all the difference there can be, and a cost at the table is ruled out in §3.
- So a failure is content once, at the table (the roll line and the DM's sentences), and never later; a success is not met later either. Both are the one debt 0068 leaves unread on purpose, the `own_move_<card>` row, into which Zoya folded her fall row (§16, follow-up).
- The one change weighed and not proposed: when a card that had a fallen move later settles on a written choice, its wake could carry the move's words from the card, so the narration says "after all". The DM told the fall in the same run a few turns earlier, so it is not due until an exit run shows such a settle told as if nothing had been tried.

**What the dramaturg mechanism reads.** From the deed: that the party made a move of its own on this card, who and when. That is enough for an `if`, and it cannot tell a fall from a success. For a person in the world to say it aloud it needs the player's words, which today live only in the run's log; carrying them into the world's record is that milestone's first question for this row (design §1.5, 0068 Revisit). One warning for that design: a narrator given the words and not the result will make the result up, so it either forbids telling how the attempt came out, or asks Stas then whether the result travels with the words. Not reopened here.

**No change to the rule:** design §1.5 (the deed carries no result) and §1.8 (a fall costs the move and nothing else) already say this. The one text folded from this answer is Zoya's tightening of the fall's wake in §1.8 (§16, follow-up).

## 16. Vera and Zoya

Both run on 2026-11-14 by the calling thread with the repo's `vera` and `zoya` agents. Vera read a seat stretch built from §12 (a card, an answer to words, the move as choice 4, a failed roll line, the fall line, the choices again, two payment lines), never this file.

**What the thread takes from them** (for Stas):
- The fall line «Ваш ход не удался. Теперь выберите из написанного.» is where Vera became a passenger, and Zoya hears «Ваш ход» as "your turn" and «выберите из написанного» as officialese. The wording is redone in PR 2 with its own Vera read; the rule (the move is spent) stays unless Stas changes it.
- Zoya disagrees with question 1: one id with no result means no reader can ever pay a fall off. Her smaller fix is the result inside the deed, not a second id. Stas ruled against both on 2026-11-14 (§15, question 1); what a fall then brings is in §15.1, and she folded her fall row into the `own_move_<card>` row (follow-up below).
- Question 3: Zoya agrees answer-only, but "nothing is ruled" must not read as "nothing happens": the person reacts with what the plan costs them or asks something back, and a companion speaks. Its sentence is folded into the §1.8 prompt ("The scene still answers…"), and Stas kept it with question 3.
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

### Zoya (repo `zoya` agent), follow-up after Stas's ruling, verbatim

Run on 2026-11-14 by the calling thread, on this file with §15.1. Her tightening (item 4) is folded into the fall's wake in design §1.8 as a sentence of its own, not the `card_words` one, whose wording differs ("the person says what the plan would cost them or asks something back"): "The scene still answers: a person on the card, if there is one, reacts to the try, and a companion may speak." "If there is one" because many road cards have no person on them; the wake's own "never tell any of the card's choices happening" keeps the reaction from deciding the card. The clause on the human's feelings is left out, because the DM's prompt already carries it ("never decide for them what their characters do, feel or say"); a §1.8 loop test checks the sentence is in the wake.

> 1. **`own_move_<card>`: keep it, owed.** Reason: Consequence 2 says deeds come back. Decision 0068 leaves this one unread on purpose, which means it is owed, not finished. Carrier: none yet. It needs the player's words carried into the world's record (0079, Revisit), and a reader that tells what was tried, never how it came out (guardrail 1).
> 2. **"A fall": fold it into the `own_move_<card>` row, don't strike it.** Reason: by Stas's ruling a fall writes no deed of its own. Its pay-off happens in the same scene: the roll, the DM's sentences, and the written choice's deeds, which already have readers (five Wend choices read `sedge_charm` or `snubbed_sedge`). What it leaves owed is the player's words, and that is the first row's carrier gap. Striking it outright would lose the warning that a later reader must not invent the result.
> 3. **Lev's §15.1 holds the bible within the ruling.**
>    - Guardrail 8 holds by structure: a fall runs no choice, and the human picks again.
>    - Story-space 3 holds: the fall costs the move, and the card still ends on a written choice that costs something.
>    - Story-space 1 still holds only halfway, as I said before. The try stays at the table, not in the world. That is the ruling, and I am not reopening it.
>    - Failure as content holds once, at the table. That is enough only if the fall's telling is a scene.
> 4. **One tightening.** The fall wake's prompt in design §1.8 ("tell how the attempt falls short, in one or two sentences… nobody is worse off") has no person in it. Add the sentence the `card_words` branch already carries: "The scene still answers: the person on the card reacts to the try, and a companion may speak; never what the human's character feels." Otherwise the failed roll, which should be the better scene, gets told as a summary. Lev's own retell moment ("the old woman laughed at me") needs this line to exist in the prompt. Bible basis: Story-space 2, 5 and 7.
> 5. **My page stays open, on one row.** `own_move_<card>` is owed to the milestone that brings in the dramaturg mechanism. It closes when that design carries the words to a reader, or when Stas strikes it with a reason. The fall question is closed.
> 6. **Not blocking the page.** Amendment queue items 1 and 2 still wait for the bible: item 2's sentence is already in the `card_words` prompt (§1.8), and item 1 blocks nothing. PR 2's reworded fall line still needs its own Vera read.
