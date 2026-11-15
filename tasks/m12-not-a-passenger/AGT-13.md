---
type: Task
id: AGT-13
title: "First-time-player check"
pri: P1
dest: Ours
size: S
state: partial
area: "8. Agents, game loop, interface (all new)"
gate_was: N
---

First-time-player check: playable with only `/options` and `/sheet` (acceptance §6.6)

## Status

groundwork in M6 step 11 (`table/text-ui`): `/sheet` reads as a sheet, `/help` lists the commands, a potion's quick picks are you and your allies, not hostiles. The check itself is a first-time player, during friends-and-family testing after M7, not M7's exit (Stas 2026-10-27 19:59Z; M7 spec §3.3). Milestone 12, Stas 2026-11-08: the Vera fallback also reads `/options` and `/sheet` in the played run, from its `seat.jsonl` (kind `command`, table #359); the row stays partial until friends-and-family testing
