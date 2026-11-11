# Milestone 13, Dramaturg mechanism: scope

Status: Proposed. Drafted by Yan Metsuyan (0065), 2026-11-11, main a739abd. No bid was tendered; priced here.
Inputs: the campaign line and the dramaturg design (2026-11-07); 0066, order item 2. The system design is Lev Neiman's (decision 0069, table #345 merged); Lev's read of this draft is quoted in table #348 and moved Question 6.

## 1. Goal

When the party that saved the miller's apprentice walks into Wendford on a later contract, the village tells them what it heard of the mill, and what the party answers is remembered, because the engine kept the deed.

The retelling (Lev): "We let the last goblin in the mill yard live. Two contracts later the Wendford folk brought it up."

Vera test: she sees one new card at Wendford; the exit asks her about it.

## 2. In

One new system: a scene writes a deed (gap A). The reader is the one the road has, an arrival card with `if`; a scene that reads a deed (gap B) waits for Arachas plus glue, whose scenes are its first readers (Question 6, Lev's lean).

1. **Carrier A: a scene writes a deed** (gap A, links 1, 3, 4). A scene can `remember` a deed beside `flag`, on outcomes the engine records: a check's consequence, a fight's end and its reason (`end_combat`, a surrender the DM calls under the scene's stated condition included, which the engine checks and records), a named creature's death (`killed_<npc>`). A deed is never written on the DM's word alone, with no engine event behind it (Rule 4). Why: the Mill writes nothing that outlives the session.
2. **The reader: a Wendford arrival card** (link 1), `target: blades`, `once: true`, in `worlds/wend/deck/wendford.json`, with `if` on Mill deeds. On *Fair in Wend* after a Mill run it is the only Wendford card whose `if` holds (the bridge cards read deeds written later on that route), so it is drawn; on later contracts it can lose the pick, and `once` keeps it from greeting twice. Why: cards already read deeds and say the cause; a scene reader would be a second new system with one reader.
3. **A pack with no campaign joins the world's memory.** *The Silent Mill* names its world (`worlds/wend` already has `pells_mill`) and its deeds go into the roster with a contract number and day, so a later contract reads them. Why: otherwise A writes into a session that ends.
4. **Content, link 1 carried:** the Mill's scenes write deeds only on engine-recorded outcomes (the design fixes ids): the Scene 3 fight writes one of two deeds, the party took a goblin prisoner (`snitt_yielded`, only when the creature that yielded is a goblin; the yard's surrender condition counts the wolves too) or did not (`yard_to_the_end`), so every run that leaves the yard has an outcome deed. `wenna_saved` is a marker every win writes, on the cellar fight's `end_combat` with the party standing, never on the DM's scene exit; `killed_gritch` is one too until MAP-13 lets Gritch yield. Scene 4's two interrogation checks write no deed in M13 (both can run in one scene, so their deeds could contradict). Two Wendford arrival cards whose conditions exclude each other (as `gwyn_news` and `gwyn_cheese` do), `if: [wenna_saved, snitt_yielded]` and `if: [wenna_saved, yard_to_the_end]`, each say what the village heard and how it treats the party; their 2 or 3 choices are the party's answer and each writes its own deed (the content is Zoya's). The DM never narrates Snitt's fate, which no deed records. The prose canon goes: "the village knows them" leaves `fw_wendford.md`, and Osric's note in `worlds/wend/npcs.json` loses "Knows the Grey Lantern company if they played The Silent Mill." Zoya's board check; Vera.
5. **An outcome reader beside `m11-thread`** (0066 asks for a real one): a new M13 verdict row counts only a deed that tells outcomes apart, by amendment 3's rule checked from the pack data (another outcome of the same scene or card writes a different deed), never a marker every path writes (today `crossed_millbeck`, `wenna_saved`, `killed_gritch`); a forced outcome (`yard_to_the_end` with a wolf last) counts as an outcome but the report never calls it the party's choice; `m11-thread` itself stays as written.

A before MAP-13 is the cheap order: `gritch_spared` then needs no converter.

## 3. Out

- **Quests as `kind: errand`** and **fronts and clocks**: to Arachas plus glue (campaign-line quest Q6, the new moon); no link in this proof needs a ledger pay or a day. Question 2.
- **Witnesses and the attitude step** (gap E): to Arachas plus glue, its first readers. Question 3.
- **Words in the own-move deed**: stays a bare id, owed on Zoya's board. Question 4.
- **MAP-13**: its own row, after A, before Arachas (the rows PR adds "after A"). Question 5.
- **Claims as deeds** (idea 6): a new DM tool with no reader in the shipped packs.
- **A scene that reads a deed** (carrier B, gap B): to Arachas plus glue. Question 6.
- **Carrier C and gap D**: Arachas content, on A.
- **Snitt's fate after Scene 4 and the promise to him**: no scene decides them, so no deed is written (a deed there would be the DM's ruling); owed on Zoya's board until a scene puts the choice to the party (Arachas plus glue or the Mill plus glue).
- **A model in the loop**, scripts, the wants ledger, prices as story.
- **Everything of M12**: no M12 row, file or verdict row changes. MAP-16 and CON-7 stay open rows.

## 4. Exit criterion

One pair on one build, AI half first (0043, 0065, 0066):

1. *The Silent Mill*, `play:unattended`, all AI, a new roster.
2. Only after run 1 has passed, with its flags ruled: *Fair in Wend* on run 1's roster, `play:demo`, Stas as a Hired Blade, in the run language M12's exit used.

A fail in run 1: fix, new build, run 1 again; Stas does not play that build. A fail in run 2: fix, both runs again.

Each run passes:

1. The rows that still apply: run 1 the Demo Run rows 1 to 3 and 5 (as 0059); run 2 the M11 §8.3 rows 1 to 3, row 4's narration judge half, row 5 (`m11-memory`, which passes on the Mill card), and the M12 rows `m12-order` and `m12-language` (AGT-103).
2. **Written** (run 1): at least two Mill deeds written by scenes, with `by`, day and contract, in the saved roster's world memory, one of them a Scene 3 outcome deed (In 4), which every run that leaves the yard writes.
3. **Carried** (run 2): the Mill card for run 1's Scene 3 deed is drawn at Wendford and decided by the Blades, its choice writes its deed (the M13 row of In 5 counts it), the narration judge answers yes to "does the DM name what the party did at the mill", and finds no contradiction. The run report quotes the lines.
4. **Readable** (run 2): the Vera fallback reads the Mill card with its narration as the seat shows it, and Zoya's the same lines for the board; both quoted verbatim.

Checked by CI: a seeded Wendford draw on a Mill roster offers the matching Mill card and never the other; the validator across packs. Reported, not gated: p95; every deed written and read; `m12-own-move` on run 2.

## 5. Questions for the system design

1. **Contract (Rule 1):** `remember` as a scene `Consequence`; which other outcomes carry it (a fight's end, a surrender and which creature yielded, a death); fixture; CHANGELOG, after M12's last dev version.
2. **The reader:** an arrival card reading a deed from a pack with no campaign; whether exit row 3 may rely on the card being the only eligible one at Wendford, or the deck needs a rule for a card that must come (today only `add_card {soon: true}` from a choice does that). Visibility (Rule 3): the deed stays DM only; the player sees the card.
3. **Who `by` is** on a deed no seat chose (a fight's end, a surrender, a death): the party's handles at the scene, or another rule.
4. **A pack with no world:** how a format 1 pack names its world and writes into the roster, with a contract number and day on every deed; a Mill roster continuing into a road contract (purse, XP); no roster format bump.
5. **Named people:** a world id for Gritch, so the death deed works and MAP-13 adds `gritch_spared` with no converter. Snitt gets none in M13: his fate stays unrecorded (Out).
6. **The validator across packs:** a deed one pack reads and another writes.
7. **Room for later:** optional `saw` and cause fields on the deed record, so gap E and question 4 (b) need no new roster format.

## 6. Rows that would follow (after spec and design merge)

- API-57 (S): scene deeds: `remember` on scene outcomes, the death deed for a scene's named creature, the validator across packs; contract, fixture, CHANGELOG, server.
- ENG-44 (S): a pack with no campaign writes into its world's memory with a contract number; a Mill roster continues into a road contract.
- MAP-20 (S): the Mill's outcome deeds, the two Wendford Mill cards (one per Scene 3 deed, a deed per choice), the prose canon removed from `fw_wendford.md` and Osric's note; Zoya, Vera. Waits for the bible PR of amendment 3.
- AGT-104 (S): the M13 verdict rows (written, carried with the outcome reader of In 5, readable), the report's lines and the exit pair.
- The rows PR also edits MAP-13: after carrier A, before the Arachas pack.

## 7. Cost

| Field | M13 plan | M12 plan | M11 baseline |
| --- | --- | --- | --- |
| Size | 4 S: about 3 to 4 days of thread work, plus Zoya's bible PR | 1 L, 4 M, 12 S, 4 XS | 19 rows |
| Stas's review | 8 PRs: 1 scope, 1 design, 1 rows, 1 bible (amendment 3), 4 code and content | 17 | 27 |
| Exit runs | 1 pair, AI half first | 1 pair | 3 pairs to pass 1 |
| Run load, USD | Mill all AI about 15.5 (the last all-AI Mill PASS; re-measure); Stas's *Fair in Wend* half about 7.9 (an estimate: pair 3's all-AI Fair run; no human Fair run measured since M9): 23.4 | 20.9 | 35.45 |
| Stas at the table, min | about 26 (M9's human *Fair in Wend*, 0060) | 27 | 65.6 |

Target (0065, half the baseline): 17.73 USD, 33 min, 1 pair, 13.5 PRs, 1.06 days. Planned days: 3 to 4 of thread work, over the 1.06 target; the code also waits for M12's exit pair. Planned: 23.4 USD, 5.7 over (a Mill all-AI run costs two road runs); about 26 min, plus starting run 1 and about 10 min of quotes; 1 pair; 8 PRs, 0.30 of the baseline. A failed run 1 costs a day, 15.5 USD and a review of the fix, but no table time; a failed run 2 costs Stas his sitting (about 26 min), a review of the fix and a second sitting on the new build (about 1 hour in all), a day and 23.4 USD.

**M12 dependencies.** Under 0043 as amendment 1 reads it: no M13 code or content PR merges before M12's exit pair has passed on its build.

1. M12's exit build is M13's base. If M12 slips, M13's docs still merge (amendment 1); its code waits.
2. Contract: M13 takes the `dev.N` after M12's last (API-56).
3. AGT-104 builds on AGT-103's report and rows `m12-order`, `m12-language`. If AGT-103 slips, run 2 gates the M11 rows only.
4. A Russian run 2 rests on AGT-98 and MAP-19. If they slip, run 2 plays English without `m12-language`.
5. The Mill card shows after its narration only with AGT-100. If AGT-100 slips, exit row 4 reads the card as the seat shows it anyway.
6. `own_move_<card>` (API-56) is used only under question 4 (b).

## 8. Questions for Stas

1. **The exit pair.** (a) *The Silent Mill* all AI on a new roster, then *Fair in Wend* on its roster with Stas: carries link 1, the one that is prose today; about 23.4 USD and 26 min of Stas, 5.7 USD over target; recommended. (b) Road only, and only with Question 6 (a): *Fair in Wend* all AI, then *The Way Back* with Stas, a scene reading a Fair deed: about 13.0 USD (pair 3), under target in USD, but about 33 min of Stas (M11's *The Way Back* sittings) and 9 PRs, but on a link the cards already carry; it needs a *The Way Back* content row more, and In 3 and In 4 (the Mill in the world's memory) ship with no run that plays them. (c) (a) plus *Fair in Wend* all AI on the Mill roster before Stas plays, so the cross-quest read is proven before he sits: about 31.3 USD, 13.6 over.
2. **Quests as `kind: errand`, and fronts and clocks.** (a) Both out, to Arachas plus glue, where campaign-line quest Q6 and the new moon are their first cases; recommended. (b) Errand in, with campaign-line quest Q1 as its case (the reeve's chest pays through the ledger): about 1 M and 2 PRs more. (c) Both in: about 2 M and 4 PRs more, and the exit needs a run that plays a clock.
3. **Witnesses and the attitude step (gap E).** (a) Out, to Arachas plus glue, whose scenes are its first readers; recommended. (b) Only the `saw` field on the deed record now, no attitude step: XS and a fixture, no reader until Arachas; Zoya would take this now (Consequence 2), since Arachas needs it. (c) Both in: about 1 M and 2 PRs more.
4. **Words in the own-move deed.** (a) Out: `own_move_<card>` stays a bare id, owed on Zoya's board until a pack reads one; recommended. (b) In: the deed keeps the player's words as its DM-only cause: XS, and it waits for API-56 to merge. Zoya: the bible (Story-space 1) leans to (b); (a) only with the deed listed as owed.
5. **MAP-13, the Mill's goblins can yield.** (a) Out of M13: its own row, after carrier A and before Arachas (the rows PR writes "after A" into the row; today it says only "before the Arachas pack"); recommended. (b) In: Gritch and the cellar band can yield and `gritch_spared` is written from the start: S and 1 PR more, and run 1 may play it.
6. **Who reads the Mill deed: a card now, a scene with Arachas.** (a) A scene reads deeds from this milestone (`if`/`unless` on scene variants, carrier B): Arachas plus glue starts with its reader and carries content only (its concept names scene 1 on the hill-farm deeds and the finale on `heard_of_the_hollow_king`); API-57 grows to M, plus a DM prompt row (XS) in its own PR, `m11-memory` is reported, not gated (a scene, not a card, reads): 9 PRs. (b) A Wendford arrival card reads it (In 2); scene reading moves to Arachas plus glue; one new system in M13; recommended (Lev: "B's only reader in M13 is a greeting a card can carry"; Yan had drafted (a)).

## 9. Amendments proposed

1. A later milestone's scope, design and rows PRs may merge while the earlier milestone builds; its code and content PRs merge only after the earlier exit pair has passed on its build. Why: 0043 speaks of builds only; followed here.
2. This scope uses 13, as Stas does; TASKS.md § Milestones gains row 13 with the rows PR, and the roadmap's unnumbered line takes the number then. Why: the roadmap numbers a milestone only once it has its row. The shop's "M17" (0057, living-world §4) stays as written.
3. Zoya's, for her bible (`.claude/skills/zoya/references/`, by its own PR): a deed carries a pay-off only if another outcome of the same scene or card writes a different deed; a deed every path writes is a marker, not a cause; a marker may gate prose (a greeting) but never counts as a carried pay-off. Why: Consequence 2 reads a deed back "as a cause the table hears", and a marker has no choice behind it. MAP-20 waits on it.

## Sources

- Stas's campaign line and dramaturg design, 2026-11-07. Decisions 0043, 0057, 0059, 0065, 0066; 0069 (table #345).
- M11 and M12 designs; `verdict.ts` (`m11-thread`); `scene.rs` (`Consequence`); the Mill's scene files (flags only).
- nat20-runs: `full-2026-11-01T23-25-02-525Z`, 15.51 USD; pair 3 as in `docs/roadmap.md`.
