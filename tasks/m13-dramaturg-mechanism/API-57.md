---
type: Task
id: API-57
title: "Scene deeds"
pri: P1
dest: Ours
size: S
state: done
area: "1. API contract and server (E1 follow-ups)"
---

Scene deeds (design §4): contract `1.0.0-dev.N`, the first free after M12's last: `Consequence::Remember {deed}`, `Encounter.on_end` as ordered `EndRule {when: surrender{yielded} | won, remember}`, `SceneCreature.npc` writing `killed_<npc>`; the Deeds paragraph of `contract/protocol.md` §4.13; fixture `scene_deeds.jsonl`; CHANGELOG; the server (`apply` gains `Remember`, `follow_blows` takes scene creatures' `npc`, `on_end` evaluated at `combat_over`); §4.2 rules 1 to 6, and rule 8's validator across packs in the server crate. `nat20_core` untouched

## Status

Done in table #411 (Milestone 13, PR 5; design `docs/design/m13-system-design.md` §4): contract `1.0.0-dev.74`, fixture `scene_deeds.jsonl`, rules 1 to 6 in `scene.rs`, rule 8 in `crates/nat20-api-server/tests/deeds.rs`. The Mill's own deeds are MAP-20.
