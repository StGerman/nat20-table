# 0022. CI: build the workspace once, cargo-deny for licences, advisories and core drift off the PR gate

- **Status:** Proposed
- **Date:** 2026-10-17
- **Decided by:** Claude (thread "CI workflows"), defaults picked when Stas asked for "CI with clippy and all other stuff for a project like this"; accepted when Stas merges the PR.

## Context

Before this record `ci.yml` had three jobs: one combined `contract` job, `rust` and `ts`. CLAUDE.md and design §5.3 promised seven, including `visibility` and `core-drift`, which did not exist (TASKS.md CON-5, CON-6). Nothing checked dependency licences, although Rule 7 forbids shipping copyleft code.

Facts that shape the choices:

- A cold debug build of the workspace takes about 5 minutes on a 16-core machine and longer on a hosted runner; `nat20_core` and its geometry crates dominate. The repo is private, so runner minutes are billed.
- The server binary reads `nat20_core`'s registries from its cargo git checkout at run time, so a job that reuses a built binary must still run `cargo fetch`.
- Today's graph (cargo-deny 0.18.9): every licence is permissive except `smartstring` (MPL-2.0, file-level copyleft) via `nat20_core -> rhai`. `nat20_core` declares no licence in its manifest; upstream's LICENSE is MIT. Two RustSec advisories, both "unmaintained" with no vulnerability: `paste` (RUSTSEC-2024-0436) and `smartstring` (RUSTSEC-2026-0249), both reached through upstream.

## Options

### Build reuse for `ts` and `visibility`

#### A. Each job builds what it needs
- Pro: jobs run in parallel; no artifacts.
- Con: three cold builds of the same workspace per push.

#### B. `rust` builds once and uploads the server and the visibility scan binary; `ts` and `visibility` download them
- Pro: one build per push; `ts` and `visibility` take about a minute each.
- Con: they wait for `rust`, so wall-clock time is `rust` plus a minute.

#### C. Fold `visibility` and `ts` into `rust` as steps
- Pro: one job, no artifacts.
- Con: no separate required checks with the names CLAUDE.md promises; Node setup in the Rust job.

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

- Build reuse B: `rust` is the only job that builds the workspace.
- cargo-deny A, with a permissive allow-list, an MPL-2.0 exception for `smartstring` only, a clarification that `nat20_core` is MIT, and the two "unmaintained" advisories ignored with reasons. Our crates set `publish = false` so cargo-deny accepts their path dependencies.
- Advisories B, toolchain A, update bot A. Dependabot ignores `nat20_core` and `polyanya`, which Rule 5 bumps by hand.
- `core-drift` runs weekly and on demand, never on PRs: it repoints `nat20_core` at fork `demo` HEAD and runs clippy and tests. It opens nothing (Rule 8: no GitHub issues); a red run emails whoever owns the schedule.
- Third-party actions are pinned to commit SHAs with the version in a comment. `GITHUB_TOKEN` is read-only. Superseded PR runs are cancelled.

## Consequences

- Required checks on `main` (Stas sets them in branch protection): `contract-fresh`, `contract-compat`, `contract-pure`, `rust`, `visibility`, `ts`, `deny`.
- CON-5 (contract-compat and visibility scan in CI) and CON-6 (weekly core-drift) are served.
- A new dependency under a licence outside the allow-list fails `deny`; adding it needs a reviewed `deny.toml` change, and a copyleft one is refused under Rule 7.
- A clippy release can break CI without a code change; the fix is a code change or a toolchain pin under this record's "Revisit when".

## Revisit when

- Stable clippy breaks CI on an unchanged `main` more than once a quarter: pin the toolchain (Toolchain B).
- `rust` runtime exceeds 20 minutes warm: consider splitting tests or a larger runner.
- Upstream or nalgebra drops `paste` or rhai drops `smartstring`: remove the ignores and the MPL exception.
- Any advisory with a real vulnerability appears: it is fixed or the dependency replaced, never ignored without Stas.

## Sources

- `docs/design/system-design.md` §5.3; CLAUDE.md Rules 5, 7, 8.
- `.github/workflows/ci.yml`, `.github/workflows/weekly.yml`, `.github/dependabot.yml`, `deny.toml`.
- TASKS.md CON-5, CON-6.
