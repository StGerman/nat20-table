---
type: Task
id: API-59
title: "Who has seen or heard of whom, and what a person remembers"
pri: P2
dest: Ours
size: M
state: done
area: "1. API contract and server (E1 follow-ups)"
---

`seen` and `heard`, character handles on a person's world record; `DeedDm.saw` filled from the writing card's `cast` (or the roster people in a fight's scene), then from cards that read the deed (design `docs/design/allies-in-fights-system-design.md` §2). Per-viewer lists in `projection.rs`: `NpcKnown` gains `last_seen` and `remembers` (rule N6: at most three, «вы сами» or «ваш отряд», none on a dead person's card); `WorldPlayer.heard` holds people only heard of (rule N5). An older roster loads with `met` as seen by its whole party (N7). Visibility-scan case for N3 and N6: no player view holds a deed id, `by`, day or contract (decision 0077). Rule 1 order (design §7, PR 9). Check: design §11 rows 5 and 6 (test, no model). Cost: 21 USD build, Stas about 25 min (design §14)

## Status

done 2026-11-17: contract 1.0.0-dev.77; `remembers` lines carry two forms (`you`, `company`); rules N5 and N6 in `projection.rs` (unit test), N4's seen-or-heard in `mention`, N7 at `start_campaign`; api test `a_card_shows_its_cast_and_tells_and_its_deed_is_remembered_by_whom_it_saw`; the visibility scan refuses `cast`, `tells`, `seen`, `heard_by`, `deeds`, `deed` and `by` in a player view. MAP-24 and AGT-107 wait on it
