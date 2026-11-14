# 0072. Langfuse traces every agent turn, by hand, off unless keyed

- **Status:** Accepted; "Off in milestone exit runs" superseded by [0073](0073-exit-runs-traced.md)
- **Date:** 2026-11-12
- **Decided by:** Stas (thread "Add Langfuse tracing to the table", design doc https://claude.ai/artifact/77VvhZkSJqdHkGr4b5FfFx, six decisions in its comments and the thread, 2026-11-12)

## Context

Run analysis joins `transcript.jsonl` and `usage.jsonl` by hand. Stas asked for Langfuse tracing of the AI table. Every model call goes through `AgentSession` (DM, AI players, suggestions, the narration judge), and each seat holds one streaming-input `query()` for a whole run. Seats use Stas's subscription login (decision 0036), and the agent process inherits only an allow-list of variables.

## Options

### A. A ready instrumentation (OpenInference, OpenLIT)
- Pro: Langfuse documents OpenInference for the Agent SDK; least code.
- Con: both wrap `query()` in one span, so a run becomes one span per seat; both inject hooks into our SDK options, which changes what the SDK runs.

### B. Claude Code's own OpenTelemetry
- Pro: no code in the table.
- Con: needs the `agentEnv` allow-list opened (0036); knows nothing of seat, purpose or run.

### C. A vendor SDK with its own wrapper (PostHog, LangSmith, Braintrust, Laminar)
- Pro: PostHog splits streaming input by turn.
- Con: each sends only to its own service; Laminar reroutes `ANTHROPIC_BASE_URL` through a local proxy, which breaks 0036.

### D. Our own spans in `AgentSession`, through `@langfuse/tracing` on OpenTelemetry
- Pro: one trace per turn built from the data `usage.jsonl` already has; nothing changes in what the SDK is given; the spans are plain OpenTelemetry, so another backend is one span processor away.
- Con: about 150 lines of ours; eight pinned packages.

## Decision

D. One trace per turn: an agent observation named `<role>.<purpose>` (role from the closed set dm, player, judge, suggest; the seat is a value, never part of a name), a generation per API call with our own API-equivalent cost, a tool observation per table tool call; one Langfuse session per run. Langfuse Cloud US. Everything goes in, unmasked. On only when `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and `LANGFUSE_BASE_URL` are set in the shell or the git-ignored `.env`, and only the run commands read them. Off in milestone exit runs.

## Consequences

- `usage.jsonl`, the transcript and `report.md` stay the run's record; nothing reads traces back. The report says when tracing was on.
- Keys live on Stas's Mac and in the cloud environment's secrets; never in a build that goes to other people (Langfuse has no write-only key). Tracing for other players needs its own decision: an ingest relay of ours, an anonymous install id and consent.
- The OpenTelemetry packages are held at the lines `@langfuse/otel` accepts (TASKS.md UPS-26).

## Revisit when

Another player runs the table (see the second consequence), the Hobby plan's 50k units a month no longer cover our runs, or Langfuse's peer ranges accept OpenTelemetry 3.x.

## Sources

- Design doc and its review, https://claude.ai/artifact/77VvhZkSJqdHkGr4b5FfFx; npm survey of Agent SDK instrumentations in the thread, 2026-11-12.
- TASKS.md AGT-16, UPS-26.
