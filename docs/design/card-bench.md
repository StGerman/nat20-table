# The card bench: one card, a live DM, a list of lines

- **Status:** Proposed. Nothing is built and no TASKS.md row exists until Stas accepts this design (decision 0080: "the design comes first, with its cost")
- **Date:** 2026-11-14
- **Decision:** `docs/decisions/0084-card-bench-by-a-pile-of-one.md` (Proposed)
- **Asked by:** Stas, 2026-11-14 19:42Z: «Проектировать стенд карточки давай потестируем на M13 и если пойдет сделаем это правило постоянным»
- **Builds on:** `docs/design/content-test-layers.md` §4 and decision 0080 (table #383), which name the bench as a candidate and list six open points. This doc answers them

## 1. Summary

One command, `npm run play:card`, puts one named card on the table of a real contract, hands it to the live DM, types a list of lines at the human's seat and writes down what the DM and the engine did with each. It is the smallest live run the game has: about 0.5 USD and a minute to the first line, about 0.05 USD and 10 to 25 seconds for each further line while the card still waits.

It answers one question before an evening does: **can this card hold what a person says?** It answers it only for lines somebody thought of beforehand. It does not replace either half of an exit pair and changes no exit rule.

What it would have seen in the Milestone 12 record: run 01:42's two plans, on `bog_wifes_toll` and `salt_on_credit`, had those lines been on a list before the evening. Nobody had them. What it would not have seen: run 16:05's failure, a plan said between cards. So the honest claim is narrow: the bench moves the first live reading of a card's words from Stas's evening to a five-minute run, for the lines we can guess.

## 2. The six open points, answered

| Open point (`content-test-layers.md` §4) | Answer |
|---|---|
| How a named card reaches the table | A temporary copy of the pack whose decks hold that card alone. A pile of one goes on the table with no draw-three and no pick (§3). No contract change |
| One move a card | A line that leaves the card waiting is followed by the next line in the same session. A line that settles the card ends the session, and the next line starts a fresh one (§4) |
| No evening behind the card | True, and not fixed. A line that leans on an earlier scene is left out of the list, and the report says so. A card that reads deeds is played on a copy of a saved roster, so the deed book is real (§3) |
| A narrated outcome is text | The bench reports and does not judge. A person reads the DM's text beside the tool calls and the engine's events (§4) |
| What a pass is | None in this version. The trial counts findings (§5); a threshold needs rates nobody has measured |
| Who runs it | Stas, on his Mac, one command a card (decision 0036). The run folder goes up with `runs:upload`; the analysis thread reads it |

## 3. How the card reaches the table

Checked on main at 6d0766f.

- `crates/nat20-world/src/deck.rs`, `draw`: "A pile of one puts its card on the table". The pile is the cards of one zone and one `when` that are in play.
- `game/src/pack/campaign.ts`, `worldDir`: a pack that carries its own `worlds/<map>/map.json` plays that world, not the shared one.
- `game/test/campaign-loop.test.ts`, the ENG-35 test, already does both by hand: it copies `scenarios/fair_in_wend` and `worlds/wend` into a temporary folder and writes one arrival card into the copy's deck.

The bench does the same for any card id:

1. Copy the pack and its world into a temporary folder.
2. Take every other card out of the copy's decks, the world's and the pack's.
3. Cut the copy's `world.start` and `world.route` to the shortest stretch that reaches the card: start at the last place on the pack's route that has a scene, before the road (a road card) or the place (an arrival card) of the card's zone. On today's two campaign packs that is one or two legs for every zone on a route.
4. Play it with the real loop: the live DM, scripted AI seats, and a scripted human seat that moves the caravan on until the card is on the table, then types the lines.

Cards that read deeds (`if`): the bench takes `--roster NAME` and plays on a copy of that roster in a temporary `--rosters` folder, so the saved party is never written over. Milestone 13's two Wendford arrival cards read Mill deeds; their roster is one saved by a run of *The Silent Mill* (§5).

Night cards are out of this version: nothing in the Milestone 13 trial needs one.

## 4. A session, and what is written down

The lines are a text file, one line of the player's words per row, given with `--lines FILE`. With `--seat ink` a person types instead.

For each line the human's seat types it at the card's prompt and the bench waits for the table to settle:

- the DM answers and the card still waits: the next line goes in;
- the words become an own move, the scripted AI seats vote for it, the engine rolls, and the card is decided or the move falls (decision 0081): the next line goes in if the card still waits;
- the card is decided: the session ends. Lines left over start a fresh session each time.

When the lines run out with the card still waiting, the bench stops. It never picks a number.

The scripted AI seats always vote for the own move, so the roll always happens. What AI players do with a card is a different question (the seat bench, considered and not proposed in `content-test-layers.md` §4).

**The report**, `bench.md` in the run folder beside the usual run files, has one block a line:

- the line as typed;
- the DM's `own_move_or_answer` call: an answer, or an own move with its skill, DC, success choice and failure choice;
- an engine refusal, with its reason;
- the roll id and result, the choice that decided the card, and what that choice did (deeds, delay, coin);
- every `remember` the DM called in that wake;
- the DM's words to the table;
- USD and seconds.

The report is the DM's side of the table, like a run's analysis. It is never shown to a player (Rule 3).

**Reading it.** The analysis thread gives each line one of four readings: *landed* (an own move on a choice that fits the words), *answered* (a question got an answer and nothing changed), *nowhere to land* (a plan with no choice to carry it, or a refusal), *ruled without a roll* (an outcome narrated or remembered with no roll, as on `salt_on_credit` in run 01:42). The last two are findings. The verdict on a finding is Stas's.

## 5. The Milestone 13 trial

**Cards.** Three or four:

- the two new Wendford arrival cards of MAP-20, which the row `m13-carried` rests on: the first time a live DM and a person's words meet one of them is otherwise Stas's run 2. Each reads its own yard deed (`snitt_yielded` or `yard_to_the_end`), and one Mill run writes only one of the two, so each card needs its own roster;
- `bog_wifes_toll` and `salt_on_credit`, with the plans Stas said on them in run 01:42. No live run has tried those plans since decision 0079 changed what an own move may be. Their rules change again under decision 0083 (open table #394), so this is a control for the bench, not a test of the rules.

**Lines.** Five a card. For the two older cards, Stas's recorded lines on them from runs 16:05 and 01:42, read from the run files, made up to five. For the two new cards the thread drafts five from the card's text (a question, a plan that fits a choice, a plan that fits none, a plan that commits the whole party, a joke) and Stas edits or replaces them. Lines files live with the run copies in `/mnt/project-files/engine/m13/bench/`, not in the repo: the recorded ones are run data.

**When.** One of two moments, and which one depends on code that is not on main yet.

- *Before the pair*, on two rosters saved by scripted walks of the Mill with no model, one for each yard outcome. Both new cards are benched, and a finding costs only its fix. This needs Milestone 13's build to let a scripted walk write the Mill's deeds and save a roster. Not checked.
- *Between run 1 and run 2*, on a copy of run 1's roster. Always possible. Only the card that run 1's yard deed opens is benched, so the trial is three cards, and a finding that changes the build replays run 1 (the pair is one build, decision 0043): about 8.6 USD and none of Stas's time.

Recommended: the first if PR 1 shows it works, else the second.

**Cost.** From the DM's rows in the `usage.jsonl` of runs 16:05 and 01:42 (`api_equivalent_usd`): the first `scene_open` of a session 0.31 and 0.42 USD, 20 and 26 s (a cache write of 60 and 80 thousand tokens); `road` 0.02 to 0.05; `card` 0.02 to 0.04; a warm `card_words` 0.04 to 0.06 and 9 to 24 s. So about 0.5 USD and a minute to a card's first line, and about 0.05 USD for each further line in the same session.

| | USD | Stas |
|---|---|---|
| 4 cards, 20 lines, no line settles a card before its last | about 3 | 4 commands, about 10 minutes beside the machine |
| The same, every line settles its card | about 10 | about 25 minutes |
| Expected: 11 of the 13 recorded card lines were questions and the like, not plans, and such a line leaves the card waiting | 4 to 6 | 10 to 15 minutes |

For scale: an all-AI run was 8.57 USD, and an evening of Stas 5.70 to 6.95 USD and 27 to 120 minutes. The bench adds cost to Milestone 13. It saves nothing unless it finds something.

**How the trial is read at Milestone 13's close** (decision 0080's checkpoint). Yan's close sweep reports three numbers:

1. findings the bench gave before run 2 that changed a card, a prompt or code;
2. holes run 2 found on a benched card that the bench had not shown;
3. USD and Stas's minutes spent on the bench.

Stas keeps or drops it. A reading to start from: keep it if number 1 is at least one; drop it if number 1 is zero. If kept, the standing rule would be a line like "a new or changed card with a Blades' choice is benched with five lines before an exit run", and that is a later decision with its own record.

## 6. Build

Two table PRs, beside Milestone 13: outside its exit, its rows and its PR count. Rows and sizes are Yan's, after Stas accepts this design.

1. **The bench command.** The temporary pack (§3), the caravan-moving scripted seat (today a helper inside `game/test/campaign-loop.test.ts`, moved to `game/src/table/scripted.ts`), `--card`, `--lines`, `--roster`. Tested with no model, in CI: for each campaign pack and every road and arrival card its route reaches, with a scripted DM, the copy loads and that card is the first card on the table.
2. **The report.** `bench.md` (§4), tested with no model on a scripted DM that turns words into an own move.

No contract change, no engine change, no new player-facing text, so Rule 1 does not apply and Vera, Zoya and Lev have nothing of theirs to read. The live half cannot be tested from a cloud thread (decision 0036): its first real run is Stas's.

## 7. Out

- A pass or fail from the bench, a judge on the DM's text, samples and thresholds: after the trial, if it is kept.
- A model that writes the lines (a plan fuzz): not before the hand-written lines have shown the bench finds anything.
- Night cards; words said between cards (run 16:05's failure, which belongs to no card).
- The stake before the roll (open table #395, a milestone after Milestone 13): the report's own-move fields would carry the stake. The way the card reaches the table does not change.
- Any change to the exit pair (decisions 0043, 0065, 0066, 0074).

## 8. Risks

- **The copy may not load.** Taking cards out can fail the deck's own checks, for one a deed that is read with no card left to write it. PR 1's test runs the copy for every card a route reaches; where a check objects, the copy keeps the card it needs in a zone the cut route does not cross.
- **A cut route may not start cleanly.** A contract opened at its second place has a scene written for an arrival, not for a start. The DM may narrate oddly before the card. It costs one wake and is visible in the report.
- **The bench DM is colder than the evening's DM.** No scenes behind it and no table talk. A line can land on the bench and fail in the evening, or the other way. Number 2 of §5 measures exactly this.
- **The price is a guess until the first run.** Whether the prompt cache carries from one process to the next is not measured; the table in §5 assumes it does not.
- **It tests guesses.** Both real plans of run 01:42 were ones nobody predicted. Five lines a card will miss the sixth.

## 9. Questions for Stas

1. Accept the design: a temporary pack with a pile of one, lines from a file, a report with no pass or fail? Recommended: yes.
2. The trial's cards: the new Wendford arrival cards (both, or the one run 1's roster opens, §5) plus `bog_wifes_toll` and `salt_on_credit`? Recommended: yes; drop the two older ones if that is too many.
3. Lines for the new cards: the thread drafts five a card and you edit them, or you write them? Recommended: the thread drafts, you edit.
4. A cap for the trial: 6 USD and 20 minutes of yours? Recommended: yes; past the cap the trial stops and is read as it stands.
5. Beside Milestone 13, outside its exit and PR count, two PRs? Recommended: yes.

## Sources

- `docs/design/content-test-layers.md` §2, §4; `docs/decisions/0080-content-test-layers.md` (table #383)
- `crates/nat20-world/src/deck.rs` (`draw`, `Drawn::Table`); `game/src/pack/campaign.ts` (`worldDir`); `game/test/campaign-loop.test.ts` (ENG-35, `blade`, `movingDm`); `game/src/play/driver.ts` (`--roster`, `--rosters`, `--seat`); `game/src/agents/dm.ts` (`card_words`, `own_move_or_answer`)
- `docs/design/m13-system-design.md` §1, §8 (the reader card, the exit pair); decisions 0036, 0043, 0079, 0081
- nat20-runs `master` 65c0e7c: `full-2026-11-13T16-05-31-438Z` and `full-2026-11-14T01-42-04-072Z` (`usage.jsonl`), and their `analysis.md` in `/mnt/project-files/engine/m12/runs/`
