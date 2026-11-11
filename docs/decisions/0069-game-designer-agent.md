# 0069. A game designer agent drafts the system design and reads cards and runs

- **Status:** Accepted
- **Date:** 2026-11-11
- **Decided by:** Stas (thread "Create the game designer persona", 2026-11-11)

## Context

The Dramaturg mechanism is next after Milestone 12: the world has to carry what the party did from one quest into the next. Zoya says what one quest owes another and is read-only. Yan prices the work and never touches content or contract. Vera reads blind. The narration judge checks one line at a time. Nobody designs the mechanism, reads a card as an experienced player, or follows a deed through a run; system designs were written by whichever thread implemented them.

## Options

### A. No new agent; the implementing thread writes the design
- Pro: nothing to build; this is how Milestones 9 to 12 were designed.
- Con: no standing set of principles between milestones, and no reader who looks for fake choices.

### B. Three agents: a narrative systems designer, a veteran-player reader, a continuity tester
- Pro: the readers are independent of the designer.
- Con: three agent files to keep; the three share one question and would repeat each other.

### C. One agent with three subcommands, who gives no verdict
- Pro: one goal and one set of principles under all three jobs; one file.
- Con: he reads his own designs. A read of a mechanism he designed is weaker evidence.

## Decision

C. Lev Neiman, game designer (`.claude/agents/lev.md`, skill `/lev` with one reference file per subcommand: `design`, `play`, `trace`). With it:

1. He writes system design drafts, marked Proposed, in `docs/design/`; the calling thread commits them and opens the PR.
2. For the contract he sets the goals a change must meet and proposes the change and its refinements. He never edits the contract crate; the implementing thread does, under Rule 1.
3. He never grades his own work. A `play` or `trace` of a mechanism he designed is marked "author's read" and is no evidence at a milestone exit. Vera, the narration judge and Stas's verdict stay independent of him.
4. He writes Proposed decision drafts in `docs/decisions/` for the design decisions he raises. He advises on refining a decision and challenges one, Stas's included, when a design or a read shows it works against the player; Stas decides, and until then the decision stands.
5. Before a design draft goes to Stas, Zoya writes the board of the world with the draft among her files, and Vera reads its player-facing lines.

## Consequences

- CLAUDE.md gains a short section for Lev. Yan's `scope` reference names Lev's draft as the system design.
- A design that an accepted record already allows (a deed left unread on purpose, a breaking change before v1) is not a finding for him; he may challenge the decision behind it once, under item 4.

## Revisit when

Two milestones in a row exit with a continuity or fake-choice problem that his own reads missed: then split the reader from the designer (option B).

## Sources

- Thread "Create the game designer persona", 2026-11-11; persona draft https://claude.ai/artifact/JCcRBJSy4ZhCB9pt71BNRf.
