# 0024. Dependencies: stay current behind a cooldown and hard gates, in both repos

- **Status:** Accepted (by Stas, merging table #44)
- **Date:** 2026-10-18
- **Decided by:** Stas asked for a policy that keeps dependencies "safe and on the edge" (project thread "Mads's reply", 2026-10-18). The specifics below are Claude's recommendation; Stas accepts them by merging table #44.

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
- table already pins Actions by commit SHA, builds with `--locked`, gates PRs on cargo-deny's bans, licenses and sources checks, and runs advisories weekly off the gate (decision 0022). In the fork, `demo` carries upstream's `.github/workflows/rust.yml`: build and test on pushes and PRs to `main`, `actions/checkout@v4` pinned by tag. Actions are disabled on the fork, so nothing runs (UPS-1).

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
   - A non-breaking release is merged within 7 days of its cooldown ending.
   - A breaking release (a new major, or a new minor of a 0.x crate, as Cargo semver counts it) is adopted within 30 days.
   - A crate held back longer needs a TASKS.md row saying why.
   - Measured by the age of open Dependabot PRs.
2. **Cooldown.**
   - Dependabot waits 3 days after a patch release and 7 days after a minor or major one (`semver-patch-days: 3`, `semver-minor-days: 7`, `semver-major-days: 7`). Dependabot reads versions literally, so 7 days on every minor is how a 0.x minor gets the breaking cooldown.
   - Until the cooldown is configured (UPS-14), Claude checks release ages by hand before merging.
   - Security updates skip the cooldown and are merged within 48 hours.
3. **Gates.** Nothing merges unless CI is green in its repo.
   - table: `ci-ok`, as now.
   - fork: a new workflow of ours on `demo` that runs on PRs into `demo`:
     - `cargo test --locked` for the whole workspace, which includes his schema freshness test;
     - `cargo deny --exclude nat20_gui check bans licenses sources` against table's policy. His GUI fails that policy (no licence field, imgui from git, two unmaintained crates), and table never builds it.
   - `advisories` stays off the gate in both repos, as decision 0022 set for table, and runs on a daily schedule. A red run gets a P0 row the same day.
   - Upstream's `rust.yml` stays untouched, so syncs don't conflict. It only runs on fork `main`, where it checks his code as he wrote it.
4. **Supply chain.**
   - Lockfiles stay committed and every build is `--locked`.
   - Our workflows pin Actions by commit SHA. Upstream's workflow files keep his tag pins.
   - Committed manifests take git dependencies only from our own repos, pinned by `rev`, never `branch`. The polyanya `[patch]` is the one exception until UPS-11 moves core to crates.io polyanya and drops it. CI scripts that point at a branch on purpose (`core-drift` builds against `demo` HEAD) are not manifests.
   - npm installs are `npm ci` with exact versions.
   - Every `deny.toml` exception keeps its reason and is reviewed whenever the crate that pulls it in moves.
5. **One home per version** (UPS-15; until it lands, the four crates stay direct server dependencies, ignored by Dependabot).
   - core re-exports the crates whose types appear in its public API (hecs, parry3d, uom, and rerecast if the adapter needs it) as `nat20_core::<crate>`.
   - table's adapter uses those paths and drops its direct dependencies on them, and with them the four Dependabot ignores. Those versions then move only with the core pin (Rule 5).
6. **Who merges what.**
   - Dependabot runs weekly in both repos. In the fork it targets `demo`.
   - cargo: one grouped PR for patch updates; each minor is its own PR, because a 0.x minor is breaking and Dependabot can't tell. npm and Actions: one grouped PR for minor and patch.
   - Claude merges grouped PRs, and cargo minor PRs of crates at 1.0 or later, once CI is green. That's the same delegation table already has.
   - A breaking bump becomes a Claude-authored `core/deps-<crate>` or `table/deps-<crate>` PR with the code changes it needs, reviewed by Stas like any other. The matching Dependabot PR is closed as superseded.
   - After a fork bump merges, the table pin PR follows (Rule 5). The weekly `core-drift` job shows when one is due.
7. **Toolchain.** Pinned to an exact stable release in `rust-toolchain.toml`, in both repos.
   - Each new stable gets its own bump PR after the same 7-day cooldown, with any new lints fixed in that PR. A new release can't turn every open PR red at once.
   - Until the pin lands (UPS-14), CI runs latest stable, and a red run caused by a new release gets its own fix PR the same day.
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
  - cooldown, the toolchain pin and the daily advisories schedule in table.
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
