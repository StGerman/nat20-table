---
type: Task
id: ENG-44
title: "A pack with no campaign joins the world"
pri: P1
dest: Ours
size: M
state: done
area: "2. Engine correctness (core)"
---

A pack with no campaign joins the world (decision 0075; design §5): contract `1.0.0-dev.N+1`, `NewSession.site {map, place}`, with fixture `site.jsonl`, CHANGELOG, the doc comments of `RosterWorld.state` and `Roster.world`, and `contract/protocol.md` §4.15; the world crate: `Memory.left_at`, `SavedWorld.contract` optional, the carry from a memory-only world; `site` in the adventure schema and `pack:check` (the place is on the map with the adventure's `pack_slot`, no `site` beside a campaign, a scene creature's `npc` against the adventure's `npcs`); `game/src/engine.ts` passes `site`; §4.2 rule 7's seeded test on the test world, written first (design §11). M, not the scope's S (design §12 item 5)

## Status

Done in table #413 (Milestone 13, PR 6, stacked on table #411; design `docs/design/m13-system-design.md` §5): contract `1.0.0-dev.75`, fixture `site.jsonl` (refusals, then a site session's deed met by a card on the test world), `SiteWorld` in `campaign.rs`, `SavedWorld::resume`, `site` in the adventure schema and `pack:check`. The Mill's own `site` is MAP-20.
