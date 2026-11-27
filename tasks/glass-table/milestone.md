---
type: Milestone
title: "Glass Table (the Mac app)"
description: "Stas opens an app from the Dock, sees the Glass Table, and plays a contract in it to the end, with every roll on screen in the engine log; no number until Stas gives one"
state: closed
---

# Exit criterion

Scope `docs/scope/glass-table-scope.md` §4, each row with its lowest layer (decision 0080):

1. The scripted scene shows the same lines at the Ink seat with structured events added: test, no model (AGT-140)
2. The scripted scene over the socket equals the in-process run, and resume by `seq` after a dropped socket loses no event: test, no model (AGT-141)
3. `seat-wire.jsonl` holds no DM-view field or value (Rule 3): test, no model (AGT-141)
4. Replay of the scripted fixture and of one bench fight fixture on Playwright's WebKit project; every roll face equals the engine log (Rule 4): test, no model (AGT-142, AGT-143)
5. A scripted living-world stretch on a recorded saved party shows a card with its votes, a name token and a person's «Помнит» on the page; every `HumanPrompt` kind puts up its dock form; the page's drawn text at each `seq` contains each `seat.jsonl` line and passes the language scan: test, no model (AGT-142, AGT-143)
6. The DMG builds, is signed and notarised, and starts the bundled loop and server with no checkout, Rust or Node: CI on a hosted macOS arm64 runner (test, no model), then Stas installs it (a person) (the Swift Mac app, decision 0093: CON-20, CON-23, CON-21)
7. Vera (fallback) reads the app's new lines (lobby, sign-in states, stop cards, card votes, the death save, level-up, the shell's own lines): a person (AGT-143, AGT-144, AGT-146, CON-22; recorded in AGT-145)
8. One pair on one DMG (0043): the all-AI half from its bundled binaries, then Stas in the app, only after the AI half has passed (0065). Audit, leak scan, judge: a full run (AGT-145)
9. Stas plays *The Silent Mill*, Scene 1 to 6, on his iPhone over Wi-Fi at a table his Mac hosts: a person (AGT-155)

# Tasks

Done: AGT-140, AGT-142, API-63, AGT-146. In order from here, SwiftUI shell design §4 (decision 0093, table #482):

1. AGT-155 half 1 (ten minutes on Stas's iPhone over Wi-Fi). Planned on the spike branch, table #480, before the next three; they landed first, so it runs on the shell in `shell/`.
2. AGT-153 (page native mode) and AGT-154 (seat on the home network), side by side.
3. CON-22 (the iPhone shell and its CI job), on both.
4. AGT-155 half 2 (*The Silent Mill* on the iPhone, exit row 9), on CON-22.
5. CON-23 (the Mac shell), on CON-22; then CON-20 (the Mac app starts the table, Stas's report); then CON-21 (the DMG); then AGT-145 (the exit pair).

Beside the stack: CON-25 (the Mac's wide window as an open book; Stas's pick, 2026-11-25), CON-26 (the picture of the place on its right page, pulled forward from the picture-book milestone by Stas's pick of 2026-11-25, and placeholders that name what is not drawn), CON-27 (the same picture in the story, where a phone and a narrow window have no right page, and a person's face on their card; Stas's pick, 2026-11-25), AGT-141's two open items (the lobby requests with AGT-144; the bench fight fixture), AGT-143 (the moments, the road lens), AGT-144 (the lobby). Not in this exit: AGT-147 (the lobby on ChatGPT, which replaces this milestone's Claude lobby), in the Sign in with ChatGPT milestone (`tasks/sign-in-with-chatgpt/`). Scope and design: table #459 (merged 2026-11-21 08:31Z), `docs/design/glass-table-system-design.md` (§11 the PR order), decision 0090; the shell: `docs/design/swiftui-shell-design.md`, decision 0093.

# Status

closed 2026-11-28 by Stas without passing its exit (decision 0099; his words, 2026-11-27 23:22Z: «Я уже играл в Мельницу на iPhone, закрываем сейчас и пошли делать Sign-in + лобби»). Exit rows 1 to 3 are met by tests; row 9 on his word, with no run id recorded; rows 4 and 5 in part; rows 6 and 8 not at all (no DMG, no pair); row 7 in part (Vera read the level-up lines, AGT-146, and the shell's lines, CON-22; there is no lobby or stop card to read). What was open moved: AGT-144, AGT-141, CON-20 and CON-21 to Sign in with ChatGPT; CON-26 and CON-27 to People and places registries; AGT-143 to the backlog; AGT-145 is wont-do. The lines below are the status as it stood before the close.

Was: open, no number (scope header: "No number until Stas gives one"; `number` is left out of the front matter, so `npm run tasks` lists it after the numbered milestones). Rows written 2026-11-21 on main 6c5e205; Stas said go 2026-11-21 09:26Z. Order: Stas, 2026-11-21 07:29Z: Glass Table first, before «Камень A».

On main f41289e, 2026-11-23: done AGT-140 (table #463), AGT-142 (tables #469, #470, #471, #473, #474, #475), API-63 (table #466), AGT-146 (table #468). Partial: AGT-141 (table #464; left the lobby requests and the bench fight fixture), AGT-143 (tables #472, #476; tables #477 and #479 open since 2026-11-21, in transit). Todo: AGT-144, AGT-145, CON-20, CON-21, and the shell rows AGT-153, AGT-154, CON-22, CON-23, AGT-155 written 2026-11-23.

The shell is SwiftUI over the page on the iPhone and the Mac, Tauri dropped (Stas, card 2026-11-22 23:35Z; decision 0093 and its design merged by Stas in table #482, 2026-11-23T19:14:50Z). His merge is his yes to the design's §8: the iPhone work sits inside this milestone (exit row 9); «Встать из-за стола» on the phone leaves the table running; no row for the paid Apple Developer account for other phones until he says who else plays. The account still gates CON-21 (the signed Mac app). The Tauri harness of table #462 was never run on his Mac; CON-20 says what becomes of it. Stas's goal: *The Silent Mill* on his iPhone on the weekend of 2026-11-28/29.

Estimate (scope §7, before the shell changed): 4 to 9 days, Stas 6.3 to 7.9 h, build 148 to 205 USD, runs 21 to 26 USD (39 to 48 with one failed pair). The iPhone rows add, through exit row 9: thread 9 to 18 h, Stas 4.5 to 6 h (review 1.5 to 2.5 h, the ten-minute half 0.5 to 0.75 h, the Mill 2 to 2.5 h), no exit-pair cost. CON-23 and CON-20 replace the Tauri spike and shell at about the same size.
