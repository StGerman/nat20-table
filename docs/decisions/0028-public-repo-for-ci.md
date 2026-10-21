# 0028. nat20-table goes public so CI runs on free runners

- **Status:** Accepted
- **Date:** 2026-10-21
- **Decided by:** Stas (decision card in the CI cost thread, 2026-10-21)

## Context

nat20-table was private, so every Actions minute was metered. Measured over its first five days (2026-10-16 to 2026-10-21, 349 runs): about 640 billed minutes a day, about 19,000 a month, against 2,000 (Free) or 3,000 (Pro) included. Half of it is GitHub rounding each job up to a whole minute: the `ci` workflow has 11 jobs and 9 of them run under 60 s. Automatic Copilot review added 8%, and since 2026-06-01 it bills Actions minutes on private repos too. On 2026-10-21 the spending limit ran out and every PR check was refused for about 17 hours, stalling the Milestone 4 and 5 stack. Job consolidation and stack discipline (TASKS.md CON-9, CON-10) cut that by about 63%, to about 7,000 minutes a month, still over the included minutes and growing with Milestone 6. The fork StGerman/nat20 is already public and its CI is free.

The repo holds MIT code, our own CC-BY-4.0 adventure content, SRD 5.2.1-derived rules data (CC-BY-4.0) and design docs. Rule 7 already keeps every non-redistributable source out ([0011](0011-content-licensing.md)), so nothing in it needs to stay private for licence reasons.

## Options

### A. Make nat20-table public
- Pro: standard GitHub-hosted runners are free and unlimited on public repos, with 4 vCPUs instead of 2, so builds get faster; Copilot review stops billing minutes.
- Pro: no machine to own; nothing to maintain.
- Con: code, design docs, plans and PR discussion are visible to anyone, and the full git history with them, including commit author emails.
- Con: anyone can fork and open PRs, so workflow runs from outside collaborators need an approval setting.

### B. x86-64 self-hosted runner (home box or a small VPS)
- Pro: the repo stays private; a persistent `target/` makes warm builds fast.
- Con: a machine to keep patched and online, runner updates, disk cleanup; a VPS costs about EUR 10 a month; GitHub announced a $0.002/min platform fee for self-hosted runners on private repos (postponed, may return); Dependabot PRs run new crates' build scripts on it.

### C. Raspberry Pi runner
- Pro: hardware already owned.
- Con: slower cold builds than hosted runners; needs 8 GB and NVMe; runs untrusted dependency code inside the home network; one more machine to keep online.

### D. Stay on hosted runners after CON-9 and CON-10
- Pro: no change.
- Con: about $25-30 a month of overage, rising with every milestone, and the next exhausted limit stops CI again.

## Decision

A. The repo carries nothing that must stay private, and public runners remove the cost and the outage risk at once while making builds faster. B and C trade money for maintenance and, for C, a fixture risk on a different architecture.

## Consequences

- Before the switch: `NOTICE.md` carries the SRD 5.2.1 attribution statement, the trademark notice and the licence split (this PR). A history scan on 2026-10-21 found no secrets; the history does contain commit author emails, which go public with it.
- Stas's settings after the switch: Settings > Actions > General > "Approval for running fork pull request workflows from contributors": "Require approval for all external contributors". Workflows already use `pull_request` (not `pull_request_target`), `permissions: contents: read` and no secrets, so a fork PR cannot reach a token.
- CON-11 (auto Copilot review) and CON-12 close with the switch. CON-9 drops to P2: minutes are free, but 11 jobs per run against the account's concurrent-job limit (20 on Free, 40 on Pro) still queues a whole-stack re-run. CON-10 stays for the same reason.
- Architecture: there is no x86-64 target. Stas develops on Apple Silicon and production will likely run on arm64 (AWS Graviton); CI and the Claude cloud sessions that recorded the seeded fixtures are x86-64. Public repos also get free arm64 hosted runners (`ubuntu-24.04-arm`), so CON-13 adds an arm64 CI leg to prove the fixtures replay identically on both.
- Private notes stay in the project files (`/mnt/project-files/`), never in the repo.

## Revisit when

The repo needs to hold something that cannot be public (a partner's content, credentials for a hosted service, a paid product's code), or public runner limits start blocking the stack.

## Sources

- Measurement: `/mnt/project-files/engine/ci/ci-cost-2026-10-21.md` (REST `actions/runs` and `actions/runs/{id}/jobs`, 349 runs).
- GitHub Actions billing for public repositories: https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions
- Copilot code review and Actions minutes on private repos: https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/enable-copilot-code-review
