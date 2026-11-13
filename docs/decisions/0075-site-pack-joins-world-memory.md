# 0075. A pack with no campaign names its site in `new_session`

- **Status:** Accepted
- **Date:** 2026-11-13
- **Decided by:** Stas, 2026-11-13, by merging table #375 («мердж значит да»): option A, with all seven design decisions as recommended. Lev Neiman proposed it in `docs/design/m13-system-design.md` §5.

## Context

Milestone 13 lets a scene write a deed (scope `docs/scope/dramaturg-mechanism-scope.md`, In 1 and 3). *The Silent Mill* runs with no `campaign.json` and no `start_campaign`, so today its session has no world: `remember` returns without one, and `save_roster` saves characters only. A later contract on the same map must find the Mill's deeds with a contract number and a day. Facts checked:

- The engine reads scene files and `campaign.json` from the pack; it never reads `adventure.json`.
- `worlds/wend/map.json` already has `pells_mill` with `pack_slot: the_silent_mill`.
- A saved world needs a contract part today (`SavedWorld.contract`: the caravan, and `at`, the only place the position is kept; `carry_memory` reads it), and `Campaign::read` takes a saved world whose escort is not done as a journey under way and refuses another pack.
- `RosterWorld.state` is opaque on the wire, so its inner shape is the world crate's, not the contract's.
- The conformance fixtures replay against one test data directory, which has a `campaign.json`.

## Options

### A. The game passes `site {map, place}` in `new_session` (proposed)
`adventure.json` gains `site: {map, place}`; the game sends it. The server checks the place is on the map; `pack:check` checks the place's `pack_slot` is the adventure's `id`, since the server never reads `adventure.json` and would only compare the game's claim with itself. The session keeps a memory with no contract part and saves it; `start_campaign` on that roster carries the memory as from a finished contract.
- Pro: one optional wire field; the fixture needs no second data directory; the Mill's scene flow is untouched.
- Con: a contract version of its own; the engine trusts the game for which site a session is, as it already trusts it for the pack's directory.

### B. A `site.json` in the pack, read by the engine
- Pro: no wire change; the pack speaks for itself.
- Con: a new pack file format the engine reads; the one test data directory would hold both a campaign and a site, so the fixtures need a second directory or a rule for which wins; `adventure.json` and `site.json` would both say where the Mill is.

### C. A `campaign.json` for the Mill, and `start_campaign`
- Pro: no new mechanism; the memory, the clock and the roster work as on the road.
- Con: the Mill gets a caravan, a route and a moving clock it has no use for; `start_campaign` moves the party to the place's scene and changes the frozen Demo Run's flow, which run 1 of the exit must still pass on.

## Decision

A. It is the smallest change that gives the Mill's deeds a world, a day and a contract number, and it leaves the Mill's play as it is.

## Consequences

- ENG-44 changes the contract (`NewSession.site`, additive), with its fixture and CHANGELOG line, after API-57's version; the doc comments of `RosterWorld.state` and `Roster.world` and protocol §4.15 change with it, and the game passes `site` (`game/src/engine.ts`).
- In the world crate `Memory` gains an optional `left_at` and `SavedWorld.contract` becomes optional; the carry reads `from` from `contract.at` or, with no contract part, from `left_at`. Roster format stays 2, and every roster saved before still reads.
- `start_campaign` in a site session, and a site on a roster whose contract is under way, are refused; a roster whose world is on another map starts fresh.
- `pack:check` refuses a pack with both `site` and a campaign, and a `site` whose place has another `pack_slot`.

## Revisit when

- A second pack with no campaign needs more than deeds from its world (its place NPCs, its prices, a card drawn inside it): that pack wants a campaign, and C comes back.

## Sources

- `docs/design/m13-system-design.md` §5; scope §2 item 3, §5 question 4.
- `crates/nat20-api-server/src/session.rs` (`save_roster`), `session/cards.rs` (`remember`), `campaign.rs` (`Campaign::read`); `crates/nat20-world/src/travel.rs` (`SavedWorld`, `carry_memory`).
