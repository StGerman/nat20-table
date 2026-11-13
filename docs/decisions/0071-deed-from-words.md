# 0071. A player's wish becomes a proposed card, not a deed

- **Status:** Accepted
- **Date:** 2026-11-12
- **Decided by:** Stas, 2026-11-13 15:02Z, all six design decisions as recommended. He asked for the design 2026-11-12 21:50Z; Lev Neiman proposed option C in `docs/design/deed-from-words.md`.

## Context

In run `full-2026-11-12T19-02-03-994Z` the human's character said, with no card open, that he would find a merchant and hire on with him next time. No deed was written. The words are in the transcript; the end-of-journey `suggest` wake (AGT-91) turned them into a proposed card, never loaded, which the run report prints and nobody read. A deed today is what the party did on an outcome the engine recorded (0063; the Proposed Milestone 13 scope of table #348: never on the DM's word alone). Stas asked that the DM propose a deed from the words, Zoya and Lev moderate, he approve, and a reader card be written at once. Moderation costs his hours and happens between runs under every option.

## Options

### A. Authored cards only
The thread reads the run and Zoya writes the card (`rufus_hires`).
- Pro: no new code; the card is needed under every option.
- Con: catches a wish only when someone reads the transcript.

### B. A DM "proposed deed" in the engine, moderated between runs
A DM command writes a deed in a "proposed" state from the player's words; approval makes it a deed.
- Pro: catches any wish; the world holds it from the moment it is said; a card could open only for those who wished.
- Con: a contract change (command, event, state, fixture); an approval path that edits a saved roster, which the engine never does today; nothing reads the deed in its own run; a wish and a done thing share one id space.

### C. A proposed card built from the record (proposed)
The loop hands the `suggest` wake the human seat's own lines. The DM proposes up to two cards, each citing the line it answers and the remembered deeds it stands on, under a `dm_` id that cannot load. The report's section becomes a page for Zoya, Lev and Vera, then Stas, who approves by merging a content PR with the deed's writer and reader together.
- Pro: no contract change; the record feeds the proposal; deed ids stay authored; nothing unchecked reaches a contract.
- Con: the wish is not in the world's memory, so no card can open only for those who voiced it; the loop depends on the page being read; what the DM says aloud before moderation is reported afterwards, not prevented; a run that stops early is never asked for proposals.

## Decision

C, with A's `rufus_hires` as its first batch; B waits for the first card that must open only for a party that voiced a wish.

## Consequences

- A game PR and a content PR, beside Milestone 13 and outside its exit and count. Rows and sizes are Yan's.
- "A reader card at once" is read as "in the same PR as the deed's first writer".
- Design decisions 5 (a proposal names no person, only the deeds it stands on) and 6 (Zoya's bible amendment: such a card opens on deeds the world saw) follow; 6 is accepted and goes into the bible by its own PR; it gates the `rufus_hires` draft until that PR merges.

## Revisit when

- A card is wanted that only a party who voiced the wish may draw.
- Two exit pairs pass with proposals on the page and none approved or refused.

## Sources

- `docs/design/deed-from-words.md`; the handover `engine/dramaturg/deed-from-words-handover.md` (project files).
- Decisions 0063, 0068; the Proposed Milestone 13 scope, `docs/scope/dramaturg-mechanism-scope.md` §2 and §3, in table #348 (this record merges after it).
