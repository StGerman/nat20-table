# 0012. Spatial model: a hidden 5-ft grid narrated by the AI; the demo uses named anchors

- **Status:** Accepted (demo amendment: named anchors on Nat20's 3D space)
- **Date:** 2026-10-16
- **Decided by:** Stas accepted the hidden grid in the mechanics backlog thread; the named-anchor amendment came with the Demo Run scope, accepted by Stas 2026-10-16

## Context

Opportunity attacks, reach, areas of effect and cover cannot be resolved reliably in pure theatre of the mind. Players in a text UI should not deal in coordinates. Nat20 models space as continuous 3D with a navmesh (polyanya, parry3d, meters), not a grid.

## Options

### A. Pure theatre of the mind
- Pro: simplest for players.
- Con: the engine cannot resolve range, reach or areas, so the LLM rules them ([0005](0005-engine-rolls.md) forbids that).

### B. Visible grid
- Con: needs maps and graphics, out of scope.

### C. Hidden 5-ft grid, narrated by the AI
- Pro: every working engine surveyed uses a grid; rules resolve exactly; players never see it.
- Con: conflicts with Nat20's continuous space.

### D. Nat20's continuous 3D, exposed as named anchor points per room
- Pro: no core change; players and agents say "the millstone", not coordinates.
- Con: anchor placement is our content work; positions between anchors are coarse.

## Decision

C as the project's model; D for the demo, because Nat20's space is continuous. `move.to` takes an anchor, a creature or a point; `/where` lists anchors and distances in feet.

## Consequences

- Two flat maps (mill yard, cellar) with named anchors (MAP rows).
- Anchor support could go upstream as a generic feature.

## Revisit when

After the demo, if anchors prove too coarse in fights or a grid becomes necessary for content beyond the demo.

## Sources

- `/mnt/project-files/engine/mechanics-backlog.md`; `docs/scope/demo-run-scope.md` §1.4, §7.5.
- Thread "Game mechanics codification list".
