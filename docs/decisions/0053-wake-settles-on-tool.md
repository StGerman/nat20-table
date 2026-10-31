# 0053. A model wake ends for the table at its settling tool, not at the SDK's result

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** Stas, approving the Milestone 10 system design (§3.2, trade-off T1) and starting its implementation with /goal on 2026-10-31

## Context

`AgentSession.turn()` resolved only on the SDK's `result` message. A DM narration is two model calls: the one that emits the `narrate` tool use (about 3 s to first token, M6 measurements) and a closing call after the tool answers. The loop waited for both. In run 18-45-48 all five DM timeouts (12 s) cut wakes whose narration had already reached the table, and DM narration p95 was 10.0 s against the 6 s target of acceptance criterion 4.

## Options

### A. Settle at a named tool, drain in the background
`SessionConfig.settleOn` names, per wake purpose, the tools whose successful call ends the turn for the caller; the SDK turn finishes on its own.
- Pro: removes the closing call from what the table waits for, and the timeout class of run 18-45.
- Pro: usage stays complete: the record is written when the drain ends.
- Con: the next wake of the same agent queues behind the drain (Claude Code runs one turn at a time); a drain longer than the turn's limit is cut.

### B. A prompt rule: "do not reply after narrate"
- Pro: no code.
- Con: the model still makes the closing call to end its turn; a prompt rule already failed for invented movement (run 18-45).

### C. A shorter timeout
- Con: cuts narrations that are late for good reasons, and counts them as fallbacks.

## Decision

A. A wake settles at its settling tool when it succeeds. For the DM, `narrate` settles the `narrate` and `combat_over` wakes. `scene_open`, `table_turn` and `summary` keep waiting for the result, because they go on with tools after narrating. Decision 0041's rule (engine lines wait for the narration on screen) stands: the narration is shown when the tool runs, as before.

## Consequences

- `usage.jsonl` records of settled turns carry `settled_early: true` and `waited_ms` (what the table waited); `wall_ms` runs to the drain's end. A drain cut at the turn's limit is `outcome: "drained"`, never `timeout`, and is no fallback.
- The run report and the verdict's latency row use `waited_ms` when present.
- A tool call from a draining turn gets "not now" (`settling`), so it never acts in the next wake.
- A guard-refused `narrate` does not settle: the DM rewrites under the normal timeout.
- AI players' combat turns settle on `end_turn` from AGT-63 on.
- Row AGT-62.

## Revisit when

The Agent SDK offers a "stop after this tool" option, or the DM runs monster turns (AGT-23) and needs `end_turn` in its settle set.

## Sources

- Milestone 10 system design §2.2, §3.2, §5 T1 (`docs/design/m10-system-design.md`).
- Milestone 10 spec, "Where time goes today" (`docs/design/m10-spec.md`).
