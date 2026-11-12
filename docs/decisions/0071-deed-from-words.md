# 0071. A player's wish becomes a proposed card, not a deed

- **Status:** Proposed
- **Date:** 2026-11-12
- **Decided by:** not decided. Stas asked for the design (2026-11-12 21:50Z: the DM proposes a deed from a player's words, Zoya and Lev moderate, Stas approves, a reader card is written at once). Lev Neiman proposes option C in `docs/design/deed-from-words.md`.

## Context

In run `full-2026-11-12T19-02-03-994Z` the human's character said, with no card open, that he would find a merchant and hire on with him next time. No deed was written. The words are in the transcript as the seat's line; the end-of-journey `suggest` wake (AGT-91) turned them into a proposed card that is never loaded and that nobody read, under an id that collides with a deck card. A deed today is what the party did on an outcome the engine recorded (0063; the Milestone 13 scope: never on the DM's word alone). Moderation costs Stas's hours and happens between runs under every option.

## Options

### A. Authored cards only
The thread reads the run and Zoya writes the card (`rufus_hires`).
- Pro: no new code; the card is needed under every option.
- Con: catches a wish only when someone reads the transcript.

### B. A DM "proposed deed" in the engine, moderated between runs
A DM command writes a deed in a "proposed" state from the player's words; approval makes it a deed.
- Pro: catches any wish; the world's record holds it from the moment it is said; a card could later open only for those who wished.
- Con: a contract change (command, event, state, fixture); an approval path that edits a saved roster, which the engine never does today; nothing reads the deed in its own run; a wish and a done thing share one id space; free-text ids, unless derived from a closed set.

### C. A proposed card built from the record (proposed)
The loop hands the `suggest` wake the human seat's own lines; the DM proposes up to two cards, each citing the line it answers and a world id, under a `dm_` id that can never load. A moderation page in the run report goes to Zoya, Lev and Vera, then Stas, who approves by merging a content PR that carries the deed's writer and its reader together.
- Pro: no contract change; the record, not the model's memory, feeds the proposal; deed ids stay authored and the validator's rules hold; nothing unchecked reaches a contract.
- Con: the wish is not in the world's memory, so no card can open only for those who voiced it; the words come back a build later (as under B); the loop depends on the page being read.

## Decision

Proposed: C, with A's `rufus_hires` as its first batch; B waits for the first card that must open only for a party that voiced a wish.

## Consequences

- One game PR and one content PR beside Milestone 13, outside its exit and count; rows and sizes are Yan's.
- "A reader card at once" is read as "in the same PR as the deed's first writer".
- Zoya's board check (quoted in the design, §11) adds: the narration judge's question covers a person, place or price no file holds; a wish's `about` must be an id the world's files hold, so Rufus goes into `worlds/wend/npcs.json` or the rule widens (design decision 8); and her proposed bible amendment, a card born of a wish opens on deeds the world saw and never reads the wish aloud as a cause, blocks the `rufus_hires` draft until Stas decides it.
- The scope's shelved "claims as deeds" and "words in the own-move deed" stay shelved with B.

## Revisit when

- A card is wanted that only a party who voiced the wish may draw.
- Two exit pairs pass with proposals on the page and none approved or refused.

## Sources

- `docs/design/deed-from-words.md`; the handover `engine/dramaturg/deed-from-words-handover.md` (project files).
- `game/src/table/loop.ts` (`SUGGEST_ASK`, `readSuggested`); `crates/nat20-world/src/deck.rs` (`check_deeds_written`, `deeds_written`).
- Decisions 0063, 0068; `docs/scope/dramaturg-mechanism-scope.md` §2, §3.
