---
type: Task
id: CON-36
title: "A locked phone pauses the table, with no time limit"
pri: P1
dest: Ours
size: S
state: todo
---

Decision 0105 and the 4a brief §4 (step 6). When the relay drops in the middle of a call, the turn waits with no time limit (Stas, 2026-11-28: a locked phone is a pause, never an end). When a relay is back, every call with no `done` that was not cancelled is resent with the same id and body, and what the first attempt streamed is dropped. A dropped relay is never `offline` (`stopsTheRun`, `loop.ts:288`). A per-purpose timeout counts from the latest send. The game ends only by `quit`, by the server stopping, or by a `--time-limit-min` the run set. The page shows that the table waits for the phone. That line, and the one for a signed-out phone, go to Vera before Stas.

Depends on: CON-34, CON-35.

Check: a drop mid-call is resent on return and the turn completes; a cancelled call is not resent; no `offline` stop on a drop (new scope §4 row 14), each a test with no model; then Stas locks his phone mid-scene and the table goes on when he unlocks it (a person).

## Status

todo. Written 2026-11-28 from decision 0105.
