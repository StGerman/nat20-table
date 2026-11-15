# 0086. When the Merchant dies, the Blades decide at once and the wagon goes on

- **Status:** Accepted
- **Date:** 2026-11-13 (recorded 2026-11-15)
- **Decided by:** Stas, on the project timeline: 2026-11-12 21:22Z, «довез до точки груз» (the spine: the cargo is carried to the destination), and 2026-11-13 20:00Z, «Ок по всем кроме…», where Lev's four questions on the Merchant's death were not among the exceptions. Lev Neiman drafted this record with the design (table #412); the status follows Stas's two answers above, and the merge is his yes to the wording.

## Context

Milestone "Allies in fights" puts the caravan's NPC owner into every fight at the wagon (ENG-48), so the Merchant can die. Facts checked on main 4d865d9:

- `escort.rs` pays each Blade from the Merchant's purse, and only on arrival (`arrive`). With the Merchant dead nobody pays and the cargo has no owner.
- The route and `arrive` already work with a dead NPC owner. A contract has one way to end: the wagon reaches its destination.
- A place draws one arrival card. Saltmouth's arrival pile holds six cards that pay off what the party did on the road.
- The purse is the DM's (`contract/protocol.md` §4.17). On *Fair in Wend*, with four Blades and on schedule, it holds 32 GP after the advance, against 24 GP still to come on arrival.
- Saltmouth has an official (Brannock, the fair warden). The Highsteads have none.

Stas asked Zoya for options first (2026-11-12), then Lev for the mechanism.

## Options

### A. Carry it in; an official at the destination decides (Zoya's 1, Stas's first view)
- Pro: the cheapest spine, because the route and `arrive` already work. The Blades keep their word to the end.
- Con: if the official decides, the party watches its own pay being ruled on. A forced card at the gate takes the one arrival draw from the six cards that pay off the road. It needs a new ledger holder for the Merchant's estate and an arrival card at each destination, and the Highsteads have no official.

### B. Turn back to Wendford (Zoya's 2)
- Pro: Odda is brought home; Osric takes the body and the wheat and pays the days served.
- Con: needs a second way to end a contract, a turn in the route, and a holder at Osric. It skips Saltmouth's six arrival cards.

### C. Take the pay off the body and sell the cargo to Rufus (Zoya's 3)
- Pro: the sharpest test of `word_kept`.
- Con: needs the cargo to change owner, a buyer and a sale effect. As the only outcome it is not a choice.

### D. The debt stays; the contract ends at the death (Zoya's 4)
- Pro: almost nothing new to build.
- Con: the party decides nothing, and a dead Merchant's debt has no reader. Fenn's has no later contract to be read in.

### E. One card at once, two choices: bring it in, or take the purse (Lev's recommendation, on Zoya's "the party decides, not the official")
- Pro: the Blades decide, on the road, before the DM has a day to invent what happened to the purse. No new holder, no new way to end a contract, no arrival draw taken: the official speaks the pay and decides nothing. Coin moves only from the purse to a Blade, so the trial balance holds. Each choice writes a deed that a later card reads.
- Con: nobody can bury the Merchant or turn back. Taking the purse pays more coin than keeping the word, so the cost has to arrive through the valley's word and the cards that read it; if those readers are missing, taking is the free option. The cargo is dropped with the contract, as today. Two death cards and their readers have to be written.

## Decision

E. Option A is kept as its spine and as the first choice, and option C as the second choice without the sale. B was cut for the second contract ending it needs, D because nothing reads the debt. E beat A because a forced gate card erases the arrival pay-offs of everything the party did before the death, and because the party, not an official, should answer what its word is worth when nobody is counting.

## Consequences

- Rules M1 to M5 of `docs/design/allies-in-fights-system-design.md` §5: the death card goes on the table before any travel, rest or pay; a caravan card is then decided as a Blade card; `escort_settled` fires once, at the destination; no line says a dead Merchant pays; each choice deed has a reader.
- A ledger account outlives its owner (the rules were silent; accepted with this decision).
- ENG-49 is two PRs, engine and deck. `campaign.json` gains `world.escort.death_card`. No wire type changes.
- The gate is a changed arrival line, not a second card. At the Highsteads Gwyn speaks the pay; no new person.
- Out: the Merchants' heirs, a burial, a sale of the cargo, a wagon turned back.

## Revisit when

- A `trace` of the first five runs in which a Merchant dies shows the same choice taken every time: one of the two is then a corridor.
- ENG-48's seeded table shows the Merchant dying in more than one fight in ten (design §16 item 1): the death card would be the normal end of a contract.
- A second way to end a contract is built for another reason: option B becomes cheap.
- The Merchants' heirs enter the story.

## Sources

`docs/design/allies-in-fights-system-design.md` §5, §10, §16; `docs/scope/allies-in-fights-scope.md` (ENG-49). Project files, `engine/allies-in-fights/`: `zoya-merchant-death-options.md` (the four options, 2026-11-12), `lev-merchant-death.md` (the recommendation and the four questions, 2026-11-12), `zoya-design-board.md` (findings 1 to 3 and 6 to 9 on the death card, 2026-11-15). Code: the world crate's `escort.rs`.
