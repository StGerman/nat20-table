# 0094. The next contract's last line bites at the gate

- **Status:** Accepted
- **Date:** 2026-11-23
- **Decided by:** Stas, project thread 2026-11-23 19:20Z («Ок по всем» on the three questions in §10 of `docs/design/contract-line-that-bites.md`, Lev's recommendation on each)

## Context

Decision 0092 named the game Fine Print and gave the company the custom of reading every contract aloud before anyone signs, with no literacy field and no reading roll. No clause in any pack bites yet. The design `docs/design/contract-line-that-bites.md` (table #483) makes the next contract's last line the short-purse rule `escort.rs` already has, and left three questions with real alternatives.

## Options

### 1. A signing card with a way to refuse
- **A. After `settle` (table #417).** Pro: no corridor; refusing goes somewhere once a contract can end early. Con: until then, refusing is only talk.
- **B. Now.** Pro: the human's choice is on a card at once. Con: both choices sign today; needs its own contract change on top of `settle`.

### 2. Who goes short when the purse runs out
- **A. Party order (Ilsa last), with amendment B:** a shared cost falls on a name the table heard before the first choice that can bring it on. Pro: no change; party order also sets rations, anchors and odd coppers; the companion gets a reason to speak. Con: the cost falls on a companion, not the human.
- **B. The human's seat last.** Pro: the human pays for the human's choice. Con: a pack-data change that also moves rations and anchors.
- **C. Split evenly.** Con: changes protocol §4.17's meaning (Rule 1).

### 3. May the paper say what the purse holds
- **A. Yes, amendment A:** a pack's own sentence may state a DM-only amount in story units when a test ties it to the file. Pro: no new field. Con: a pack sentence must stay in step with `purse_cp` (tested).
- **B. A field in the player's view.** Con: a contract change for one line.

## Decision

1A, 2A, 3A. Zoya's amendments A and B go into her bible by their own PR (MAP-35).

## Consequences

- Six backlog tasks: MAP-32 to MAP-35, AGT-156, AGT-157 (design §7).
- No contract or core change now. `purse_cp` is one number, so the next pack starts at one party size, or the purse is counted in days, which would be its own `world.escort` contract PR (open in MAP-34).

## Revisit when

`settle` lands (question 1), or a run shows the short pay never reaching a line the table hears (question 2).

## Sources

- `docs/design/contract-line-that-bites.md` §10; Zoya's board check and Vera's read in the project files `demo/contract-line/`.
