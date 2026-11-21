# 0091. The table moves to ChatGPT through Sign in with ChatGPT, the Narrator on gpt-6.1-terra

- **Status:** Proposed
- **Date:** 2026-11-21
- **Decided by:** Stas, in the "Sign in with ChatGPT" thread: the design and terra, 2026-11-21 10:59Z («Принято. Погнали на terra как основная модель для рассказчика»); a full switch over a second provider, 11:08Z («Это нарушает KISS принцип и усложняет тестирование»); accepted on merge

## Context

A friend at the table (Vera) cannot spend her own Claude subscription inside our app: Anthropic's terms let a third-party product neither offer Claude.ai login nor route requests through Free, Pro or Max credentials for its users. The fallback is our API key, about 9.70 USD a game. OpenAI's Sign in with ChatGPT (SIWC) lets an app spend the user's own ChatGPT plan.

Facts checked (developers.openai.com/siwc, read 2026-11-21; spike on Stas's Mac, ChatGPT Plus, the same day):

- The open-source local flow needs no partner approval and no secret: PKCE in the system browser, a loopback callback on `127.0.0.1`, a client id issued on first sign-in (`dynamic_agent_client` → `oaiapp_…`). nat20-table is public under MIT. The spike signed in and refreshed with no registration.
- Inference is `POST /v1/responses` only, with `stream: true` and `store: false`; no `previous_response_id`, `max_output_tokens`, `temperature` or hosted tools. Function tools work.
- Plan cost and caching depend on the model. Twenty calls on a 12k-token prefix (230,100 input tokens) took about 5% of the Plus five-hour window on gpt-6.2-sol with 0% cached, and about 1% on gpt-6.1-terra (78% cached) or gpt-6-luna (20%).
- Narration, five draws each of one turn: sol ended on a hook 5 of 5 and never hedged; terra hooked 2 of 5 (failures only) and hedged its own outcome 3 of 5 («кажется», «неясно»). Both narrated failures with a consequence, both called the tool right.
- The Narrator and every player reach a model only through `TurnSession` (`game/src/agents/sdk-session.ts`); the narration judge (`game/src/check/judge.ts`) uses the same session type.

## Options

### A. A second provider behind `TurnSession`, Claude kept at the table
- Pro: closed exits and a Claude fallback stay one profile key away; both run on the same cards.
- Con: two loops, two sign-ins and two prompt sets to keep green; every table test runs twice or covers one of them.

### B. A full switch of the table to ChatGPT
- Pro: one loop, one sign-in, one prompt set: the simplest table to test (KISS).
- Pro: the Claude Code install that Vera cannot get through goes away with it.
- Con: no fallback but a revert; if SIWC closes, getting Claude back is a revert of the switch, not a setting.
- Con: the Claude baseline for the bench has to be recorded before the Claude loop goes.

### C. Stay on Claude, wait for Anthropic (Friends and Family D1)
- Pro: no new code.
- Con: friends still need our API key or an answer that may never come.

Within B, the Narrator model: gpt-6.2-sol narrated best but caches nothing (about one Plus five-hour window a game); gpt-6.1-terra costs about a fifth of that, caches and is faster, with a hedging habit a prompt line has to fix.

## Decision

B with terra: the table moves to ChatGPT, the Narrator and the AI players on gpt-6.1-terra (Stas). The bench may move players to luna; sol stays a profile setting. Claude leaves the table loop and the app; it stays only in the tools on Stas's machine that are not part of the table, the narration judge and run analysis, so terra is never graded by itself.

## Consequences

- Milestone "Sign in with ChatGPT" (`tasks/sign-in-with-chatgpt/`, scope `docs/scope/sign-in-with-chatgpt-scope.md`), right after Glass Table.
- `ResponsesSession` replaces `AgentSession` at the table; the Agent SDK stays a dependency of the judge only.
- Before the Claude loop goes, two Claude benches on the bench cards are recorded: they are the baseline and the judge's spread for the terra bench.
- Glass Table's Claude-only lobby and its Claude Code lookup are replaced by the ChatGPT sign-in (AGT-147).
- Engine, contract, audit, Rule 3 projection and Rule 4 rolls are untouched.
- A friend needs a paid ChatGPT plan (Plus, about 20 USD a month).
- SIWC is a preview: fields may change, and a 403 `subscription_sharing_user_not_eligible` stops a game. The D1 letter to Anthropic is still worth sending.

## Revisit when

- The terra bench fails its gate, or a game takes more than half a Plus five-hour window: the Narrator moves to sol.
- OpenAI ends the open-source flow or changes the preview's `store` or streaming rules: revert to Claude.
- Anthropic allows a player's own subscription in our app.

## Sources

- Design (accepted 2026-11-21): https://claude.ai/artifact/HzwDT2avCY5Bwu2Knri66E, section "Spike result".
- Spike script: project files `engine/siwc/spike.mjs`.
- https://developers.openai.com/siwc, `/siwc/token-sharing-open-source/` (sign-in, models and inference, preview limitations, errors and recovery, profiles and sessions).
