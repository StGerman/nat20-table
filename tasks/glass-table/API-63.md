---
type: Task
id: API-63
title: "A people's record in the world's data, and the Corrins' line in the player's view"
pri: P1
dest: Ours
size: S
state: done
---

Scope §5 (Zoya's board), design §4.3 (the one exception to "the contract does not change"). The packs' `glossary_ru` has no entry for the roadfolk, so the DM may translate the word another way and lose the underline. A people gets a place in the world's data and a field in the player's view of it, and the Corrins get this line, Zoya's A as written, approved by Stas 2026-11-21 08:29Z (scope §9 question 8):

«Коррины — невысокий кочевой народ: семьями живут в расписных повозках и латают котлы по всей долине.»

An engine contract change, so Rule 1's order in one PR: the contract crate and `contract/protocol.md`'s visibility table (Rule 3: player view), a fixture, a `contract/CHANGELOG.md` line, `npm run gen`, then server and client. Vera's doubt («невысокий для людей или это другой народ?») was heard and the line kept as written.

Depends on: CON-20 (milestone order). Read by AGT-143's «Люди».

Check: the fixture shows the record in the player's view and nothing of it in a view it was not given: test, no model.

## Status

done. Contract 1.0.0-dev.80: `PeopleView`, `WorldDm.peoples`, `NpcDm.people`, `WorldPlayer.peoples` (the peoples of the persons this character has seen or heard of). World crate: `NpcFile.peoples` and `NpcDef.people`, checked at `start_campaign`. *Wend* records the Corrins with the approved line, and Bel and Tam belong to them. The table reads the Russian line from the people book and the name from the seat's names (`people:<id>`), and the DM's name line holds «коррины». Check: `allies.jsonl` and `mention.jsonl` show `peoples` only to a player who has seen Old Tobin; unit tests in `projection.rs` and `npcs.rs`; `game/test/peoples.test.ts`.
