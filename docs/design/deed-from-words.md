# Deed from words: system design

Status: Proposed. Lev Neiman (cloud fallback), 2026-11-12. No scope of its own; the goal is Stas's ask (2026-11-12 21:50Z): the DM proposes a deed from what a player said, Zoya and Lev moderate, Stas approves, a reader card is written at once. Input: the handover `engine/dramaturg/deed-from-words-handover.md`. Options: decision 0071. "The M13 scope" is the Proposed `docs/scope/dramaturg-mechanism-scope.md` of table #348; this PR merges after it. Author's read. Zoya's check is quoted in part in §10; Vera is not run: no line here is one a player sees.

## 1. Summary

A player says in their own words what their character wants from the world. The table answers the attempt at once, and on a later build a card stands on the road that would not exist without those words. A deed is written only when the party takes a choice on that card, and the card opens on deeds the world saw, never on the words.

The retelling: "I said at the fair I'd find the man in the frock coat and hire on with him. Next contract, at night in Saltmouth, he found us first."

## 2. What the record shows

Run `full-2026-11-12T19-02-03-994Z`: with no card open, Bren said he would read the frock-coated man's card and hire on with him next time.

1. The loop wrote the words into the transcript when they were said.
2. The end-of-journey `suggest` wake (AGT-91) turned them into a proposed card, `rufus_offer`, in `suggested-cards.json`, never loaded.
3. The run report already prints it (`wordReport`, `game/src/play/word.ts`). No person read that section. The id collides with a deck card, and the DM wrote the proposal from its memory of the run.

Missing: a person who reads that section, and a proposal built from the record.

## 3. A wish is not a deed

A deed is what the party did, on an outcome the engine recorded (0063; the M13 scope, §2 item 1: "never on the DM's word alone"). The record can vouch only that the seat said the words, and a card's `if` means "the party did this". So the wish becomes a **card**, and the deed (`signed_on_with_rufus`) is written by an ordinary `remember` when the party takes that card's choice.

## 4. Records

| Record | Who writes | When | Who reads | Where the player sees it |
| --- | --- | --- | --- | --- |
| The seat's words (transcript line; exists) | the loop | when said | the DM in that wake; the `suggest` wake (new) | the DM's answer in the scene |
| Proposed card `dm_<id>`, with `said` (the transcript line) and `stands_on` (remembered deeds, or a place); proposed, not approved (`suggested-cards.json`; two fields new) | the DM, in the `suggest` wake | journey's end | the page | nowhere: never loaded |
| The page (the report's suggested-cards section, extended) | `wordReport` | with the run report | Zoya, Lev, Stas | nowhere |
| Authored card: a choice that writes the deed, and its reader | Zoya drafts; the thread opens the PR | between runs | the deck engine | the card, on a later build |
| The deed (`remember`; exists) | the engine | when the party takes the choice | the reader's `if` | the reader card or choice |

## 5. The loop

1. **In the run.** The DM answers the attempt from what the scenario and world files hold. It may not grant the wish or name a person, place or price no file holds. **This is detected, not prevented:** the only check is a judge question reported after the run (rule 6). An unsupported promise can reach the player and the page cannot take it back; it prints the run's flags beside the proposal, and Zoya's card honours the line or the player was told something untrue. The run never waits on moderation.
2. **Journey's end.** The loop hands the `suggest` wake the human seat's lines said with no card open. The DM proposes up to two cards (today's cap).
3. **Between runs, once per exit pair.** The page shows, per proposal: the quoted words, the proposed text with each fact set against the file that holds it or marked "no file", and each `stands_on` deed with its writer and readers. The thread runs `/zoya cards` (her draft replaces the DM's text and passes her checks in §10), then `/lev play` and Vera on it, quoting all three.
4. **Stas approves by merging the content PR.** The choice that writes the new deed and its reader land in that PR together: that is "at once". It cannot mean the same run: content reaches play only by PR (Rule 8).

Stas-minutes per pair, an estimate the first batch measures: about 3 for the page and 10 for the content PR; none for a pair with no wish.

## 6. Rules (each a test could check)

1. The `suggest` wake's prompt holds the human seat's lines as the loop logged them, each with its transcript line number.
2. Every proposal is printed, raw text included. A `said` that is not one of those lines, or a `stands_on` entry that is neither a deed in the run's `world.deeds` nor a place id in `map.json`, is printed marked "not in the record". An empty `stands_on` prints as "stands on no deed".
3. The loop writes a proposal's id as `dm_<id>` (the prefix proposed in the Fair in Wend thread, no row yet), and `Deck::validate` in `crates/nat20-world` refuses a deck card id that starts with `dm_`.
4. No code path loads `suggested-cards.json` into a deck. Deed ids come only from deck files.
5. A wish's content PR carries two deck tests: the deed its new choice writes is read by a named `if` or `unless` in the packs, and the new card has an `if` on at least one deed. That no text quotes the wish is Zoya's read (decision 6).
6. A judge question, reported and not gated: "does the DM grant a wish, or name a person, place or price, that no scenario or world file holds?"

Ids (handover con 4): none comes from free text. Synonyms are Zoya's check at the page; no id pattern does it. The validator's rule stays "every deed read is written"; rule 5 adds a reader for wish-born deeds only.

## 7. Contract

No change (Rule 1): the wish never crosses the engine boundary. The words are a transcript line, the proposal a run file, the deed an existing `remember`. Rule 3: the proposal, the page and the deed are DM-only or offline; the player sees the card. Rule 4: nothing here rules an outcome. A card that opens only for those who voiced a wish would need the engine to carry it (0071, option B).

## 8. Failure

- **Moderation rejects:** one line of why on the page; the words do not come back, and the report counts it.
- **Moderation never comes:** proposals stay in run folders; nothing unchecked reaches a contract.
- **The model does not answer `suggest`:** as today, "none written"; the words stay in the transcript.

## 9. Carrier and PRs

1. **Authored card only** (`rufus_hires`): a content PR, needed under every variant; catches this wish.
2. **A "proposed deed" in the engine**: a DM command, event, state and fixture, an approval path that edits a saved roster, then 1 and 3's page anyway; the wish is in the world when said, and nothing reads it in its run.
3. **A proposed card from the record** (recommended): rules 1 to 4 and the page, then 1; catches any wish the human typed, with no contract change.

PRs for 3, beside M13 and outside its exit and count, code after M12's exit pair:

1. Docs: this design and 0071.
2. World (XS): rule 3's refusal. It can ride ENG-45's world PR.
3. Game: rules 1, 2 and 4, rule 3's prefix, the page.
4. Content: `rufus_hires`, opening on deeds the wishing party holds (`rufus_offer` writes `told_odda_of_rufus`, `refused_rufus_quietly` or `took_rufus_coin`); `signed_on_with_rufus` and its reader; rule 5's tests; Zoya, Lev's `play`, Vera. Waits on decision 6, not on 2 or 3.

Four PRs, three if 2 rides ENG-45. Variant 2 waits for a card that must open only for those who wished (Arachas plus glue).

Out: AI players' wishes; words said while a card is open (the own move, 0068); a journal line showing the player their wish (open: I don't know what the journal can carry).

## 10. Risks, and Zoya's check

- **The page is not read**, as the section was not. Cheapest test: build the first page by hand from the 2026-11-12 run before PR 3, and see whether Stas decides it in one sitting.
- A promise said aloud before moderation is only reported; a flag in the first pair reopens the guard (decision 4).
- "He found us first" holds only if Rufus acts on a deed he saw; otherwise the retelling goes, not the rule.

### Zoya's board check (cloud fallback), quoted in part

She read the draft before decision 5 replaced its `about` field with `stands_on`; her point that led there and her list of unread Rufus deeds are left out. Her check is to be asked again on this head.

> 1. Objection. Mostly met.

> If the DM says "Rufus hires at night in Saltmouth", that line is already canon in the player's memory, and the card will have to honour it.

> My draft replaces the DM's text; it is never pasted.

> - Owed: the Rufus wish. `rufus_hires` is not on disk.
> - Owed: `signed_on_with_rufus`. The handover names `bridge_again` and `company_paper` as its readers. `bridge_again` reads only `crossed_millbeck`, and `company_paper` is a choice that writes `read_the_company_paper`. Neither reads the new deed yet.
> - Paid by this design: none.

> 3. Checks the moderation page lacks.
> - Consequence 2. Only those who saw react. Under option C nobody knows of the wish. If Rufus "finds us first", he does it because of a deed he saw, never because of words he could not have heard.
> - Guardrail 8. No choice voices Bren's wish as Bren's line, and no choice grants it.
> - Story-space 3 and card test 3. Hiring on costs something: `keeps: paper_is_law`, `breaks: word_kept` toward Odda.
> - Compass person 5. Signing on with Rufus moves the human's character one cell toward the market side. Name that cell.
> - Guardrail 1. The pay for the hire comes from the ledger, never from the card's text.
> 4. Amendment. Policy: a card born of a player's wish opens on deeds the world saw. The wish itself is never read aloud as a cause. Why: option C records no wish, and Consequence 2 lets only witnesses react. Blocks: the `rufus_hires` draft.

## 11. Decisions for Stas

1. **A card, not a deed (a challenge to the framing).** The record shows the wish was captured, proposed and printed; nobody read it, and a wish is not something the party did. Proposed: the DM proposes a card; the deed is written when the party takes its choice; "at once" means the deed's writer and reader land in one PR. Cost: no card can yet open only for those who voiced the wish. Recommended (0071, option C).
2. **Carrier and place:** variant 3 with `rufus_hires` as its first batch, four PRs beside M13 and outside its exit (three if the `dm_` refusal rides ENG-45); variant 2 to Arachas plus glue. Recommended; the alternative is after M13 closes.
3. **The loop's limits:** the human seat's wishes only, one page per exit pair, at most two proposals, approval by merging the content PR. Recommended, until the first batch is measured.
4. **What the DM says before moderation is detected, not prevented:** a judge question, reported and not gated. Recommended as the smaller option; the alternative is a model that reads every narration before the seat shows it.
5. **What a wish points at.** Rufus is in no world file. (a) Put him in `npcs.json`: `NpcDef` requires `monster`, `place` and `anchor`, the server spawns a place NPC at arrival, and Rufus travels. (b) Accept persons named in deck notes and the glossary: nothing a test can read. (c) The proposal names no person: `stands_on` lists deeds from the run's `world.deeds`, or a place id. Recommended: (c). The engine already holds it and a test can read it. Cost: a wish about someone the party has no deed with stands on nothing, and the page says so.
6. **Zoya's amendment** (her bible, her PR): a card born of a player's wish opens on deeds the world saw, and the wish is never read aloud as a cause. Recommended: accept; it blocks the `rufus_hires` draft until decided.
