# Deed from words: system design

Status: Proposed. Lev Neiman (cloud fallback), 2026-11-12, main and `table/m13-dramaturg-mechanism-scope` (table #348). No scope of its own; the goals are Stas's ask (2026-11-12 21:50Z): the DM proposes a deed from what a player said, Zoya and Lev moderate, Stas approves, a reader card is written at once. Input: the handover `engine/dramaturg/deed-from-words-handover.md`. Decision record: 0071 (Proposed). Author's read. Zoya's board check is quoted in §11 and folded in; Vera is not run: the draft has no line a player sees.

## 1. Summary

A player says in their own words what their character wants from the world. The table answers the attempt at once, and on a later build a card stands on the road that would not exist without those words. What they say becomes a deed only when the party takes a choice on that card, and the card opens on deeds the world saw, never on the words themselves.

The retelling: "I said at the fair I'd find the man in the frock coat and hire on with him. Next contract, at night in Saltmouth, he found us first."

## 2. The case, and what the record shows

Run `full-2026-11-12T19-02-03-994Z`: with no card open Bren said he would take the frock-coated man's card, read who he is, and hire on with him next time. 
1. The words were recorded when said: the transcript holds them as the seat's own line, written by the loop.
2. The existing end-of-journey `suggest` wake (AGT-91) did turn them into a proposed card, `rufus_offer`, written to the run folder and never loaded.
3. Nobody read that file, its id collides with a deck card, and the DM wrote it from its own memory of the run.

The path from words to a proposal exists. Missing: a reader of the proposal, and a proposal built from the record, not the model's memory.

## 3. A wish is not a deed

A deed today is what the party did, on an outcome the engine recorded (0063; M13 scope §2 item 1: "never on the DM's word alone"). "Wants to hire on" is a wish. It stays out of the `DeedBook`:

- **Truth.** The only fact the record can vouch for is "this seat said these words". Anything more, written as a deed, is the DM ruling an outcome (against the scope's letter and Rule 4's spirit).
- **Readers.** A card's `if` means "the party did this". A wish in the same id space makes every reader ask which kind it holds.
- **Timing.** Moderation is between runs under every variant (§5), so nothing reads an in-run "proposed deed" in its own run: engine state buys nothing a run file does not.

The wish becomes a **card**. The deed is written when the party takes that card's choice (`signed_on_with_rufus` on `rufus_hires`), by an ordinary `remember`.

## 4. Records

| Record | Who writes | When | Who reads | Where the player sees it |
| --- | --- | --- | --- | --- |
| The seat's words (transcript line; exists) | the loop | when said | the DM in that wake; the `suggest` wake (new: the loop hands it the human seat's lines); Lev's trace | the DM's answer in the scene |
| Proposed card `dm_<id>` with `said` (the transcript line it answers) and `about` (a world id); state: proposed, not approved (`suggested-cards.json`; exists, two fields new) | the DM, in the `suggest` wake | journey's end | the moderation page | nowhere: never loaded |
| Moderation page (new; a section of the run report) | the report builder | with the run report | Zoya, Lev, then Stas | nowhere |
| Authored card pair: a choice that writes the deed, and its reader | Zoya drafts; the thread opens the PR | between runs | the deck engine | the card, on a later build |
| The deed (`remember`; exists) | the engine | when the party takes the choice | the reader's `if`; `card_shown.reads` | the reader card or its changed choice |

Cut: a mid-run DM tool and a "proposed" row in the world's memory. Their only reader would be the page, which the transcript line already feeds.

## 5. The moderation loop

1. **In the run.** The DM answers the attempt, only from what the scenario and world files hold. It may not grant the wish, promise it, or name a person, place or price no file holds: a line said aloud is canon in the player's memory (rule 7). The run never waits on moderation.
2. **Journey's end.** The loop hands the `suggest` wake the human seat's own lines said with no card open. The DM proposes up to two cards (today's cap), each with `said` and `about`.
3. **Between runs, batched per exit pair.** The report prints the page: per proposal the quoted words, the proposed card with each fact in its text and `note` set against the file that holds it (or marked "no file"), and the deeds already written about the same `about`, with their readers. The calling thread runs `/zoya cards`: her draft replaces the DM's text, which is never pasted, checked against her list in §11 (item 3). Then `/lev play` on her draft and Vera on its text; all three are quoted.
4. **Stas approves by merging the content PR.** That is the approval; there is no other.

"At once" is read as "in the same PR": the choice that writes the new deed and its reader land together (Rule 8; the Vera and Zoya gates unchanged). It cannot mean "in the same run": content reaches play only by PR.

**Cost per pair, in Stas-minutes: an estimate, not a measurement.** At most two proposals: about 3 minutes for the page and one content PR review, about 10. A pair with no wish costs nothing. The first batch measures it.

## 6. Rules (each a test could check)

1. The `suggest` wake's prompt contains the human seat's lines as the loop logged them, byte for byte, each with its transcript line number.
2. A proposal whose `said` is not one of those lines, or whose `about` is not an id in the world's `npcs.json` or `map.json`, is kept as `unread` and never reaches the page. Rufus is in neither today, so the design's own case fails this rule until decision 8.
3. A proposed card's id is always `dm_<id>` (the handover's AGT-106); the deck validator refuses a deck card whose id starts with `dm_`.
4. No code path loads `suggested-cards.json` into a deck.
5. Deed ids come only from deck files. Nothing derives an id from free text.
6. The content PR of a wish carries a deck test: the deed its new choice writes is read by a named card's or choice's `if` or `unless` that exists in the packs. The handover's two readers do not read it yet (§11).
7. Proposed judge question (a design item for the narration judge): "does the DM grant a wish, or name a person, place or price, that no scenario or world file holds?" (widened on Zoya's check).
8. A card born of a wish has an `if` on at least one deed, and no card or choice text quotes the wish (decision 9): a deck test for the first half, Zoya's read for the second.

On ids (con 4): synonyms are caught by a person at the page, which lists every written deed whose id contains the `about` id (the Rufus deeds all contain `rufus`). The validator's rule stays "every deed read is written"; it requires no reader for a deed today, and rule 6 adds one for wish-born deeds only.

## 7. Contract

No change (Rule 1): the wish never crosses the engine boundary. The words are a game-loop transcript line, the proposal a run file, and the deed arrives by the existing `remember`. Rule 3: the seat's words are already public; the proposal, the page and the deed are DM-only or offline; the player sees effects. Rule 4: nothing here rules an outcome; the authored card's own check is the engine's.

A card that opens only for a party that voiced a wish needs the engine to carry it. Goals for that change, not proposed now: the words supplied by the loop, never the DM (as `own_move`); the id derived from a closed set (`spoke_of_<npc>`, as `killed_<npc>` and `own_move_<card>`), counted by `deeds_written`; DM-only (`deed_remembered`, an optional `cause` on the deed, the room M13 design question 7 keeps); additive.

## 8. Failure

- **Moderation rejects.** The page records one line of why. Nothing changes in the world. The player's words do not come back; that is the cost, and the report counts it.
- **Moderation never comes.** Proposals stay in run folders. No unchecked canon reaches any contract (handover con 2).
- **The model does not answer `suggest`.** As today: logged, the report says none were written. The words stay in the transcript for a trace.

## 9. The smallest carrier

| | What lands | Catches | Cost |
| --- | --- | --- | --- |
| 1. Authored card only (`rufus_hires`) | 1 content PR, needed under every variant | this wish; later ones only if someone reads the transcript | none new |
| 2. DM "proposed deed" queue in the engine | a DM command, an event, a "proposed" state, fixture, CHANGELOG, server; an approval path that edits a saved roster (the engine never does today); then 1 | any wish, recorded in the world when said | 1 contract and server PR, 1 game PR, plus 3's page anyway |
| 3. Proposed card from the record (recommended) | the `suggest` wake reads the seat's lines; `said`, `about`, `dm_`; the page; then 1 | any wish the human typed | 1 game PR, no contract |

Recommended: 3, with 1 as its first batch. PRs:

1. This design and decision 0071 (docs).
2. Game: rules 1 to 4 and the moderation page. Depends on nothing in M13.
3. Content: `rufus_hires`, opening on Rufus deeds the world saw (nine have no reader today, §11), its deed `signed_on_with_rufus` with a real reader, the tests of rules 6 and 8, and what decision 8 needs; Zoya, Lev's `play`, Vera. Depends on Zoya's draft and decisions 8 and 9, not on 2.

Three PRs, two beyond the content PR already planned. Placement: beside M13, outside its exit and its count, as ENG-45 is; code after M12's exit pair (scope amendment 1). M13 already has its one new system. Variant 2 waits for the first card that must open only for those who wished (Arachas plus glue), beside "claims as deeds" and the own-move words, which the scope shelves for the same reason: no reader.

## 10. Out

- AI players' wishes: human seat only until the first batch is measured.
- Words said while a card is open: the own move (0068).
- A journal line showing the player their own wish: open; I don't know what the journal can carry.
- Engine-carried wishes (§7): Arachas plus glue.

## 11. Risks

- **The page is not read.** This loop is the case's own failure with a better file. Cheapest test: build the first page by hand from the 2026-11-12 run before PR 2, and see whether Stas decides it in one sitting.
- A card approved for one player's wish is drawn by parties who never said it. `rufus_hires` must stand on its own deeds (rule 8); the `play` read checks that.
- "He found us first" holds only if Rufus acts on a deed he saw; otherwise the retelling goes, not the rule.
- Not run: Vera. The draft has no line a player sees; the card's text goes to her in PR 3.

### Zoya's board check (cloud fallback)

> 1. Objection. Mostly met. No deed comes from free text, deed ids come only from deck files, and nothing the DM proposes can load. Three leaks are still open:
> - The in-run answer. §5.1 forbids a new person, place or price, but nothing checks it. The rule 7 judge question only asks whether a wish was "granted". If the DM says "Rufus hires at night in Saltmouth", that line is already canon in the player's memory, and the card will have to honour it. Widen the judge question to "names a person, place or price that no scenario or world file holds".
> - The proposal's text and `note`. A DM `note` invents background. The page has to set each fact in the proposal against the files. My draft replaces the DM's text; it is never pasted.
> - `about`. Rufus is not in `worlds/wend/npcs.json`. Its only people are `shepherd_gwyn`, `osric_hale` and `warden_brannock`. He lives in deck notes and the glossary. Under rule 2 the design's own case comes out `unread`, or gets filed under `wendmouth`, and the person is lost. Either Rufus goes into `npcs.json` or rule 2 accepts persons named in a pack's deck notes and glossary. That is a question for Stas.
> 2. Board.
> - Owed: the Rufus wish. `rufus_hires` is not on disk.
> - Owed: `signed_on_with_rufus`. The handover names `bridge_again` and `company_paper` as its readers. `bridge_again` reads only `crossed_millbeck`, and `company_paper` is a choice that writes `read_the_company_paper`. Neither reads the new deed yet. Rule 6's test has to name a real `if`.
> - Owed: nine Rufus deeds with no reader: held_the_road_against_rufus, sold_rufus_the_road, heard_of_rufus_paper, read_the_company_paper, gave_rufus_back_his_coin, refused_rufus_his_due, named_rufus_at_the_gate, shamed_rufus_on_his_stall, faced_rufus_down. `rufus_hires` should read some of them. That pays these rows and lets the card stand without the wish (§11).
> - Paid by this design: none.
> 3. Checks the moderation page lacks.
> - Consequence 2. Only those who saw react. Under option C nobody knows of the wish. If Rufus "finds us first", he does it because of a deed he saw, never because of words he could not have heard.
> - Guardrail 8. No choice voices Bren's wish as Bren's line, and no choice grants it.
> - Story-space 3 and card test 3. Hiring on costs something: `keeps: paper_is_law`, `breaks: word_kept` toward Odda.
> - Compass person 5. Signing on with Rufus moves the human's character one cell toward the market side. Name that cell.
> - Guardrail 1. The pay for the hire comes from the ledger, never from the card's text.
> - A new person is a question for Stas, not a draft.
> 4. Amendment. Policy: a card born of a player's wish opens on deeds the world saw. The wish itself is never read aloud as a cause. Why: option C records no wish, and Consequence 2 lets only witnesses react. Blocks: the `rufus_hires` draft.
> Not run: Vera. Neither file has a line a player sees yet.

## 12. Decisions for Stas

1. **Challenge to the framing.** The record shows the wish was captured and proposed; it died unread, and a wish is not something the party did. Proposed: the DM proposes a card, not a deed; the deed is written when the party takes that card's choice. Cost: no card can yet open only for those who voiced the wish. Recommended: accept (decision 0071, option C).
2. **Carrier:** 3 with 1 as its first batch; variant 2 to Arachas plus glue. Recommended.
3. **Placement:** beside M13, outside its exit and count, three PRs. Recommended; the alternative is after M13 closes.
4. **"At once" means the same PR** as the deed's first writer, never the same run. Recommended.
5. **Whose wishes:** the human seat only until the first batch is measured. Recommended.
6. **Batching:** one page per exit pair, at most two proposals, approval by merging the content PR. Recommended.
7. **The judge's new question** (rule 7, as Zoya widened it): add it as reported, not gated. Recommended.
8. **`about` and Rufus.** Rufus is not in `worlds/wend/npcs.json`; under rule 2 the case comes out `unread`. (a) Rufus goes into `npcs.json` with PR 3, and rule 2 stays a closed list; (b) rule 2 also accepts persons named in a pack's deck notes and glossary. Recommended: (a). A closed list is what a test can read, and a person the decks' deeds already name belongs in the world's file; the cost is one entry, with Zoya's and your yes to what it says of him.
9. **Zoya's amendment** (her bible, her PR): a card born of a player's wish opens on deeds the world saw, and the wish is never read aloud as a cause. Recommended: accept; rule 8 follows it, and it blocks the `rufus_hires` draft until decided.
