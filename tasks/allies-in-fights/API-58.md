---
type: Task
id: API-58
title: "Roster people: names, cast, tells and the DM's mention"
pri: P2
dest: Ours
size: L
state: done
area: "1. API contract and server (E1 follow-ups)"
---

Roster entries gain `names`, `look`, `heard`, `remembers`, `monster`, optional `place` and `anchor`; cards gain `cast` (a roster id or `owner`) and `tells` (DM's card view only). DM command `mention{npcs}` and event `npc_named`: the loop matches a DM line and sends it; a mention places the person if with the party (rule N4), never during a fight. `NpcKnown` gains `names` and `look`, its `place` becomes optional (the one line `check-breaking` lists). Rule A8: a card whose `cast` holds a dead roster person is never offered or drawn. Contract, `protocol.md` §5, CHANGELOG, fixture with a mention then a fight, server (Rule 1; design `docs/design/allies-in-fights-system-design.md` §6.1, §7, PR 7). Rule A10 test if it merges after ENG-48's engine PR. Check: design §11 row 7's fixture (test, no model). Cost: 40 USD build, Stas about 35 min (design §14)

## Status

done 2026-11-17: contract 1.0.0-dev.76, fixture `mention.jsonl` (a mention, then a fight), the loop's matcher `game/src/table/mentions.ts`. Rule A10's test lands with ENG-48, which merges second. API-59, MAP-24 and ENG-49's engine PR wait on it
