# 0024. Dependencies: stay current behind a cooldown and hard gates, in both repos

- **Status:** Proposed
- **Date:** 2026-10-18
- **Decided by:** Stas asked for a policy that keeps dependencies "safe and on the edge" (project thread "Mads's reply", 2026-10-18). The specifics below are Claude's recommendation; merging the PR that adds this record accepts it.

## Context

Since [0023](0023-long-lived-fork.md) the fork's dependencies are ours to maintain. Until now they followed upstream and table could not move them. Audit of fork `demo` 031f7a2 on 2026-10-18 (cargo-deny 0.20.2 with table's `deny.toml`; versions from crates.io; details in project files `engine/deps/nat20-dependency-audit-2026-10-18.md`):

- `nat20_core` passes advisories, licences, sources and bans. The two tolerated advisories are both "unmaintained, no vulnerability": paste and smartstring (via rhai). His GUI fails our policy, but table never builds it.
- The direct dependencies that matter are behind:

  | Crate | Locked | Latest |
  |---|---|---|
  | parry3d | 0.24 | 0.31 (7 breaking releases) |
  | rerecast | 0.2 | 0.4 |
  | mlua | 0.10 | 0.12 |
  | polyanya | 0.15 | 0.17 |
  | hecs | 0.10 | 0.11 |
  | uom | 0.37 | 0.38 |
  | rand | 0.9 | 0.10 |
  | rstest | 0.25 | 0.27 |
  | strum | 0.27 | 0.28 |

- rstest, a test framework, sits in core's `[dependencies]`.
- polyanya is patched to a branch in the maintainer's personal repo. If he deletes that branch, both repos stop building. The patch is obsolete: the fix's guard `if next_i >= self.path.len()` is in the published polyanya 0.16.0 (`src/lib.rs:116`) and 0.17.1.
- table cannot bump hecs, parry3d, rerecast or uom on its own. The adapter names core's types from them, so a lone bump builds a second copy and fails. Dependabot ignores them (table #21), and Dependabot PRs that tried were closed (table #15, #16, #18, #19).
- table already pins Actions by commit SHA, builds with `--locked`, runs cargo-deny as a gating job and runs advisories weekly. The fork has no CI at all (UPS-1).

## Options

### A. Bump only for a reason (advisory, bug, needed feature)
- Pro: smallest diff against upstream `main`, so syncs (0023) stay cheapest.
- Con: drift accumulates into big-bang upgrades (parry3d is already seven releases back).
- Con: we miss non-advisory fixes, and a security fix may land only on a release we are several breaking versions behind.

### B. Stay current behind a cooldown, with hard gates (recommended)
- Pro: small, frequent, reviewable bumps; security fixes land on a version we already run.
- Pro: the cooldown skips the window in which most compromised or broken releases are caught and yanked.
- Con: every core bump of a crate the maintainer also uses is a standing difference from his `main`, so a sync can conflict, or merge cleanly and then fail to compile because his new code targets the older API.
- Con: about one grouped PR per repo per week to merge, plus a breaking bump now and then.

### C. Bleeding edge: no cooldown, nightly `cargo update`, auto-merge everything
- Pro: always the newest release.
- Con: exposed to a hijacked or broken release on day zero, exactly the case a cooldown exists for.
- Con: churn without review; breaking bumps still need code, so auto-merge can't cover them anyway.

## Decision

B. Both repos stay current on every direct dependency (cargo, npm, GitHub Actions), with these rules:

1. **Freshness target.**
   - A minor or patch release is merged within 7 days of its cooldown ending.
   - A breaking release (a new major, or a new minor of a 0.x crate) is adopted within 30 days.
   - A crate held back longer needs a TASKS.md row saying why.
   - Measured by the age of open Dependabot PRs.
2. **Cooldown.**
   - Dependabot waits 3 days after a minor or patch release and 7 days after a breaking one.
   - Security updates skip the cooldown and are merged within 48 hours.
3. **Gates.** Nothing merges unless CI is green in its repo.
   - table: `ci-ok`.
   - fork: a new CI on `demo` with `cargo test --locked` for the whole workspace, schema freshness, and `cargo deny check` against the same policy as table's `deny.toml`.
   - `advisories` runs on a daily schedule in both repos. A red run gets a P0 row the same day.
4. **Supply chain.**
   - Lockfiles stay committed and every build is `--locked`.
   - Actions stay pinned by commit SHA.
   - Git dependencies are allowed only for our own repos, pinned by `rev`, never `branch`. polyanya moves to crates.io and the `[patch]` goes.
   - npm installs are `npm ci` with exact versions.
   - Every `deny.toml` exception keeps its reason and is reviewed whenever the crate that pulls it in moves.
5. **One home per version.**
   - core re-exports the crates whose types appear in its public API (hecs, parry3d, uom, and rerecast if the adapter needs it) as `nat20_core::<crate>`.
   - table's adapter uses those paths and drops its direct dependencies on them, and with them the four Dependabot ignores. Those versions then move only with the core pin (Rule 5).
6. **Who merges what.**
   - Dependabot runs weekly in both repos. In the fork it targets `demo`.
   - Minor, patch and Actions updates come as one grouped PR per ecosystem. Claude merges them once CI is green, the same delegation table already has.
   - A breaking bump becomes a Claude-authored `core/deps-<crate>` or `table/deps-<crate>` PR with the code changes it needs, reviewed by Stas like any other. The matching Dependabot PR is closed as superseded.
   - After a fork bump merges, the table pin PR follows (Rule 5). The weekly `core-drift` job shows when one is due.
7. **Toolchain.** Latest stable Rust, no pinned toolchain file. New stable lints are fixed when they turn CI red, not suppressed.
8. **Syncing with upstream.**
   - In a sync merge, Cargo.toml takes the higher version of each crate. Cargo.lock is regenerated with cargo, never merged by hand.
   - A sync that compiles cleanly but fails because his new code targets an older API we have moved past is fixed in the sync PR.

## Consequences

- New TASKS.md fork-upkeep rows:
  - fork CI and Dependabot on `demo`, which need Stas to enable Actions and make `demo` the fork's default branch (UPS-1);
  - polyanya to crates.io;
  - rstest to dev-dependencies;
  - the re-exports and dropping table's lockstep dependencies;
  - catching up the breaking backlog, one crate per PR;
  - cooldown and the daily advisories schedule in table.
- Cost: the one-time backlog is large mainly because of parry3d. Afterwards expect one grouped PR per repo per week, a breaking bump every few weeks, and occasional sync conflicts in the crates the maintainer also bumps (most likely parry3d, hecs and rand).
- Stas enables Dependabot alerts and security updates on both repos. They are repository settings, so they can't be set from a session.

## Revisit when

- Sync conflicts from our bumps cost more than a day in a month.
- A release that passed the cooldown and the gates still breaks a build or ships a vulnerability; tighten the cooldown or add a gate.
- The maintainer moves to the same versions, so we can drop back to following him.

## Sources

- Project files `engine/deps/nat20-dependency-audit-2026-10-18.md`.
- `.github/dependabot.yml`, `deny.toml`, `.github/workflows/ci.yml` and `weekly.yml` in this repo; decision [0022](0022-ci-shape.md).
- polyanya 0.16.0 and 0.17.1 crate sources from crates.io; vleue/polyanya PR 124.
