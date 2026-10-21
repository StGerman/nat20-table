# 0028. CI runs on a self-hosted arm64 Linux runner: a VM on Stas's Mac

- **Status:** Accepted
- **Date:** 2026-10-21
- **Decided by:** Stas in the CI cost thread, 2026-10-21: the repo stays private; he first picked his Raspberry Pi 4, which turned out unavailable, then his Apple Silicon Mac

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

### C. Linux arm64 VM on Stas's Mac (Apple Silicon)
- Pro: no cost; arm64 Linux like production; M-series cores make cold builds faster than hosted (estimated 4-6 min against about 9) and warm builds 1-2 min; a VM without shared folders keeps jobs away from his files.
- Con: CI runs only while the Mac is awake; jobs queue otherwise, so `CI_RUNNER` has to be unset when it sleeps; one job at a time, so stack rebases queue; Stas maintains the VM.

### C2. Runner directly on macOS
- Pro: no VM.
- Con: jobs run pushed code with access to Stas's home directory; macOS is not the CI or production platform (its own libm can shift seeded fixtures; `weekly.yml` uses GNU tools).

### C3. Raspberry Pi 4 (8 GB) at home
- Pro: hardware Stas owns; always on.
- Con: not available now; cold builds an estimated 30-45 min; needs an SSD, cooling and its own network segment.

### D. Third-party runner service (Ubicloud, Blacksmith, RunsOn and similar)
- Pro: several times cheaper per minute than GitHub, arm64 available, nothing to host.
- Con: another vendor reads the private code.

### E. Stay on GitHub-hosted runners after CON-9 and CON-10
- Pro: nothing changes.
- Con: about $25-30 a month of overage, rising, and the next exhausted limit stops CI again.

## Decision

C. Every job except `deny` and `advisories` goes to the runner named by the repository variable `CI_RUNNER`; Dependabot PRs stay on GitHub-hosted runners, so a new dependency's build scripts run on Stas's machine only after review. A slow host can also keep cold builds (PRs that change `Cargo.lock` or `rust-toolchain.toml`) hosted with `CI_COLD_HOSTED=true`; the Mac does not need it. `deny` and `advisories` use a Docker-based action and stay hosted, so the runner needs no Docker. With `CI_RUNNER` unset everything runs hosted, so one setting falls back, which is also what Stas does when the Mac sleeps.

C beat B on cost and speed, and C2 on isolation and platform. GitHub's announced $0.002/min fee for self-hosted runners on private repos (postponed in December 2025) would, if it returns, still cost less than hosted minutes.

## Consequences

- `.github/workflows/ci.yml`: `changes` picks the runner; every other job but `deny` and `advisories` reads it; `rust-cache` runs only on hosted runners (the runner keeps `CARGO_TARGET_DIR` on its own disk); timeouts raised for a slow cold build (rust-lint and rust-test 90 min, contract-fresh 45). `weekly.yml`'s `core-drift` also runs self-hosted.
- Setup, trial, fallback and exposure: [`docs/ops/ci-runner-self-hosted.md`](../ops/ci-runner-self-hosted.md), with the Pi as the alternative host. The trial run on `main` also answers TASKS.md CON-13: whether the seeded fixtures, recorded on x86-64, replay identically on arm64.
- Remaining hosted minutes: Dependabot PRs, every run while `CI_RUNNER` is unset, and `deny` plus `advisories` on every run (2 billed min per run until CON-9 drops `advisories` from PRs).
- TASKS.md: CON-12 done when the trial is green and `CI_RUNNER` is set; CON-9, CON-10 and CON-11 stay open.

## Revisit when

The runner's queue or the Mac's sleep regularly holds the stack for hours (then an always-on arm64 box, option B or C3, replaces the VM), the self-hosted platform fee takes effect, or the repo goes public (then option A replaces this).

## Sources

- Measurement: `/mnt/project-files/engine/ci/ci-cost-2026-10-21.md` (REST `actions/runs` and `actions/runs/{id}/jobs`, 349 runs).
- GitHub, 2026 pricing changes for Actions (self-hosted fee postponed): https://resources.github.com/actions/2026-pricing-changes-for-github-actions/
- GitHub self-hosted runners: https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners
