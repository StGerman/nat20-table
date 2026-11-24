# 0095. An arrival puts the first eligible card on the table, in file order

- **Status:** Proposed
- **Date:** 2026-11-23
- **Decided by:** Stas put "arrival without a draw" into the scope on 2026-11-23 21:10Z (`docs/scope/the-godmother-scope.md` §10 answer 1) and left the rule to the system design. Lev Neiman proposes option A in `docs/design/the-godmother-system-design.md` §5.1. Stas decides; the merge is his yes.
- **Narrows, if accepted:** [0063](0063-m11-the-road-remembers.md) (draw three, the DM picks) and [0089](0089-card-pick-fight-first.md) (the pick order), both to road and night piles only. Neither is superseded.

## Context

A card that reads a deed pays the deed back only if it comes to the table. Today every pile is drawn the same way: one d100 a card, up to three offered, the DM picks (0063), a fight first (0089). A reader that shares a pile can lose the roll or the pick. Facts checked on c617f9c:

- The decks hold 50 cards: 22 road, 11 night, 17 arrival. Of the 17 arrival cards, 14 carry an `if` on the card and 14 are `once: true`. Only `the_fair_price` has no `if`.
- A party arrives at a place once a contract, so a reader that loses waits a whole contract.
- The Highsteads pile holds at most one card (two cards that exclude each other). The Millbeck bridge pile holds one. Wendford holds seven: four that read the bridge, of which one bridge crossing writes at most one; two Mill cards that exclude each other; and `the_fair_price` on *The Way Back*. Saltmouth holds seven with five independent conditions: the only pile where more than two can hold together.
- Of the 17, two can come to a fight (`rufus_due`, `oddas_mark`), both at Saltmouth.
- The `soon` queue (ENG-34) already brings one chained card next, across contracts, when a choice adds it.
- Not checked: how the DM's picks at arrivals went in the Milestone 12 and 13 runs. The M13 scope said this decision waits on that data; the runs are not in this repository.

## Options

### A. File order, at arrivals only (proposed)
At an arrival the engine puts the first card of the place's arrival pile on the table, in file order (the world's deck files by name, then the pack's deck). No roll, no offer, no pick. A `soon` card still comes first. Road and night piles are drawn as today.
- Pro: a `once` reader never loses to chance or to a pick; the next arrival brings the next one. A test with no model and no seed can assert which card comes.
- Pro: one DM wake fewer at every arrival with a pile of two or more.
- Con: at Saltmouth the author's order replaces the DM's judgement, and 0089's "a fight first" holds there only if the fight cards are written first in the file.
- Con: every seeded fixture with an arrival draw is re-recorded: the d100 leaves the dice stream.

### B. Keep the draw; make a reader certain with `soon`
- Pro: no rule changes; the queue exists.
- Con: it serves only chained cards a choice adds. A card gated by `if` alone (the two Mill cards, the four bridge cards) still draws and can lose.

### C. A priority field on a card
- Pro: an author says which card must come, card by card.
- Con: a new deck field and a second ordering beside file order; nothing it does that file order does not.

### D. Every eligible arrival card comes, one after another
- Pro: nothing the party did waits a contract.
- Con: up to five cards in a row at the fair gate; it changes the length of every road contract, which this scope does not ask for.

## Decision

Proposed: A. It is the smallest rule that makes "the reader is met" a fact of the deck file and not of a roll, and it leaves the road and the night, where surprise is the point, as they are.

## Consequences

- `crates/nat20-world` (`draw` for `When::Arrival`), `contract/protocol.md` §4.13, the seeded fixtures with an arrival, and the DM prompt's pick rule, which no longer runs at an arrival.
- A test on the shipped decks: in every arrival pile a card with no `if` comes after every card with one, so a place's standing business never hides a pay-off.
- The Wendford reader of the decision about Nell is written first in `worlds/wend/deck/wendford.json`.
- Zoya orders each arrival pile; the fight cards at Saltmouth go first if 0089's order is to hold there.

## Revisit when

- A trace shows a reader that waited more than one contract behind another: then D, with a cap.
- A run shows the same arrival card opening Saltmouth on every contract: then the order of that file, not the rule.

## Sources

- `docs/design/the-godmother-system-design.md` §5.1; `docs/scope/dramaturg-mechanism-scope.md` §3 (the shelved proposal).
- `crates/nat20-world/src/deck.rs` (`draw`, `pile`, `put_card`); `worlds/wend/deck/`, `scenarios/*/deck/`.
