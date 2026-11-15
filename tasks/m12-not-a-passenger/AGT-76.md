---
type: Task
id: AGT-76
title: "Five Ink seat tests"
pri: P2
dest: Ours
size: S
state: partial
area: "8. Agents, game loop, interface (all new)"
---

Five Ink seat tests (4 in `panel.test.ts`, 1 in `ui.test.ts`) time out or see a partial frame on Stas's Mac in the full `check:ts` run (2026-10-31, Node 26.3.1). They pass in CI and in a cloud session on the same Node. Find the cause under load; don't raise the waits blindly

## Status

(Milestone 12, table #358): the seat tests wait on one frame-predicate helper (`game/test/until.ts`, 15 s cap, the last frame on a timeout) instead of five local 3 s loops; not reproduced in a cloud session under CPU load (two full `check:ts` runs with 10 busy processes, green). Done when the full `check:ts` is green on Stas's Mac (design §7)
