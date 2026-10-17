# 0011. Content licensing boundary: CC-BY SRD, permissive data and our own words only

- **Status:** Accepted
- **Date:** 2026-10-16
- **Decided by:** Stas (project goal: "No WotC book or D&D Beyond text, ever"), refined across the research threads

## Context

The demo will be shown and possibly shipped. D&D content comes under very different licences: CC-BY-4.0 SRDs, OGL-only third-party documents, copyleft projects (Avrae GPL, Critical Role dataset CC-BY-SA, fandom wiki CC-BY-SA), personal-use DMs Guild adventures, and WotC books that Stas has bought.

## Options

### A. Permissive only: SRD 5.1/5.2 (CC-BY-4.0, attributed), Foundry structured fields from CC-BY-4.0 records, 5e-bits numbers, our own text
- Pro: everything we ship can be redistributed with attribution.
- Con: more writing of our own; no book content even where it would help.

### B. Also allow OGL and copyleft sources
- Con: OGL-only text and copyleft data would infect what we ship.

### C. Use purchased books or D&D Beyond through Stas's login
- Con: a purchase is a personal licence, not a redistribution right.

## Decision

A. Never download, scrape or ingest WotC books or D&D Beyond content, even with a purchased login, nor archive copies. Never ship GPL, CC-BY-SA or OGL-only content. Mechanics may be reimplemented in our own words; original lore lives in `lore/`.

## Consequences

- CLAUDE.md Rule 7. Ruled out: Avrae code, the Critical Role dataset, 5etools, fandom wiki, midi-qol/DAE data.
- The demo runs an original scenario ([0018](0018-original-scenario.md)); DMs Guild adventures are for Stas's private tests only.
- Our content is CC-BY-4.0; code is MIT to match upstream.

## Revisit when

A new source appears under a licence not listed above; it gets its own record before use.

## Sources

- `/mnt/project-files/research/prior-art.md`; `docs/scope/demo-run-scope.md` §2.
