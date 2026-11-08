# 0065. A supply and tenders agent keeps the plan and its cost

- **Status:** Accepted
- **Date:** 2026-11-08
- **Decided by:** Stas (post-M11 backlog thread, persona doc "Supply and tender agent", 2026-11-08)

## Context

After Milestone 11, TASKS.md had 62 open rows of 294, about 35 of them partial rows from Milestones 2 to 7 whose PRs had merged weeks before. The live TASKS.md sat in the project files, outside review, and the roadmap doc still showed the 2026-11-01 order. Milestone 11 played three exit pairs to pass one; in pair 1 Stas played 39 minutes on a build whose all-AI half had already failed. The constraint on delivery is Stas's review hours, his evenings at the Mac and the Claude subscription limits, not dollars.

## Options

### A. No agent; the coordinator keeps the plan in memory
- Pro: nothing to build.
- Con: that is how the 35 stale rows happened; memory is not reviewed.

### B. GitHub issues instead of TASKS.md
- Pro: `Closes #N` closes a row by itself.
- Con: rows stop changing in the same PR as the code; GraphQL is refused here, so no Projects boards; every row id in decisions, PRs and memory changes convention.

### C. A read-only planning agent, like the dramaturg
- Pro: every change passes through the calling thread.
- Con: its output is the files themselves; an extra hop only adds drift.

### D. An agent that edits only its own planning files
- Pro: one owner for TASKS.md, `docs/tasks-done.md`, `docs/roadmap.md` and scope drafts; every change still reaches Stas as a PR diff.
- Con: the path limit is a rule, not a permission: cloud threads load no `.claude/` settings.

## Decision

D. Yan Metsuyan, supply and tenders (`.claude/agents/yan.md`, skill `/yan` with one reference file per subcommand). With it:

1. TASKS.md stays a file, moves into the repo (CON-1), and keeps only open rows and the milestone table; closed rows and the change log move unchanged to `docs/tasks-done.md`.
2. The roadmap lives in `docs/roadmap.md`, with a Delivery table whose first row is the Milestone 11 baseline.
3. The target is the same milestones twice as cheap and twice as fast, measured against that baseline at every milestone exit.
4. Stas plays his half of an exit pair only after the all-AI half on the same build has passed. This adds an order to the same-build pair of 0043; it does not change what the pair must pass.
5. The next milestone is M12 "Not a passenger" (Own move plus the readable-table findings); Yan drafts its scope, the implementing thread writes its system design.

## Consequences

- CLAUDE.md gains a short section for Yan. CON-1 and the M12 scope come next, each in its own PR.
- A PR that edits a planning file outside a sweep is still allowed; the next sweep reconciles it.

## Revisit when

A second person joins the project (issues may then pay for themselves), or two sweeps in a row find more than ten stale rows (the agent is not being run).

## Sources

- Post-M11 backlog thread, 2026-11-08; persona doc https://claude.ai/artifact/6u4gR36X7G7SFF4UeB4Me2.
- M11 exit analyses under the project's `engine/m11/runs/`.
