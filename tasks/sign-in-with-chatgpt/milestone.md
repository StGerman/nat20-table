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
7. One pair on one build (0043), both halves on terra, all-AI half from a fresh window within 50% of it, read after the run: a full run (AGT-151)

# Tasks

In order: AGT-148, AGT-149 and AGT-152 (side by side), then AGT-150; AGT-147 once AGT-144 and AGT-148 are done; AGT-151 last. Moved in from Glass Table when it closed (decision 0099, 2026-11-28), not yet in the scope or the order: AGT-144 (the lobby), AGT-141's two open items, CON-20 (the report from Stas's Mac) and CON-21 (the signed DMG); the scope amendment and the design place them. Decision 0091 (a full switch: Stas, 2026-11-21 11:08Z).

# Status

open, no number. Rows written 2026-11-21 on main d63e333. Starts right after Glass Table (Stas, 2026-11-21 08:34Z). Design accepted by Stas 2026-11-21 10:59Z, with the Narrator on terra. Spike done on Stas's Mac 2026-11-21 (sign-in, models, tool call, plan use, five narration draws per model; design section "Spike result").
