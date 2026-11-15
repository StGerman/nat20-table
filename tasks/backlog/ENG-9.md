---
type: Task
id: ENG-9
title: "Rest interruption"
pri: P2
dest: Fork
size: S
state: todo
area: "2. Engine correctness (core)"
dest_was: "Up"
gate_was: Y
---

Rest interruption: SRD 5.2.1 stops a Short Rest on rolling Initiative, casting a non-cantrip spell or taking damage, and an interrupted rest gives no benefits; core never interrupts a rest (`start_encounter_with_id` leaves `resting` set). core #3 only refuses Hit Point Dice while in combat. Found by Copilot on core #3

## Status

P2 since M7 (spec §2): it can't happen through the API: `short_rest` is one command, explore only, and refused in combat (`adapter/game.rs`)
