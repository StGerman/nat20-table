# 0088. The world counts only what exists

- **Status:** Proposed
- **Date:** 2026-11-15
- **Decided by:** Stas accepted the rule on 2026-11-14 14:08Z in the feedback thread («Да»), in Lev Neiman's wording of that day. His caveat at 12:03Z stands beside it: we can measure through money, goods or land, but no artificial indicators; be very careful with this rule. This record is accepted when Stas merges it.

## Context

A design for a place that turns on the party was first sketched with counters: heat, trust, a hidden inverted trust. All were cut in the thread. The question left was what the world is allowed to count at all. Facts checked:

- The engine and the ledger already count things that exist: coin, goods, a wagon's team, wages owed, days, a creature's Hit Points and Exhaustion. The ledger's trial balance holds them to account.
- Deeds are not numbers. A deed is a named thing that happened, with who did it and the day (decision 0063); a card reads whether it is remembered.
- A person in the world's roster has an `attitude` of three values. A person on a card may show one authored line for a deed they witnessed (decision 0077, Proposed).
- A number the player cannot see tells no story, and a number that stands for an opinion invites a multiplier nobody can check against the fiction.

## Options

### A. Counters for regard
- Pro: one field per faction or person; easy to read in a condition; familiar from other games.
- Con: nobody in the story holds the number, so nothing in the story can show it; it decays or sums by rules the player never sees; twelve counters remembered thinly do less than three deeds remembered well.

### B. The world counts only what exists
- Pro: every number is something a person in the story could hand over, owe or lose, so the ledger can balance it and the narrator can show it; regard stays in deeds and in what people do.
- Con: a gradual change of regard has to be authored as cards and lines, deed by deed; it cannot be tuned by one constant.

### C. Counters, hidden from the player
- Pro: as A, with no interface cost.
- Con: A's faults, and the player can no longer even guess why the world answered as it did.

## Decision

B. The world counts coin, goods, land and holdings, debts and wages, days, and a creature's own state, and each is counted by the engine or the ledger. How anyone regards the party is never counted: it is deeds that named persons saw or were told of, shown by what those persons do. The test for a new number: can it be handed over, owed or lost? If not, it is not a number. It beat A and C because a consequence the player cannot see did not happen.

Edge cases, decided with it:

- A price that differs because of a deed is an authored card variant, never a multiplier.
- A debt that grows is a ledger liability on terms the party has read: a new account, not a counter.
- A bribe that wears off is counted in days.
- A roster person's `attitude` stays: one person, one step on a deed that person saw, never summed across people, never decaying.

## Consequences

- No design adds a reputation, heat, trust, fear or suspicion field, shown or hidden. A design that needs one first tries a deed, a card variant or a ledger account.
- A pack test with no model can hold it: no card effect names a multiplier, and no deed counts anything.
- The storytelling bible gains the line in its own PR (Zoya).
- Stas's caveat is a standing instruction: a number that passes the test on paper and still reads as an indicator goes to him as a question.

## Revisit when

A design shows a consequence that deeds, card variants and ledger accounts cannot carry without more than about a dozen authored variants for one fact; or a trading milestone needs a price that moves with supply, which is a count of goods and may pass the test.

## Sources

- `docs/scope/kamen-a-scope.md` §2 item 5 and §4; `docs/design/kamen-a-system-design.md` §2, §4.2, §10 rule 8.
- The feedback thread of 2026-11-14 (Stas 12:03Z and 14:08Z).
- Decisions 0063 (deeds), 0057 (the ledger), 0077 (witnessed deeds on a card).
