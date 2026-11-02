# 0057. World rules and bookkeeping live in two table crates, nat20-world and nat20-ledger

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decided by:** Stas: D1 and D2 in the Milestone 9 spec thread (2026-11-01, all decisions as recommended); the split into two crates on his comment on the Milestone 9 system design (2026-11-02); S1 on the design's decision card (2026-11-02, "S1 - A")

## Context

Milestone 9, "Living world" (`docs/scope/living-world-scope.md`), makes money, items, time, the road and experience engine state. Some of that is SRD 5.2.1 rules on creatures that core lacks or gets wrong: `remove_money` gives no change and is not atomic, there is no exhaustion model, no XP setter, no passive skill values, and Long Rest has no 16-hour wait. Some of it is about the world rather than a creature: a clock across scenes, a map of places and roads, a caravan of wagons and its cargo, a road event deck. The SRD has tables for part of the world (travel pace, vehicles, rations, prices) and nothing for the rest (the deck, markets, haggling).

Facts checked in the code (core `demo` 0f1bf9b, table `main` 5c77d20): core has no container that is not a creature, so a wagon has nowhere to live in core; our `content/registries/` overlay is not loaded yet; the core RNG is thread-local and seeded per session, and roll ids come from the server's log; `RollView.roller` is required and names a creature.

Three questions followed. Where does the world simulation that the SRD lacks live (D1)? May we add our own rules beyond the SRD (D2)? Where do the caravan and trade goods live (S1)? A fourth came with Stas's comment on the design: is the bookkeeping part of the world, or its own thing?

## Options

### A. Everything in core, as variant rules on `demo`
- Pro: one rules source; the adapter calls only core.
- Con: core gains concepts upstream has no use for (a world clock, a map, a deck, wagons), so every upstream sync costs more. Core would need a new non-creature container kind and the registry overlay first (an extra L in the fork). Rule 6 says core stays a rules engine.

### B. A table crate `nat20-world` with the bookkeeping inside it
- Pro: core stays a rules engine; the world is tested without the engine; one new crate.
- Con: the ledger is needed in phase 1 (purse, give, steal, loot), before any world exists, and the audit CLI would have to depend on the whole world simulation to read a journal. A full general ledger for our own shop (M17) would grow inside the world crate.

### C. Two table crates: `nat20-ledger` for bookkeeping, `nat20-world` for the world
- Pro: the ledger lands in phase 1 on its own and the audit reads it without the world. The world returns ledger entries as data, and the ledger checks and stores them, so the dependency points one way and stays small. The shop's full double entry grows in the ledger without touching the world.
- Con: two crates and one more CI check instead of one.

## Decision

Option C, with these lines drawn:

1. **Core holds SRD 5.2.1 rules on creatures** (purse arithmetic, passive checks, XP, exhaustion and Malnutrition, Long Rest, stat blocks, level 3), each as its own `core/<topic>` PR under Rule 6.
2. **`nat20-world` holds SRD tables about the world as attributed data** (travel pace, vehicles, rations, prices; Trade Goods from SRD 5.1, a 2014 fill under Rule 7) and the simulation the SRD does not have: clock, map, caravan, deck, place NPCs, roster format. It holds no rules on creatures. The caravan and its goods live here, not in core (S1).
3. **Our own rules beyond the SRD are allowed** only labelled as variant rules and switched on per campaign in `campaign.json` (D2). Their text is ours.
4. **`nat20-ledger` holds the bookkeeping**: holders (a creature, `wagon:<n>`, `market:<place>`, `npc:<id>`, and the external `world` account), integer copper, entries `{from, to, what, reason, roll?}` with a closed reason set, the journal and balances derived from it for the audit and trial balance only. It never decides "is there enough": the owner of the number does (core for creatures, `nat20-world` for wagons).
5. **Both crates live in the nat20-table workspace and depend on serde only**: neither `nat20_core` nor the contract crate. `nat20-world` may depend on `nat20-ledger`; `nat20-ledger` never depends on `nat20-world`. A CI job `world-pure`, modelled on `contract-pure`, checks both.
6. **Neither crate has an RNG.** Every function with randomness takes a `WorldDice` the server implements with the session RNG, so every world roll is logged with an `rN` id under the reserved roller `world`.
7. **The bridge is `adapter/world.rs`**, inside `adapter/` (Rule 5). The world returns effects (a check, a fight, a ledger entry, exhaustion, a Long Rest); the bridge runs them through core and writes them to the same log.

## Consequences

- Rule 5 gains a line: neither `nat20-world` nor `nat20-ledger` repeats a rule core has. A rule on a creature that core lacks is fixed in the fork, not in a table crate.
- New rows in `TASKS.md`, Milestone 9: CON-17 (the ledger crate and `world-pure`), API-41 (the world crate and travel), ENG-28 to ENG-32 and CHR-12 (core PRs).
- The contract gains a `world` block in both State views, `purse` and `xp` on `Sheet`, a `ledger` event, and `RollKind::table`; each field gets its row in the visibility table first (Rules 1 and 3).
- Core's `MonetaryValue` stays as upstream has it; the adapter converts to integer copper at projection.
- Two more crates to keep current under Rule 9; both are serde-only, so the cost is small.

## Revisit when

- Upstream adds a world model, vehicles or containers to core: then move what fits back into core in a sync PR.
- Our own shop (M17) needs a chart of accounts: grow it in `nat20-ledger`; if the world ever needs to read ledger internals, the one-way dependency is wrong and this record is reopened.
- A variant rule turns out to act on a creature: it belongs in core, and the crate boundary is checked again.

## Sources

- `docs/design/m9-system-design.md`, sections "Crates `nat20-ledger` and `nat20-world`", "Core" and "Decisions".
- `docs/scope/living-world-scope.md`, section 3.
- Milestone 9 spec, decisions D1 and D2: https://claude.ai/artifact/T3cwJH8snR6q9GXj1Mnedu.
