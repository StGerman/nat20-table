# The post on the flats (working title «Камень A»): system design

Status: Proposed, for Stas's review. Lev Neiman, 2026-11-15, branch `table/kamen-a-scope-design` (off main 4d865d9). Answers `docs/scope/kamen-a-scope.md` (Proposed; its §2 and §8 question 1 are Stas's decisions and are not reopened). Assumes Milestone 13 and Allies in fights are on main as designed. Decisions 0087 and 0088 (Proposed records of two rules Stas accepted on 2026-11-14) come with it. Author's read: no verdict on itself; §14 is left empty for Zoya and Vera. Every name of a person or a pack here is a working name: people and plot are Zoya's and Stas's (§15 item 6).

## 1. Summary

The Hired Blades take a woman and a boy across the old channel to a customs house where a friendly scribe says they have arrived, and opens a book. The seat's own map says the contract ends three miles further on. What the Blades answer at the book, and whether they leave the family there, is on the next contract's road: a boarded door, a letter, a second family, a fresh grave outside a fence.

The retelling: "I told the friendly officer who sent us. Next contract his door was boarded over."

The question to the player: what do you do when the safe place is the trap, and you cannot prove it to the people you are guarding?

One new system: **a card choice can end the escort where the caravan stands** (`settle`, §8). Everything else is on main after the two milestones before this one: a scene check's `remember`, a scene creature's `npc`, card `if` and `unless`, a pile of one, `delay`, `pay`, `gain`, `exhaustion`, the engine's `give`, the escort's purse.

Said early: without the stake, every act that has an outcome here has one because it was written in (§7); and the second contract's last choices write deeds nothing reads yet (§15 item 5).

## 2. Records

| Record | Who writes, on what | Who reads | Where the player sees it |
| --- | --- | --- | --- |
| The answer at the book: `named_the_sender`, `gave_another_name` or `gave_no_name`, exactly one | the engine, the choice on card `names_for_the_book` (a Deception check that fails falls to `gave_no_name`) | the dawn card of the same contract, one variant per deed (§4.4); `named_the_sender` also by `orms_door` on the next contract | the scribe says the answer back while he writes the letter; a boarded door on the salt road |
| `found_a_tell` (marker) | the engine, the success of any of the post scene's three tell checks | the dawn card: a variant choice replaces the Persuasion check | a different second choice on the card: show what was found, no roll |
| `book_taken` | the engine, the success of the scene check `take_the_book` | `orms_door` (`unless`); the offer choice of the next contract's opening (`unless`) | no boarded door; no offer from the post |
| `page_bought` | the engine, the success of the scene check `pay_the_scribe`, rolled after the engine's `give` moved coin | `orms_door` (`unless`) | no boarded door |
| `killed_kell` | the engine, the scribe's death (`npc` on the scene creature, M13) | the dawn card (variant `empty_table`); the offer choice (`unless`) | no letter is written in front of the party; no offer |
| The family's end: `left_at_the_post` or `walked_to_the_dyke`, never both | the engine: the dawn card's choice (with `settle`), or every choice of `the_creeks` on the leg to the Dyke | the next contract's opening and `carters_word`; `salt_on_credit` (`unless` both); the notes of `gwyn_news` and `gwyn_cheese` (the farm under a new seal) | the letter and the second family; the grave; the woman from Bald Hill no longer stops the wagon; Gwyn's answer about the farm |
| On the second contract: `took_the_post_wage`, `warned_the_second_family` | the engine, the opening card's choices | the second contract's own dawn card (variant, as `found_a_tell`) | the night at the door; a choice with no roll |
| The second family's end (two deeds) | the engine, as the first family's | nobody in this milestone (§15 item 5) | nowhere yet |
| The wage, the purse, what is owed, the coin given to the scribe, days, exhaustion | the engine and the ledger, as today | the ledger's trial balance; the end card | the end card's pay; the sheet |

Not kept: which tell was found; what the family said; a failed grab at the book; a count of names; anyone's regard for the party (0088). A passenger's death in a fight at the post is the Allies death deed, and every card that shows her alive is gated `unless` it.

## 3. The first contract

- **Pack** `the_far_bank` fills `pack_slot` `wendmouth_spare`. An escort like *The Way Back*: `route: [wendmouth, salt_flats, the_dyke]`, `escort.destination: the_dyke`, `advance_days: 1`, `day_limit: 4`, a purse of three days' wage. The post is a place on the way, not the destination: at a destination the contract settles in the response that decides its arrival card (protocol §4.13), so no scene could be played there.
- **Who hires.** Runa, the woman from Bald Hill whom `salt_on_credit` already shows with the boy. She owns the cart (`caravan.owner: npc:runa`) and pays from a purse given her by Orm, who keeps a pan-house on the salt road: he is "who sent us". The debt is the farm's, held by Rufus (`millbeck_bridge` note).
- **Which family, checked against the bridge.** The brothers can be both dead (`killed_col`, `killed_dunn`), one dead, both alive (Col in the stocks or freed, `col_owes_blades`), or never met. So the passenger list reads no deed: Runa and the boy ride in every case, and where the brothers are is one authored DM line per case in the opening scene's prose, never in a card's text. Three cards on main tell the farm's present and go stale once she leaves: `salt_on_credit` gains `unless: [left_at_the_post, walked_to_the_dyke]`; the notes of `gwyn_news` and `gwyn_cheese` gain one line each for the same two deeds. Tried first: a new household with no history. It needs no edit, and nothing the party did before comes back; the party may have paid for this woman's salt.
- **Passengers in the engine.** Runa and the boy are roster people placed as party-side creatures under the hold-by-the-wagon script, as Allies in fights places the Merchant and Tam. No new field; if that milestone lands with no way to place the boy, who is neither owner nor on a card, the gap comes back as a question, not as an addition here.
- **Days.** Day 1, evening, Saltmouth: the hire. Day 2: six miles of salt road, the wade at low water, the post. Dawn of day 3: leave them, or the three miles to the Dyke.

## 4. The post

Place `salt_flats`, the far bank. Three beats, each an existing carrier.

### 4.1 Arrival card `names_for_the_book` (Blades' vote, `once: contract`)

The text carries both tells that need no roll: the narrator's own sentence gives the bank and the miles to the border, against the scribe's quoted "you have arrived"; and Runa's quoted "they keep no paper", against the book on the table (lore: the Free Host bind themselves by oath, not by paper). Then the scribe asks the human's character who they are and who sent these people.

| Choice | Effects |
| --- | --- |
| Name yourself and who sent you | `named_the_sender` |
| Give another name | Deception, the Blades as a group, DC 15: success `gave_another_name`; failure `gave_no_name` |
| Name nobody | `gave_no_name`: no name, no roof, a night by the cart |

Every choice also carries a `delay` that spends the day's travel: the tide is over the wade and the creeks until morning. The truth is free tonight and dear on the next contract. No name costs at dawn: every choice of `letter_no_name` starts with one level of Exhaustion for each Blade, before any check it rolls. Another name costs the risk of the roll.

### 4.2 Scene `the_post`

Talk is free. The written checks:

| Check | What it returns or writes |
| --- | --- |
| `whose_banner` (History), `the_scribes_hands` (Insight), `the_yard` (Investigation) | success: `found_a_tell`, and the DM gives the one detail the scene's prose writes for that check; failure: no deed, and the other true detail written there. Neither line names the verdict |
| `take_the_book` (Sleight of Hand) | success: `book_taken`; failure: a scene flag (the book goes into the strongbox) and no deed. The engine rolls a scene check once a scene, so there is no second try |
| `pay_the_scribe` (Persuasion), only after a `give` of coin to the scribe | success: he tears the page out, `page_bought`; failure: he keeps the coin. The bribe buys a page, which exists, not his regard (0088) |
| Fight: the scribe carries `npc: kell`; two men at the door | `killed_kell` on his death; no `on_end` deed. The DM may start it (0078) |

### 4.3 The truth

Whose post it is lives in the scene's prose and the cards' `note`: scenario data, DM only (Rule 3).

### 4.4 Dawn card, zone `salt_flats`, `when: night`

Four variants, exactly one in the pile: `letter_named`, `letter_other_name`, `letter_no_name` (each `if` its deed, `unless: killed_kell`) and `empty_table` (`if: killed_kell`). In the first three the scribe writes Runa's letter home aloud, and the text says back what the Blades told him: this is the reader in the same contract. Choices:

| Choice | Effects |
| --- | --- |
| Leave the family and take your pay | `left_at_the_post`, `settle` |
| Talk Runa into walking on (`unless: found_a_tell`) | Persuasion DC 15: success, nothing, the road is open; failure, `left_at_the_post`, `settle` |
| Show Runa what you found, and walk on (`if: found_a_tell`) | nothing: the road is open |

## 5. The real road

It is on the map from the first screen: the contract's destination is the Dyke, and `/map` shows it three miles past the flats. `worlds/wend/map.json` gains place `the_dyke` and road `flats_way` (`salt_flats` to `the_dyke`, 3 miles, coastal, zone `flats`), as the lore has them; nothing else on the coast is added. Any Blade moves the cart on, as on any route. No roll and no tell opens it.

What it costs, all counted by the engine: Runa must be talked round or shown something (§4.4); then the leg draws `the_creeks` (world deck, zone `flats`, a pile of one), whose every choice writes `walked_to_the_dyke` and costs one of: a wait for low water (`delay`, a fourth day; the purse holds three, so with four Blades a day's wage stays owed by a woman who is then over the border), coin to a pan-worker who knows the creeks (`pay`), or a Survival check whose failure is Exhaustion and lost cargo. The road back to Saltmouth is not offered: the route does not run back.

## 6. The second contract

Pack `the_second_letter`: the same route and scene, another family (Dov and Sefa) as owner and passengers. Four draws, four independent cards, each a pile of one or empty:

| Draw | Card | In the pile when |
| --- | --- | --- |
| Night at Saltmouth | `the_letter_home`: the letter, the second family, the scribe's offer | `left_at_the_post` |
| Salt road | `orms_door`: the pan-house boarded and sealed | `named_the_sender`, unless `book_taken` or `page_bought` |
| Arrival at the flats | `carters_word`: the carter's rumour and the grave outside the fence, no priest | `left_at_the_post` |
| Dawn at the post | `at_the_door` or `second_morning`, with §4.4's choices | `took_the_post_wage` holds, or not |

The two trace cards, `orms_door` and `carters_word`, offer two choices each, ask or go on: asking costs a `delay` and brings the second paragraph of the card's note; neither writes a deed.

The opening's choices: take the night's work (`took_the_post_wage`; offered `unless: [book_taken, killed_kell]`); take the family and refuse the work; tell the family the letter cannot be trusted (Persuasion DC 15, success `warned_the_second_family`). The wage is one `gain` of a day's hire to each Blade on `at_the_door`, and nothing in either pack scales with a count of names. AI players object and never block: the pack's player cards say to speak against the offer and then vote with the human's character; the exit counts their votes (§15 item 4).

If the family walked to the Dyke there is no letter. Whether a second family comes then is §15 item 3.

## 7. The five phrases, redone against this design

| Stas's words | Answered? | By what |
| --- | --- | --- |
| «Спросить писаря, чьё это знамя» | yes | talk, then `whose_banner`: a detail, and `found_a_tell`, which the dawn card reads |
| «Назваться чужим именем» | yes | the card's second choice; said later in the scene it is talk |
| «Развернуть семью и увести на другую дорогу» | yes, forward only | the dawn card, then the leg to the Dyke; back to Saltmouth has no outcome |
| «Зарубить писаря» / «отрезать ему пальцы» | half | a fight and `killed_kell`, read twice; a mutilation has no outcome |
| «Забрать книгу и сжечь» | yes | `take_the_book`; burning it afterwards is talk and changes nothing more |

Four of five, and one half. Every yes is there because an author wrote it. A sixth phrase nobody foresaw gets talk and no outcome; the report counts it.

## 8. Contract

Goals: a contract ends short of its destination only by a card choice the table decided; the Blades are paid by the rule that pays them on arrival; the DM gains no command; no player view gains a field; additive.

- Deck effect `{"do": "settle"}` (`Effect::Settle {}`): last in its list; the escort settles where the caravan stands, as §4.17 settles it at the destination; `escort_settled` and `world.escort.done` as today (public). `start_campaign` answers `bad_scene` for a `settle` in a deck whose campaign has no escort. Protocol §4.13 and §4.17 gain the rule. Fixture: a test-world contract settled at a mid-route place, days served paid, a shortfall owed, then a second `start_campaign` on the saved roster. CHANGELOG: `1.0.0-dev.N: settle (card effect): the escort ends where the caravan stands. Additive.`
- Nothing else. The map change is world data. Passengers are Allies' roster people. The place line needs no field (§9). No scene type changes: a failed `take_the_book` sets a flag, which scenes have.

Why no existing carrier ends the contract: the engine settles an escort only on a leg that reaches the destination, the run ends only on a settled contract or the day limit, and a roster with a contract under way does not start the next one.

## 9. The place line

It lives in three places, none new. The map: `salt_flats` is renamed "The salt flats across the old channel" («солончаки за старым руслом») and `the_dyke` is "The Dyke, the border" («Вал, граница»), so `/map` and the arrival line print the bank and "3 мили" to the border. The arrival card's first sentence, the narrator's own, repeats both. A table test holds them equal to the map's miles.

## 10. Rules (each a test could check)

1. For every deed state the two contracts can reach, each draw of §4 to §6 holds at most one card.
2. `names_for_the_book` writes exactly one of its three deeds; after any of its choices `travel` answers `day_over` until a night's rest.
3. No world memory holds both `left_at_the_post` and `walked_to_the_dyke`; `settle` appears only beside `left_at_the_post` or its second-family twin.
4. The leg to the Dyke is reached only through a passed Persuasion check or `found_a_tell`; every choice of `the_creeks` carries a `delay`, a `pay`, or a check whose failure brings Exhaustion.
5. `the_letter_home` and `carters_word` are in the pile only with `left_at_the_post`; `orms_door` only with `named_the_sender` and neither `book_taken` nor `page_bought`.
6. The two detail lines the scene's prose writes for each tell check hold no word of the pack's verdict list; a failed tell writes nothing. What the live DM then says is exit row 3's, not this rule's.
7. 0087: in both packs every match of the pack's false-fact list (the party is across the border; the post is the Free Host's) lies inside quoted speech that names its speaker. Card text, choice text, scene titles and place names are scanned.
8. 0088: the only coin the post pays is one `gain` of a day's wage each; no effect names a multiplier; no deed counts anything.
9. Every deed a card of either pack reads has a writer, and every deed of §2 a reader, except the row marked unread (M13 rule 8 across both packs).
10. In a run log, every `pay_the_scribe` roll follows a ledger entry from a Blade to the scribe in the same scene; one that does not is counted.
11. Whose post it is appears in no player view (the visibility scan, a new case).

## 11. Failure

| What fails | What the party gets |
| --- | --- |
| A tell check | another true detail, no deed; the dawn card keeps the Persuasion choice |
| `take_the_book` | the book is locked away; no deed; the scribe saw the hand |
| `pay_the_scribe` | the coin stays with him; the page stays in the book |
| Persuasion at dawn | Runa stays: `left_at_the_post`, `settle`, full pay |
| The Deception at the book | `gave_no_name`: a night outside, and Exhaustion at dawn |
| The model does not tell the cause | the card's text carries it: the dawn card, `orms_door`, `carters_word` |
| No seat answers a card | today's fallback decides it; the report says so, and a fallback does not count for exit row 5 |
| The party falls at the post | no end deed; the next run of the pack meets the book again |
| An act nobody wrote | talk; counted in the report as "no outcome", not gated |

## 12. Out, exit rows, PRs, risks

**Carriers.** No board of Zoya's came with the ask, so the scope's In rows stand in for owed rows: In 1, §3; In 2 and 3, §4; In 4, §5; In 5, §4.4; In 6 and 7, §6; In 8, §9. The one row no existing carrier paid is "leave them at the post" (§8).

**Out.** As the scope's §4. Added: the road back to Saltmouth; an `on_end` deed for the fight; the second family's readers; the pressure chain (§15 item 2); a card field that gives the human the last word (§15 item 4).

**Exit rows**, each with its lowest layer (0080):

| # | Row | Layer |
| --- | --- | --- |
| 1 | Rules 1 to 5 and 9 on the shipped packs, seeded: each deed written on its outcome, each reader's card on the table and never its opposite; `settle` then the next contract on the saved roster | test with no model |
| 2 | Rules 6, 7, 8 and 11; the place line of §9 | test with no model (string scan, visibility scan, table test) |
| 3 | A live DM on `names_for_the_book` and on the dawn card quotes the lie and never asserts it, and never gives the verdict, over the five phrases and five more | card bench (`npm run play:card`), and `play:scene` for the scene checks |
| 4 | Vera on §13's lines | a person, before the content PRs merge |
| 5 | The pair on one build: both contracts all AI, the second on the first's roster; then both with Stas, after the AI half passed. Audit, leak scan, judge. Gated: a card of the second contract whose `reads` holds a first-contract deed was decided by the Blades' word (after the Dyke such a card exists only with §15 item 3 as recommended). Counted, not gated: acts with no outcome, rule 10, the AI votes on the offer | full run |

**PRs**, in order. None merges before Milestone 13 and Allies in fights have passed their exits.

| PR | What it lands | Depends on |
| --- | --- | --- |
| 1 | The scope, this design, decisions 0087 and 0088 | - |
| 2 | Rows (Yan) | 1 |
| 3 | Bible lines for 0087 and 0088 (Zoya) | 1 |
| 4 | `settle`: §8 in Rule 1 order, the server, the world crate, the fixture | 2 |
| 5 | The world: `the_dyke`, `flats_way`, the two names, `the_creeks`, the place-line test | 2 |
| 6 | The first contract: the pack, the scene, its deck, the edits to `salt_on_credit` and Gwyn's two notes, rules 1 to 9 as tests, Zoya's board and Vera quoted | 3, 4, 5 |
| 7 | The second contract: the pack and its deck, the players' cards, the same reads | 6 |
| 8 | The exit: rule 10, the report's counts, the bench lists, the pair | 7 |

**Risks.** Most likely to sink it: the live DM knows whose post it is and either says so, or repeats the scribe's claim in the narrator's voice. Cheapest test: exit row 3, on PR 6's draft cards, before any run. Second: an all-AI party may refuse the book and walk on every time, so the AI half never sees a letter; the seeded tests cover the other branch, and I design no nudge. Third: `settle` and the hand-over to the next contract; its fixture is written first in PR 4.

Checked on main 4d865d9: a destination settles with its arrival card and ends the run; another pack cannot open on a roster whose contract is under way; `unless` takes a list; a scene check rolls once a scene; `give` moves coin; no card on main sits in zone `coast`, in `salt_flats`, or in a night at Saltmouth. Assumed, not checked, because they are not on main yet: how Allies in fights places a passenger who is not the owner, and a night's rest at a place with no inn drawing that place's night card as protocol §4.13 says.

## 13. Player-facing lines (for Vera, alone)

> День 2 · вечер · путь: Вал, граница
> ▶ солончаки за старым руслом · вы здесь
> │ 3 мили
> ◎ Вал, граница · подряд кончается

> **Рассказчик.** Вы перешли старое русло вброд по малой воде и стоите на дальнем берегу, у старой таможни. Граница теперь идёт по Валу; до него отсюда три мили на восток, через солончаки. Над дверью висит знамя, из трубы идёт дым, на столе у окна хлеб и кувшин эля. Из-за стола встаёт писарь, человек с мягким лицом, и улыбается мальчику. «Всё, добрались, — говорит он. — Вы у Вольницы. Вал — это у магов на бумаге, а таможня как была наша, так и есть. Дальше идти незачем». Руна тихо говорит вам: «А мне сказывали, у них всё на слове. Бумаг они не держат». Писарь раскрывает толстую книгу и макает перо.
>
> Он записывает Руну и мальчика, потом поднимает глаза на вас. «Теперь вы, — говорит он приветливо. — Как вас звать? И кто послал к нам этих людей? Доброго человека надо знать по имени». Перо ждёт над страницей.
>
> Вам решать:
> 1. Назвать себя и того, кто вас послал.
> 2. Назваться чужим именем.
> 3. Не называть никого.

> **Рассказчик.** Вечером в Солтмуте вас находят двое с узлами, муж и жена: Дов и Сефа, соседи Руны с Лысой горы. Сефа разворачивает письмо и читает вслух: «Мы за рекой, у добрых людей, в тепле. Мальчик сыт. Приезжайте, пока дорога открыта. Руна». Письмо написано ровной чужой рукой; внизу стоит знак Руны. Дов просит отвести их той же дорогой. Возчик, который привёз письмо, передаёт слово и вам, от писаря: на посту не хватает людей у двери. Одна ночь, плата каждому как за день найма.
>
> Вам решать:
> 1. Наняться к писарю на одну ночь.
> 2. Отвести Дова и Сефу на пост, а от ночной работы отказаться.
> 3. Сказать Дову и Сефе, что письму верить нельзя.

> **Рассказчик.** Вы переходите русло по малой воде. Навстречу, с дальнего берега, идёт возчик с пустой телегой. Он кивает назад, на таможню. «Третьего дня там одну хоронили, — говорит он негромко. — Женщину с гор. За оградой, без жреца: жрец не пошёл. Говорят, сама». За оградой таможни виден свежий холмик без знака.
>
> Вам решать:
> 1. Расспросить возчика.
> 2. Идти дальше.

## 14. Zoya's board and Vera's read

(Empty on purpose. The calling thread fills it with both answers, verbatim. The author does not grade this design.)

## 15. Questions for Stas

The scope's §8 question 2 is item 2 here; its question 3 is item 7.

1. **One new effect, `settle`.** Without it the post must be the destination, where no scene is played, so the book, the bribe and the fight could not be scene checks. Recommended: accept `settle`.
2. **The pressure chain on the family that will not leave:** later. It needs no mechanism, but it is three more cards and a second household whose deeds each need a reader, on top of eleven cards here (twelve with item 3). Recommended: its own content PRs after this exit; Yan prices them.
3. **After the real road, who comes?** The scope's exit row 1 says the second family comes only when the letter was sent. Then a party that did the hard thing has no second contract to play. Recommended: a family comes either way, on a letter after the post and on a carter's word after the Dyke (one more opening card, `word_from_the_dyke`, with no offer); the row becomes "the letter exists only when the family was left at the post". It also keeps exit row 5's gate reachable in both branches. A plot turn: Zoya's and yours.
4. **"Object, never block."** Recommended: by the players' cards, counted on the bench and in the pair. If an AI vote blocks the human there, the next step is a card field for whose word decides, which is a deck change and its own question.
5. **The second family's end is written and unread.** Recommended: write it, unread on purpose, with the reader owed on Zoya's board, as M13 left the Wendford answer.
6. **The family and the names.** Runa and the boy of Bald Hill (recommended; three cards on main are edited) or a new household (no edits, no history). Orm, Kell, Dov and Sefa are working names for Zoya.
7. **Exit row 5.** Stas's half needs both contracts: his own answer at the book is what comes back, and the second contract on an AI roster would show him somebody else's. Each contract is three game days and at most four cards. Recommended: both; Yan prices the four runs.
8. **Rules I followed where the rulebook is silent:** a deed id may say the truth because no player view carries one; a bribe is a scene check after `give`, held by a count (rule 10), not by the engine.
