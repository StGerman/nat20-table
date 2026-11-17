---
type: Task
id: ENG-49
title: "The Merchant can die in a wagon fight, and the Blades decide on the purse"
pri: P2
dest: Ours
size: L
state: partial
area: "2. Engine correctness (core)"
---

The Merchant (Odda Vell on *Fair in Wend*, Fenn Lusk on *The Way Back*) stands in wagon fights from the Commoner block under ENG-48's policy and can die; the outcome is decision 0086 (Stas 2026-11-13 20:00Z): the death card at once, bring the purse in or take it, the wagon goes on (design `docs/design/allies-in-fights-system-design.md` §5). Two PRs.

Engine (design PR 13, M): rules M1 to M4. `campaign.json` `world.escort.death_card` put on the table before travel, rest or pay; with the owner dead a caravan card is decided as a Blade card; a deck effect that pays the purse out as `loot`, one entry per living Blade; `escort_settled` once, at the destination; the arrival line in two variants; trial balance holds after each batch. `protocol.md` §4.13 and §4.17, fixture `merchant_death.jsonl` with both choices, under Rule 1; no wire type.

Deck (design PR 14, M): two death cards with Zoya's note clauses; rule M5 readers for `brought_oddas_purse_in`, `took_oddas_purse`, `brought_fenns_purse_in`, `took_fenns_purse` (one Saltmouth card with Brannock in `cast`; choices on `gwyn_news` and `gwyn_cheese`); the eight cards that name the Merchant (owner in `tells`, the owner's own choice `unless: <owner>_dead`, `salt_on_credit`'s twin); the sixteen notes, `twb_wendmouth`, the two destination prose files, both `adventure.md`. Zoya's board check and a Vera read.

Check: design §11 rows 3 and 4 (test, no model). Cost: 21 + 21 USD build, Stas about 30 + 25 min (design §14)

## Status

partial. Engine done (design PR 13): rules M1 to M4, `escort.death_card` checked to go once and read `<owner>_dead`, owner rule A9, the `share_purse` effect, `escort_settled.purse` (`owner`, `carried`, `shared`; contract 1.0.0-dev.79: the arrival line needs to know which purse paid, so the field is on the wire after all), fixture `merchant_death.jsonl` with both choices. Deck (design PR 14) is next. The Merchant is not placed at `millbeck_bridge` (§16 item 7, Stas 2026-11-16)
