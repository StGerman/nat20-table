# The post on the flats (working title «Камень A»): scope

Status: Proposed, for Stas's review. Drafted 2026-11-15 on main 4d865d9 in the «Камень A» design thread; cost (§7) by Yan Metsuyan (0065). No number: it has no milestone folder under `tasks/` (roadmap amendment 1). No task rows until this scope and the design (`docs/design/kamen-a-system-design.md`) are both accepted. «Камень» is a working title and never reaches a screen.
Ask: Stas 2026-11-15 22:04Z, to draft this milestone's design beside Milestone 13's build. Order (Stas, 2026-11-14 12:50Z and 2026-11-15 22:06Z): Milestone 13, then Allies in fights, then this; before Arachas. The stake before the roll (decision 0083, `docs/design/stake-before-the-roll.md`) went to the backlog on 2026-11-15 22:06Z, so nothing here may need it.
Inputs: the feedback thread of 2026-11-14 (Lev and Zoya on the idea, Stas's answers of 11:58Z, 12:03Z and 14:08Z, listed in §2); `lore/the_wend_valley.md` after table #387 and #405; `worlds/wend/map.json` (`salt_flats`, `pack_slot: wendmouth_spare`).

## 1. Goal

The Hired Blades take a family that is running from a debt to the Free Host. The post they are led to, with its friendly scribe, its ale and its book, is the lord's. Everything said there is written down: by the family, and by the human's character too. The next contract opens with a letter the family sent home, "we are safe, come", and a second family that came because of it.

The retelling: "I told the friendly officer who sent us. Wrong officer."

The question to the player: what do you do when the safe place is the trap, and you cannot prove it?

Vera test: she met the post once as a text sample (2026-11-14) and read it as a trap by herself; what stopped her was a place line that did not say which bank she stood on. The design's player lines go to her again (§6).

## 2. Decided before this draft (Stas, 2026-11-14)

1. Two parts. A, this scope: people and names; the human stays a Hired Blade. B, the trading half (prices, the confiscation loop, credit), waits for the player as a merchant.
2. On the second trip the party, now knowing, may be hired to stand at the post: one night at a day's wage, no pay per name (Zoya's variant).
3. The post collects names from the human's character too.
4. **A lie lives only in a character's quoted speech.** No player view carries a false fact. The narrator may quote "you are across", never say it. Vera's condition: the line that says where the party is must be exact (which bank, how far to the border).
5. **The world counts only what exists:** coin, goods, land, debts and wages, days, a creature's own state. How anyone regards the party is never a number: it is deeds that named people saw or were told of, shown by what they do. The test for a new number: can it be handed over, owed or lost?
6. A named person's suicide is never shown. The party learns of it by a carter's rumour and a burial outside the fence without a priest.
7. People: our own invented names; a likeness to history is coincidence.
8. Tells: at least two are on the screen with no roll; a rolled tell returns a detail, never the verdict "it is fake". A real road, dearer and longer, is open, or there is no choice.
9. Dark only as traces (a boarded house, a letter that stopped, a farm under a new seal). No arrest, cell or execution on screen.

Items 4 and 5 had no record; this PR adds one for each (0087, 0088, Proposed). The bible line beside each is its own later PR.

## 3. In

1. **The first contract:** an escort whose cargo is people. The family rides as engine creatures, which Allies in fights brings (Tam and the Merchant are its first).
2. **The post**, at the empty customs house across the old ferry landing (`salt_flats`): the tells of §2 item 8, the scribe's questions, the book.
3. **The names.** What the family says, and what the human's character answers when asked (the truth, another name, nothing), is written as deeds on outcomes the engine records (Milestone 13's carriers), never on the DM's word.
4. **The real road** past the post, open from the start, dearer and longer.
5. **A reader in the same contract:** something later in the run reads what was said at the post.
6. **The second contract:** it opens on the letter; the offer of §2 item 2; AI players object and never block.
7. **Traces** on the second contract, by §2 items 6 and 9.
8. **The exact place line** (§2 item 4) wherever the party's position is shown.

## 4. Out

| Item | Where it goes |
|---|---|
| Heat, trust counters, hidden inverted trust, a bluff minigame, an illusion border | cut for good (thread of 2026-11-14) |
| «Камень B»: prices, the fence who sells seized goods, credit, a `seize` effect | after the player as a merchant |
| Any outcome from the player's own words (the stake, 0083) | backlog (Stas, 2026-11-15) |
| Errands, fronts and clocks, a scene that reads a deed, the attitude step | Arachas plus glue, unless the design shows this exit cannot stand without one; then it is a question to Stas, not an addition |
| The fugitive met again past the real border; the country over the sea | off the map |
| The three-card pressure on the family that will not leave (Lev and Zoya, 2026-11-14) | question 2 |
| Coast places into `map.json` beyond what this route walks | the world PR of the map thread |

## 5. The five phrases

Rule of 2026-11-14: before any code, run the scope against five things Stas would really type; under three answered, do not build. Written from his phrases in the runs of 2026-11-13 and 2026-11-14, moved to the post. Without the stake, the DM has: talk; a check the scene file wrote; a ladder check that reveals; a fight he may start (0078); a card's written choices.

| Stas's words | Answered? | By what |
|---|---|---|
| «Спросить писаря, чьё это знамя» | yes | talk, and a written check that returns a detail |
| «Назваться чужим именем» | yes | a written choice or check; the outcome is a deed |
| «Развернуть семью и увести на другую дорогу» | yes | a written choice; the real road is In 4 |
| «Зарубить писаря» / «отрезать ему пальцы» | half | a fight, and `killed_<npc>`; a mutilation has no outcome without the stake |
| «Забрать книгу и сжечь» | no, unless the author wrote it | no deed comes from the DM's word (Rule 4); as a written check it works, as an unforeseen act it does not |

Three of five, and all three only because the author wrote them in. The design redoes the table against its own cards (its §7): three and two halves, the book counted as a half until something the table hears reads `book_taken`. This is the ceiling Milestone 12 failed on (0082): an act nobody foresaw gets talk and no outcome. Two things soften it here and neither removes it. The post is one place whose obvious acts can be listed and written (ask, lie, refuse, turn back, fight, take the book), and the second contract's choice is a vote by nature. Recommendation: build it, write the book and the bribe in as checks, and say in the exit that an unforeseen act at the post is counted and not gated. Not recommended: holding the milestone until the stake returns.

## 6. Exit criterion

Each row names the lowest layer that tests it (0080). The design's §12 holds the rows in full and splits row 3, because the card bench does not reach a night card yet.

| # | Row | Layer |
|---|---|---|
| 1 | Every deed the post can write is written on its outcome and read by the reader of In 5 and by the second contract's opening; the other family comes only when the letter was sent | test with no model (seeded, CI) |
| 2 | No player view, card text or table line states the false fact; the place line names the bank and the distance | test with no model (visibility scan case; a table test) |
| 3 | A live DM at the post quotes the lie and never asserts it, over the five phrases of §5 and five more | card bench (`npm run play:card`, 0084) or `play:scene`, smaller than a run |
| 4 | Vera, on the post's lines and the second contract's opening | a person (the `vera` agent), before the content PR merges |
| 5 | One pair on one build (0043): both contracts all AI, then both with Stas, his half only after the AI half passed (0065). Audit, leak scan, judge. Acts at the post with no outcome are counted, not gated | full run |

## 7. Cost

Yan, 2026-11-15, on main 34cbac1 (table #409 and #410 merged; M13's API-57 and ENG-44 are table #411 and #413, open; the Allies design and tender are table #412, open). PRs from design §12. Build priced by size as the Allies tender in table #412 prices it (XS 5, S 11, M 21, L 40 USD; review XS 5 to 10, S 15 to 20, M 25 to 30, L 35 to 45 min). Runs priced on M12's logged all-AI runs (5.70 to 8.57 USD) and M11's two human halves (5.17 and 5.87 USD, 26.5 and 39.1 min). No run of a three-day contract exists, so every run number here is an estimate.

| Field | Plan (§15 A7 as recommended: both contracts) | M11 baseline |
| --- | --- | --- |
| Size | design §12's 8 PRs: 1 S (scope, design, 0087, 0088; mostly spent), 2 S rows, 3 XS bible lines, 4 M `settle` (Rule 1), 5 S world, 6 L first contract, 7 M second contract, 8 S exit; plus the status PR, XS | 19 rows |
| PRs for Stas | 9 (the 8 and the status PR); 10 with one fix PR after a failed run | 27 |
| Build USD | 137: 10, 11, 5, 21, 11, 42 (Zoya's and Vera's reads in), 21, 11, 5 | not counted |
| Stas's review | about 3.6 h, two of his review evenings at 2.5 h: 40 min PR 1, 15 PR 2, 10 PR 3, 30 PR 4, 20 PR 5, 45 PR 6 (the Russian lines), 30 PR 7, 15 PR 8, 10 status (estimates) | not measured |
| Card bench, exit row 3 | `names_for_the_book`: 1.4 to 9.5 USD, about 4.75 expected; about 10 min of Stas's. The dawn card: not reachable by the bench as built (below) | n/a |
| Exit runs | 26 USD if the pair passes first time: the all-AI half, 2 contracts at about 7 (5.70 to 8.57), 14; Stas's half, 2 at about 6 (5.17 to 5.87), 12 | 5 runs, 35.45 USD |
| Stas at the table | 55 to 80 min (25 to 40 a contract), only after the AI half passed; plus about 40 min at the Mac to start the AI half and rule its flags (20 a run, as table #412) | 65.6 min |
| Days scope→exit | 7 to 13: no PR merges before M13 and Allies pass their exits (design §12); Allies' exit is 11-20 to 11-24 by table #412; this milestone's own work is 3 days best, 5 likely after it | 2.12 |

Totals: best 168 USD (137 build, 4.75 bench, 26 runs) and 5.3 h of Stas's (3.6 review, 0.2 bench, 0.7 Mac, 0.9 table); likely 186 USD and 6.4 h, with one failed all-AI half (below).

Target (0065, half the baseline): 13.5 PRs, 17.73 USD of runs, 33 min at the table, 1.06 days. Planned: 9 PRs (0.33); 26 USD of runs (0.73), over by 8.27; 55 to 80 min at the table (0.84 to 1.22), over; 7 to 13 days, over by 6 to 12, set by the order (M13, Allies, then this), not by this milestone's work.

**§15 A7, Stas's half, priced apart.** The all-AI half (14 USD, both contracts) is the same in each.

| Stas plays | Runs USD | At the table | What his half proves |
| --- | --- | --- | --- |
| A. Both contracts (the design's recommendation) | 12 | 55 to 80 min | his own answer at the book comes back on the next contract |
| B. The first contract only | 6 | 25 to 40 min | his answer read back in the same contract (the dawn card); the reads across contracts only by the AI half and the seeded tests (exit row 1) |
| C. The second only, on the AI half's roster | 6 | 25 to 40 min | somebody else's answer comes back to him (design §15 A7 argues against it) |

B against A saves 6 USD and 25 to 40 min of the table: the pair is 20 USD (0.56 of the baseline, over the target by 2.27) and 25 to 40 min (0.38 to 0.61). The award is Stas's.

**§15 A2, the pressure chain, priced apart.**

- In this milestone: one more content PR, M to L (21 to 42 USD, 25 to 35 min of review), on the chain after PR 6, about half a day more; no extra run; three more cards for the AI half to fail on.
- Later, as its own content PRs after this exit: 2 PRs (the content, its rows and status), 26 to 53 USD build, 35 to 50 min of review. Its live proof: if the three cards are chained, the bench does not reach them (`docs/design/card-bench.md` §3), so one all-AI contract run, about 7 USD and 20 min at the Mac, 0 at the table; or 0 run USD if it rides on the next milestone's exit run.

**A failed all-AI half.** Contract 1 fails: 7 USD lost and contract 2 not played. Contract 2 fails: both rerun on the fix's build (0043), 14 USD lost. Either way one S fix PR (11 USD, 15 to 20 min of review), 20 to 40 min at the Mac for the rerun, a day, and 0 min at the table. Landed: 18 to 25 USD, 35 to 60 min of Stas's, 1 day. A failed Stas half costs the whole pair again on the fix's build: 37 USD with the fix, 55 to 80 min at the table, two evenings. On the record (M12 0 PASS in 8 runs; M11 1 pair passed in 3) the likely line carries one failed AI half.

**Card bench, exit row 3.** `names_for_the_book` is an arrival card one leg past Wendmouth and reads no deed, so the bench reaches it as built: about 0.9 USD to its first line (0.89 and 0.98 measured on 2026-11-15, table #412) and 0.05 a further line. Ten lines, the five phrases and five more, questions first: 1.4 USD if no line settles the card, 9.5 if every line does, about 4.75 expected (five bench runs: the plans and the false name each settle it). The dawn card is not reachable: it is a night card, out of the bench's first version (`docs/design/card-bench.md` §3 and §7), and its four variants read deeds written earlier in the same contract, which no saved roster carries. Two ways, neither in the totals: a bench row for night cards and a start in the middle of a contract (S, 11 USD, 15 to 20 min of review, before PR 6, then about 4.75 USD of bench runs), or the dawn card's first live reading is the all-AI half, where a finding costs a failed half (18 to 25 USD, a day). Design §12 names exit row 3 as the cheapest test of its likeliest risk, so this is a gap for the design to close, and the choice is Stas's.

Amendment (proposed; rules silent, followed here): a scope's cost prices the Claude Code build per PR by size, as table #412 does; the baseline counts in-game runs only. Why: 137 USD of builds against 26 USD of runs needs its own line.

Added by the thread after Yan priced it. His PR numbers above are the first draft's: his PR 6, 7 and 8 (first contract, second contract, exit) are PR 7, 8 and 9 in the design's §12 now, and the design's PR 6 is new: the design's one revision takes his bench row as its own PR (the bench reaches a night card; his S, 11 USD, 15 to 20 min of review), so the plan is 10 PRs and 179 USD at best. He has not re-priced it, and the design says his S may be more than that PR needs.

## 8. Questions for Stas

1. **Without the stake, three of five (§5).** Answered by Stas, 2026-11-15 22:15Z («Да давай так»): build it now without the stake, with the obvious acts at the post written in as checks, so that the stake can later lie on top with no rework: the deeds those checks write stay the same.
2. Every other question is in the design's §15, each with a recommendation: A, eight on the mechanism, scope and exit (the three-card pressure on the family is A2, the exit pair is A7); B, eleven of Zoya's on the story.
