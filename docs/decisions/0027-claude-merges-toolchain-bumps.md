# 0027. Claude merges green Rust toolchain bumps

- **Status:** Accepted
- **Date:** 2026-10-19
- **Decided by:** Stas, answering a decision card in the project thread "Mads's reply on upstream" (2026-10-19). Amends [0024](0024-dependency-policy.md) §6, which said who merges each kind of dependency PR but not toolchain PRs.

## Context

table #54 and core #19 pinned Rust to an exact release in `rust-toolchain.toml` and added Dependabot's `rust-toolchain` ecosystem, so each new stable release arrives as its own Dependabot PR after a 7-day cooldown. Decision 0024 §6 lists the PRs Claude merges once CI is green, and toolchain PRs weren't on that list, so by default each one waited for Stas. In each repo, `ci-ok` runs the full suite on the new release: in table that includes clippy with `-D warnings`, and in the fork it includes core's tests.

## Options

### A. Claude merges a green toolchain PR
- Pro: a release bump with no code change merges within days, the same way Actions bumps do.
- Pro: `ci-ok` already proves the new release builds, lints and passes on every gating job.
- Con: a release that changes behaviour without failing a test merges without a person looking at it.

### B. Stas reviews every toolchain PR
- Pro: a person sees every compiler change.
- Con: about one PR every six weeks per repo waits on Stas even when it changes one line and CI is green.

## Decision

A. When CI is green on a toolchain PR as Dependabot opened it, Claude merges it within 7 days. When a new release needs lint or code fixes, Claude adds them to that PR, and Stas reviews it like any other code change.

## Consequences

- CLAUDE.md Rule 9's toolchain line says who merges.
- A toolchain PR that needs fixes is code, so it gets the Claude code review and goes to Stas.

## Revisit when

A green toolchain bump breaks behaviour that no test caught.

## Sources

- [0024](0024-dependency-policy.md) §6 and §7.
- table #54, core #19: the pin and the `rust-toolchain` Dependabot ecosystem.
