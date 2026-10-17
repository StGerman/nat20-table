# 0000. Record decisions as numbered decision records

- **Status:** Accepted
- **Date:** 2026-10-17
- **Decided by:** Stas asked for a decisions catalog with motivation, pros and cons (project chat, 2026-10-17); this format proposed by Claude

## Context

By 2026-10-17 the project had made about twenty decisions with real alternatives. Their reasoning was spread across `docs/design/system-design.md`, `docs/scope/demo-run-scope.md`, the decision list at the top of `contract/protocol.md`, a superseded contract draft, three research reports in the project folder, project memory and chat replies. No single place said what was decided, by whom, what was rejected and what would reopen it, so a decision could only be reviewed by re-reading the threads.

## Options

### A. One record per decision in the repo (`docs/decisions/`)
- Pro: versioned with the code it governs; reviewed in the same PR as the change.
- Pro: one file per decision keeps diffs small and lets a record be superseded without rewriting history.
- Con: one more file to write per decision.

### B. A single decisions log file
- Pro: one file to read.
- Con: grows without bound; every change touches the same file, so concurrent PRs conflict.

### C. Keep decisions in the design doc and threads
- Pro: no new artifact.
- Con: what we have today; rejected options and revisit triggers get lost.

## Decision

A: one Markdown record per decision under `docs/decisions/`, numbered, with status, date, who decided, context, options with pros and cons, decision, consequences and a revisit trigger. `README.md` is the index; `template.md` is the shape.

## Consequences

- CLAUDE.md Rule 8: a PR that makes or changes a decision with real alternatives adds or updates its record in the same PR.
- An accepted record is never rewritten to say something else. A changed decision gets a new record, and the old one is marked `Superseded by NNNN`. Typos, links and added evidence are fine to edit.
- Design docs keep the detail (spikes, tables); records summarise and link to them.

## Revisit when

The index stops being read, or records drift from the code. Then fold them back into the design doc.

## Sources

- Stas's question in the project chat, 2026-10-17 10:42Z.
