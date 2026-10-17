# 0002. Keep the fork equal to upstream and put our code in nat20-table

- **Status:** Accepted (amended by [0020](0020-send-u1-u2-upstream-early.md): U1 and U2 go upstream before Milestone 8)
- **Date:** 2026-10-16
- **Decided by:** Stas asked for a clean upstream/ours split with "super minimal" upstream changes; layout proposed in the system design, approved by Stas 2026-10-16; repo named and created by Stas

## Context

Milestone 1 put a `server/` crate on the fork's `demo` branch. Stas wanted the API as its own Cargo package and upstream changes kept super minimal. Milestone 1's server needed no change to `core/`, so core's public surface already carries a headless API.

## Options

### A. `server/` crate inside the fork's workspace
- Pro: one repo.
- Con: every upstream refactor conflicts with our workspace edits; the maintainer has no headless API and may never want ours.

### B. Separate Cargo workspace inside the fork
- Pro: zero diff on `main`.
- Con: the fork's branches still carry non-upstream code; a mixed-purpose repo.

### C. Separate repo (`StGerman/nat20-table`), `nat20_core` as a git dependency pinned by rev
- Pro: zero upstream diff; only the adapter module feels core churn; core bumps are explicit PRs.
- Con: a core fix needs a push to the fork, then a rev bump here.
- Con: Cargo ignores a dependency's `[patch]`, so we copy upstream's `polyanya` patch.

## Decision

C. The fork's `main` equals upstream; `demo` is upstream `main` plus one-item upstream branches; everything else (contract, server, game, content, CLAUDE.md) lives in nat20-table. Upstream items are built in the fork now and proposed at Milestone 8, after the demo gaps close.

## Consequences

- CLAUDE.md Rules 5 and 6. Only `crates/nat20-api-server/src/adapter/` may `use nat20_core`.
- Four small upstream code items (U1 registry root, U2 seedable dice, U3 fractional CR, U4 short rest Hit Point Dice); everything else upstream is content in his JSON format; the monster format starts as an upstream issue.
- Upstream items never carry API vocabulary (session, viewer, roll id, AI).

## Revisit when

Upstream adopts a headless API of its own, or a second consumer outside our repo needs the contract as a published package.

## Sources

- `docs/design/system-design.md` §0, §3, §6, §7.
- Thread "System decomposition and dev process".
