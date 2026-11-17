---
type: Task
id: ENG-48
title: "Allies in a card's wagon fight: the engine half and the deck half"
pri: P2
dest: Ours
size: L
state: todo
area: "2. Engine correctness (core)"
---

Whoever rides with the wagon is in a card's wagon fight, moved by the engine (decision 0076, option B; design `docs/design/allies-in-fights-system-design.md` §4). Two PRs.

Engine (design PR 8, L): rules A1 to A7 and A9 on the test world, animals and roster people. A `fight` effect with `wagon: true` places each living animal of each wagon's `team` but the wagon's last (design §16 item 3), each alive `worlds/<id>/company.json` entry whose `if` holds on this contract and no `unless`, and the owner unless `owner: false`; allies stand at the first anchor or the entry's `at`, monsters arrive at `from`. Policy `hold` in `adapter/game.rs` beside `scripted_action` (one policy for every ally: a person strikes back at what is in reach, as an animal does; §16 item 4). Allies never count as a conscious party creature and take no XP. A dead animal leaves `team`; deeds `<id>_dead`, `<id>_hurt` (entries with `hurt: true`), `<owner>_lost_a_horse`, `by` per rule A7. `pack check` fails a `_dead` or `_hurt` deed with no reader that speaks (A9). `protocol.md` §4.4, §4.11, §4.13 and fixture `allies.jsonl` under Rule 1; no wire type. Prints the death-and-wound table of design §15 (200 seeded fights per `wagon` card, `from` at the wagon and at `ahead`) before any content; it counts deaths and wounds and nobody tunes `from` to a target (§16 item 1). Rule A10 test if it merges after API-58.

Deck (design PR 11, S): `wagon: true` and `from` on `night_wolves`, `goblin_ambush`, `millbeck_bridge` (`owner: false`: the Merchant is not placed there, §16 item 7), `men_at_the_iron`; the dog in `company.json`; every `fed_gwyns_dog` choice also reads `gwyns_dog_dead`, and «Сказать Гвин про её пса.» on `gwyn_news` and `gwyn_cheese`; the `killed_` note clause on `osric_hears`, `bridge_again`, `toll_man_stocks`, `gwyn_news`; the eight horse texts (a dead horse costs nothing on the road: §16 item 2); the `_lost_a_horse` choice on `meadow_track` and `salt_on_credit`; MAP-22's note line rewritten. Zoya's board check and a Vera read.

Check: design §11 rows 1, 2, 4 (test, no model). Cost: engine 40 USD build, Stas about 45 min; deck 11 USD, about 20 min (design §14)

## Status

todo. Engine needs ENG-47 and the MON-12 pin; deck needs MAP-22, the engine PR and MAP-24. Its M13 files are on main (Milestone 13 closed 2026-11-16). Tam's engine half is here; MAP-23 is his content. §16 answered by Stas 2026-11-16 (table #419). MAP-22 wrote no going-home deed (its Status says why): the deck half drops the "found them again" note clause on `night_wolves` and `drovers` and gates each dog pair on whether the dog's company entry rides on this contract (rule A2), which also covers a dead dog with no extra twins
