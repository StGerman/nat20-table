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
| [0013](0013-one-agent-per-ai-player.md) | Each AI player is its own agent with its own context | Accepted, parallel out-of-combat order superseded by 0039 | 2026-10-16 | Stas |
| [0014](0014-level-2-pregens.md) | Four level 2 pregens: Fighter, Cleric, Wizard, optional Barbarian | Accepted | 2026-10-16 | Stas (scope) |
| [0015](0015-scripted-monster-turns.md) | Monster turns run on a scripted engine policy, not an LLM | Accepted | 2026-10-16 | Stas (scope) |
| [0016](0016-client-contract-deferred.md) | No client talks to the engine; the public client contract is deferred | Accepted, wire deferred | 2026-10-16 | Claude proposed; Stas acknowledged |
| [0017](0017-tasks-md-only-list.md) | TASKS.md is the only task list | Accepted | 2026-10-16 | Stas (design approval) |
| [0018](0018-original-scenario.md) | Run an original one-shot, The Silent Mill, not a published adventure | Accepted | 2026-10-16 | Stas (scope) |
| [0019](0019-game-stack.md) | Game side: TypeScript, Ink and the Claude Agent SDK | Accepted, not built | 2026-10-16 | Stas (scope) |
| [0020](0020-send-u1-u2-upstream-early.md) | Send the engine-plumbing items U1 and U2 upstream now, not at Milestone 8 | Superseded by 0023 | 2026-10-17 | Stas (decision card) |
| [0021](0021-surrender-dm-call-engine-gate.md) | Surrender: the DM decides, within a scene condition the engine enforces | Accepted | 2026-10-17 | Stas (direction), delegated to the coordinator |
| [0022](0022-ci-shape.md) | CI: parallel lint and test, one build, one required gate, cargo-deny, advisories and core drift off the gate | Accepted | 2026-10-17 | Claude (defaults for Stas's CI ask); Stas accepted by merging #10 |
| [0023](0023-long-lived-fork.md) | Upstream declines our contributions: keep a long-lived fork that syncs upstream main | Accepted, PROGRESS.md part superseded by 0037 | 2026-10-18 | Stas (thread "Mads's reply") |
| [0024](0024-dependency-policy.md) | Dependencies: stay current behind a cooldown and hard gates, in both repos | Accepted (by merging table #44), amended by 0027 | 2026-10-18 | Stas asked; specifics by Claude |
| [0025](0025-pregen-files-json.md) | Pregen files are JSON with a `_comment` key, typed in the contract crate | Accepted | 2026-10-18 | Stas (Milestone 4 spec D1) |
| [0026](0026-monster-registry-kind.md) | Monster stat blocks are a thin core registry kind, typed by hand from SRD 5.2.1 | Accepted | 2026-10-20 | Stas (Milestone 5 spec D1, D2) |
| [0027](0027-claude-merges-toolchain-bumps.md) | Claude merges green Rust toolchain bumps | Accepted | 2026-10-19 | Stas (decision card) |
| [0028](0028-self-hosted-arm64-runner.md) | CI runs on a self-hosted arm64 Linux runner: a VM on Stas's Mac | Superseded by 0029 | 2026-10-21 | Stas (CI cost thread) |
| [0029](0029-no-self-hosted-runner-public-repo.md) | No self-hosted runner: CI runs on GitHub-hosted runners in the public repo | Accepted | 2026-10-23 | Stas (CI cost thread) |
| [0030](0030-agent-harness-and-tool-binding.md) | Agents run as Agent SDK sessions with only our tools, bound by the game loop | Accepted with table #96 | 2026-10-23 | Claude (Milestone 6 spec D6) |
| [0031](0031-adventure-file-game-typed.md) | Adventures are scenario packs: a JSON skeleton plus Markdown prose, loadable from any path | Accepted | 2026-10-23 | Stas (Milestone 6 spec D3) |
| [0032](0032-agent-models-and-cost.md) | Agent models: Opus 5.5 DM and Sonnet 5.5 players while testing, Sonnet and Haiku for a beta | Accepted, amended by 0036 and 0045 | 2026-10-23 | Stas (Milestone 6 spec D2) |
| [0033](0033-audit-stays-in-rust.md) | The transcript audit stays in Rust and runs as a CLI over game transcripts | Accepted | 2026-10-23 | Stas (Milestone 6 spec D4) |
| [0034](0034-agent-memory-per-run.md) | Agent memory lasts one run: typed player notes and a DM memory of invented facts | Accepted | 2026-10-23 | Stas (Milestone 6 spec D9) |
| [0035](0035-unplanned-fights-dm-starts-engine-validates.md) | Unplanned fights: the DM starts them, the engine validates them (own milestone after Milestone 7) | Accepted | 2026-10-23 | Stas (Milestone 6 spec review, D11) |
| [0036](0036-demo-runs-on-stas-subscription.md) | The demo runs on Stas's Claude subscription; an API key only when others play | Accepted | 2026-10-23 | Stas (Milestone 6 spec thread, D12) |
| [0037](0037-fork-keeps-progress-md.md) | Core PRs into the fork's `demo` keep `docs/PROGRESS.md` current | Accepted | 2026-10-27 | Stas (project chat) |
| [0038](0038-agents-write-the-run-language.md) | The agents write the table's prose in the run's language (`--lang ru`); the engine and the UI stay English | Accepted | 2026-10-27 | Stas (decision card, Milestone 6 implementation thread) |
| [0039](0039-party-talk-hand-raise-floor.md) | Party talk: each AI player raises its hand, and speakers take the floor in turn | Accepted, bound superseded by 0049 | 2026-10-27 | Stas (decision cards, party-talk design thread) |
| [0040](0040-every-address-hands-off.md) | Every address to a companion hands it the floor | Accepted | 2026-10-27 | Stas (decision card, party-talk thread) |
| [0041](0041-engine-lines-wait-for-narration.md) | On the table screen, engine lines wait for the DM's narration of them (`--verbose` folds them under it) | Accepted | 2026-10-27 | Stas (decision card, chat transcript thread) |
| [0042](0042-fight-reactions-first-line-wins.md) | In a fight, every AI player who may react is woken, and the first line shows at once | Accepted | 2026-10-27 | Stas (R1 spec D1 and D2, party-talk thread) |
| [0043](0043-demo-acceptance-two-runs.md) | Demo acceptance is one unattended all-AI run and one run by Stas, with a narration check and latency reported | Accepted | 2026-10-27 | Stas (Milestone 7 design thread, D1-D3) |
| [0044](0044-one-repo-through-m7.md) | nat20-table stays one repo through Milestone 7; the next contract goes on the line between the game loop and its clients | Accepted | 2026-10-27 | Stas (decision card, Milestone 7 design thread) |
| [0045](0045-run-profiles-and-models.md) | Run settings live in named JSON profiles; testing runs a Sonnet DM and Haiku players | Accepted, amended by 0046 | 2026-10-27 | Stas (decision card, Milestone 7 design thread, D4-D5) |
| [0046](0046-unattended-run-opus-low-dm.md) | The unattended Milestone 7 run's DM is Opus 5.5 at low effort; iteration runs keep the Sonnet DM | Accepted, amended by 0047 | 2026-10-30 | Stas (M7 implementation thread) |
| [0047](0047-unattended-run-sonnet-players.md) | The unattended Milestone 7 run's AI players are Sonnet 5.5 at medium effort | Accepted | 2026-10-30 | Stas (M7 implementation thread) |
| [0048](0048-ai-players-table-knowledge.md) | AI players get a rules primer and teamwork guidance in their prompt, and nothing about what lies ahead | Accepted | 2026-10-30 | Stas (M7 implementation thread) |
| [0049](0049-every-hand-speaks.md) | Every named player and every raised hand speaks in its talk round; the bound of three floor wakes goes | Accepted | 2026-10-30 | Stas (decision card, cellar thread) |
| [0050](0050-dm-sees-who-waits.md) | The DM's wake names who still waits for the floor, and the DM decides whether the scene may end; no `load_scene` hold | Accepted | 2026-10-30 | Stas (decision card, cellar thread) |

## Open questions to watch

None are open as of 2026-10-18. The likeliest to reopen: 0006 (if the human finds rolls opaque in playtests), 0012 (if anchors prove too coarse), 0016 (when a real client is planned).
