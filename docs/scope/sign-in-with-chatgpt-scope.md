# Sign in with ChatGPT: scope

Status: Proposed; accepted on merge. Drafted 2026-11-21, main d63e333, from the design accepted by Stas the same day (https://claude.ai/artifact/HzwDT2avCY5Bwu2Knri66E) and decision 0091. No number until Stas gives one.
Order: right after Glass Table (Stas, 2026-11-21 08:34Z: «Давай запланируем сразу после Glass Table»).

## 1. Goal

A player signs in with their own ChatGPT plan in the lobby and plays a game on it, with the Narrator on gpt-6.1-terra, and the game spends at most half of a Plus five-hour window.

## 2. In

1. **ChatGPT sign-in adapter** (`status()`, `signIn()`, `docs/design/glass-table-system-design.md` §6): PKCE in the system browser, loopback `127.0.0.1`, the client id issued on first sign-in, a token file at mode 0600 in the app's data folder, rotating refresh, host id, sign-out by revocation.
2. **`ResponsesSession`**, a second `TurnSession`: the tool loop over `/v1/responses` (`stream: true`, `store: false`, history resent each call), `settleOn`, timeouts, cancel, partial previews, usage records, the turn tracer, error mapping to `LoginExpired`, `UsageLimitReached`, `ConnectionLost`.
3. **`provider` in the run profile**, and a profile with the Narrator and players on terra.
4. **Prompt text per provider in files, tuned in Langfuse** (AGT-152): edited and tried from Langfuse in bench runs, pulled into the repo for every other run; traces link the prompt version.
5. **Prompts on terra**: the hedge line and whatever the bench shows; Zoya and Vera read a narration sample.
6. **The lobby's ChatGPT state** (AGT-147): the «Continue with ChatGPT» button, «Using ChatGPT plan» with a Manage usage link, limit and eligibility stops.

## 3. Out

- Removing Claude or the Agent SDK: Claude stays a provider and the judge's model.
- An OpenAI API key path, hosted SIWC (website flow), and Business admin setup.
- Prompt caching work on sol; sol stays a profile setting.
- Any engine, contract, audit or projection change.
- Prompts fetched from Langfuse in an exit run or in the app: an exit pair runs on one build (0043), and a friend's app has no Langfuse keys.

## 4. Exit criterion

Each row names its lowest layer (decision 0080).

1. Sign-in against a recorded fake auth server: first registration, code exchange, refresh with rotation, `invalid_grant` restarting sign-in, token file at 0600: test, no model (AGT-148)
2. The scripted scene runs on `ResponsesSession` from a recorded Responses stream and shows the same table lines as on `AgentSession`: test, no model (AGT-149)
3. A 429 `subscription_sharing_usage_limit_exceeded`, a 403 `subscription_sharing_user_not_eligible` and a 401 whose refresh fails (`invalid_grant`) each reach the seat as their stop, never as a crash; a 401 first refreshes the token and retries the call; a 503 retries: test, no model (AGT-149)
4. Card bench, the same cards (at least 10) on Claude and on terra: the narration judge, which runs on Claude, scores terra no lower than Claude's own score less the spread between two Claude benches on those cards, and fewer than 1 in 10 narrations hedge their own outcome: a live run smaller than the exit run (AGT-150)
5. Vera (fallback) reads the lobby's ChatGPT lines and stops: a person (AGT-147)
6. A bench run with `PROMPTS=langfuse:staging` and a run from the pulled files trace the same prompt version: a live run smaller than the exit run (AGT-152)
7. One pair on one build (0043), both halves on terra through SIWC: the all-AI half first, then Stas; audit, leak scan, judge; plan use read from ChatGPT Settings, Usage, after the all-AI half, started on a fresh window (no plan use in the five hours before), at most 50% of the five-hour window, with the run's token counts recorded beside it: a full run (AGT-151)

## 5. Cost

9 to 12 thread-days (the design's 8 to 10, uncalibrated, plus 1 to 2 for AGT-152). Stas: about 1.5 h of review, 15 min to sign in on his Mac, one evening at his Mac for the bench and Langfuse runs (rows 4 and 6, which run on his ChatGPT sign-in), one exit half at the table. Model runs go on Stas's ChatGPT Plus (no dollars; plan limits); the judge stays on Claude, about 0.40 USD a run.
