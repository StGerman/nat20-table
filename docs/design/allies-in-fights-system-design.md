# Allies in fights («Свои в бою»): system design

Status: Proposed. Lev Neiman, 2026-11-15, main 4d865d9. Scope: `docs/scope/allies-in-fights-scope.md`, §1 to §9 (allies) and §10 (names you can click), every question there answered by Stas; this design re-opens none of them. It answers the seven questions of scope §5 by number (§3) and folds in two drafts from the project files, `lev-merchant-death.md` and `lev-clickable-names.md`; this file is the record, they are not. Decisions 0070, 0076, 0063, 0067, 0071, 0086 (the Merchant's death, drafted with this design), and 0077 (Proposed; Stas, 2026-11-13 20:25Z: "0077 as drafted"). Rows are named by id only, so the text holds whether `TASKS.md` stays one file or becomes one file a task (table #409). Author's read: no verdict on itself. Zoya's board and Vera's read are in §17; a mark such as [Z5] shows where finding 5 of her board is folded.

## 1. Summary

When a fight comes to the wagon, whoever rides with it is in it: the horses, Gwyn's dog, Tam, the Merchant. The engine moves them, and a death or a wound is a record that a later card reads. The name of anyone the story has named is underlined, and opening it shows what your character has seen or heard of that person, what they remember of your company included. If the Merchant dies, the Blades decide at once what her purse and their word are worth.

The retelling: "We fed Gwyn's dog and it came with us. The wolves got it at night. A contract later, up at the Highsteads, we told Gwyn. I clicked on her name, and it said she remembers the dog went with us and did not come back."

The question each half puts to the player. Allies: who do you stand in front of? Names: what does this person know about you? The Merchant's death: your employer is dead and nobody is counting, so what is your word worth?

Said early, once each:

- One milestone carries two new systems (allies, the person card), by Stas's decision. Cost: the allies' proof waits behind seven more PRs. The two pay each other: the person card is the first reader of every death this milestone writes.
- A dead horse costs the party nothing on the road as scoped: each pack's wagon carries 940 lb, and one horse moves 2,300 lb at the same pace. Decision 0076 took option B on "a dead horse slows the wagon"; no SRD rule does that (§16 item 2).

## 2. Records

| Record | Who writes | When | Who reads | Where the player sees it |
| --- | --- | --- | --- | --- |
| Who is with the wagon. Not stored: worked out from the wagons' `team`, the caravan's NPC owner, and `worlds/<id>/company.json` (an entry: `id`, `monster` or roster `npc`, `if`, `unless`, `at`, `hurt`) | author; the engine works it out | at the start of a fight whose effect says `wagon: true` | the card-fight path | the ally in the fight, by name, with health words |
| `team` (exists): a dead animal leaves it | engine | at the death | travel limit, `world.caravan`, rule A2 | the caravan panel; the fight |
| `<owner>_lost_a_horse` | engine | at the death | the Merchant's `remembers` line; one `if` choice on `meadow_track` (Odda) or `salt_on_credit` (Fenn) [Z13] | the Merchant's card; the changed choice |
| `<id>_dead` for a company entry (`gwyns_dog_dead`, `tam_dead`) and for the owner (`odda_vell_dead`, `fenn_lusk_dead`) | engine | at the death | cards through `if` and `unless`; `remembers` lines; the death card (owner) | the changed card; the person's card |
| `<id>_hurt`, only for an entry with `hurt: true` (Tam) | engine | at `combat_over`, alive and below full Hit Points | one `if` choice on `bel_asks` [Z12]; `remembers` lines | the changed choice; Bel's card |
| Roster `alive`, `hp` (exist) for a person who fought | engine | at the death; at `combat_over` | rule A8, the person card, the judge's digest | «Нет в живых.»; the card is not drawn |
| The Merchant's death choice: two deeds per Merchant (ids in M5) | the death card's `remember` | when the Blades decide it | the pay line at the destination; the readers named in M5 | who pays; how the next hirer meets them |
| The purse: stays `purse_cp` on account `npc:<id>` | "take": one `loot` entry per living Blade, purse to 0 | at the choice | `arrive` (unchanged) | public ledger lines; the arrival line |
| Roster entry: `names`, `look`, `heard`, `remembers`, `monster`; `place`, `anchor` optional | author; Zoya's text | n/a | matcher, person card, judge | underline; the card |
| Card `cast` (who is there; a roster id, or `owner`) and `tells` (who is only named or spoken of, `owner` included [Z2]) | author | n/a | engine when the card is shown; rule A8; `pack check` | the name becomes clickable |
| `seen`, `heard`: character handles on a person's world record | engine: `seen` on a shared scene or a `cast` card; `heard` on a `tells` card or a DM line that names them (the loop matches the line and sends `mention`) | as it happens | `projection.rs`, per viewer | «В последний раз вы виделись…» or «Вы только слышали это имя.» |
| `saw` on a deed (the room M13 design §3 item 7 left) | engine: the `cast` of the card that writes it, or the roster people in the scene for a fight's deed; then the `cast` of a shown card with it in the card-level `if`, or of a card on which a choice with it in `if` is chosen [Z14] | as it happens | the person card | «Помнит: …» |
| Reworded card lines beside their authored source (transcript only) | the describer (§6.3) | when a viewer's lines for a person change | the card, the judge, `trace` | the card's wording |

Not kept: an animal's Hit Points between fights (each starts unhurt; no reader); whose the cargo is after the Merchant dies (dropped with the contract, as today); the ally mark on a creature (the adapter's, gone with the scene).

## 3. The scope's questions, by number (scope §5)

1. **The wire.** An ally does not cross it: the server's card-fight path places it, as it places a card's monsters today. No command, type or event. The fight lifecycle's meaning does change (rule A5), so `contract/protocol.md` §4.4 and a fixture change under Rule 1 (§7).
2. **Views.** An ally's Hit Points, Armor Class and stat block are the DM's. A player sees it as any other creature, `CreatureObserved`: health band and visible conditions. No new field.
3. **The policy.** Rule A4, in `adapter/game.rs` beside `scripted_action`, attacking through the same path. Nothing in `nat20-world` repeats a rule.
4. **Deed ids.** §2. All are world memory and outlive the contract; "rides now" is decided by the contract number the deed already carries (rule A2), not by a new deed. The dog going home is MAP-22's deed, listed in the dog's `unless`.
5. **Which fights.** Four of the seven are at the wagon: `night_wolves` (all three fight effects), `goblin_ambush`, `millbeck_bridge` (without the owner [Z4]), `men_at_the_iron`. Three are away from it and take no ally: `goblin_scouts` (the Blades go up the ridge), `rufus_due` and `oddas_mark` (at the fair gate, on foot). Tam who follows at a distance (`tam_followed`) stands at `behind`; Tam who rides stands at the wagon.
6. **The team and the escort.** A dead horse leaves `team`; the last animal of a wagon is never placed in a fight, so a wagon always moves (§16 item 3). Ten cards mention horses, eight in player text (`night_wolves`, `lame_horse`, `rutted_road`, `washed_out`, `barrow_lights`, `yellow_wagon`, `rufus_offer`, `salt_on_credit`): each is reworded so it is true with one horse. The escort and the ledger: §5.
7. **AGT-106.** Both digests gain the running fight's participants, from `combat_started`. Flag kind `not_in_fight`, kept off row 3 by `verdict.ts`. The scripted case: a narration where the dog bites and the fight holds no dog.

## 4. Allies

### 4.1 Rules (each a test could check)

- **A1.** Only a `fight` effect with `wagon: true` makes an ally. No command, tool or agent places, moves or aims one (0076, Rule 4).
- **A2.** Who joins: each living animal of each wagon's `team` but the wagon's last; each `company.json` entry that is alive, whose `if` deed was written in the contract under way and none of whose `unless` deeds is remembered; the NPC owner if alive, unless the effect says `owner: false` [Z4].
- **A3.** Allies stand at the scene's first anchor, or the entry's `at`. The fight's monsters arrive at the effect's `from`, by default the first anchor, as today. An anchor the scene lacks falls back to the first. Monsters choose their targets as today, allies among them.
- **A4.** `hold`: on its turn an ally never moves. If a hostile creature is within its reach it attacks the nearest (ties by handle) with its stat block's melee attack; otherwise it ends its turn. A creature that has yielded is never a target [Z5]. It reacts as any scripted creature does.
- **A5.** An ally never counts as a conscious party creature: a fight needs one Blade up to start, and is lost when the last Blade is down, whichever allies stand.
- **A6.** Allies take no XP and do not change a Blade's share. This holds today (XP goes to party creatures with character levels); a test pins it.
- **A7.** `by` on an ally's `_dead`, `_hurt` or `_lost_a_horse` deed is the Blades in the fight, in its order, downed ones included (M13 design §3 question 3). These say who stood in the fight, not who struck. `killed_<npc>` keeps M13's death rule unchanged, with no M13 test touched: `by` is whoever dealt the last blow, an ally included, by its handle in the fight (a company entry's or roster person's `id`). No ally is a viewer, so rule N6 gives every Blade "your company" for it. ENG-48 adds the case to `allies.jsonl`.
- **A8.** A card whose `cast` holds a dead roster person is never offered or drawn. (Lands with `cast`; it also closes today's hole, a card that greets a place NPC the party killed.)
- **A9.** Every `_dead` and `_hurt` deed has a reader that speaks, a card or choice with it in `if`, not only readers that fall silent through `unless`. `pack check` fails otherwise. The owner's `_dead` deed is read by `escort.death_card`, which counts as one [Z9].
- **A10.** A roster person placed by a `mention` and the ally a fight takes are one creature, never two. Whichever of API-58 and ENG-48 merges second adds the test.

### 4.2 What the content owes (Zoya writes, Vera reads)

- `wagon: true` and `from` on the four cards of §3 item 5; `company.json` with the dog and Tam. `owner: false` on `millbeck_bridge` (Zoya: "she holds the horses on the bank"), and one note clause on `osric_hears`, `bridge_again`, `toll_man_stocks` and `gwyn_news`: if the `by` of a `killed_` deed names no Blade, an ally did it, not a Blade's hand [Z4].
- The dog: every choice gated on `fed_gwyns_dog` also reads `gwyns_dog_dead`. Where the dead-dog twin changes no player text, its card's note says why ("the dog is not at the fire, because the wolves got it on the meadows"). On `gwyn_news` and `gwyn_cheese` the note gains a third branch and the `if: gwyns_dog_dead` choice is «Сказать Гвин про её пса.»: the reader that speaks, and the moment Gwyn learns [Z10].
- Tam: `bel_asks` and `tams_story` as the scope says. The `if: tam_dead` reader is a Saltmouth arrival card with Bel in its `cast` and `tams_story`'s condition (a card more than the scope lists, §16 item 6); its note says `promised_bel`, `lied_to_bel` and `covered_for_tam` aloud as causes [Z11]. The `if: tam_hurt` choice is on `bel_asks`, with one note line on `tams_story` [Z12].
- The eight horse texts of §3 item 6; MAP-22's "none is in the fight" note line rewritten.

## 5. The Merchant dies (ENG-49)

Decided by Stas, 2026-11-13 20:00Z, as recommended. One card on the table the moment the fight ends; the wagon always goes on; the gate is a changed line, not a second card.

Zoya's four options, and why three were cut or trimmed, are decision 0086.

Two choices, the Blades vote, the human first (0062). **Bring it in:** wagon and purse go on, `word_kept` kept, pay as contracted on arrival. **Take the purse:** all of it now, split evenly among the living Blades (an odd copper goes by party order), `word_kept` broken, nothing more at the gate. On *Fair in Wend* with four Blades, on schedule, the purse holds 32 GP after the advance against 24 GP still to come on arrival: taking it pays more. The purse is the DM's (§4.17), so the card says it in one stake line with no number (§10) [Z6]; exit row 3's seeded case asserts the line is true when the card shows.

Rules:

- **M1.** A fight that ends with the caravan's NPC owner dead puts the card named by `escort.death_card` on the table before any travel, rest or pay. It is not drawn and takes no pile's place.
- **M2.** With the owner dead, a caravan card is decided as a Blade card (a tie goes to the human seat).
- **M3.** `escort_settled` fires once, at the destination only. A ledger account outlives its owner. Coin moves only from the purse to a Blade, as `loot` or `wage`, so the trial balance holds after each batch.
- **M4.** No seat line says a dead Merchant pays: the arrival line has a variant for a carried purse and one for an empty purse (§10).
- **M5.** Each choice deed has a card or a choice with it in `if` [Z8]. Ids: `brought_oddas_purse_in`, `took_oddas_purse`, `brought_fenns_purse_in`, `took_fenns_purse`. Odda's reader: one card on The Way Back's deck for the first night at Saltmouth, card-level `if: odda_vell_dead`, Brannock in its `cast` (Zoya: he hands the company to Fenn), one choice per deed. Fenn's: one choice per deed on `gwyn_news` and on `gwyn_cheese`, where Gwyn speaks the pay; no new card, so the arrival draw is not taken.

Content:

- Two death cards. Each note carries Zoya's DM-only clauses, with people already on the board: a companion speaks first (Bren, "pay is pay"); Tam, if he rides, is watching; Agna, if `agna_came_along`, climbs down without a word; Torva, if `robbed_cairn` or `left_the_cairn_stones`, asks what the dead were going to buy [Z7]. A note is not a reader a `trace` can count, so `left_the_cairn_stones` stays owed on the board.
- The eight cards whose player text names the Merchant. The owner goes in `tells` where only named, so A8 leaves the card on the table; the owner's own choice (`oddas_mark.odda`, `salt_on_credit.talk_fenn`) gets `unless: <owner>_dead`; where the dead owner's cargo becomes the question, the card gains Zoya's twin choice (`salt_on_credit`: salt off the wagon, which breaks `word_kept` after `brought_fenns_purse_in`). The owner stays in `cast` only on a card that is the owner's own act (`the_fair_gate`) [Z2].
- Left unread on purpose in a run where Odda dies: `told_odda_of_rufus`, `beat_rufus_to_the_fair`, `rufus_got_ahead`. Their only readers are `the_fair_gate` and Odda's lines in `twb_wendmouth`; Zoya strikes them, "the warning was hers to say, and she died with it". No check or `trace` counts them as orphans there [Z3].
- The notes of the sixteen cards that mention the Merchants; `twb_wendmouth` and the two destination prose files; both packs' `adventure.md`, which today say nothing in a fight can hurt the Merchant and have no line for a dead one [Z1].

## 6. Names you can click

### 6.1 Rules

- **N1.** A word is underlined only when it equals a listed form of someone in the viewer's own view.
- **N2.** `pack check` fails on: a form two people share; a card whose text holds a form of someone outside its `cast` and `tells`; a person in `glossary_ru`; an animal in the roster (a kind is not a name); a `remembers` line whose deed nothing writes. MAP-24 lists every case form in `names`: Гвин and Бел do not decline; Тэм, Фенн, Осрик and Одда do. Every person in The Way Back's `glossary_ru` moves to the roster [Z18].
- **N3.** No card field carries a digit: CI scans `look`, `heard`, `remembers` and the fixtures.
- **N4.** After a DM line holding a form of X, every party character has X in `seen` or `heard`, and X stands in the scene if X is with the party: lives here, owns or rides with the caravan, or is in the `cast` on the table. During a fight a mention places nobody.
- **N5.** A heard-of entry's type has no `look`, place, `alive` or `remembers`.
- **N6.** A `remembers` line reaches a viewer only when the person is in the deed's `saw` and the viewer has `seen` them; the "you" form if the viewer is in the deed's `by`, else "your company". At most three, newest first; none on a dead person's card [Z15]. No player view holds a deed id, `by`, day or contract (0077).
- **N7.** An older roster loads: `met` reads as seen by its whole party.
- **N8.** A card opens with no model call, and an open card never changes.

### 6.2 The card and the seat (AGT-107, AGT-108)

One view, "what your character knows", for every person: here, elsewhere, a companion, heard of; plus unconscious and dead. A companion's card is the same view (`look` beside `names` in `campaign.json`, health words, visible conditions), never a sheet. Health is the existing band in three sentences. «Нет в живых.» shows only after the death's line is in the story; from then the `/кто` lists name the person under «Нет в живых», not «Вы встречали» (Vera). `Style` gains `underline`; the card takes `cardRows`' slot until Esc, an overlay in a narrow frame. `/кто <имя>` (`/who` works), Tab when the input is empty, Shift+Tab always. Mouse on by default, in its own PR: press reporting in the alternate screen, off on every exit, `/мышь` (`/mouse`); the Option hint shows once, on the first drag, and is not in the first-time help.

### 6.3 The card in the hero's words (the describer)

Stas, 20:25Z and 20:38Z. Cost, once: Zoya's line reaches the player read by Vera; a reworded one reaches her unread.

A tool-less agent `describe:<handle>`, the shape of `game/src/agents/suggest.ts`, Haiku 5.5 at low effort, for the human's seat only. Input: the viewer's own entry from `projection.rs`, cut to `look`, `heard`, `remembers`, plus the character's pack card and the language. Output: one line per line given. It is written ahead, when the viewer's lines for a person change; 5 s, silent failure, the authored line until a checked one is ready; cached per viewer, person and line hash, for the run, never in the roster (0071, 0034). No contract change.

- **N9.** A reworded line is about the person described: no first-person word, no feeling, verdict, advice or plan of the viewer.
- **N10.** A reworded line shows only if it has no digit or number word (`guards.ts`), names no roster person or glossary place its source lacks and no other capitalised word inside a sentence, keeps the person's grammatical gender (Vera's third read), keeps «вы» or «ваш отряд», keeps a listed opener on `heard`, and is at most 1.5 times the source's length. Otherwise the authored line shows.

### 6.4 The judge (AGT-109)

`unknown_person`: someone named who is present, speaks or acts and matches no roster record; both digests gain `people` and where the engine has each. `invented_on_card`: on the transcript's authored-and-shown pairs, after the run. Both counted, not gated.

## 7. Contract

Goals: an ally comes only from the engine; no player view gains a number; a deed reaches a player only as 0077 allows; additive but for one line. Versions are the first free after M13's two (`1.0.0-dev.73` today). I propose; the implementing thread edits the crate.

| PR | Change | Additive? |
| --- | --- | --- |
| ENG-47 | none on the wire (the row says why) | n/a |
| ENG-48 | no type. `protocol.md` §4.4 (rule A5), §4.11 (a dead animal leaves `team`; the last is never placed), §4.13 (`wagon`, `from`, who joins, the deeds and their `by`). Deck effect fields and `company.json` are world-crate formats. Fixture `allies.jsonl` on the test world: an ally dies, one is hurt, the last Blade falls with an ally standing | yes |
| API-58 | DM only: command `mention{npcs}`, event `npc_named`, the roster fields on `NpcDm`. `NpcKnown` gains `names`, `look`; its `place` becomes optional. Card `cast`, `tells` (DM's card view only). Fixture: a mention, then a fight | yes, but `NpcKnown.place` optional: the one line `check-breaking` lists |
| API-59 | `DeedDm.saw`. `NpcKnown` gains `last_seen` (a place id) and `remembers` (authored English lines; the table finds the run-language line by person id and line, 0067). `WorldPlayer.heard`: entries of `id`, `name`, `names`, `heard`. Both lists per viewer. Visibility-scan case for N6 | yes |
| ENG-49 | no type. `campaign.json` `world.escort.death_card`; a deck effect that gives the purse to the Blades (reason `loot` exists). `protocol.md` §4.13 (a card put on the table by the engine; M2) and §4.17 (M1, M3). Fixture `merchant_death.jsonl`, both choices | yes |

## 8. Visibility (Rule 3)

No new player field holds a number; rule N3 scans the strings.

| Data | `dm` | Owner | Other player |
| --- | --- | --- | --- |
| An ally's Hit Points, Armor Class, stat block; `creature_placed` | yes | no owner | no; `health` band and visible conditions, as any creature |
| `company.json`, a fight's `wagon` and `from` (scenario data) | yes | no | no |
| `_dead`, `_hurt`, `_lost_a_horse` and the death-choice deeds | yes | no; only as a `remembers` line | as the owner |
| `world.escort.purse_cp` (exists) | yes | no | no; the `loot` entries are public, as today |
| `mention`, `npc_named`; roster `monster`, `attitude`, `hp`, `notes`, `anchor`, every `remembers` line; `saw`, `seen`, `heard`; a card's `cast`, `tells` | yes | no | no |
| `world.npcs[]`: `id`, `name`, `names`, `look`, `place`, `last_seen`, `alive`, `remembers` | n/a | people this character has seen; `remembers` by N6 | as the owner, each for their own character |
| `world.heard[]`: `id`, `name`, `names`, `heard` | n/a | people this character has only heard of | as the owner |
| The describer's text | never on the wire | the human's seat only | no |

## 9. Failure

| What fails | What the party gets |
| --- | --- |
| No ally is with the wagon, or the fight is away from it | today's fight |
| An ally dies | its deed, the changed cards, the person's card; no retry |
| The last Blade falls | the fight is lost, as today, whoever stands |
| The Merchant dies | the death card; her voice is gone from every later card |
| The purse is taken | the valley's word; nothing at the gate |
| The party never reaches the destination | nothing past the advance, as today |
| A form is not listed | plain text; `/кто` still opens the card |
| A name nobody has said | one line that blames nobody, then the lists |
| The describer times out or breaks N9 or N10 | the authored line, silently |
| The DM names someone outside the roster | narration goes on; `unknown_person` counts it |
| The DM does not tell an ally's death | the seat's own death line shows it; the deed is written either way |

## 10. Player-facing lines (for Vera, alone)

Working lines, Russian seat; Zoya's text replaces `look`, `heard`, `remembers` and the cards. They answer Vera's three earlier reads: "you" against "your company" is said as «вы сами» against «ваш отряд»; no line says «записи»; Tab has its own sentence; the mouse line no longer says the mouse is off. From her read of this section (§17): the card says Odda is dead, the dead have their own list, «всё ближе». The death card's choices and stake line are Zoya's [Z6], as is the night line's second half [Z13]; her «между собой» answers Vera's «с кем».

```
На заливных лугах воют волки, всё ближе, и у коновязи не стихает храп и стук копыт.

Одда Велл мертва. Она лежит у колеса собственного фургона. Кошель у неё под плащом, и считать его теперь некому, кроме вас.
Кошель тяжелее, чем вам осталось получить.
1. Довезти фургон и кошель до Солтмута.
2. Взять кошель сейчас и поделить между собой.
Что-то другое: скажите своими словами.

Обоз прибыл: Солтмут. Наёмникам отсчитали плату из кошеля, который вы довезли.
Обоз прибыл: Солтмут. Кошель вы уже взяли; платить больше нечем.

Гвин
Сейчас не рядом. В последний раз вы виделись в Хайстедсе.
Пастушка; держит отары на гребне.
Помнит: её пёс ушёл с вашим отрядом и не вернулся.
Esc закрывает

Осрик Хейл
Сейчас рядом с вами.
Староста Вендфорда.
Серьёзных ран не видно.
Помнит: вы сами оставили его в грязи.

Тэм
Сейчас рядом с вами.
Босой мальчишка с котомкой.
Тяжёлые раны, но ещё на ногах.

Руфус
Вы только слышали это имя.
Говорят, он скупает урожай на бумаге ещё до ярмарки.

Имя «Гаррик» в рассказе пока не звучало. Вот кого вы знаете.
С вами идут: Торва, Марен, Ильза.
Вы встречали: Гвин, Осрик, Тэм.
Нет в живых: Одда.
Только слышали: Руфус.

/кто  кто это: /кто Осрик. Без имени покажет всех, кого вы знаете. То же: /who
Tab  открыть карточку подчёркнутого имени; ещё раз Tab: следующее имя. Если вы уже набираете строку, нажимайте Shift+Tab.
Чтобы выделить текст, тяните мышью, держа Option. Имена по-прежнему открываются щелчком.
Щелчки по именам выключены: текст выделяется как обычно, имена открывает Tab или /кто. Включить снова: /мышь.
```

## 11. Exit rows, each with its lowest layer (decision 0080)

From scope §4, §10's exit delta and the rows' own checks; only row 12 is new (§16 item 5).

| # | Row | Lowest layer |
| --- | --- | --- |
| 1 | A seeded case per `wagon` fight, every ally the card allows, a fixed seed set with, for each ally, a seed where it dies and one where it is only hurt; each death and wound has its deed, and each card that reads it offers the changed line | test, no model |
| 2 | Rules A5 and A6 (`allies.jsonl`) | test, no model |
| 3 | The seeded Merchant death, both choices: the card before any travel, `team`, the Blades' pay, the trial balance, the purse over the pay still owed | test, no model |
| 4 | `pack check` rules N2 and A9 on the shipped packs | test, no model |
| 5 | The visibility scan with N3 and N6 | test, no model |
| 6 | `fed_gwyns_dog` written with Gwyn absent: her card shows «Помнит» only after the `dog` choice on `gwyn_news` is chosen [Z14] | test, no model |
| 7 | Rule N1; a unit case per card state (here, elsewhere, companion, heard of, unconscious, dead); the mention-then-fight fixture | test, no model |
| 8 | The describer's cache, timeout and fallback; a scripted judge case for each of the three kinds | test, no model |
| 9 | One all-AI *Fair in Wend* on the exit build passes the audit, the leak scan and the judge; `not_in_fight` and `unknown_person` counted, Stas rules each. It may draw no ally and forces none | a full run |
| 10 | Vera reads ten model-written cards beside their authored lines | a live run smaller than the exit run, then a person |
| 11 | Stas, about ten minutes at his Mac: click a name, select with Option, the slash on a Russian layout, Ctrl+C twice, mouse off after exit | a person |
| 12 | Vera reads one fight narration where Tam is the ally hurt, from `npm run play:card` on `night_wolves`, seeded and set up so [Z17] | a live run smaller than the exit run, then a person |

## 12. Out, and where it goes

- Allies in the Mill's fights and in any fight a card did not start; orders to allies; Wenna (scope §3).
- A wagon left behind when its team is dead (§16 item 3): the shelf.
- A pace rule for a short team (§16 item 2): after the first `trace`.
- The describer for AI seats; Russian names for the eleven old commands (Yan's row); an attitude step read from `saw` (Zoya's gap E, Arachas plus glue).
- Anything the DM says of a person beyond the roster's `heard` line (0071).
- The Merchants' heirs; a gate card at the destination.

## 13. PRs

In merge order. "M13" names the M13-owned file a PR also edits; such a PR opens only after the named M13 PR has merged, or stacks on it, and changes none of its lines. Sizes are my read of what each touches; rows, ids and prices are Yan's. The describer's scope id, AGT-112, is taken on main by a closed Milestone 12 row: Yan renumbers it.

| # | PR | Size | Lands | Needs | M13 |
| --- | --- | --- | --- | --- | --- |
| 1 | Design | S | this file; 0077's status | scope | no |
| 2 | Rows (Yan) | S | the rows, the tender, the milestone | 1 | no |
| 3 | ENG-47 | S | `surprise` on a card's fight | - | `session/cards.rs` (API-57) |
| 4 | MAP-22 | XS | the `night_wolves` note, the dog's twin, the going-home deed | 3 | no |
| 5 | MON-12, `core:` | S | Mastiff and Draft Horse on `demo` | - | no |
| 6 | The pin | XS | the core rev | 5 | no |
| 7 | API-58 | L | roster fields, `cast`, `tells`, `mention`, rule A8 | 2 | `envelope.rs`, `protocol.md`, CHANGELOG (ENG-44) |
| 8 | ENG-48 | L | §4.1 on the test world, animals and roster people; the death-rate table of §15 | 3, 6 | `session/cards.rs`, `session.rs`, `protocol.md` §4.13, the deed-writer test (API-57) |
| 9 | API-59 | M | `seen`, `heard`, `saw`, per-viewer lists, `remembers` | 7; 0077 accepted | `travel.rs` (ENG-44); scene deeds fill `saw` (API-57) |
| 10 | MAP-24 | L | 14 people, 4 companions, `cast` and `tells` on every card, `pack check` | 7, 9 | `npcs.json`, `wendford.json`, `hills.json` (MAP-20); `pack/check.ts` (ENG-44) |
| 11 | ENG-48's deck half | S | the four `wagon` cards, the dog, the horse texts | 4, 8, 10 | `hills.json` (MAP-20) |
| 12 | MAP-23 | S | Tam in `company.json` and the roster; his cards | 8, 10 | `hills.json` (MAP-20) |
| 13 | ENG-49, engine | M | §5's rules, `merchant_death.jsonl` | 7, 8 | `session/cards.rs`, `session.rs` (API-57) |
| 14 | ENG-49, deck | M | the death cards and the content of §5 | 10, 13 | no |
| 15 | AGT-106 | S | participants, `not_in_fight` | 8 | `verdict.ts` (AGT-104) |
| 16 | AGT-107 | M | matchers, underline, the card, `/кто`, Tab | 9, 10 | no |
| 17 | AGT-108 | S | the mouse | 16 | no |
| 18 | AGT-109 | S | `unknown_person`; `invented_on_card` after 19 | 7, 15 | `verdict.ts` (AGT-104) |
| 19 | The describer | M | §6.3 | 16 | no |
| 20 | The run record and exit | S | §11 | all | `verdict.ts`, the report (AGT-104) |
| 21 | Status (Yan) | XS | the milestone closed | 20 | no |

Two lanes run side by side: 3 to 6 then 8, which need no new row, and 7 then 9 and 10. They meet at 11 to 14. The longest chain is ten PRs: 1, 2, 7, 9, 10, 16, 19, 18, 20, 21. Against the scope's count: ENG-49 is two PRs (unpriced there), ENG-48 is engine and deck, and Tam's engine half moved into ENG-48, so MAP-23 is smaller and ENG-48 larger than the scope sized them.

## 14. Estimate

Yan's tender, 2026-11-15, main 34cbac1 (table #409 merged 22:15Z; M13's first PR, API-57, is table #411, open; ENG-44, MAP-20 and AGT-104 not opened).

How a row is priced. Build USD: thread hours by size (XS 0.3, S 0.75, M 1.5, L 3; M12's median PR took 1.3 h) × 12 USD an hour, plus one review round (decision 0083; 0.75 USD median over 25 rounds) and the coordinator's share. 12 USD an hour is 17.6 USD per active hour, measured on the 44 Claude Code subagent threads of this milestone's scope and design (2026-11-12 to 11-15, gaps over 5 min dropped), × 0.7 for build and CI waits. Prices are the ones `usage.jsonl` applies to claude-opus-5-5 (4 / 20 / 0.2 / 5 USD per Mtok for input, output, cache read and cache write, fitted on 111 M12 rows). XS 5, S 11, M 21, L 40 USD. Row 1 is already mostly spent (Lev 6.14, Zoya 1.43, Vera 0.08, this tender 0.69). Review minutes: scope §7 and §10 where they priced the row, otherwise by size (XS 5 to 10, S 15 to 20, M 25 to 30, L 35 to 45).

| # | PR | Size | Build USD | Stas review, min | Stas at table or Mac, min | M13 wait |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Design | S | 10 | 30 | 0 | none |
| 2 | Rows (Yan) | S | 11 | 15 | 0 | none |
| 3 | ENG-47 | S | 11 | 15 | 0 | API-57 (table #411, open) |
| 4 | MAP-22 | XS | 5 | 10 | 0 | none |
| 5 | MON-12, `core:` | S | 11 | 15 | 0 | none |
| 6 | The pin | XS | 5 | 5 | 0 | none |
| 7 | API-58 | L | 40 | 35 | 0 | ENG-44 (not opened) |
| 8 | ENG-48 | L | 40 | 45 | 0 | API-57 |
| 9 | API-59 | M | 21 | 25 | 0 | ENG-44, API-57 |
| 10 | MAP-24 | L | 42 (Zoya and Vera reads included) | 35 | 0 | MAP-20, ENG-44 |
| 11 | ENG-48's deck half | S | 11 | 20 | 0 | MAP-20 |
| 12 | MAP-23 | S | 11 | 20 | 0 | MAP-20 |
| 13 | ENG-49, engine | M | 21 | 30 | 0 | API-57 |
| 14 | ENG-49, deck | M | 21 | 25 | 0 | none |
| 15 | AGT-106 | S | 11 | 15 | 0 | AGT-104 (not opened) |
| 16 | AGT-107 | M | 21 | 25 | 0 | none |
| 17 | AGT-108 | S | 11 | 15 | 0 | none |
| 18 | AGT-109 | S | 11 | 15 | 0 | AGT-104 |
| 19 | The describer (AGT-126) | M | 21 | 25 | 0 | none |
| 20 | The run record and exit | S | 11 | 15 | 30 best, 50 likely: about 20 a full run (start it, rule the `not_in_fight` and `unknown_person` flags), plus the 10-minute Mac check (row 11) | AGT-104 |
| 21 | Status (Yan) | XS | 5 | 10 | 0 | none |

Totals, M13 overlap not included:

| Measure | Best | Likely | M11 baseline | Target (0065) |
| --- | --- | --- | --- | --- |
| Build USD | 351 | 362 (with one S fix PR after a failed run) | not counted | none |
| Exit runs USD | 10.5: one full all-AI run, 8.5 (M12's three logged runs 5.70 to 8.57), plus two `play:card` runs for rows 10 and 12, about 1 each (bench, 2026-11-15: 0.89 and 0.98) | 19.5: the full run fails once (M12: 0 PASS in 8; M11: 1 pair passed in 3) | 35.45 | 17.73 |
| USD in all | 361.5 | 381.5 | | |
| Stas's hours | 7.9: 7.4 review, 0.5 table | 8.5: 7.7 review, 0.83 table | 1.09 table, review not measured | 0.55 table |
| PRs | 21 | 22 | 27 | 13.5 |
| Days, design accepted to exit | 3 | 6 | 2.12 | 1.06 |

Thread time: about 25 builder hours, 13.9 of them on the ten-PR chain; M12's plan priced each subscription limit stop at 1.5 h. The constraint is the 7.4 h of review. Stas merged M12's stack in batches (25 PRs on 2026-11-14 19:19Z), so at about 2.5 h a batch that is three evenings. Best: build lanes A and B in 1.5 days, three review batches, one full run on the third evening. Likely: an L row needs a correctness round, one full run fails (a day, an S fix, 8.5 USD), and two limit stops.

The M13 overlap adds 1 day best and 2 days likely, 33 USD and about 0.5 h of Stas's review. With it: best 4 days, 394.5 USD, 8.4 h; likely 8 days, 414.5 USD, 9.0 h. Of the 21 PRs, 11 rebase once onto the M13 PR they share a file with (0.25 h, 3 USD each). Budget two conflicts that touch logic and so need a look from Stas, 15 min each. The exit run waits for M13's exit pair, and M13's pair has Stas's half in it. Measured from the scope (table #365, merged 2026-11-13 20:48Z) with the design accepted on 11-16, that is 7 to 11 days, against the scope's 6 to 10.

**Bid, if Stas wants it faster or cheaper: move the describer (#19) to a follow-up**, together with `invented_on_card` on AGT-109 and exit row 10. Saving: 21 USD build, about 1 USD of runs, 25 min of review, about half a day. The chain drops from ten PRs to nine, because #18 no longer waits on #19, and 1.5 thread hours come off it. Cost: the card shows the authored lines in the table's voice, not the hero's; Vera has read those lines three times. The cut reverses Stas's 2026-11-13 20:25Z direction, so the call is his. The other candidate, ENG-49 (#13, #14), saves more (42 USD, 55 min) but sits off the chain and saves no day.

Id: the scope's AGT-112 for the describer is a closed M12 row (`docs/tasks-done.md`, `tasks/m12-not-a-passenger/AGT-103.md`). The next free id on main 34cbac1 is **AGT-126**: it appears only as the template example in `TASKS.md` and decision 0085. If `npm run tasks -- next AGT` gives a later id when the rows PR is written (M13 threads are writing rows in parallel), that id wins. API-58, API-59, MAP-24 and AGT-107 to AGT-109 are free on main.

Rules silent, followed here (amendments for Stas):

- A tender prices the Claude Code build per PR as above (thread hours × 12 USD, at `usage.jsonl`'s model prices). Why: the baseline counts in-game runs only (roadmap, Delivery), and 351 USD of builds against 10.5 USD of runs needs a line of its own.
- A milestone built beside another opens its exit run only on a build where the earlier milestone's exit pair has passed. Why: one milestone at a time (CLAUDE.md, Milestones). An Allies failure on a build whose M13 pair has not passed cannot be told apart from an M13 failure.

## 15. Risks

- **Most likely to sink it: nobody knows how often an ally dies.** A card's monsters arrive today at the scene's first anchor, which is the wagon: placed there, the allies start in reach. Decision 0076 counted a Commoner dead on about 63% of wolf bites, 80% with Pack Tactics. Too deadly, and every contract ends on the death card; too safe, and row 1 finds no seed where an ally dies. Cheapest test: ENG-48 prints, before any content is written, deaths and wounds per ally over 200 seeded fights of each `wagon` card, with `from` at the wagon and at `ahead`. `from` is the one knob (§16 item 1).
- **A creature placed in mid-narration** (rule N4). Cheapest test: the fixture where a `mention` comes in exploration and a fight starts next.
- **M13 in parallel.** Eleven of the 21 PRs share a file with it. The rule of §13 holds only if M13's PRs merge first where they meet.
- **Text nobody read.** A reworded line can invent a trait in plain words. Rules N9 and N10 bound it; row 10 and `invented_on_card` are the only watch.
- **Two L rows** (API-58, MAP-24) are the likeliest to need a second review round.

## 16. Decisions for Stas

1. **How often an ally may die.** Recommended target on `night_wolves`, `stand`, everyone aboard: the Merchant dies in no more than one fight in ten, and some ally is hurt or killed in at least one in three. The author tunes `from` to it and ENG-48's table shows the result. Alternative: no target, take what the dice give. Cost of none: the death card may become the normal end of a contract.
2. **What a dead horse costs.** Recommended now: nothing on the road; the caravan panel shows the team, the Merchant remembers it, one choice in that Merchant's deck reads it. What I would do next: a short team forces a Slow pace, where a slow traveller already does. Not now, because both packs arrive on day 4 of a day limit of 4, so a slower wagon could leave an exit run unfinished. Cost of waiting: "stand between the wolves and the horses" protects something that is free to lose.
3. **Both horses dead.** Recommended: the last animal of a wagon is never placed in a fight, so one horse a wagon can die and the wagon always moves. Cost: the second horse is safe by rule. Alternative: a wagon left on the road and a contract finished on foot, a new outcome that needs Zoya's story first.
4. **The rules are silent, so I follow this: one policy for every ally.** A person strikes back at what is in reach, as an animal does, so Tam may hit a wolf with a stick. Alternative: people only stand. Accept?
5. **One more exit row** (row 12). The scope asks Vera to read a fight where an ally is hurt, and its exit run may draw none. Recommended: one `play:card` on `night_wolves`, which also gives `not_in_fight` its first live count.
6. **Departures from the scope, to accept:** four of the seven fights take allies (§3 item 5); `tam_dead` gets a reader that speaks, one card more (rule A9); rule A8 replaces an `unless` on each card a dead person stands in; ENG-48 and ENG-49 are two PRs each and MAP-23 is content only; `NpcKnown.place` optional is one breaking line; exit row 6 waits for the chosen choice, not the shown card [Z14].
7. **The Merchant at the Millbeck bridge [Z4].** Folded, Zoya's smaller fix: she is not placed there, so she cannot die in the one wagon fight against named people, and no card has to read where she fell. Her hotter option: place her, and a death there writes `odda_fell_at_the_bridge`, read by `osric_hears` and `bridge_again`. Recommended: the smaller now, the hotter once ENG-48's table shows how often she would die there. Cost of the smaller: the toll men can never be the ones who killed the employer.
8. **What the describer may reword [Z16].** Your 2026-11-13 20:25Z direction has it reword `look`, `heard` and `remembers`. Zoya: `look` only; `heard` and `remembers` show as authored, because a reworded «Помнит» can say more than the person saw and a reworded rumour can read as fact. Recommended: accept. `remembers` is the deed coming back and `heard` is the valley's word; both are records, and "a shown line equals its authored line" is a test with no model. Cost: the hero's voice is on one line of the card, not three. §6.3 is unchanged until you answer; a yes may make #19 smaller, and Yan re-prices it.
9. **The bible is silent, so I follow Zoya's two amendments until you rule.** A: a `heard` line says only what the valley says aloud to anyone (it binds her MAP-24 text; no rule here changes). B: a person only named on a card is in `tells`, and a death removes that person's choice, never the card (§5's content follows it; before, the owner was in `cast` and A8 took eight cards off the table). Accept both?

## 17. Reviews

### Zoya's board check (2026-11-15)

Verdict, hers: "The board is not clear to close. The design writes seven kinds of deed. Only the dog has a reader that speaks and is named (`gwyn_news` and `gwyn_cheese`)." Her 18 findings, with a fix each, and two amendments to the bible (A: a `heard` line says only what the valley says aloud to anyone; B: a person only named on a card is in `tells`, and a death removes that person's choice, never the card) are in `/mnt/project-files/engine/allies-in-fights/zoya-design-board.md`. Two need Stas: finding 4 (a deed for the Merchant falling at the bridge, or the smaller note-only fix) and finding 16 (the describer rewords `look` only, `remembers` shows as authored, which narrows his 2026-11-13 20:25Z direction). Folded here, each marked [Zn]: findings 1 to 15, 17 and 18 (2 by amendment B, followed and put to Stas in §16 item 9; 4 by its smaller fix, its hotter half in §16 item 7). Not folded: 16, which waits for Stas (§16 item 8). From Vera's read below, four wording points are taken in §10. No PR in §13 changes size.

### Vera's read of five lines from §10 (2026-11-15)

The `vera` agent, given only five lines (the night line, the death card, Gwyn's card, the `/кто` reply, the help line). Her section 3 reacts to "в вашем терминале", which was in the prompt's framing sentence, not in a game line. Verbatim:

**1. Что я поняла**

Я охраняю чужой фургон. Ночью рядом воют волки, лошади пугаются. Потом была драка, и купчиха Одда Велл, судя по всему, погибла. Прямо это не сказано, но «считать его теперь некому, кроме вас» читается именно так. Мне предлагают выбрать: довезти деньги честно или забрать их сейчас. Я бы выбрала первое и, скорее всего, дописала бы что-то своё, например «сначала похоронить её». Мне понравилось, что так можно. Если щёлкнуть по подчёркнутому имени, сбоку откроется справка о человеке. Если набрать «/кто», игра покажет, кого я знаю. Улыбнулась я на Гвин: пастушка помнит про пса, а я нет, и мне сразу стало неловко перед ней. Это хорошая неловкость.

**2. Что я бы переспросила вслух**

- «всякий раз ближе». Я бы сказала «всё ближе». «Всякий раз» тянет за собой вопрос «всякий раз, когда что?», а ответа в строке нет.
- «Одда Велл лежит у колеса». Она мертва или ранена? Я догадалась, но вынуждена была догадываться в самый важный момент.
- «Взять кошель сейчас и поделить». С кем поделить? В первый раз я не поняла, что со мной кто-то есть. Это выяснилось только в четвёртом моменте («С вами идут: Торва, Марен, Ильза»).
- «Солтмута», «Хайстедсе». Это английские названия, просто записанные русскими буквами, и «в Хайстедсе» спотыкается во рту. Я сначала прочла это как опечатку.
- «держит отары на гребне». Гребень чего, холма? Я поняла, но не сразу.
- «ушёл с вашим отрядом и не вернулся». Каким отрядом? Это было до начала игры? Я этого не помню, и игра мне этого не показывала.
- «Esc закрывает». Что такое Esc, я знаю, а вот какая это клавиша на моём MacBook, пришлось бы поискать.
- В четвёртом моменте Одда стоит в списке «Вы встречали» как ни в чём не бывало, хотя она только что умерла. Меня это кольнуло.
- «Руфус» в списке «Только слышали». Когда я про него слышала? Не помню.
- «/кто  кто это: /кто Осрик». Здесь два пробела подряд и дважды «кто». Я не сразу поняла, где команда, а где объяснение. «То же: /who» значит, что можно по-английски? Тогда это одно и то же или нет?
- Косая черта перед словом. Почему её надо ставить и что будет, если я её забуду? Мне скажут, что я неправильно набрала?

**3. Где я стала пассажиром**

В самих пяти моментах я ни разу не начала нажимать что попало. Выбор у фургона был мой. Закрыть ноутбук меня тянет раньше, на первых словах задания: «в вашем терминале». Если для игры надо открыть Терминал, я, скорее всего, дальше установки не дойду. Если же это просто окно, а слово ничего такого не значит, то я остаюсь. Скучно мне нигде не было.

## Sources

Scope `docs/scope/allies-in-fights-scope.md`; decisions 0034, 0062, 0063, 0067, 0070, 0071, 0076, 0077, 0080, 0086; the M12 and M13 designs. Project files, `engine/allies-in-fights/`: `lev-merchant-death.md`, `lev-clickable-names.md`, `zoya-merchant-death-options.md`, `vera-clickable-names.md`, `zoya-design-board.md`, `vera-design-5-lines.md`. Code and data read on main 4d865d9: `adapter/game.rs` (`scripted_action`, the fight's start and end), `adapter/game/level_up.rs` (`award_xp`), `session/cards.rs` (`card_fight`, `follow_blows`), the world crate's `caravan.rs`, `escort.rs`, `deck.rs`, `npcs.rs`, `travel.rs`; the contract's `world.rs`, `state.rs`, `events.rs`; `contract/protocol.md` §4.4, §4.10, §4.11, §5; `worlds/wend` (44 cards in 8 deck files with the two packs' decks; 7 cards start a fight, with 9 fight effects; the roster holds 3 people); both packs' `campaign.json` and road scenes.
