# 0058. In the first Living world session the human plays a Hired Blade, and one caravan owner leads

- **Status:** Accepted; the "human seat is asked last" sentence is superseded by [0062](0062-human-votes-first.md) once that is accepted
- **Date:** 2026-11-02
- **Decided by:** Stas, on the Milestone 9 system design ("S1 - A / S2 - A / S3 - A / S4 - A Guards/Blades", Milestone 9 implementation thread, 21:12Z). The pay split was Claude's answer to his question "how do we split the contract pay?" in the same thread; Stas accepted it at 21:33Z ("2 sounds like a good start")

## Context

The Milestone 9 spec pictured the human as the Merchant leading a caravan and the AI players as the escort. The system design found two problems with that for the first session. First, trading is the largest single piece of work (markets with stock, price drift and haggling, API-46, size L) and the hardest to balance. Second, a price table in a terminal is the opposite of what Vera gets through alone. Stas then suggested the reverse: the party is hired to escort a caravan, and the merchant is an NPC or an AI player (S4). Separately, the design had to say who may call the commands that move the caravan (S2), because several agents racing for the reins is a known failure.

## Options

### A. The human plays a Hired Blade; the merchant is an NPC or an AI player
- Pro: phases 0 to 2 do not change, and phase 3 needs one escort contract instead of a market. The human plays a fighter on a road, which the table already does well. Vera never reads a price list.
- Con: trading is not tested in Milestone 9; markets with haggling (API-46) and the `/ledger` panel move to the second sandbox.

### B. The human plays the Merchant
- Pro: tests the trade loop the spec was written around.
- Con: API-46 lands in Milestone 9 with its balance risk, and the human's seat becomes the busiest one at the table.

For who leads the caravan (S2):

### A. One caravan owner, named in `campaign.json`
- Pro: one viewer whose `travel` and `rest_night` the engine accepts and whose `choose_card` settles a caravan card; no race.
- Con: one more field in the campaign format and one rule in the protocol.

### B. Any player, first call wins
- Con: agents race for the reins, and the human loses to faster agents.

## Decision

S4 option A and S2 option A.

- `campaign.json.caravan_owner` is a player handle or `npc:<id>`. When the owner is an NPC, as in the first session, the engine follows `route` from `campaign.json`: any Hired Blade may call `travel` without `to` ("we move on") and `rest_night`. Every Blade calls `choose_card` to advise or vote (card kinds, below), whoever owns the caravan. The DM never calls these commands; it narrates.
- **Card kinds** (Stas, 2026-11-02, 21:43Z). A caravan card is the owner's call after asking the party: a Blade's choice on it is advice, an NPC owner takes the majority (the card's `owner_pick` on a tie) unless the card marks an `owner_insists` choice, which the DM then explains. A Blade card is the Blades' vote. While a human is at the table no card resolves without them; the human seat is asked last, in plain words, and Enter goes with the others. A deck for a human run holds about two Blade cards per caravan card.
- **Pay.** Each Hired Blade is paid the SRD 5.2.1 skilled-hireling wage, 2 GP a day per person; there is no shared pot. The merchant pays from their own purse (`npc:<id>`), and the engine writes one `wage` ledger entry per Blade. The terms (an advance, the rest on arrival) are in `campaign.json`. A fallen Blade is paid for the days served. If the merchant dies, the unpaid wages stay in their purse and can be looted; that is the party's choice, not arithmetic.

## Consequences

- The Milestone 9 exit reads "the escort contract done, the pay in the ledger" instead of "5 deals" (`docs/scope/living-world-scope.md` §5).
- API-46 (markets with haggling) is "won't do in Milestone 9" and moves to the second sandbox with `/ledger`; API-47 is the escort contract.
- `contract/protocol.md` gains the caravan owner rule and an exception to "fight participants come from the scene file" for `start_fight`, when those PRs land.
- The merchant NPC is a place NPC record (API-48) with a purse, so its death and its purse persist.

## Revisit when

- The second sandbox brings markets: the human may then take the Merchant seat, and the owner field already allows it.
- A run shows Hired Blades fighting over `travel` with an NPC owner: then narrow the callers to one named Blade.

## Sources

- `docs/design/m9-system-design.md`, sections "Contract" and "Decisions".
- SRD 5.2.1, Equipment, Hirelings: skilled hireling 2 GP per day.
