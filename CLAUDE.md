# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## What this is

An AI-run D&D 5e game (2024 rules, SRD 5.2.1). An AI DM agent and AI player agents (Claude Agent SDK), plus one human player, play through a text UI. Every rule is resolved by the Nat20 rules engine (`nat20_core`, upstream https://github.com/MadsWedendahlKruse/nat20, our long-lived fork https://github.com/StGerman/nat20), which this repo (https://github.com/StGerman/nat20-table) wraps in a typed JSON-lines API over stdio.

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
  1. One unattended playthrough with every character an AI player, and one played by Stas, each run Scene 1 to 6 in 120 minutes or less, on the same build (decision 0043).
  2. Every roll in the transcript appears in the engine log.
  3. No narration contradicts engine state or a character's inventory.
  4. AI player turn p95 is 10 s or less; DM narration p95 is 6 s or less: measured and reported; the optimisation milestone gates it.
  5. Every rejected decision recovers within 2 retries.
  6. A first-time player finishes using only `/options` and `/sheet`: checked in friends-and-family testing after Milestone 7.

## Milestones

Status, exit criteria and task ids for each milestone are in `TASKS.md` § Milestones. Work one milestone at a time, in order, unless the task list says a row is independent.

1. Fighter vs Goblin Warrior through the headless API (done 2026-10-16)
2. Repo split and contract v1
3. Exploration and checks (done 2026-10-18)
4. The party: Cleric and healing, Human, items, pregens (done 2026-10-21)
5. Monsters (done 2026-10-23)
6. Agents at the table: one full scene with the DM agent, player agents and a human
7. Demo acceptance: one unattended all-AI playthrough and one played by Stas

Milestone 8 (upstream proposal) was dropped on 2026-10-18: upstream declines AI-authored contributions (`docs/decisions/0023-long-lived-fork.md`).

## Design in brief

- **Core** (`nat20_core`) owns the rules. It lives in our fork: `main` mirrors upstream, and `demo` is upstream `main` merged in regularly plus our own core changes (Rule 6).
- **This repo** holds everything that is ours:
  - the API package: the contract crate and the server;
  - the game side: game loop, agents, text UI, scenarios, pregens, maps, lore;
  - the data pipeline: Foundry structured fields and 5e-bits numbers into registry JSON.
- Two contracts:
  - the engine wire is ours and contract-first (Rule 1);
  - the registry formats are core's (upstream's plus ours on `demo`), generated from core code, and we consume them as pinned by the core rev.

## Commands

```bash
npm ci && npm run gen                     # regenerate everything from the contract crate: schema bundle, schema hash, TS types
npm run check:contract                    # regen + `git diff --exit-code` + breaking-change check against origin/main
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --locked                       # unit tests, conformance fixture replay, visibility scan
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --document-private-items   # doc comments build clean
cargo deny check                          # licences (Rule 7), advisories, bans, sources; config in deny.toml
cargo test --locked -p nat20-api-server --test conformance -- <fixture_name>   # one fixture
npm run check:ts                          # tsc + client tests; needs `cargo build -p nat20-api-server` first
cargo run -p nat20-api-server             # the engine: JSON-lines on stdin/stdout, logs on stderr
cargo run -p nat20-api-contract --bin export-schema   # step 1 of `npm run gen`
cargo run -p nat20-duel -- --seed 1 --fixture contract/fixtures/duel.jsonl    # re-record the seeded duel fixture after a deliberate behaviour change
```

Run `check:contract`, the cargo checks above (fmt, clippy, test, doc, deny) and `check:ts` before every push. Never push red.

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
| `content/registries/` | Our registry overlay, namespace `nat20_demo::` (needs U1, in fork `demo`) | Yes |
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
- Only `crates/nat20-api-server/src/adapter/` may `use nat20_core`. Core churn stays inside that module.
- Never work around a core rule in our code. If core is wrong or missing something, fix it in the fork (Rule 6) and pin to it.
- To develop against a local fork checkout, add `[patch."https://github.com/StGerman/nat20"] nat20_core = { path = "../nat20/core" }` to `.cargo/config.toml`. Never commit it.

## Rule 6: working in the fork (`StGerman/nat20`)

Upstream declines AI-authored contributions, so nothing goes upstream and the fork is ours for good (`docs/decisions/0023-long-lived-fork.md`).

- The fork's `main` mirrors upstream `main` exactly. Change it only by fast-forwarding it to upstream.
- `demo` is our engine branch: upstream `main` plus our core changes. Sync it by merging the fork's `main` into `demo` in a `core/sync-upstream` PR when upstream moves. Never rebase or force-push `demo`, because nat20-table pins its commits by rev.
- PRs into `demo` merge with a merge commit, never squash or rebase-merge. That keeps a pinned branch head reachable from `demo`, and keeps upstream as a merge parent so the next sync doesn't re-conflict. A table pin may name an open core PR's head (stacked work); once that PR merges, the merge commit keeps the head reachable from `demo`.
- `demo` holds core and fork upkeep only: core code, registry JSON, core tests, plus the fork's CI workflows, `dependabot.yml`, `deny.toml` and `rust-toolchain.toml`. Never the server, the contract, game code, CLAUDE.md, scenario data or lore.
- Generic SRD content (classes, species, spells, items) goes into core's own registry tree on `demo`, with core's ids, as the Milestone 4 spec does. If upstream later adds the same id, the sync PR keeps one copy and says which. Content that exists only for our adventure goes into this repo's `content/registries/` overlay under `nat20_demo::`.
- Core never contains API vocabulary: session, viewer, projection, roll id, prompt id, request id, JSON wire, AI. Core stays a rules engine; anything about the API lives in this repo's adapter.
- Each core change gets its own `core/<topic>` branch off `demo` and a PR into `demo`. Keep it close to the maintainer's patterns so syncs stay cheap:
  - registry JSON over code;
  - a test in `core/tests/`;
  - regenerated `assets/registries/.schemas` (his freshness test must pass);
  - when the PR adds or changes a rules feature, its row in `docs/PROGRESS.md` in his format (padded tables, implementation and test links, notes on what is missing); adventure-only content in our overlay gets no row;
  - `cargo test --locked` green.
- Keep his MIT `LICENSE` and commit history intact. Core commits take the normal attribution; the upstream-bound authorship convention is retired.

## Rule 7: content and licences

- The ruleset is 2024 (SRD 5.2.1). 2014 data only fills missing fields.
- Allowed sources:
  - SRD 5.1 and 5.2 (CC-BY-4.0), with attribution;
  - Foundry dnd5e: **structured fields only**, from records tagged CC-BY-4.0. Never its text, art, pregens or 2014 packs;
  - 5e-bits numbers;
  - our own text.
- Never download, scrape or ingest WotC books or D&D Beyond content, even with a purchased login. Never ship strong-copyleft (GPL, AGPL, LGPL-only, CC-BY-SA) code or data. Weak, file-level copyleft (MPL-2.0) is allowed only in an unmodified third-party crate, each named as an exception in `deny.toml` (decision 0022).
- Known data bugs:
  - 5e-bits applies the Goblin Warrior's extra 1d4 on every hit; the rule is Advantage only.
  - Ancient Red Dragon, Remorhaz and Will-o'-Wisp have scrambled ability scores in the SRD text; use 5e-bits for those three.

## Rule 8: tasks, PRs, CI

- `TASKS.md` is the only task list: no GitHub issues and no TODO comments without a row. Every PR that closes or creates a gap updates its row in the same PR. ID prefixes: API, ENG, MON, CHR, ITM, CHK, MAP, AGT, UPS, DAT, CON.
- Each row carries Pri (P0 blocks a demo run, P1 needed for acceptance, P2 optional), Dest (Fork, Ours; older `Up` and `Up?` rows read as Fork), Size and Status (todo, partial, done, won't do; won't do counts as closed and says why). The Gate column is retired with Milestone 8.
- When the last row of a milestone closes and its exit criterion holds, mark the milestone done in `TASKS.md` with the date.
- One concern per PR. Write the PR description as Before / After / How.
- Stacked PRs (each one based on the branch of the open PR below it) are linked as a GitHub stack ([`gh stack`](https://docs.github.com/en/pull-requests/reference/stacked-prs-cli-commands)). Locally that is `gh stack submit` or `gh stack link`. A Claude session can't install the extension and has no GraphQL, so it uses the [REST API](https://docs.github.com/rest/pulls/stacks): `POST repos/{owner}/{repo}/stacks` with `pull_requests` listed from bottom to top, then `POST repos/{owner}/{repo}/stacks/{n}/add` for each new PR on top.
- Every PR we open, code or docs, gets a Claude code review (`/engineering:code-review`) against `.github/copilot-instructions.md` before it goes to Stas.
  - Each finding is fixed or answered the way Copilot findings are: a reply quoting the fix commit's message, or the reason it stays, with the Claude Code footer.
  - The verdict goes on the PR as a review comment in this shape: 🟢 Approved (no open findings) or 🟠 Changes recommended (open findings, listed), and the review re-runs on every new head until it is 🟢.
  - A Copilot round is extra, when its quota allows.
- Name PRs and branches after their repo. A PR title is a lowercase repo prefix, a colon and plain English: `table:` for this repo, `core:` for the fork `StGerman/nat20` (`table: Character sheets (get_sheet)`). Branches use the same stem as `<repo>/<topic>` in kebab-case (`table/short-rest`, `core/hit-point-dice`). Refer to PRs as `table #N` or `core #N`, never by a bare number; `upstream #N` names the closed upstream PRs and issue. Dependabot PRs and branches keep their own names.
- A PR that makes or changes a decision with real alternatives adds or updates its record in `docs/decisions/` (options with pros and cons, who decided, when to revisit) in the same PR.
- Never skip, disable or quarantine a test to get green. Never push an empty commit to retrigger CI.
- CI jobs: `contract-fresh`, `contract-compat`, `contract-pure`, `rust-lint`, `rust-test`, `rust-test-arm64`, `visibility`, `ts`, `deny`, `advisories` (not gating), and the weekly non-blocking `core-drift`; `ci-ok` passes only when every gating job passed or was skipped on purpose, and is the one required check. Each job's purpose is in design §5.3; why CI is shaped this way is decision 0022.

## Rule 9: dependencies

Stay current, behind a cooldown and hard gates, in both repos (`docs/decisions/0024-dependency-policy.md`). The config that enforces it is TASKS.md UPS-11 to UPS-15. Where a line below says "until UPS-n", the interim rule applies until that row is done.

- Dependabot runs weekly on cargo, npm, GitHub Actions and the Rust toolchain. In the fork it runs on `demo`, which must be the default branch because Dependabot reads its config only there. It waits 3 days after a patch release and 7 after a minor or major one; Actions and the toolchain wait 7 days for any release. Security updates skip the wait and merge within 48 hours.
- Breaking means a new major, or a new minor of a 0.x crate (Cargo semver). Dependabot can't tell a 0.x minor from a 1.x minor, so the grouped cargo PR carries patch updates only, and each cargo minor arrives as its own PR.
- Grouped patch PRs, npm and Actions minor and patch PRs, and cargo minor PRs of crates at 1.0 or later are merged by Claude once CI is green, within 7 days.
- A breaking bump becomes its own `core/deps-<crate>` or `table/deps-<crate>` PR with the code it needs, reviewed by Stas, adopted within 30 days. A crate held back longer needs a TASKS.md row saying why.
- Nothing merges on red. `cargo deny check bans licenses sources` gates PRs in both repos. `advisories` stays off the gate (decision 0022) and runs daily on a schedule; a red run gets a P0 row the same day. In the fork, deny covers `nat20_core`, not his GUI (UPS-13).
- Lockfiles are committed and builds run `--locked`. Our workflows pin Actions by commit SHA; upstream's own workflow files in the fork are left as he wrote them, so syncs don't conflict. Committed manifests take git dependencies only from our own repos, pinned by `rev`, never `branch`.
- The Rust toolchain is pinned to an exact stable release in `rust-toolchain.toml` in both repos. Each new release arrives as its own Dependabot PR after the 7-day wait. If CI is green on it unchanged, Claude merges it within 7 days. If the release needs lint or code fixes, Claude adds them to that PR and Stas reviews it (decision 0027).
- The crates whose types cross the core boundary (hecs, parry3d, uom, rerecast) reach this repo only through `nat20_core`'s re-exports (`nat20_core::<crate>`, UPS-15), so they move with the core pin and nowhere else. Never add them as direct dependencies.
- In an upstream sync, Cargo.toml keeps the higher version of each crate and Cargo.lock is regenerated with cargo, never merged by hand.
