# 0037. Core PRs into the fork's `demo` keep `docs/PROGRESS.md` current

- **Status:** Accepted
- **Date:** 2026-10-27
- **Decided by:** Stas, in the project chat (picked option (a), limited to core). Supersedes the PROGRESS.md part of [0023](0023-long-lived-fork.md) (Consequences, "The maintainer's-style requirements that only served review are gone: PROGRESS.md rows ...").

## Context

`docs/PROGRESS.md` in `nat20_core` is the maintainer's SRD 5.2.1 coverage tracker: one table per SRD section, each row a feature with links to its registry files and tests, plus notes on what is missing. He updates it by hand with each feature commit. Decision 0023 dropped the PROGRESS.md row from our core checklist, because it seemed to serve only upstream review.

Checked 2026-10-27: the file is identical on upstream `main`, upstream `save-to-file` and fork `main`. On `demo` it was edited once (the Help action, core #7) and not for any later core PR up to core #56, so it understated what `demo` implements, and some of its test links pointed at the wrong lines. nat20-table has no equivalent: TASKS.md tracks work, not SRD coverage.

## Options

### A. Every core PR into `demo` that adds or changes a rules feature updates its PROGRESS.md row
- Pro: one place shows which SRD rules `demo` implements, with the tests that prove them.
- Pro: keeps `demo` in the maintainer's pattern, so a sync-upstream merge sees our rows next to his.
- Con: some overlap with TASKS.md rows.
- Con: his tables are column-padded, so a changed row re-pads its table, and a sync that touches the same table conflicts.

### B. Leave the file as upstream's, changed only by syncs
- Pro: no extra work per PR, and no conflicts in the file.
- Con: the file stays wrong about `demo`.

## Decision

A, for core only. Rows follow his format; content that exists only for our adventure (the table repo's `nat20_demo::` overlay) gets no row, and nat20-table gets no copy of the file. A new section is added only when a feature has no home, in his table layout and SRD chapter order.

## Consequences

- CLAUDE.md Rule 6 adds the PROGRESS.md row to the maintainer's patterns a core PR keeps.
- core #58 backfills the rows for every rules feature merged into `demo` before this decision.
- A sync-upstream PR that conflicts in the file takes his table and re-adds our cells.

## Revisit when

- Syncs keep conflicting in PROGRESS.md and each costs more than the file is worth.
- The maintainer changes or drops the file upstream.

## Sources

- Fork `StGerman/nat20`, `docs/PROGRESS.md` on `demo`; core #58.
- Decision [0023](0023-long-lived-fork.md).
