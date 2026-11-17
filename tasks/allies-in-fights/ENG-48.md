---
type: Task
id: ENG-48
title: "Allies in a card's wagon fight: the engine half and the deck half"
pri: P2
dest: Ours
size: L
state: partial
area: "2. Engine correctness (core)"
---

Whoever rides with the wagon is in a card's wagon fight, moved by the engine (decision 0076, option B; design `docs/design/allies-in-fights-system-design.md` §4). Two PRs.

Engine (design PR 8, L): rules A1 to A7 and A9 on the test world, animals and roster people. A `fight` effect with `wagon: true` places each living animal of each wagon's `team` but the wagon's last (design §16 item 3), each alive `worlds/<id>/company.json` entry whose `if` holds on this contract and no `unless`, and the owner unless `owner: false`; allies stand at the first anchor or the entry's `at`, monsters arrive at `from`. Policy `hold` in `adapter/game.rs` beside `scripted_action` (one policy for every ally: a person strikes back at what is in reach, as an animal does; §16 item 4). Allies never count as a conscious party creature and take no XP. A dead animal leaves `team`; deeds `<id>_dead`, `<id>_hurt` (entries with `hurt: true`), `<owner>_lost_a_horse`, `by` per rule A7. `pack check` fails a `_dead` or `_hurt` deed with no reader that speaks (A9). `protocol.md` §4.4, §4.11, §4.13 and fixture `allies.jsonl` under Rule 1; no wire type. Prints the death-and-wound table of design §15 (200 seeded fights per `wagon` card, `from` at the wagon and at `ahead`) before any content; it counts deaths and wounds and nobody tunes `from` to a target (§16 item 1). Rule A10 test if it merges after API-58.

Deck (design PR 11, S): `wagon: true` and `from` on `night_wolves`, `goblin_ambush`, `millbeck_bridge` (`owner: false`: the Merchant is not placed there, §16 item 7), `men_at_the_iron`; the dog in `company.json`; every `fed_gwyns_dog` choice also reads `gwyns_dog_dead`, and «Сказать Гвин про её пса.» on `gwyn_news` and `gwyn_cheese`; the `killed_` note clause on `osric_hears`, `bridge_again`, `toll_man_stocks`, `gwyn_news`; the eight horse texts (a dead horse costs nothing on the road: §16 item 2); the `_lost_a_horse` choice on `meadow_track` and `salt_on_credit`; MAP-22's note line rewritten. Zoya's board check and a Vera read.

Check: design §11 rows 1, 2, 4 (test, no model). Cost: engine 40 USD build, Stas about 45 min; deck 11 USD, about 20 min (design §14)

## Status

partial. The engine half is done (design PR 8): `wagon`, `from` and `owner` on a deck fight, `worlds/<id>/company.json` with rule A9 checked at `start_campaign`, the `rides:<id>` choice condition (MAP-22's ask, in place of a going-home deed), policy `hold`, rules A5 and A6, the death and wound deeds by the Blades (A7), a dead team animal leaving `team`, rule A10 (a person a mention placed joins as they stand). Fixture `allies.jsonl` on the test world: an ally kills the grey wolf (`killed_grey` by the dog), the owner and a horse die, the dog comes out hurt; then the last Blade falls with every ally standing. `npm run play:wagon-table` prints design §15's table with no model and every creature, the Blades too, on the engine's script; the 200-seed table of 2026-11-17 is `/mnt/project-files/engine/allies/wagon-table-2026-11-17.md` (scripted Blades rush the monsters, so live seats may lose allies more often). Left: the deck half (design PR 11), which needs MAP-24 for the Merchants in the roster and MAP-23 for Tam. Design §3 item 4 and §13 row 4 still name a going-home deed and are out of date
