# 0022. CI: parallel lint and test, one build, one required gate, cargo-deny, advisories and core drift off the gate

- **Status:** Accepted (Stas merged nat20-table #10 on 2026-10-17)
- **Date:** 2026-10-17
- **Decided by:** Claude (thread "CI workflows"), defaults picked when Stas asked for "CI with clippy and all other stuff for a project like this"; job split, ordering and the single gate reworked after Stas asked whether to split the slow `rust` job and which jobs should wait on others (same thread, 2026-10-17). Accepted when Stas merges the PR.

## Context

Before this record `ci.yml` had three jobs: one combined `contract` job, `rust` and `ts`. CLAUDE.md and design §5.3 promised seven, including `visibility` and `core-drift`, which did not exist (TASKS.md CON-5, CON-6). Nothing checked dependency licences, although Rule 7 forbids shipping copyleft code.

Facts that shape the choices:

- A cold debug build of the workspace takes about 5 minutes on a 16-core machine and longer on a hosted runner; `nat20_core` and its geometry crates dominate. The repo is private, so runner minutes are billed.
- The server binary reads `nat20_core`'s registries from its cargo git checkout at run time, so a job that reuses a built binary must still run `cargo fetch`.
- Measured on PR #10 with a cold cache: the single `rust` job spent 4m46s in clippy and was still building tests 7m40s later; split into parallel jobs, `rust-lint` took 3m28s and `rust-test` 8m06s, and the whole run 9m21s. Downstream `ts` and `visibility` take 15 s and 8 s on downloaded binaries. Before this PR, warm runs on `main` took about 1 minute.
- Local cold build of all test targets (16 cores): full debug info 276 s and 3.3 GB of `target/`; `line-tables-only` 233 s and 1.9 GB; no debug info 216 s and 1.1 GB. Tests run in 2-3 s in every case.
- Today's graph (cargo-deny 0.18.9): every licence is permissive except `smartstring` (MPL-2.0, file-level copyleft) via `nat20_core -> rhai`. `nat20_core` declares no licence in its manifest; upstream's LICENSE is MIT. Two RustSec advisories, both "unmaintained" with no vulnerability: `paste` (RUSTSEC-2024-0436) and `smartstring` (RUSTSEC-2026-0249), both reached through upstream.

## Options

### Job split

#### A. One `rust` job: fmt, clippy, test, doc in sequence
- Pro: one job, one cache.
- Con: clippy only builds metadata, so `cargo test` compiles every dependency again with codegen. On a cold cache the two run back to back (first PR run: clippy 4m46s, then the test build on top).

#### B. `rust-lint` (fmt, clippy, doc) and `rust-test` (test) in parallel, each with its own cache
- Pro: cold wall-clock drops to the slower of the two instead of their sum; no extra compute, because the two builds share almost nothing.
- Pro: a lint failure and a test failure show as separate checks.
- Con: two caches instead of one.

#### C. Finer splits (per crate, per test target, nextest partitions)
- Con: every job pays toolchain, checkout and cache restore again for a test suite that runs in about 2 s; nothing to gain until tests take minutes.

### Build reuse for `ts` and `visibility`

#### A. Each job builds what it needs
- Con: three cold builds of the same workspace per push.

#### B. `rust-test` uploads the server, the visibility scan binary and core's registries; `ts` and `visibility` download them
- Pro: one full build per push; the binaries find the registries through `NAT20_REGISTRY_ROOT` (U1), so neither job installs Rust.
- Con: they wait for `rust-test`.

### Ordering between jobs

#### A. Gate expensive jobs on cheap ones (fmt, contract checks first)
- Pro: saves the build when a cheap check fails.
- Con: adds the cheap jobs' latency (30-70 s) to every green run to save compute only on red runs, which `cancel-in-progress` already cuts short when the fix is pushed.

#### B. Edges only for real data dependencies
- Pro: shortest path to green; `ts` and `visibility` wait for `rust-test` because they run its binaries, nothing else waits.

### Docs-only PRs

#### A. Always build
- Con: decision records, specs and CLAUDE.md edits (most PRs so far) pay a full Rust build for nothing.

#### B. A `changes` job skips the build jobs when a PR touches only Markdown and `docs/`
- Pro: those PRs finish in about a minute.
- Con: a required check that is skipped by a path filter leaves a plain required check pending forever, so it needs a gate job (below).

### Required checks

#### A. Mark every job required in branch protection
- Con: every job rename or split, and every path-filtered skip, needs a settings change by Stas.

#### B. One `ci-ok` job that needs every gating job and passes when each passed or was skipped on purpose
- Pro: branch protection names one check, forever.

### Build settings

#### A. Keep full debug info in CI
- Con: larger objects, slower links, bigger caches; nobody attaches a debugger to a CI run.

#### B. `line-tables-only` debug info in CI (panics and backtraces still name file and line)
- Pro: see the measurement under Context.

### Dependency policy

#### A. cargo-deny (licences, advisories, bans, sources)
- Pro: one tool and one config for Rule 7 licences, RustSec advisories, wildcard bans and the git-source allow-list (only our fork and upstream's polyanya patch).
- Con: one more config file to keep.

#### B. cargo-audit only
- Pro: simplest advisory check.
- Con: no licence check, so Rule 7 stays unenforced.

### Advisories on PRs

#### A. Required check
- Con: a new advisory published upstream turns every open PR red for reasons unrelated to it.

#### B. Run on every PR and weekly on `main`, not required
- Pro: visible on PRs, blocks nothing unrelated; the weekly run catches new advisories with no PR open.

### Toolchain

#### A. Latest stable via `dtolnay/rust-toolchain`
- Pro: no toolchain file to bump; matches what contributors install.
- Con: a new clippy lint can turn CI red on a day nothing changed.

#### B. `rust-toolchain.toml` pinned
- Pro: reproducible.
- Con: someone bumps it by hand; Dependabot does not.

### Update bot

#### A. Dependabot (cargo, npm, GitHub Actions), weekly, grouped
- Pro: built into GitHub, no app to install; updates the SHA-pinned actions.
- Con: less flexible grouping than Renovate.

#### B. Renovate
- Pro: richer grouping, can bump a toolchain file.
- Con: an app Stas has to install and configure.

## Decision

- Job split B, build reuse B, ordering B, docs-only B, required checks B, build settings B.
- cargo-deny A, with a permissive allow-list, an MPL-2.0 exception for `smartstring` only, a clarification that `nat20_core` is MIT, and the two "unmaintained" advisories ignored with reasons. Our crates set `publish = false` so cargo-deny accepts their path dependencies.
- Advisories B, toolchain A, update bot A. Dependabot ignores `nat20_core` and `polyanya`, which Rule 5 bumps by hand.
- Caches are saved only from `main`, so PR runs restore `main`'s dependencies and the repo's 10 GB cache budget is not spent on short-lived PR caches.
- `core-drift` runs weekly and on demand, never on PRs: it repoints `nat20_core` at fork `demo` HEAD and runs clippy and tests. It opens nothing (Rule 8: no GitHub issues); a red run emails whoever owns the schedule.
- Third-party actions are pinned to commit SHAs with the version in a comment. `GITHUB_TOKEN` is read-only. Superseded PR runs are cancelled.

## Consequences

- Branch protection on `main` needs one required check: `ci-ok`.
- CON-5 (contract-compat and visibility scan in CI) and CON-6 (weekly core-drift) are served.
- A new dependency under a licence outside the allow-list fails `deny`; adding it needs a reviewed `deny.toml` change. CLAUDE.md Rule 7 now bans strong copyleft (GPL, AGPL, LGPL-only, CC-BY-SA) and allows MPL-2.0 only in an unmodified third-party crate named as an exception; `smartstring` is the only one. This amendment is Stas's call, asked on a decision card in the thread; if he forbids MPL, the exception goes and `deny` stays red until upstream drops `rhai` or `rhai` drops `smartstring`.
- A clippy release can break CI without a code change; the fix is a code change or a toolchain pin under this record's "Revisit when".

## Revisit when

- Stable clippy breaks CI on an unchanged `main` more than once a quarter: pin the toolchain (Toolchain B).
- `rust-test` exceeds 10 minutes warm, or tests themselves take minutes: partition tests (Job split C) or use a larger runner.
- Upstream or nalgebra drops `paste` or rhai drops `smartstring`: remove the ignores and the MPL exception.
- Any advisory with a real vulnerability appears: it is fixed or the dependency replaced, never ignored without Stas.

## Sources

- `docs/design/system-design.md` §5.3; CLAUDE.md Rules 5, 7, 8.
- `.github/workflows/ci.yml`, `.github/workflows/weekly.yml`, `.github/dependabot.yml`, `deny.toml`.
- TASKS.md CON-5, CON-6.
