---
type: Milestone
title: "Sign in with ChatGPT (the table moves to ChatGPT)"
description: "The table runs on ChatGPT only: a player signs in with their own ChatGPT plan and plays a game on it, the Narrator on gpt-6.1-terra, an all-AI game within half a Plus five-hour window; no number until Stas gives one"
state: open
---

# Exit criterion

Scope `docs/scope/sign-in-with-chatgpt-scope.md` §4, each row with its lowest layer (decision 0080):

1. Sign-in against a recorded fake auth server: host id kept across sign-ins, refresh with rotation, `invalid_grant`, sign-out revokes, token file at 0600: test, no model (AGT-148)
2. The scripted scene on `ResponsesSession` from a recorded stream shows the same lines as the scripted scene before the switch: test, no model (AGT-149)
3. Limit, eligibility and failed-refresh errors reach the seat as stops; a 401 refreshes and retries first; a 503 retries: test, no model (AGT-149)
4. Card bench on terra against two recorded Claude benches: at least 10 cards, judge (on Claude) within the Claude benches' spread, fewer than 1 in 10 narrations hedge: a live run smaller than the exit run (AGT-150)
5. Vera (fallback) reads the lobby's ChatGPT lines and stops: a person (AGT-147)
6. Bench run on Langfuse `staging` prompts and a run on the pulled files trace the same prompt version: a live run smaller than the exit run (AGT-152)
7. One pair on one build (0043), the DMG, both halves on terra, all-AI half from a fresh window within 50% of it, read after the run: a full run (AGT-151)
8. A second game in one server process after one ended by scene 6 and one by a stop: test, no model (CON-32)
9. Two windows in the lobby both get it, neither is replaced before `start`; account messages only from loopback: test, no model (CON-32)
10. Every lobby state and stop card from a fake adapter; «Go on» puts the party where its card said: test, no model (AGT-147)
11. A closed Mac window sends nothing; Cmd-Q sends `quit` before the server ends: test on the macOS runner, no model (CON-32)
12. Phone token and port across a restart, Bonjour only while on, no seat without a confirmed code: test, no model; the iPhone finds Stas's Mac with no address: a person (CON-33)
13. The DMG starts the server with no checkout, Rust or Node: CI, no model; Stas installs it, signs in, plays a scripted scene: a person (CON-20, CON-21)

# Tasks

In order (sign-in design §10, accepted with table #515 on 2026-11-28; decision 0100): CON-20 first (the biggest risk, Stas's evening at the Mac); AGT-148, the first half of AGT-150 (the Claude benches, with AGT-141's bench fixture), AGT-152 and AGT-149 side by side, AGT-149 only after the Claude benches; then CON-32 and CON-33, then AGT-147; the terra half of AGT-150; CON-21; AGT-151 last. AGT-141 closes with CON-32 and AGT-150. AGT-144 folded into AGT-147 (wont-do). Decision 0091 (a full switch: Stas, 2026-11-21 11:08Z).

# Status

open, no number. Rows written 2026-11-21 on main d63e333. Starts right after Glass Table (Stas, 2026-11-21 08:34Z). Design accepted by Stas 2026-11-21 10:59Z, with the Narrator on terra. Spike done on Stas's Mac 2026-11-21 (sign-in, models, tool call, plan use, five narration draws per model; design section "Spike result").

2026-11-28: amended for decisions 0099 (Glass Table closed, its lobby, Mac report and DMG moved here) and 0100 (the table server apart from its windows, the phone finds it over Bonjour), from `docs/design/sign-in-with-chatgpt-system-design.md`. An application for hosted SIWC goes to OpenAI beside this milestone (Stas); a hosted server is its own milestone after the answer.
