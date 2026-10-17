# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## What this is

An AI-run D&D 5e game (2024 rules, SRD 5.2.1). An AI DM agent and AI player agents (Claude Agent SDK), plus one human player, play through a text UI. Every rule is resolved by the Nat20 rules engine (`nat20_core`, upstream https://github.com/MadsWedendahlKruse/nat20, our fork https://github.com/StGerman/nat20), which this repo (https://github.com/StGerman/nat20-table) wraps in a typed JSON-lines API over stdio.

This file holds the rules and points to everything else. When it disagrees with a doc, this file wins and the doc gets fixed.

| Need | Read |
|---|---|
| What we are building and what "done" means | `docs/scope/demo-run-scope.md` |
| How the system is split and why | `docs/design/system-design.md` |
| What to do next: task list and milestone status | `TASKS.md`; until it moves here (CON-1), the project copy at `/mnt/project-files/engine/TASKS.md` is the only live one |
| Contract v1 behaviour (commands, events, errors, visibility) | `contract/protocol.md` |
| Why a decision was made, what was rejected, when to revisit | `docs/decisions/README.md` |

## Scope: the Demo Run

- **Format:** an AI DM, 1 human player and 2-3 AI players. Text interface, 1-2 hours.
- **Adventure:** *The Silent Mill*, an original one-shot (CC-BY-4.0): 4 level 2 pregens (Human Fighter for the human; Cleric, Wizard and optionally Barbarian for the AIs), 6 scenes, 2 goblin-and-wolf fights, a social hook, an exploration beat and an interrogation. SRD monsters only: Goblin Warrior, Goblin Boss, Wolf, Giant Rat.
- **Out of scope:** character creation and level-up, long rests, loot and shops, vision and darkvision, Hide and Stealth, grappling, Weapon Mastery, Heroic Inspiration, magic items beyond Potions of Healing, graphics, voice, more than one human, saving a campaign, subclasses.
- **Acceptance (scope §6):**
  1. Three unattended playthroughs run Scene 1 to 6 in 120 minutes or less.
  2. Every roll in the transcript appears in the engine log.
  3. No narration contradicts engine state.
  4. AI player turn p95 is 10 s or less; DM narration p95 is 6 s or less.
  5. Every rejected decision recovers within 2 retries.
  6. A first-time player finishes using only `/options` and `/sheet`.

## Milestones

Status, exit criteria and task ids for each milestone are in `TASKS.md` § Milestones. Work one milestone at a time, in order, unless the task list says a row is independent.

1. Fighter vs Goblin Warrior through the headless API (done 2026-10-16)
2. Repo split and contract v1
3. Exploration and checks
4. The party: Cleric and healing, Human, items, pregens
5. Monsters
6. Agents at the table: one full scene with the DM agent, player agents and a human
7. Demo acceptance: three timed playthroughs
8. Upstream proposal

## Design in brief

- **Upstream core** (`nat20_core`) owns the rules. Our fork stages one-item upstream PRs and nothing else.
- **This repo** holds everything that is ours:
  - the API package: the contract crate and the server;
  - the game side: game loop, agents, text UI, scenarios, pregens, maps, lore;
  - the data pipeline: Foundry structured fields and 5e-bits numbers into registry JSON.
- Two contracts:
  - the engine wire is ours and contract-first (Rule 1);
  - the registry formats are upstream's, generated from his code, and we consume them as pinned by the core rev.

## Commands

```bash
npm ci && npm run gen                     # regenerate everything from the contract crate: schema bundle, schema hash, TS types
npm run check:contract                    # regen + `git diff --exit-code` + breaking-change check against origin/main
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --locked                       # unit tests, conformance fixture replay, visibility scan
cargo test --locked -p nat20-api-server --test conformance -- <fixture_name>   # one fixture
npm run check:ts                          # tsc + client tests; needs `cargo build -p nat20-api-server` first
cargo run -p nat20-api-server             # the engine: JSON-lines on stdin/stdout, logs on stderr
cargo run -p nat20-api-contract --bin export-schema   # step 1 of `npm run gen`
```

Run `check:contract`, the three cargo checks and `check:ts` before every push. Never push red.

## Layout

| Path | What | Edit by hand? |
|---|---|---|
| `crates/nat20-api-contract/` | Engine API contract: wire types only (serde + schemars). **Source of truth for the wire** | Yes, under Rule 1 |
| `contract/protocol.md` | What a schema can't say: ordering, idempotency, lifecycle, the visibility table | Yes |
| `contract/fixtures/*.jsonl` | Seeded conformance transcripts: request line → exact response line | Yes |
| `contract/CHANGELOG.md` | Every contract change with its version | Yes |
| `generated/`, `packages/engine-client/src/generated/` | Codegen output: schema bundle, schema sha256, TS types | **Never** |
| `crates/nat20-api-server/src/adapter/` | The only code that imports `nat20_core` | Yes |
| `crates/nat20-api-server/src/` (rest) | Session log, roll and prompt ids, idempotency, projection, stdio loop, monster stat blocks | Yes |
| `packages/engine-client/` | Thin TS client that spawns the server; uses the generated types | Yes, outside `generated/` |
| `content/registries/` | Our registry overlay, namespace `nat20_demo::` (needs upstream U1) | Yes |
| `game/` | Game loop, DM and player agents, per-agent tool bindings, text UI, transcripts, audit | Yes |
| `scenarios/`, `pregens/`, `maps/` | Our adventure content, CC-BY-4.0 | Yes |
| `lore/` | Original setting and lore, kept apart from rules content | Yes |
| `tools/codegen/` | `gen-ts.mjs`, `check-breaking.mjs` | Yes |
| `tools/data-pipeline/` | Foundry → registry JSON translator, 5e-bits monster import | Yes |
| `docs/design/` | System design | Yes |
| `docs/decisions/` | Decision records: one file per decision, index in `README.md` | Yes; never rewrite an accepted one, supersede it |
| `docs/scope/` | Demo Run scope (accepted by Stas) | Only with Stas's agreement |
| `TASKS.md` | Task list and milestone status | Yes, per Rule 8 |

## Architecture

```
text UI ⇄ game loop ⇄ AI DM agent, AI player agents
              │  spawns; JSON-lines over stdio; types from packages/engine-client/src/generated
              ▼
       nat20-api-server ── uses ──► nat20-api-contract (wire types)  ──gen──► generated/ schema ──gen──► TS
              │ adapter/ only
              ▼
       nat20_core (git dep, pinned rev, StGerman/nat20 branch demo)
```

- Dependencies point down only. `nat20-api-contract` depends on serde, serde_json and schemars and nothing else. `nat20_core` depends on nothing of ours. Nothing depends on `game/`.
- One engine process per game session. The core registry is a process-wide global.
- The text UI reaches the game loop only through one boundary: player-facing events out, player intents in. A future web or mobile client replaces the UI behind that boundary over its own network contract (protobuf + Connect or AG-UI, chosen when a real client is planned; `docs/decisions/0016-client-contract-deferred.md`). No client ever talks to the engine.

## Rule 1: contract first

Any change to what crosses the engine boundary (a command, field, event, error code, view type, or its meaning) goes in this order, in one PR:
1. Edit `crates/nat20-api-contract/`, and `contract/protocol.md` if ordering, idempotency, lifecycle or visibility changes.
2. Add or update a fixture in `contract/fixtures/` that shows the new behaviour.
3. Add a line to `contract/CHANGELOG.md` with the new version.
4. Run `npm run gen` and commit the generated files in the same PR.
5. Only then change server and client code until the fixtures pass.

- Never hand-edit a generated file. If generated output is wrong, fix the contract crate or `tools/codegen/` and regenerate.
- The contract crate holds wire types and their doc comments only: no logic, no helpers, no extra dependencies (CI job `contract-pure`). No custom `Serialize`/`Deserialize` impls except validated newtypes such as `V1`, each covered by a fixture.
- Define wire types only in the contract crate: never in the server, never by hand in TS. Never put `nat20_core` types in the contract or re-export them through the API.
- Doc comments on contract types are the API documentation. Every type and field gets one.
- Schema shapes the TS generator mishandles, each found while scaffolding:
  - Tagged enums use struct variants, never newtype variants. A tagged newtype variant becomes `$ref` plus sibling keywords, and the TS generator drops the tag.
  - Never put `#[schemars(required)]` on an `Option`. It drops `null` from the schema while serde still sends `null`.
  - A description next to a `$ref`, and a struct that `#[serde(flatten)]`s a tagged enum, both confuse the TS generator (duplicate `PointFt1`, `Request1` types). `tools/codegen/gen.mjs` reshapes the TS input for both; a new flattened enum needs its Rust name in the `flattened` map there, or `npm run gen` fails.
- A PR that changes request or response handling in the server without touching the contract must say why the contract is unchanged.

## Rule 2: versioning

- `v` in every request is the contract major version. Within a major, changes are additive only: new commands, new optional fields, new event kinds, new error reasons. Clients ignore unknown fields and unknown event kinds.
- Removing, renaming, making a field required, narrowing a type, or changing a meaning is a major bump. It needs a migration note in `CHANGELOG.md` and a fixture for the change.
- Until v1 is published, `CONTRACT_VERSION` is `1.0.0-dev.N` and breaking changes are allowed without a major bump. `check-breaking` still lists them; each needs its `CHANGELOG.md` line.
- `hello` returns the schema sha256 and clients refuse to start on a mismatch. Never bypass that check.

## Rule 3: visibility is structural

- Before adding any field that describes a creature, roll, check or scenario, decide its view (DM, owner, other players) in the visibility table in `contract/protocol.md`.
- Hidden data lives only in DM and owner view types. Player-facing view types do not have the field at all: no optional "maybe hidden" fields.
- `projection.rs` is the only place that turns full state into a view. A player agent's tools bind `viewer` to that agent's own handle; an agent can never choose its viewer.
- HP, AC, DCs, roll targets (`against`), monster stat blocks, scenario data and DM reasoning never go into anything a player view can carry, including free-text `text` and `message` fields.
- Player agents see only their own sheet, personality card, what their character perceives, and their own notes. Never the scenario file, DCs, monster HP, DM reasoning or other players' sheets.

## Rule 4: the engine rolls

- Only the engine decides that a roll happens and resolves it. No command, tool or agent sets a roll result, a check outcome, damage or HP directly.
- Every roll has a session-unique id (`rN`) that is never reused or rewritten. Transcripts cite roll ids; the audit fails on any uncited, edited or invented roll.
- The DM agent picks checks from the scenario or the SRD DC ladder. It never rules success.

## Rule 5: the core boundary

- `nat20_core` is a git dependency pinned by `rev` to `StGerman/nat20`. Bump the rev only in its own PR, with the full suite green.
- Keep this entry in the workspace `Cargo.toml`, identical to upstream's. Cargo ignores a dependency's `[patch]`, so without it core builds against the wrong polyanya:
  ```toml
  [patch.crates-io]
  polyanya = { git = "https://github.com/MadsWedendahlKruse/polyanya", branch = "fix-path-with-height-oob" }
  ```
- Only `crates/nat20-api-server/src/adapter/` may `use nat20_core`. Upstream churn stays inside that module.
- Never work around a core rule in our code. If core is wrong or missing something, fix it in the fork as an upstream item (Rule 6) and pin to it.
- To develop against a local fork checkout, add `[patch."https://github.com/StGerman/nat20"] nat20_core = { path = "../nat20/core" }` to `.cargo/config.toml`. Never commit it.

## Rule 6: working in the fork (`StGerman/nat20`)

- The fork's `main` equals upstream `main`. Change it only by syncing from upstream.
- `demo` is upstream `main` plus our pending upstream items, nothing else: no server, no contract, no game code, no CLAUDE.md, no scenario data.
- Each upstream item gets its own branch off upstream `main` with one change, in the maintainer's style:
  - registry JSON over code;
  - a test in `core/tests/`;
  - a `docs/PROGRESS.md` row;
  - regenerated `assets/registries/.schemas` (his freshness test must pass);
  - `cargo test --locked` green.

  Merge the branch into `demo` for our use, and open the upstream PR from the same branch.
- Upstream items never contain API vocabulary: session, viewer, projection, roll id, prompt id, request id, JSON wire, AI. If upstream would not want a change for his own GUI, it does not go upstream.
- Design questions, such as new registry formats like monsters, start as an upstream issue, not a PR.
- Close our demo gaps before proposing anything upstream. Our work never waits on an upstream merge.

## Rule 7: content and licences

- The ruleset is 2024 (SRD 5.2.1). 2014 data only fills missing fields.
- Allowed sources:
  - SRD 5.1 and 5.2 (CC-BY-4.0), with attribution;
  - Foundry dnd5e: **structured fields only**, from records tagged CC-BY-4.0. Never its text, art, pregens or 2014 packs;
  - 5e-bits numbers;
  - our own text.
- Never download, scrape or ingest WotC books or D&D Beyond content, even with a purchased login. Never ship copyleft (GPL, CC-BY-SA) code or data.
- Known data bugs:
  - 5e-bits applies the Goblin Warrior's extra 1d4 on every hit; the rule is Advantage only.
  - Ancient Red Dragon, Remorhaz and Will-o'-Wisp have scrambled ability scores in the SRD text; use 5e-bits for those three.

## Rule 8: tasks, PRs, CI

- `TASKS.md` is the only task list: no GitHub issues and no TODO comments without a row. Every PR that closes or creates a gap updates its row in the same PR. ID prefixes: API, ENG, MON, CHR, ITM, CHK, MAP, AGT, UPS, DAT, CON.
- Each row carries Pri (P0 blocks a demo run, P1 needed for acceptance, P2 optional), Dest (Up, Up?, Fork, Ours), Gate (Y blocks the upstream proposal), Size and Status (todo, partial, done).
- When the last row of a milestone closes and its exit criterion holds, mark the milestone done in `TASKS.md` with the date.
- One concern per PR. Write the PR description as Before / After / How.
- A PR that makes or changes a decision with real alternatives adds or updates its record in `docs/decisions/` (options with pros and cons, who decided, when to revisit) in the same PR.
- Never skip, disable or quarantine a test to get green. Never push an empty commit to retrigger CI.
- CI jobs: `contract-fresh`, `contract-compat`, `contract-pure`, `rust`, `visibility`, `ts`, and `core-drift` (weekly, non-blocking). Each job's purpose is in design §5.3.
