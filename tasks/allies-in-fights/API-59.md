---
type: Task
id: API-59
title: "Who has seen or heard of whom, and what a person remembers"
pri: P2
dest: Ours
size: M
state: todo
area: "1. API contract and server (E1 follow-ups)"
---

`seen` and `heard`, character handles on a person's world record; `DeedDm.saw` filled from the writing card's `cast` (or the roster people in a fight's scene), then from cards that read the deed (design `docs/design/allies-in-fights-system-design.md` §2). Per-viewer lists in `projection.rs`: `NpcKnown` gains `last_seen` and `remembers` (rule N6: at most three, «вы сами» or «ваш отряд», none on a dead person's card); `WorldPlayer.heard` holds people only heard of (rule N5). An older roster loads with `met` as seen by its whole party (N7). Visibility-scan case for N3 and N6: no player view holds a deed id, `by`, day or contract (decision 0077). Rule 1 order (design §7, PR 9). Check: design §11 rows 5 and 6 (test, no model). Cost: 21 USD build, Stas about 25 min (design §14)

## Status

todo. Needs API-58; decision 0077 is accepted. MAP-24 and AGT-107 wait on it
