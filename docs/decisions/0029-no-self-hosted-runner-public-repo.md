# 0029. No self-hosted runner: CI runs on GitHub-hosted runners in the public repo

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decided by:** Stas in the CI cost thread, 2026-10-23, after GitHub's warning on the runner settings page

## Context

[0028](0028-self-hosted-arm64-runner.md) moved most CI to a self-hosted arm64 runner (a Lima VM on Stas's Mac) to stop paying for Actions minutes on a private repo. On 2026-10-23 Stas made nat20-table public. That removed the reason and added a risk: GitHub-hosted standard runners, `ubuntu-24.04-arm` included, are free and unlimited on public repos, and GitHub warns against self-hosted runners in public repos because a pull request from a fork can run code on them. 0028's routing already sent fork PRs to hosted runners, but that guard was one expression in our workflow, and any later workflow or edit that forgot it would expose the Mac.

## Options

### A. Keep the self-hosted runner with the fork guard
- Pro: warm local build cache, so faster runs; arm64.
- Con: one missed guard runs a stranger's code at home; the Mac has to be awake; a machine to maintain; no cost saving any more.

### B. Remove it; everything on GitHub-hosted runners
- Pro: no outside code on Stas's machines; free; nothing to maintain; arm64 is still available as hosted `ubuntu-24.04-arm` when needed (TASKS.md CON-13).
- Con: cold-ish builds on hosted runners (about 9 min on a lockfile change, 2-3 min warm from the cache).

## Decision

B. With minutes free, the runner only bought speed, and not enough to justify a runner that a public repo's fork PRs could reach.

## Consequences

- `.github/workflows/ci.yml` and `weekly.yml` return to their state before table #87: every job on `ubuntu-latest`, `rust-cache` always on, the original timeouts. The repo variables `CI_RUNNER` and `CI_COLD_HOSTED` are no longer read.
- `docs/ops/ci-runner-self-hosted.md` is removed.
- Stas deletes the `CI_RUNNER` variable, the `mac-vm` runner registration and the Lima VM.
- TASKS.md: CON-12 closed (public repo); CON-13 (arm64 fixture replay) runs on hosted `ubuntu-24.04-arm` instead.

## Revisit when

The repo goes private again, or hosted build times start holding up the stack.

## Sources

- GitHub, security hardening for self-hosted runners: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#hardening-for-self-hosted-runners
- Measurement behind 0028: `/mnt/project-files/engine/ci/ci-cost-2026-10-21.md`.
