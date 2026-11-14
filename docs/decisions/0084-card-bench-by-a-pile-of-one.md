# 0084. The card bench reaches its card by a pile of one in a copied pack

- **Status:** Proposed
- **Date:** 2026-11-14
- **Decided by:** Stas, when he accepts `docs/design/card-bench.md`. He asked for the design on 2026-11-14 19:42Z («Проектировать стенд карточки давай потестируем на M13 и если пойдет сделаем это правило постоянным»); the options and the recommendation below are the thread's

## Context

Decision 0080 has the card bench designed first, with its cost, and tried on Milestone 13. A bench has to bring a live DM to one chosen card, and nothing does that today: `play:scene` reaches a scene, and a card belongs to a leg of a contract. `docs/design/content-test-layers.md` §4 left open how the card reaches the table.

Facts, on main at 6d0766f:
- The contract has no command that opens a named card.
- A draw is by zone and `when`; "a pile of one puts its card on the table" with no pick (`crates/nat20-world/src/deck.rs`, `draw`).
- A pack that carries its own `worlds/<map>` plays that world (`game/src/pack/campaign.ts`, `worldDir`). The ENG-35 test already copies a pack and its world to a temporary folder and writes one card into the copy's deck.
- A new DM session pays one cache write of 0.31 to 0.42 USD on its first wake, and the loop opens a new DM session at every scene change; a warm `card_words` wake costs 0.04 to 0.06 USD (runs 16:05 and 01:42). Run 01:42 paid 0.92 USD from its start to its first road card.
- A chained card is in play only after another card's choice adds it.
- Live model calls run only on Stas's Mac (decision 0036).

## Options

### A. A copied pack whose decks hold the one card (proposed)
The bench copies the pack and its world to a temporary folder, takes every other card out of the copy's decks, cuts the route to the stretch that reaches the card, and plays the real loop.
- Pro: no contract change and no engine change. The DM, the engine and the card run the code an evening runs. The technique is already in a test.
- Con: two fresh DM sessions before the card, about 0.9 USD and a minute and a half before the first line, and again after every line that settles the card. It does not reach a chained card. The copy may fail a deck check once cards are taken out. A route cut to start at its second place opens on a scene written for an arrival.

### B. An engine command that opens a named card
- Pro: any card, any place, one call.
- Con: a contract change under Rule 1 (crate, fixture, changelog, generated files) for a command no game ever sends, and a way to put a card on the table that play does not have.

### C. A seeded walk to the card
Find a seed whose draws bring the card, and replay it.
- Pro: nothing is copied or cut.
- Con: the seed breaks whenever a deck upstream of the draw changes, and the walk pays for every card before the one that matters.

### D. The DM's `card_words` wake alone, on a made-up table state
- Pro: the cheapest line: one cache write, then about 0.05 USD a line, and no line ever settles the card.
- Con: no engine behind it, so no vote, no roll and no outcome: it shows what the DM would call and not what the card does. It needs a hand-built state the game never produces, and that state rots with every prompt change.

## Decision

Proposed: **A.** It is the only option where the line, the DM's call, the roll and the card's outcome all come from the code the table plays, and it costs no contract version. B buys convenience with a command play never uses. C is fragile for the same reason the scripted tests avoid seeds. D answers half the question at about a third of the price; if the trial shows the DM's reading is the only thing the bench ever finds, D is the cheaper tool, and that is a reason to revisit.

## Consequences

- `npm run play:card` and its report, in two table PRs beside Milestone 13 (`docs/design/card-bench.md` §6). Rows are Yan's, after Stas accepts the design.
- The bench is tried on three or four cards before Stas's Milestone 13 evening, at an expected 8 USD or so, about one more all-AI run, and four commands of Stas's (design §5). It adds cost to the milestone and changes no exit rule (decisions 0043, 0065, 0066, 0074).
- The bench reports and gives no pass or fail. Findings are read by the analysis thread; the verdict on each is Stas's.
- Whether the bench becomes a standing rule is a later decision with its own record (decision 0080).

## Revisit when

- Milestone 13 closes: the close sweep reports what the bench found, what it missed and what it cost (design §5), and Stas keeps or drops it.
- The copy cannot be made to load for the cards the trial needs: then B.
- Every finding of the trial is about the DM's call and none about the roll or the outcome: then D.

## Sources

- `docs/design/card-bench.md`; `docs/design/content-test-layers.md` §4; `docs/decisions/0080-content-test-layers.md` (table #383)
- `crates/nat20-world/src/deck.rs`; `game/src/pack/campaign.ts`; `game/test/campaign-loop.test.ts` (ENG-35)
- nat20-runs `master` 65c0e7c, `usage.jsonl` of `full-2026-11-13T16-05-31-438Z` and `full-2026-11-14T01-42-04-072Z`
