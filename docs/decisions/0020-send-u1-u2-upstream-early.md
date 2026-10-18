# 0020. Send the engine-plumbing items U1 and U2 upstream now, not at Milestone 8

- **Status:** Superseded by [0023](0023-long-lived-fork.md) (upstream closed both PRs and the issue on 2026-10-18)
- **Date:** 2026-10-17
- **Decided by:** Stas, on a decision card in the project chat after asking for next steps (2026-10-17). Amends [0002](0002-fork-and-own-repo.md), which held every upstream PR until Milestone 8.

## Context

[0002](0002-fork-and-own-repo.md) and CLAUDE.md Rule 6 said to build upstream items in the fork now and propose them only at Milestone 8, after our demo gaps close. Two of the four code items are pure plumbing that any user of the engine benefits from and that carry none of our vocabulary:

- U1: the registry root from `NAT20_REGISTRY_ROOT`, finishing the maintainer's own `// TODO: Make this configurable?` on `REGISTRY_ROOT`.
- U2: seedable dice (`components::rng`), which also needed initiative rolled in a fixed order: core rolled it in `HashSet` order, so a seeded fight still changed between runs.

Both are a few dozen lines with a test each and no registry or schema change. The monster stat-block format is a design question for the maintainer, so it starts as an issue either way (Rule 6).

## Options

### A. Wait for Milestone 8 (the rule as written)
- Pro: one batch of PRs, after our needs are fully known.
- Con: small, uncontroversial changes sit on the fork for weeks and drift from upstream `main`.
- Con: the maintainer hears about us only when a large batch lands.

### B. Send U1, U2 and the monster-format issue now; everything else waits for Milestone 8
- Pro: the two smallest, most obviously useful items get reviewed while they still apply cleanly.
- Pro: the monster-format question gets an answer before we build Milestone 5 against our own format.
- Pro: the maintainer sees the style of our contributions early.
- Con: if he rejects or reshapes them, the fork carries them longer and our pin follows his version.

### C. Send every built item now
- Pro: fastest feedback.
- Con: content items (Leather Armor, the shield stopgap) are not upstream-ready; the stopgap must go first (UPS-5).

## Decision

B. U1 and U2 go upstream now as two one-item PRs from their fork branches (`upstream/registry-root-env`, `upstream/seedable-dice`), with the monster-format issue alongside. Every other upstream item still waits for Milestone 8. Our work never waits on these PRs: `demo` carries both and nat20-table pins `demo`.

## Consequences

- CLAUDE.md Rule 6 names U1 and U2 as the exception to "close our demo gaps before proposing anything upstream".
- If upstream merges a different version, the next pin bump moves to it and our adapter adapts; `demo` drops our branch.
- API-11 is served: `new_session.seed` replays a session exactly, and the Milestone 1 duel is a seeded fixture (`contract/fixtures/duel.jsonl`).
- U1 lets API-18 (runtime data paths) and our registry overlay drop the build-time path for core's registries.

## Revisit when

The maintainer asks for a different shape or batching, or rejects either PR; or another item turns out to be as small and self-contained (U3 fractional CR is the likely next one).

## Sources

- `docs/design/system-design.md` §6 (U1, U2) and §7 (S5).
- Fork branches `upstream/registry-root-env` and `upstream/seedable-dice` on StGerman/nat20; PR and issue texts in the project files at `engine/upstream/`.
- Project thread "Upstream U1/U2 and Milestone 2".
