---
type: Task
id: MAP-23
title: "Tam is a creature in the engine"
pri: P2
dest: Ours
size: M
state: todo
area: "7. Maps and scenario (E7)"
---

Tam is a creature in the engine (decision 0070; Stas 2026-11-12 20:42Z «он NPC и должен быть существом в движке»): while he rides (`tam_rode`, or `tam_followed` at a distance), he is in the card fights the wagon meets (`night_wolves` first), from core's Commoner block (already at pin 3220a7f), on the party side under the same scripted hold-by-the-wagon policy as ENG-48; the wolves may go for him; his harm or death writes a deed, and `bel_asks` (`lowland.json`, added by `tam_rode` and `tam_followed` in `hills.json`; its `let_tam` writes `promised_bel`) and `tams_story` (`wendmouth.json`, with `keep_promise`) read his death deed through `unless`; being hurt writes its own deed for the cards that meet him later; `rufus_offer`'s note (`scenarios/fair_in_wend/deck/odda.json`), which cannot read a deed, says "riding and alive". Zoya's board check and a Vera read

## Status

(Allies in fights milestone, after the Dramaturg mechanism (Stas 2026-11-12 21:22Z; scope table #365); shares ENG-48's ally policy)
