---
type: Milestone
number: 13
title: "Dramaturg mechanism"
description: "Dramaturg mechanism (Milestone 13): a scene writes a deed and the next quest reads it"
state: done
---

# Exit criterion

One pair on one build, AI half first (0043, 0065, 0066): run 1 *The Silent Mill*, `play:unattended`, all AI, a new roster; run 2, only after run 1 has passed with its flags ruled, *Fair in Wend* on that roster, `play:demo`, Stas as a Hired Blade, in the run language M12's exit used. A fail in run 1: fix, new build, run 1 again; a fail in run 2: both again. Each run passes the rows that still apply (run 1: Demo Run rows 1 to 3 and 5; run 2: M11 §8.3 rows 1 to 3, row 4's narration judge half, `m11-memory`, `m12-order`, `m12-language`) and: `m13-written` (run 1: at least two `deed_remembered` events in Mill scenes, each with `by`, day and contract, one of them `snitt_yielded` or `yard_to_the_end`; the roster saved); `m13-carried` (run 2: a Wendford arrival card reading an outcome deed run 1 wrote is decided by the Blades, not a fallback, its choice writes its deed, the judge answers yes to "does the DM name what the party did at the mill" and flags no contradiction); `m13-readable` (run 2: the Vera fallback and Zoya read the card with its narration as the seat showed it, quoted verbatim). Checked by CI: §4.2 rule 7's seeded Wendford draw, rule 8's validator across packs. Reported, not gated: p95, every deed written and read, the answer deed as "written, unread", `m12-own-move` (design §8, scope §4)

# Tasks

In the PR order of design §10: API-57, ENG-44, MAP-20 (after Zoya's bible PR, amendment 3, which has no row), AGT-104. Beside it, outside its exit and PR count, moved to `tasks/backlog/` at the close (2026-11-16): ENG-45; MAP-13 (after API-57); deed from words AGT-110, MAP-21 (decision 0071); the card bench AGT-123, AGT-124 and its trial AGT-125 (decision 0084), read at the close sweep. Scope `docs/scope/dramaturg-mechanism-scope.md` (table #348), system design `docs/design/m13-system-design.md` (table #375), decision 0075. No code or content PR merges before M12's exit pair has passed on its build (0043, scope amendment 1)

# Status

done 2026-11-16: the exit pair passed on one build, b7e737d (table #416's head). Run 1 `full-2026-11-16T19-42-17-081Z`, *The Silent Mill*, all AI, new roster: PASS, `m13-written` held. Run 2 `full-2026-11-16T20-25-56-767Z`, *Fair in Wend*, Stas as a Hired Blade: PASS, `m13-carried` and `m13-readable` held. Stas ruled «Зачесть» 2026-11-16; rulings in nat20-runs #7. Still owed, outside this exit: readers for the answer deeds, `mill_goblin_taken_alive` not yet played live, and MAP-27 (Osric's mill card). Earlier: scope accepted (table #348); system design and its seven §12 items accepted (table #375, 2026-11-13); rows written 2026-11-13 (table #378)
