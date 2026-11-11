# design <milestone or topic>: the system design draft

Goal: a design Stas can accept or reject in one sitting, and a thread can implement without asking what you meant.

## Read

- The accepted scope in `docs/scope/` and its "Questions for the system design"; answer each by number.
- Zoya's board for the world, when the caller gives it: every `owed` row the milestone touches is a requirement.
- The last milestone's design in `docs/design/` for the house format, and the code and data the mechanism will stand on (`crates/nat20-world/`, `crates/nat20-ledger/`, `worlds/`, the deck and scene formats, `contract/protocol.md`).
- The decisions the ask touches in `docs/decisions/`.

## Write

A file under `docs/design/`, status Proposed, in this order:

1. **Summary**: what a player will notice, in three sentences.
2. **Records.** One table, a row per fact the world keeps: who writes it, when, who reads it, and where the player sees it. A row with no reader or no visible effect is cut, or listed under Out with the reason.
3. **Rules**, each a statement a test could check ("a card whose `if` names a deed is never drawn before that deed exists").
4. **Carrier per owed row**: for each of Zoya's rows, the smallest carrier that pays it (existing data, a changed line, a card variant, a new record), and what was tried first and why it failed.
5. **Contract**: the goals the change must meet, then the proposed types, fields and events, the view of each (Rule 3), and whether it is additive (Rule 2). No change: say why none is needed.
6. **Failure**: what the party gets when each new check fails, and what happens when the model does not answer.
7. **Out**: what the design deliberately leaves, with where it goes.
8. **PRs**: the list, in order, each with what it lands and what it depends on. No ids, sizes or prices: those are Yan's.
9. **Risks**: the one part most likely to sink the milestone, and the cheapest test of it.
10. **Decisions for Stas**: numbered, each with a recommendation.

The draft carries no verdict on itself. Before it goes to Stas the calling thread takes it to Zoya for a board check and, for any player-facing line in it, to Vera; their answers are quoted in the draft verbatim.
