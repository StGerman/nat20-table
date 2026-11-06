# 0061. Time passes in a place at the DM's call

- **Status:** Proposed (accepted when Stas merges table: API-50)
- **Date:** 2026-11-06
- **Decided by:** Claude, choosing the recommended option inside Stas's go-ahead for the post-M9 findings (card 5, option A, Faces of the Road thread, 2026-11-06 15:25Z); Stas reviews it in the PR

## Context

Decision 0060, finding F2: the world clock stands still in a place scene. In the all-AI exit run (2026-11-06T07-29-50) the whole Wendford stop (sheep, the alehouse, a meal) and the Millbeck bridge took 0 minutes. Exit run 1 showed the same thing, with dusk narrated at 14:00. Only `travel`, `rest_night` and a road card's `delay` effect move the clock (`nat20-world` `travel.rs`). So the DM narrates hours that the engine never counts, and the trip planner, the day's distance and the arrival watch all read from a clock that is wrong.

Constraints: the engine owns the clock (Rule 4 in spirit: nothing outside the engine sets state); the DM picks what happens in fiction; times reach players only as watches or prose, never hh:mm (M9 travel planner rule).

## Options

### A. A DM-only `pass_time` command in coarse spans
`pass_time{span}` with `short_while` (30 min), `hour`, `watch` (to the next watch), as `dm`, out of combat, never past midnight. It moves the clock, core's time and the day's travel as a card's lost time does.
- Pro: the DM already decides what the party spends time on; one tool call per beat; the spans match how the fiction talks (a meal, an hour, until evening).
- Pro: reuses the world's `delay` and core's `pass_minutes`, so no new rule; refusals are the ones `travel` already has.
- Con: the DM can forget to call it. The prompt asks for it, and a stop with no call is no worse than today.
- Con: one more DM tool and a contract command (additive, dev.58).

### B. The game loop advances the clock on its own, a fixed amount per explore round
- Pro: no DM decision; time always moves.
- Con: a round can be one sentence or a long talk; fixed minutes per round are wrong both ways and would eat the travel day on a chatty table.
- Con: the loop would decide a world fact, which belongs to the engine and the DM's fiction.

### C. Each place scene costs a fixed stop time on arrival
- Pro: no tool at all.
- Con: a quick water stop and a night's fair cost the same; the DM's narration still contradicts the clock.

### D. Leave it (decide later)
- Pro: no work.
- Con: F2 stays, and Milestone 11's world reacts to time (gossip, `soon` cards) on a frozen clock.

## Decision

A. The DM already rules what the party does in a place, so it should say how long it took, in the words the fiction uses. The engine applies it with the rules it already has for lost time.

## Consequences

- Contract 1.0.0-dev.58: `pass_time{span}`, `TimeSpan`, event `time_passed{minutes, clock}` (public), reject reason `night_falls` (protocol §4.18). Fixture `pass_time.jsonl`.
- `nat20-world` `Clock` gains `minutes_to_next_watch` and `minutes_to_midnight`.
- Time in a place shrinks the day's travel, as a road card's delay does: a long stop means fewer miles before camp. A table that spends 8 hours in a village can't travel that day.
- The DM gets a `pass_time` tool and a prompt line; the table reads the engine's `time_passed` line.
- TASKS.md API-50.

## Revisit when

A run's DM never calls `pass_time` across a place scene that narrates hours (the clock still freezes), or calls it so often that the travel day is spent before the party leaves a place. Either one points to option B or C as a backstop.

## Sources

- Decision 0060, Consequences, F2; `/mnt/project-files/engine/m9/runs/full-2026-11-06T07-29-50-016Z/analysis.md` (F2).
- `crates/nat20-world/src/travel.rs` (`delay`), `crates/nat20-api-server/src/session/cards.rs` (the card's `Delay` effect).
