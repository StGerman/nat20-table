---
type: Milestone
title: "Allies in fights («Свои в бою»)"
description: "Whoever rides with the wagon is in its fights under the engine's script, the Merchant can die, and names the story has said open a person card"
state: open
---

# Exit criterion

Design §11 (`docs/design/allies-in-fights-system-design.md`), each row with its lowest layer (decision 0080):

1. Seeded case per `wagon` fight, each ally dead in one seed and hurt in another, each deed and reader checked: test, no model
2. Rules A5 and A6 (`allies.jsonl`): test, no model
3. Seeded Merchant death, both choices, pay and trial balance: test, no model
4. `pack check` rules N2 and A9 on the shipped packs: test, no model
5. Visibility scan with N3 and N6: test, no model
6. `fed_gwyns_dog` with Gwyn absent, «Помнит» only after the `dog` choice: test, no model
7. Rule N1, a unit case per card state, the mention-then-fight fixture: test, no model
8. Describer cache, timeout, fallback; a scripted judge case per kind: test, no model
9. One all-AI *Fair in Wend* on the exit build passes audit, leak scan and judge; `not_in_fight` and `unknown_person` counted, Stas rules each: a full run
10. Vera reads ten model-written cards beside their authored lines: a live run smaller than the exit run, then a person
11. Stas at his Mac, about 10 min: click a name, Option select, slash on a Russian layout, Ctrl+C twice, mouse off after exit: a person
12. Vera reads a `play:card` `night_wolves` fight where Tam is the ally hurt: a live run smaller than the exit run, then a person

# Tasks

In design §13 merge order: ENG-47, MAP-22, MON-12 (core PR and pin), API-58, ENG-48 (engine), API-59, MAP-24, ENG-48 (deck), MAP-23, ENG-49 (engine, deck), AGT-106, AGT-107, AGT-108, AGT-109, AGT-127 (the describer; the scope's AGT-112). Scope `docs/scope/allies-in-fights-scope.md` (table #365), design table #412; decisions 0070, 0076, 0077, 0086.

# Status

open, no number yet. Design and estimate accepted by Stas (table #412); his goal 2026-11-16 21:37Z: the full scope, every PR 🟢, done = ready for exit runs. Estimate (design §14): 21 PRs, 351 to 362 USD build, 10.5 to 19.5 USD runs, Stas 7.9 to 8.5 h, 3 to 6 days. Milestone 13 closed 2026-11-16, so no M13 file waits.
§16 answered by Stas 2026-11-16 (table #419): no target for ally deaths, the describer rewords `look` only, the rest as recommended.
