# 0054. The human's terminal seat runs full screen

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** Stas (decision card on the Claude Doc «Экраны терминала», TUI design thread, 2026-10-31 14:12Z)

## Context

The Ink seat (`--seat ink`) drew an inline live region under the terminal's own scrollback: the
lines of the game scrolled up as `<Static>` output, and the situation panel, the turn block and
the input row stood below them. The panel design (engine/m6/panels-ink-layout-proposal.md, C10)
kept that model on purpose: the scrollback was the record, so no alternate screen. The width
work (table #189) kept it too, and put the panel right of a 72-column text measure from 124
columns.

What the inline model cannot give:

- **Height.** The live region and the scrollback share the screen. On a Fighter's turn at 80x24
  the region took about 23 of 24 rows (proposal C1), so the narration of what just happened
  scrolled away as the options appeared. The side panel from #189 stood beside the turn block
  only, as high as the live region, so the roster still folded.
- **Width.** Past the 72-column measure, a wide terminal's other columns were empty above the
  live region.
- **Rewrapping.** Lines already in the scrollback keep the wrap of the width they were drawn at.

The screens doc draws thirteen screens on one frame of five zones (header, story, side panel,
action zone, input row) and lists what the switch costs.

## Options

### A. Full screen (alternate screen, one frame)
- Pro: the panel takes the full height right of the story, so on a wide terminal nothing folds;
  the action zone and the story split the rows by rule, with the story's own scroll.
- Pro: every line rewraps when the window changes size; overlays (/sheet, /where, ...) can stand
  over the story instead of printing into it.
- Con: no terminal scrollback of the game: after exit, the story is only in the run folder's
  `transcript.jsonl`, and Cmd+F in the terminal doesn't find it. In play, PgUp and `/log` show it.
- Con: the seat has to keep, wrap and scroll the story itself, and every way out (end, `/quit`,
  two Ctrl+C, a crash) has to give the terminal back.
- Con: no mouse in v1, so in Terminal.app and iTerm2 the wheel arrives as arrow keys.

### B. Clear the screen at start, keep the inline model
- Pro: one line of code; nothing else changes.
- Con: none of the screens: the panel stays as high as the live region, and C1's height problem
  stays.

## Decision

A. After the pick, the seat runs in the terminal's alternate screen (Ink 8's `alternateScreen`)
as one frame: a dim header, the story at the 72-column measure pinned to its foot with its own
PgUp/PgDn scroll and a «↓ N new» marker, the side panel for the rest of the width from 124
columns past a thin rule, the action zone under the story (at most half the rows), and the input
row. Below 124 columns it is one column with the panel folded to two rows above the action zone;
under 40 columns or 16 rows, one line asks for a bigger window and the input row still works.

## Consequences

- Supersedes C10 of the panel proposal and the inline layout of table #189; the 72-column measure
  and the 124-column threshold stay. C1 (the live region leaves the scrollback a third) applies
  only to the narrow frame's fold; C7 (the live region's height test) becomes the whole-frame test
  at 160x48, 124x40 and 80x24.
- The record is the run folder, as before for audits: the story on screen is a view of the game,
  never written anywhere the transcript isn't.
- Lines the run printed while the seat draws (the "Playing ..." line) go into the story instead.
  The run summary prints after the seat stops, on the normal screen.
- Ink restores the screen on unmount and on process exit (signal-exit), so a crash shows its stack
  trace on the normal screen.
- Work is TASKS.md AGT-69, four stacked PRs under `game/` with no contract change: the frame and
  the scroll; overlays and the action-zone screens; the pick screen; the end and stop screens.

## Revisit when

A live run shows the lost scrollback costs more than the panel's height buys (a player looks for
an old line and can't find it with PgUp or `/log`), or the wheel steering the option highlight
confuses a player: then mouse reports, or option B.

## Sources

- Claude Doc «Экраны терминала» https://claude.ai/artifact/VxGbeKU35sEureMBpHkMrr (the 13 screens, the states, the cost list)
- Width doc https://claude.ai/artifact/5ZLLT2p4pFKLLMvZFXkgJC and table #189
- engine/m6/panels-ink-layout-proposal.md (C1, C7, C10)
- gfargo/tui-design-skill (MIT) https://github.com/gfargo/tui-design-skill: the floor tests and the clutter audit
