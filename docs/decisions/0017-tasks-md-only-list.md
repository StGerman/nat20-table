# 0017. TASKS.md is the only task list

- **Status:** Accepted
- **Date:** 2026-10-16
- **Decided by:** proposed in the system design and CLAUDE.md; Stas approved the design 2026-10-16

## Context

Work is done by Stas and many Claude sessions in parallel threads. Gaps were found in several places: the gap list, code reviews, research reports, TODO comments. Work tracked in several places drifts.

## Options

### A. GitHub issues
- Pro: native links to PRs.
- Con: one more system for sessions to query; not visible in the project folder; rows can't carry our Pri/Dest/Gate columns cleanly.

### B. One `TASKS.md` file, rows with id, Pri, Dest, Gate, Size, Status
- Pro: every session reads one file; changes are reviewed in the PR that closes the gap.
- Con: concurrent edits to one file can conflict.

### C. TODO comments in code
- Con: invisible to planning; no priority.

## Decision

B. No GitHub issues and no TODO comments without a row. Every PR that closes or creates a gap updates its row in the same PR; every deferred review finding gets a row. ID prefixes: API, ENG, MON, CHR, ITM, CHK, MAP, AGT, UPS, DAT, CON.

## Consequences

- CLAUDE.md Rule 8. Milestone status lives in TASKS.md § Milestones.
- Until CON-1 moves it, the live copy is `/mnt/project-files/engine/TASKS.md`.

## Revisit when

More humans join and need assignment, notifications or boards.

## Sources

- `docs/design/system-design.md`; CLAUDE.md Rule 8.
