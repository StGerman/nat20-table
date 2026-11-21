# Glass Table (the Mac app): scope

Status: Proposed; accepted on merge. Drafted 2026-11-21, main c1746be, from the system design `docs/design/glass-table-system-design.md` and Yan's plan of the same day (plan page in project files, `demo/glass-table-plan-yan-2026-11-21.md`; quoted in §7). No number until Stas gives one.
Ask: Stas, 2026-11-21 01:11Z, after the one-package answer: «Звучит отлично запланируй с Яном пожалуйста». Order: Stas, 2026-11-21 07:29Z, on the plan's card: Glass Table goes first, before «Камень A» (the plan recommended the other order; §7 gives what that costs).

## 1. Goal

Stas opens an app from the Dock, sees the Glass Table he picked, and plays a contract in it to the end, with every roll on screen in the engine log.

## 2. In

1. **Structured seat events.** The data the design §4.3 lists, beside today's formatted text. The terminal seat is unchanged.
2. **The seat wire and `WebSeat`.** Schemas with a hash, a WebSocket on 127.0.0.1, `seat.jsonl` in the run folder, resume by `seq`, a leak scan over `seat.jsonl`.
3. **The page.** The prototype's structure: story, dock in its forms, roll tokens and roll stage, «Где все», «Дорога», «Лист», «Люди», cards with votes, and the moments the prototype draws (reaction, the Narrator's question, surrender, night, level-up, falling to 0, a fallen companion).
4. **The lobby.** Adventure and character, Claude's sign-in state, start.
5. **The shell and the package.** One signed and notarised DMG with the shell, the compiled loop, the engine binaries and the content.
6. **A spike before any of it**, on Stas's Mac (§6).

## 3. Out

- A second model provider. "Sign in with ChatGPT" has its own Proposed design; a backlog row waits behind it.
- A native SwiftUI client (decision 0090, Revisit when).
- Continuing a stopped run. A host crash loses the game (design §7).
- Installing Claude Code for the player. Would Vera get through install alone? No, and this milestone does not change that; it waits on Anthropic's answer (Friends and Family D1).
- Lev's list beyond what the prototype draws: «Журнал», fight start and end, a trace of the player's own words, conditions on others, target pick, time limits, roads off the route. They become rows only when Stas picks them.
- New Russian lines for level-up choices: content the repo does not have. The app shows what the terminal seat shows.
- Removing or changing the terminal seat.

## 4. Exit criterion

Each row with its lowest layer (decision 0080):

1. The scripted scene shows the same lines at the Ink seat with structured events added: test, no model.
2. The scripted scene over the socket equals the in-process run, and resume by `seq` after a dropped socket loses no event: test, no model.
3. `seat.jsonl` holds no DM-view field or value (Rule 3): test, no model.
4. Replay of the scripted fixture and of one bench fight fixture on Playwright's WebKit project; every roll face equals the engine log (Rule 4): test, no model.
5. The DMG builds, is signed and notarised, and starts the bundled loop and server with no checkout, Rust or Node: CI on a hosted macOS arm64 runner (test, no model), then Stas installs it (a person).
6. Vera (fallback) reads the app's new lines (lobby, sign-in states, stop cards, card votes): a person.
7. One pair on one DMG (0043): the all-AI half from its bundled binaries, then Stas in the app, only after the AI half has passed (0065). Audit, leak scan, judge: a full run.

## 5. Reads already made

- **Lev** read the prototype against the evolution canvas and the terminal seat on 2026-11-20 (18 gaps and 8 the critic added; project file `demo/gui-glass-table-gaps-lev-2026-11-20.md`). Of his six P0 gaps the prototype's version 4 draws four (touchable names with what they remember, the dock's other states, something to do out of a fight, falling to 0); explanations are drawn in part; the player's own move typed into a void is not. He did not draft or read this system design: it carries no world, story or card mechanism. Decision 0069 as written asks for his `design` pass; whether an app milestone needs it is question 4.
- **Vera** read the prototype's screens three times (2026-11-20 twice, 2026-11-21; full answers in project files `demo/gui-glass-table-vera2-2026-11-20.md` and `demo/gui-glass-table-vera3-2026-11-21.md`). Verbatim, from the third read. What made her smile: "Первый: «Помнит: вы сами сели к её костру.» Приятно, что меня помнят." Where she became a passenger: "На четвёртом экране. Там «удач 1, неудач 2» и ни одной кнопки, я просто смотрю, как решается, умрёт ли мой герой." and "«Взять предложенное» и ничего другого, я нажала бы не думая." What follows for the build: a death save is the player's own roll with a button, and level-up needs lines before it is more than a frame. Exit row 6 reads the app's own lines again.
- **Zoya** was not run: no pack, scene or card changes. The one-line record about a people (the Corrins) that the «Люди» popover wants is her text and Stas's, question 5.

## 6. The spike

Before any app code: a Tauri window starts the Bun-compiled loop and `nat20-api-server` as bundled binaries, makes one live model call under the hardened runtime (with the JIT entitlement if it needs one), is signed and notarised, and is launched from Finder on Stas's Mac, where the app gets no shell `PATH` and still has to find Claude Code. The report says works or not, item by item. It merges no game code. If Tauri fails with the compiled loop, decision 0090 falls back to Electron before anything was built on it.

Needs from Stas: an Apple Developer account (99 USD a year; Apple's own review time is not ours to shorten) and one evening at the Mac, 60 to 90 minutes.

## 7. Cost and order (Yan's plan, 2026-11-21)

Calibrated on GitHub and nat20-runs: the Allies stack (20 PRs opened in 7.1 h, 46.5 h open to merge in one review session), M13, the tech-talk PRs, and the exit pairs of M13 (18.17 USD) and Allies (22.13 USD). Thread speed on new ground (Tauri, Playwright, signing) has no history here and is priced at 3 to 6 times the familiar rate; the spike replaces that guess.

| | Low | High |
|---|---|---|
| Calendar, the milestone's own work | 4 days | 9 days |
| Stas, review | 4.1 h | 5.1 h |
| Stas, at the Mac | 2.2 h | 4.2 h |
| Stas, total | 6.3 h | 7.9 h (9.2 h if he signs every build on his Mac) |
| Build | 148 USD | 205 USD |
| Runs | 21 USD | 26 USD (39 to 48 with one failed pair) |

The calendar is set by Stas's evenings, not by thread hours: acceptance of this PR (1 to 3 days), one review session for the stack (two evenings), the exit evening.

**Order.** Stas chose Glass Table first. From 2026-12-03, the day after the talk: Glass Table exits 12-07 to 12-12; «Камень A», Arachas and the Mill each move 4 to 9 days later; «Камень A»'s PR for the `escort_dismissed` line is then built for two seats (about 5 USD and 10 minutes of Stas more). Table #417 («Камень A» scope and design) stays open meanwhile.

**Risks, priced.**
1. The shell does not hold together. The spike finds it on day 1 for one evening; found in the package PR it would cost an evening, a redo and 1 to 3 days per try.
2. A failed exit pair: about 2 h of Stas, a day, 18 to 22 USD. A new UI fails most often in the human half.
3. Two seats: every later seat line is built twice until one seat is the default.

**Cut if the range is too long:** the lenses and inspectors (the largest PR, with no live gate of its own) can move to a later row. The cards with votes stay, because the exit plays them.

## 8. Rows

Written in their own PR after this scope and the design merge (ids taken then): the spike (CON, S), structured seat events (AGT, M), the seat wire (AGT, M), page 1 (AGT, M), page 2 (AGT, M), the lobby (AGT, S), the shell and package (CON, M), the exit run record (AGT, S), and one backlog row for a second provider (AGT, P2). All P1 but the last; all `dest: Ours`. `docs/roadmap.md` is as of 2026-11-11 and owes a pass before the rows are written.

## 9. Questions for Stas

1. Accept the design and decision 0090 (a web page in a Tauri shell, our JSON seat wire)? Merging this PR is the yes.
2. Signing: in the release workflow on a hosted macOS runner, with the Developer ID and notary key as repository secrets, or on your Mac for each build? The workflow saves up to 1.3 h per signed build. Recommended: the workflow.
3. The lobby with Claude only, and a second provider as a backlog row behind its own design? Recommended: yes.
4. An amendment: a milestone whose design carries no world, story or card mechanism (an app, a package, CI) takes its system design from the implementing thread without Lev's `design` pass; Zoya's board and Vera's read still apply to its player-facing lines. Recommended: yes. If no, Lev reads this design before the rows are written.
5. From the prototype, each a few words: one line that says why, or silence, when a spent move leaves the dock (Vera had to guess; recommended: the line); a one-line player-visible record about the Corrins (Zoya writes it, you approve); portraits or initials for the valley's people.
6. "The same build" for this milestone means the same signed DMG, and the AI half runs from its binaries (exit row 7). Recommended: yes.
