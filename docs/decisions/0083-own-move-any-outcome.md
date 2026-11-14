# 0083. A player's own move may bring any outcome

- **Status:** Accepted
- **Date:** 2026-11-14
- **Decided by:** Stas, 2026-11-14: «свой ход может вести к любым исходам это правило!» (17:55Z), five answers in the project chat (19:21Z), «делаем» (19:23Z). The table rules review (project files `engine/m12/rules-review/rules-review.md`, read by Lev Neiman) found where the cap came from.
- **Supersedes, in part:** 0068, 0079 and 0081 where they cap an own move to the card's written choices. Their other rules (an optional failure, a fall and another try, the AI seats' fall cap, words answered and nothing more) still describe the code that runs, until the stake design replaces them. Also in part: (an own move's success and failure must be choices the card already offers; the vote on an own move that is the human's character's own act) and 0070 (torture "never shown" becomes "never described"). The lines this overrides in accepted scopes stay as written: `docs/scope/not-a-passenger-scope.md` §2 item 1 and §3 ("An own move never invents an outcome") and `docs/scope/allies-in-fights-scope.md` ("Torture stays never shown").

## Context

Milestone 12 built the own move as a check that could bring only one of a card's written choices (scope `docs/scope/not-a-passenger-scope.md` §2 item 1 and §3: "An own move never invents an outcome, a cost or a deed"; 0068). Stas's words at the table that no choice carried did nothing: «Дать хлеб ворону НО не ведьме!», «Предложить пойти дальше с вами и парня с собой забрать», «Я хочу отрезать ему язык». The milestone closed without passing its exit.

The cap came from the project note `engine/m11/own-move-on-a-card.md` (2026-11-08), which rejected "the DM writes the outcome" as breaking Rule 4. Rule 4 says the engine decides that a roll happens and rules its success. It never limited what a success may bring. No later question to Stas offered an uncapped option. Decision 0071 does not give an outcome from words in play, and neither does Milestone 13.

## Options

### A. Keep the cap (0068, 0079, 0081)
- Pro: built, tested, recorded.
- Con: the player is a passenger whenever the card did not foresee the plan; every blind Vera read and Stas's own runs stop there.

### B. The DM narrates any outcome freely, with no record
- Pro: no contract change.
- Con: the outcome lives only in narration and the DM's memory; no later card can read it, and the audit cannot check narration against engine state.

### C. A stake written before the roll, kept by the engine (chosen)
Before the roll the DM writes what is true if the attempt works and if it fails. The engine rolls, keeps the one the roll picked, and records it in the deed.
- Pro: any outcome; the engine still rolls and rules success (Rule 4); the outcome is engine state, so later cards and the judge can read it.
- Con: a contract version and a new design; the DM can still write a weak stake, and only the judge and Stas see it.

## Decision

C, with Stas's five answers:

1. **Torture:** it can happen; the telling turns away and never describes it. Bible guardrail 4 and the DM voice skill change in this PR.
2. **The human's character acting with his own hands** rolls at once, with no vote. The vote stays for choices that commit the caravan.
3. **The player does not see the two stake sentences** before the roll. They are DM-only until the roll picks one (Rule 3 as written).
4. **The outcome goes into the deed:** the words, the roll id, the result, the sentence the roll picked. This reverses Stas's 2026-11-14 06:20Z ruling of one deed with no result.
5. **CLAUDE.md:** Rule 4 gains one sentence saying what it does not limit; Rule 8's code review runs one round, a later head is reviewed again only for a correctness fix, and other findings become a `TASKS.md` row.

## Consequences

- Lev Neiman drafts the mechanism's system design (records, contract version, DM prompt, what a later card reads). No `TASKS.md` row until Stas accepts it.
- The DM prompt's `OWN_MOVE_RULE` and the prompt line "You never decide an outcome" change with that design, not before: today's code still carries the cap.
- Rows from the review stay open for that design: words that are a written choice count as that seat's vote; a "yes" or "no" from a person comes only from a roll; a consequence of a roll is recorded by the engine, not kept only in DM memory; the same stake rule in scenes.
- `game/src/agents/dm.ts` ("You never decide an outcome") contradicts Rule 4's new sentence until that design lands.
- The condensed project instructions are resynced from CLAUDE.md after this merges.

## Revisit when

- A run shows the DM writing stakes that the words did not earn, more than once.
- Coin, cargo or a death needs to come from a stake: those move only through typed engine effects or a fight, and the design must say how.

## Sources

- Project files (not in the repo): the review `engine/m12/rules-review/rules-review.md`; the note `engine/m11/own-move-on-a-card.md`.
- Runs `full-2026-11-13T16-05-31-438Z`, `full-2026-11-14T01-42-04-072Z`, `full-2026-11-14T17-19-50-900Z` (live notes).
- Decisions 0068, 0071; scope `docs/scope/not-a-passenger-scope.md`.
