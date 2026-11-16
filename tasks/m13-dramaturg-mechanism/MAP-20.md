---
type: Task
id: MAP-20
title: "The Mill's deeds and the Wendford Mill cards"
pri: P1
dest: Ours
size: S
state: done
area: "7. Maps and scenario (E7)"
---

The Mill's deeds and the Wendford Mill cards (design §4.1, §4.4, §7): `yard_fight.on_end` (surrender with the four yard goblins writes `snitt_yielded`, then `won` writes `yard_to_the_end`), `cellar_fight.on_end` (`won` writes `wenna_saved`), Scene 5's `boss` gets `npc: gritch`, `adventure.json` gets `site {wend, pells_mill}`; two arrival cards in `worlds/wend/deck/wendford.json` (`if: [wenna_saved, snitt_yielded]` and `if: [wenna_saved, yard_to_the_end]`, `target: blades`, `once`, one `remember` per choice) with `text_ru`, in Zoya's text, which replaces §7's working lines and answers what design §13's closing line owes (Osric asks who answers and the choices answer why; "a debt" to whom; "your company" twice; the two "and that was" endings; the note says "let him live" means at the mill only); three prose lines removed: the "village knows them" line in `fw_wendford.md`, the last sentence of Osric's note in `npcs.json`, "Snitt's hungry band" in the `goblin_scouts` note of `worlds/wend/deck/hills.json`; §4.2 rule 7 on the shipped packs; Zoya's board check and Vera quoted before merge

## Status

Done in table #415 (Milestone 13, PR 7, stacked on table #413; design `docs/design/m13-system-design.md` §4.4): the cards `mill_goblin_taken_alive` and `mill_yard_to_the_end`, rule 7 in `crates/nat20-api-server/tests/deeds.rs`. Owed, from Zoya's board check: the six answer deeds are written and unread (Arachas plus glue); Osric's hill kin on the second card are a setup with no carrier yet.
