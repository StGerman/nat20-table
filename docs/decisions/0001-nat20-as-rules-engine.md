# 0001. Use Nat20 as the rules engine instead of building our own

- **Status:** Accepted
- **Date:** 2026-10-16
- **Decided by:** Stas, in the "Demo Run scope" thread ("Looks promising!", then "fork nat20 to be able to contribute back"); confirmed by Milestone 1

## Context

The game needs a deterministic 5e (2024) rules engine an AI can drive: legal actions, validated decisions, every roll resolved by code. The prior-art survey (`/mnt/project-files/research/prior-art.md`) found no mature engine. It first recommended building our own core and a 1-2 day trial of Nat20 before deciding.

Nat20 (MadsWedendahlKruse/nat20, MIT, Rust) was then cloned and checked: it builds, 338 core tests pass, and its prompt/decision model fits AI actors. Coverage is thin: 4 classes (2 stubs), 22 of 339 spells, 1 species, no monster stat blocks, no Cleric or healing, no headless API, continuous 3D space instead of a grid. Its own "69% of spells" claim did not hold.

## Options

### A. Build our own engine core
- Pro: our effect model, our spatial model, no upstream dependency.
- Con: months of work before a first fight; the effect model is the hardest part and nobody has solved it at scale.

### B. Build on Nat20 (fork, contribute generic work back)
- Pro: a working action/reaction pipeline, d20 rolls, damage, death saves, opportunity attacks, short rests and 22 spells on day one.
- Pro: generic content we add (monsters, Cleric, Human, items) benefits upstream.
- Con: one maintainer, pre-1.0, core types refactored often (3 reshapes in 3 commits).
- Con: thin content; continuous 3D space conflicts with our grid plan (see [0012](0012-spatial-model.md)).

### C. Borrow ideas from Nat20 only
- Pro: no dependency risk.
- Con: same cost as A.

## Decision

B. The demo is feasible on Nat20 if the party and monsters fit what it already does. Milestone 1 (Fighter vs Goblin Warrior through a headless API, done 2026-10-16) proved it with zero changes to `core/src`.

## Consequences

- Our gaps become a build list (Cleric, Human, 4 SRD monsters, items, seedable dice, checks), tracked in TASKS.md.
- Upstream churn is contained behind one adapter module and pinned revs ([0002](0002-fork-and-own-repo.md)).
- Party and scenario are chosen to fit Nat20's coverage ([0014](0014-level-2-pregens.md)).

## Revisit when

The maintainer abandons the project or a core refactor makes the adapter cost more than a day per bump, or a rule we need cannot be expressed in Nat20's model.

## Sources

- `/mnt/project-files/research/prior-art.md`; `docs/scope/demo-run-scope.md` §1, §7.
- Threads "Existing D&D engines research", "The Demo Run scope", "Milestone 1: Fighter vs Goblin".
