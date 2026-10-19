# System design: Nat20 core, our engine API, the game

> Repo copy. Relative links to `contract-spike/`, `../api/` and `CLAUDE.md` point into the project's shared folder (`/mnt/project-files/engine/`), where the spikes and the API review live; the repo's rules are in the root `CLAUDE.md`.

Status: **approved by Stas, 2026-10-16** (contract format: Rust contract crate by default; the TypeSpec card is still open). Repo: https://github.com/StGerman/nat20-table. Supersedes the "schema derived from server types" approach in [../api/review.md](../api/review.md) and PR #2.
Companion files: [CLAUDE.md](CLAUDE.md) (the rules in a form a Claude Code session follows), [contract-spike/](contract-spike/) (the codegen pipeline, run end to end).

## 0. Verdict

1. **Yes, detach the API, and go one step further: take it out of the fork entirely.** The API becomes its own Cargo packages (`nat20-api-contract` for wire types, `nat20-api-server` for behaviour) in our own repo, depending on `nat20_core` by pinned git rev. Evidence: milestone 1's `server/` crate needed **zero changes to `core/`** (`git diff main demo -- core/src` is empty), so core's public surface already carries a headless API.
2. **The fork shrinks to an upstream staging area.** `main` == upstream; every other branch is one upstream-bound item. No server, no product code, no CLAUDE.md ever lands there.
   *Superseded 2026-10-18 ([decision 0023](../decisions/0023-long-lived-fork.md)): upstream declines AI-authored contributions. `main` still mirrors upstream, and `demo` is now our long-lived engine branch, synced by merge. Still no server or product code in it.*
3. **Contract-first: recommend a standalone Rust contract crate (serde + schemars), TypeSpec as the alternative.** The contract crate holds only wire types, no logic, no core dependency; JSON Schema and TS types are generated from it. Both pipelines spiked on the same slice (§5.4): the Rust crate needs no fix-up step and rejects `v: 2` by type; TypeSpec needs a normalizer before typify will produce correct Rust. Generated code is checked in; CI regenerates and fails on any diff.
4. **Upstream needs four small code PRs, not one of which mentions an API** (built on the fork now; the upstream proposal was dropped with Milestone 8 on 2026-10-18, decision 0023, so they stay in the fork): configurable registry root (resolves the maintainer's own `TODO` at `core/src/registry/registry.rs:47`), seedable dice, fractional CR, Hit Point Dice on short rest. Everything else upstream is content in his existing JSON format.

## 1. Requirements

**Functional**
- F1. AI DM agent, 2-3 AI player agents and one human drive one engine session through a text UI (demo scope §4).
- F2. The engine, not the AI, decides when a roll happens and resolves it; every roll is citable by id (pass criterion: every roll in a transcript appears in the engine log).
- F3. Per-consumer visibility: a player agent never receives DCs, AC, monster HP or other players' sheets.
- F4. Multi-scene sessions: explore/social scenes, combat, party state carried across scenes, one log per session.
- F5. Deterministic replay from a seed.

**Non-functional**
- N1. Upstream change budget: "super minimal". Each change is a one-item PR the maintainer would accept for his own GUI, with no API concepts in it.
- N2. Contract is the source of truth; code is generated from it. A contract change is visible as a diff in one place before any code changes.
- N3. Two client languages likely (TypeScript for game loop/UI, maybe Python for agents). The contract must not assume Rust.
- N4. Latency is dominated by the LLM (p95 player turn ≤ 10 s); the engine budget is milliseconds. Throughput: one session per engine process, a handful of requests per second. No scaling problem exists here; do not design for one.

**Constraints**
- C1. Team: Stas plus Claude sessions. Upstream: one maintainer, pre-1.0, refactors core types often (last three commits all reshape action/registry types).
- C2. Core loads content from a global `LazyLock` registry rooted at a **compile-time** path (`CARGO_MANIFEST_DIR/../assets/registries`).
- C3. Licences: core MIT; our content CC-BY-4.0 SRD material or original; no strong copyleft; MPL-2.0 only in an unmodified third-party crate named in `deny.toml` (CLAUDE.md Rule 7, decision 0022).

## 2. Decomposition

Four components, four owners. The arrows are compile-time or process dependencies; nothing points back up.

```
                ┌──────────────────────────── our repo StGerman/nat20-table ─────────────────────────────────────┐
                │                                                                                                  │
  human ──► text UI ──► game loop / orchestrator ──► AI DM agent, AI player agents (Claude Agent SDK)              │
                │              │  (TS)                                                                             │
                │              │ spawns, JSON-lines over stdio, typed by  packages/engine-client (generated TS)    │
                │              ▼                                                                                  │
                │      nat20-api-server (Rust bin) ──uses──► nat20-api-contract (wire types, no logic)          │
                │              │                     SOURCE OF TRUTH ──► generated/ JSON Schema ──► generated TS  │
                │              │                                                                                  │
                │              │ cargo git dep, pinned rev                                                         │
                │              ▼                                                                                  │
                │   content overlay (our registry JSON, namespace nat20_demo::)  ◄── tools/data-pipeline          │
                └──────────────┼──────────────────────────────────────────────────────────▲───────────────────────┘
                               ▼                                                          │ validates against
                ┌─ StGerman/nat20 (fork) ── branch `demo` = upstream main + pending item branches ─┐
                │   nat20_core  (rules, registries, .schemas generated by schemars)                │
                └──────────────────────────────┬───────────────────────────────────────────────────┘
                                               │ one-item PRs
                                               ▼
                               MadsWedendahlKruse/nat20 (upstream: core + gui)
```

| Component | Owns | Does not own | Lives in |
|---|---|---|---|
| **Upstream core** (`nat20_core`) | Rules: creatures, actions, rolls, conditions, encounters, rests; registry formats and their schemas | Sessions, viewers, ids for rolls, JSON wire format, AI, scenario data | Upstream repo; our fork stages PRs |
| **Our API package** (`nat20-api-contract`, `nat20-api-server`) | The contract, the session (one log, roll ids, prompt ids, request idempotency, seed), projection per viewer, scene/mode lifecycle, monster stat-block loading until upstream has a format | Rules (always asks core), narration, agent prompts | Our repo, `crates/` |
| **Our game side** | Game loop, DM and player agents, tool binding per agent, text UI, transcripts, audit, scenario files, pregens, maps, lore | Any rule resolution; never computes a roll | Our repo, `game/`, `scenarios/`, `lore/` |
| **Data pipeline** | Foundry → registry JSON translator, 5e-bits → monster numbers, licence filter | Wire contract; it targets core's registry schemas | Our repo, `tools/data-pipeline/`; output either upstreamed (content PRs) or kept in our overlay |

Two contracts exist and they are deliberately different:

| Contract | Owner | Direction | Why that direction |
|---|---|---|---|
| Engine API (wire) | Us | **Contract-first** (contract crate → schema → client code) | Multi-language clients, visibility rules, versioning promises to agents |
| Registry content formats (`assets/registries/.schemas`) | Upstream | Code-first (schemars), his pattern, his freshness test | Not ours to change; we consume it as an input contract pinned by core rev |

## 3. Why the API leaves the fork (Stas's question)

| Option | Upstream diff | Rebase pain | Contract toolchain | Verdict |
|---|---|---|---|---|
| A. `server/` crate in the fork's workspace (today) | Large if ever proposed; maintainer has no headless API and may refuse | Every upstream refactor conflicts with our workspace edits (`Cargo.toml`, `Cargo.lock`) | Node + TypeSpec inside a Rust-only repo he owns | Reject |
| B. Separate Cargo package in the fork, separate workspace | Zero on `main`, but the fork's branches carry non-upstream code | Lower, still a mixed-purpose repo | Same problem | Reject |
| **C. Separate repo, `nat20_core` as pinned git dep** | **Zero** | Only the adapter module feels core churn; bumps are explicit PRs | Lives with its consumers | **Adopt** |

Costs of C, stated plainly:
- A core fix needs push-to-fork, then a rev bump in our repo. Mitigation: local `[patch]` override to a sibling checkout for development (CLAUDE.md draft, "Working across both repos").
- Cargo does not apply a dependency's `[patch]` table. Upstream patches `polyanya` to a git branch, so **our workspace must copy that `[patch.crates-io]` entry** or core builds against the wrong polyanya. Verified in §5.5. *(Retired 2026-10-18: fork `demo` moved to crates.io polyanya 0.16.0, which carries the fix, and both workspaces dropped the patch; TASKS.md UPS-11.)*
- Core reads registries from its own checkout path (C2). That works for a git dependency because Cargo checks out the whole repo, but it means our content can only be added by editing the fork until upstream change U1 lands.

## 4. Repo and crate layout (our repo)

```
nat20-table/                             # github.com/StGerman/nat20-table (named by Stas 2026-10-16)
├── CLAUDE.md                            # from /mnt/project-files/engine/design/CLAUDE.md
├── Cargo.toml                           # workspace: crates/*
├── package.json                         # pinned generators; `npm run gen`
├── contract/                            # contract docs and tests (types live in crates/nat20-api-contract)
│   ├── protocol.md                      # what a schema can't say: ordering, idempotency, lifecycle, visibility table
│   ├── fixtures/*.jsonl                 # conformance transcripts (seeded request → exact response)
│   └── CHANGELOG.md                     # every contract change, with semver
├── generated/                           # checked in, never edited by hand, header says so
│   ├── nat20-api.schema.json            # wire bundle; with the scene and pregen schemas, its sha256 is served by `hello`
│   ├── nat20-scene.schema.json          # scene file format (root SceneFile), read by the engine and the DM agent
│   ├── nat20-pregen.schema.json         # pregen file format (root PregenFile), read by the engine
│   └── nat20-api.schema.sha256          # sha256 over the three schemas, in that order
├── tools/
│   ├── codegen/gen-ts.mjs  check-breaking.mjs
│   └── data-pipeline/                   # Foundry translator, 5e-bits monster import (DAT-1)
├── crates/
│   ├── nat20-api-contract/              # SOURCE OF TRUTH: wire types only (serde + schemars), bin export-schema
│   └── nat20-api-server/
│       ├── src/adapter/                 # ONLY module that imports nat20_core (anti-corruption layer)
│       ├── src/session.rs               # session log, roll ids, prompt ids, idempotency cache, seed
│       ├── src/projection.rs            # fn project(viewer, &FullState) -> generated view types
│       ├── src/monster.rs               # stat blocks until upstream has a format (MON-1)
│       └── src/main.rs                  # stdio JSON-lines loop
├── content/registries/                  # our overlay, namespace `nat20_demo::` (needs U1)
├── packages/engine-client/              # src/generated/api.ts + a thin stdio client (TS)
├── game/                                # orchestrator, agents, tool bindings, text UI (AGT-*)
├── scenarios/  pregens/  maps/          # The Silent Mill, CC-BY-4.0
└── lore/                                # original setting, kept apart
```

Dependency direction (enforced in review, and by `adapter/` being the only `use nat20_core`):
`game → engine-client(generated from contract) → [process boundary] → api-server → api-contract`, and `api-server → nat20_core`. `api-contract` depends only on serde/schemars. Nothing depends on `game`; `nat20_core` depends on nothing of ours; wire types never wrap or re-export core types.

Visibility is made structural, not optional: the contract defines **separate view types** (`CreatureFull` for DM/owner, `CreaturePublic` with a health band for others). The projection function returns the player view type, which has no `hp` field, so a leak is a compile error rather than a forgotten `if`. A fixture-based key scan backs it up in CI.

## 5. Contract pipeline

### 5.1 Tool choice

"Contract-first" here means a process, not a syntax: the contract lives in its own package with no logic and no core dependency, it is changed first and reviewed as the contract, and everything else (other-language types, the published schema, the hash) is generated from it. Two syntaxes satisfy that; both were spiked on the same slice (§5.4).

| Pipeline | Rust types | TS / Python | Moving parts we own | Verdict |
|---|---|---|---|---|
| **Rust contract crate (`nat20-api-contract`, serde + schemars) → JSON Schema → json-schema-to-typescript (/ datamodel-code-generator)** | Hand-written, idiomatic, serde enforces tags and custom checks (`v: 2` rejected) | Generated | None beyond two standard generators | **Recommend** |
| TypeSpec → JSON Schema → cargo-typify + json-schema-to-typescript | Generated by typify (1,398 lines for the slice, builder boilerplate) | Generated | A normalizer script we maintain, plus typify quirks | Strong alternative; pick it if the contract must be authored or read by people who don't read Rust |
| TypeSpec → OpenAPI → progenitor | progenitor emits an HTTP (reqwest) client, useless for stdio | Generated | Same as TypeSpec | Reject; revisit if API-15 adds HTTP |
| Hand-written JSON Schema | Needs typify anyway | Generated | Verbose, no composition | Reject |
| Protobuf / buf | prost | ts-proto | proto3 JSON mapping is not the shape LLM tool calls want | Reject |
| Schema derived from server implementation types (PR #2 as written) | In `server/src/protocol.rs`, next to logic, with an untyped `result: serde_json::Value` | Generated | — | Reject: that is "contract from code"; the problem was where the types lived, not schemars |

Why the Rust contract crate over TypeSpec, plainly:
- Same guarantees where it matters, stronger in Rust: a wrong `cmd` or missing field fails identically, and `v: 2` is rejected by the type itself (the TypeSpec path cannot express that through typify).
- Nothing to maintain: no normalizer, no typify (cargo-typify 0.8, core crate still on 0.10 alphas). Node is needed either way, only for TS generation.
- It is upstream's own pattern (`core/src/registry/schema.rs` + `core/tests/schema_freshness.rs`), so anyone who works in core already knows it.
- Cost: the contract's syntax is Rust. The game side (TS) reviews the generated schema and TS types, not the source. Serde attributes can change wire behaviour without changing the schema (`deny_unknown_fields`, a custom `Deserialize`); the fixtures, not the schema diff, catch those. CLAUDE.md rule: no custom serde impls in the contract crate except validated newtypes like `V1`.

If Stas prefers TypeSpec, every other part of this design stays the same: swap `crates/nat20-api-contract/` for `contract/*.tsp` + `tools/codegen/normalize.mjs`, and `nat20-api-types` becomes generated.

### 5.2 Build steps (`npm run gen`)

Rust contract crate (recommended):
1. `cargo run -p nat20-api-contract --bin export-schema` → `generated/nat20-api.schema.json` (one bundle, root type = every wire type); `export-schema scene` → `generated/nat20-scene.schema.json` (root type `SceneFile`, the scene file format; Milestone 3 spec §4.1).
2. `node tools/codegen/gen-ts.mjs` → `packages/engine-client/src/generated/api.ts` and `scene.ts` (discriminated unions; a request missing `prompt_id`, or a `CreaturePublic` with `hp`, fails `tsc`).
3. (Only if an agent is written in Python) `datamodel-codegen` → pydantic v2 models.
4. sha256 over the wire bundle then the scene bundle → `generated/nat20-api.schema.sha256`, compiled into the server and returned by `hello`; the client refuses to start on mismatch.

TypeSpec replaces step 1 with: `tsp compile contract/` (json-schema emitter, `bundleId`) → `normalize.mjs` (three rewrites, all spike-proven: file `$ref` → `#/$defs/...` or typify panics; string `const` → one-value `enum` or typify emits an untagged enum where `Hello` swallows every request; inline `oneOf` variants so typify emits `#[serde(tag = "cmd")]`) → `cargo typify` into `crates/nat20-api-types/src/generated.rs`.

Pin exact versions of every generator. Generated files are committed, so a Rust-only build never needs Node.

### 5.3 CI checks (GitHub Actions, our repo)

| Job | Runs | Fails when |
|---|---|---|
| `contract-fresh` | `npm ci && npm run gen && git diff --exit-code` | Someone edited generated code, or changed the contract without regenerating |
| `contract-compat` | `tools/codegen/check-breaking.mjs base.json head.json` vs the PR base | Within a major version: a def, property, enum value or command removed; a property newly required; a type narrowed. Passes if `CHANGELOG.md` and `v` record a major bump |
| `contract-pure` (Rust contract only) | `cargo tree -p nat20-api-contract` + grep | The contract crate depends on anything but serde, serde_json, schemars |
| `rust-lint` | `cargo fmt --check`, `cargo clippy --all-targets --all-features -D warnings`, `cargo doc` with warnings denied (check-only build) | Formatting, a lint, or a broken doc comment or link |
| `rust-test` | `cargo test --locked`; the only job that builds binaries, and uploads the engine, the visibility scan and core's registries | Includes the conformance replay: every `contract/fixtures/*.jsonl` replayed against the server with its seed, byte-identical responses |
| `visibility` | `crates/nat20-api-server/tests/visibility.rs` (binary from `rust-test`): replays every fixture and, after each step, asks `get_state` and `events` as every party viewer; scans the responses | Another creature's `hp`, `hp_max`, `temp_hp` or `ac`; any `against`, `dc`, `dc_source` or roll modifiers; a DM-only or another owner's event; an AC or DC number in text |
| `ts` | `tsc`, client tests spawning the server binary from `rust-test` (no Rust toolchain in the job) | Generated TS out of step with server behaviour |
| `deny` | `cargo deny check bans licenses sources` (`deny.toml`) | A dependency under a licence outside the permissive allow-list (Rule 7: no copyleft), a wildcard version, or a crate from an unlisted registry or git source |
| `advisories` (not gating) | `cargo deny check advisories`, also weekly on `main` | A RustSec advisory without a recorded ignore |
| `core-drift` (weekly, non-blocking) | Weekly: clippy and tests against the fork's `demo` HEAD instead of the pinned rev | Upstream moved in a way that breaks `adapter/`; opens a bump task early |
| `ci-ok` (the required check) | Waits for every gating job | Any gating job failed or was cancelled. A skip passes: build jobs skip on a PR that touches only Markdown and `docs/` (job `changes`), `contract-compat` skips on push |

The breaking-change check is our own ~60-line script over the schema bundle rather than a third-party diff tool: the four rules above are all it needs, and it can read our `CHANGELOG.md`.

### 5.4 Spike results (2026-10-16, files in [contract-spike/](contract-spike/))

The same slice of v1 (envelope, `hello`/`get_state`/`submit`, DM vs player state views, error codes) through both pipelines. Versions: TypeSpec 1.5.0, json-schema emitter 1.5.0, cargo-typify 0.8.0, schemars 1.2.1, json-schema-to-typescript 15.0.4, TypeScript 5.6.3.

| Check | TypeSpec + typify | Rust contract crate + schemars |
|---|---|---|
| Source size | 55 lines `.tsp` + 30-line normalizer | 88 lines Rust (incl. 15-line test) |
| Generated Rust | 1,398 lines (typify, builders) | none (the contract is the Rust) |
| Works without a fix-up step | No: raw bundle panics typify (`external references are not supported`); refs-only fix gives a wrong untagged enum | Yes |
| Request dispatch | `#[serde(tag = "cmd")]` after normalizing | `#[serde(tag = "cmd")]` as written |
| Unknown `cmd` | ``unknown variant `sbmit`, expected one of …`` | same |
| Missing field | `missing field \`option_id\`` | `missing field \`prompt_id\`` |
| `v: 2` | Accepted (server must check) | Rejected: `unsupported protocol version 2` |
| TS: request missing `prompt_id` | Compile error | Compile error |
| TS: `hp` on a `CreaturePublic` | Compile error | Compile error |
| TS: type of `v` | `number` | literal `1` |

Spike layout: TypeSpec in `contract-spike/` (root), Rust contract crate in `contract-spike/rust-first/`.

### 5.5 Core as a git dependency (verified)

A fresh crate outside the fork with `nat20_core = { git = "https://github.com/StGerman/nat20", rev = "9aaca2f" }` plus the copied `polyanya` patch builds and loads registries: `classes loaded: 4; root = ~/.cargo/git/checkouts/nat20-…/9aaca2f/core/../assets/registries`. `Cargo.lock` resolves `polyanya` to the patched git branch. Cargo ignores `[patch]` tables in dependencies (documented behaviour), so without the copied entry core would resolve crates.io `polyanya 0.15.1`. Spike manifest: `contract-spike/depcheck/`.

## 6. Minimal upstream change list

> Historical since 2026-10-18 ([decision 0023](../decisions/0023-long-lived-fork.md)): nothing goes upstream. The items below live in fork `demo`; CLAUDE.md Rule 6 says how core changes are made now.

Rule for every item: useful to his GUI and tests on its own, no API vocabulary, his conventions (registry JSON where possible, test in `core/tests`, `docs/PROGRESS.md` row, regenerated `.schemas`, `cargo test --locked` green), one item per PR, branch off upstream `main`.

**Code (4 required, 2 optional)**

| # | Change | Where | Size | Why upstream wants it | Unblocks (TASKS.md) |
|---|---|---|---|---|---|
| U1 | Registry root configurable: read `NAT20_REGISTRY_ROOT` env var in the `LazyLock`, default unchanged | `core/src/registry/registry.rs:47-50` (his `// TODO: Make this configurable?`) | S, ~10 lines + test | Modding, test fixtures, packaged GUI builds that don't sit next to the source tree | Our content overlay; ends "edit the fork to add a monster" |
| U2 | Seedable dice: one `rng` module (thread-local `StdRng`, `seed(u64)`), default seeded from OS so behaviour is unchanged | `components/dice.rs:56`, `components/d20.rs:265,530,537`, `registry/ai.rs:47` | S | Deterministic tests and bug repros | API-11, F5, conformance fixtures |
| U3 | Fractional CR (`ChallengeRating(u8)` cannot hold 1/8, 1/4, 1/2) | `components/level.rs:62` | S | Any SRD low-CR monster has wrong PB/XP today | ENG-2 |
| U4 | Short rest spends Hit Point Dice | `systems/time.rs:203` | S | Rules bug | ENG-4 |
| U5 (opt) | Healing in the action pipeline | actions | M | Needed for any healer class | ENG-3 |
| U6 (opt) | Initiative event | encounter | S | GUI can show initiative rolls | ENG-5 |

**Content (his JSON formats, no code unless a rule needs it)**: Cleric L1-2 + 6 spells (CHR-1/2), Human (CHR-3), Shield/Mace/Chain Shirt/Potion (ITM-1..4), Leather Armor test (ITM-5). Monster stat-block format: **issue first** (MON-1); until he answers, monsters stay in our `nat20-api-server/src/monster.rs`.

**Not proposed upstream, ever**: the server, the contract, sessions, viewers/projection, roll ids, prompt ids, request ids, scenario/anchor formats, anything AI. The earlier plan to "ask the maintainer about the headless API" becomes optional: at most a courtesy issue linking our repo once the demo runs.

**Not needed (checked)**: an event/roll hook in core. Milestone 1 rebuilt the roll log from core's per-entity event logs with no core change. Propose a subscriber hook (issue first) only if that reconstruction proves lossy.

## 7. Migration from today (steps S0-S5; they make up Milestone 2 in CLAUDE.md)

| Step | What | Dest | Size | Depends on |
|---|---|---|---|---|
| S0 | Done 2026-10-16: Stas approved this design, named and created `StGerman/nat20-table`, added it to the project | Stas | — | — |
| S1 | Scaffold: workspace, `nat20-api-contract` + `contract/` with the pipeline from the spike, CI jobs `contract-fresh`, `contract-compat`, `contract-pure`, `rust`, `ts` | Ours | S | S0 |
| S2 | Backfill v1 in the contract crate from `api/contract-v1-draft.md` (not from v0 code: v0 has no consumers and v1 replaces it outright), plus `protocol.md` and first fixtures | Ours | M | S1, the 4 open defaults in the v1 draft |
| S3 | Move `server/` from the fork's `demo` into `crates/nat20-api-server`; swap `protocol.rs` for the contract crate's types; isolate core calls in `adapter/` | Ours | M | S2 |
| S4 | Strip `server/` from fork `demo`; `demo` = upstream main + item branches only (since 2026-10-18: upstream main merged in plus our core changes, CLAUDE.md Rule 6). Close PR #1 (it targets `main`, which must equal upstream) and PR #2 (schema derived from server types; its schemars setup can seed the contract crate) | Fork | S | S3 green |
| S5 | U1 (registry root) and U2 (seedable dice) as one-item branches in the fork, merged into `demo` and pinned. The upstream PRs wait for Milestone 8: demo gaps close first (Stas's rule), except U1 and U2 themselves, which go upstream now (`docs/decisions/0020-send-u1-u2-upstream-early.md`) | Fork | S each | UPS-1 (Actions on) |

Open decision carried from the v1 draft: defaults 2-5 (stdio only, engine-side projection, health bands, hidden AC/DC). Decision 1 there (definition format) is answered by §5.1.

## 8. Risks and what to revisit

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Upstream refactors break `adapter/` on every bump | High (3 type reshapes in the last 3 commits) | One module, hours per bump | Pin rev; weekly `core-drift` job; bumps are their own PRs |
| Maintainer ignores or rejects U1-U4 | Happened 2026-10-18 (decision 0023) | We carry every core change on `demo` indefinitely: about a dozen merged items (20 commits) so far, U9 to U18 next | Merge syncs, never rebase (Rule 6); upstream's patterns kept so conflicts stay small; decision 0023 says when a sync costs too much |
| Generator output shifts on upgrade (schemars, json-schema-to-typescript; plus TypeSpec/typify if chosen) | Medium | Generated diff noise | Exact pins; upgrade only in a dedicated PR with fixtures green |
| Contract crate becomes a dumping ground (logic, helpers, core types creep in) | Medium | Contract stops being reviewable as a contract | `contract-pure` CI job; CLAUDE.md rule; reviewers reject logic there |
| Global registry = one ruleset per process | Certain | Can't host two content sets in one process | One engine process per game; fine for the demo |
| Serde behaviour not visible in the schema (custom impls, `deny_unknown_fields`) | Low | Wire behaviour changes without a schema diff | Only validated newtypes may customise serde; fixtures cover them |
| Python agents later | Low-medium | One more generator | datamodel-code-generator from the same bundle (not spiked) |

Revisit when: mobile or web clients become real (§9), HTTP transport is added (OpenAPI emitter becomes worth it), a second consumer outside our repo appears (publish `engine-client` and the schema as versioned packages, maybe split the repo), or upstream adopts a monster format (delete `monster.rs`).

## 9. If mobile clients (Swift, Kotlin) come later

Checked 2026-10-16: the Rust-contract schema fed to quicktype 23.0.176 (`contract-spike/mobile/`). The view types survive (`CreaturePublic` has no `hp` in Swift or Kotlin), but **every tagged union collapses into one struct with all-optional fields**: Swift `struct Request { cmd: Cmd; viewer, actor, optionID, promptID: String?; … }`, Kotlin `data class State(creatures: List<CreatureFull>? , me: CreatureFull?, others: …?)`. A `submit` without `prompt_id` compiles. That is a JSON Schema problem, so the TypeSpec → JSON Schema path has it too.

It does not change the engine contract decision, because a phone must never talk to the engine:
- The engine contract carries the DM view (DCs, monster HP, scenario data). Anything sent to a device its owner controls can be read, so hidden data has to stop at a server.
- The agents need Claude API keys, which cannot ship inside an app. So the game loop runs on a server, and the engine sits behind it.
- An engine compiled onto the device (UniFFI bindings for Swift and Kotlin) fails on both counts. Reject.

What mobile adds is a second, public contract: game server ↔ clients (terminal UI, web, iOS, Android). It carries only the human player's view, narration, chat and the player's intents, and it needs streaming. For that contract:

| Option | Swift | Kotlin | TS server | Streaming | Verdict |
|---|---|---|---|---|---|
| **Protobuf + Connect (buf)** | swift-protobuf / connect-swift, `oneof` becomes an enum | Wire or connect-kotlin, `oneof` becomes a sealed type | protobuf-es / connect-es | Built in | Recommend when mobile is real |
| TypeSpec → OpenAPI → openapi-generator | `oneOf` + discriminator support varies by generator | same | yes | SSE/WebSocket outside OpenAPI | Second choice |
| JSON Schema + quicktype | Unions collapse (shown above) | Unions collapse | yes | n/a | Reject for clients |

The earlier objection to protobuf (its JSON mapping is not the shape LLM tool calls want) applies to the engine contract, not to this one: no LLM reads the client wire. Two contracts with two audiences, and the game server maps between them, which is exactly where the visibility boundary already sits.

Update 2026-10-17: AG-UI is now a candidate for this contract too, likely the better fit if a web client comes first; the choice between it and protobuf + Connect waits until a real client is planned (`docs/decisions/0016-client-contract-deferred.md`).

What to do now, while mobile is hypothetical: nothing on the wire. Keep the terminal UI behind an in-process boundary in `game/` (player events out, player intents in), so it can later be lifted onto a network contract without touching the engine contract.
