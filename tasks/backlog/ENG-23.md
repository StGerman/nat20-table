---
type: Task
id: ENG-23
title: "Flaky core test: guiding bolt lasts until the caster's next turn"
pri: P2
dest: Fork
size: S
state: todo
area: "2. Engine correctness (core)"
gate_was: N
---

Core test `class_cleric::guiding_bolt_lasts_until_the_end_of_the_casters_next_turn` is flaky: about 1 run in 100 the cleric's action is refused because the engine is waiting on another creature's turn (`FieldMismatch` on `actor`), so the scenario's forced initiative order doesn't always hold. Fails 3 in 400 on fork `demo` 8942a1c without core #59. Found 2026-10-27 running core #59's suite
