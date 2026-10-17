# 0004. Visibility is structural: separate view types, projected by the engine

- **Status:** Accepted
- **Date:** 2026-10-16 (engine-side projection and health bands confirmed by Stas 2026-10-17)
- **Decided by:** Claude proposed in the API contract review and the system design; Stas confirmed contract decisions 3 and 4 ("confirm all 5", 2026-10-17)

## Context

A player agent must never receive DCs, AC, monster HP, scenario data or other players' sheets (scope §4.3). An AI player that sees them metagames, and a leak is invisible until a transcript shows it.

## Options

### A. One creature type with optional hidden fields, filtered at runtime
- Pro: fewer types.
- Con: a forgotten `if` leaks; the field exists in every client type.

### B. Separate view types per audience, projected by the engine per `viewer`
- Pro: the player view type has no `hp` field, so a leak does not compile in Rust or TS.
- Pro: one place (`projection.rs`) turns full state into a view.
- Con: more types; every new field needs a visibility call.

### C. Projection only in the game loop's tool bindings
- Pro: engine stays simpler.
- Con: the full state still crosses into the game process for every caller; one binding bug leaks.

For enemy health, the options were exact numbers, nothing, or a band. The band (`unhurt` / `bloodied` / `down`, bloodied being the SRD 5.2.1 half-HP term) gives players what their characters can see.

## Decision

B, plus the orchestrator's tool binding as a second layer. Player-facing view types do not have hidden fields at all. Other creatures show a health band only.

## Consequences

- CLAUDE.md Rule 3, and the visibility table in `contract/protocol.md`.
- A player agent's tools bind `viewer` to its own handle; the client sets `viewer` last so tool input cannot override it.
- Hit Points after a change travel in their own `hit_points` event, so a projection drops the whole event instead of redacting a field.
- CI job `visibility` replays fixtures as each player and scans for `hp`, `ac`, `dc`, `against`.

## Revisit when

A view needs data whose audience is not DM, owner or table (for example a spell that reveals HP), which needs a new view type rather than an optional field.

## Sources

- `docs/design/system-design.md` §4; `contract/protocol.md` decisions 3-4 and §5.
- `/mnt/project-files/engine/api/review.md`; thread "Engine API contract review".
