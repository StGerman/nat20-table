---
type: Task
id: ENG-11
title: "A creature walking in real time keeps walking after it enters combat"
pri: P2
dest: Fork
size: S
state: todo
area: "2. Engine correctness (core)"
dest_was: "Up?"
gate_was: N
---

A creature walking in real time keeps walking after it enters combat: `start_encounter_with_id` (and `join_encounter`, core #6) set turn-based time but leave `ActivityState::Moving`, so `creature::update_activity` moves it during other creatures' turns. Open question, ours since decision 0023: does a walk stop when combat begins? The table never hits it, since it starts fights and joins spawns with idle creatures. Found by Copilot on core #6
