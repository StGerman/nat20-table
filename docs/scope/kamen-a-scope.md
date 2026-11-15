# The post on the flats (working title «Камень A»): scope

Status: Proposed, for Stas's review. Drafted 2026-11-15 on main 4d865d9 in the «Камень A» design thread; cost (§7) by Yan Metsuyan (0065). No number: TASKS.md § Milestones has no row for it (roadmap amendment 1). No task rows until this scope and the design (`docs/design/kamen-a-system-design.md`) are both accepted. «Камень» is a working title and never reaches a screen.
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

Rules 4 and 5 have no record yet. The design PR drafts one decision record for each; the bible line beside each is its own later PR.

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

Three of five, and all three only because the author wrote them in. This is the ceiling Milestone 12 failed on (0082): an act nobody foresaw gets talk and no outcome. Two things soften it here and neither removes it. The post is one place whose obvious acts can be listed and written (ask, lie, refuse, turn back, fight, take the book), and the second contract's choice is a vote by nature. Recommendation: build it, write the book and the bribe in as checks, and say in the exit that an unforeseen act at the post is counted and not gated. Not recommended: holding the milestone until the stake returns.

## 6. Exit criterion

Each row names the lowest layer that tests it (0080).

| # | Row | Layer |
|---|---|---|
| 1 | Every deed the post can write is written on its outcome and read by the reader of In 5 and by the second contract's opening; the other family comes only when the letter was sent | test with no model (seeded, CI) |
| 2 | No player view, card text or table line states the false fact; the place line names the bank and the distance | test with no model (visibility scan case; a table test) |
| 3 | A live DM at the post quotes the lie and never asserts it, over the five phrases of §5 and five more | card bench (`npm run play:card`, 0084) or `play:scene`, smaller than a run |
| 4 | Vera, on the post's lines and the second contract's opening | a person (the `vera` agent), before the content PR merges |
| 5 | One pair on one build (0043): both contracts all AI, then both with Stas, his half only after the AI half passed (0065). Audit, leak scan, judge. Acts at the post with no outcome are counted, not gated | full run |

## 7. Cost

Yan's, after the design's PR list. See `docs/design/kamen-a-system-design.md` §PRs.

## 8. Questions for Stas

1. **Without the stake, three of five (§5).** Answered by Stas, 2026-11-15 22:15Z («Да давай так»): build it now without the stake, with the obvious acts at the post written in as checks, so that the stake can later lie on top with no rework: the deeds those checks write stay the same.
2. **The family that will not leave:** the three-card pressure chain in this milestone, or later? Recommended by the design, see its questions.
3. **Exit row 5:** a pair of two contracts each is four runs. The design and Yan say what it costs and whether one contract in Stas's half is enough.
