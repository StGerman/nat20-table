---
type: Task
id: MAP-27
title: "Osric's mill card never says whether anyone yielded"
pri: P2
dest: Ours
size: XS
state: todo
area: "7. Maps and scenario (E7)"
---

In `worlds/wend/deck/wendford.json`, card `mill_yard_to_the_end`: add to its note "Osric never says whether anyone yielded; he answers only for the village", and give choice 3 (`ask_back`) `keeps`/`breaks` on `mercy_to_yielded`. In M13's exit run 2 (`full-2026-11-16T20-25-56-767Z`) the table chose `ask_back` and the DM had Osric say «никто там не сдавался. А кто сдался бы, остался бы жив»: that breaks the note's ban, clears the Blades and removes the choice's cost (judge flag n11-1; Zoya: fails in the telling). Needs Zoya's board check and the Vera fallback on the changed card, quoted in the PR.

## Status

(independent, outside any milestone; from Stas's M13 ruling 2026-11-16, nat20-runs #7)
