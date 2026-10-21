# 0028. CI runs on a self-hosted arm64 Raspberry Pi, cold builds stay hosted

- **Status:** Accepted
- **Date:** 2026-10-21
- **Decided by:** Stas (decision cards in the CI cost thread, 2026-10-21: repo stays private, Raspberry Pi 4 8 GB at home)

## Context

nat20-table is private, so every Actions minute is metered. Measured over its first five days (2026-10-16 to 2026-10-21, 349 runs): about 640 billed minutes a day, about 19,000 a month, against 2,000 (Free) or 3,000 (Pro) included. Half of it is GitHub rounding each job up to a whole minute: `ci` has 11 jobs and 9 of them run under 60 s. On 2026-10-21 the spending limit ran out and every PR check was refused for about 17 hours, stalling the Milestone 4 and 5 stack. Consolidating jobs and rebasing one stacked PR per merge (TASKS.md CON-9, CON-10) cut that to about 7,000 minutes a month, still over the included minutes and growing with Milestone 6.

There is no x86-64 target: Stas develops on Apple Silicon and production will likely run on arm64 (AWS Graviton). Only GitHub's `ubuntu-latest` runners and the Claude cloud sessions, which recorded the seeded fixtures, are x86-64.

## Options

### A. Make the repo public (free hosted runners, arm64 included)
- Pro: $0, faster 4-vCPU runners, nothing to maintain.
- Con: Stas is not ready to open the repo.

### B. arm64 VPS runner (for example Hetzner CAX21, about EUR 7 a month)
- Pro: arm64 like dev and production; always on; outside the home network; faster than a Pi.
- Con: a monthly bill and a server to patch.

### C. Raspberry Pi 4 (8 GB) at home
- Pro: hardware Stas owns; arm64 like dev and production; a persistent `target/` makes warm builds a few minutes.
- Con: slow cold builds (estimated 30-45 min against about 9 hosted); one job at a time, so stack rebases queue; CI stops while the Pi is off; jobs run pushed code inside the home network; Stas maintains it.

### D. Third-party runner service (Ubicloud, Blacksmith, RunsOn and similar)
- Pro: several times cheaper per minute than GitHub, arm64 available, nothing to host.
- Con: another vendor reads the private code.

### E. Stay on GitHub-hosted runners after CON-9 and CON-10
- Pro: nothing changes.
- Con: about $25-30 a month of overage, rising, and the next exhausted limit stops CI again.

## Decision

C, with the routing shaped around the Pi 4's weakness: the `changes` job sends every job except `deny` and `advisories` to the runner named by the repository variable `CI_RUNNER`, but keeps PRs that change `Cargo.lock` or `rust-toolchain.toml` (cold builds) and all Dependabot PRs on GitHub-hosted runners. The push to `main` after such a merge builds cold on the Pi, where nobody waits for it. `deny` and `advisories` use a Docker-based action and stay hosted, so the Pi needs no Docker. With `CI_RUNNER` unset everything runs hosted, so one setting falls back.

Stas chose C over B for cost; GitHub's announced $0.002/min fee for self-hosted runners on private repos (postponed in December 2025) would, if it returns, still cost less than hosted minutes.

## Consequences

- `.github/workflows/ci.yml`: `changes` picks the runner; every other job but `deny` and `advisories` reads it; `rust-cache` runs only on hosted runners (the Pi keeps `CARGO_TARGET_DIR` on its SSD); timeouts raised for a Pi 4 cold build (rust-lint and rust-test 90 min, contract-fresh 45). `weekly.yml`'s `core-drift` also runs on the Pi.
- Setup, trial, fallback and exposure: [`docs/ops/ci-runner-raspberry-pi.md`](../ops/ci-runner-raspberry-pi.md). The trial run on `main` also answers TASKS.md CON-13: whether the seeded fixtures, recorded on x86-64, replay identically on arm64.
- Remaining hosted minutes: cold-build PRs, Dependabot PRs, and `deny` plus `advisories` on every run (2 billed min per run until CON-9 drops `advisories` from PRs).
- TASKS.md: CON-12 done when the trial is green and `CI_RUNNER` is set; CON-9, CON-10 and CON-11 stay open.

## Revisit when

The Pi's queue regularly holds the stack for more than an hour, the Pi is down more than occasionally, the self-hosted platform fee takes effect, or the repo goes public (then option A replaces this).

## Sources

- Measurement: `/mnt/project-files/engine/ci/ci-cost-2026-10-21.md` (REST `actions/runs` and `actions/runs/{id}/jobs`, 349 runs).
- GitHub, 2026 pricing changes for Actions (self-hosted fee postponed): https://resources.github.com/actions/2026-pricing-changes-for-github-actions/
- GitHub self-hosted runners: https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners
