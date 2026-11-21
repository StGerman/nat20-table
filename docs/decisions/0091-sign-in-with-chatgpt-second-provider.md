# 0091. Sign in with ChatGPT as a second model provider, the Narrator on gpt-6.1-terra

- **Status:** Proposed
- **Date:** 2026-11-21
- **Decided by:** Stas, in the "Sign in with ChatGPT" thread: the design, 2026-11-21 10:59Z («Принято. Погнали на terra как основная модель для рассказчика»); accepted on merge

## Context

A friend at the table (Vera) cannot spend her own Claude subscription inside our app: Anthropic's terms let a third-party product neither offer Claude.ai login nor route requests through Free, Pro or Max credentials for its users. The fallback is our API key, about 9.70 USD a game. OpenAI's Sign in with ChatGPT (SIWC) lets an app spend the user's own ChatGPT plan.

Facts checked (developers.openai.com/siwc, read 2026-11-21; spike on Stas's Mac, ChatGPT Plus, the same day):

- The open-source local flow needs no partner approval and no secret: PKCE in the system browser, a loopback callback on `127.0.0.1`, a client id issued on first sign-in (`dynamic_agent_client` → `oaiapp_…`). nat20-table is public under MIT. The spike signed in and refreshed with no registration.
- Inference is `POST /v1/responses` only, with `stream: true` and `store: false`; no `previous_response_id`, `max_output_tokens`, `temperature` or hosted tools. Function tools work.
- Plan cost and caching depend on the model. Twenty calls on a 12k-token prefix (230,100 input tokens) took about 5% of the Plus five-hour window on gpt-6.2-sol with 0% cached, and about 1% on gpt-6.1-terra (78% cached) or gpt-6-luna (20%).
- Narration, five draws each of one turn: sol ended on a hook 5 of 5 and never hedged; terra hooked 2 of 5 (failures only) and hedged its own outcome 3 of 5 («кажется», «неясно»). Both narrated failures with a consequence, both called the tool right.
- The Narrator and every player reach a model only through `TurnSession` (`game/src/agents/sdk-session.ts`); decision 0090's design §6 already plans a second provider behind it.

## Options

### A. A second provider behind `TurnSession`, Claude kept
- Pro: the seam exists; one more implementation and a sign-in adapter, chosen by a `provider` key in the run profile.
- Pro: closed exits and Claude runs stay valid; a bench can compare both on the same cards.
- Con: two loops to keep green.

### B. A hard switch to OpenAI
- Pro: one loop.
- Con: the same code as A; deleting the Claude path buys nothing and loses the baseline.

### C. Stay on Claude, wait for Anthropic (Friends and Family D1)
- Pro: no new code.
- Con: friends still need our API key or an answer that may never come.

Within A, the Narrator model:

### A1. gpt-6.2-sol
- Pro: the best narration of the spike.
- Con: no cache; about one Plus five-hour window per game.

### A2. gpt-6.1-terra
- Pro: about a fifth of sol's plan cost, caches, faster (3.0 to 4.4 s a call).
- Con: flatter on successes and a hedging habit, which a prompt line has to fix.

## Decision

A with A2: a second provider beside Claude, and the Narrator on gpt-6.1-terra (Stas). AI players start on terra too; the card bench may move them to luna. Sol stays a profile setting, not the default.

## Consequences

- New milestone "Sign in with ChatGPT" (`tasks/sign-in-with-chatgpt/`, scope `docs/scope/sign-in-with-chatgpt-scope.md`), right after Glass Table.
- Engine, contract, audit, Rule 3 projection and Rule 4 rolls are untouched; the new loop calls the same seat tools.
- A friend needs a paid ChatGPT plan (Plus, about 20 USD a month); Go is listed on OpenAI's user page but not its developer page.
- SIWC is a preview: fields may change, and a 403 `subscription_sharing_user_not_eligible` stops a game. The D1 letter to Anthropic is still worth sending.

## Revisit when

- The terra bench fails its gate (narration judge or hedge rate), or a game takes more than half a Plus five-hour window: the Narrator moves to sol or back to Claude.
- OpenAI ends the open-source flow or the preview changes `store` or streaming rules.
- Anthropic allows a player's own subscription in our app.

## Sources

- Design (Proposed, accepted 2026-11-21): https://claude.ai/artifact/HzwDT2avCY5Bwu2Knri66E, section "Spike result".
- Spike script: project files `engine/siwc/spike.mjs`.
- https://developers.openai.com/siwc, `/siwc/token-sharing-open-source/` (sign-in, models and inference, preview limitations, errors and recovery, profiles and sessions).
