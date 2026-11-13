# Allies in fights («Свои в бою»): scope

Status: Proposed; §8 answered by Stas (§9), accepted on merge. Drafted by Yan Metsuyan (0065), 2026-11-12, main d2b0fc4. No number: TASKS.md § Milestones has no row for it yet (roadmap amendment 1). Ask: Stas 2026-11-12 20:44Z, «конечно в backlog рядом с B и C и туда же проверку судьи. В целом мы набрали на milestone контента. Ян оформи пожалуйста в milestone». No bid was tendered; priced here.
Inputs: decision 0076 (A first, B and C later; table #360), decision 0070 (children not exempt from harm; table #361), rows MON-12, ENG-48, ENG-49, AGT-106 (table #360) and MAP-23 (table #361), all open, none on main. 0076's Decision and Consequences lines in table #360 now name this milestone (B, C and AGT-106 gathered here); no new record.

## 1. Goal

When wolves hit the wagon at night, Gwyn's dog, the horses, Tam and the Merchant are in the fight, and a dead horse, a dead dog, a hurt boy or a dead Merchant is something the road remembers.

## 2. In

1. **B: the dog and the horses** (MON-12, ENG-48). Mastiff and Draft Horse into core (`demo`), the pin, then the party-side hold-by-the-wagon script in `adapter/`; a dead horse leaves its wagon's `team`; a dead dog is a deed that every card reading `fed_gwyns_dog` also reads (`gwyn_news`, `gwyn_cheese`, `night_wolves`, `drovers`, MAP-22's twin).
2. **Tam is a creature** (MAP-23; Stas 20:42Z «он NPC и должен быть существом в движке»). Commoner block (already at pin 3220a7f), same script as ENG-48; his death writes a deed that `bel_asks` and `tams_story` read through `unless`; his being hurt writes a deed the cards that meet him later can read (the design says how); `rufus_offer`'s note, which cannot read a deed, says "riding and alive".
3. **The judge check** (AGT-106). A creature that attacks, is attacked or is hurt in fight narration but is not in the fight is a flag; the digest gains the fight's participants.
4. **C: the Merchant is a creature and can die** (ENG-49; Stas 21:22Z «А что не торговецы Одда и Флит … тоже могут быть покусаны волками почему нет»): Odda on *Fair in Wend*, Fenn on *The Way Back*, from the Commoner block, under the same script. Stas's view of the outcome, for Lev's design to settle (Stas: «Тут Лев босс»): the Hired Blades take the cargo on to the destination, and there they deal with the mayor or another official over what becomes of it. Priced by the design, not here.

Allies are run by the engine's script, never by the DM agent or a player (0076). The seven cards that start a fight (`night_wolves`, `millbeck_bridge`, `rufus_due`, `oddas_mark`, `goblin_scouts`, `goblin_ambush`, `men_at_the_iron`) are the whole surface; the design says which ally joins which.

## 3. Out

- **A** (ENG-47 surprise, MAP-22 note and dog twin): its own PRs after M12 («Делаем А после M12»); where exactly is question 1. ENG-48 then rewrites MAP-22's "none is in the fight" line.
- Allies in the Mill's scene fights and in any fight not started by a card. Wenna stays out of reach: not a creature in the engine (0070).
- A rule about who may be hurt. Torture stays never shown (0070); nothing else is banned.
- Allies that hold a fight open, take XP or take orders.

## 4. Exit criterion

1. **The proof of the mechanism, CI seeds without models:** one seeded case per fight card where an ally can be present (the design names which of the seven, §5 5), each with every ally that card allows, over a fixed seed set; the seed set includes, for each ally, at least one seed where it dies and one where it is only hurt; every death and hurt counted, its deed written, and each card that reads it offers the changed line. If C joins, a seeded Merchant-death case too, with the wagon's `team`, the Blades' pay and the ledger trial balance checked.
2. **The live run proves only that nothing else broke:** one all-AI *Fair in Wend* on the exit build passes the audit, the leak scan and the narration judge with AGT-106 (question 3 decides whether its flag counts on row 3). It can pass with no ally in any fight it draws, and no run setting forces a draw or a choice.
3. Stas's half only if question 6 says so, and only after the AI run has passed (0065).

## 5. Questions for the system design (Lev, 0069)

1. Rule 1: does an ally on side `party` under a script cross the wire (`place_creature`, MON-11), or stay inside `adapter/`? Does "allies never hold a fight open" change the fight lifecycle in `contract/protocol.md`?
2. Rule 3: the views of an ally's HP and AC (the dog's, a horse's, Tam's): DM only, or the party's?
3. Rule 4 and Rule 5: the hold-by-the-wagon policy beside `scripted_action` in `adapter/game.rs`, no rule repeated in `nat20-world`.
4. Deed ids (snake_case, ENG-33) for a dead dog, a dead horse, Tam hurt, Tam dead; which outlive the contract (ENG-37); the dog going home (MAP-22).
5. Which of the seven fights each ally joins; where Tam stands when he follows at a distance (`tam_followed`; MAP-23 puts him in the fight).
6. `caravan.rs`: a wagon with fewer horses, or none (both dead: can the contract finish?), and every card that narrates the horses (the design lists them; `lame_horse`, `rutted_road`, `washed_out`, `night_wolves` among them); `escort.rs` and the ledger trial balance when the Merchant dies (C, after §8 question 4).
7. AGT-106: the participants in both digests (`game/src/check/digest.ts`, `crates/nat20-duel/src/digest.rs`), the flag's kind, the scripted CI judge case.

## 6. Rows

Already drafted, open in table #360 and #361; status set when this scope and the design merge: MON-12 (S), ENG-48 (M), MAP-23 (M), AGT-106 (S), ENG-49 (L, after §8 question 4). A run-record row for the exit (AGT, S), after spec and design merge.

Reads: Zoya's board check on every deck change (every card that reads the dog's deeds, MAP-23's cards and its DM lines, ENG-49); a Vera read on each changed card line and on one fight narration sample at the exit where an ally is hurt; Lev `design` (required, 0069), `trace` on the exit run (recommended).

## 7. Cost

C (ENG-49) is in (Stas, §9) but priced by the design; nothing below includes it yet.

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

Answered in §9.

1. **A**: its own PRs right after the M12 exit pair (recommended: 2 PRs, about 30 min, 0 USD, and it fixes the narrated-dog bug a milestone earlier), inside the Dramaturg mechanism (table #348), or in this milestone (0 PRs saved; the bug stays live longer)?
2. **Slot**: after the Dramaturg mechanism (table #348), before Arachas (recommended: #348's §8 is answered and it is 8 PRs; putting this first delays it by this milestone's 5 code PRs, the core PR and its pin among them), or right after M12?
3. **AGT-106**: counted, reported and ruled by you without failing the run (recommended, Lev and Claude agree: a new check that gates on its first outing risks a failed run, a day and 7.85 USD), or gated? Until you answer, the M7 rule holds: a confirmed flag fails a run.
4. **C**: the story question (who pays the Hired Blades, whose cargo, what `done` means when the Merchant dies) goes to Zoya and you before any code. Recommended: C is in only if answered before the design merges; else it waits in the backlog and this milestone closes without it.
5. **The Tam gap.** table #361 removes "harm to a child is never shown" (Stas: «убираем правило «никакого вреда детям в кадре»») and you rejected a stub note on Tam, so from #361's merge until MAP-23 lands the DM can narrate Tam hurt or killed with nothing in the engine, and `tams_story` still greets him alive at the fair: a continuity break no check catches (Tam is in no engine state to contradict, and AGT-106 is in this milestone). Options: (a) accept the window; (b) hold #361 whole until MAP-23; (c) merge #361's bible half (Zoya's references) now and move its two DM-facing lines (the `voice` skill line, the `boy_on_tailboard` note) into MAP-23's PR. Recommended: c, 0 PRs added. It needs 0070's first Consequences bullet changed in #361 before merge, to say the two DM lines land with MAP-23. Why not b: with the recommended slot (question 2) MAP-23 lands after M13 at the earliest, so #361 held whole sits open past the 14-day dead-stock line; if you pick "right after M12", b becomes cheap too.
6. **Exit**: CI seeds plus one all-AI run (7.85 USD, 0 min of you), or a full pair with you as a Hired Blade (13.02 USD, pair 3; 26.5 min more)? The seat does change: Gwyn's and Tam's card lines, your vote on them first (0062), and a child's death can reach your screen. Recommended: the AI run alone. Vera reads every changed card line before it merges, and your half can miss the allies as the AI run can (§4 2), so 5.17 USD and 26.5 min buy a look at your own seat, not proof. Take the pair if you want to see a child hurt at your seat before friends and family do (0070's revisit).

## 9. Decided by Stas (2026-11-12 21:22Z)

1. A: no change asked; it stays its own PRs right after the M12 exit pair. Stas added that the Merchant, too, can be bitten: C joins (§2 item 4).
2. Slot: after the Dramaturg mechanism, before Arachas («Да давай»).
3. AGT-106 counts, does not gate, for now («Сейчас да»).
4. C's outcome: Zoya first drafts options («А давай сначала мы Зоуи попросим накидать нам вариантов а потом отдадим их Льву», 21:23Z), with Stas's view in §2 item 4 as one of the inputs; then Lev's design decides.
5. The Tam gap: table #361 merged whole (06063d0), so the window from there until MAP-23 is accepted; AGT-106 and the narration judge are what watch it.
6. Exit: CI seeds plus one all-AI run («Ок»).

## 10. Proposed: clickable names (Stas 2026-11-13, awaiting review)

Status: Proposed, not accepted on this PR's merge until Stas answers below; no rows in TASKS.md until this section and Lev's design (`lev-clickable-names.md`, to be committed into this milestone's design PR) both merge. Re-priced on main f98dd86 against Lev's design revised to the 20:00Z answers.

**Goal.** The name of anyone the DM or a card has named is underlined in the story; a mouse click, `/кто <name>` (`/who` still works) or Tab opens a card on the right with what the player's character has seen or heard of them, a rumour marked as heard, never their numbers (Rule 3); every named person who is present, speaks or acts is a record in the world's roster, and the judge counts one who is not.

| Id | Row | Pri | Dest | Size | Deps |
| --- | --- | --- | --- | --- | --- |
| API-58 | Roster `names`, `look`, `heard`, `remembers`, `monster`, optional `place`/`anchor`; card `cast` and `tells`; DM command `mention{npcs}`, event `npc_named`, a mention places the person if with the party (Lev rule 4); `NpcKnown`/`NpcDm`/`WorldPlayer` fields, `place` optional (the one breaking line); protocol §5; fixture with a mention then a fight, CHANGELOG, server | P2 | Ours | L | none; lands before MAP-23 and ENG-49, which then place Tam and the Merchants by roster id; ENG-48 none |
| API-59 | Seen-or-heard record: `seen`, `heard` per character on the person's world record, `saw` on a deed (cast of the writing card, then of any shown card that reads it); old rosters load (`met` = seen by the party); per-viewer projection and `remembers` (Lev rule 6); visibility-scan case: no player view holds a deed id, `by`, day or contract | P2 | Ours | M | API-58; decision 0077 merged first (Proposed, Stas's question 2 in Lev's page) |
| MAP-24 | 14 people and 4 companions into `worlds/wend/npcs.json`: every Russian form, Zoya's `look` and `heard`, her first `remembers` lines; `cast` and `tells` on 44 cards; `glossary_ru` holds no person, no animal in the roster; `pack check` rules 1 to 3 | P2 | Ours | L | API-58; `remembers` lines after API-59; Zoya's board, Vera reads `look`, `heard`, `remembers` |
| AGT-107 | TUI: both matchers (listed forms only), underline in `Style`, the card in `cardRows`' slot (overlay when narrow), `/кто` and `/who`, Tab and Shift+Tab, the three lists, the unknown-name line | P2 | Ours | M | API-59, MAP-24; Vera reads Lev §4 lines |
| AGT-108 | TUI mouse, on by default: press reporting in the alternate screen, off on every exit, hit test in `frame.ts`, wheel scroll, the one-time drag hint, `/мышь` (`/mouse`) off and on; its own PR so it reverts alone | P2 | Ours | S | AGT-107 |
| AGT-109 | Judge kind `unknown_person`: `people` and where the engine has each in both digests, DM prompt line, scripted CI case; counted, not gated (as §9 3) | P2 | Ours | S | API-58; stacked on AGT-106 |

**Exit delta.** §4 1 gains: `pack check` rules 1 to 3 green, the visibility scan with API-59's case, a seeded case where `fed_gwyns_dog` is written with Gwyn absent and her card shows «Помнит» only after `gwyn_news` is shown, a unit case per card state (here, elsewhere, companion, heard of, unconscious, dead), and the mention-then-fight fixture. §4 2 gains: the all-AI run's report counts `unknown_person` flags, Stas rules each; no run added. New: Stas at his Mac in macOS Terminal, about 10 min, on the exit build after the AI run passed: click a name, select with Option, the slash on a Russian layout, Ctrl+C twice, mouse off after exit (unverified; no cloud thread can check it).

**Cost delta**, units of §7:

| Field | §10 adds | Milestone total with §10 (C still not priced) |
| --- | --- | --- |
| Size | 2 L, 2 M, 2 S | 2 L, 4 M, 5 S (ENG-49 L not counted) |
| PRs for Stas | 6 (design folds into the milestone's design PR, 0077 into table #365: 0) | 17 |
| Stas's review | about 2.8 h: 35 min API-58, 25 min API-59, 35 min MAP-24, 25 min AGT-107, 15 min AGT-108, 10 min AGT-109, 15 min design §10, 10 min 0077 (estimates) | about 5.4 h |
| Exit runs USD | 0 runs added; the judge's larger digest and the longer DM prompt are measured on the run's `usage.jsonl`, not estimated | 7.85 USD |
| Stas at the Mac | about 10 min | about 10 min |
| Days scope→exit | 3 to 4: API-58, then API-59 beside MAP-24's forms and `cast`, then MAP-24's `remembers`, AGT-107, AGT-108 | 6 to 9 |

Against 0065's target (13.5 PRs, 1.06 days): 17 PRs (0.63 of baseline) is 3.5 over; days 6 to 9 against 1.06. The two L rows are the most likely to need a second review round: about 30 min more each if they do.

**One milestone (Stas 2026-11-13 19:54Z «Свои в бою одна веха»).** Yan had recommended a split (API-58 here, the rest as its own milestone); Stas keeps all six rows here (API-59 added after 20:00Z): 17 PRs, 6 to 9 days. API-58 still goes first, because MAP-23 and ENG-49 key on roster ids.

**Vera** (the `vera` agent, on Lev's Russian strings only; verbatim in `/mnt/project-files/engine/allies-in-fights/vera-clickable-names.md`): she understood the card and used it unprompted («нажала бы на Торву ещё раз после боя»). She became a passenger at the help line «держите Option или Fn; /mouse отключает щелчки» and would never touch `/mouse`, Shift+Tab or Option. She also asked: how bad «Есть раны.» is («Мне её лечить или можно идти дальше?»); what «· здесь» means next to «· с вами»; whether `/who` needs the English layout; and whether «Вы пока не встречали никого по имени «Гаррик»» means she typed it wrong. The design PR answers each before AGT-107; the mouse help line moves out of the default help and into AGT-108.

**Vera, second read** (same file, revised strings after Stas's 20:00Z answers): no longer a passenger («Пассажиром я не стала»). Still asked: «вы» against «ваш отряд» on the «Помнит» lines; «рядом с вами» against «идёт с вашим отрядом»; whose «записи» the unknown-name line means («звучит так, будто я сама неправильно написала имя»); the Tab help line, read twice; «Мышь в игре выключена» scared her for a moment; «Тяжёлые раны» with no hint what to do. Zoya's board and the wording fixes come in the design PR.

Questions for Stas: 1. Split: answered, one milestone. 2. Lev's seven questions: answered below.

**Decided by Stas, 2026-11-13 20:00Z** («Ок по всем кроме»): Lev's Merchant-death questions (the gate is a changed line; Gwyn pays at the Highsteads; a ledger account outlives its owner; one `if` card per choice deed) as recommended. Clickable names:

1. A roster record becomes an engine creature as soon as the DM names it in narration, not only when a scene or fight places it.
2. A companion's card shows only what the human's character sees and knows of them, never their sheet. Rule 3 unchanged.
3. Someone only heard of is clickable too, and the card shows only what the human's character heard, marked as heard («говорят…»), never as fact.
4. Shift+Tab always walks names; Tab when free.
5. Mouse on by default; `/mouse` turns it off.
6. "Remembers: you fed her dog" is in this milestone, not later.
7. A kind is not a name (a wolf, the dog): «не может сдаться не персонаж».

**What the answers change** (Lev revised his design to these answers; re-priced above on main f98dd86, API-59 added):
- Every card is one view, "what your character knows", built in `projection.rs` from facts the character saw or was told; none carries HP, AC, a DC, a roll target, a coin count or any other number (Rule 3), the health words included («Есть раны.», not hit points).
- Answer 1 moves the creature from placement to the DM's first mention, so API-58 grows: a mention makes the creature, and the judge's `unknown_person` then means a name that matches no roster record.
- Answers 3 and 6 need a per-character record of what was witnessed or heard (a new row, size M or more). A heard line is a rumour and never fact (bible); answer 3 does not write a world fact from the DM's words, so 0071 holds.
- Answer 6 shows a player a deed the person witnessed. Deeds are DM-only since 0063, so this needs its own decision record, drafted in the design PR, superseding 0063 for witnessed deeds on a card only.
