# Decision records

Why the project is shaped the way it is: one record per decision that had real alternatives, with who decided, the options with pros and cons, the consequences and what would make us revisit it. The design docs keep the detail; these records summarise and link to it.

**Adding one.** Copy [template.md](template.md) to `NNNN-short-slug.md` with the next number, add a row below, and land it in the same PR as the change it governs (CLAUDE.md Rule 8). Status is `Proposed` until Stas accepts it.

**Changing one.** Never rewrite an accepted decision to say something else. Write a new record and mark the old one `Superseded by NNNN`. Fixing links, typos and adding evidence is fine.

| # | Decision | Status | Date | Decided by |
|---|---|---|---|---|
| [0000](0000-record-decisions.md) | Record decisions as numbered decision records | Accepted | 2026-10-17 | Stas asked; format by Claude |
| [0001](0001-nat20-as-rules-engine.md) | Use Nat20 as the rules engine instead of building our own | Accepted | 2026-10-16 | Stas |
| [0002](0002-fork-and-own-repo.md) | Keep the fork equal to upstream and put our code in nat20-table | Accepted, amended by 0020, upstream parts superseded by 0023 | 2026-10-16 | Stas (design approval) |
| [0003](0003-contract-first-rust-crate.md) | Contract-first, written as a Rust contract crate | Accepted | 2026-10-16 | Stas (contract-first); Claude (format) |
| [0004](0004-visibility-in-types.md) | Visibility is structural: separate view types, projected by the engine | Accepted | 2026-10-16 | Stas confirmed |
| [0005](0005-engine-rolls.md) | The engine decides and resolves every roll, never the LLM | Accepted | 2026-10-16 | Stas (scope; AC/DC in log) |
| [0006](0006-strict-player-roll-view.md) | Strict player roll view: players never see an AC or DC | Accepted | 2026-10-16 | Stas |
| [0007](0007-stdio-transport.md) | Engine transport: JSON-lines over stdio, one engine process per game | Accepted | 2026-10-16 | Stas confirmed |
| [0008](0008-contract-versioning.md) | Contract versioning: major in every request, `1.0.0-dev.N` until v1 ships | Accepted | 2026-10-16 | Stas (design, PR #2) |
| [0009](0009-2024-rules-srd-521.md) | 2024 rules via SRD 5.2.1; 2014 data only fills missing fields | Accepted | 2026-10-16 | Stas |
| [0010](0010-data-sources.md) | Data sources: Foundry structured fields for mechanics, 5e-bits for monster numbers | Accepted | 2026-10-16 | Stas |
| [0011](0011-content-licensing.md) | Content licensing boundary: CC-BY SRD, permissive data and our own words only | Accepted | 2026-10-16 | Stas |
| [0012](0012-spatial-model.md) | Spatial model: hidden 5-ft grid narrated by the AI; the demo uses named anchors | Accepted, amended for the demo | 2026-10-16 | Stas |
| [0013](0013-one-agent-per-ai-player.md) | Each AI player is its own agent with its own context | Accepted | 2026-10-16 | Stas |
| [0014](0014-level-2-pregens.md) | Four level 2 pregens: Fighter, Cleric, Wizard, optional Barbarian | Accepted | 2026-10-16 | Stas (scope) |
| [0015](0015-scripted-monster-turns.md) | Monster turns run on a scripted engine policy, not an LLM | Accepted | 2026-10-16 | Stas (scope) |
| [0016](0016-client-contract-deferred.md) | No client talks to the engine; the public client contract is deferred | Accepted, wire deferred | 2026-10-16 | Claude proposed; Stas acknowledged |
| [0017](0017-tasks-md-only-list.md) | TASKS.md is the only task list | Accepted | 2026-10-16 | Stas (design approval) |
| [0018](0018-original-scenario.md) | Run an original one-shot, The Silent Mill, not a published adventure | Accepted | 2026-10-16 | Stas (scope) |
| [0019](0019-game-stack.md) | Game side: TypeScript, Ink and the Claude Agent SDK | Accepted, not built | 2026-10-16 | Stas (scope) |
| [0020](0020-send-u1-u2-upstream-early.md) | Send the engine-plumbing items U1 and U2 upstream now, not at Milestone 8 | Superseded by 0023 | 2026-10-17 | Stas (decision card) |
| [0021](0021-surrender-dm-call-engine-gate.md) | Surrender: the DM decides, within a scene condition the engine enforces | Accepted | 2026-10-17 | Stas (direction), delegated to the coordinator |
| [0022](0022-ci-shape.md) | CI: parallel lint and test, one build, one required gate, cargo-deny, advisories and core drift off the gate | Accepted | 2026-10-17 | Claude (defaults for Stas's CI ask); Stas accepted by merging #10 |
| [0023](0023-long-lived-fork.md) | Upstream declines our contributions: keep a long-lived fork that syncs upstream main | Accepted | 2026-10-18 | Stas (thread "Mads's reply") |
| [0024](0024-dependency-policy.md) | Dependencies: stay current behind a cooldown and hard gates, in both repos | Accepted (by merging table #44), amended by 0027 | 2026-10-18 | Stas asked; specifics by Claude |
| [0025](0025-pregen-files-json.md) | Pregen files are JSON with a `_comment` key, typed in the contract crate | Accepted | 2026-10-18 | Stas (Milestone 4 spec D1) |
| [0026](0026-monster-registry-kind.md) | Monster stat blocks are a thin core registry kind, typed by hand from SRD 5.2.1 | Accepted | 2026-10-20 | Stas (Milestone 5 spec D1, D2) |
| [0027](0027-claude-merges-toolchain-bumps.md) | Claude merges green Rust toolchain bumps | Accepted | 2026-10-19 | Stas (decision card) |
| [0028](0028-self-hosted-arm64-runner.md) | CI runs on a self-hosted arm64 Linux runner: a VM on Stas's Mac | Superseded by 0029 | 2026-10-21 | Stas (CI cost thread) |
| [0029](0029-no-self-hosted-runner-public-repo.md) | No self-hosted runner: CI runs on GitHub-hosted runners in the public repo | Accepted | 2026-10-23 | Stas (CI cost thread) |
| [0030](0030-agent-harness-and-tool-binding.md) | Agents run as Agent SDK sessions with only our tools, bound by the game loop | Proposed | 2026-10-23 | Claude (Milestone 6 spec D6) |
| [0031](0031-adventure-file-game-typed.md) | The DM's adventure file is typed in game/, not in the contract crate | Proposed | 2026-10-23 | Stas (Milestone 6 spec card D3) |
| [0032](0032-agent-models-and-cost.md) | Agent models: Opus 5.5 DM and Sonnet 5.5 players while testing, Sonnet and Haiku for a beta | Accepted | 2026-10-23 | Stas (Milestone 6 spec D2) |
| [0033](0033-audit-stays-in-rust.md) | The transcript audit stays in Rust and runs as a CLI over game transcripts | Proposed | 2026-10-23 | Stas (Milestone 6 spec card D4) |

## Open questions to watch

None are open as of 2026-10-18. The likeliest to reopen: 0006 (if the human finds rolls opaque in playtests), 0012 (if anchors prove too coarse), 0016 (when a real client is planned).
