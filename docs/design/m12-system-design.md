# Milestone 12, Not a passenger («Не пассажир»): system design

Status: Proposed, 2026-11-08, for Stas. Written for phase 2 of the scope, accepted in table #336 (`docs/scope/not-a-passenger-scope.md` §5); phase 1 (MAP-15, MAP-17) runs on its own rows and is not designed here. It answers the 13 questions of the scope's §6. The rows of §7 go into `TASKS.md` in this PR only after Stas accepts this design (scope §9, answer 4; the scope merged alone, so the design and the rows share this PR). Decision 0068 records the own move's shape, in this PR.

## Summary

- **Own move** is one new DM command, `own_move`, contract 1.0.0-dev.68. It adds the player's words to the card on the table as one more choice, `own_move`, with a check and two of the card's own choices for success and failure. The seats vote on it like any choice. If the card is decided on it, the engine rolls the check and runs the named choice in full, and writes the deed `own_move_<card>`. No new outcome, cost or deed can come from the DM.
- **Card order and AGT-97** need no record: the card waits on the seat for the wake that frames it, and a wake ends when its narration returns. Both are in the game loop; decision 0041 stands as written.
- **One language at the seat** confirms decision 0067, option C: the table renders the seat's lines from event fields, the packs carry `text_ru` beside `text`, as `map.json` already carries `name_ru`, and the wire, fixtures, transcript and prompts stay English byte for byte.
- **The run records what the seat showed** in a new `seat.jsonl` when a human sits at it. Exit row 5 and AGT-13's read come from it, not from the transcript, which never held the seat's panels. Exit row 4 reads one new loop line in the transcript, in both runs.
- **16 PRs, not 19**: ENG-43 folds into API-56, AGT-97 shares AGT-100's PR, and AGT-101 shares AGT-99's (§9).

## 1. Own move (questions 1 to 7)

### 1.1 One own move, from words to deed

1. A card is on the table. The seat shows its choices and, last and unnumbered, the own-move line (§1.6).
2. A player says something else: the human types words, or an AI player calls its `own_move` tool with one sentence. The human's words take today's path (AGT-96, table #329: `humanCard` declares them and wakes the DM). An AI player's tool only records its words; when its card wake returns, the loop runs the same step for it. Both go through one loop function, `cardWords(handle, words)`, and one DM wake, `card_words`.
3. In that wake the DM has one tool for the answer, `own_move_or_answer` (§1.8). With an own move it names the check and the two choices and gives the narration in the same call; without one it gives only the narration. The words come from the loop, not the DM. The wake settles on that call, so the seat cannot act before the move is on the card; a DM tool call that comes after its wake settled is refused (§2), so nothing lands late.
4. The card now has the choice `own_move`, and the proposer's word is given for it. On a Blade card or a caravan card with an NPC owner, the seats still to speak advise or vote as on any choice (the human first, decision 0062). Seats that spoke before the move was made keep their word. A player owner may make an own move only once every Blade has advised, as for any call, and it decides the card at once.
5. If the card is decided on another choice, nothing is rolled and the own move is gone with the card.
6. If the card is decided on `own_move`, `card_resolved` names `own_move`. The engine then rolls the proposer's check through core and runs the success or failure choice's effects in full, as if that choice had won. The roll's outcome says which ran.
7. The world writes the deed `own_move_<card>`, beside the deeds the named choice writes.

### 1.2 Contract (question 1)

All in one PR (API-56), in Rule 1 order. Version 1.0.0-dev.68. Phase 1 changes no contract.

**Command** `own_move` (DM only):

| Field | Required | What |
| --- | --- | --- |
| `actor` | yes | The seat whose words these are: one with a say on the card that has not spoken yet (a Blade, or a player owner once the Blades have advised). |
| `text` | yes | The words as said, 1 to 300 characters. The game loop fills it from what the seat said, cut at a word to 300 characters (the transcript keeps them whole); the DM tool has no text field, so the DM can never be refused for the words. |
| `ability`, `skill`, `dc` | yes | The check, from the SRD DC ladder, with the same fields and rules as a deck file's `check` effect and `request_check`'s `ladder`. A scenario check is not offered: road cards carry ladder checks only. |
| `success` | yes | A choice id offered on this card. |
| `failure` | yes | Another choice id offered on this card. |

**Refusals.** Reuse what exists. A new reason is added only where nothing fits:

| Case | Reason |
| --- | --- |
| no card on the table, or cards still offered for a pick | `no_card` (existing) |
| `success` or `failure` not offered on this card | `unknown_choice` (existing) |
| `actor` has no say on the card | `no_say` (existing) |
| `actor` already spoke on the card | `already_spoke` (existing) |
| a fight is running | the error code `wrong_mode` (existing, no reason; as `choose_card` answers) |
| `actor` is a player owner and a Blade has not advised yet | `waiting_for_advice` (existing) |
| the card already has an own move | `own_move_taken` (new) |
| `success` equals `failure`, or `failure` names a choice that `breaks` a custom | `bad_own_move` (new), with a message the DM can correct against |
| a DC off the ladder; a skill that is not the ability's | the error codes `request_check`'s `ladder` answers today (`bad_request`; `not_implemented`), checked when `own_move` arrives, never at the roll |

**State.** The own move joins the card's `choices` in the views as `{id: "own_move", text}`, the words held once. `choose_card {choice: "own_move"}` then works for every seat with no new command. `own_move` is a reserved choice id; the deck validator refuses it in a deck file. The card's 2-or-3 rule is about deck files, so a card on the table may carry four choices.
- `CardDm.own_move: {actor, ability, skill, dc, success, failure}` (optional, new).
- `CardPlayer.own_move: {actor, skill}` (optional, new). No ability, DC, success or failure.

**In the world crate** (`crates/nat20-world/src/deck.rs`), which is serde-only and cannot roll:
- the pending card gains an optional `own_move {actor, ability, skill, dc, success, failure}`;
- `speak`, `offered`, `settle` and `resolve` look a choice up in the card's choices and, while it is set, in the own move. `offered` lists it last, so a tie that today's rule breaks by order (the human seat, then `owner_pick`, then the first offered) never falls to it by accident; `settle_unattended` never picks it;
- `resolve` for `own_move` returns a `Resolution` with `choice: "own_move"`, the voters as `by` as for any choice, and a new optional `own_move` part: the proposer, the check, and for success and for failure `remember own_move_<card>` followed by that choice's effects. The `remember` comes first, as a choice's own does, so a fight stays last in its list (`deck.rs`).

**In the server** (`resolve_card` in `crates/nat20-api-server/src/session/cards.rs`): it logs `card_resolved` as today, then, for an own move, rolls the proposer's check with the code a deck `check` effect uses and runs the branch it lands on with the resolution's `by`. That is about twenty lines beside the existing check code; `Who` and the deck file format do not change.

**Events.**
- `card_own_move {actor, text, skill}`, public. It is logged when the DM puts the move on the card.
- `own_move_set {card, actor, ability, skill, dc, success, failure}`, DM only, logged beside it, as `card_shown` sits beside `card_drawn` (AGT-91). It is the run record's copy of the mapping, which the DM view loses when the card is resolved.
- `card_resolved` is unchanged: it names `choice: "own_move"`, as it names any choice. The roll follows it in the log, then the branch's effects. Which named choice ran is the roll's outcome against `own_move_set`; the verdict and the report read it from the log, so the event needs no new field.
- No new `CardDecided` value: that enum says how the vote went (owner, majority, tie), and it still applies. No new `CardCame` value: `came` says how a card reached the table, not how it left.

**`contract/protocol.md`**: §5 gains the visibility block below, and §4.13 the own move's lifecycle: a card on the table may carry the extra choice `own_move` (four choices); `card_own_move` and `own_move_set` are logged together; after `card_resolved` on `own_move` come the roll, then the branch's effects.

**Fixture** `contract/fixtures/own_move.jsonl`, seeded:
- a Blade card; the human's own move goes on it; two AI votes; the roll succeeds and the success choice's effects and deeds follow, with `own_move_<card>`;
- the same card on a seed where the roll fails;
- a caravan card whose NPC owner goes with the Blades' majority for `own_move`;
- a player owner's own move after the Blades' advice, deciding at once;
- one line for each refusal above.

**CHANGELOG:** `1.0.0-dev.68: own_move (DM): a seat's own words on a road card, with a ladder check and two of the card's choices for success and failure; card_own_move (public) and own_move_set (DM only) events; CardDm/CardPlayer.own_move; reject reasons own_move_taken and bad_own_move.` Additive, so `check-breaking` lists nothing.

The world crate holds the card's decision (`crates/nat20-world/src/deck.rs`), so the own move's resolution and its deed are part of the same PR. That is why ENG-43 folds into API-56 (§9).

### 1.3 Visibility (question 2)

A new block for `contract/protocol.md` §5:

| Field | DM | Owner | Other players |
| --- | --- | --- | --- |
| the own move's words, its actor | yes | yes | yes |
| its skill | yes | yes | yes |
| its ability and DC (`check`), the roll's `against` | yes | no | no |
| `success` and `failure` before the roll | yes | no | no |
| the choice the roll brought, as a choice id | yes | no | no |
| the roll: dice, total, outcome | yes | yes | yes |
| the deed `own_move_<card>` | yes | no | no |

- The words were said aloud, so they are public. The skill is public too, before the vote, so the seats know what they are voting for: the DM's reading of the words. This is a new disclosure, not a precedent: a card's scout skill stays DM-only until its roll. Vera's "I didn't try to persuade him, I demanded" is its cost, and it is the DM's to answer in the scene.
- `success` and `failure` stay DM-only, before and after the roll. Showing them would tell the outcome before the choice, which the card text rule forbids (card test 5). After the roll the players see what came of it the way they see any card: the effects' own public lines and the DM's narration.
- The game loop briefs AI players from the DM view today (`cardLines(CardDm)` in `game/src/table/loop.ts`). AGT-99 moves that briefing to the seat's own player view (`CardPlayer`, read as that seat), so the DC, `success`, `failure`, `keeps` and `breaks` cannot reach it at all (Rule 3). That is one more state read per briefing.

### 1.4 The roll (question 3)

- The proposer rolls one ability check through core, as a deck `check` effect does: the same roll line, `dc_source: ladder`, and Advantage only from what core tracks (a Help given before, a condition).
- The DC is one of 5, 10, 15, 20, 25 or 30. The DM prompt maps the words to the ladder's names (very easy 5, easy 10, medium 15, hard 20, very hard 25, nearly impossible 30). The own-move note's "Persuasion DC 12 (Medium)" was an error: Medium is 15.
- One own move per card, and no retry: a failure decides the card.
- A failure never lands on a choice that breaks a custom (the engine refuses it) or on a deliberate act the words did not ask for, such as taking, opening or searching (the DM prompt says so; nothing can test it). Otherwise a failed roll acts for the player, which the bible's guardrail forbids (Zoya, §12).
- The named choice runs in full, even when it has its own check (37 of the 130 choices in the decks do). The own move gets the party to that choice; it does not cancel the choice's own risk. The DM prompt says to prefer a choice without its own check for `success`.

### 1.5 The deed (question 4)

- Its id is `own_move_<card id>`, such as `own_move_bridge_again`. It follows the ENG-33 snake_case grammar and the precedent of `killed_<npc>` (ENG-36).
- It carries no result. The result is in the roll, and in the deeds the named choice writes.
- `by` is the seats that voted for `own_move`, as for any choice. So is the `by` of a `remember` at the top of the named choice; a `remember` inside the named choice's own check gets that check's rollers, as today (`run_effect` in `cards.rs`). The day and the contract are recorded as for any deed.
- It outlives the contract like every deed (ENG-37).
- Readers in M12: the run report and the verdict row `m12-own-move` (§8). `if` and `unless` may read it, but no card does in M12. So that a later card can, API-56 adds `own_move_<card>` for every card id to the deeds the validator counts as written (`deeds_written` in `deck.rs`). A deed nobody reads is allowed, as today.
- Zoya (§12): the report is not a reader, so the deed is an owed row on the board. A reader must say the cause aloud, and a bare id has no words to say. Carrying the player's words in the deed is the dramaturg mechanism's question, not M12's; M12 keeps the bare id and the board lists it as owed (decision 4 below).

### 1.6 The line (question 5)

- The line lives in the seat's strings, `game/src/table/words.ts`, not in the deck data and not on the wire. Every card has it, so it belongs to the table, not the card. AGT-99's PR creates `words.ts` with its own lines in both languages (the own-move line, the prompt, the marked choice); AGT-98 then moves the rest of the seat's strings into it.
- The words: English "Something else: say it in your own words."; Russian «Или что-то своё: скажите своими словами.» The line has no number, comes after the last choice, and is the same on every card.
- The card's prompt line changes with it: "A choice's number, or your own words." («Номер выбора или своими словами.»), with ", Enter for the marked one" («, Enter для отмеченного») only when a choice is marked (§3). The list's heading becomes "Choices" («Выборы»): Vera heard "Your word" three times in four lines.
- Once the own move is on the card, the seat shows it as a numbered choice in the player's own words, never the DM's paraphrase, with the skill: «Ваш ход: «Пусть сначала покажет, кто дал право» (Убеждение)», or «Ход Брена: …» for another seat. The line never says "card": Vera saw no card on the screen.
- The framing narration must not retell the card's text, which follows it at once (Vera heard the paragraph twice). The card wake's prompt says: open on what the people do; the card's words come next.
- Once the card has an own move, the own-move line is gone from it, for every seat: a second move would be refused (`own_move_taken`), so the seat never offers one.
- AI players see the same choice in their card briefing, and an `own_move` tool with one field, `words`, while the card has no own move.

### 1.7 Who may use it (question 6)

- **The human**, as a Blade: their words on a card become their word, so they still speak first (0062). As a caravan owner, they may make one once the Blades have advised, and it is their call.
- **AI players**: the `own_move` tool, and one line in their card briefing: "If none of these is what your character would do, say what they do with own_move, in one sentence." Run 1 needs at least one AI own move (scope §4, row 2). That is a risk (§11), and the prompt does not force one.
- **A Blade on a caravan card**: advice, like any word. An NPC owner takes the Blades' majority. An `owner_insists` choice still wins.
- **Arrival cards (ENG-35)**: yes. They sit on the table like any card.
- **A forewarned choice (API-54)**: it can be named as success or failure when the scout opened it, because it is then offered on the card.
- **Soon cards and a zone's only card**: yes.
- **The DM, and an NPC owner**: never as the actor.

### 1.8 No fitting choice (question 7)

- **The rule**, in the `card_words` wake's prompt: "A player's words on the road card. If they are a move, answer with own_move_or_answer giving the check the words call for, two different choices of the card for success and failure, and your narration. If no two choices fit, give only the narration, one or two sentences, and the card waits."
- **The DM tool** `own_move_or_answer {narration, move?: {ability, skill, dc, success, failure}}` binds `actor` to the seat whose words woke it and fills `text` from those words. With `move` it sends `own_move` first: on a refusal it returns an error with the engine's message and shows nothing, so the wake does not settle and the DM corrects within its two retries (acceptance 5); on success it shows the narration. The narration answers the words, the attempt only, never how it turns out: when the move decides the card at once (a player owner's call, or the last Blade's word), the roll and its effects follow, and today's `card_resolved` road wake narrates the result. Without `move`, it shows only the narration. The wake settles on the call that succeeds. The DM cannot make an own move for a seat that said nothing.
- **The card waits** exactly as AGT-96 built it for the human; the seat keeps the own-move line. An AI seat whose move found no fit is asked once more, with the DM's answer, for a `choose_card`, before today's "goes with the others" fallback. An AI seat that calls both `choose_card` and `own_move` in one wake has spoken: its `own_move` words are kept as speech and no move is made.
- **When the words simply are a choice** on the card, the DM says so in the scene and the card waits for that number: the DM never decides a card for a seat.
- **A success may land on a fight** only when the words asked for one; a named choice with its own check means a second roll, which the DM's narration explains.
- **Tests:**
  - a prompt test that the rule is in the road section;
  - a loop test with a fake DM that answers without `own_move`: the card still waits for the human;
  - a loop test with a fake DM that calls it: the human's word is given and the AI seats are asked;
  - a loop test where an AI player's `own_move` tool leads to the `card_words` wake and the move lands on the card;
  - the scripted DM never calls `own_move`, so scripted runs and fixtures replay unchanged.
- **The run report** counts the words on a card that got no own move, as "no fitting choice".

### 1.9 No variant replaces the obvious move (scope §2, item 2)

The rule needs a field the validator can test. A choice may carry `"asked": true`, marking the card's own question or plea (Zoya's word; `plain` would collide with the Plain voice). The rule lives in one place, the world crate's deck validation (`deck.rs`, beside the 2-or-3 rule, which already enumerates every case a card's conditions allow; no TypeScript copy). It checks that in every case the card's conditions allow, some offered choice has the `asked` choice's text. A gated twin with the same text, which `drovers`, `night_wolves` and `tams_story` use to vary an effect, passes.

MAP-18 also:
- marks `asked` on the four cards Zoya found replacing their plea, `osric_hears` (`tell`), `the_fair_gate` (`sack`), `missing_sack` (`tracks`) and `oddas_mark` (`warden`), and fixes each so its plea stays offered; marks `bridge_again`'s `read`, which table #330 already keeps offered, with no other change;
- adds a validator rule that `owner_pick` names a choice offered in every case (it points at a gated choice on `the_fair_gate`, `missing_sack`, `drovers` and `oddas_mark`);
- renames `osric_hears`' "Tell it in your own words.", which would sit next to the own-move line;
- proposes the bible line Zoya queued: "A card's own question or plea is always offered; a variant may add to it, never replace it." Only Stas changes the bible, by PR.

## 2. A card after its narration, a wake that ends on its narration (question 8, AGT-97)

**Cause, from the code** (`game/src/table/loop.ts` `cardRound`, `game/src/agents/dm.ts` `DM_SETTLE_ON`):
- The pick wake tells the DM "Narrate nothing yet", and it settles on `pick_card`. The card then reaches the seat with no wake that frames it. If an earlier narration has already closed the beat (the night card after «ночь прошла тихо»), the card arrives after the story has moved on.
- `road` wakes do not settle on `narrate`. So the closing empty call runs into the 12 s cap, and the log says the wake was skipped when it was not (AGT-97: 4 of 5 timeouts in Stas's run).

**Change, all in the game loop:**
- The pick wake asks for `pick_card`, then `narrate` of the card's opening, and settles on `narrate`. In a pick wake, `narrate` before `pick_card` is refused ("pick the card first"), so the pick can never drain behind a narration, and the narration is written after `pick_card` returned, with the scout's look and the card as drawn in its result. Today the DM tool's result is only "<card> is on the table" (`tools.ts`), so AGT-100 extends that table-side result with the card's text and choices as drawn and the scout's line; the wire does not change. That is no new DM call. A wake that never picks falls back to the first card rolled, as today.
- The existing guard in `game/src/agents/dm.ts` (decision 0053: a call from a wake that has settled answers "not now: that wake is over") covers the new settling wakes too, so a late call is refused, never raced. The cost is that a late call is lost; §11 says where that bites.
- A card that comes with no pick (a soon card, a zone's only card) gets a `card` wake to frame it, unless the narration that just ran was told the card's `card_drawn`. That is at most one more DM call per such card: about two a run in pair 3. The `card` wake is new (today `card` is only a player wake), so AGT-100 writes its prompt: "A road card is on the table: open it in two to four sentences, on what the people in it do and want; do not retell the card's words, which the table shows next; do not decide it or tell how a choice turns out; narrate last."
- The night wake, when a card is offered or on the table, is told: "A road card follows: do not close the night." The card's own wake then opens it.
- `DM_SETTLE_ON` gains `road: ["narrate"]` and `card: ["narrate"]`, and `pick` settles on `narrate`. This is AGT-97. The `road` prompt already asks for narration last; the `pick` and `card` prompts say it as above. (`card_words: ["own_move_or_answer"]` comes with the wake itself, in AGT-99's PR: the words on a card leave the `road` wake for `card_words`, so no own move can be lost behind a settled road wake.)
- The seat shows the card panel only after the framing wake returns. On a failed or timed-out wake, the logged fallback shows the card alone, as 0041 already does for lines after a DM fallback.

**Decision 0041 stands as written.** It says lines still held when a decision comes up show at once. The change raises the decision later, after the narration, so the rule is untouched. No record.

**Check for exit row 4**, in `game/src/play/verdict.ts`, from `transcript.jsonl` joined with `engine-log.jsonl` by `log_head`, so it works in both runs:
- `cardRound` logs one `system` line, `card <id> goes to the seats`, as it starts asking the seats;
- that line follows a DM narration logged after the card's `card_shown` (which names the card id), or a DM fallback logged between the two;
- the loop's `error` and `fallback` lines for a DM wake gain `wake` and `narrated` fields (the loop's own record, not the wire): `narrated` is true once a `narrate` or a narration-carrying tool returned in that wake. A wake that runs out of time after its narration is logged with cause `cut_after_narration`, not `timeout`: the narration was shown, so the old "skipped" line was untrue. The row: no `timeout` with `narrated: true` in any wake, and no `cut_after_narration` at all in the wakes that now settle on their narration (`road`, `card`, `pick`, `card_words`), since settling should make one impossible; a hit there means AGT-97 is not fixed. In the long wakes (`scene_open`, `table_turn`), which keep calling tools after narrating, a cut is counted in the report, not gated.

## 3. The marked choice (question 9)

- Today Enter takes the others' choice when one leads, else choice 1 (`cardChoices` in `game/src/table/choices.ts`). As a Blade the human speaks first (0062), so Enter usually means choice 1, a choice nobody made. Vera, in both languages, was afraid of paying the toll by pressing Enter.
- Change: `cardChoices` returns `marked` beside today's `preset`. `marked` is set only when the others lead with a choice. The seat marks that line with "(Enter)" at its end, and the prompt names Enter only then. With nothing marked, Enter on an empty line does nothing. "Enter" is the key's name, so it stays Latin in Russian (§4).
- `preset` stays as it is, because the loop's fallbacks for a silent AI seat or owner use it ("goes with the others"). An unattended run is unchanged.
- The same mark goes on whatever line Enter takes in the other lists whose prompts promise it: the level-up list's recommended line, and on the road list the step the DM proposed (`answerRoad`'s preset), which falls back to the first line only when the DM proposed none. The road prompt changes with it, from "Enter for the first line" to "Enter for the marked line" (`promptHint` in `input.ts`).
- Vera read below. This is AGT-101, in AGT-99's PR: both change the same card panel and its prompt line, and share one Vera read.

## 4. One language at the seat (question 10, AGT-98, decision 0067)

**0067's option C is confirmed.** The table renders; the wire stays English. Option D (a locale in the contract) is still rejected: it moves Russian names for every option, condition and creature into the server for the same screen, and the server already has a precedent against that (`name_ru` lives in data files that only the game reads).

**What 0067's rendering leaves byte for byte in an English run:** the wire, every fixture, `transcript.jsonl`, the engine and session logs, and every agent prompt. Other rows change some of these on purpose, and say so: the card wakes and the pick prompt (§2), the order line in the transcript (§2), the AI players' own-move line (§1.7). The seat's own lines may change in both languages where AGT-98 decides a line is unreadable, and each changed line gets a Vera read.

**Engine lines.** `TableState` turns an engine event into a seat line in two places (`game/src/table/state.ts`): the line it shows (`text: mine ?? event.text`) and the copy it keeps for `/log` (`recent`). Both become `seatLine(event, language, names)`, in a new `game/src/table/seat-lines.ts`:
- `en`: returns what each call site shows today, byte for byte: `yourLine(event, human) ?? event.text` on the seat (the human's own coin and experience lines, B4), and `yourLine ?? eventLine(event)`, with its `[rN]` prefix, in `/log`. Only the lines AGT-98 changes differ.
- `ru`: an exhaustive `switch` over the generated `EventKind` union. Each kind returns a Russian line from the event's fields, or `null`, which hides it from the seat. A new event kind without a case fails `tsc`, so no English line can slip in silently.
- Names come from data that exists: the roster's `name_ru` for party handles, `npcs.json` `name_ru` for `npc:<id>`, `map.json` `name_ru` for places. Goods gain `name_ru` in `goods.json` (MAP-19).

**AGT-98, per line** (Vera's list from pair 3; Russian shown, English changes alike):

| Line today | Decision | At the seat |
| --- | --- | --- |
| `Scene twb_wendmouth loaded in explore mode` | hide | nothing; the DM's opening says where |
| `npc:fenn_lusk pays bren 2 gold pieces in wages` | translate | «Фенн Ласк платит Брену жалованье: 2 золотых.» |
| `finish a long rest` | translate | «Отряд встаёт лагерем на ночь и отдыхает до утра.» |
| `bren picked: Make camp for the night` (a road step the loop takes) | say who did it | «Отряд встаёт лагерем…», never "bren picked" |
| `bren says: willows` (a choice id) | translate | «Брен советует: Свернуть под ивы.», the choice's text, not its id |
| `The party loses 240 minutes` | translate | «Отряд теряет четыре часа.» (hours in words, 0038's number words) |
| `[r56] … 1d20 (10) = 13, failure` | explain | «<имя>, <навык>: не вышло. На кости 10, с навыком 13. [r56]» The same roll, outcome first; the roll id stays (Rule 4), last and dim; no DC, as today. Vera stopped reading at the id and the two numbers in the first draft, so this line gets its own Vera read in the AGT-98 PR |
| `Blades` | translate | «наёмники» |
| English card and choice text | translate | the pack's `text_ru` (below) |

**Card text per language.** Card and choice gain `text_ru` beside `text`, as `map.json` places carry `name_ru`. The world crate accepts the field and never projects it: it is not on the wire. The loop has the card id from the DM view, reads the deck file, and the seat shows `text_ru` in a Russian run. The pack validator requires `text_ru` on every card and choice of every deck: the Silent Mill has none, and both road packs play in Russian. This is MAP-19.

**Engine and table words outside events.** More sources reach the seat. AGT-98 renders each in Russian; the list below is what the code shows today, and the language scan (below) finds anything it missed:
- option names and summaries in `/options` and the turn lists (`buildChoices` in `choices.ts`, from the engine's `option.name` and `summary`): a table-side `game/src/table/ru/options.json` keyed by option id, with a test that every option the pregens and the road packs can offer has an entry;
- refusals (`humanRejected` in `loop.ts`, which shows the message of any failed outcome): one Russian line per `RejectReason` and per `ErrorCode` in `words.ts`, two exhaustive records, so a new reason or code fails `tsc`;
- `/sheet`: rendered from the sheet's fields with Russian labels, as `/sheet` already renders from fields in English;
- reaction prompts (the trigger's summary and the options, `loop.ts`) and the situation panel (conditions, effects, a concentration spell, from `get_state`): through `options.json` and a Russian name per condition;
- the table's own texts (`notNow` in `tools.ts`, status lines, the end line): into `words.ts`.

**Seat strings.** The TUI's own lines move into `game/src/table/words.ts` as `Record<Key, {en, ru}>`, so a missing Russian string fails `tsc`. The English values are today's strings, copied byte for byte. AI players' briefings stay English, as 0038 has them: they are prompts, not the seat.

**The language scan**, an exit row 5 check in `verdict.ts`, reads `seat.jsonl` in a Russian run. It reports every Latin word except roll ids (`r\d+`), key names (Enter, Esc, PgUp, PgDn, Shift, Ctrl), `/commands`, and ids that every player is shown (none today). Key names and `/commands` are what the keyboard and the command line take, so they cannot be translated; scope §4 row 5 allows only ids and roll ids, so this widening is Stas's to accept (§10). 0067 extends AGT-73's Latin-word rule to table lines; this check is that extension.

## 5. The voice flag (question 11)

- A new setting `voice: plain | fireside` in `game/src/play/settings.ts`, default `plain` (scope §3: Plain stays the default). A profile may set it; `run.json` records it with its source, as every setting.
- With `fireside`, `dmPrompt` (`game/src/agents/dm.ts`) gains one line in the adventure part of the prompt: "This run asks for the Fireside voice." The voice skill already uses Fireside "only when the adventure's instructions ask for it", so the line is that ask, in both `--craft prompt` and `--craft skills`. With `plain` the prompt is byte for byte today's, and so is its cache.
- The narration judge does not read a reference sample today and stays as it is. The voice comparison (scope §4, Reported) reads the Plain run against sample F and the Fireside run against sample G (`.claude/skills/zoya/references/reference-narration.md`): the Vera fallback and Zoya, on the same opening and first card.
- This is AGT-102.

## 6. ENG-21 (question 12)

1. **Core PR into `demo`** on `core/m12-eng-21-move-ends-free`. Every Move whose route ends inside another creature's space, or whose path is cut to the movement left, ends at the last free spot along its path, reusing core #54's `stop_on_free_spot`. Following the maintainer's patterns: a test in `core/tests/`, a `docs/PROGRESS.md` row note (Moving Around Other Creatures), and the schemas regenerated if any registry changed. Merge commit.
2. **Table re-pin PR** of its own (Rule 5), with the full suite green. Fixtures it changes are re-recorded in that PR: `duel.jsonl` (`cargo run -p nat20-duel -- --seed 1 --fixture contract/fixtures/duel.jsonl`), plus any conformance fixture whose replay differs. The likely ones are `move_partial`, `walk_on`, `place_creature` and `m5_fights`. Each change is named in the PR; no contract change.

## 7. AGT-94, AGT-76, AGT-13 (question 13)

**AGT-94, scrolling on a Mac.** Two inputs:
- **The trackpad.** The seat turns on mouse-wheel reporting (`CSI ?1000h` with SGR `?1006h`) while the full screen is up, and off on exit. Wheel events scroll the story three lines and no longer move the option highlight. The cost: selecting text in Terminal.app then needs Option held while dragging. `/help` says so.
- **The keyboard.** Shift+↑ and Shift+↓ page the story; PgUp and PgDn stay.
- The footer shows «Shift+↑/↓ или два пальца на трекпаде: листать историю» («Shift+↑/↓ or two fingers on the trackpad: scroll the story») until the first scroll. `/help` lists both.
- Terminal.app's codes for Shift+↑ are checked on Stas's Mac in the same sitting as AGT-76's `check:ts`. If Shift+↑ does not reach the app, the fallback is Ctrl+U and Ctrl+D, with the same footer change.

**AGT-76, the five Ink tests.** The fix starts from the cause, not a longer wait:
- reproduce under load in CI-like conditions: `check:ts` with the test files in parallel, and CPU contention;
- record which frame each test saw;
- replace fixed sleeps with waits on a frame predicate: one helper in the seat tests' shared test file, used by the four tests in `panel.test.ts` and the one in `ui.test.ts`, that resolves when the last frame contains the expected text, with a cap.

AGT-76 is done when the full `check:ts` is green on Stas's Mac. Same PR as AGT-94: both are the seat and its tests.

**AGT-13, the `/options` and `/sheet` read.** The seat writes what it shows into `seat.jsonl` (§8), commands' output included, so Vera reads Stas's `/options` and `/sheet` exactly as his screen showed them. No screen copying. The row stays partial until Friends and Family testing.

## 8. The run record, the report and the verdict (AGT-103)

- **`seat.jsonl`**, new, beside `transcript.jsonl` in a run with a human at the seat. One line per thing the seat drew, in order: `{at, kind, text}`, where `kind` is the seat's own `TableEvent` kind, every one of them (narration, engine, options, question, reaction, status, situation, end and the rest), plus `command` for a command's output. Written by the seat's own renderer, so it is what the screen showed, in the run's language. Uploaded with the run like the other files (`npm run runs:upload`).
- **An all-AI run** has no seat and writes no `seat.jsonl`. For run 1's Vera read, the analysis takes the scene opening and one card from the transcript, joins its engine lines with their events in `engine-log.jsonl` by `log_head` (the transcript holds only `eventLine` strings), and passes the events through the seat's own pure functions (`seatLine`, the card panel) in a small script. Nothing new goes into the run record, and there is no second seat to keep in step.
- **New verdict rows:**
  - `m12-own-move`: in this run's log, an `own_move_set`, then `card_resolved` on `own_move`, its roll cited, and the branch `own_move_set` names for that outcome run; and `own_move_<card>` in the deed book with this run's contract number. When the deed was already held from an earlier contract (a deed done again keeps its first record), the report says so and the row rests on the log; by an AI in run 1, by the human in run 2.
  - `m12-order`: the §2 check.
  - `m12-language`: the §4 scan, run 2 only.
  - `m12-readable`: manual. The Vera quote goes in `verdict.json` as text and its verdict is Stas's.
- **The report adds:**
  - every own move (words, skill, DC, the choices named, the roll, the choice that ran);
  - the words on a card that got no own move;
  - which MAP-15 and MAP-17 lines fired;
  - p95 against pair 3;
  - the voice;
  - for the Fireside run, the same opening and first card as run 1, side by side.

## 9. Rows and PRs

The scope's §7 rows, with three changes for Stas's review load:
- **ENG-43 folds into API-56.** The card's decision lives in the world crate, which the server PR touches anyway, and Rule 1 wants the server and the fixture in the contract's PR.
- **AGT-97 keeps its row, but shares AGT-100's PR.** Both are `DM_SETTLE_ON` and the card wake, and exit row 4 checks both.
- **AGT-101 keeps its row, but shares AGT-99's PR.** Both change the card panel and its prompt line, and AGT-98 then moves one set of strings, not two.

| PR | Rows | Size | Depends on |
| --- | --- | --- | --- |
| 1 | API-56: own move on the wire, the world's resolution and deed | M | - |
| 2 | AGT-99 with AGT-101: own move at the table (DM tool and rule, the human and AI players, the line); the marked choice | M + XS | 1 |
| 3 | MAP-18: `asked` choices, the validator rule, the five cards, Zoya | S | - |
| 4 | AGT-100 with AGT-97: card after its narration; wakes end on their narration | S | 2 (the `card_words` wake) |
| 5 | AGT-98: one language at the seat (`seat-lines.ts`, the rest of `words.ts`, option names, refusals, `/sheet`, the per-line table) | L | 2 |
| 6 | MAP-19: `text_ru` on every card and choice; goods `name_ru` | M | 3, 5, 12 (the card text it translates) |
| 7 | AGT-102: voice flag | S | - |
| 8 | ENG-40, ENG-41, ENG-42 | XS each | - |
| 9 (core) | ENG-21: core fix | S | - |
| 10 | ENG-21: re-pin and re-record | - | 9 |
| 11 | AGT-94 with AGT-76 | S | - |
| 12 | MAP-14: bridge card at the bridge | S | - |
| 13 | AGT-103 with AGT-13 (partial): `seat.jsonl`, report, verdict, the exit pair's reads | S | all above |

Thirteen phase-2 PRs, the core PR and the pin included. With the two docs PRs (table #336 and this one) and phase 1's one PR, that is 16 for the milestone, against the scope's 19 (which had one docs PR and phase 1 as two). The stack is 1 → 2 → 4 and 2 → 5 → 6; 6 also waits on 3 and 12, whose card text it translates; 10 waits on 9; 13 goes last; 7, 8, 11 stand alone.

## 10. Decisions in this design (for Stas)

1. Own move is a fourth choice on the card that the seats vote on, not an instant roll that skips the vote. Why: the vote, the owner's call and 0062 work unchanged, and on a caravan card the merchant still decides (scope §2).
2. The named choice runs in full, its own check included. The alternative was to forbid choices with a check, which leaves 8 of 43 cards with no own move.
3. One own move per card, no retry.
4. The deed is `own_move_<card>`, with no result and no words in it; Zoya lists it as an owed pay-off until the dramaturg mechanism gives it words.
5. 0067's C is confirmed: `text_ru` in deck files, rendering in the table, no contract change.
6. No record for the card order: 0041 is untouched.
7. `seat.jsonl`, written only with a human at the seat, is the source of the language row and AGT-13's read; the order row reads one new loop line in the transcript.
8. Nothing is marked, and Enter does nothing, until the others lead with a choice.
9. A failure may not land on a choice that breaks a custom.
   Decisions 1 to 4 and 9 are recorded in decision 0068, in this PR; the others are implementation inside accepted decisions or rows.
10. Mouse-wheel reporting on, at the cost of Option-drag to select text.
11. The own move rolls in the server beside the deck `check` effect's code; `Who` does not change. The deck file format does change, in three rows: `asked` (MAP-18), `text_ru` on cards and choices (MAP-19; the world crate's structs gain the field in that PR, since they refuse unknown fields), and `own_move` as a reserved choice id (API-56).
12. Departures from the accepted scope, for Stas to accept:
    - the language scan lets key names and `/commands` through (scope §4 row 5 allows only ids and roll ids);
    - row 4 gates the wakes that settle on their narration; in the long wakes (`scene_open`, `table_turn`) a cut after the narration is counted, not gated (scope §4 row 4 names every wake);
    - the own move's DC comes from the ladder only, not the pack (scope §2 item 1 allows either): road cards carry ladder checks only, so a pack DC has nothing to name today.
13. ENG-43 folds into API-56; AGT-97 shares AGT-100's PR; AGT-101 shares AGT-99's.

## 11. Risks, without sugar

- **Run 1 may see no AI own move.** AI players took a written choice on every card in pair 3. One prompt line invites the own move; it does not force one, because a forced move would prove nothing. A run with none fails `m12-own-move`, and run 1 goes again with a changed prompt: about 7.9 USD and a day. A late AI seat's own move also counts only the seats still to speak, so it seldom wins a vote; on an NPC-owned caravan card the first Blade asked is the likeliest to carry one.
- **The DM can map words badly.** It might pick a soft DC, or name a success the words do not earn. The engine guards only the shape: ladder DC, two different choices offered on the card. The judge does not check the mapping. Stas's run 2 is the only real test of it.
- **Settling `road` on `narrate`** means a road step the DM proposes after narrating is refused by the existing "not now" guard and lost, not raced. The road prompt already asks for narration last; the run report counts "not now" refusals by wake, so a lost road step shows up in run 1.
- **AGT-98 is the largest row.** Every event kind needs a Russian line, and so does every TUI string. `tsc` makes "forgot one" a build failure, not a run failure. But the Russian itself is only as good as the Vera reads, and Vera is a fallback model, not a person.
- **Mouse reporting** can surprise Stas when he tries to copy a line from the seat. `/help` says Option-drag, and `/log` still prints the lines.

## 12. Vera and Zoya

Both reads ran on the fallback: a general-purpose subagent whose prompt was the body of `.claude/agents/vera.md` or `zoya.md`. A cloud thread does not load the repo's agents. Vera saw only the seat text: a Russian and an English mock of the bridge card with the own-move line, the marked choice, the prompt line, an own move voted and rolled, three AGT-98 lines and the scroll footer.

### Vera, Russian seat (fallback), verbatim

> **1. Что я поняла**
>
> Мы стоим у моста. Там новый сборщик пошлины, говорит, что мост теперь принадлежит какой-то компании из Солтмута. Решать будет торговец, видимо это Фенн, а я ему только советую. Мне дали три варианта и разрешили сказать своими словами. Я так и сделала: пусть сначала покажет, кто дал им право. Потом кто-то бросил кость, «получилось», чиновник сам признал, что мост в бумаге не назван, и нас пропустили. Потом мне заплатили, и мы встали лагерем. Дальше я бы ждала, что будет утром, и снова сказала бы что-нибудь своими словами.
>
> **2. Что я бы переспросила вслух**
>
> - «Мастер», это кто? Рассказчик, наверное. Но я его ни с кем не знакомилась.
> - «Фенн смотрит на печать». Кто такой Фенн? Только через две строки, по «Решает торговец», я догадалась, что он и есть торговец. И только в самом конце узнала, что он Фенн Ласк.
> - «Решает торговец; ваше слово для него совет.» Я спотыкаюсь на этой фразе, тут просится тире: «для него — совет». Смысл я поняла: решаю не я.
> - «(Enter)» после первого пункта и «Enter для отмеченного». Значит, если я просто нажму Enter, то заплачу? Почему отмечен именно этот вариант? Я его не выбирала.
> - «На карте теперь и ваш ход». Какая карта? Никакой карты я не видела.
> - «Брен требует показать бумагу». Брен — это я? Нигде не сказано, что меня зовут Брен. Я догадалась только потому, что «ваш ход» и «ход Брена» стоят рядом. И я не просила показать бумагу, я спросила, кто дал право. Вышло, что мой вопрос пересказали чуть по-другому, ближе ко второму пункту.
> - «(Убеждение)» в скобках. Это что, моё умение? Или так называется сам ход?
> - «Ильза советует», «Торва советует». Кто это? Мои спутники? Я их не видела, они только советуют.
> - «Фенн слушает наёмников». Значит, мы наёмники? Об этом я узнаю только здесь.
> - «[r57]». Совсем не понимаю. Номер чего-то? Похоже на служебную пометку.
> - «на кости 14, всего 16». Почему 14 превратилось в 16? Откуда взялись два? И сколько нужно было, чтобы получилось?
> - «2 золотых». Пошлина была «две серебряные монеты с головы», а мне платят два золотых. Это много или мало? Это плата за мост или моё жалованье за день?
> - «Отряд теряет четыре часа». Как это? Нас же просто махнули рукой: проезжайте. Куда делись четыре часа?
> - «Отряд встаёт лагерем на ночь». Только что было «впервые за утро», и вдруг уже ночь. Я этот прыжок не заметила, мне его просто сообщили.
> - Повтор я слышу сразу. «Человек в чистом сюртуке», «книга», «мост теперь принадлежит компании из Солтмута, говорит он» — это стоит два раза подряд, у Мастера и в «В дороге». Как будто мне дважды прочли один абзац.
>
> **3. Где я стала пассажиром**
>
> Пассажиром я не стала: на мосту я выбирала сама и писала своими словами. Но последние три строки, жалованье, «теряет четыре часа» и лагерь, случились без меня. Мне их просто объявили. Ноутбук я бы не закрыла, но на «[r57]» и «14, всего 16» я перестала понимать и просто читала дальше.

What changed in this design from it: the marked choice (§3), the own move shown in her own words and never "card" (§1.6), no retold card text (§1.6), the roll line (§4, with its own read later). The last three lines were stitched into the mock from other beats, so "they happened without me" is the mock's fault, not the line's. Who Bren, Fenn and the Master are is onboarding, outside M12.

### Vera, English seat (fallback), verbatim

> **1. What I understood**
>
> We're on the road with a merchant, and at a bridge a man with a ledger wants two silver from each of us. He says the toll belongs to a company from Saltmouth now. The merchant makes the decision, and I only give advice. I could pick one of the three lines or write my own, so I wrote my own: I wanted him to show who gave his company the right. Then I think I'm Bren, because it says "Bren demands to see the paper", which is what I asked for. The others gave their advice, two of them took my side and one wanted to pay, and then something was decided by a die and "It worked." So the man will show us his paper, I suppose. Next I'd wait to see what the paper says.
>
> **2. What I would ask aloud**
>
> - "The merchant decides; your word is advice." Which merchant? Are we travelling with him, or is he the man under the board? I took it to mean someone in our party who owns the cart.
> - "Your word" comes up three times close together: as the heading, in "your word is advice", and in "> Your word: a choice's number…". By the third time it sounds like a label on a form, not something a person says.
> - "(Enter)" next to the first choice, and "Enter for the marked one". I worked out that pressing Enter means paying, but nothing is marked except that word in brackets. I'd be afraid of pressing Enter by accident and paying.
> - "Ask to read the paper." What paper? I saw a painted board with a wax seal. Is the board the paper, or does he have another one in his ledger?
> - "the two brothers". Who are they? I suppose they took the toll before. It's said as if I should remember them.
> - "Your move is on the card now". What card? I don't see a card, only the text. Is my sentence written down somewhere now?
> - "(Persuasion)". Is this a word from the game? It reads like a heading put in brackets after my sentence. I didn't try to persuade him, I demanded.
> - "Waiting for the others." Then they all answer straight away. Fine, but who are Ilsa, Torva and Fenn? I guess they're my companions.
> - "Fenn goes with the Blades". Who are the Blades? A group? Is Fenn one of us, or one of them?
> - "[r57]". I don't know what this is at all. A page number? A code? It looks like something left over that wasn't meant for me.
> - "the die shows 14, 16 in all." Why are there two numbers? Where did the 2 come from? Is 16 good? I only knew it was good because the next words say "It worked."
> - "Shift+↑/↓ or two fingers on the trackpad". I understand this one, it's for going back up through the story.
>
> **3. Where I became a passenger**
>
> I didn't become a passenger here. I chose for myself and wrote my own sentence, and the story took it. The closest moment was the line with "[r57]" and "14, 16 in all". At that point I stopped reading for the story and just looked for the words that told me whether it was good or bad. I wouldn't close the laptop over it yet.

Her "(Persuasion)" point ("I didn't try to persuade him, I demanded") is the DM's skill pick showing; it stays, because the skill is what the party sees tried (§1.3). "Blades" stays an open AGT-98 line in English.

### Zoya, board check of the two mechanisms (fallback), verbatim

> **(a) Do they hold?**
>
> - **Own move holds, with three conditions.**
>   - It rests on Story-space 1 (never a passenger) and 3 (the player names an action, the card supplies the cost). It also rests on Guardrail 1: the engine rolls, and the DM only picks the check from the ladder.
>   - Condition 1, stake visible: the DM names the skill and the two choices before the vote. He never names the DC (Guardrail 3).
>   - Condition 2, only offered choices: both named choices must be on offer to this party now. Otherwise an own move opens a gated choice and writes a deed nobody earned, such as `charm` without `sedge_charm`. That is an invented deed.
>   - Condition 3, no deliberate act on a failure: a failure may never land on a choice that is a deliberate act or that `breaks` a custom. Guardrail 8 forbids the DM acting for the human's character, and a failed roll would then act for them.
>   - Card tests: 1, 3 and 5 are inherited from the named choices. Test 4 holds because success and failure must differ. Test 2 holds only under condition 1.
>   - Saying "the card waits" when nothing fits passes Guardrail 5.
> - **"No variant replaces the obvious move" holds.** It rests on card tests 1 and 2: the plea is the want, made visible. It also rests on Story-space 7 (handrails).
>   - The bible says nothing about this yet. By my rule 3 it goes into the amendment queue first.
>   - Proposed line: "A card's own question or plea is always offered; a variant may add to it, never replace it." Why: a party with a deed should not lose the plain answer.
>
> **(b) Cards that break rule 2**
>
> - `osric_hears`: `tell` is replaced by `show_mark` (`peddler_testified`). The reeve asks to hear it again, and the party loses the plain answer.
> - `the_fair_gate`: `sack` is replaced by `bridge_word` (`toll_men_fought`). The warden's question is the pitch.
> - `missing_sack`: `tracks` is replaced by `ask_bel`.
> - `oddas_mark`: `warden` is replaced by `debt`.
> - **Twins:** in `drovers` (`welcome`), `night_wolves` (`build_fire`) and `tams_story` (`to_bel` / `keep_promise`), the obvious action is always offered, but by a gated twin. Your testable form rejects all three, although they keep the intent. The decks have no conditional effects, so twins are the only way to vary an effect today. The validator needs an exception: a `plain` choice may have a gated twin with the same text.
> - **Validator, same pass:** `owner_pick` already points at a gated choice on `the_fair_gate` (`queue`), `missing_sack`, `drovers` and `oddas_mark`. The owner's default disappears when its flag fires.
> - **The word:** not "plain". It collides with Plain, the reference voice. Use `"asked": true`, meaning the card's own ask. It says why the choice stays, not only that it stays.
>
> **(c) The deed `own_move_<card>`**
>
> - It may be written with no reader in M12, but only as an owed row on the board. My board step decides it: "every deed written is read somewhere or listed as owed."
> - Consequence 2 decides its pay-off: a reader must say the cause aloud. A bare id has no words in it. The best a reader could say is "you found your own way at the bridge", which is a cause with no content.
> - So the row stays owed until the deed carries the player's words or its result (scope §9 question 4).
> - The run report is not a reader. It proves the exit criterion, not the story.
>
> **(d) Where mapping to two choices fails**
>
> - **A deliberate act is the only worse choice:** `old_cairn` (take), `rufus_offer` (take), `sedges_jar` (open), `missing_sack` (search). If no non-act choice can take the failure, the DM answers in the scene and the card waits.
> - **Duplicate line:** on `osric_hears`, `tell` reads "Tell it in your own words." Next to the new line, the table would show "own words" twice. Rename `tell`.
> - **Two-choice cards** (`sheep_on_track`, `washed_out`, `goblin_scouts`, `goblin_ambush`, `stray_dog`, `rutted_road`, `what_agna_drew`, `loaf_at_the_sea`, `meadow_track`, `toll_paid_word`, `peddler`): the own move becomes the dice choosing between A and B. That is legal. If the words simply are A, the DM says so and the card is decided on A, with no check.
> - **A success landing on a fight** (`goblin_ambush`, `men_at_the_iron`, `rufus_due`): only allowed when the words asked for the fight.
> - **A named choice with its own check** (`read`, `tracks`, `warden`): the table hears two rolls. The director's note must say why the second roll happens.

Taken: conditions 2 and 3 (§1.2, §1.4), `asked` and the twin rule, her four cards plus `bridge_again`, whose `read` is already always offered since table #330 and is only marked (§1.9), `owner_pick` and `tell` (§1.9), the owed deed (§1.5). The success-on-a-fight and two-rolls points go into the DM prompt rule in AGT-99.

Not taken, for Stas to rule:
- **Condition 1, the two choices named before the vote.** The design shows the skill and keeps `success` and `failure` DM-only (§1.3), because naming them tells the outcome before the choice, against card test 5. Zoya says card test 2 (the stake visible) then holds only through the DM's narration of the move. The design takes that cost; if Stas prefers Zoya's reading, `success` and `failure` move to `CardPlayer.own_move`, a one-field change in API-56.
- **"The card is decided on A, with no check"** when the words simply are A. The DM never decides a card for a seat, so it says the words are choice A and the card waits for that number (§1.8).
