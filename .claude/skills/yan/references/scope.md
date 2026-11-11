# scope <milestone>: the spec draft

Goal: a scope spec Stas can accept in one read, so the system design and the rows can follow. Regulate first: no TASKS.md rows until the spec and the system design are both merged.

## Read

- The awarded bid (from `tender`) and the rows and findings it names.
- The design notes the caller names, and the previous milestone's scope section in `docs/scope/` for the house format.
- CLAUDE.md rules the milestone touches (contract first, visibility, the engine rolls).

## Write

A section or file under `docs/scope/`, status Proposed, in this order:

1. **Goal**: one sentence a player would notice.
2. **In**: what ships, by row id or finding.
3. **Out**: what is deliberately left, with where it goes.
4. **Exit criterion**: the runs (one exit pair, AI half first, Stas plays only after it passed), and the checks each run must pass.
5. **Questions for the system design**: what the design doc must answer (contract changes, new commands, data formats); you list them, the system design answers them.
6. **Rows that would follow**: proposed ids, one line each, marked "after spec and design merge".
7. **Cost**: the bid's price line, carried over.

You draft scope only. The system design is Lev's draft (`/lev design`), committed by the implementing thread; when it exists, check it against the spec and list each gap.
