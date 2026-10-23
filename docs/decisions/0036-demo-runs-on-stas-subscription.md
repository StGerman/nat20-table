# 0036. The demo runs on Stas's Claude subscription; an API key only when others play

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decided by:** Stas, Milestone 6 spec thread, 2026-10-23: "so the demo is only for me let's focus on my own play and use Claude seat pricing"

## Context

The Demo Run is played by Stas alone. The Agent SDK runs on a Console API key, Amazon Bedrock or Google Vertex credentials, or the Claude Code login on the machine it runs on. Anthropic's terms, as checked on 2026-10-23 from search results (its doc pages are blocked from the cloud environment), keep subscription login for ordinary individual use and ask products for other people to use an API key. A subscription has no per-token bill; its usage limits are shared with everything else run on it, including this project's Claude sessions. Decision 0032 recorded cost per call at list price and a dollar target for a beta.

## Options

### A. Live runs on Stas's Mac under Stas's Claude login
- Pro: no per-token bill; the individual use the terms allow; the machine and account the demo is played on are the ones measured.
- Con: runs share the plan's usage limits with Stas's other Claude work; a long unattended run can stop at a limit; a cloud thread can't run a live game itself.

### B. An API key for every live run
- Pro: a cloud thread can run live games; no shared limits.
- Con: pay per token on the expensive testing models (decision 0032), for a demo nobody else plays.

### C. A subscription token stored as a cloud environment secret
- Con: puts a personal login into a shared environment that runs our program, which is not the individual use the terms describe. Rejected.

## Decision

A. Every live model call in Milestones 6 and 7 runs on Stas's Mac under Stas's Claude login. Cloud threads build and test with scripted agents only; CI never calls a model. An API key comes back when anyone else plays (a beta), with the beta models and the per-run dollar target of decision 0032.

## Consequences

- CON-14 needs only network access to npm and crates.io for the cloud environment, no API key.
- Each live step of the Milestone 6 spec (1, 9, 10, 13) ships a command Stas runs on that Mac, which writes the run report next to the transcript; a thread can also run it there through a Remote Control session Stas approves. Milestone 7's timed runs run there too.
- `usage.jsonl` records tokens per call, with the API-equivalent cost as a reference for a later beta; no dollar budget applies while the demo is on the subscription. Hitting the plan's usage limit stops the run cleanly; it is neither a retry nor a fallback (spec §6).
- Amends decision 0032: its model choices stand; its list-price cost and dollar target apply to a beta on an API key.

## Revisit when

Someone other than Stas plays, a run is needed from a cloud thread, or the plan's limits stop the timed runs of Milestone 7.

## Sources

- `docs/milestones/milestone-6-agents-at-the-table.md` §6, §7, §8, D12; decisions 0032, 0019; Agent SDK overview (https://platform.claude.com/docs/en/agent-sdk/overview), seen through search results on 2026-10-23.
