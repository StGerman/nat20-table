---
type: Milestone
title: "Glass Table (the Mac app)"
description: "Stas opens an app from the Dock, sees the Glass Table, and plays a contract in it to the end, with every roll on screen in the engine log; no number until Stas gives one"
state: open
---

# Exit criterion

Scope `docs/scope/glass-table-scope.md` §4, each row with its lowest layer (decision 0080):

1. The scripted scene shows the same lines at the Ink seat with structured events added: test, no model (AGT-140)
2. The scripted scene over the socket equals the in-process run, and resume by `seq` after a dropped socket loses no event: test, no model (AGT-141)
3. `seat-wire.jsonl` holds no DM-view field or value (Rule 3): test, no model (AGT-141)
4. Replay of the scripted fixture and of one bench fight fixture on Playwright's WebKit project; every roll face equals the engine log (Rule 4): test, no model (AGT-142, AGT-143)
5. A scripted living-world stretch on a recorded saved party shows a card with its votes, a name token and a person's «Помнит» on the page; every `HumanPrompt` kind puts up its dock form; the page's drawn text at each `seq` contains each `seat.jsonl` line and passes the language scan: test, no model (AGT-142, AGT-143)
6. The DMG builds, is signed and notarised, and starts the bundled loop and server with no checkout, Rust or Node: CI on a hosted macOS arm64 runner (test, no model), then Stas installs it (a person) (CON-21)
7. Vera (fallback) reads the app's new lines (lobby, sign-in states, stop cards, card votes, the death save, level-up): a person (AGT-143, AGT-144, AGT-146; recorded in AGT-145)
8. One pair on one DMG (0043): the all-AI half from its bundled binaries, then Stas in the app, only after the AI half has passed (0065). Audit, leak scan, judge: a full run (AGT-145)

# Tasks

In order: CON-20 (spike), AGT-140, AGT-141, AGT-142, AGT-143, AGT-144 (beside AGT-142 and AGT-143), CON-21, AGT-145. Beside the stack, after the spike: API-63 (the Corrins' line, a contract change under Rule 1), AGT-146 (level-up lines). Backlog, not in this exit: AGT-147 (a second provider). Scope and design: table #459 (merged 2026-11-21 08:31Z), `docs/design/glass-table-system-design.md` (§11 the PR order), decision 0090.

# Status

open, no number (scope header: "No number until Stas gives one"; `number` is left out of the front matter, so `npm run tasks` lists it after the numbered milestones). Rows written 2026-11-21 on main 6c5e205. Order: Stas, 2026-11-21 07:29Z: Glass Table first, before «Камень A». Stas said go on 2026-11-21 09:26Z («goal is to implement the glass table scope»). The spike (CON-20) waits on Stas's Apple Developer account (99 USD a year; Apple's review time is not ours) for its signed and notarised half, and on one evening at his Mac, 60 to 90 min; its ad-hoc half needs no account. Estimate (scope §7): 4 to 9 days, Stas 6.3 to 7.9 h, build 148 to 205 USD, runs 21 to 26 USD (39 to 48 with one failed pair).
