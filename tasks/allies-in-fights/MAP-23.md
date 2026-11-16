---
type: Task
id: MAP-23
title: "Tam rides into the wagon's fights: his content"
pri: P2
dest: Ours
size: S
state: todo
area: "7. Maps and scenario (E7)"
---

Tam is a creature in the engine (decision 0070; Stas 2026-11-12 20:42Z «он NPC и должен быть существом в движке»); the engine half is ENG-48's, this row is content only (design `docs/design/allies-in-fights-system-design.md` §4.2, PR 12). Tam goes into `worlds/wend/company.json` (Commoner, `if` `tam_rode` at the wagon or `tam_followed` at `behind`, `hurt: true`) and into the roster. `bel_asks` and `tams_story` read `tam_dead` through `unless`; `bel_asks` gets the `if: tam_hurt` choice and `tams_story` one note line; one Saltmouth arrival card (a departure from the scope, §16 item 6) with Bel in its `cast` and `tams_story`'s condition reads `tam_dead` (rule A9), its note naming `promised_bel`, `lied_to_bel` and `covered_for_tam` as causes; `rufus_offer`'s note says "riding and alive". Zoya's board check and a Vera read. Check: design §11 rows 1 and 4; row 12, Vera reads a fight where Tam is hurt (§16 item 5). Cost: 11 USD build, Stas about 20 min (design §14)

## Status

todo. Needs ENG-48's engine PR and MAP-24
