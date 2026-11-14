# Testing content below the exit pair: what exists, the gap, one candidate

- **Status:** Proposed (for Stas's review; no TASKS.md rows until accepted)
- **Date:** 2026-11-14
- **Decision draft:** `docs/decisions/0080-content-test-layers.md`
- **Asked by:** Stas, 2026-11-14 06:55Z: the process "looks end-to-end, we need something closer to unit or component tests; be bold"

## 1. What exists, and the gap

Tests with no model are already deep. `contract/fixtures/` replays seeded transcripts. `game/test/campaign-loop.test.ts` walks whole contracts with a scripted DM and scripted seats and asserts the verdict rows of `game/src/play/verdict.ts`: after M11's exit pair 2 failed, its failure became the test "Fair in Wend's road always reads one of its own deeds, on the first choices or the last, whatever the dice (exit pair 2, run 1)"; the exit pair itself is scripted (MAP-12), and so is the arrival card at the destination (ENG-35). The open M12 stack adds scripted own-move tests to the same file. `npm run pack:check` loads every pack through the engine.

The gap is everything a live model decides. How the DM reads a player's words, whether AI players use a tool they are offered, whether a card can hold the plan a person says: each is first tested by a run of a whole contract and its analysis thread. Smaller live runs exist: `npm run play:scene` plays chosen scenes of a pack with a scripted or a human seat, and `play:cheap` is a cheaper profile of the full run. But a road card belongs to a leg of a contract, not to a scene, and nothing brings a live DM to one chosen card.

## 2. The record

| | M11 (baseline) | M12 so far (2026-11-14) |
|---|---|---|
| Runs on milestone builds | 5 | 10 (3 of them 1-to-2-minute cheap runs) |
| Run cost, USD | 35.45 | 44.29 |
| Exit pairs played / passed | 3 / 1 | 3 / 0 |
| Stas at the table, wall time | 1.09 h in 2 evenings | 3.09 h in 3 evenings (38.3 + 120.0 + 27.2 min; 81 of the 120 were the table waiting on Stas's own seat) |

Sources: `docs/roadmap.md` § Delivery for M11; for M12, `usage.jsonl` and `run.json` of the ten runs `full-2026-11-12T19-02…` to `full-2026-11-14T01-42…` in nat20-runs `master` 65c0e7c; checked by Yan (§7). `docs/roadmap.md`'s own M12 row dates from 2026-11-11 and shows no runs; it is Yan's file and his next `roadmap` brings it up to these numbers.

| M12 run | What failed | What would see it without a full run |
|---|---|---|
| 11-12 19:02, Stas's trial (2.50 USD, 38 min) | not an exit half: a roster already spent by an earlier session | nothing proposed here |
| 11-13 14:15 and 15:33 (2.19 + 8.54 USD) | 0 AI own moves in 28 card wakes, twice | a seat bench (§4, considered and not proposed): the card wakes alone; decision 0074 has since made this row reported, not gated |
| 11-13 15:26 (8.83 USD) | void: played on a stale checkout with local changes | a slip in starting the run, not a test gap; outside this proposal |
| 11-13 16:05 (5.70 USD, 120 min of Stas) | own move 0: Stas's real plan came between cards, where no own move exists, and the DM read all 4 of his card lines correctly. Two build defects also failed gating rows (a creature's name shown in English; a fight started on a neutral spent the retries). The run then stood 81 minutes waiting on Stas's seat and ended on the 120-minute limit, which failed row 1 and the rows that need the contract finished | own move: nothing, a person at the seat. The two build defects: scripted loop tests, which exist as a kind. The time limit: nothing; no input came from the seat |
| 11-13 21:16 (8.57 USD) | the all-AI half of pair 3; it passed with its own-move row read as reported (0074) | not a failure; listed so the ten runs add up, with the three cheap runs (1.01 USD) |
| 11-14 01:42 (6.95 USD, 27 min of Stas) | `bog_wifes_toll` has no failure the design allows for Stas's plan; `salt_on_credit` has no choice his plan could land on. Not gating: on `salt_on_credit` the DM narrated a refusal with no roll and remembered it as fact | nothing certain. A person trying lines on those two cards before the evening might have met the holes (§4) |

M11's exit failures are outside this doc; the structural ones (`m11-deck`, `m11-thread`) were fixed with scripted tests on main.

**The honest tally.** Nothing considered here would have saved a run or an evening for certain on this record. Both failed M12 exit evenings failed on a plan a person said: 01:42 in a design hole that table #381 proposes to close, 16:05 on a plan said between cards, which nothing proposed anywhere addresses. So this doc promises neither fewer evenings nor fewer dollars. It names one candidate: a way to try a player's line on one chosen card against the live DM, so that an evening is not the only place to find out that a plan has nowhere to land. In run 01:42 that took 16 minutes of play to reach.

## 3. The rule

**A full run should not be the first place a defect is found, when a cheaper layer can see it.** This is already the practice for structure (§1); the rule makes it explicit.

1. From the first milestone design written after acceptance, every exit row names the lowest layer that tests it: a test with no model (a fixture, a scripted test, `pack:check`), a live run smaller than the contract (`play:scene`), a full run with its audit and judge, or "a person". The M12 and M13 designs are not amended.
2. When a full run fails, the analysis says whether a scripted test could have seen it. If one could, the fix's PR adds it, as the M11 fixes did. The rerun the pair's rules require is still played.

The record's own example: run 16:05 also failed two gating rows on build defects (a creature's name in English, a fight started on a neutral), both of a kind a scripted loop test sees.

## 4. A candidate: the card bench

The own-move names below (`card_words`, `own_move`) are from the open M12 stack, not yet on main.

The idea: one command puts a named road card on the table and hands it to the live DM, as `play:scene` does for a scene. A person types a line and sees what the DM does with it; or lines come from a file (Stas's own from runs 16:05 and 01:42, read from the runs' files) and the DM's tool calls are checked; or a model writes plans a person might say and the thread lists the ones that found nowhere to land (a plan fuzz).

It is not designed, and this doc does not ask for it to be built. Review found these open, and each changes the cost:

- **How a named card reaches the table.** A person can already play a campaign pack beside scripted AI seats (`--seat ink`; without a person the run driver refuses scripted players there, and the caravan-driving scripted policies live in test code). What is missing is the card: a seeded walk to it breaks whenever a deck upstream of the draw changes, and an engine command that opens a named card would be a contract change under Rule 1.
- **One move a card.** M12 design §1.4: one own move per card, no retry. So every line that becomes a move needs the card set up again, and a fresh DM session or one that remembers the last try.
- **No evening behind the card.** The bench DM has no memory of the scenes before it; a recorded line that leans on them will read differently.
- **A narrated outcome is text.** Run 01:42's "refusal with no roll" was in the narration, not in a tool call; seeing it needs a judge on text.
- **What a pass is.** A live DM is not deterministic; a case needs samples and a threshold, set from measured rates.
- **Who runs it.** Decision 0036 keeps live calls on Stas's Mac, by his hand or through a Remote Control session he approves (blocked in practice so far); a cloud API key would need 0036 revisited. A cloud thread cannot run a case it adds.

Unit prices, from the `usage.jsonl` of runs 16:05, 21:16 and 01:42: a `dm/card_words` wake is about 0.11 USD in a warm session, a session's first call about 0.4 USD; an all-AI run is 8.57 USD and an evening of Stas 5.70 to 6.95 USD. A bench is not cheaper in dollars than a run once it repeats cases; what it would buy is minutes instead of an evening, if it works.

**Considered, not proposed.**
- A seat bench (a card to the live AI players, counting what they do). Its one question so far, "do AI players ever call `own_move`?", stopped gating under 0074.
- A build check on the run command. Run 15:26 was a slip in starting the run; the project's practice is to give run commands with a `git log -1` check, and the verdict already marks a dirty checkout not eligible.
- A deck lint beyond today's validator. The one rule ready today (a card has two choices that break no custom, from M12 design §1.4 and §1.8) finds `peddler` on main, does not find `bog_wifes_toll`, and is voided if decision 0079 (table #381) makes an own move's failure optional.
- Changing the exit pair: Stas plays once at milestone close, or a fix covered by a lower-layer case does not replay the pair. The record supports neither (§2).

## 5. Gates

Nothing in the exit pair's rules changes. Decisions 0043, 0065, 0066 and 0074 and the milestone scopes stand. Accepting the rule of §3 adds it to CLAUDE.md as one line, so design authors read it.

## 6. Questions for Stas

1. Accept the rule of §3, as one new line in CLAUDE.md?
2. Do you want the card bench designed: its own short system design, answering the open points of §4, with a cost, before any decision to build it? Or is the answer to your ask "the scripted layer is already there, and the rest is your evening"?
3. If designed: for M13, after M12 closes? It needs the M12 stack on main either way.

## 7. Yan's numbers (fallback agent, extract, 2026-11-14)

The repo's `yan` agent was run from a cloud thread, read-only; it may have seen CLAUDE.md. His saving estimate assumed Stas's evening moves to once a milestone, which this doc does not propose, so it is not quoted. His baseline numbers are §2's first table.

> Human time: 38.3 + 120.0 + 27.2 = 185.5 min. Of the 120 min at 16:05, 81 were the table waiting on bren and the run then hit the time limit.
> 3 of the 10 runs are 1-to-2-minute cheap runs (1.01 USD together). 15:26 cost 8.83 USD on old build ab59b57 alongside 15:33, and it has no analysis. Write-off candidate.
> 16:05, own move: only e2e. The DM classified 4/4 correctly; Bren's plans came between cards. 01:42, bog_wifes_toll: static lint. salt_on_credit having no success branch: only e2e or design. `remember` with no roll: golden DM set. [His "golden DM set" is this doc's recorded lines.]
> Amendment (proposed, waits on Stas): a lower layer replaces a run only after it has caught a failure that a recorded e2e run also caught. Why: the layers have no recall baseline yet.

On `bog_wifes_toll` this doc differs from Yan: a lint over the data as it stands does not find it (§4, considered). His "`remember` with no roll" is the outcome with no roll in §2's last row.
