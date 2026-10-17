# 0015. Monster turns run on a scripted engine policy, not an LLM

- **Status:** Accepted
- **Date:** 2026-10-16
- **Decided by:** Claude proposed in the Demo Run scope; Stas accepted the scope 2026-10-16

## Context

Fights have up to 8 monsters. Each LLM call adds seconds and tokens, and the run must finish in 120 minutes. Nat20 already has an AI controller registry for scripted policies.

## Options

### A. The DM agent decides monster actions
- Pro: tactically richer, in character.
- Con: a call per monster per round; slow, costly, harder to reproduce.

### B. Scripted policy in the engine
- Pro: fast, free, deterministic with a seed.
- Con: predictable tactics.

## Decision

B. The DM narrates consecutive monster turns together. Scenario triggers (surrender at 25% strength, reinforcements on round 3) are engine-side levers, not DM rulings.

## Consequences

- Monster turns are reproducible in conformance fixtures once dice are seedable.
- Tactical quality depends on the policy code.

## Revisit when

Playtests find fights boring or exploitable because the policy is too predictable.

## Sources

- `docs/scope/demo-run-scope.md` §4.1.6, §7.4.
