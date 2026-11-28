# 0104. Margin notes on the party's map: the stranger's pencil, the company's ink by deed

- **Status:** Proposed
- **Date:** 2026-11-28
- **Decided by:** Stas, thread, 2026-11-28: the gag (the party carries a stranger's old map); then his answers to Lev's eight questions, in Russian, translated by the calling thread: 1, 2, 5, 6 and 8 yes; 3 "doesn't matter"; 4 "by deed"; 7 no objection once the fields were explained; doodles in the margins and a name for the map's previous owner added the same day. His answers to the second round, the same day: the owner stays unnamed, "the Dead Man" («Мертвец»); Zoya's doodle cap, with every drawing taking one of a place's three entries. Lev Neiman proposes the wording under Decision; accepted on merge.
- **Supersedes:** [0077](0077-witnessed-deeds-on-a-card.md), rule 1 only. 0077 stays as written, and its rules 2 to 6 still govern `remembers` lines.

## Context

Stas asked for the party's map to be an old working copy annotated in pencil by a stranger, a previous owner. When the party learns better, the company crosses a note out and writes its own line beside it. The moment a player retells: "The map said the bridge was free. We crossed it out and wrote that we paid. On the way back there was a company board, so we crossed out our own line."

A company line that appears because the party did something is a deed in a player view. Decision 0077 rule 1 allows one form of that only, a person's `remembers` line on their card, and `contract/protocol.md` says the same (the Deeds paragraph, the `world.deeds` row of the visibility table). Decision 0071 rules out the other way: the DM's words never write a world fact.

Facts checked, on main 8f329c8 and the project files (Sources):

- **Stranger's notes: ten.** Seven show from the start: bridge, midwend, old_channel and the stranger's own correction of it, wendford, mill, moss. Three show when the Highsteads are discovered: highsteads, bald_hill_farm, fire_ring.
- **Five notes cut.** saltmouth points at `salt_flats`, which `map.json` keeps for the DM until it is discovered (Rule 3). snake, right_edge, spring and barrow_oak have no written pack that checks them.
- **Company lines: eleven, on eight deeds, each written today.**
  - Six deeds are written by card choices: four in `millbeck.json` (B8), one by `bridge_again` in `fenn.json`, one by `farm` on `gwyn_news` and `gwyn_cheese`.
  - Two (`snitt_yielded`, `yard_to_the_end`) are written by `s3_mill_yard`'s `on_end.remember`, a scene outcome.
- **At the bridge, one line applies at each step.** Each B8 choice writes exactly one of its four deeds. All four `bridge_again` choices write `saw_the_company_board`, so the board gets one line per B8 line: four rows, the same words. Its ford choice also writes `forded_the_company_toll`, which gets no line. The bridge is the fullest place: three notes.
- **No lie is possible today.** No card names the stranger, so no card can tell the party why he lied.
- **One line rests on the telling alone.** `asked_after_the_ridge_farm` is written by Gwyn's `farm` choice, but nothing tells the party the flock is gone, except the branch where both brothers died. Cards carry no authored outcome text, so the fix is one line in both cards' DM-only `note`.
- **Two checks are owed.** fire_ring has no line in any prose that shows the ring. old_channel's check is `salt_flats`, which has no pack.
- **The renderer** (`worlds/wend/mapgen/notes.ts`, project files) draws the stranger in pencil and the company in blue-black ink. A note is struck if and only if a showing note is written over it, and a company line shows only when the note it is written over shows.
- **Vera read the rendered sheets blind.**
  - She got the gag unaided: "When my company finds out a note is wrong, it crosses the note out and writes the truth under it in ink."
  - She told the hands apart "by the shape of the letters, though not by colour".
  - She could not separate the five lines of the bridge stack: "Strike on strike, ink over pencil, and it was the one place I skimmed."
  - At "A Saltmouth company": "My own party is also called a 'company', so which one is meant?"
  - And: "If this ink depends on what I did, I'd want to know beforehand that the map will remember it."

## Options

### A. The stranger's notes only; 0077 as it is
- Pro: no view change; discovery is public already, so nothing about a deed can leak.
- Con: the half a player retells is gone. The stale notes stand however the party learned better, so the map reads as a world that ignored them.

### B. Authored company lines by deed, one hand; amend 0077 rule 1 (chosen)
- Pro: the map is the one reader every seat shares. It needs no card to be drawn and no model to remember.
- Pro: every line is authored and read by Vera, so a test can check each one.
- Pro: the sheet is rebuilt from discoveries and deeds alone. Nothing new is stored, so nothing is lost on a load.
- Con: a second form of a deed in a player view. After a choice, a player can look at the map to learn whether the world kept it, for the eight deeds that have a line.
- Con: every line is authored text in two languages. A deed with no line shows nothing.

### C. The Narrator writes the notes
- Pro: any deed, any place, nothing to author.
- Con: against 0071. A model invents, no test can check that a line is true, and the map could run ahead of the telling or contradict it.

### D. One hand per character
- Pro: the map shows whose word it was.
- Con: the view needs `by` per seat, and four times the text. A line would speak in the human's character's voice in words the human never wrote.

## Decision

B (Stas, answers 4, 5 and 6). Decision 0077 rule 1 now reads, in full:

> 1. A player view may carry a deed in two forms only: a roster person's authored `remembers` line for that deed, on that person's card; and an authored margin line on the party's map, in the company's hand, shown to every party seat, when a choice or a scene outcome the party played wrote that deed. Neither form carries a deed's id, `by`, day, contract, digit or amount.

The margin notes follow these rules. Each is something a test can check:

1. **Two triggers only.**
   - A stranger's note shows from the start (`show: always`), or with the `place_discovered` of its place.
   - A company line shows when its `when` deed is remembered and its `over` note shows.
   - Nothing else adds or strikes a note: not the Narrator's words (0071), and not `card_shown`.
   - A deed the engine writes from a death (`killed_<npc>`, `<id>_dead`) carries no line. Nor does an `own_move_<card>` deed, which does not say which outcome the move brought.
   - Stas's "by deed" (answer 4) is read as: the company's lines change by deed alone, and the stranger's notes still come with discovery.
2. **Striking and the cap.** A note is struck if and only if a showing note has `over` equal to its id. At one place, only the newest note stands, and a place holds at most three entries, a drawing counting as one. A company drawing set over a note strikes it as a company line does, and its caption is the company's line.
3. **Never ahead of the telling.** A company line reaches a seat only after the DM's narration of the outcome that wrote its deed has reached that seat.
4. **True and false.**
   - A stranger's note may be stale. None is false at the start.
   - A false note needs all four of L1 to L4 from Lev's page: a card or a discovery shows it false; believing it costs no more than a choice already costs; it touches nothing the Narrator holds; and a card tells the party why the stranger lied.
   - A company line is never false. It says only what a card, a scene or a discovery has already shown the party.
   - This is the wording of Zoya's bible amendment 1. Stas left the choice between her wording and Lev's open (answer 3), and hers keeps L4 and names the hand.
5. **No leak, no fake choice.** No note shows at, or points at, a place the party has not discovered. No note names a DC, or names a choice's outcome before the choice is made (Rule 3).
6. **Fixed words.** Each note has fixed words. Zoya writes them in English and Russian, Vera reads them, and they carry no digits and no amounts. There is one company hand, the Undersigned's (0092), and never one character's.
7. **Rebuilt, never stored.** At contract start or a load, the sheet is rebuilt from the world's discoveries and deeds. Deeds carry across contracts (0063), and the Mill's deeds carry through its site memory (0075).

**Decided direction, content owed:**

- **Doodles** (Stas): funny drawings in the margins. A doodle is a note that is drawn instead of written.
  - It obeys rules 1 to 7: it has a hand and a trigger, it never shows at or points at an undiscovered place, it never runs ahead of the telling, and it carries no digit.
  - The cap (Stas): at most one doodle per hand at a place and six on a sheet, never over text, and each takes one of the place's three entries (rule 2).
  - A stranger's doodle that shows something is a claim, held to rule 4 like his notes. A company doodle shows only what was shown to the party.
  - A doodle never draws something a player could take for a map symbol: a place, a road, a crossing. A player reads a drawing on a map as the map, and Vera already went looking for a bridge the region sheet does not draw.
  - One exception is proposed with the plain-signs sheets (Zoya's third round), and awaits Stas: the previous owner's drawing may stand on a place in place of its sign, as the fire ring does. There is then one mark, not two.
  - Doodles are our own drawings, CC-BY-4.0 (Rule 7). Zoya owes the first ones, and Vera reads each on a rendered sheet.
- **The previous owner** (Stas): never named. "the Dead Man" («Мертвец») is what people called him.
  - Wherever a seat can see the name, it is player text, so Vera reads it.
  - A name is a setup. It sits on Zoya's board as owed until a card or a scene pays it off.
  - Until a card says who he was and why he lied, rule 4 holds and no note is a lie.
  - Who he was is story, for Zoya and Stas. Zoya's third round (`worlds/wend/mapgen/notes/zoya-dead-man-round3-2026-11-28.md`, project files): a salt-runner. His mark "Dead Man's map. Hands off." sits in a corner of the region sheet. Where and how he died stays with the Narrator until the pack that fills `salt_flats` pays it off.
  - Stas's rumour that he died rich and nobody found the money: Zoya says yes, on conditions. A person tells it, never the map or the Narrator. It points only where a written pack pays it off, and it ships with that pack («Камень A»), or it is struck.

## Consequences

- **Contract** (the implementing thread, under Rule 1). The goals:
  - The notes are world data the engine reads beside `map.json`, checked by `pack check`.
  - A party seat's world view carries the notes that show, each with its id, hand, lines and whether it is struck. It never carries `when` or `check`. The DM's view carries every note.
  - `projection.rs` picks the notes, never the page. The change is additive.
  - `contract/protocol.md`: the Deeds paragraph's last sentence and the `world.deeds` row gain this second exception, and a new visibility row gives the notes their view. A fixture shows it.
  - The visibility scan gains two cases: no `when` or `check` in a player view, and no company line before its deed.
- **Never ahead of the telling** is the game loop's to keep on the seat wire. It is tested with no model: with a scripted DM, a line's first appearance in a seat's stream comes after the narration of the beat that wrote its deed.
- **`pack check`, with no model.**
  - Every `when` deed has a writer in a pack on this world. A scene's `on_end.remember` and a check's `remember` count as writers; otherwise the two Mill lines fail.
  - Every `over` and `check` resolves.
  - No `when` names an engine death deed or an `own_move_*` deed.
  - No note carries a digit.
  - No stranger note is at an undiscovered place unless its `show` is that place.
  - Company lines over the same note use deeds that one card's choices write one at a time.
  - No place can stack more than three entries, drawings included; no place holds two drawings in one hand, and no sheet more than six.
- **Content owed** (Zoya writes, Vera reads, before each line ships):
  - `farm_no_flock` waits for the flock line in the `note` of `gwyn_news` and `gwyn_cheese`.
  - fire_ring ships with its notice line in `fw_highsteads.md` and `twb_highsteads.md`, or is cut.
  - The fire ring's lit night and the old channel's `salt_flats` are owed rows on Zoya's board, with no carrier yet.
  - Vera's word questions: "a Saltmouth company" next to the party's own company, "tally stick", "Carry a crust", "Moved on a map", "the Dyke".
  - The Dead Man's money rumour, with «Камень A» or struck.
- **The cost.** A deed with no line shows nothing on the map. A player can learn from the map which of these eight deeds the world kept. That is 0077's cost, on a short fixed list.
- **Rows and sizes are Yan's.**

## Revisit when

- A trace finds a company line on screen before the narration told its outcome, or a line whose fact the narration never told. The farm line rests on a DM note, so the Narrator carries it.
- A rendered stack is unreadable to Vera or to a playtester. Three notes at the bridge come to seven lines.
- A playtest crosses a struck note and nobody at the table mentions the map. Then the map is not a reader in practice.
- A card arrives that says why the stranger lied. Then rule 4 allows a lie.

## Sources

- Lev's design read, `worlds/wend/mapgen/notes/lev-margin-notes-2026-11-28.md` (project files).
- Zoya's content page, `worlds/wend/mapgen/notes/zoya-margin-notes-content-2026-11-28.md` (project files): the lines, the deed writers, bible amendments 1 and 2, and the board.
- Vera's read, `worlds/wend/mapgen/notes/vera-stranger-map-2026-11-28.md` (project files).
- The notes file and its renderer, `worlds/wend/mapgen/notes/margin-notes.json` and `worlds/wend/mapgen/notes.ts` (project files); the sheets in `worlds/wend/mapgen/out/*-working-notes-*.jpg`.
- Decisions [0063](0063-m11-the-road-remembers.md), [0071](0071-deed-from-words.md), [0075](0075-site-pack-joins-world-memory.md), [0077](0077-witnessed-deeds-on-a-card.md), [0092](0092-fine-print-and-the-undersigned.md); `contract/protocol.md`, the Deeds paragraph and the visibility table.
