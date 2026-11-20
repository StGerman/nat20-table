---
type: Milestone
title: "Tech talk demo (2026-12-02)"
description: "A short, stable live demo for Stas's tech talk, a recorded fallback, a readable view of the roll audit, and a way for engineers in the room to play it without Rust"
state: open
---

# Exit criterion

Each row with its lowest layer (decision 0080):

1. A clean checkout with no Rust toolchain plays a scripted scene to its end screen, audit included, on the engine binaries of a GitHub Release: test, no model (CON-19, its CI job on macOS arm64)
2. `npm run audit:show <run>` prints each cited roll beside the engine's log entry for it, on a committed run fixture: test, no model (AGT-135)
3. A `--lang ru` run shows no English line on its end screen: test, no model (AGT-136); Vera reads the new lines: a person (fallback)
4. AGT-134 holds on Stas's Mac: in one traced `play:card` and one `play:unattended` run, no fresh session's second call writes more than 20k tokens to the cache: a live run, then a person
5. Three rehearsals of the stage segment (`play:card --card night_wolves --pack scenarios/fair_in_wend --roster allies --fight --rides tam --seat ink --lang ru`) and one recorded full run, on the stage SHA: a person
6. A dress rehearsal on 2026-12-01 on the stage machine and screen, with the recording ready offline: a person

# Tasks

CON-19, AGT-135, AGT-136. Rows 4 to 6 are Stas's at his Mac and have no task file.

# Status

open. List agreed by Stas 2026-11-19 21:39Z («Дил») in the thread "Pick tasks for the Dec 2 tech talk demo", on a tender by Yan: build PRs 30 to 36 USD, runs 24 to 30 USD, Stas about 4 h. AGT-119 went back to the backlog the same day: the loop asks after a night in a scripted walk, and the stage segment never reaches a morning prompt. Not in it: AGT-133, AGT-118, AGT-128, MAP-16, MAP-27, Камень A code, any core pin bump. The stage plays a named SHA; the core pin stays a17ac1f until after the talk. A DMG for people who never used Terminal is out: it waits on Anthropic's answer about sign-in (Friends and Family D1) and comes after the talk.
