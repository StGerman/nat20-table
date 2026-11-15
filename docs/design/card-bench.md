# The card bench: one card, a live DM, a list of lines

- **Status:** Accepted by Stas, 2026-11-14 21:06Z, with all five recommendations of §9 («Да, ок по всем» on the thread's decision card, after he merged table #397). Nothing is built yet
- **Date:** 2026-11-14
- **Decision:** `docs/decisions/0084-card-bench-by-a-pile-of-one.md` (Accepted)
- **Asked by:** Stas, 2026-11-14 19:42Z: «Проектировать стенд карточки давай потестируем на M13 и если пойдет сделаем это правило постоянным»
- **Builds on:** `docs/design/content-test-layers.md` §4 and decision 0080 (table #383), which name the bench as a candidate and list six open points. This doc answers them

## 1. Summary

One command, `npm run play:card`, puts one named card on the table of a real contract, hands it to the live DM, types a list of lines at the human's seat and writes down what the DM and the engine did with each. It is the smallest live run that reaches a card: about 0.85 to 1.2 USD and one to two minutes to a card's first line, then about 0.05 USD and 10 to 25 seconds for each further line while the card still waits.

It answers one question before an evening does: **can this card hold what a person says?** It answers it only for lines somebody thought of beforehand. It does not replace either half of an exit pair and changes no exit rule.

What it would have seen in the Milestone 12 record: run 01:42's two plans, on `bog_wifes_toll` and `salt_on_credit`, had those lines been on a list before the evening. Nobody had them. What it would not have seen: run 16:05's failure, a plan said between cards. So the honest claim is narrow: the bench moves the first live reading of a card's words from Stas's evening to a five-minute run, for the lines we can guess.

## 2. The six open points, answered

| Open point (`content-test-layers.md` §4) | Answer |
|---|---|
| How a named card reaches the table | A temporary copy of the pack whose decks hold that card alone. A pile of one goes on the table with no draw-three and no pick (§3). No contract change |
| One move a card | A line that leaves the card waiting is followed by the next line in the same bench run. A line that settles the card ends the run, and the next line starts a fresh one (§4) |
| No evening behind the card | True, and not fixed. A line that leans on an earlier scene is left out of the list, and the report says so. A card that reads deeds is played on a copy of a saved roster, so the deed book is real (§3) |
| A narrated outcome is text | The bench reports and does not judge. A person reads the DM's text beside the tool calls and the engine's events (§4) |
| What a pass is | None in this version. The trial counts findings (§5); a threshold needs rates nobody has measured |
| Who runs it | Stas, on his Mac, one command a card (decision 0036). The run folder goes up with `runs:upload`; the analysis thread reads it |

## 3. How the card reaches the table

Checked on main at 6d0766f.

- `crates/nat20-world/src/deck.rs`, `draw`: "A pile of one puts its card on the table". The pile is the cards of one zone and one `when` that are in play.
- `game/src/pack/campaign.ts`, `worldDir`: a pack that carries its own `worlds/<map>/map.json` plays that world, not the shared one.
- `game/test/campaign-loop.test.ts`, the ENG-35 test, already does both by hand: it copies `scenarios/fair_in_wend` and `worlds/wend` into a temporary folder and writes one arrival card into the copy's deck.

The bench does the same for a card that is not chained:

1. Copy the pack and its world into a temporary folder.
2. Take every other card out of the copy's decks, the world's and the pack's, except a card the benched card's own choices add.
3. Cut the copy's `world.start` and `world.route` to the shortest stretch that reaches the card: start at the last place on the pack's route that has a scene, before the road (a road card) or the place (an arrival card) of the card's zone. On today's two campaign packs that is one or two legs for every zone on a route.
4. Play it with the real loop: the live DM, scripted AI seats, and a scripted human seat that moves the caravan on until the card is on the table, then types the lines.

Cards that read deeds (`if`): the bench takes `--roster NAME` and plays on a copy of that roster in a temporary `--rosters` folder, so the saved party is never written over. Every bench run starts from a fresh copy of the pack and of the roster: a run saves its roster when it ends, and a card decided in one run (`once`) would be gone from the next. Milestone 13's two Wendford arrival cards read Mill deeds; their roster is one saved by a run of *The Silent Mill* (§5).

Out of this version: night cards, and chained cards (`chained: true`, eight on main), which are in play only after another card's choice adds them, so reaching one means deciding that card first. Nothing in the Milestone 13 trial needs either.

## 4. A bench run, and what is written down

The lines are a text file, one line of the player's words per row, given with `--lines FILE`. With `--seat ink` a person types instead.

For each line the human's seat types it at the card's prompt and the bench waits for the table to settle:

- the DM answers and the card still waits: the next line goes in;
- the words become an own move, the scripted AI seats vote for it, the engine rolls, and the card is decided or the move falls (decision 0081): the next line goes in if the card still waits;
- the card is decided: the bench run ends. Lines left over start a fresh run each time.

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

A line the lines file marks as left out, because it leans on an earlier scene (§2), is named in the report and not typed.

The report is the DM's side of the table, like a run's analysis. It is never shown to a player (Rule 3).

**Reading it.** The analysis thread gives each line one of four readings: *landed* (an own move on a choice that fits the words), *answered* (a question got an answer and nothing changed), *nowhere to land* (a plan with no choice to carry it, or a refusal), *ruled without a roll* (an outcome narrated or remembered with no roll, as on `salt_on_credit` in run 01:42). The last two are findings. The verdict on a finding is Stas's.

## 5. The Milestone 13 trial

**Cards.** Three or four:

- the two new Wendford arrival cards of MAP-20, which the row `m13-carried` rests on: the first time a live DM and a person's words meet one of them is otherwise Stas's run 2. Each reads `wenna_saved` and its own yard deed (`snitt_yielded` or `yard_to_the_end`), and one Mill run writes only one of the two yard deeds, so each card needs its own roster;
- `bog_wifes_toll` and `salt_on_credit`, with the plans Stas said on them in run 01:42. No live run is known to have tried those plans since decision 0079 changed what an own move may be: the one run with Stas on such a build (17:19 on 2026-11-14, not an exit run, decision 0082) is known here from its live notes, which record his words at the Millbeck bridge only; its run folder is not in nat20-runs at 65c0e7c. Their rules change again under decision 0083, when its stake design is built in a later milestone, so this is a control for the bench, not a test of the rules.

**Lines.** Five a card. For the two older cards, Stas's recorded lines on them from runs 16:05 and 01:42, read from the run files, made up to five. For the two new cards the thread drafts five from the card's text (a question, a plan that fits a choice, a plan that fits none, a plan that commits the whole party, a joke) and Stas edits or replaces them. Lines files live with the run copies in `/mnt/project-files/engine/m13/bench/`, not in the repo: the recorded ones are run data.

**When.** One of two moments, and which one depends on code that is not on main yet.

- *Before the pair*, on two rosters saved by scripted walks of the Mill with no model, one for each yard outcome. Both new cards are benched, and a finding costs only its fix. This needs Milestone 13's build to let a scripted walk write the Mill's deeds and save a roster. Not checked.
- *Between run 1 and run 2*, on a copy of run 1's roster. Always possible. Only the card that run 1's yard deed opens is benched, so the trial is three cards, and a finding that changes the build replays run 1 (the pair is one build, decision 0043): 11.5 to 15.5 USD on the record's five complete `play:unattended` Mill runs with an Opus DM and Sonnet players (2026-10-30 to 2026-11-03, older builds), and none of Stas's time.

Recommended: the first if PR 1 shows it works, else the second.

**Cost.** From the DM's rows in the `usage.jsonl` of runs 16:05, 21:16 and 01:42 (`api_equivalent_usd`).

- A new DM session pays one cache write of 53 to 80 thousand tokens, 0.27 to 0.42 USD. It lands on the session's first wake, or on the second when the first times out: that happened in 5 of the 9 new sessions of runs 16:05 and 01:42 and adds 0.02 to 0.12 USD and a lost wake of 12 to 30 s. The estimates below leave the timeouts out.
- The loop opens a new DM session each time a scene loads (`game/src/table/loop.ts`, `closeScene`, `dm.newScene`). How many load before a card depends on the way to it. In run 21:16 the first leg of *Fair in Wend* loaded one, Wendford's, and the leg's road card was played in that session. In run 01:42 the leg from Wendford to the Highsteads loaded two: `twb_road`, where `bog_wifes_toll` came, then `twb_highsteads`, where `salt_on_credit` and the arrival card `gwyn_cheese` came. All four trial cards are one leg from a place with a scene (§3), so each is in the second or the third session of its bench run.
- Warm wakes: `scene_open` 0.04 to 0.05, `summary` 0.02, `road` 0.02 to 0.05, `card` 0.02 to 0.04, `card_words` 0.04 to 0.06 USD and 9 to 24 s.
- Run 01:42 had paid 0.79 USD when its first road card reached the seats, in its second DM session (0.425 + 0.039 + 0.019 + 0.308), in 55 s of DM wakes.

So a card's first line costs about 0.85 USD when it comes in the second DM session and about 1.2 USD in the third, in one to two minutes, and each further line in the same bench run about 0.05 USD.

The lines go in with the questions first and the plans last, so that a plan that settles the card ends a bench run late.

| 4 cards, 20 lines | USD | Machine time |
|---|---|---|
| One bench run a card: no line settles a card before its last | about 4 to 5.5 | 10 to 12 minutes |
| Two bench runs a card: three questions, then two plans, and the first plan settles. Expected | about 7.5 to 10 | 15 to 20 minutes |
| Twenty bench runs: every line settles its card | about 17 to 24 | 30 to 40 minutes |

Stas starts one command a card and need not watch it. For scale: an all-AI run of *Fair in Wend* was 8.57 USD, and an evening of Stas 5.70 to 6.95 USD and 27 to 120 minutes. So the trial is expected to cost about one more all-AI run of *Fair in Wend*; the two new cards alone, about 3.7 to 5 USD. It saves nothing unless it finds something.

**How the trial is read at Milestone 13's close** (decision 0080's checkpoint). Yan's close sweep reports three numbers:

1. findings the bench gave before run 2 that changed a card, a prompt or code;
2. holes run 2 found on a benched card that the bench had not shown;
3. USD and Stas's minutes spent on the bench.

Stas keeps or drops it. A reading to start from: keep it if number 1 is at least one; drop it if number 1 is zero. If kept, the standing rule would be a line like "a new or changed card with a Blades' choice is benched with five lines before an exit run", and that is a later decision with its own record.

## 6. Build

Two table PRs, beside Milestone 13: outside its exit, its rows and its PR count. Rows, written by Yan after Stas accepted this design: AGT-123 (the command), AGT-124 (the report) and AGT-125 (the trial of §5).

1. **The bench command.** The temporary pack (§3), the caravan-moving scripted seat (today a helper inside `game/test/campaign-loop.test.ts`, moved to `game/src/table/scripted.ts`), `--card`, `--lines`, `--roster`. The run driver refuses scripted players on a campaign without `--seat ink` ("scripted players never move the caravan"); `play:card` passes that guard because its scripted seat does move it, and the guard stays for every other command. Tested with no model, in CI: for each campaign pack and every road and arrival card its route reaches that is not chained and reads no deed, with a scripted DM, the copy loads and that card is the first card on the table. A card that reads deeds needs a roster, so the test also plays one such card on a roster that a scripted contract saves in the same test.
2. **The report.** `bench.md` (§4), tested with no model on a scripted DM that turns words into an own move.

No contract change, no engine change, no new player-facing text, so Rule 1 does not apply and Vera, Zoya and Lev have nothing of theirs to read. The live half cannot be tested from a cloud thread (decision 0036): its first real run is Stas's.

## 7. Out

- A pass or fail from the bench, a judge on the DM's text, samples and thresholds: after the trial, if it is kept.
- A model that writes the lines (a plan fuzz): not before the hand-written lines have shown the bench finds anything.
- Night cards; words said between cards (run 16:05's failure, which belongs to no card).
- The stake before the roll (`docs/design/stake-before-the-roll.md`, Proposed, a milestone after Milestone 13): the report's own-move fields would carry the stake. The way the card reaches the table does not change.
- Any change to the exit pair (decisions 0043, 0065, 0066, 0074).

## 8. Risks

- **The copy may not load.** Taking cards out can fail the deck's own checks, for one a deed that is read with no card left to write it. PR 1's test runs the copy for every card it covers; where a check objects, the copy keeps the card it needs in a zone the cut route does not cross.
- **A cut route may not start cleanly.** A contract opened at its second place has a scene written for an arrival, not for a start. The DM may narrate oddly before the card. It costs one wake and is visible in the report.
- **The bench DM is colder than the evening's DM.** No scenes behind it and no table talk. A line can land on the bench and fail in the evening, or the other way. Number 2 of §5 measures exactly this.
- **The price is an estimate until the first run.** Whether the prompt cache carries from one process to the next is not measured; the table in §5 assumes it does not. At two or three cache writes before every card the DM's wake alone (decision 0084, option D) would cost about a third of the trial's price, and tells less.
- **It tests guesses.** Both real plans of run 01:42 were ones nobody predicted. Five lines a card will miss the sixth.

## 9. Questions for Stas

**All five answered 2026-11-14 21:06Z: «Да, ок по всем», each as recommended.**

1. Accept the design: a temporary pack with a pile of one, lines from a file, a report with no pass or fail? Recommended: yes.
2. The trial's cards: the new Wendford arrival cards (both, or the one run 1's roster opens, §5) plus `bog_wifes_toll` and `salt_on_credit`, about 7.5 to 10 USD? Or the new cards alone, about 3.7 to 5 USD? Recommended: all four. Two new cards with five guessed lines each may find nothing, and a trial that finds nothing says little about the bench.
3. Lines for the new cards: the thread drafts five a card and you edit them, or you write them? Recommended: the thread drafts, you edit.
4. A cap for the trial: 12 USD and 20 minutes of yours? Recommended: yes; past the cap the trial stops and is read as it stands.
5. Beside Milestone 13, outside its exit and PR count, two PRs? Recommended: yes.

## Sources

- `docs/design/content-test-layers.md` §2, §4; `docs/decisions/0080-content-test-layers.md` (table #383)
- `crates/nat20-world/src/deck.rs` (`draw`, `Drawn::Table`); `game/src/pack/campaign.ts` (`worldDir`); `game/test/campaign-loop.test.ts` (ENG-35, `blade`, `movingDm`); `game/src/play/driver.ts` (`--roster`, `--rosters`, `--seat`); `game/src/agents/dm.ts` (`card_words`, `own_move_or_answer`); `game/src/table/loop.ts` (`closeScene`, `dm.newScene` at a scene change)
- `docs/design/m13-system-design.md` §1, §8 (the reader card, the exit pair); decisions 0036, 0043, 0079, 0081, 0083
- nat20-runs `master` 65c0e7c: `full-2026-11-13T16-05-31-438Z`, `full-2026-11-13T21-16-03-269Z` and `full-2026-11-14T01-42-04-072Z` (`usage.jsonl`), and their `analysis.md` in `/mnt/project-files/engine/m12/runs/`; `live-notes.md` of `full-2026-11-14T17-19-50-900Z` there
