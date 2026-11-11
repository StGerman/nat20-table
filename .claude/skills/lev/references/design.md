# design <milestone or topic>: the system design draft

Goal: a design Stas can accept or reject in one sitting, and a thread can implement without asking what you meant.

## Read

- The accepted scope in `docs/scope/` and its "Questions for the system design"; answer each by number. A milestone with no accepted scope: stop and return that as question 1, because scope is Yan's draft and Stas's decision. A single topic with no scope: take the goals from the ask and state them at the top.
- Zoya's board for the world, when the caller gives it: every `owed` row the milestone touches is a requirement.
- The last accepted milestone design in `docs/design/`: its layout is the house format. Then the code and data the mechanism will stand on (`crates/nat20-world/`, `crates/nat20-ledger/`, `worlds/`, the deck and scene formats, `contract/protocol.md`).
- The decisions the ask touches in `docs/decisions/`.

## Write

Write the file's headings first and fill it section by section, so a run that stops early still leaves a draft. A file under `docs/design/`, status Proposed, laid out like the last accepted design, with the scope's questions answered by number. Whatever the layout, these ten things are in it:

1. **Summary**: what a player will notice, in three sentences.
2. **Records.** One table, a row per fact the world keeps: who writes it, when, who reads it, and where the player sees it. A row with no reader or no visible effect is cut, or listed under Out with the reason; a record an accepted design leaves unread on purpose stays, with that design cited.
3. **Rules**, each a statement a test could check ("a card whose `if` names a deed is never drawn before that deed exists").
4. **Carrier per owed row**: for each of Zoya's rows, the smallest carrier that pays it (existing data, a changed line, a card variant, a new record), and what was tried first and why it failed.
5. **Contract**: the goals the change must meet, then the proposed types, fields and events, the view of each (Rule 3), and whether it is additive or breaking (Rule 2). No change: say why none is needed.
6. **Failure**: what the party gets when each new check fails, and what happens when the model does not answer.
7. **Out**: what the design deliberately leaves, with where it goes.
8. **PRs**: the list, in order, each with what it lands and what it depends on. New row ids, sizes and prices are Yan's.
9. **Risks**: the one part most likely to sink the milestone, and the cheapest test of it.
10. **Decisions for Stas**: numbered, each with a recommendation. One with real alternatives also gets a Proposed record in `docs/decisions/`. An accepted decision the design would do better without goes here too, as a challenge: what the record shows, the refinement, the cost.

The draft carries no verdict on itself. Before it goes to Stas the calling thread asks Zoya for the board of the world with the draft among the files to read (`/zoya board <world>`), and takes any player-facing line in it to Vera; their answers are quoted in the draft verbatim.
