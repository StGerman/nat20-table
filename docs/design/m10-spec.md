# Milestone 10: Speed and polish (spec)

2026-10-30, approved by Stas 2026-10-30; implementation started on his /goal 2026-10-31. Commentable copy: Claude Doc https://claude.ai/artifact/8Va9TorYfNhVHhLrz3jdbU. Rows: TASKS.md Milestone 10.

Milestone 10 makes the Demo Run feel fast and finished for the human at the table: it is the optimisation milestone that CLAUDE.md says gates acceptance criterion 4, plus small polish items found in the M7 runs. Number 10 because 8 is dropped and 9 (Improvised play) is already planned; I propose running 10 before 9.

## Goal and exit criterion

**Goal.** A human waits less, reads cleaner output and gets fewer rough edges, with no new game features.

**Exit criterion (proposed).** One `play:unattended` run on the milestone's last build:

- passes M7 rows 1, 2, 3 and 5 again (Scenes 1 to 6, audit, narration judge, retries);
- reports AI player combat turn p95 of 10 s or less and DM narration p95 of 6 s or less (acceptance criterion 4);
- costs no more per run than today's baseline of about $11.50 API-equivalent.

**Guardrails.**

- M7 is closed for now (Stas, 2026-10-30), so work can start on main at once; its leftovers (who moved, adjacency, judge recall) are items P2 and P3 here.
- The engine still rolls everything (Rule 4). No latency lever may skip the audit, the leak scan or a roll citation.
- Russian stays the table language. Each item is checked on a `--lang ru` run.
- One repo, one concern per PR, Claude review per head (Rule 8). TASKS.md rows only after this spec is reviewed.

## Where time goes today

The player target is missed in every recent `play:unattended` run, by 4 to 9 s at p95. The DM target is missed in two of the three runs below and met by 0.1 s in the third. The tail is timeouts, not slow thinking.

| Run (profile unattended, RU) | Players | Player combat p95 (target 10 s) | DM narration p95 (target 6 s) | DM timeouts | Cost, API-equivalent |
| --- | --- | --- | --- | --- | --- |
| 18-45-48 (7e7c0a5) | Sonnet medium | 19.3 s | 10.0 s | 5 (narrate 3, combat_over 2, all at 12 s) | $11.50 (DM $5.10) |
| 17-35-35 (91945bf) | Sonnet medium | 14.3 s | 5.9 s | 0 | $11.70 (DM $5.13) |
| 12-54-03 | Haiku high | 16.6 s | 6.5 s | 0 | not in the analysis |

What the code and the M6 measurements say about the cause:

- **The DM pays for two model calls per narration.** The `narrate` tool call, then a closing call after the tool answers; the loop waits for the SDK's turn result, so it waits for both. M6 measured each at about 3 s to first token. All five timeouts in 18-45 cut a wake whose narration had already gone out.
- **A player's combat turn is three or more calls.** The options are already in the wake, but the player still calls `submit_decision`, then `end_turn`, sometimes `say`; each tool answer is another model round trip. The 20 s turn timeout sets the p95 ceiling.
- **Nothing streams.** The human sees nothing until a whole narration is done.
- **Caching already works** (M6: 3.7M cache reads against 172 uncached input tokens), so prompt size is not the lever.
- **Per-phase timing is missing.** `usage.jsonl` has per-call totals, not time to first token or time per tool round trip, so the split above is an estimate.

## Candidate items

Every item is S or M, game-side unless marked Fork, and needs no contract change unless marked. Ids are working labels; rows get TASKS.md ids after review.

### Speed

| Id | Item | Size | Value | Depends on |
| --- | --- | --- | --- | --- |
| S1 | Per-phase timing in `usage.jsonl`: wake wall time, time to first token, time per tool round trip; the run report splits p95 by phase | S | High: every other lever is measured by it | none |
| S2 | DM wake ends when `narrate` lands: the loop moves on, the closing call runs out in the background and never counts as a timeout. Wakes that still need tools after narrating (`load_scene`, rest) keep today's path | S | High: about half of each narration's wait; removes the timeout class of run 18-45 | S1 |
| S3 | One-call player turn: `submit_decision` takes an optional line to say and an `end_turn` flag, so a plain attack is one model call, not three | S | High: the main player lever | S1 |
| S4 | Stream the DM's narration into the Ink seat as it is written; the transcript, audit and `to` routing see only the finished text | M | High for the human: wait drops to first token. Zero for the p95 numbers | S2 |
| S5 | Pipelined narration (AGT-25): the next AI player decides while the DM narrates | S | Medium: hides DM time behind player time; makes engine call order depend on model timing | S1; only if S2 and S3 miss the target |
| S6 | Effort and timeout retune: player combat effort low vs medium, measured on a cheap sweep | S | Medium; risks the cellar (fix the players, not the encounter) | S1; last resort |

### UI token (both readings until Stas picks)

| Id | Item | Size | Value | Depends on |
| --- | --- | --- | --- | --- |
| U1 | Token and cost readout: `/usage` shows tokens and API-equivalent $ so far, per agent; one line at run end. Tokens lead; the $ is a reference while runs use the subscription and a real bill once a hosted loop uses an API key. Data is already in `usage.jsonl` | S | Medium: Stas sees the cost of a run while it plays | none |
| U2 | Design tokens: Mill Table colours (rust, teal, violet, gold, hint), Night and Day, 16-colour fallback and NO_COLOR words in one theme file the Ink seat reads; same names later for the Telegram Mini App | S | Medium: one place to change the look; ready for the North Star client | none |

### Polish

| Id | Item | Size | Value | Depends on |
| --- | --- | --- | --- | --- |
| P1 | No duplicate scene openings: today the DM narrates after `load_scene` and again on `scene_open` (4 of 5 transitions in runs 18-45 and 17-35) | S | High: the human reads every scene twice | none |
| P2 | "Who moved" line in each narrate briefing (shelved `m7/patches/narrate-who-moved.patch`), plus a verdict that can hold a flag Stas rules by hand | S | High: run 18-45 had 5 phantom monster moves the judge missed | none |
| P3 | Adjacency line in the DM briefing: who stands next to whom | S | Medium: position and touch-range contradictions (run 21-48) | P2 (same briefing) |
| P4 | Russian names at the table (AGT-38, P1, todo) | S | Medium: «Ильза» names nobody today | none |
| P5 | Situation panels in Ink Flexbox (AGT-47) with the width layout of «Раскладка терминала» option B: text column of 72 characters or less, right pane from 124 columns | M | High for reading comfort | Stas's OK on the width doc and the measure |
| P6 | The human's input line (AGT-48): cursor, word moves, hint and spinner in the row | M | Medium | P5 (same screen region) |
| P7 | One glyph per creature kind on the turn-order line (parked since 2026-10-27) | S | Low | P5 |
| P8 | Rules gaps a human trips over, Fork: Dodge (ENG-19) and a second Dash that adds nothing | S each | Medium: "I dodge" has no engine call today | core PR plus table pin each |

### Housekeeping

| Id | Item | Size | Value | Depends on |
| --- | --- | --- | --- | --- |
| C1 | ADR: nat20-table stays one repo (Rust engine and TS game together); a Rust/TS split was evaluated and rejected on 2026-10-31; the loop-to-client line is the one that gets a contract and its own repo later, with the SwiftUI milestone | S | Medium: closes the question so it isn't re-asked each milestone | none |

## Proposed order

Measure first, then the cheap high-value fixes, then the screen; the risky latency levers only if the numbers still miss. One PR per item, stacked.

1. S1 timing, so every later PR shows its before and after.
2. P1 duplicate openings, P2 who moved, P3 adjacency: small, independent, and they protect narration row 3.
3. S2 DM ends on `narrate`, S3 one-call player turn. Check on one `play:cheap` run.
4. U1 and/or U2, per Stas's pick; P4 Russian names.
5. S4 streaming narration.
6. P5 panels and width, P6 input line, P7 glyphs.
7. P8 Dodge and second Dash: core PRs into `demo`, then one table pin.
8. S5 and S6 only if the timing on step 3 or 5 still misses 10 s / 6 s.
9. The exit run: one `play:unattended` on the last build.

## Out of this milestone

- Response suggestions on Haiku (AGT-49): a new feature that adds a model call per human turn, not polish.
- OpenTelemetry tracing (AGT-16): S1 covers what this milestone needs.
- Agent memory across runs (AGT-22), DM-run monsters (AGT-23), Improvised play (Milestone 9), the Telegram front end.
- The shelved "DM speaks to the whole table" change and the non-message lines cleanup: both "decide later".
- Encounter tuning: the campaign is not tuned for AI.

## Blocking questions

1. What does "UI token" mean: the token and cost readout (U1), design tokens for the look (U2), or both? Asked on a card in the thread.
2. Is the exit criterion right: this milestone is the optimisation milestone and gates criterion 4 (p95 10 s / 6 s)? If speed should only be reported here, S5 and S6 drop out.
3. Width doc «Раскладка терминала»: option B and the measure (66, 72 or 80) are still waiting for an OK; P5 starts after it.
