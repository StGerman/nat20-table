# 0010. Data sources: Foundry structured fields for mechanics, 5e-bits for monster numbers

- **Status:** Accepted
- **Date:** 2026-10-16
- **Decided by:** Stas ("we will go with Foundry", 2026-10-16), after the Open5e and Foundry evaluations

## Context

About 850 effects (features, spells, items) exist only as prose in the SRD. Any source that already structures some of them cuts the largest cost. Candidates measured on the 339 SRD 5.2 spells: Foundry VTT dnd5e 2024 packs (MIT code, records tagged CC-BY-4.0), 5e-bits JSON, Open5e `srd-2024`.

## Options

### A. Foundry dnd5e 2024 packs, structured fields only
- Pro: save ability on 124 spells, area on 81, damage on 97, healing on 16, conditions on 61; monster riders (conditions, recharge, uses); per-record licence and ruleset flags.
- Con: about half the spells still live in prose; formulas use Foundry actor paths, so we need a translator; schema moves with Foundry majors (pin a commit).
- Con: restricted art and 2014 packs sit in the same repo and must never ship.

### B. Open5e `srd-2024`
- Pro: save ability, area, per-slot scaling.
- Con: its attack-roll flag is mostly false positives (Bless, Hex, Faerie Fire); most other Open5e documents are OGL-only.

### C. 5e-bits only
- Pro: clean monster base numbers; already in our wiki.
- Con: no save, area or healing fields on 2024 spells.

## Decision

A for spell mechanics, monster riders, class tables and structured features, read offline from a pinned clone; never Foundry text, art, pregens or 2014 packs. 5e-bits stays the source of monster base numbers. Open5e drops to an ad hoc cross-check.

## Consequences

- `tools/data-pipeline/` translates Foundry fields into upstream's registry JSON (DAT rows); a licence filter keeps only CC-BY-4.0 + 2024 records.
- Prose comes from our SRD wiki or our own words, never Foundry.

## Revisit when

Foundry changes its licence or schema in a way the translator cannot follow, or upstream Nat20 grows its own content importer.

## Sources

- `/mnt/project-files/research/foundry-dnd5e-evaluation.md`, `open5e-evaluation.md`, `prior-art.md` §2.
- Threads "Foundry VTT data evaluation", "Open5e evaluation".
