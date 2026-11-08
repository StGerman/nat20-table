# Milestone 12, Not a passenger («Не пассажир»): scope

Status: Accepted by Stas (table #336, 2026-11-08 22:35Z). Drafted by Yan Metsuyan (decision 0065). Award: cut 1 of 3, Stas 2026-11-08 21:15Z («звучит отлично»); ENG-21 added 22:01Z (sweep question 7, «ок по всем»); the voice flag 22:02Z; AGT-94 with AGT-76, ENG-41, AGT-13 (partial), MAP-15 and MAP-17 22:07Z («Все ок + MAP-15, MAP-17»); the phase order 22:09Z; the answers to §9 22:24Z, among them one language at the seat (decision 0067).
Companion documents: the system design, `docs/design/m12-system-design.md`; decisions 0066 (Milestone 11 closed; the order after it) and 0067 (one language at the seat), both merged with this scope in table #336; the own move note, project files `engine/m11/own-move-on-a-card.md`, variant B (Stas 20:39Z: «Да делаем обязательно own move»). This file sits beside `docs/scope/living-world-scope.md` and does not edit it; the Milestone 11 rows it reuses are that file's §8.3.

## 1. Goal

On a road card a player can say their own move, and the dice decide which of the card's outcomes it brings; every line the table shows is one a first-time player can read, in the order the story tells it.

Vera test (CLAUDE.md): in pair 3 she pressed a button she did not want after her third unanswered line and nearly closed the laptop (Stas's run, analysis §7). Would she get through alone? Not known until the Vera test reads the new card line; the exit asks it.

## 2. In

1. **Own move** (no row yet; note variant B). Every card the party decides gains a last line, "Something else: say it in your own words." The DM turns the words into a check from the SRD DC ladder (or the pack's DC) and names which of the card's existing choices a success and a failure bring. The engine rolls and decides (Rule 4). The world writes a deed that the party found its own way on that card; its id is design question 4 (deed ids are snake_case, ENG-33, and the note's `own_move:<card>` has a colon). One new DM command, additive. When no choice fits, the DM says so and the card waits (AGT-96, table #329). On a caravan card the owner still decides; an own move is a Blade's advice the owner can take.
2. **No variant replaces the obvious move** (M11 lesson; note "Also"): a variant may replace a choice only if that choice is not the card's question or plea; the deck validator tests it.
3. **The card comes after its narration** (no row; finding). Stas's run: `toll_man_stocks` reached the seat with no narration (transcript line 157; the DM wake timed out) and `sheep_on_track` one line before its narration (lines 227-229). AI half, Vera: cards arrive after the narration has moved on (the night card after «ночь прошла тихо»). Cause: decision 0041 shows held lines at once when a decision comes up, and a card is a decision.
4. **The marked choice is marked** (no row; finding). The prompt says "a number, or Enter for the marked choice" (`game/src/ui/input.ts:78`); the list marks none (Vera, twice, per the note).
5. **AGT-98** (lines a first-time player cannot read), **AGT-97** (the DM wake ends on its last tool call), **AGT-94** with **AGT-76** in one PR (the story scrolls back on a Mac keyboard; the Ink seat tests in the same `panel.test.ts`), **AGT-13** partial (its exit read below; the row stays partial until a Friends and Family test).
6. **Content:** **MAP-14** (the bridge card fires at the bridge), **MAP-15** (roster deeds with a reader), **MAP-17** (Odda's thanks costs something). Stas moved MAP-15 and MAP-17 here from the Dramaturg mechanism milestone (22:07Z).
7. **Fixes:** **ENG-40**, **ENG-41** and **ENG-42** in one PR; **ENG-21** (a move never ends in another creature's space): core fix, pin, re-record.
8. **Narration voice by run flag, Plain or Fireside** (no row; Stas 22:02Z), so the two voices can be compared on a pack already played.
9. **One language at the seat** (decision 0067; Stas 22:24Z): in a Russian run every line the seat shows is Russian: engine lines, option names, card and choice text, the UI. AGT-98 translates by default, hides or explains only where translation does not help. Both road packs gain card and choice text in Russian. Roll ids stay.

Every pack or card change (items 1, 2, 6 and 9) gets Zoya's board check before it goes to Stas (CLAUDE.md, "Dramaturg"), and a Vera read for each new or changed card choice.

## 3. Out

- Variant A alone (it is the "no fitting choice" path) and variant C (the DM writes outcomes): rejected in the note under Rule 4. An own move never invents an outcome, a cost or a deed.
- Own moves in a fight or outside a card: scene checks already cover them.
- A new voice, any change to Plain's or Fireside's text, or a new default: Plain stays the default.
- MAP-16 (narration slips) and the other open rows: stay in TASKS.md unless Stas names them.
- AGT-13's own check, a first-time player at the table: Friends and Family testing, after M12.
- A language other than English and Russian; a locale in the engine contract (0067 option D).
- Everything §8.2 of the living-world scope keeps out (hearsay, road NPCs, live DM cards); latency gates.

## 4. Exit criterion

Two runs on one build, in this order (decision 0043; the order is decision 0065's, an order inside 0043, not a new rule):

1. *Fair in Wend*, `play:unattended`, all AI, a new roster, voice Plain.
2. Only after run 1 has passed (verdict PASS once Stas has ruled its flags; PENDING has not passed): *The Way Back* on run 1's roster, `play:demo`, Stas as a Hired Blade, voice Plain.

A fail in run 1 means a fix, a new build and run 1 again; Stas does not play that build. A fail in run 2 means a fix and both runs again on the new build.

Each run passes:

1. The Milestone 11 rows that still apply: §8.3 rows 1 to 3; row 4's narration judge half, no story-space flag that Stas confirms (its Vera half becomes item 3); in run 2 also row 5.
2. **Own move:** in run 2, at least one card decided by Stas's own move: the roll cited, the card decided by the choice named for that result, the own-move deed in the world's deeds. In run 1 too, by an AI player (§9 answer 1).
3. **Readable:** the Vera fallback reads the scene opening and one card (the own-move card where there is one) with its narration, as a player's seat shows them (narration, engine lines, the card and its prompt line), and asks about no engine line. In run 2 she also reads Stas's `/options` and `/sheet` output (AGT-13). Her answer is quoted verbatim.
5. **One language:** in run 2 (Russian), no line at the seat is English except ids every player is shown and roll ids (0067); the leak and language scans report each English line.
4. **In order:** no card reaches the seat before the narration that frames it, except after a logged DM fallback; no wake is logged as timed out after its narrate call returned (AGT-97).

Checked by tests, CI and Zoya's board check, not by the runs: MAP-14, MAP-15, MAP-17, ENG-21, ENG-40 to ENG-42, AGT-94, AGT-76 (a full `check:ts` green on Stas's Mac), the marked choice, the validator rule (In 2).
Reported, not gated: p95 against pair 3; own moves that found no fitting choice; which MAP-15 and MAP-17 lines fired; the voice comparison (§9 answer 3: one Fireside `play:unattended` of *Fair in Wend* on the exit build and run 1's seed, on its own roster; the Vera fallback and Zoya read the same opening and first card in both; Stas reads the two samples).

## 5. Order

Two phases (Stas, 2026-11-08 22:09Z), then the exit pair on the build that carries both:

1. **MAP-15 and MAP-17.** Both rows are on main (TASKS.md, 3472982), so phase 1 can start, and reach Stas, before this scope merges: Zoya's board check first, then a Vera read of each changed card line.
2. **The Not a passenger changes:** own move, the two findings, AGT-97, AGT-98, one language at the seat, MAP-14, the voice flag, ENG-21, ENG-40 to ENG-42, AGT-94 with AGT-76, AGT-13. Its new rows (§7) wait for this scope and the system design to merge.

## 6. Questions for the system design

1. **Contract (Rule 1):** the `own_move` fields (`actor`, `text`, the check, `success`, `failure`), which are required, whether the check reuses `request_check`'s `{kind: "scenario" | "ladder"}` shape, the error reasons (card not waiting, choice not on the card, actor not on the card), the event that decides the card (a new `came` value or a new event), the fixture, the CHANGELOG line.
2. **Visibility (Rule 3):** the visibility-table row for the player's words, the skill, the DC, the success and failure choices and the deed. The DC and `against` never reach a player view; are the success and failure choices DM only until the roll?
3. **Who rolls (Rule 4):** the actor's check through core, Advantage only from what the engine tracks; the DC from the ladder (5, 10, 15, 20, 25, 30) or the pack. The note's example "Persuasion DC 12 (Medium)" is not on the ladder: Medium is 15. One own move per card, or a retry after a failure?
4. **The deed:** its id under the ENG-33 snake_case grammar (the note's `own_move:<card>` does not fit); whether it carries the result; whether it outlives the contract (ENG-37); who reads it (`if`, `unless`, the run report).
5. **The line:** where "Something else: say it in your own words." lives (TUI string, deck data or the card view); its text in each run language (0067); its Vera test (required for a new card line) and Zoya's board check.
6. **Who may use it:** the human (votes first, decision 0062), the AI players (a tool and a prompt line; §9 answer 1), Blades on a caravan card, arrival cards (ENG-35), a forewarned choice opened by scouting (API-54).
7. **No fitting choice:** the DM prompt rule and its test; the card waits as AGT-96 built.
8. **Card order:** how the seat holds a card until its narration, and for how long when the wake fails (AGT-97). Does this refine 0041's "lines still held when a decision comes up show at once"? If yes, a record. The transcript check for exit row 4.
9. **Marked choice:** which choice Enter takes and how the list shows it; a Vera test.
10. **AGT-98 and one language (0067):** per line translate (the default), hide or explain; how the table renders engine lines from event fields; where a pack keeps text per language and how its validator checks both; what an English run keeps byte for byte; a Vera test per changed line.
11. **Voice flag:** where it lands (profile, CLI flag, `run.json` with its source, `game/src/play/driver.ts`); how it reaches the DM under `--craft prompt` (both pair-3 runs) and `skills`; whether it overrides or touches the pack's own instruction (the voice skill uses Fireside "only when the adventure's instructions ask for it"); which reference sample (F or G) the narration judge and Zoya read it against.
12. **ENG-21:** the core PR into `demo`, the re-pin in its own table PR (Rule 5), the fixtures it re-records.
13. **AGT-94, AGT-76, AGT-13:** the Mac scroll key and the trackpad wheel, shown in the footer and `/help` (a changed TUI line: Vera test); AGT-76's cause under load, never a longer wait; how the `/options` and `/sheet` output reaches the Vera read (the run records it, or the screen is copied).

## 7. Rows that would follow (after spec and design merge)

- ENG-43 (M): an own move decides a card with the named choice's effects and writes the own-move deed.
- API-56 (M): `own_move` on the wire: contract, fixture, CHANGELOG, server.
- AGT-99 (M): own move at the table: the DM tool and prompt rule, the human's and the AI players' move, the card line.
- MAP-18 (S): variants never replace a card's question or plea: the validator rule, the line in both packs, Zoya's board check.
- AGT-100 (S): a card shows after the narration that frames it.
- AGT-101 (XS): the marked choice is marked on the list.
- AGT-102 (S): narration voice by run flag, Plain or Fireside.
- MAP-19 (M): card and choice text in Russian for *Fair in Wend* and *The Way Back* (0067); Zoya's board check and a Vera read.
- AGT-103 (S): the M12 rows in the run report and verdict, AGT-13's read, the language scan, and the exit pair.
- Into row 12 as they stand: AGT-97, AGT-98 (from M to L under 0067), AGT-94, AGT-76, AGT-13 (partial), MAP-14, MAP-15, MAP-17, ENG-21, ENG-40, ENG-41, ENG-42.

## 8. Cost

No bid was priced before the award; priced here.

| Field | M12 | M11 baseline |
| --- | --- | --- |
| Size | 1 L, 4 M, 12 S, 4 XS: 15 to 35 days of thread work | 19 rows in row 11's Tasks |
| Stas's review | 19 PRs: 1 docs (§9 answer 4), 1 core, 1 pin, 16 table (ENG-40 to ENG-42 in one, AGT-94 with AGT-76 in one) | 27: table #298 and #299 to #325 (no #301) |
| Exit runs | 1 pair, AI half first | 3 pairs to pass 1: 5 runs (pair 2 stopped after its AI half) |
| Run load | AI half about 7.9 USD and 12 min; Stas's half about 5.2 USD and 27 min; one Fireside run about 7.9 USD (§9 answer 3) | 35.45 USD; Stas 65.6 min at the table, 39.1 of them on be5e650, whose AI half had failed |
| Stas at the Mac, besides his half | starting the unattended runs; one full `check:ts` (AGT-76); about 15 min reading two voice samples (§9 answer 3) | none priced |
| Elapsed | from roadmap dates at the exit | docs merged 2026-11-06 18:08Z, stack merged 2026-11-08 21:00Z: 2.1 days |

Target (decision 0065, half the baseline): 17.7 USD, 33 min of Stas at the table, 1 pair. Planned: 20.9 USD with the Fireside run, 3.2 over, to save Stas an evening; 27 min; 1 pair. Review: 19 PRs against 27, 0.70 of the baseline: not half. One language (0067) costs about 1 L and 1 M of the size and 1 PR. The target holds only if the pair passes the first time: each failed pair adds about 2 hours of Stas, a day and 13 USD.

## 9. Decided by Stas (2026-11-08 22:24Z)

1. The AI half also decides a card by an own move: yes. The path is proven on the build before Stas sits down.
2. The table's lines in the run's language: yes («Вера читает но оба языка вмешаны ломает вайб»). Decision 0067, in this PR, supersedes 0038's English half; Yan had recommended no.
3. Plain against Fireside: A, one Fireside `play:unattended` beside the pair (§4, Reported).
4. The scope, the system design and the rows land in one docs PR: yes. Stas merged the scope alone, table #336 at 22:35Z; the system design follows in its own PR, and the rows join that PR once Stas accepts the design.

## 10. Amendments proposed

1. Every exit pair from M12 on plays the all-AI half first, and Stas plays only after it passed on the same build, with its flags ruled. Why: 0065 records the rule only in this scope, so the next scope would lose it. Carried as a consequence in decision 0066.
2. TASKS.md's Size legend gains XS (a few hours), applied in this PR. Why: ENG-40, ENG-41, ENG-42 and CON-7 use it and the legend had no XS.
3. An award with no priced bid gets its price in the scope's cost line, marked "priced here". Why: the scope procedure carries a bid's price over, and this award had none.

## Sources

- Own move note: project files `engine/m11/own-move-on-a-card.md`. Rows: `TASKS.md` on main 3472982, 37 open rows.
- Exit pair 3 analyses: project files `engine/m11/runs/full-2026-11-07T20-54-27-518Z/analysis.md` §7 (AI half) and `engine/m11/runs/full-2026-11-08T20-11-16-308Z/analysis.md` §3, §6, §7, with its `transcript.jsonl` lines 152-157 and 225-229 (Stas's run).
- Run costs and times: nat20-runs `master`, `runs/full-2026-11-07T14-41-01-898Z`, `14-55-35-005Z`, `17-47-26-685Z`, `20-54-27-518Z`, `full-2026-11-08T20-11-16-308Z` (`run.json`, `usage.jsonl` `api_equivalent_usd`).
- Decisions 0038, 0041, 0043, 0062, 0063, 0065, 0066, 0067. SRD 5.2.1: Difficulty Class; Ability Checks.
