# 0055. The wide frame splits story and panel near the golden ratio

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** Stas (TUI implementation thread, 2026-10-31 19:44Z, from a live `play:cheap` run at about 200 columns)

## Context

Decision 0054 kept the 72-column text measure from the width rule (table #189) and gave the side
panel the rest of a wide terminal's width. At about 200 columns the panel took about 57% of the
width, yet its longest row (a roster line) needs about 60 columns, so its right side stood empty
while the narration was held to 72. Stas asked for roughly the golden ratio, with the larger part
going to the narration.

## Options

### A. Golden split: the story takes about 61.8% of the shared width, never less than 72 columns
- Pro: the panel stops standing half empty, and the narration gets the room on any wide terminal.
- Pro: one rule at every width. At the 124-column threshold the story gets 75 columns and the panel 46, where the panel drops its display-name column, as it already did below 60 columns.
- Con: on a very wide terminal the lines get long (about 122 columns at 200). That is what the 72 measure guarded against: Stas's wife finds long lines hard.

### B. Keep the 72 measure and narrow the panel to its content, leaving the rest blank
- Pro: keeps the reading measure.
- Con: the empty space only moves to the right of the panel. It does not give the narration more room, which was the ask.

### C. Golden split with a cap on the story (for example 100 columns)
- Pro: bounds the line length.
- Con: past the cap the panel grows again and stands half empty, the same problem at very wide terminals. It is a second rule to explain.

## Decision

A. In the wide frame (from 124 columns), the story takes `round(0.618 × (columns − 3))` columns
and never less than 72. The panel takes the rest past the 3-column rule. The narrow frame (under
124 columns) keeps the 72-column measure.

## Consequences

- Supersedes the 72-column measure of 0054 and the width rule (table #189) in the wide frame only. The narrow frame, the threshold, the rule and the five zones of 0054 stay.
- `frameLayout` in `game/src/ui/frame.ts` holds the split (`GOLDEN`). Story, action zone and input row all take the story width.
- The frame tests assert the split at 124, 160, 200 and 240 columns.

## Revisit when

A player finds the long lines hard to read on a wide terminal: then option C, with the cap chosen in play.
