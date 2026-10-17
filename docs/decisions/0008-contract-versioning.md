# 0008. Contract versioning: major in every request, `1.0.0-dev.N` until v1 ships

- **Status:** Accepted
- **Date:** 2026-10-16
- **Decided by:** proposed in the system design and contract v1 (nat20-table PR #2); Stas approved the design and merged the PR

## Context

Agents and the game loop depend on the wire. A silent change breaks agent prompts and tool schemas. But v1 was being built from scratch, with no consumers yet, and early mistakes needed fixing without ceremony.

## Options

### A. Strict semver from the first commit
- Pro: honest from day one.
- Con: every early fix becomes a major bump with a migration note, for consumers that don't exist.

### B. No versioning until the demo works
- Con: no protection once consumers exist; nothing records what broke.

### C. `v` (major) on every request, additive-only within a major, a pre-release `1.0.0-dev.N` that allows breaking changes, each listed
- Pro: freedom now, with every break still visible: `check-breaking` lists it and `CHANGELOG.md` records it.
- Pro: `hello` returns the schema sha256 and clients refuse to start on a mismatch, so a stale client fails loudly.

## Decision

C. Within a major: new commands, optional fields, event kinds and error reasons only; clients ignore unknown fields and kinds. Removing, renaming, requiring, narrowing or changing a meaning is a major bump with a migration note and a fixture. Until v1 is published, `CONTRACT_VERSION` is `1.0.0-dev.N` and breaks are allowed, each with its changelog line.

## Consequences

- CLAUDE.md Rule 2; CI job `contract-compat`.
- Never bypass the schema hash check.

## Revisit when

v1 is published (drop the `-dev` suffix; breaking changes then need v2), or a consumer outside our repo appears.

## Sources

- `docs/design/system-design.md` §5.2-5.3; `contract/CHANGELOG.md`.
