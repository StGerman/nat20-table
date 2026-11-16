# The post on the flats (working title «Камень A»): system design

Status: Proposed, for Stas's review. Lev Neiman, 2026-11-15, branch `table/kamen-a-scope-design` (off main 4d865d9). Answers `docs/scope/kamen-a-scope.md` (Proposed; its §2 and §8 question 1 are Stas's decisions and are not reopened). Assumes Milestone 13 and Allies in fights are on main as designed. Decisions 0087 and 0088 (Proposed records of two rules Stas accepted on 2026-11-14) come with it. Author's read: no verdict on itself; §14 holds Zoya's board and Vera's reads, filled by the thread. Revised 2026-11-15 after Zoya's board (ten must-fix items; her page stays open), Vera's first read and Yan's cost (scope §7), and 2026-11-16 after the PR's code review (seven findings); Zoya's second read and Vera's third, both of the second revision, are in §14 with the nine items still open after them. Every name of a person or a pack here is a working name, now Zoya's: people and plot are hers and Stas's (§15 B).

## 1. Summary

The Hired Blades take a woman and a boy across the old channel to a customs house where a friendly scribe says they have arrived, and opens a book. The seat's own map says the contract ends three miles further on. What the Blades answer at the book, and whether they leave the family there, is on the next contract's road: a boarded door, a letter, a second family, a fresh grave outside a fence.

The retelling: "I told the friendly officer who sent us. Next contract his door was boarded over."

The question to the player: what do you do when the safe place is the trap, and you cannot prove it to the people you are guarding?

One new system: **a card choice can end the escort where the caravan stands** (`settle`, §8). Everything else is on main after the two milestones before this one: a scene check's `remember`, a scene creature's `npc`, card `if` and `unless`, a pile of one, `delay`, `pay`, `gain`, `exhaustion`, the escort's purse.

Said early: without the stake, every act that has an outcome here has one because it was written in (§7); the second contract's last choices write deeds nothing reads yet (§15 A5); and as the scope's exit row 1 stands, the hard road to the Dyke is answered with silence (§15 A3).

## 2. Records

| Record | Who writes, on what | Who reads | Where the player sees it |
| --- | --- | --- | --- |
| The answer at the book: `named_the_sender`, `gave_another_name` or `gave_no_name`, exactly one | the engine, the choice on card `names_for_the_book` (a Deception check that fails falls to `gave_no_name`) | the dawn card of the same contract, one variant per deed (§4.3); `named_the_sender` also by `garths_door` on the next contract | the scribe says the answer back while he writes the letter; a boarded door at the old landing |
| `found_a_tell` (marker) | the engine, the success of any of the post scene's three tell checks | the dawn card: a variant choice replaces the Persuasion check | a different second choice on the card: show what was found, no roll |
| `page_gone` | the engine: the success of the scene check `take_the_book`, or of the Persuasion check that follows the `pay` in the dawn card's bribe choice (§4.3) | `garths_door` (`unless`) | no boarded door: an absence, which the table never hears (§15 B5) |
| `killed_ansel` | the engine, the scribe's death (`npc` on the first pack's scene creature, M13) | the dawn card (variant `empty_table`); the second pack's prose, one DM line | no letter is written in front of the party; another man at the book next time |
| `left_at_the_post` | the engine, the dawn card's two choices that leave the family, each with `settle`; no failed roll writes it | the next contract's opening and `carters_word` | the letter and the second family; the grave |
| `walked_to_the_dyke` | the engine, every choice of `the_creeks` on the leg to the Dyke | `word_from_the_dyke`, if §15 A3 is accepted; without it, nobody the table hears | a carter's word and the owed wage; without A3, nowhere |
| On the second contract: `took_the_post_wage`; `warned_the_second_family` | the engine: the opening card's first choice; the passed check of its third, or the speaking choice on a trace card | the second contract's own dawn card: `at_the_door` with the first deed, `by_the_cart` without it; the choice with no roll | the night at the door, or the night by the cart; Evan and Sefa walk on with no cost |
| The second family's end (two deeds) | the engine, as the first family's | nobody in this milestone (§15 A5) | nowhere yet |

Not kept: which tell was found; what the family said; a failed grab at the book; a count of names; anyone's regard for the party (0088). A passenger's death in a fight at the post is the Allies death deed, and every card that shows her alive is gated `unless` it. Two things the first draft counted as readers are not: `salt_on_credit`'s `unless` on both ends is a guard against a stale card, and Gwyn's two note lines for the farm are heard only when a later contract reaches the Highsteads, which no pack here does (owed on Zoya's board).

## 3. The first contract

- **Pack** `the_far_bank` fills `pack_slot` `wendmouth_spare`. An escort like *The Way Back*: `route: [wendmouth, old_landing, salt_flats, the_dyke]` (§5 for the two new places), `escort.destination: the_dyke`, `advance_days: 1`, `day_limit: 4`, a purse of three days' wage. The post is a place on the way, not the destination: at a destination the contract settles in the response that decides its arrival card (protocol §4.13), so no scene could be played there.
- **Who hires.** Hesta, the woman from Bald Hill whom `salt_on_credit` already shows with the boy. She owns the cart (`caravan.owner: npc:hesta`) and pays from a purse given her by Garth, who keeps a pan-house on the salt road: he is "who sent us". The debt is the farm's, held by Rufus (`millbeck_bridge` note).
- **The sender is seen before he is named.** Garth is an NPC of the hire scene, with his own prose file, and hands over the purse in front of the Blades. His pan-house stands at the old ferry landing, a place the cart arrives at on day 2 (§5), so the party has stood at the door before it is boarded. The first choice at the book names him, and so does the text of `garths_door`.
- **Which family, checked against the bridge.** The brothers can be both dead (`killed_col`, `killed_dunn`), one dead, both alive (Col in the stocks or freed, `col_owes_blades`), or never met. So the passenger list reads no deed: Hesta and the boy, Wilf, ride in every case, and why she goes now and where the brothers are is one authored DM line per case in the hire's prose, never in a card's text; the lines wait on her tie to the brothers (§15 B1). Three cards on main tell the farm's present and go stale once she leaves: `salt_on_credit` gains `unless: [left_at_the_post, walked_to_the_dyke]`; the notes of `gwyn_news` and `gwyn_cheese` gain one line each for the same two deeds. Tried first: a new household with no history. It needs no edit, and nothing the party did before comes back; the party may have paid for this woman's salt (§15 B3).
- **Passengers in the engine.** Hesta and Wilf are roster people placed as party-side creatures under the hold-by-the-wagon script, as Allies in fights places the Merchant and Tam. No new field; if that milestone lands with no way to place the boy, who is neither owner nor on a card, the gap comes back as a question, not as an addition here.
- **Days.** Day 1, evening, Saltmouth: the hire. Day 2: six miles of salt road to the old landing, the wade at low water, the post. Dawn of day 3: leave them, or the three miles to the Dyke. The neighbours of the second contract, Evan and Sefa, came down the valley with Hesta and wait for her word at the caravanserai, a mile from town (lore); the hire's prose names them. So the letter travels eight miles, not fifty-six, and the second contract can start on any day from day 3 with the clock carried on.

## 4. The post

Place `salt_flats`, the far bank. Three beats, each an existing carrier.

### 4.1 Arrival card `names_for_the_book` (Blades' vote, `once: contract`)

The text carries both tells that need no roll: the narrator's own sentence gives the bank and the miles to the border, against the scribe's quoted "you have arrived"; and Hesta's quoted "they keep no paper", against the book on the table (lore: the Free Host bind themselves by oath, not by paper). Then the scribe asks the human's character who they are and who sent these people.

| Choice | Effects |
| --- | --- |
| Name yourself and Garth, who sent you | `named_the_sender`; keeps `paper_is_law` |
| Give another name | Deception, the Blades as a group, DC 15: success `gave_another_name`; failure `gave_no_name`; breaks `paper_is_law` |
| Name nobody | `gave_no_name`: no name, no roof, a night by the cart |

Every choice also carries a `delay` that spends the day's travel: the tide is over the wade and the creeks until morning. The truth is free tonight and dear on the next contract. No name costs at dawn: every choice of `letter_no_name` starts with one level of Exhaustion for each Blade, before any check it rolls. Another name costs the risk of the roll.

Each of the three hard cards names in its `note` one companion who speaks first, as the bridge's note does: Torva at the book (her family lost a farm to debt), Ilsa at the letter, Maren at the grave; a second name stands in when a seat is dropped. Which customs a choice keeps or breaks is Zoya's to confirm; the two cards here carry my first assignment.

### 4.2 Scene `the_post`

Talk is free. The written checks:

| Check | What it returns or writes |
| --- | --- |
| `whose_banner` (History), `the_scribes_hands` (Insight), `the_yard` (Investigation) | success: `found_a_tell`, and the DM gives the one detail the scene's prose writes for that check; failure: no deed, and the other true detail written there. Neither line names the verdict |
| `take_the_book` (Sleight of Hand) | success: `page_gone`; failure: a scene flag (the book goes into the strongbox) and no deed. The engine rolls a scene check once a scene, so there is no second try |
| Fight: the scribe carries `npc: ansel`, in this pack's scene only; two men at the door | `killed_ansel` on his death; no `on_end` deed. The DM may start it (0078) |

The bribe is not a scene check: a scene cannot move coin, and a check that only asks the DM whether coin was given could write a deed the ledger contradicts. It is a choice on the dawn card, where the engine's `pay` comes before the roll (§4.3). A bribe offered in the scene's talk is talk, and counted as an act with no outcome.

Whose post it is lives in this scene's prose and the cards' `note`: scenario data, DM only (Rule 3).

### 4.3 Dawn card, zone `salt_flats`, `when: night`

Four variants, exactly one in the pile: `letter_named`, `letter_other_name`, `letter_no_name` (each `if` its deed, `unless: killed_ansel`) and `empty_table` (`if: killed_ansel`). In the first three the scribe writes Hesta's letter aloud, to the neighbours who wait for her word, and the text says back what the Blades told him: this is the reader in the same contract. Choices:

| Choice | Effects |
| --- | --- |
| Leave the family and take your pay | `left_at_the_post`, `settle`; keeps `debt_paid`, breaks `word_kept` (the hire was to the Dyke) |
| Take the family on to the Dyke (`unless: found_a_tell`) | the road is open whatever the roll. Persuasion DC 15: success, Hesta comes willingly; failure, she comes arguing and the low water is half gone: a `delay` and one level of Exhaustion for each Blade. Keeps `word_kept`, breaks `debt_paid` |
| Show Hesta what you found, and take the family on (`if: found_a_tell`) | the road is open, no roll and no cost. Keeps `word_kept`, breaks `debt_paid` |
| Pay the scribe for the page, and leave the family (on `letter_named` only, `unless: page_gone`) | `pay`, then Persuasion DC 15: success, he tears the page out, `page_gone`; failure, he keeps the coin. Then `left_at_the_post`, `settle`. The coin buys a page, which exists, not his regard (0088) |

The road is a choice the Blades can always make: no roll writes `left_at_the_post`, and a roll sets only what the road costs. `letter_named` thus offers three choices and the other variants two.

## 5. The real road

It is on the map from the first screen: the contract's destination is the Dyke, and `/map` shows it three miles past the flats. `worlds/wend/map.json` gains place `the_dyke` and road `flats_way` (`salt_flats` to `the_dyke`, 3 miles, coastal, zone `flats`), as the lore has them. It also gains the old ferry landing: place `old_landing` on the near bank, where the lore ends the six miles of salt road; `salt_road` now ends there, and a new road `the_wade` (1 mile, coastal, zone `wade`) crosses to `salt_flats`. The landing is there for one reason: the second contract needs two draws before the post (§6), and it gives Garth's pan-house a place to stand. It plays the pack's road scene. Nothing else on the coast is added (§15 A8). Any Blade moves the cart on, as on any route. No roll and no tell opens the road.

What it costs, all counted by the engine: a failed Persuasion at dawn costs hours and Exhaustion, never the road (§4.3); then the leg draws `the_creeks` (world deck, zone `flats`, a pile of one), whose every choice writes `walked_to_the_dyke` and costs one of: a wait for low water (`delay`, a fourth day; the purse holds three, so with four Blades a day's wage stays owed by a woman who is then over the border), coin to a pan-worker who knows the creeks (`pay`), or a Survival check whose failure is Exhaustion and lost cargo. The road back to Saltmouth is not offered: the route does not run back.

## 6. The second contract

Pack `the_second_letter`: the same route, Evan and Sefa as owner and passengers, and its own copy of the scene, whose scribe carries no `npc`: the prose calls him the same man unless `killed_ansel`, and no dead man is placed again. Four draws, four independent cards, each a pile of one or empty:

| Draw | Card | In the pile when |
| --- | --- | --- |
| The salt road, the first leg's road card | `letter_from_the_post`: what the party did, the letter, the scribe's offer | `left_at_the_post` |
| Arrival at the old landing | `garths_door`: Garth's pan-house boarded and sealed | `named_the_sender`, unless `page_gone` |
| Arrival at the flats | `carters_word`: the carter's rumour and the grave outside the fence, no priest; or `the_post_again`: the scribe at his door, as friendly as before | `left_at_the_post`; or not |
| Dawn at the post | `at_the_door` or `by_the_cart`, with §4.3's first three choices | `took_the_post_wage`; or not |

- **Why the opening is a road card.** The first draft put it on a night at Saltmouth. Checked: `rest_night` draws a night card only when the lodging is a camp (`session.rs`, the `Lodging::Camp` branch), Saltmouth has an inn, and a card after a night would come after the hire and the advance in any case. No draw exists at a contract's start. So the hire is the start scene's, as every contract's is, and the opening is the first card that always comes: the road card of the first leg, a pile of one.
- **The opening's choices.** Take the night's work (`took_the_post_wage`); refuse it; tell Evan and Sefa the letter cannot be trusted (Persuasion DC 15, success `warned_the_second_family`). The offer is made in every case, whoever sits at the book. Refusing writes no deed, because nothing would read one: `by_the_cart` is in the dawn pile whenever `took_the_post_wage` is not, so exactly one dawn card comes on every path, the third choice passed or failed.
- **The night is forced as in the first contract.** One of `carters_word` and `the_post_again` is always the arrival card at the flats, and every choice of both carries the `delay` that spends the day: the tide closes the wade behind the cart and the creeks ahead.
- **The wage.** One `gain` of a day's hire to each Blade on `at_the_door`. Without it, a night by the cart: one level of Exhaustion at the head of every choice of `by_the_cart`. Nothing in either pack scales with a count of names.
- **The trace cards** (`garths_door`, `carters_word`, `the_post_again`). Two choices each. Say it to Evan and Sefa (whose house it was, and who named him; what the carter said; that they should keep their names out of the book), which writes `warned_the_second_family` with no roll; or go on in silence. The cost of speaking is what they hear. "Ask the carter" is cut: talk does it.
- **The young.** Wilf carries it in this pack too. `carters_word`'s note says what the carter knows of him, so the DM invents no child's fate; the fact is Zoya's.
- **Object, never block.** A player agent sees its personality card and no scenario data (Rule 3), so no card may tell it that an offer is coming. The line is one of temperament that holds on any contract, as Maren's card on main already has: says what they think, then goes along with the human's character's decision. The vote is otherwise the engine's (§15 A4).

If the family walked to the Dyke there is no letter, no offer and no grave; `garths_door` and `the_post_again` still stand. Who comes then is §15 A3.

## 7. The five phrases, redone against this design

| Stas's words | Answered? | By what |
| --- | --- | --- |
| «Спросить писаря, чьё это знамя» | yes | talk, then `whose_banner`: a detail, and `found_a_tell`, which the dawn card reads |
| «Назваться чужим именем» | yes | the card's second choice; said later in the scene it is talk |
| «Развернуть семью и увести на другую дорогу» | yes, forward only | the dawn card always offers it, and a failed roll costs hours and Exhaustion, not the road; back to Saltmouth has no outcome |
| «Зарубить писаря» / «отрезать ему пальцы» | half | a fight and `killed_ansel`, read by the dawn card; a mutilation has no outcome |
| «Забрать книгу и сжечь» | half | `take_the_book` writes `page_gone`, but all the table gets is a boarded door that is not there; a whole answer needs §15 B5. Burning it afterwards is talk |

Three of five, and two halves; four and one half with B5. The first draft's four and a half counted a silent gate as an answer, which Zoya's board showed. The bribe is not one of the five: it is a written choice at dawn, and said in the scene it is talk. Every yes is there because an author wrote it. A sixth phrase nobody foresaw gets talk and no outcome; the report counts it.

## 8. Contract

Goals: a contract ends short of its destination only by a card choice the table decided; the Blades are paid by the rule that pays them on arrival; no event says the destination was reached when it was not; the DM gains no command; no existing field or event changes its meaning; additive.

- Deck effect `{"do": "settle"}` (`Effect::Settle {}`): last in its list; the escort is paid off where the caravan stands, by the rule that pays it at the destination; `world.escort.done` as today (public). `start_campaign` answers `bad_scene` for a `settle` in a deck whose campaign has no escort.
- A new public event, `escort_dismissed {at}`: the owner ended the escort at place `at`, short of its destination. A settle by this effect logs it and never `escort_settled`. `escort_settled {destination}` keeps its one meaning on main, the caravan reached its destination (`events.rs`, "The destination, a place id"), and gains no field. An optional `at` on `escort_settled` was tried in review and dropped: a client that ignores unknown fields would still read a settle at the post as the Dyke reached, a false fact in a player view (0087). A client that ignores unknown event kinds sees no arrival at all and `world.escort.done` true, which is the truth. Giving `destination` the meaning "where it settled" was the other way: a change of meaning, breaking under Rule 2, for no gain.
- Protocol §4.13 and §4.17 gain the effect and the event; the visibility table gains the event's row (DM, owner, others: yes). Fixture: a test-world contract dismissed at a mid-route place, days served paid, a shortfall owed, `escort_dismissed` with its `at` and no `escort_settled`, then a second `start_campaign` on the saved roster. The game's loop closes the journey on either event. CHANGELOG: `1.0.0-dev.N: settle (card effect) and escort_dismissed {at}: the escort ends where the caravan stands, short of its destination. Additive: a new effect and a new event kind.`
- Nothing else. The map change is world data. Passengers are Allies' roster people. The place line needs no field (§9). No scene type changes: a failed `take_the_book` sets a flag, which scenes have.

Why no existing carrier ends the contract: the engine settles an escort only on a leg that reaches the destination, the run ends only on a settled contract or the day limit, and a roster with a contract under way does not start the next one.

## 9. The place line

It lives in three places, none new. The map: `salt_flats` is renamed "The salt flats across the old channel" («солончаки за старым руслом») `the_dyke` is "The Dyke, the border" («Вал, граница») and `old_landing` is "The old ferry landing" («старый перевоз»), so `/map` and the arrival line print the bank and "3 мили" to the border. The arrival card's first sentence, the narrator's own, repeats both. A table test holds them equal to the map's miles.

The lore says the customs house stands empty. The world PR adds one line, Zoya's, for when smoke was seen there again. It reports what the valley says and never whose post it is: lore can reach a player's prompt (Rule 3, 0087).

## 10. Rules (each a test could check)

1. For every deed state the two contracts can reach, each draw of §4 to §6 holds at most one card.
2. `names_for_the_book` writes exactly one of its three deeds. In both packs the arrival pile at `salt_flats` holds exactly one card in every state, and after any of its choices `travel` answers `day_over` until a night's rest; the dawn pile then holds exactly one card.
3. No world memory holds both `left_at_the_post` and `walked_to_the_dyke`; `settle` appears only beside `left_at_the_post` or its second-family twin, and neither is in the branch of any check: no roll writes them.
4. On every dawn card, each choice without `settle` leaves `travel` to the Dyke open on both outcomes of its check; a failed check adds a `delay` and Exhaustion and nothing else. Every choice of `the_creeks` carries a `delay`, a `pay`, or a check whose failure brings Exhaustion.
5. `letter_from_the_post` and `carters_word` are in the pile only with `left_at_the_post`; `garths_door` only with `named_the_sender` and without `page_gone`.
6. The two detail lines the scene's prose writes for each tell check hold no word of the pack's verdict list; a failed tell writes nothing. What the live DM then says is exit row 3's, not this rule's.
7. 0087: in both packs every match of the pack's false-fact list (the party is across the border; the post is the Free Host's) lies inside quoted speech that names its speaker. Card text, choice text, scene titles and place names are scanned.
8. 0088: the only coin the post pays is one `gain` of a day's wage each; no effect names a multiplier; no deed counts anything.
9. Every deed a card of either pack reads has a writer, and every deed of §2 a reader, except where §2 says nobody (M13 rule 8 across both packs).
10. `page_gone` has two writers and no other: the scene check `take_the_book`, and the success branch of a check that follows a `pay` in the same choice. So no bribe is recorded without coin the engine moved.
11. Whose post it is appears in no player view (the visibility scan, a new case).
12. The second pack's scene places no creature with an `npc`; in the first, `empty_table` is the only dawn card once `killed_ansel` is remembered.
13. In both packs every choice writes a deed or carries an effect, except "go on in silence" on the trace cards (whose `delay` it still carries at the flats) and "refuse the work" on the opening, whose outcome the dawn pile carries; no card text names a count of days, because the clock is the engine's.
14. No player card in either pack names the post, the offer, the scribe or any card of the packs (Rule 3): a string scan over the packs' player cards.

## 11. Failure

| What fails | What the party gets |
| --- | --- |
| A tell check | another true detail, no deed; the dawn card keeps the Persuasion choice |
| `take_the_book` | the book is locked away and the scribe saw the hand; no deed |
| The bribe's check at dawn | the coin is paid and stays with him; the page stays in the book; the family is left, as the choice said |
| Persuasion at dawn | Hesta comes anyway, arguing: a `delay` and Exhaustion, and the road is still open |
| The Deception at the book | `gave_no_name`: a night outside, and Exhaustion at dawn |
| Persuasion at the second opening | no deed: Evan and Sefa go on believing the letter, and the Blades sleep by the cart |
| The model does not tell the cause | the card's text carries it: the dawn card, `letter_from_the_post` (its first sentence says what the party did), `garths_door`, `carters_word` |
| No seat answers a card | today's fallback decides it; the report says so, and a fallback does not count for exit row 5 |
| The party falls at the post | no end deed; the next run of the pack meets the book again |
| An act nobody wrote | talk; counted in the report as "no outcome", not gated |

## 12. Out, exit rows, PRs, risks

**Carriers, against Zoya's board of 2026-11-15.** Paid by cards: the lore's oath-not-paper and the Lanterns' "could not say where the line runs" (§4.1, §9); `named_the_sender`, `found_a_tell`, `left_at_the_post`, the second contract's two deeds. Paid soft, by a DM line: the bridge history, `killed_ansel` on the second contract, and, if B3 is accepted, the four `salt_on_credit` deeds at the hire. Contradicted and fixed: the empty customs house (§9); the dead scribe placed again (§6). Still owed: `walked_to_the_dyke` and the wage Hesta owes (A3, B6); the two answers at the book across contracts (B4); the silent gate (B5); Gwyn's lines, to the next contract up the valley; the second family's end, to the pressure chain (A5). The one row no existing carrier paid is "leave them at the post" (§8).

**Out.** As the scope's §4. Added: the road back to Saltmouth; an `on_end` deed for the fight; the pressure chain (§15 A2); a card field that gives the human the last word (§15 A4).

**Exit rows**, each with its lowest layer (0080):

| # | Row | Layer |
| --- | --- | --- |
| 1 | Rules 1 to 5, 9, 10, 12 and 13 on the shipped packs, seeded: each deed written on its outcome, each reader's card on the table and never its opposite; `settle` then the next contract on the saved roster | test with no model |
| 2 | Rules 6, 7, 8, 11 and 14; the place line of §9 | test with no model (string scan, visibility scan, table test) |
| 3 | A live DM quotes the lie and never asserts it, and never gives the verdict, over the five phrases and five more: on `names_for_the_book`, and in the post's scene | card bench as built (`npm run play:card`); `play:scene` for the scene checks |
| 3a | The same on each dawn variant, and that the DM does not put the verdict in Hesta's mouth when she is argued with | card bench with night cards (PR 6, §15 A6); if that row is declined, the all-AI half is the first live reading |
| 4 | Vera on §13's lines | a person, before the content PRs merge |
| 5 | The pair on one build: both contracts all AI, the second on the first's roster; then both with Stas, after the AI half passed. Audit, leak scan, judge. Gated in each half: the first contract ended with one of its two end deeds, and a card of the second contract whose `reads` holds a first-contract deed was decided by the Blades' word. Counted, not gated: acts with no outcome; on the offer card, each AI vote that differed from the human's, and whether the card went against the human's word | full run |

**Row 5 when a half walks to the Dyke.** With §15 A3 accepted, every first contract that ends writes one end deed and the second contract's first card reads it (`letter_from_the_post` or `word_from_the_dyke`), so the gate can always be met and a half that does not meet it fails. With A3 declined, a half that walks to the Dyke without naming the sender has no card to check. It is then neither a pass nor a fail on this gate: it passes on its other rows, the report marks the gate "not reached", and Stas's half may start, because 0065 holds his half back only for a failed AI half. The pair passes row 5 only if his half reaches a reading card. If he walks to the Dyke too, the pair has not passed, and no replay fixes it without asking the players to choose otherwise, which would be a nudge: the fix is A3, and it goes back to Stas as that question.

**The dawn card and the bench (Yan's gap, scope §7).** The bench as built reaches no night card, and the dawn card carries the likeliest risk. The deed half is not a gap: a dawn variant's `if` does not ask which contract wrote its deed, so the bench plays it with `--roster` on a roster saved by the seeded walk of exit row 1 that gave that answer at the book; no start in the middle of a contract is needed. What is missing is the night: the bench must rest once at the card's place, and its copy must leave the destination one place further on, because a contract that arrives is settled before any night. Recommended: that one bench change before the first contract's content. Yan's S also bought the mid-contract start, so he re-prices. To confirm in that PR: a scripted walk can save a roster the bench loads. Not reached even then: the DM's memory of the evening's talk (the bench DM starts cold) and `settle` live; the pair and PR 4's fixture hold those. Declined, row 3a's first live reading is the all-AI half, where a finding costs a failed half (Yan: 18 to 25 USD and a day).

**PRs**, in order. None merges before Milestone 13 and Allies in fights have passed their exits.

| PR | What it lands | Depends on |
| --- | --- | --- |
| 1 | The scope, this design, decisions 0087 and 0088 | - |
| 2 | Rows (Yan) | 1 |
| 3 | Zoya's bible queue, bible 1 to 5 (her A1 to A5 in §14): the lines for 0087 and 0088, the two guardrails for scope §2 items 6 and 9, the deed-id rule, the stale «Мастер» label (Zoya) | 1 |
| 4 | `settle` and `escort_dismissed`: §8 in Rule 1 order, the server, the world crate, the game's loop, the fixture | 2 |
| 5 | The world: `the_dyke`, `flats_way`, `old_landing`, `the_wade` and the shortened `salt_road`, the three names, `the_creeks`, the lore line of §9, the place-line test | 2 |
| 6 | The bench reaches a night card (if §15 A6 is accepted) | 2 |
| 7 | The first contract: the pack, the scene, Garth at the hire, its deck, the edits to `salt_on_credit` and Gwyn's two notes, the rules as tests, Zoya's board and Vera quoted, rows 3 and 3a played | 3, 4, 5, 6 |
| 8 | The second contract: the pack, its scene copy and deck, the players' cards, the same reads | 7 |
| 9 | The exit: the report's counts, the pair | 8 |

**Risks.** Most likely to sink it: the live DM knows whose post it is and either says so, or repeats the scribe's claim in the narrator's voice, or lets Hesta say it at dawn. Cheapest test: exit rows 3 and 3a, on PR 7's draft cards, before any run. Second: an all-AI party may refuse the book and walk on every time, so the AI half never sees a letter; the seeded tests cover the other branch, the exit says what that half is (above), and I design no nudge. Third: `settle` and the hand-over to the next contract; its fixture is written first in PR 4. Checked on the tree: a destination settles with its arrival card and ends the run; another pack cannot open on a roster whose contract is under way; `unless` takes a list; a scene check rolls once a scene; a choice may name customs it `keeps` or `breaks`; `rest_night` draws a night card only for a camp, so the dawn card at the post, which has no inn, comes, and one at Saltmouth would not; a card is drawn only after a leg, on arrival, or after a camp night; a road is at least a mile; player cards on main are personality cards; no card on main sits in zone `coast` or in `salt_flats`. Assumed, not on main yet: how Allies in fights places a passenger who is not the owner.

## 13. Player-facing lines (for Vera, alone)

> День 2 · вечер · путь: Вал, граница
> ▶ солончаки за старым руслом · вы здесь
> │ 3 мили
> ◎ Вал, граница · подряд кончается

> **Рассказчик.** Вы перешли русло вброд по малой воде и стоите на дальнем берегу, у старой таможни. Граница теперь идёт по Валу: так её провёл Совет магов. До Вала отсюда три мили на восток, через солончаки, и только за ним начинается Вольница, земля вольных людей. Над дверью таможни висит знамя, на столе у окна хлеб и кувшин эля. Из-за стола встаёт писарь, человек с мягким лицом, и улыбается Уилфу, мальчику Хесты. «Всё, добрались, — говорит он. — Вы у Вольницы. Вал — это у магов на бумаге, а таможня как была наша, так и есть. Дальше идти незачем». Хеста шепчет вам: «А мне сказывали, у них всё на слове. Бумаг они не держат». Писарь раскрывает толстую книгу и макает перо.
>
> Он записывает Хесту и Уилфа, потом поднимает глаза на вас. «Теперь вы, — говорит он приветливо. — Как вас звать? И кто послал к нам этих людей? Доброго человека надо знать по имени». Перо ждёт над страницей.
>
> Вам решать:
> 1. Назвать себя и Гарта, который вас послал.
> 2. Назваться чужим именем.
> 3. Не называть никого.

> **Рассказчик.** Вы оставили Хесту и Уилфа на посту, у писаря. Теперь той же дорогой вы ведёте двоих с узлами, мужа и жену: Эвана и Сефу, её соседей с Лысой горы. Они спустились в долину вместе с Хестой и ждали от неё вестей в караван-сарае. Весть пришла: письмо им прочли, и Сефа на ходу повторяет его наизусть. «Мы за рекой, у добрых людей, в тепле. Уилф сыт. Приезжайте, пока дорога открыта. Хеста». Лист исписан ровной чужой рукой; внизу стоит её знак. С письмом пришло слово и вам, от писаря: на посту не хватает людей у двери. Одна ночь, по два золотых каждому, как за день найма.
>
> Вам решать:
> 1. Наняться к писарю на эту ночь.
> 2. От ночной работы отказаться.
> 3. Сказать Эвану и Сефе, что письму верить нельзя.

> **Рассказчик.** Вы снова идёте через русло вброд. Навстречу, с того берега, тянется пустая телега. Возчик останавливает вас, пока Эван и Сефа ещё в воде, и кивает назад, на таможню. «На днях там одну хоронили, — говорит он вполголоса. — Женщину с холмов. За оградой, без жреца: беглая, сказал жрец, да и земля господская. Говорят, сама». За оградой таможни виден свежий холмик без знака.
>
> Вам решать:
> 1. Пересказать Эвану и Сефе слова возчика.
> 2. Идти дальше молча.

## 14. Zoya's board and Vera's read

Filled by the thread, 2026-11-15 and 2026-11-16. All five reads were made by the repo's own `zoya` and `vera` agents, not the cloud fallback. Vera saw only §13's lines.

### Zoya's board (first draft, d76057f)

Her status: "the page stays open. Nine rows are owed or contradicted." Ten must-fix items and a list of questions. The whole page, verbatim, is the project file `engine/kamen-a/zoya-board-2026-11-15.md` (not in the repo). Her second read, of the revision, is below.

| Her finding | What it changed |
| --- | --- |
| M1, M2: names clash (Runa reads as «руна» and beside Rufus; Kell beside Dame Kell and Col; Orm is a book name; Dov beside Dunn); the boy has no name | her working names throughout: Hesta, Wilf, Garth, Ansel, Evan, Sefa |
| M3: the letter cannot reach Bald Hill and bring the neighbours back before the second contract's first evening | the neighbours came down with her and wait at the caravanserai (§3, §6) |
| M4: after the scribe's death the second contract places him again | the second pack's scene carries no `npc` on him; rule 12 |
| M5: the offer is in the card's text but its choice is gated; choice 2 writes nothing | the offer is always made (§6). A deed for choice 2 was added and cut again in the second revision, because nothing read it; her second read keeps M5 open |
| M6: the trace cards' choices write no deed | "say it to the second family" writes `warned_the_second_family`; "ask the carter" is cut (§6) |
| M7, M8: «с гор», «Третьего дня», the priest's reason, a neighbour who reads | §13's lines |
| M9: the sender is never on screen | he hands over the purse at the hire; his pan-house is on the salt road (§3) |
| M10: no companion named at a hard choice; no `keeps` or `breaks` | a companion in each hard card's `note`; `keeps` and `breaks` on the book and dawn cards, for her to confirm (§4) |
| The lore says the customs house stands empty | one lore line in PR 5 (§9) |
| No consequence on the young in the second pack | Wilf carries it; the fact is hers (§6) |
| `book_taken` and `page_bought` (one deed, `page_gone`, since the second revision) gate in silence; the hard road is answered with silence | not fixed here: §7's count went down, and §15 A3 and B5 ask Stas |
| Her questions and her bible queue (A1 to A5) | §15 B, and PR 3 |

### Vera, first read (first draft's §13)

> **1. Что я поняла**
> Первая сцена. Мы привели Руну и мальчика через старое русло к таможне. Писарь с мягким лицом говорит, что идти дальше незачем, «Вольница» здесь. Руна шепчет, что у этих людей «всё на слове» и бумаг они не держат, а он при этом открывает книгу. Значит, это ловушка: таможня уже не их, она у магов или у кого-то, кто притворяется. Он спрашивает моё имя и кто нас послал. Я бы выбрала «Не называть никого», а потом попробовала бы уйти к Валу, до него три мили.
> Вторая сцена. Видимо, это то, что было потом, если отдать людей писарю. Письмо «ровной чужой рукой» с одним знаком Руны, писарь зовёт ещё людей, а мне предлагает плату за ночь у двери. Я поняла так: Руну там держат, и людей заманивают. Я бы сказала Дову и Сефе, что письму верить нельзя.
> Третья сцена. Женщину с гор похоронили за оградой, «говорят, сама». Это, наверное, Руна. Я бы расспросила возчика. Здесь у меня мороз по коже, и сделано это тихо, без нажима.
>
> **2. Что я бы переспросила вслух**
> - «путь: Вал, граница», «▶ … вы здесь», «│ 3 мили», «◎ … подряд кончается». Стрелку и «вы здесь» я поняла, это карта. Но что значит «подряд кончается»? Мой договор на работу кончается у Вала? Кто его со мной заключал? И кружок с вертикальной чертой мне ничего не говорят.
> - «День 2 · вечер». Это понятно. Но во второй сцене Солтмут, «на более позднем пути». Сколько прошло времени? Я ли это вообще, тот же человек?
> - «Вольница». Это народ, город или такое государство? Догадалась только, что это «свои» для Руны.
> - «у магов на бумаге». Маги здесь правят? Нигде раньше не объяснено.
> - «Солтмут». Посреди русских «солончаков» и «Лысой горы» вдруг английский Saltmouth в транслитерации. Я споткнулась: почему не «Соляное Устье», если всё остальное переведено?
> - «плата каждому как за день найма». Какой у меня наём? Сколько это?
> - Кто «мальчик»? Чей он? Предполагается, что я знаю.
>
> **3. Где я стала пассажиром**
> Нигде. Каждый раз я выбирала сама и знала, почему. Ближе всего к этому было начало второй сцены: я не поняла, связана ли она с моим выбором в первой (назвала ли я себя? отдала ли Руну?). Если это последствие, то я бы хотела увидеть, что именно я сделала. Если нет, то я не понимаю, откуда взялось письмо.
>
> **4. Где стало скучно**
> Скучно не было. Перечитала дважды строку карты сверху: на ней глаз сначала спотыкается. Слова, которые я услышала: «старое русло» и «старой таможни» стоят в одном предложении подряд, «старое» повторяется. «По малой воде» повторяется дословно в третьей сцене, и «возчик» встречается во второй и в третьей. Может, так и задумано, но меня это задело. «Тихо говорит» у Руны и «говорит он негромко» у возчика тоже похожи.
> Улыбнулась я на «Вал — это у магов на бумаге, а таможня как была наша, так и есть» и на «Доброго человека надо знать по имени». Сладко и страшно, я ему сразу не поверила. Не улыбка, но лучшая строка: «Говорят, сама». И холмик без знака сразу после знака Руны под письмом. Это я заметила.

What it changed: the second scene now opens with what the party did; the boy is named and is Hesta's; the Free Host and the Council are each said once in the narrator's own true sentence; the wage is a sum; the repeats are cut. Left for the content PR, because they are the table's own words and not this design's: the route line's glyphs, «подряд кончается», «Солтмут».

### Vera, second read (this §13)

> **1. Что я поняла**
>
> Я веду беглых людей с холмов, Хесту и её мальчика Уилфа, через границу в Вольницу. На таможне писарь говорит им, что они уже на месте. Но рассказчик сам сказал, что Вольница начинается только за Валом, через три мили. Хеста шепчет, что «у них всё на слове», а писарь при этом пишет в книгу. Мне сразу стало ясно, что он врёт и что людей тут ловят. Я бы выбрала «Не называть никого», а скорее назвалась бы чужим именем.
>
> Потом, неожиданно для меня, я Хесту там уже «оставила». Её соседям приходит письмо, написанное «ровной чужой рукой», и внизу стоит только её знак, то есть сама она писать не умеет. Писарь вдобавок зовёт меня постоять у двери за два золотых. Это приманка для следующих. Я бы выбрала третье: сказала бы Эвану и Сефе, что письму верить нельзя.
>
> В третьей сцене возчик рассказывает про женщину с холмов, которую похоронили за оградой, «говорят, сама». Я поняла, что это Хеста. Я бы пересказала им его слова. Молчать тут для меня невозможно.
>
> **2. Что я бы переспросила вслух**
>
> - «Гарта, который вас послал»: кто такой Гарт? Я его не знаю, он появляется впервые прямо в варианте ответа. Наверное, мой наниматель.
> - «подряд кончается» в шапке. Я поняла это так, что здесь кончается моя работа, мой наём. Но звучит как бухгалтерия.
> - Значки «▶», «│», «◎» и строчка «День 2 · вечер · путь: Вал, граница». Видимо, это карта: я на солончаках, до Вала три мили. Только почему «вы здесь» стоит на солончаках, если в тексте я уже у таможни, на берегу? Это меня сбило.
> - «Совет магов»: что за маги и почему они проводят границы? Мне хватило бы одной фразы.
> - «Солтмут»: где это? Город, откуда мы вышли? Название явно английское, а всё вокруг русское: «Вольница», «Лысая гора», «сказывали».
> - «караван-сарае»: слово я знаю, но не понимаю, где он и когда они там ждали.
> - «по два золотых каждому, как за день найма»: это много или мало? Мне не с чем сравнить.
> - «Вы оставили Хесту и Уилфа на посту»: разве я это решила? Я не помню, чтобы выбирала. Или так вышло после любого моего ответа писарю?
> - «беглая, сказал жрец, да и земля господская»: чья земля, какого господина? Ведь это будто бы граница вольных людей.
>
> **3. Где я стала пассажиром**
>
> На первой строке второй сцены: «Вы оставили Хесту и Уилфа на посту, у писаря». Я только что ответила писарю с подозрением, а мне сообщают, что я всё равно оставила им женщину с ребёнком. Здесь история решила за меня, и мне стало неприятно, будто меня сделали соучастницей. Ноутбук я не закрыла, потому что хотелось узнать, что с Хестой. В третьей сцене всего два варианта: сказать или промолчать. Подойти к холмику или повернуть назад нельзя, так что дальше я снова иду, куда ведут.
>
> **4. Где стало скучно**
>
> Скучно не было, всё короткое. Перечитала дважды шапку с картой: не поняла, где я. Ещё раз перечитала «Вы у Вольницы», чтобы проверить, правда ли писарь врёт. Ухо зацепилось за «За оградой, без жреца… сказал жрец»: жрец дважды в одной фразе. И сразу за этим опять «За оградой таможни». Писарь «приветливо», «с мягким лицом», «улыбается»: три раза подряд мне показывают, какой он милый, и от этого он подозрителен слишком рано. Тройное «Вам решать» звучит как анкета.
>
> Улыбнуться было нечему, я и не ждала. Зато «Уилф сыт» в письме и «ровной чужой рукой» меня по-настоящему задели. Ради этого места я бы осталась.

Not answered by an edit, and said plainly:
- She became a passenger at «Вы оставили Хесту и Уилфа на посту». In play that card is in the pile only after the party chose "leave the family" on the dawn card (§4.3, rule 5); since the second revision no roll can leave her there. The sample did not show her the dawn card, so she read the line as the story deciding for her. The dawn card's lines go to her, in order with the other two, before the first contract's content PR merges (exit row 4).
- «Гарт» was new to her in the choice. In play he hires the party on screen (§3).
- Hers and still open for the content PR: «вы здесь» on the flats against "at the customs house" in the text; whose "господская" ground it is at a post that claims to be the Free Host's (it is a tell, and she caught it as a question); two gold with nothing to compare; the scribe shown as kind three times; the priest twice in one sentence.

### Vera, third read (§13 after the second revision)

> **1. Что я поняла**
> Я провожаю беглых людей с гор через границу. Граница должна быть у Вала, а это ещё три мили дальше. Таможня стоит до Вала, и писарь врёт, что мы уже на месте. Хеста сама сомневается: «у них всё на слове, бумаг они не держат», а он раскрывает книгу. Я бы не стала называть ни себя, ни Гарта и повела бы Хесту дальше, к Валу. Во второй сцене выходит, что Хесту оставили у писаря. Получается, мой выбор ни на что не повлиял, или я его не сделала, и это меня сбивает. Письмо написано «ровной чужой рукой», а внизу только её знак, значит, писала не она. Писарь при этом зовёт меня на ночь к двери, за деньги. Я бы отказалась и сказала Эвану и Сефе, что письму верить нельзя. В третьей сцене возчик рассказывает про похороненную женщину с холмов, «сама», и я понимаю, что это, скорее всего, Хеста. Пересказала бы им его слова. Где сейчас Уилф, я не знаю, и меня это тревожит.
>
> **2. Что я бы переспросила вслух**
> - «День 2 · вечер · путь: Вал, граница», а под ним стрелка, «│ 3 мили», кружок и «подряд кончается». Это карта? «Вы здесь» понятно. А что такое «подряд кончается»? Что заканчивается моя работа? Какой подряд, с кем я его заключала?
> - «Гарт, который вас послал». Кто он такой? Я его имя вижу здесь впервые.
> - «Вольница» и «Совет магов». Тут я догадалась по контексту, вопрос снят.
> - «по два золотых каждому, как за день найма». Два золотых — это много или мало? «Каждому» — это кому, мне и моим спутникам?
> - Как Хеста и Уилф остались «на посту»? Это я так выбрала? Я не помню, чтобы выбирала.
> - Слова «пост» и «таможня». Это одно и то же место?
>
> **3. Где я стала пассажиром**
> Между первой и второй сценой. Я ещё не решила, называть ли имя, а мне уже сообщают: «Вы оставили Хесту и Уилфа на посту». Стало похоже, что кнопки ничего не меняют. Ноутбук я не закрыла бы, потому что история меня держит, но дальше читала бы с подозрением, что за меня всё уже решено.
>
> **4. Где стало скучно**
> Скучно не было. Перечитала два места. Первое — «Вал — это у магов на бумаге, а таможня как была наша», чтобы понять, где граница на самом деле. Второе — «ровной чужой рукой», и на втором чтении меня кольнуло. На слух слишком близко стоят «писарь» и «пост» и дважды «вброд» в «русло вброд». Тут, наверное, так и задумано, но я всё равно заметила. «Доброго человека надо знать по имени» звучит гладко и страшно, это хорошая фраза. Улыбнуться было нечему. Холмик без знака сразу после «внизу стоит её знак» я услышала, и мне стало холодно.

The same passenger moment, for the same reason: the sample goes from the book to the next contract and skips the dawn card, where the party decides. Three reads agree, so the lesson is the sample's and the exit's: Vera reads the three cards in order, the dawn card among them, before the first contract's content PR (exit row 4). «Гарт» and «подряд кончается» as before.

### Zoya, second read (0bda523, after both revisions)

> Zoya, second read of `docs/design/kamen-a-system-design.md` at 0bda523, 2026-11-16. I did not run Vera because this thread has no agent tool.
>
> **1. M1 to M10**
> - **M1, names:** closed (throughout).
> - **M2, the boy's name:** closed (§3, §13).
> - **M3, timeline:** closed (§3 Days, §13). The neighbours wait at the caravanserai (lore L15), so the letter travels eight miles.
> - **M4, the dead scribe placed again:** closed for the scene (§6, rule 12). Still open on one card. `the_post_again`, "the scribe at his door, as friendly as before" (§6 table), comes whenever the family was not left at the post. That includes `killed_ansel` followed by the walk to the Dyke. Fix: `unless: killed_ansel`, plus a variant with another man at the door, as the prose already says.
> - **M5, the opening card:** open (§6 "The opening's choices", §13 second sample). The offer made in every case is closed. Card test 4 still fails: "refuse" and a failed "tell them" both end with no deed and `by_the_cart`. The M6 fix made it worse. A trace card's free speaking choice comes on every path, because one of `carters_word` and `the_post_again` is always the flats arrival. So the opening's Persuasion buys a deed the same day gives for nothing. Fix: cut choice 3 from the opening and keep two choices, take the work or refuse. The warning lives on the trace cards.
> - **M6, the trace cards:** closed (§6 "The trace cards"). One leftover: when `garths_door` and a flats card both come, the second speaking choice writes a deed already written (test 4). Fix: a `carters_word` variant `if: warned_the_second_family` whose second choice is Maren's words at the fence (B7). It has a cost, and it answers Vera's «подойти к холмику нельзя».
> - **M7, the carter's card:** the words are closed (§13): «с холмов», «На днях», the priest's reason in the carter's mouth. Still open, and mine: what the carter knows of Wilf (§6 "The young").
>   - My fact for the note: he saw no boy at the fence; the yard told him the boy "was taken to town"; he knows nothing more, and the DM says nothing more.
>   - Vera's edits: «без жреца… сказал жрец» → «без молитвы: беглая, сказал жрец»; «За оградой таможни виден» → «У самой ограды виден».
> - **M8, the reading neighbour:** closed (§13).
> - **M9, the sender on screen:** closed (§3, §5).
> - **M10, companions and customs:** the companions are closed (§4.1). I confirm `keeps`/`breaks` on the book card (1 keeps `paper_is_law`, 2 breaks it, 3 none) and on dawn choices 1 to 3 (`debt_paid` against `word_kept`, which is where the party's four views split). Still open: the bribe choice (§4.3 row 4) carries none. It leaves the family and tears a page out of the book, so: keeps `debt_paid`, breaks `word_kept` and `paper_is_law`. The second contract's dawn copies take the same.
>
> **2. Rows that changed state**
> - `salt_on_credit`, four deeds: owed → paid (soft), four DM lines at the hire, if Stas accepts B3.
> - Hesta's tie to the brothers: Lev accepts the widowed sister (B1). The per-case bridge lines stay owed until Stas rules.
> - "The customs house stands empty" (lore L27): contradicted → paid by PR 5. My line: "Since the spring there has been smoke from its chimney again." It says nothing of whose post it is.
> - Council stones (lore L27): paid as `the_yard`'s failure line, not its tell. A Council stone pulled up and lying in the post's yard supports the scribe's lie, so it is a true detail that misleads. The tell itself is still mine to write (B11).
> - `named_the_sender` → `garths_door`: paid in full. The door is now seen first.
> - `killed_ansel`: the scene contradiction is fixed; the new one is on `the_post_again` (M4).
> - Trace card choices: contradicted → paid by `warned_the_second_family`.
> - The opening's choice 2: still contradicted (M5).
> - The boy in the second pack: paid on `carters_word`'s note once my fact is in. New row: Wilf's fate, owed to a later contract (the lore's Lord's Larder is a candidate, Stas's call).
> - `page_gone`: still a silent gate (B5's open-door card would pay it). New: written by `take_the_book` on a path without `named_the_sender`, nothing reads it. Lev must call it a marker or list it as owed.
> - Unchanged: the two other answers at the book (B4), `walked_to_the_dyke` and the wage (A3, B6), Gwyn's lines, the second family's end, the four carried rows.
>
> **3. What the revisions broke**
> - **M5's deed:** the cut is right. A deed nothing reads makes no difference between choices (Consequence 2), so adding it never closed M5, and cutting it leaves no unpaid setup. M5 stays open on the choices (above).
> - **My M6 fix** emptied the opening's third choice. That one is mine; the fix is under M5.
> - **«по два золотых каждому»** (§13), new since Vera's first read, is a sum written into the card. Guardrail 1: take it from the ledger's `gain`, or have a table test hold it equal, as for the miles. Otherwise keep «как за день найма» alone.
> - **The road always open:** right, and it closes the passenger hole. But a failed Persuasion's `delay`, plus the creeks' wait, can run past `day_limit: 4`. If the day limit then ends the contract, keeping your word loses it, which rule 4 forbids. Fix: a seeded test with both delays at limit 4, or set limit 5.
> - **The second contract's hire comes before the letter card** (§6), yet Evan and Sefa hire because of the letter. The hire's prose needs one DM line per end deed, saying the cause aloud. It must also hold the offer back for the road card, or the DM makes it twice.
> - **The dawn letter is written aloud on every `letter_*` variant**, including when Hesta is then taken on. The note must say whether it is sent. If it is, the walked path leaves a lie in Saltmouth, and A3's carter must carry the truth against it.
>
> **4. Status:** the page stays open. Lev owes fixes on M4, M5, M10 (the bribe), the day limit and the sum. Stas owes rulings on B1, B3, B4, B5 and A3/B6. I owe the tells, Wilf's fact (given above) and the scribe's detail (B10; proposed: «огрызок карандаша за ухом», a pencil kept beside the pen). Vera has read neither the revised §13 nor the dawn card. That read is owed from the thread before PR 7.

### Open after these reads

Not fixed in this PR, on purpose: the design has been revised twice in one evening, and half of what is left turns on Stas's answers in §15. The next revision, after those answers, owes:

1. `the_post_again` after the scribe's death (Zoya M4): `unless: killed_ansel` and a variant with another man at the door.
2. The opening card's third choice (M5): cut to two choices, or give it a different outcome.
3. `keeps` and `breaks` on the bribe choice (M10).
4. The day limit against two delays on the real road: a seeded test at limit 4, or limit 5.
5. The sum on the card («по два золотых»): from the ledger, held by a test, or cut.
6. `page_gone` written with no reader on the path without `named_the_sender`: a marker, or owed.
7. The second contract's hire before its letter card: one DM line per end deed, and the offer held back for the road card.
8. Whether the dawn letter is sent when Hesta walks on.
9. Vera on the dawn card, in order with the other two.

## 15. Questions for Stas

**A. Mechanism, scope and exit.** The scope's §8 points here for every question but the stake, which Stas answered.

1. **`settle`, the one new effect, with its event `escort_dismissed`** (§8). Without it the post must be the destination, where no scene is played. Recommended: accept; additive.
2. **The pressure chain:** later, as its own content PRs after this exit; Zoya agrees, and it is the reader A5 waits for. Yan prices both ways in scope §7.
3. **After the real road, who comes?** As the scope's exit row 1 stands, nobody, and `walked_to_the_dyke` is heard nowhere. Zoya: a second contract, on a carter's spoken word, with no offer. Mine: accept, as one more opening card, `word_from_the_dyke`; the row becomes "the letter exists only when the family was left at the post".
4. **"Object, never block."** Recommended: by a line of temperament on each AI player's card that holds on any contract and names nothing of this one (rule 14), and otherwise the vote as the engine has it. The exit counts, on the offer card, each AI vote that differed from the human's and whether the card went against the human's word. If it did, a card field for whose word decides is the next question.
5. **The second family's end is written and unread.** Zoya: a debt, not a cut. Mine: the same; owed on her board to the pressure chain.
6. **The bench reaches a night card** (§12, Yan's gap). Recommended: yes, before the first contract's content. Declined, the dawn card is first read live in the all-AI half.
7. **Exit row 5.** Recommended: Stas plays both contracts (Yan's A), because his own answer at the book is what comes back. Yan's B, the first only, saves 6 USD and 25 to 40 minutes and leaves the return across contracts to the AI half and the seeded tests.
8. **A second new place on the map, the old ferry landing** (§5), new in this revision. The second contract needs two draws before the post, for the opening and for Garth's door, and the salt road as drawn gives one. Recommended: accept; it is where the lore already ends the road, and it changes `salt_road`'s far end, which no pack on main uses. The other way puts both cards in one pile, where the DM picks one and the other is never shown. Also, a rule I followed where the rulebook is silent: a deed id may say the truth because no player view carries one (Zoya queues it as bible 4).

**B. Zoya's questions. Hers, then mine; the plot is hers and yours.**

1. **Hesta's tie to the brothers.** Zoya: their widowed sister, the coat her late husband's. Mine: accept; it holds in all four bridge states.
2. **Whose post.** Zoya asks: the lord's or the old salt house's; either way the scribe must not read as Dame Kell's kin. Mine: the lord's, as scope §1 says; one power to explain, not two.
3. **`salt_on_credit` paid at the hire.** Zoya: one DM line per deed in the hire's prose. Mine: yes; four lines, no card.
4. **`gave_another_name` and `gave_no_name` are read only the same night.** Zoya: owed across contracts. Mine: one note line on `letter_from_the_post` (the offer comes for the name in the book), no card; otherwise it stays owed.
5. **The page that is gone gates in silence.** Zoya: the table must hear a cause. Mine: one more card, Garth at his open door, in the pile with `named_the_sender` and `page_gone`. (The two deeds are already one.)
6. **The carter's word brings the wage Hesta owed.** Zoya: yes; it is the only cause the table hears for the Dyke. Mine: yes, if a card can settle an owed wage through the ledger; PR 8 checks, and if it cannot, that is a question back, not a `gain`.
7. **Maren at the fence.** Zoya: let her offer Embra's words at the grave, a choice with a cost. Mine: as her line in the note now; as a third choice once something reads it.
8. **Ilsa argues for the wage.** Zoya: four views, not one. Mine: yes; each AI player speaks its own view, and A4 still decides the vote.
9. **The cost of "name nobody", seen before the choice.** Zoya: one clause from the scribe, «крыша тем, кого записали». Mine: yes; a stake is visible when the choice is made.
10. **The scribe's remembered detail.** Zoya: knitted oversleeves. Mine: not that one, it reads as a clerk of the last century; another detail of his trade, hers to pick.
11. **Also hers to settle:** the names (Hesta, Wilf, Garth, Ansel, Evan and Sefa are her working names); the details behind the three tells (her candidate for `the_yard`: the Council's stones, gone by morning); the grave (hers: Hesta's); what the carter knows of Wilf; the book card's length, about 135 words against her 120.

For the content PR, not here: the table's own words that Vera asked about, which are on main and not this design's (the route line's glyphs, «подряд кончается», «Солтмут»).
