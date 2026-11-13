# Deed from words: system design

Status: Proposed. Lev Neiman (cloud fallback), 2026-11-12. No scope of its own; the goal is Stas's ask (2026-11-12 21:50Z): the DM proposes a deed from what a player said, Zoya and Lev moderate, Stas approves, a reader card is written at once. Input: the handover `engine/dramaturg/deed-from-words-handover.md`. Options: decision 0071. "The M13 scope" is the Proposed `docs/scope/dramaturg-mechanism-scope.md` of table #348; this PR merges after it. Author's read. Zoya's two checks are quoted in §10; Vera is not run: no line here is one a player sees.

## 1. Summary

A player says in their own words what their character wants from the world. The table answers the attempt at once, and on a later build a card stands on the road that would not exist without those words. A deed is written only when the party takes a choice on that card, and the card opens on deeds the world saw, never on the words.

The retelling: "I said at the fair I'd find the man in the frock coat and hire on with him. Next contract, at night in Saltmouth, he found us first."

## 2. What the record shows

Run `full-2026-11-12T19-02-03-994Z`: with no card open, Bren said he would read the frock-coated man's card and hire on with him next time.

The loop wrote the words into the transcript when they were said. The end-of-journey `suggest` wake (AGT-91) turned them into a proposed card, `rufus_offer`, in `suggested-cards.json`, never loaded, and the run report prints it (`wordReport`, `game/src/play/word.ts`). No person read that section; the id collides with a deck card; the DM wrote the proposal from its memory of the run.

Missing: a person who reads that section, and a proposal built from the record.

## 3. A wish is not a deed

A deed is what the party did, on an outcome the engine recorded (0063; the M13 scope, §2 item 1: "never on the DM's word alone"). The record can vouch only that the seat said the words, and a card's `if` means "the party did this". So the wish becomes a **card**, and the deed (`signed_on_with_rufus`) is written by an ordinary `remember` when the party takes that card's choice.

## 4. Records

| Record | Who writes | When | Who reads | Where the player sees it |
| --- | --- | --- | --- | --- |
| The seat's words (transcript line; exists) | the loop | when said | the DM in that wake; the `suggest` wake (new) | the DM's answer in the scene |
| Proposed card `dm_<id>`, with `said` (the transcript line) and `stands_on` (remembered deeds); proposed, not approved (`suggested-cards.json`; two fields new) | the DM, in the `suggest` wake | journey's end | the page | nowhere: never loaded |
| The page (the report's suggested-cards section, extended) | `wordReport` | with the run report | Zoya, Lev, Stas | nowhere |
| Authored card: a choice that writes the deed, and its reader | Zoya drafts; the thread opens the PR | between runs | the deck engine | the card, on a later build |
| The deed (`remember`; exists) | the engine | when the party takes the choice | the reader's `if` | the reader card or choice |

## 5. The loop

1. **In the run.** The DM answers the attempt from what the scenario and world files hold. It may not grant the wish or name a person, place or price no file holds. **This is detected, not prevented:** the only check is a judge question reported after the run (rule 6). An unsupported promise can reach the player and the page cannot take it back; it prints the run's flags beside the proposal. The run never waits on moderation.
2. **Journey's end.** The loop hands the `suggest` wake the human seat's lines. The DM proposes up to two cards (today's cap). The wake runs only when the journey ends unstopped (§8).
3. **Between runs, once per exit pair.** The page shows, per proposal: the quoted words, the proposed text with each fact set against the file that holds it or marked "no file", and each `stands_on` deed with its writer and readers. The thread runs `/zoya cards` (her draft replaces the DM's text and passes the bible checks her first read named: Consequence 2, guardrails 1 and 8, story-space 3 and card test 3, compass person 5), then `/lev play` and Vera on it, quoting all three.
4. **Stas approves by merging the content PR.** The choice that writes the new deed and its reader land in that PR together: that is "at once". It cannot mean the same run: content reaches play only by PR (Rule 8).

Stas-minutes per pair, an estimate the first batch measures: about 3 for the page and 10 for the content PR; none for a pair with no wish.

## 6. Rules (each a test could check)

1. The `suggest` wake's prompt holds every line the human seat typed, as the loop logged it, with its transcript line number. Lines said on an open card are not filtered: the transcript has no such field.
2. Every proposal is printed, raw text included. When the loop writes the proposal it reads the DM's `world.deeds` from the engine (this contract's deeds and the roster's earlier ones) and marks each `stands_on` entry found or "not in the record"; a `said` that is not one of rule 1's lines gets the same mark. `wordReport` prints the marks; alone it sees only this run's `deed_remembered` events. A `stands_on` that is empty or names only a place prints as "stands on no deed" and cannot ship under decision 6: its card would open for every party that passes.
3. The loop writes a proposal's id as `dm_<id>` (the prefix proposed in the Fair in Wend thread, no row yet). A deck test in the content PR asserts no deck card id starts with `dm_`.
4. No code path loads `suggested-cards.json` into a deck. Deed ids come only from deck files.
5. A wish's content PR carries two deck tests: the deed its new choice writes is read by a named `if` or `unless` in the packs, and the new card has an `if` on at least one deed. That no text quotes the wish is Zoya's read (decision 6).
6. A judge question, reported and not gated: "does the DM grant a wish, or name a person, place or price, that no scenario or world file holds?"

Ids (handover con 4): none comes from free text; synonyms are Zoya's check at the page. The validator's rule stays "every deed read is written"; rule 5 adds a reader for wish-born deeds only.

## 7. Contract

No change (Rule 1): the wish never crosses the engine boundary. The words are a transcript line, the proposal a run file, the deed an existing `remember`. Rule 3: the proposal, the page and the deed are DM-only or offline; the player sees the card. Rule 4: nothing here rules an outcome. A card that opens only for those who voiced a wish would need the engine to carry it (0071, option B).

## 8. Failure

- **Moderation rejects:** one line of why on the page; the words do not come back, and the report counts it.
- **Moderation never comes:** proposals stay in run folders; nothing unchecked reaches a contract.
- **The model does not answer `suggest`:** as today, "none written"; the words stay in the transcript.
- **The run stops** (time limit, operator, usage limit, stall, login, offline, crash): the loop skips `suggest` (`this.campaign && !this.table.stop && !failure`), and the wish is lost to the page. A known loss, smaller than building proposals from the transcript; the report says "not asked: the run stopped", so it is not silent.

## 9. Carrier and PRs

The options are 0071's. **A**, authored cards only: `rufus_hires`, needed under every option. **B**, a "proposed deed" in the engine: a contract change, an approval path that edits a saved roster, and nothing reads the deed in its run. **C**, a proposed card from the record (recommended): rules 1 to 4 and the page, then A; no contract change.

Three PRs, beside M13 and outside its exit and count, code after M12's exit pair:

1. Docs: this design and 0071.
2. Game: rules 1 to 4 and the page.
3. Content: `rufus_hires`. In the case run the party held no Rufus deed (Zoya, §10), so the PR gives the failed hold on `yellow_wagon` the deed `rufus_got_ahead` (Rufus drove past them: the world saw it), and `rufus_hires` opens on it. A card's `if` is all-of, so opening on `refused_rufus_quietly` too means a twin card: Zoya's call. `signed_on_with_rufus` has no reader on disk; the PR adds one, a choice under `if: signed_on_with_rufus` on the handover's `bridge_again` unless Zoya names another, and rule 5's test names it. Also rule 3's test; Zoya, Lev's `play`, Vera. Waits on decision 6, not on 2.

B waits for a card that must open only for those who wished (Arachas plus glue).

Out: AI players' wishes; a journal line showing the player their wish (open: I don't know what the journal can carry).

## 10. Risks, and Zoya's check

- **The page is not read**, as the section was not. Cheapest test: build the first page by hand from the 2026-11-12 run before PR 2, and see whether Stas decides it in one sitting.
- A promise said aloud before moderation is only reported; a flag in the first pair reopens the guard (decision 4).
- "He found us first" holds only if Rufus acts on a deed he saw; otherwise the retelling goes, not the rule.
- No deed records the calling card Bren read, so `rufus_hires` cannot cite it. Left so here; a deed for it is Zoya's to ask for.

### Zoya's board checks (cloud fallback)

The first, quoted in part; her second answers the rest.

> 4. Amendment. Policy: a card born of a player's wish opens on deeds the world saw. The wish itself is never read aloud as a cause. Why: option C records no wish, and Consequence 2 lets only witnesses react. Blocks: the `rufus_hires` draft.

The second, verbatim. Her "PR 4" is PR 3 here; rule 2, §9 and the risks answer it.

> Earlier points.
> - The in-run answer: met as detection. Prevention was dropped, and decision 4 gives the reason. The judge question now names person, place and price. The risk stays, as §10 says.
> - The proposal text: met. Each fact is set against its file, and my draft replaces the DM's text.
> - `about`: met. `stands_on` replaces it.
> - The checks the page lacked: met. The page refers to them, and rule 5 adds the `if` test.
> - The amendment: carried as decision 6, waiting on Stas.
> - `signed_on_with_rufus`: still open. Rule 5 asks for a named reader, and PR 4 still names none.
> - The nine unread Rufus deeds: left out of the quote. They are still owed on my board. `rufus_hires` reading `refused_rufus_quietly` would pay one.
>
> Does `stands_on` hold for Rufus? No. Lev's trace of that run lists the deeds the party holds: `told_the_warden_of_the_bridge`, `fed_gwyns_dog`, `crossed_millbeck`, `toll_men_fought`. None of them is a Rufus deed. `rufus_offer` was never drawn. The failed hold on `yellow_wagon` wrote neither `rufus_got_ahead` nor `let_the_yellow_wagon_pass`. So PR 4's card opens on deeds this party lacks, and Bren, the one who wished, never draws it. His `stands_on` is empty or a place. Smaller fix: give the failed `yellow_wagon` hold a deed in the same content PR, and let `rufus_hires` open on it as well. That is a deed the world saw, because Rufus drove past them.
>
> New.
> - Rule 2 accepts a place id alone. A card standing only on a place opens for every party that passes, which breaks decision 6. The page should mark place-only proposals "stands on no deed".
> - The calling card Bren read is the one detail the player will remember about Rufus. No deed records it, so the card cannot cite it.

## 11. Decisions for Stas

1. **A card, not a deed (a challenge to the framing).** The record shows the wish was captured, proposed and printed; nobody read it, and a wish is not something the party did. Proposed: the DM proposes a card; the deed is written when the party takes its choice; "at once" means the deed's writer and reader land in one PR. Cost: no card can yet open only for those who voiced the wish. Recommended (0071, option C).
2. **Carrier and place:** option C with A's `rufus_hires` as its first batch, three PRs beside M13 and outside its exit; B to Arachas plus glue. Recommended; the alternative is after M13 closes.
3. **The loop's limits:** the human seat's wishes only, one page per exit pair, at most two proposals, approval by merging the content PR. Recommended, until the first batch is measured.
4. **What the DM says before moderation is detected, not prevented:** a judge question, reported and not gated. Recommended as the smaller option; the alternative is a model that reads every narration before the seat shows it.
5. **What a wish points at.** Rufus is in no world file. (a) Put him in `npcs.json`: `NpcDef` requires `monster`, `place` and `anchor`, the server spawns a place NPC at arrival, and Rufus travels. (b) Accept persons named in deck notes and the glossary: nothing a test can read. (c) The proposal names no person: `stands_on` lists deeds from the DM's `world.deeds`. Recommended: (c). The engine already holds it and a test can read it. Cost: a wish about someone the party has no deed with stands on nothing, as Bren's did; the page says so, and the content PR must first give the party a deed the world saw.
6. **Zoya's amendment** (her bible, her PR): a card born of a player's wish opens on deeds the world saw, and the wish is never read aloud as a cause. Recommended: accept; it blocks the `rufus_hires` draft until decided.
