---
type: Milestone
title: "Sign in with ChatGPT (the table moves to ChatGPT)"
description: "The table runs on ChatGPT only: a player signs in with their own ChatGPT plan and plays a game on it, the Narrator on gpt-6.1-terra, an all-AI game within half a Plus five-hour window; no number until Stas gives one"
state: open
---

# Exit criterion

Scope `docs/scope/sign-in-with-chatgpt-scope.md` §4, each row with its lowest layer (decision 0080):

1. Sign-in in the iPhone app against a recorded fake auth server: host id kept across sign-ins, refresh with rotation, `invalid_grant`, sign-out revokes, tokens in the Keychain, never on the server: Swift test, no model (AGT-148)
2. The scripted scene on `ResponsesSession` from a recorded stream shows the same lines as the scripted scene before the switch: test, no model (AGT-149)
3. Limit, eligibility and failed-refresh errors reach the seat as stops; a 401 refreshes and retries first; a 503 retries: test, no model (AGT-149)
4. Card bench on terra against two recorded Claude benches: at least 10 cards, judge (on Claude) within the Claude benches' spread, fewer than 1 in 10 narrations hedge: a live run smaller than the exit run (AGT-150)
5. Vera (fallback) reads the lobby's ChatGPT lines and stops: a person (AGT-147)
6. Bench run on Langfuse `staging` prompts and a run on the pulled files trace the same prompt version: a live run smaller than the exit run (AGT-152)
7. One pair on one build (0043), both halves on terra: the all-AI half on `DirectTransport` from a fresh window within 50% of it, then Stas from the iPhone as seat and relay; the DMG if CON-21 is taken up by then: a full run (AGT-151)
8. A second game in one server process after one ended by scene 6 and one by a stop: test, no model (CON-32)
9. Two windows in the lobby both get it, neither is replaced before `start`: test, no model (CON-32)
10. Every lobby state and stop card from a fake adapter; «Go on» puts the party where its card said: test, no model (AGT-147)
11. A closed Mac window sends nothing; Cmd-Q sends `quit` before the server ends: test on the macOS runner, no model (CON-32, in the nat20-app Mac target, CON-39)
12. Phone token and port across a restart, Bonjour only while on, no seat without a confirmed code: test, no model; the iPhone finds Stas's Mac with no address: a person (CON-33)
13. The DMG starts the server with no checkout, Rust or Node: CI, no model; Stas installs it, signs in, plays a scripted scene: a person (CON-21, after CON-37)
14. A dropped relay waits with no time limit and resends on return, a cancelled call is not resent, never `offline` on a drop: test, no model (CON-36)
15. The seat token and a browser `Origin` get no `call` on `/relay`: test, no model (CON-34)
16. No token in the run folder, the server's logs or its environment: test, no model (CON-34)
17. The Mill's scenes 1 and 3 from the iPhone as seat and relay, the server with no token, the Mac app not running, a locked phone pauses: a person (CON-37)

# Tasks

From 2026-11-28 (decision 0105, variant 4a; StGerman/nat20-app `docs/brief.md` §7): AGT-149 with its transport seam (after the Claude benches of AGT-150, as before), then CON-34, then AGT-148 and CON-35 in nat20-app, then CON-36, then CON-37 (the 4a exit from the iPhone), then CON-38 (cleanup) and CON-39 (the Mac target). CON-32, CON-33, AGT-147, CON-21 and AGT-151 follow, with CON-21's question (who starts the server for a player with no Terminal) answered after CON-37. CON-20 is closed (wont-do). The order below is the one before 0105, kept for its history.

In order (sign-in design §10, accepted with table #515 on 2026-11-28; decision 0100): CON-20 first (the biggest risk, Stas's evening at the Mac); AGT-148, the first half of AGT-150 (the Claude benches, with AGT-141's bench fixture), AGT-152 and AGT-149 side by side, AGT-149 only after the Claude benches; then CON-32 and CON-33, then AGT-147; the terra half of AGT-150; CON-21; AGT-151 last. AGT-141 closes with CON-32 and AGT-150. AGT-144 folded into AGT-147 (wont-do). Decision 0091 (a full switch: Stas, 2026-11-21 11:08Z).

# Status

open, no number. Rows written 2026-11-21 on main d63e333. Starts right after Glass Table (Stas, 2026-11-21 08:34Z). Design accepted by Stas 2026-11-21 10:59Z, with the Narrator on terra. Spike done on Stas's Mac 2026-11-21 (sign-in, models, tool call, plan use, five narration draws per model; design section "Spike result").

2026-11-28: amended for decisions 0099 (Glass Table closed, its lobby, Mac report and DMG moved here) and 0100 (the table server apart from its windows, the phone finds it over Bonjour), from `docs/design/sign-in-with-chatgpt-system-design.md`. An application for hosted SIWC goes to OpenAI beside this milestone (Stas); a hosted server is its own milestone after the answer.

2026-11-28: amended for decision 0105 (table #521, merged by Stas): the player's device signs in and carries each model call, and the server holds no token. AGT-148 is rewritten for the iPhone app; AGT-149 gains the transport seam; CON-34 to CON-39 are new; CON-20 is wont-do; CON-21, CON-32, CON-33 and AGT-151 carry notes. Scope §2 and §4 are amended to match (rows 1, 7, 9, 11 and 13 changed, rows 14 to 17 new).
