---
type: Task
id: MAP-24
title: "The people of Wend in the roster, and cast and tells on every card"
pri: P2
dest: Ours
size: L
state: done
area: "7. Maps and scenario (E7)"
---

14 people and 4 companions into `worlds/wend/npcs.json` and `campaign.json`: every Russian case form in `names` (Гвин and Бел do not decline; Тэм, Фенн, Осрик, Одда do), Zoya's `look` and `heard` and her first `remembers` lines; `cast` and `tells` on every card; every person in The Way Back's `glossary_ru` moves to the roster. `pack check` rule N2 (a shared form, a form outside `cast` and `tells`, a person in `glossary_ru`, an animal in the roster, a `remembers` line whose deed nothing writes) and N3 (no digit in `look`, `heard`, `remembers`). Zoya's bible amendment A binds `heard` (§16 item 9, Stas 2026-11-16). Zoya's board check; Vera reads `look`, `heard`, `remembers` (design `docs/design/allies-in-fights-system-design.md` §6.1, PR 10). Check: design §11 row 4 (test, no model). Cost: 42 USD build with the Zoya and Vera reads, Stas about 35 min (design §14)

## Status

done. 15 people in `worlds/wend/npcs.json` (Wenna joins the 14: two Wend cards name her), `look` on the 4 companions, `cast` and `tells` on all 46 Wend cards, the people out of both packs' `glossary_ru`; rule N2 in `pack check` (`rosterProblems`, and a beast in the roster refused by the engine) and N3 with the deed rule in `crates/nat20-api-server/tests/deeds.rs`. Zoya's page is `/mnt/project-files/engine/allies/map24-zoya-page.md`. Two of her memory lines wait for the company entries that write their deeds: Gwyn's `gwyns_dog_dead` (ENG-48's deck half) and Tam's `tam_hurt` (MAP-23), kept in `/mnt/project-files/engine/allies/map24-held-memories.json`. Her board debts go to ENG-49, AGT-107 and the deck half where they belong
