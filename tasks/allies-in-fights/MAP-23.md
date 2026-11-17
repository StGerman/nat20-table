---
type: Task
id: MAP-23
title: "Tam rides into the wagon's fights: his content"
pri: P2
dest: Ours
size: S
state: done
area: "7. Maps and scenario (E7)"
---

Tam is a creature in the engine (decision 0070; Stas 2026-11-12 20:42Z «он NPC и должен быть существом в движке»); the engine half is ENG-48's, this row is content only (design `docs/design/allies-in-fights-system-design.md` §4.2, PR 12). Tam goes into `worlds/wend/company.json` (Commoner, `if` `tam_rode` at the wagon or `tam_followed` at `behind`, `hurt: true`) and into the roster. `bel_asks` and `tams_story` read `tam_dead` through `unless`; `bel_asks` gets the `if: tam_hurt` choice and `tams_story` one note line; one Saltmouth arrival card (a departure from the scope, §16 item 6) with Bel in its `cast` and `tams_story`'s condition reads `tam_dead` (rule A9), its note naming `promised_bel`, `lied_to_bel` and `covered_for_tam` as causes; `rufus_offer`'s note says "riding and alive". Zoya's board check and a Vera read. Check: design §11 rows 1 and 4; row 12, Vera reads a fight where Tam is hurt (§16 item 5). Cost: 11 USD build, Stas about 20 min (design §14)

## Status

done. Tam is one `company.json` entry (`npc: tam`, `if: tam_rode`, `unless: gave_tam_back_to_bel`, `hurt: true`, at the wagon), so his death writes `tam_dead` and marks the roster. Departure from this row: Tam who follows (`tam_followed`) is not in the fights. The format check refuses a second entry with his id, and a second id would not be Tam; on the table he was never in danger behind the wagon, and `night_wolves`' note says he is out of sight down the road. `bel_asks` and `tams_story` read `tam_dead` through `unless`; with Tam hurt, `bel_asks`' `cover` gives way to «Вернуть ей сына.»; the Saltmouth arrival card `bel_at_the_gate` (Bel in `cast`, Tam in `tells`) reads `tam_dead`, and its note names `promised_bel`, `lied_to_bel` and `covered_for_tam`. `rufus_offer`'s note says "riding and alive". Row 12 (Vera reads a fight where Tam is hurt) waits for a run
