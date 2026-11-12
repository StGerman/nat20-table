# Allies in fights («Свои в бою»): scope

Status: Proposed, for Stas's review. Drafted by Yan Metsuyan (0065), 2026-11-12, main d2b0fc4. No number: TASKS.md § Milestones has no row for it yet (roadmap amendment 1). Ask: Stas 2026-11-12 20:44Z, «конечно в backlog рядом с B и C и туда же проверку судьи. В целом мы набрали на milestone контента. Ян оформи пожалуйста в milestone». No bid was tendered; priced here.
Inputs: decision 0071 (A first, B and C later; table #360), decision 0070 (children not exempt from harm; table #361), rows MON-12, ENG-48, ENG-49, AGT-106 (table #360) and MAP-23 (table #361), all open, none on main. If Stas accepts this scope, 0071's Decision and Consequences lines (B, C and AGT-106 "in the backlog") are updated in table #360 before it merges; no new record.

## 1. Goal

When wolves hit the wagon at night, Gwyn's dog, the horses and Tam are in the fight, and a dead horse, a dead dog or a hurt boy is something the road remembers.

## 2. In

1. **B: the dog and the horses** (MON-12, ENG-48). Mastiff and Draft Horse into core (`demo`), the pin, then the party-side hold-by-the-wagon script in `adapter/`; a dead horse leaves its wagon's `team`; a dead dog is a deed that `gwyn_news` and `gwyn_cheese` read.
2. **Tam is a creature** (MAP-23; Stas 20:42Z «он NPC и должен быть существом в движке»). Commoner block (already at pin 3220a7f), same script as ENG-48; his harm or death writes a deed that `bel_asks`, `tams_story` and Rufus's note read through `unless`.
3. **The judge check** (AGT-106). A creature that attacks, is attacked or is hurt in fight narration but is not in the fight is a flag; the digest gains the fight's participants.
4. **C: the Merchant can die** (ENG-49), only if §8 question 4 is answered before the system design merges; else it stays in the backlog alone. Not priced until that answer (its row) and not in §7's totals.

Allies are run by the engine's script, never by the DM agent or a player (0071). The seven cards that start a fight (`night_wolves`, `millbeck_bridge`, `rufus_due`, `oddas_mark`, `goblin_scouts`, `goblin_ambush`, `men_at_the_iron`) are the whole surface; the design says which ally joins which.

## 3. Out

- **A** (ENG-47 surprise, MAP-22 note and dog twin): its own PRs right after the M12 exit pair, as decided («Делаем А после M12»); question 1. ENG-48 then rewrites MAP-22's "none is in the fight" line.
- Allies in the Mill's scene fights and in any fight not started by a card. Wenna stays out of reach: not a creature in the engine (0070).
- A rule about who may be hurt. Torture stays never shown (0070); nothing else is banned.
- Allies that hold a fight open, take XP or take orders.

## 4. Exit criterion

1. **The proof of the mechanism, CI seeds without models:** one seeded case per fight card where an ally can be present (the design names which of the seven, §5 5), each with every ally that card allows, over a fixed seed set; every death counted, its deed written, and each card that reads it offers the changed line. If C joins, a seeded Merchant-death case too, with the wagon's `team`, the Blades' pay and the ledger trial balance checked.
2. **The live run proves only that nothing else broke:** one all-AI *Fair in Wend* on the exit build passes the audit, the leak scan and the narration judge with AGT-106 (question 3 decides whether its flag counts on row 3). It can pass with no ally in any fight (the dog not fed, Tam sent home, `night_wolves` not drawn; `men_at_the_iron` is *The Way Back* only), and no run setting forces a draw or a choice.
3. Stas's half only if question 6 says so, and only after the AI run has passed (0065).

## 5. Questions for the system design (Lev, 0069)

1. Rule 1: does an ally on side `party` under a script cross the wire (`place_creature`, MON-11), or stay inside `adapter/`? Does "allies never hold a fight open" change the fight lifecycle in `contract/protocol.md`?
2. Rule 3: the views of an ally's HP and AC (the dog's, a horse's, Tam's): DM only, or the party's?
3. Rule 4 and Rule 5: the hold-by-the-wagon policy beside `scripted_action` in `adapter/game.rs`, no rule repeated in `nat20-world`.
4. Deed ids (snake_case, ENG-33) for a dead dog, a dead horse, Tam hurt, Tam dead; which outlive the contract (ENG-37); the dog going home (MAP-22).
5. Which of the seven fights each ally joins; where Tam stands when he follows at a distance (`tam_followed`; MAP-23 puts him in the fight).
6. `caravan.rs`: a wagon with fewer horses; `escort.rs` and the ledger trial balance when the Merchant dies (C, after §8 question 4).
7. AGT-106: the participants in both digests (`game/src/check/digest.ts`, `crates/nat20-duel/src/digest.rs`), the flag's kind, the scripted CI judge case.

## 6. Rows

Already drafted, open in table #360 and #361; status set when this scope and the design merge: MON-12 (S), ENG-48 (M), MAP-23 (M), AGT-106 (S), ENG-49 (L, after §8 question 4). A run-record row for the exit (AGT, S), after spec and design merge.

Reads: Zoya's board check on every deck change (ENG-48's Gwyn cards, MAP-23's three cards, ENG-49); a Vera read on each changed card line and on one fight narration sample at the exit where an ally is hurt; Lev `design` (required, 0069), `trace` on the exit run (recommended).

## 7. Cost

C (ENG-49) is not priced; nothing below includes it.

| Field | Plan | M11 baseline |
| --- | --- | --- |
| Size | 2 S, 2 M, 1 S run row | 19 rows |
| PRs for Stas (roadmap amendment 2: every PR carrying the rows) | 11: table #360, #361, this scope (table #365), design, MON-12 core, pin, ENG-48, MAP-23, AGT-106, the run-record row, the TASKS.md status PR | 27 |
| Stas's review | about 2.6 h: 45 min B and 15 min AGT-106 (rows); about 20 min MAP-23, 15 min the run record, 10 min the status PR, 30 min scope and design, 20 min #360 and #361 (estimates) | not measured |
| In-game cost per fight | 0 model calls; up to 4 more scripted turns per round; longer narration, measured on the run's `usage.jsonl` | n/a |
| Exit runs | CI seeds, 0 USD; 1 all-AI run, about 7.85 USD (pair 3's all-AI half) | 5 runs, 35.45 USD |
| Stas at the table | 0 min (26.5 min and 5.17 USD more if question 6 says pair) | 65.6 min |
| Days scope→exit | about 3 to 5: a core PR, then its pin, then ENG-48 and MAP-23 in sequence; M12's review wait was 2.80 of its 2.98 days | 2.12 |

Target (0065, half the baseline): 13.5 PRs, 17.73 USD, 33 min, 1.06 days. Planned: 11 PRs (0.41), 7.85 USD (0.22), 0 min; days 3 to 5, over the target by 2 to 4. A failed all-AI run costs a day, a fix review and 7.85 USD, no table time.

## 8. Questions for Stas

1. **A**: stays its own PRs right after the M12 exit pair, as you decided (recommended: 2 PRs, about 30 min, 0 USD, and it fixes the narrated-dog bug a milestone earlier), or joins this milestone (0 PRs saved; the bug stays live longer)?
2. **Slot**: after the Dramaturg mechanism (table #348), before Arachas (recommended: #348's §8 is answered and it is 8 PRs; putting this first delays it by this milestone's 5 code PRs, the core PR and its pin among them), or right after M12?
3. **AGT-106**: counted, reported and ruled by you without failing the run (recommended, Lev and Claude agree: a new check that gates on its first outing risks a failed run, a day and 7.85 USD), or gated? Until you answer, the M7 rule holds: a confirmed flag fails a run.
4. **C**: the story question (who pays the Hired Blades, whose cargo, what `done` means when the Merchant dies) goes to Zoya and you before any code. Recommended: C is in only if answered before the design merges; else it waits in the backlog and this milestone closes without it.
5. **The Tam gap.** table #361 removes «никакого вреда детям в кадре» and you rejected a stub note on Tam, so from #361's merge until MAP-23 lands the DM can narrate Tam hurt or killed with nothing in the engine: acceptance 3 breaks, and `tams_story` still greets him alive at the fair. The judge cannot catch it today: Tam is in no state to contradict, and AGT-106 is in this milestone. Options: (a) accept the window; (b) hold #361 whole until MAP-23; (c) merge #361's bible half (Zoya's references) now and move its two DM-facing lines (the `voice` skill line, the `boy_on_tailboard` note) into MAP-23's PR. Recommended: c, 0 PRs added. It needs 0070's first Consequences bullet changed in #361 before merge, to say the two DM lines land with MAP-23. Why not b: with the recommended slot (question 2) MAP-23 lands after M13 at the earliest, so #361 held whole sits open past the 14-day dead-stock line; if you pick "right after M12", b becomes cheap too.
6. **Exit**: CI seeds plus one all-AI run (7.85 USD, 0 min of you), or a full pair with you as a Hired Blade (13.02 USD, pair 3; 26.5 min more)? The seat does change: Gwyn's and Tam's card lines, your vote on them first (0062), and a child's death can reach your screen. Recommended: the AI run alone. Vera reads every changed card line before it merges, and your half can miss the allies as the AI run can (§4 2), so 5.17 USD and 26.5 min buy a look at your own seat, not proof. Take the pair if you want to see a child hurt at your seat before friends and family do (0070's revisit).
