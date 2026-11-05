# 0059. The Demo Run closes on two passing runs from different builds

- **Status:** Accepted
- **Date:** 2026-11-05
- **Decided by:** Stas, in the "Close the Demo Run" thread: «закрываем демо!» ("we close the demo", 2026-11-01 22:48Z); decision cards on the closing path (22:53Z), on the flags of 19-50-27 (22:53Z) and 22-59-29 (23:24Z), and on the flags of 23-25-02 (2026-11-05 21:23Z)

## Context

Acceptance criterion 1 (scope §6, decision [0043](0043-demo-acceptance-two-runs.md)) asks for one unattended all-AI playthrough and one played by Stas, Scene 1 to 6 within 120 minutes, on the same build. Decision [0051](0051-m7-closed-for-now.md) closed Milestone 7 "for now" on two passing runs one build apart and left the same-build pair due before friends-and-family testing. Decision [0056](0056-m10-closed-on-cheap-run.md) moved the latency check on the demo models to AGT-77.

The records, all in StGerman/nat20-runs:

| Run | Command, seats | Build (table, engine) | Result |
|---|---|---|---|
| `full-2026-10-30T20-40-59-111Z` | `play:demo`, Stas as Bren | 0608849, e8c8d90 | **PASS**: Scenes 1-6 in 36.6 min, 151 rolls cited, 0 leaks, 3 flags dismissed by Stas |
| `full-2026-11-01T19-50-27-980Z` | `play:cheap`, Stas as Bren | 96a460a, a7c2ee7 | FAIL on row 3: Stas confirmed 3 of 14 flags (Bren split off with no engine move; Sacred Flame's target misnamed; a touch from 26 ft). Still the Milestone 10 latency record |
| `full-2026-11-01T22-59-29-429Z` | `play:unattended`, all AI | 40001ee, a7c2ee7 | FAIL on row 3: Stas confirmed n71-1 (Torva narrated prone after she stood). Its two leaks were a scanner false positive, fixed by table #217 |
| `full-2026-11-01T23-25-02-525Z` | `play:unattended`, all AI (DM Opus 5.5 low, players Sonnet 5.5 medium) | 40001ee, a7c2ee7 | **PASS**: Scenes 1-6 in 24.0 min, nobody died, 208 rolls cited, 0 leaks (with table #217), 5 flags dismissed by Stas, recoveries within 2 retries |

Between 0608849 and 40001ee the engine rev moved (e8c8d90 to a7c2ee7: Dodge, stacking Dash, option summaries) and the table gained Milestone 10's speed work, the full-screen seat and AGT-70 to AGT-72. Stas's own play on the newest build, 19-50-27 (96a460a: same engine rev as 40001ee, table differing only in TUI text and prompts, table #210 to #216), reached Scene 6 but fails row 3.

Criterion 4 on the demo models (23-25-02): AI player combat wake p95 9.4 s (target 10 s, met), DM narration p95 9.8 s (target 6 s, missed); 22-59-29 measured 9.1 s and 9.3 s. Cost of 23-25-02 was about $15.5 API-equivalent.

## Options

### A. Close on 20-40-59 and 23-25-02, two passing runs on different builds
- Pro: every gating row passes on both records, each judged by Stas. The newest engine and table are covered by the all-AI run, and Stas's play on that engine (19-50-27) shows the seat works end to end.
- Con: criterion 1's "same build" is not met to the letter.

### B. Play one more Stas run on 40001ee or later
- Pro: meets criterion 1 literally.
- Con: one to two more hours of Stas's time, for a seat he played on 2026-11-01 on the same engine; main has since moved into Milestone 9, so "the same build" means an old checkout.

## Decision

A. Stas chose to close on one unattended run (card, 2026-11-01 22:53Z) and accepted that his recorded run sits on another build. The Demo Run of *The Silent Mill* is closed: Milestone 7's same-build pair, left open by 0051, is no longer due.

## Consequences

- **Acceptance (scope §6):** criteria 1, 2, 3 and 5 are held by the two passing records above. Criterion 4 is reported: players meet the target, the DM misses it. Criterion 6 stays with friends-and-family testing.
- **`TASKS.md`:** AGT-77 is done. It missed the DM target, which confirms that AGT-25 (pipelined narration) and AGT-68 (effort retune) belong in Milestone 9 phase 0, where they already sit, per 0056's revisit rule. Milestone 7 reads done, closed by this record.
- **`CLAUDE.md`:** Milestone 7 cites this record instead of "closed for now".
- **Decision [0051](0051-m7-closed-for-now.md)** stays as written; this record ends what it left open.
- **Defects seen in the closing runs** gate nothing here. AGT-73 (English in a Russian run), AGT-74 (empty run folders uploaded) and AGT-75 (a stale release binary on Stas's Mac) stay in Milestone 9. The DM narrating a condition or a position the engine does not hold (the row 3 flags confirmed in 19-50-27 and 22-59-29) has no row: the narration check catches it per run, and a row waits until Stas asks for a fix.

## Revisit when

Friends-and-family testing finds a gating row failing on the build friends install: then a same-build pair on that build comes back as acceptance for the release.

## Sources

- StGerman/nat20-runs: `runs/full-2026-10-30T20-40-59-111Z/`, `runs/full-2026-11-01T19-50-27-980Z/`, `runs/full-2026-11-01T22-59-29-429Z/`, `runs/full-2026-11-01T23-25-02-525Z/` (each with `verdict.json` and `confirmations.json`); runs #1, #2 and #4.
- Table #217 (leak scan reads rule wording correctly).
- Decisions 0043, 0051, 0056.
