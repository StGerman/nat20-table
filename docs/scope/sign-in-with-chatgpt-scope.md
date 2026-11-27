# Sign in with ChatGPT: scope

Status: Accepted (table #467, 2026-11-21); amended 2026-11-28 for decisions 0099 and 0100 (table #515), accepted on merge. Drafted 2026-11-21, main d63e333, from the design accepted by Stas the same day (https://claude.ai/artifact/HzwDT2avCY5Bwu2Knri66E) and decision 0091. No number until Stas gives one.
Order: right after Glass Table (Stas, 2026-11-21 08:34Z: «Давай запланируем сразу после Glass Table»). A full switch, not a second provider (Stas, 11:08Z).

## 1. Goal

The table runs on ChatGPT only: a player signs in with their own ChatGPT plan in the lobby and plays a game on it, the Narrator on gpt-6.1-terra, and an all-AI game spends at most half of a Plus five-hour window.

## 2. In

1. **ChatGPT sign-in adapter** (`status()`, `signIn()`, `docs/design/glass-table-system-design.md` §6): PKCE in the system browser, loopback `127.0.0.1`, the client id issued on first sign-in, a stable host id, a token file at mode 0600 in the app's data folder, rotating refresh, sign-out by revocation.
2. **`ResponsesSession` replaces `AgentSession` at the table**: the tool loop over `/v1/responses` (`stream: true`, `store: false`, history resent each call), `settleOn`, timeouts, cancel, partial previews, usage records, the turn tracer, error mapping to `LoginExpired`, `UsageLimitReached`, `ConnectionLost`. Run profiles name ChatGPT models; preflight checks the ChatGPT sign-in instead of Claude Code.
3. **The Claude baseline, recorded before the Claude loop goes**: two Claude benches on the bench cards.
4. **Prompt text in files, tuned in Langfuse** (AGT-152): edited and tried from Langfuse in bench runs, pulled into the repo for every other run; traces link the prompt version.
5. **Prompts on terra**: the hedge line and whatever the bench shows; Zoya and Vera read a narration sample.
6. **The lobby, built once on ChatGPT** (AGT-147, with AGT-144 folded in): adventure, character, the saved party, start, the sign-in state and the stop cards, in the words of `docs/design/sign-in-with-chatgpt-system-design.md` §7.
7. **The table server** (CON-32, decision 0100): a program inside the Mac app, its child, that lives between games and owns the sign-in, the lobby, the saved party and the runs; seat wire v2; the Mac window closes without ending a game, Cmd-Q quits through the page.
8. **The phone finds the table** (CON-33): Bonjour, a four-digit code confirmed once on the Mac, the phone keeps its token.
9. **The signed app** (CON-20 first, as the design's biggest risk; then CON-21): the DMG with the shell, the server and the engine, each signed under the hardened runtime.

## 3. Out

- Claude at the table or in the app, and a provider switch. Claude stays only in the narration judge and run analysis on Stas's machine (decision 0091), so terra is never graded by itself.
- An OpenAI API key path, hosted SIWC (website flow), and Business admin setup.
- Prompt caching work on sol; sol stays a profile setting.
- Any engine, contract, audit or projection change.
- Prompts fetched from Langfuse in an exit run or in the app: an exit pair runs on one build (0043), and a friend's app has no Langfuse keys.

## 4. Exit criterion

Each row names its lowest layer (decision 0080).

1. Sign-in against a recorded fake auth server: first registration sends the host id and later sign-ins send the same one, code exchange, refresh with rotation, `invalid_grant` restarting sign-in, sign-out revoking the refresh token, token file at 0600: test, no model (AGT-148)
2. The scripted scene runs on `ResponsesSession` from a recorded Responses stream and shows the same table lines as the scripted scene on main before the switch: test, no model (AGT-149)
3. A 429 `subscription_sharing_usage_limit_exceeded`, a 403 `subscription_sharing_user_not_eligible` and a 401 whose refresh fails (`invalid_grant`) each reach the seat as their stop, never as a crash; a 401 first refreshes the token and retries the call; a 503 retries: test, no model (AGT-149)
4. Card bench on terra, on the same cards (at least 10) as the two recorded Claude benches: the narration judge, which runs on Claude, scores terra no lower than Claude's score less the spread between the two Claude benches, and fewer than 1 in 10 narrations hedge their own outcome: a live run smaller than the exit run (AGT-150)
5. Vera (fallback) reads the lobby's ChatGPT lines and stops: a person (AGT-147)
6. A bench run with `PROMPTS=langfuse:staging` and a run from the pulled files trace the same prompt version: a live run smaller than the exit run (AGT-152)
7. One pair on one build (0043), the DMG of row 13, both halves on terra through SIWC: the all-AI half first, then Stas; audit, leak scan, judge; plan use read from ChatGPT Settings, Usage, after the all-AI half, started on a fresh window (no plan use in the five hours before), at most 50% of the five-hour window, with the run's token counts recorded beside it: a full run (AGT-151)
8. A second game in one server process, after a first that ended by scene 6 and one by a stop: test, no model (CON-32)
9. In the lobby two windows both get `lobby` and neither is replaced until one sends `start`; a network socket's `sign_in` and `sign_out` are refused: test, no model (CON-32)
10. Every lobby state and every `StopKind` puts up its line and button from a fake adapter; «Go on» after a stop puts the party where its card said: test, no model (AGT-147)
11. The Mac window closed during an ask sends nothing, and Cmd-Q sends `quit` before the server ends: test on the macOS runner, no model (CON-32)
12. The phone token and port survive an app restart while «Play on a phone» is on; Bonjour announces only while it is on; a phone with no confirmed code gets no seat: test, no model; the iPhone finds Stas's Mac with no address typed: a person (CON-33)
13. The DMG starts the server with no checkout, Rust or Node: CI on a hosted macOS arm64 runner, no model; then Stas installs it, signs in and plays a scripted scene: a person (CON-20, CON-21)

## 5. Cost

Amended 2026-11-28: plus 3 to 4 thread-days for CON-32, 1 to 2 for CON-33, the DMG and CON-20 moved in from Glass Table, less about 1 for the Claude lobby no longer built (design §10; Claude's estimate, not calibrated).

9 to 12 thread-days (the design's 8 to 10, uncalibrated, plus 1 to 2 for AGT-152; the switch removes the second loop's upkeep and adds the baseline benches). Stas: about 1.5 h of review, 15 min to sign in on his Mac, one evening at his Mac for the two Claude baseline benches, the terra bench and the Langfuse runs (rows 4 and 6), one exit half at the table. Table runs go on Stas's ChatGPT Plus (no dollars; plan limits); the Claude benches and the judge go on his Claude subscription, about 0.40 USD a run API-equivalent.
