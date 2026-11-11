# Milestone 13, Dramaturg mechanism: scope

Status: Proposed; §8 answered by Stas 2026-11-11 23:40Z. Drafted by Yan Metsuyan (0065), 2026-11-11, main a739abd. No bid was tendered; priced here.
Inputs: the campaign line and the dramaturg design (2026-11-07); 0066, order item 2. The system design is Lev Neiman's (decision 0069, table #345 merged); Lev's read of this draft is quoted in table #348 and moved §8 6.

## 1. Goal

When the party that saved the miller's apprentice walks into Wendford on a later contract, the village tells them what it heard of the mill, and what the party answers is remembered, because the engine kept the deed.

The retelling (Lev): "We let the last goblin in the mill yard live. Two contracts later the Wendford folk brought it up."

Vera test: she sees one new card at Wendford; the exit asks her about it.

## 2. In

One new system: a scene writes a deed (gap A). The reader is the one the road has, an arrival card with `if`; a scene that reads a deed (gap B) waits for Arachas plus glue, whose scenes are its first readers (§8 6).

1. **Carrier A: a scene writes a deed** (gap A, links 1, 3, 4). A scene can `remember` a deed beside `flag`, on outcomes the engine records: a check's consequence, a fight's end and its reason (`end_combat`, including a surrender the DM calls under the scene's stated condition, which the engine checks), a named creature's death (`killed_<npc>`). Never on the DM's word alone (Rule 4). Why: the Mill writes nothing that outlives the session.
2. **The reader: a Wendford arrival card** (link 1), `target: blades`, `once: true`, in `worlds/wend/deck/wendford.json`, with `if` on Mill deeds. On *Fair in Wend* after a Mill run it is the only Wendford card whose `if` holds, so it is drawn; later it can lose the pick, and `once` keeps it from greeting twice. Why: cards already read deeds; a scene reader would be a second new system with one reader.
3. **A pack with no campaign joins the world's memory.** *The Silent Mill* names its world (`worlds/wend` already has `pells_mill`) and its deeds go into the roster with a contract number and day, so a later contract reads them. Why: otherwise A writes into a session that ends.
4. **Content, link 1 carried:** the Mill's scenes write deeds only on engine-recorded outcomes (the design fixes ids): the Scene 3 fight writes one of two, the party took a goblin prisoner (`snitt_yielded`, only when a goblin yielded; the yard's surrender condition counts wolves too) or did not (`yard_to_the_end`). `wenna_saved` is a marker every win writes, on the cellar fight's `end_combat` with the party standing, never on the DM's scene exit; `killed_gritch` is one too until MAP-13 lets Gritch yield. Scene 4's two interrogation checks write no deed in M13 (both can run in one scene, so their deeds could contradict). Two Wendford arrival cards whose conditions exclude each other, `if: [wenna_saved, snitt_yielded]` and `if: [wenna_saved, yard_to_the_end]`, each say what the village heard and how it treats the party; their 2 or 3 choices are the party's answer and each writes its own deed (Zoya's content). The DM never narrates Snitt's fate. The prose canon goes: "the village knows them" leaves `fw_wendford.md`, and Osric's note in `worlds/wend/npcs.json` loses "Knows the Grey Lantern company if they played The Silent Mill." Zoya's board check; Vera.
5. **An outcome reader beside `m11-thread`** (0066 asks for a real one): a new M13 verdict row counts only a deed that tells outcomes apart, by amendment 3's rule checked from the pack data, never a marker every path writes (today `crossed_millbeck`, `wenna_saved`, `killed_gritch`); a forced outcome (`yard_to_the_end` with a wolf last) counts but the report never calls it the party's choice; `m11-thread` stays as written.

## 3. Out, and where each item goes

Placed by Stas's §8 answers (§8 n). "Decide later" means no row. No M12 row, file or verdict row changes.

| Item | Shelf | Why | Waits on |
|---|---|---|---|
| In 1 to 3: scene deeds, the Wendford card, the Mill in the world's memory | M13 In | carries the one prose link with one new system (§8 1, 6) | design, rows; code after M12's exit pair (0043) |
| In 4, 5: the Mill's deeds and cards (MAP-20), the outcome reader | M13 In | proves a choice carried, not a marker | the bible PR; Zoya, Vera |
| Bible amendment 3: a deed every path writes is a marker, not a cause | bible PR, its own | the bible changes only by PR | Stas's review |
| `examples.md` spells "Venna"; the scenes say "Wenna" | bible PR | a typo | nothing |
| Quests as `kind: errand`; fronts and clocks | M13 Out → Arachas plus glue | no link here needs a ledger pay or a day; quest Q6 and the new moon are their first cases (§8 2) | Arachas plus glue scope |
| A scene reads a deed (carrier B, gap B) | M13 Out → Arachas plus glue | its scenes are the first readers (§8 6) | Arachas plus glue scope |
| Witnesses and the attitude step (gap E) | M13 Out → Arachas plus glue | its first readers (§8 3) | Arachas plus glue scope |
| The `saw` field (Zoya would take it now) | M13 Out → Arachas plus glue; design question 7 keeps room | no reader before Arachas (§8 3) | Arachas plus glue scope |
| Carrier C, gap D | M13 Out → Arachas plus glue | Arachas content, on A | carrier A |
| Arrival without a draw (Lev A: first eligible card in file order, no draw-three, no DM pick) | M13 Out → Arachas plus glue, decided there (Stas, 23:40Z) | not needed for this exit; revises M11's draw-three and DM pick; collides with M12's card flow in flight; wants piles with real competitors | Arachas piles; DM-pick data from M12, M13 runs |
| Snitt's fate after Scene 4, the promise to him | M13 Out → Arachas plus glue or the Mill plus glue; owed on Zoya's board | no scene decides them; a deed would be the DM's ruling | a scene that puts the choice to the party |
| Words in the own-move deed (the bible leans to keep) | no row, decide later; owed on Zoya's board | no pack reads one (§8 4) | a pack that reads one; API-56 |
| Claims as deeds (idea 6) | no row, decide later | a new DM tool, no reader in the shipped packs | a reader |
| A model in the loop, scripts, the wants ledger, prices as story | no row, decide later | outside this proof | Stas |
| Delete deck fields `requires` (0 of 37 cards) and `owner_insists` (0 of 112 choices) (Lev B) | after M12's exit pair, own small `world/` PR | unused; free | M12's exit pair; Stas names the row |
| MAP-13, the Mill's goblins yield | own row, after A, before Arachas | after A, `gritch_spared` needs no converter (§8 5) | carrier A; the rows PR writes "after A" |
| MAP-16, CON-7 | open rows, no milestone | M13 changes neither | Stas's order |
| Lev's first read (`owner_pick` is a tie-break id, not a queue lever) | done | fixed in this draft | nothing |
| Lev Neiman, game designer persona | done | table #345 and #351 (Fable only), merged 2026-11-11 | nothing |

## 4. Exit criterion

One pair on one build, AI half first (0043, 0065, 0066):

1. *The Silent Mill*, `play:unattended`, all AI, a new roster.
2. Only after run 1 has passed, with its flags ruled: *Fair in Wend* on run 1's roster, `play:demo`, Stas as a Hired Blade, in the run language M12's exit used.

A fail in run 1: fix, new build, run 1 again; Stas does not play that build. A fail in run 2: fix, both runs again.

Each run passes:

1. The rows that still apply: run 1 the Demo Run rows 1 to 3 and 5 (as 0059); run 2 the M11 §8.3 rows 1 to 3, row 4's narration judge half, row 5 (`m11-memory`, which passes on the Mill card), and the M12 rows `m12-order` and `m12-language` (AGT-103).
2. **Written** (run 1): at least two Mill deeds written by scenes, with `by`, day and contract, in the saved roster's world memory, one of them a Scene 3 outcome deed (In 4).
3. **Carried** (run 2): the Mill card for run 1's Scene 3 deed is drawn at Wendford and decided by the Blades, its choice writes its deed (the M13 row of In 5 counts it), the narration judge answers yes to "does the DM name what the party did at the mill", and finds no contradiction. The run report quotes the lines.
4. **Readable** (run 2): the Vera fallback reads the Mill card with its narration as the seat shows it, and Zoya's the same lines for the board; both quoted verbatim.

Checked by CI: a seeded Wendford draw on a Mill roster offers the matching Mill card and never the other; the validator across packs. Reported, not gated: p95; every deed written and read; `m12-own-move` on run 2.

## 5. Questions for the system design

1. **Contract (Rule 1):** `remember` as a scene `Consequence`; which other outcomes carry it (a fight's end, a surrender and which creature yielded, a death); fixture; CHANGELOG, after M12's last dev version.
2. **The reader:** an arrival card reading a deed from a pack with no campaign; whether exit row 3 may rely on the card being the only eligible one at Wendford, or the deck needs a rule for a card that must come (today only a choice's `add_card {soon: true}`; Lev's arrival without a draw is shelved in §3). Visibility (Rule 3): the deed stays DM only; the player sees the card.
3. **Who `by` is** on a deed no seat chose (a fight's end, a surrender, a death): the party's handles at the scene, or another rule.
4. **A pack with no world:** how a format 1 pack names its world and writes into the roster, with a contract number and day on every deed; a Mill roster continuing into a road contract (purse, XP); no roster format bump.
5. **Named people:** a world id for Gritch, so the death deed works and MAP-13 adds `gritch_spared` with no converter. Snitt gets none in M13 (§3).
6. **The validator across packs:** a deed one pack reads and another writes.
7. **Room for later:** optional `saw` and cause fields on the deed record, so gap E and an own-move cause (§8 4) later need no new roster format.

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

Target (0065, half the baseline): 17.73 USD, 33 min, 1 pair, 13.5 PRs, 1.06 days. Planned: 3 to 4 days, over target, and the code waits for M12's exit pair; 23.4 USD, 5.7 over (a Mill all-AI run costs two road runs); about 26 min plus about 10 of quotes; 1 pair; 8 PRs, 0.30 of the baseline. A failed run 1 costs a day, 15.5 USD and a fix review, no table time; a failed run 2 costs a day, 23.4 USD, a fix review and a second sitting (about 1 hour of Stas in all).

**M12 dependencies.** Under 0043 as amendment 1 reads it: no M13 code or content PR merges before M12's exit pair has passed on its build.

1. M12's exit build is M13's base. If M12 slips, M13's docs still merge (amendment 1); its code waits.
2. Contract: M13 takes the `dev.N` after M12's last (API-56).
3. AGT-104 builds on AGT-103's report and rows `m12-order`, `m12-language`. If AGT-103 slips, run 2 gates the M11 rows only.
4. A Russian run 2 rests on AGT-98 and MAP-19. If they slip, run 2 plays English without `m12-language`.
5. The Mill card shows after its narration only with AGT-100; if it slips, exit row 4 reads the card as the seat shows it.
6. `own_move_<card>` (API-56) is not used in M13 (§8 4).

## 8. Decided by Stas (2026-11-11 23:40Z)

Stas: «Все ок», «ок по всем»: every recommendation, and arrival without a draw out of M13 (§3).

1. **The exit pair:** (a) the Mill all AI, then *Fair in Wend* on its roster with Stas, about 23.4 USD. Not taken: (b) road only, *Fair in Wend* then *The Way Back*, 13.0 USD, on a link cards already carry; (c) (a) plus an all-AI *Fair in Wend* first, 31.3 USD.
2. **Errand quests, fronts and clocks:** (a) both out, to Arachas plus glue. Not taken: (b) errand in on quest Q1, 1 M; (c) both in, 2 M.
3. **Witnesses and the attitude step (gap E):** (a) out, to Arachas plus glue. Not taken: (b) the `saw` field now, XS (Zoya's lean); (c) both in, 1 M.
4. **Words in the own-move deed:** (a) a bare id, owed on Zoya's board. Not taken: (b) the words as a DM-only cause, XS after API-56 (the bible's lean).
5. **MAP-13:** (a) its own row, after carrier A, before Arachas. Not taken: (b) in M13, S.
6. **Who reads the Mill deed:** (b) a Wendford arrival card (In 2); a scene reader goes to Arachas plus glue (Lev's lean). Not taken: (a) carrier B in M13, API-57 to M, 9 PRs.

## 9. Amendments proposed

1. A later milestone's scope, design and rows PRs may merge while the earlier milestone builds; its code and content PRs merge only after the earlier exit pair has passed on its build. Why: 0043 speaks of builds only; followed here.
2. This scope uses 13, as Stas does; TASKS.md § Milestones gains row 13 with the rows PR, and the roadmap's unnumbered line takes the number then. Why: the roadmap numbers a milestone only once it has its row. The shop's "M17" (0057, living-world §4) stays as written.
3. Zoya's, for her bible (its own PR, §3): a deed carries a pay-off only if another outcome of the same scene or card writes a different deed; a deed every path writes is a marker, not a cause; a marker may gate prose (a greeting) but never counts as a carried pay-off. Why: Consequence 2 reads a deed back "as a cause the table hears"; a marker has no choice behind it.

## Sources

- Stas's campaign line and dramaturg design, 2026-11-07. Decisions 0043, 0057, 0059, 0065, 0066; 0069 (table #345).
- M11 and M12 designs; `verdict.ts` (`m11-thread`); `scene.rs` (`Consequence`); the Mill's scene files (flags only).
- nat20-runs: `full-2026-11-01T23-25-02-525Z`, 15.51 USD; pair 3 as in `docs/roadmap.md`.
