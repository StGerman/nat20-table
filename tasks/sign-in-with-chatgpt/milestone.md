---
type: Milestone
title: "Sign in with ChatGPT (a second model provider)"
description: "A player signs in with their own ChatGPT plan and plays a game on it, the Narrator on gpt-6.1-terra, within half a Plus five-hour window; no number until Stas gives one"
state: open
---

# Exit criterion

Scope `docs/scope/sign-in-with-chatgpt-scope.md` §4, each row with its lowest layer (decision 0080):

1. Sign-in against a recorded fake auth server, refresh with rotation, `invalid_grant`, token file at 0600: test, no model (AGT-148)
2. The scripted scene on `ResponsesSession` from a recorded stream shows the same lines as on `AgentSession`: test, no model (AGT-149)
3. Limit, eligibility and failed-refresh errors reach the seat as stops; a 401 refreshes and retries first; a 503 retries: test, no model (AGT-149)
4. Card bench Claude against terra: at least 10 cards, judge (on Claude) within the spread of two Claude benches, fewer than 1 in 10 narrations hedge: a live run smaller than the exit run (AGT-150)
5. Vera (fallback) reads the lobby's ChatGPT lines and stops: a person (AGT-147)
6. Bench run on Langfuse `staging` prompts and a run on the pulled files trace the same prompt version: a live run smaller than the exit run (AGT-152)
7. One pair on one build (0043), both halves on terra, all-AI half from a fresh window within 50% of it, read after the run: a full run (AGT-151)

# Tasks

In order: AGT-148, AGT-149 and AGT-152 (side by side), then AGT-150; AGT-147 once Glass Table's AGT-144 and AGT-148 are done; AGT-151 last. Decision 0091.

# Status

open, no number. Rows written 2026-11-21 on main d63e333. Starts right after Glass Table (Stas, 2026-11-21 08:34Z). Design accepted by Stas 2026-11-21 10:59Z, with the Narrator on terra. Spike done on Stas's Mac 2026-11-21 (sign-in, models, tool call, plan use, five narration draws per model; design section "Spike result").
