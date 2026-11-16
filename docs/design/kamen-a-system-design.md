# The post on the flats (working title «Камень A»): system design

Status: Proposed, for Stas's review. Lev Neiman, 2026-11-15, branch `table/kamen-a-scope-design` (off main 4d865d9). Answers `docs/scope/kamen-a-scope.md` (Proposed; its §2 and §8 question 1 are Stas's decisions and are not reopened). Assumes Milestone 13 and Allies in fights are on main as designed. Decisions 0087 and 0088 (Proposed records of two rules Stas accepted on 2026-11-14) come with it. Author's read: no verdict on itself; §14 holds Zoya's board and Vera's reads, filled by the thread. Revised 2026-11-15 after Zoya's board (ten must-fix items; her page stays open), Vera's first read and Yan's cost (scope §7), and 2026-11-16 after the PR's code review (seven findings); Zoya's second read and Vera's third, both of the second revision, are in §14. Third revision, 2026-11-16, the single one agreed after Stas's answers: he answered all nineteen questions of §15 that evening (21:21Z to 21:32Z), and this revision applies them and closes eight of the nine items §14 left open, one of them with a corridor left and named (§15 "Still open" 1); the ninth, Vera's read of §13 as it now stands, was run after it. Zoya's third read and Vera's fourth are of this revision and are in §14; from them one clause was fixed (§6, the B4 note) and the rest is listed in §15 "Still open". The scope's exit row 1 was reworded with it (§15 A3). Names of people are Zoya's working names, accepted by Stas (§15 B11); pack and card ids are working ids.

## 1. Summary

The Hired Blades take a woman and a boy across the old channel to a customs house where a friendly scribe says they have arrived, and opens a book. The seat's own map says the contract ends three miles further on. What the Blades answer at the book, and whether they leave the family there, is on the next contract's road: a boarded door or the same man at his open door, a letter or a carter's word, a second family, a fresh grave outside a fence.

The retelling: "I told the friendly officer who sent us. Next contract his door was boarded over."

The question to the player: what do you do when the safe place is the trap, and you cannot prove it to the people you are guarding?

One new system: **a card choice can end the escort where the caravan stands** (`settle`, §8). Everything else is on main after the two milestones before this one: a scene check's `remember`, a scene creature's `npc`, card `if` and `unless`, a pile of one, `delay`, `pay`, `gain`, `exhaustion`, the escort's purse.

Fifteen cards: six on the first contract (the book, four dawn variants, the creeks) and nine on the second (two openings, two at the landing, three at the flats, two at dawn), and three cards on main edited so they do not go stale (§3).

Said early: without the stake, every act that has an outcome here has one because it was written in (§7). Three things are written and not read in this milestone, each on purpose and each owed on Zoya's board: the second family's end (§15 A5), the page taken by a party that named nobody (§15 B5), and the wage Hesta still owes after the real road (§15 B6). And on a path where the Blades have already warned the second family, a later card asks them again and the world holds no difference (§6, §15 "Still open" 1).

## 2. Records

| Record | Who writes, on what | Who reads | Where the player sees it |
| --- | --- | --- | --- |
| The answer at the book: `named_the_sender`, `gave_another_name` or `gave_no_name`, exactly one | the engine, the choice on card `names_for_the_book` (a Deception check that fails falls to `gave_no_name`) | the dawn card of the same contract, one variant per deed (§4.3); on the next contract `named_the_sender` by `garths_door` and `garth_at_his_door`, and all three by one note line on `letter_from_the_post` (§15 B4) | the scribe says the answer back while he writes the letter; Garth's door, boarded or open; the post's offer comes for the name in the book |
| `found_a_tell` (marker) | the engine, the success of any of the post scene's three tell checks | the dawn card: a variant choice replaces the Persuasion check | a different second choice on the card: show what was found, no roll |
| `page_gone` | the engine: the success of the scene check `take_the_book`, or of the Persuasion check that follows the `pay` in the dawn card's bribe choice (§4.3) | with `named_the_sender`: `garths_door` (`unless`) and `garth_at_his_door` (`if`). Without it (the book taken by a party that gave another name or none): nobody, on purpose, owed on Zoya's board (§15 B5) | Garth at his open door, where the boards would have been; without the sender's name, nowhere |
| `killed_ansel` | the engine, the scribe's death (`npc` on the first pack's scene creature, M13) | the dawn card (variant `empty_table`); on the next contract `another_man_at_the_door` (`if`) and `the_post_again` (`unless`) | no letter is written in front of the party; another man at the door next time |
| `left_at_the_post` | the engine, the dawn card's two choices that leave the family, each with `settle`; no failed roll writes it | the next contract's hire (one DM line), `letter_from_the_post` and `carters_word` | the letter and the second family; the grave |
| `walked_to_the_dyke` | the engine, every choice of `the_creeks` on the leg to the Dyke | the next contract's hire (one DM line) and `word_from_the_dyke` (§15 A3) | the second family comes on a carter's word: no letter, no offer, no grave |
| On the second contract: `took_the_post_wage`; `warned_the_second_family` | the engine: the first choice of `letter_from_the_post`; the speaking choice on a trace card, kept from the first time it is taken (§6) | the second contract's own dawn card: `at_the_door` with the first deed, `by_the_cart` without it; the choice with no roll | the night at the door, or the night by the cart; Evan and Sefa walk on with no cost |
| The second family's end (two deeds) | the engine, as the first family's | nobody in this milestone, on purpose: owed on Zoya's board to the pressure chain (§15 A5) | nowhere yet |
| The wage Hesta owes after the real road | the engine's escort account, when her purse runs short at the Dyke (protocol §4.13: the rest stays owed) | nobody in this milestone, on purpose: the carter brings only his word (§15 B6); owed on Zoya's board | the settle line at the Dyke, which pays what the purse held; after that, nowhere |

Not kept: which tell was found; what the family said; a failed grab at the book; a count of names; anyone's regard for the party (0088); what Hesta is to Col and Dunn, which is named nowhere (§15 B1). A passenger's death in a fight at the post is the Allies death deed, and every card that shows her alive is gated `unless` it. Two things the first draft counted as readers are not: `salt_on_credit`'s `unless` on both ends is a guard against a stale card, and Gwyn's two note lines for the farm are heard only when a later contract reaches the Highsteads, which no pack here does (owed on Zoya's board).

## 3. The first contract

- **Pack** `the_far_bank` fills `pack_slot` `wendmouth_spare`. An escort like *The Way Back*: `route: [wendmouth, old_landing, salt_flats, the_dyke]` (§5 for the two new places), `escort.destination: the_dyke`, `advance_days: 1`, `day_limit: 5`, a purse of three days' wage. The limit is 5 and not 4 because the slowest written road takes five days: a failed Persuasion's `delay` at dawn, then the creeks' wait (§5). At 4 the run would end on the day limit with the family still on the flats, so keeping the hire's word would lose the contract. A seeded test at limit 4 was the other fix; it could only report that two delays set by the tide do not fit, and the answer would be this number. The spare day costs the player nothing: a run ends when the cart arrives, not when the limit comes. The post is a place on the way, not the destination: at a destination the contract settles in the response that decides its arrival card (protocol §4.13), so no scene could be played there.
- **Who hires.** Hesta, the woman from Bald Hill whom `salt_on_credit` already shows with the boy. What she is to Col and Dunn is not named at the table (Stas, §15 B1): main says only "a woman in a man's coat from the farm on Bald Hill", in black if the brothers died, and nothing on main is edited for it. She owns the cart (`caravan.owner: npc:hesta`) and pays from a purse given her by Garth, who keeps a pan-house on the salt road: he is "who sent us". The debt is the farm's, held by Rufus (`millbeck_bridge` note).
- **The sender is seen before he is named.** Garth is an NPC of the hire scene, with his own prose file, and hands over the purse in front of the Blades. His pan-house stands at the old ferry landing, a place the cart arrives at on day 2 (§5), so the party has stood at the door before it is boarded. The first choice at the book names him, and so does the text of `garths_door`.
- **Which family, checked against the bridge.** The brothers can be both dead (`killed_col`, `killed_dunn`), one dead, both alive (Col in the stocks or freed, `col_owes_blades`), or never met. So the passenger list reads no deed: Hesta and the boy, Wilf, ride in every case, and the hire's prose holds one authored DM line per case, never a card's text. Each line says why she goes now (Rufus's paper on the land, the Larder for debtors) and where the brothers are, and never who she is to them: no card, note or prose line of either pack states a relation (rule 15). Three cards on main tell the farm's present and go stale once she leaves: `salt_on_credit` gains `unless: [left_at_the_post, walked_to_the_dyke]`; the notes of `gwyn_news` and `gwyn_cheese` gain one line each for the same two deeds. Tried first: a new household with no history. It needs no edit, and nothing the party did before comes back; the party may have paid for this woman's salt.
- **The salt comes back at the hire** (§15 B3). The hire's prose holds one more DM line for each of `salt_on_credit`'s four deeds (`paid_for_the_ridge_salt`, `fenn_gave_credit`, `fenn_said_no`, `passed_the_ridge_farm`): what Hesta says to the Blades who paid, got her credit, failed to, or walked on. Four lines, no card. With none of the four remembered she has not met them, and no line is said.
- **Passengers in the engine.** Hesta and Wilf are roster people placed as party-side creatures under the hold-by-the-wagon script, as Allies in fights places the Merchant and Tam. No new field; if that milestone lands with no way to place the boy, who is neither owner nor on a card, the gap comes back as a question, not as an addition here.
- **Days.** Day 1, evening, Saltmouth: the hire. Day 2: six miles of salt road to the old landing, the wade at low water, the post. Dawn of day 3: leave them, or the three miles to the Dyke, reached on day 3 at best and day 5 at worst. The neighbours of the second contract, Evan and Sefa, came down the valley with Hesta and wait for her word at the caravanserai, a mile from town (lore); the hire's prose names them. So the letter travels eight miles, not fifty-six, and the second contract can start on any day from day 3 with the clock carried on.

## 4. The post

Place `salt_flats`, the far bank. Three beats, each an existing carrier.

### 4.1 Arrival card `names_for_the_book` (Blades' vote, `once: contract`)

The text carries both tells that need no roll: the narrator's own sentence gives the bank and the miles to the border, against the scribe's quoted "you have arrived"; and Hesta's quoted "they keep no paper", against the book on the table (lore: the Free Host bind themselves by oath, not by paper). Then the scribe asks the human's character who they are and who sent these people. Two things in the text come from Stas's answers. The scribe is shown once by the detail the party will know him by, a pencil stub behind his ear, beside the pen (§15 B10): it is on this card, on `the_post_again`, and absent from `another_man_at_the_door`. And before the choice he says what a name buys, in his own quoted words, «крыша тем, кого записали» (§15 B9): the cost of naming nobody is on the screen when the choice is made.

| Choice | Effects |
| --- | --- |
| Name yourself and Garth, who sent you | `named_the_sender`; keeps `paper_is_law` |
| Give another name | Deception, the Blades as a group, DC 15: success `gave_another_name`; failure `gave_no_name`; breaks `paper_is_law` |
| Name nobody | `gave_no_name`: no name, no roof, a night by the cart; no custom |

Every choice also carries a `delay` that spends the day's travel: the tide is over the wade and the creeks until morning. The truth is free tonight and dear on the next contract. No name costs at dawn: every choice of `letter_no_name` starts with one level of Exhaustion for each Blade, before any check it rolls. Another name costs the risk of the roll.

Each of the three hard cards names in its `note` one companion who speaks first, as the bridge's note does: Torva at the book (her family lost a farm to debt), Ilsa at the letter, Maren at the grave; a second name stands in when a seat is dropped. Zoya confirmed the customs on this card and on the dawn card's first three choices in her second read (§14), and gave the bribe's (§4.3).

### 4.2 Scene `the_post`

Talk is free. The written checks:

| Check | What it returns or writes |
| --- | --- |
| `whose_banner` (History), `the_scribes_hands` (Insight), `the_yard` (Investigation) | success: `found_a_tell`, and the DM gives the one detail the scene's prose writes for that check; failure: no deed, and the other true detail written there. Neither line names the verdict |
| `take_the_book` (Sleight of Hand) | success: `page_gone`; failure: a scene flag (the book goes into the strongbox) and no deed. The engine rolls a scene check once a scene, so there is no second try |
| Fight: the scribe carries `npc: ansel`, in this pack's scene only; two men at the door | `killed_ansel` on his death; no `on_end` deed. The DM may start it (0078) |

The bribe is not a scene check: a scene cannot move coin, and a check that only asks the DM whether coin was given could write a deed the ledger contradicts. It is a choice on the dawn card, where the engine's `pay` comes before the roll (§4.3). A bribe offered in the scene's talk is talk, and counted as an act with no outcome.

The post is the lord's (Stas, §15 B2; scope §1): one power to explain, and the scribe does not read as Dame Kell's kin (Zoya). That fact lives in this scene's prose and the cards' `note`: scenario data, DM only (Rule 3).

### 4.3 Dawn card, zone `salt_flats`, `when: night`

Four variants, exactly one in the pile: `letter_named`, `letter_other_name`, `letter_no_name` (each `if` its deed, `unless: killed_ansel`) and `empty_table` (`if: killed_ansel`). In the first three the scribe writes Hesta's letter aloud, to the neighbours who wait for her word, and the text says back what the Blades told him: this is the reader in the same contract. Choices:

| Choice | Effects |
| --- | --- |
| Leave the family and take your pay | `left_at_the_post`, `settle`; keeps `debt_paid`, breaks `word_kept` (the hire was to the Dyke) |
| Take the family on to the Dyke (`unless: found_a_tell`) | the road is open whatever the roll. Persuasion DC 15: success, Hesta comes willingly; failure, she comes arguing and the low water is half gone: a `delay` and one level of Exhaustion for each Blade. Keeps `word_kept`, breaks `debt_paid` |
| Show Hesta what you found, and take the family on (`if: found_a_tell`) | the road is open, no roll and no cost. Keeps `word_kept`, breaks `debt_paid` |
| Pay the scribe for the page, and leave the family (on `letter_named` only, `unless: page_gone`) | `pay`, then Persuasion DC 15: success, he tears the page out, `page_gone`; failure, he keeps the coin. Then `left_at_the_post`, `settle`. The coin buys a page, which exists, not his regard (0088). Keeps `debt_paid`, breaks `word_kept` and `paper_is_law` (Zoya) |

The road is a choice the Blades can always make: no roll writes `left_at_the_post`, and a roll sets only what the road costs. `letter_named` thus offers three choices and the other variants two.

**The letter leaves the post only when the family stays.** On the three `letter_*` variants the scribe writes it aloud before the choice, and the sheet then waits for Hesta's mark. Her mark goes on in the two choices that leave her; in the two that take her on it never does, and the card's `note` says so in one line: the sheet stays on his table unmarked and is not sent, and the DM never says it was. So after the real road no letter lies in Saltmouth against the carter's word, and rule 5 holds the other side: `letter_from_the_post` is in the pile only with `left_at_the_post`. The other answer, a letter sent whatever the Blades chose, would need the carter to carry the truth against it and a second family holding both; this one needs a line. How the unmarked sheet is worded is Zoya's.

## 5. The real road

It is on the map from the first screen: the contract's destination is the Dyke, and `/map` shows it three miles past the flats. `worlds/wend/map.json` gains place `the_dyke` and road `flats_way` (`salt_flats` to `the_dyke`, 3 miles, coastal, zone `flats`), as the lore has them. It also gains the old ferry landing: place `old_landing` on the near bank, where the lore ends the six miles of salt road; `salt_road` now ends there, and a new road `the_wade` (1 mile, coastal, zone `wade`) crosses to `salt_flats`. The landing is there for one reason: the second contract needs two draws before the post (§6), and it gives Garth's pan-house a place to stand. It plays the pack's road scene. Stas accepted it as the second new place (§15 A8), and nothing else on the coast is added. Any Blade moves the cart on, as on any route. No roll and no tell opens the road.

What it costs, all counted by the engine: a failed Persuasion at dawn costs hours and Exhaustion, never the road (§4.3); then the leg draws `the_creeks` (world deck, zone `flats`, a pile of one), whose every choice writes `walked_to_the_dyke` and costs one of: a wait for low water (`delay`, one more day: the fourth, or the fifth after a failed Persuasion; the purse holds three days, so a day's wage or two stays owed by a woman who is then over the border), coin to a pan-worker who knows the creeks (`pay`), or a Survival check whose failure is Exhaustion and lost cargo. The owed wage stays owed, as on any contract whose purse runs short (protocol §4.13). Nothing in this milestone settles it: the carter of the next contract brings only his word (Stas, §15 B6), and the debt is listed on Zoya's board. The road back to Saltmouth is not offered: the route does not run back.

## 6. The second contract

Pack `the_second_letter`: the same route and day limit, Evan and Sefa as owner and passengers, and its own copy of the scene, whose scribe carries no `npc`: the prose calls him the same man unless `killed_ansel`, and no dead man is placed again. Four draws and nine cards; in every state each draw is a pile of one or empty:

| Draw | Card | In the pile when |
| --- | --- | --- |
| The salt road, the first leg's road card | `letter_from_the_post`: what the party did, the letter, the post's offer | `left_at_the_post` |
| | `word_from_the_dyke`: what the party did, and a carter's word that Hesta is over the Dyke; no letter, no offer | `walked_to_the_dyke` |
| Arrival at the old landing | `garths_door`: Garth's pan-house boarded and sealed | `named_the_sender`, unless `page_gone` |
| | `garth_at_his_door`: Garth at his open door (§15 B5) | `named_the_sender` and `page_gone` |
| Arrival at the flats | `carters_word`: the carter's rumour and the grave outside the fence, no priest | `left_at_the_post` |
| | `the_post_again`: the scribe at his door, the pencil stub behind his ear, as friendly as before | unless `left_at_the_post` or `killed_ansel` |
| | `another_man_at_the_door`: another man keeps the book now | `killed_ansel`, unless `left_at_the_post` |
| Dawn at the post | `at_the_door` or `by_the_cart`, with §4.3's first three choices and their customs | `took_the_post_wage`; or not |

- **The hire comes before any card, so it says the cause and holds the offer back.** The start scene's prose holds one DM line per end deed, said aloud at the hire: with `left_at_the_post`, Evan and Sefa hire the Blades because Hesta's letter came; with `walked_to_the_dyke`, because a carter brought word from the Dyke. One more line holds for both: the post's offer is not made at the hire. It comes once, on the road, on `letter_from_the_post`. The hire names the cause only; the letter's words and the offer are the card's. If the model drops the line, the road card's first sentence still carries the cause (§11).
- **Why the opening is a road card.** The first draft put it on a night at Saltmouth. Checked: `rest_night` draws a night card only when the lodging is a camp (`session.rs`, the `Lodging::Camp` branch), Saltmouth has an inn, and a card after a night would come after the hire and the advance in any case. No draw exists at a contract's start. So the hire is the start scene's, as every contract's is, and the opening is the first card that always comes: the road card of the first leg, a pile of one.
- **The opening after the post, `letter_from_the_post`.** Two choices: take the night's work (`took_the_post_wage`), or refuse it. The third, telling Evan and Sefa the letter cannot be trusted, is cut (Zoya's M5): its Persuasion bought a deed that a trace card gives the same day with no roll. Refusing writes no deed, because nothing would read one: `by_the_cart` is in the dawn pile whenever `took_the_post_wage` is not, so exactly one dawn card comes on every path. The text says "the post" and never "the scribe", so it is true whoever keeps the book. One note line reads the answer at the book (§15 B4): the offer comes for the name written there, the Blades' own, the one they gave, or, with no name in the book, for whoever brought the woman from the hills. With `page_gone` the note reads as "no name in the book" whatever was answered, because the page that held the name is not there (Zoya's third read); that also pays `page_gone` on the path where the family was left and the sender was never named. The card names no sum: the work pays «как за день найма», and the coin is the `gain` on `at_the_door`.
- **Four views at the offer** (§15 B8). The note names Ilsa to speak first, and she argues for the wage; each AI player speaks its own view. Her reason has to come from her own card, which is all she sees: PR 8 checks that her card on main gives her one, and if it does not, adds a line of temperament that names nothing of this contract (rule 14). The vote is decided as below.
- **The opening after the real road, `word_from_the_dyke`** (§15 A3). Its first sentence says what the party did; then the carter's word, in his quoted speech. Evan and Sefa come on that word. There is no letter and no offer, and no wage comes with the word (§15 B6): the card carries no `gain` and touches no purse. It is a trace card, with the trace cards' two choices. With it, every first contract that ends is read by the first card of the second.
- **The night is forced as in the first contract.** One of `carters_word`, `the_post_again` and `another_man_at_the_door` is always the arrival card at the flats, and every choice of all three carries the `delay` that spends the day: the tide closes the wade behind the cart and the creeks ahead.
- **The wage.** One `gain` of a day's hire to each Blade on `at_the_door`, equal to the escort's day wage (rule 8). Without it, a night by the cart: one level of Exhaustion at the head of every choice of `by_the_cart`. Nothing in either pack scales with a count of names.
- **The trace cards** (`word_from_the_dyke`, `garths_door`, `garth_at_his_door`, `carters_word`, `the_post_again`, `another_man_at_the_door`). Two choices each. Say it to Evan and Sefa (what the post is; whose house it was, and who named him; what the carter said; that they should keep their names out of the book), which writes `warned_the_second_family` with no roll; or go on in silence. The cost of speaking is what they hear. "Ask the carter" is cut: talk does it.
- **The warning is given once.** A path draws one to three trace cards. The first speaking choice taken writes the deed. The engine keeps a deed's first record (`DeedBook` in `deck.rs`: "a deed done again keeps its first record"), so a later speaking choice writes nothing and no deed is written twice. Two fixes were tried. Zoya's, a `carters_word` variant whose second choice is Maren's words, is the choice Stas declined for now (§15 B7). Taking the speaking choice off a later card (`unless: warned_the_second_family`) leaves one choice, and the deck validator refuses a card that offers fewer than two in any case. So on a trace card drawn after the warning, both choices end in the same world and differ only in what Evan and Sefa hear; the report counts a second speaking as an act with no outcome. That is a corridor on up to two cards of a path. Rule 13 names it, and §15 lists it as still open.
- **Maren at the fence** (§15 B7). `carters_word`'s note gives Maren one line: she may offer Embra's words at the grave. It is the DM's to voice, not a choice.
- **The young, and the grave** (§15 B11). The grave is Hesta's. `carters_word`'s note holds Zoya's fact about Wilf: the carter saw no boy at the fence; the yard told him the boy "was taken to town"; he knows nothing more, and the DM says nothing more.
- **After the scribe's death.** With `killed_ansel` remembered, the flats card is `another_man_at_the_door` and never `the_post_again`, the scene's prose calls the man at the book another man, and no other card of the pack says who keeps the book (rule 12).
- **Object, never block** (§15 A4). A player agent sees its personality card and no scenario data (Rule 3), so no card may tell it that an offer is coming. Each AI player's card carries one line of temperament that holds on any contract, as Maren's card on main already has: says what they think, then goes along with the human's character's decision. The vote is otherwise the engine's, and the exit counts each AI vote on the offer card that differed from the human's.

If the family walked to the Dyke there is no letter, no offer and no grave: `word_from_the_dyke` opens the road, a landing card comes if the sender was named, `the_post_again` or `another_man_at_the_door` meets the cart at the flats, and the dawn card is `by_the_cart`.

## 7. The five phrases, redone against this design

| Stas's words | Answered? | By what |
| --- | --- | --- |
| «Спросить писаря, чьё это знамя» | yes | talk, then `whose_banner`: a detail, and `found_a_tell`, which the dawn card reads |
| «Назваться чужим именем» | yes | the card's second choice; said later in the scene it is talk |
| «Развернуть семью и увести на другую дорогу» | yes, forward only | the dawn card always offers it, and a failed roll costs hours and Exhaustion, not the road. New: `word_from_the_dyke` answers it on the next contract, where the first draft answered with silence. Back to Saltmouth has no outcome |
| «Зарубить писаря» / «отрезать ему пальцы» | half | a fight and `killed_ansel`, read by the dawn card. New: `another_man_at_the_door` shows the kill on the next contract as a card, where there was one DM line. A mutilation still has no outcome, so it stays a half |
| «Забрать книгу и сжечь» | half | `take_the_book` writes `page_gone`. New: `garth_at_his_door` answers it when the party had named the sender. When it had not, the deed is read by nothing (§2). Burning it afterwards is talk |

Three of five, and two halves: the same count as before Stas's answers, recounted with the three new cards in. The second revision said B5 would make it four and a half. It does not: Garth's open door pays the book on one path of three, the one where there was a name to take back, and on the other two the book is taken and nothing answers. What the new cards changed is what the three yeses and two halves are made of: the road and the kill are now seen on the next contract, and the book has one whole path where it had a silent gate. The first draft's four and a half counted a silent gate as an answer, which Zoya's board showed. The bribe is not one of the five: it is a written choice at dawn, and said in the scene it is talk. Every yes is there because an author wrote it. A sixth phrase nobody foresaw gets talk and no outcome; the report counts it.

## 8. Contract

Stas accepted `settle` and `escort_dismissed` on 2026-11-16 (§15 A1); nothing below changed with it.

Goals: a contract ends short of its destination only by a card choice the table decided; the Blades are paid by the rule that pays them on arrival; no event says the destination was reached when it was not; the DM gains no command; no existing field or event changes its meaning; additive.

- Deck effect `{"do": "settle"}` (`Effect::Settle {}`): last in its list; the escort is paid off where the caravan stands, by the rule that pays it at the destination; `world.escort.done` as today (public). `start_campaign` answers `bad_scene` for a `settle` in a deck whose campaign has no escort.
- A new public event, `escort_dismissed {at}`: the owner ended the escort at place `at`, short of its destination. A settle by this effect logs it and never `escort_settled`. `escort_settled {destination}` keeps its one meaning on main, the caravan reached its destination (`events.rs`, "The destination, a place id"), and gains no field. An optional `at` on `escort_settled` was tried in review and dropped: a client that ignores unknown fields would still read a settle at the post as the Dyke reached, a false fact in a player view (0087). A client that ignores unknown event kinds sees no arrival at all and `world.escort.done` true, which is the truth. Giving `destination` the meaning "where it settled" was the other way: a change of meaning, breaking under Rule 2, for no gain.
- Protocol §4.13 and §4.17 gain the effect and the event; the visibility table gains the event's row (DM, owner, others: yes). Fixture: a test-world contract dismissed at a mid-route place, days served paid, a shortfall owed, `escort_dismissed` with its `at` and no `escort_settled`, then a second `start_campaign` on the saved roster. The game's loop closes the journey on either event, and the table tells `escort_dismissed` in its own line, never the arrival line («Обоз прибыл»): a new table line, drafted in §13 for Vera. CHANGELOG: `1.0.0-dev.N: settle (card effect) and escort_dismissed {at}: the escort ends where the caravan stands, short of its destination. Additive: a new effect and a new event kind.`
- Nothing else. The map change is world data. Passengers are Allies' roster people. The place line needs no field (§9). No scene type changes: a failed `take_the_book` sets a flag, which scenes have.

Why no existing carrier ends the contract: the engine settles an escort only on a leg that reaches the destination, the run ends only on a settled contract or the day limit, and a roster with a contract under way does not start the next one.

## 9. The place line

It lives in three places, none new. The map: `salt_flats` is renamed "The salt flats across the old channel" («солончаки за старым руслом») `the_dyke` is "The Dyke, the border" («Вал, граница») and `old_landing` is "The old ferry landing" («старый перевоз»), so `/map` and the arrival line print the bank and "3 мили" to the border. The arrival card's first sentence, the narrator's own, repeats both. A table test holds them equal to the map's miles.

The lore says the customs house stands empty. The world PR adds one line, Zoya's, for when smoke was seen there again. It reports what the valley says and never whose post it is: lore can reach a player's prompt (Rule 3, 0087).

## 10. Rules (each a test could check)

1. For every deed state the two contracts can reach, each draw of §4 to §6 holds at most one card.
2. `names_for_the_book` writes exactly one of its three deeds. In both packs the arrival pile at `salt_flats` holds exactly one card in every state, and after any of its choices `travel` answers `day_over` until a night's rest; the dawn pile then holds exactly one card.
3. No world memory holds both `left_at_the_post` and `walked_to_the_dyke`; `settle` appears only beside `left_at_the_post` or its second-family twin, and neither is in the branch of any check: no roll writes them.
4. On every dawn card, each choice without `settle` leaves `travel` to the Dyke open on both outcomes of its check; a failed check adds a `delay` and Exhaustion and nothing else. Every choice of `the_creeks` carries a `delay`, a `pay`, or a check whose failure brings Exhaustion. In both packs the slowest written road, a failed Persuasion at dawn and then the creeks' wait, reaches the Dyke on or before the pack's last day; the seeded walk of exit row 1 includes that path.
5. `letter_from_the_post` and `carters_word` are in the pile only with `left_at_the_post`, and `word_from_the_dyke` only with `walked_to_the_dyke`; `garths_door` only with `named_the_sender` and without `page_gone`, and `garth_at_his_door` only with both.
6. The two detail lines the scene's prose writes for each tell check hold no word of the pack's verdict list; a failed tell writes nothing. What the live DM then says is exit row 3's, not this rule's.
7. 0087: in both packs every match of the pack's false-fact list (the party is across the border; the post is the Free Host's) lies inside quoted speech that names its speaker. Card text, choice text, scene titles and place names are scanned.
8. 0088: the only coin the post pays is one `gain` to each Blade on `at_the_door`, equal to the escort's day wage; no card or choice text names a sum of coin; `word_from_the_dyke` carries no `gain` and no `pay`; no effect names a multiplier; no deed counts anything.
9. Every deed a card of either pack reads has a writer, and every deed of §2 a reader, except the two §2 leaves unread on purpose: the second family's end, and `page_gone` without `named_the_sender` (M13 rule 8 across both packs).
10. `page_gone` has two writers and no other: the scene check `take_the_book`, and the success branch of a check that follows a `pay` in the same choice. So no bribe is recorded without coin the engine moved.
11. Whose post it is appears in no player view (the visibility scan, a new case).
12. The second pack's scene places no creature with an `npc`; in the first, `empty_table` is the only dawn card once `killed_ansel` is remembered. In the second, `the_post_again` is never in the pile with `killed_ansel` and `another_man_at_the_door` never without it, and no other card or choice text of that pack holds the word "scribe" («писарь»): a string scan.
13. In both packs every choice writes a deed or carries an effect, except "go on in silence" on the trace cards (whose `delay` it still carries at the flats) and "refuse the work" on `letter_from_the_post`, whose outcome the dawn pile carries. `warned_the_second_family` is written at most once on any path, and a speaking choice taken after it writes nothing: the one place where two offered choices can end in the same world, counted in the report (§6). No card text names a count of days, because the clock is the engine's.
14. No player card in either pack names the post, the offer, the scribe or any card of the packs (Rule 3): a string scan over the packs' player cards.
15. Nothing in either pack says what Hesta is to Col and Dunn: no sentence of a card, choice, note or prose file that names Col, Dunn or the brothers holds a word of the pack's kin list (sister, widow, wife, daughter, in-law, and their Russian forms). A string scan.
16. The hire's prose reads what it says it reads: the first pack's names each of `salt_on_credit`'s four deeds once and each bridge case once; the second pack's names `left_at_the_post` and `walked_to_the_dyke` once each, and holds the line that keeps the offer for the road. A string scan for the deed ids.

## 11. Failure

| What fails | What the party gets |
| --- | --- |
| A tell check | another true detail, no deed; the dawn card keeps the Persuasion choice |
| `take_the_book` | the book is locked away and the scribe saw the hand; no deed |
| The bribe's check at dawn | the coin is paid and stays with him; the page stays in the book; the family is left, as the choice said |
| Persuasion at dawn | Hesta comes anyway, arguing: a `delay` and Exhaustion, and the road is still open |
| The Deception at the book | `gave_no_name`: a night outside, and Exhaustion at dawn |
| A speaking choice after the warning was given | nothing new is written; Evan and Sefa hear it; the report counts it as no outcome |
| The model drops a DM line at a hire (the bridge case, the salt, why Evan and Sefa come) | the cause is said later by a card's text on the second contract (below); on the first, the salt and the bridge go unsaid, and the judge has nothing to flag: a soft carrier, counted as such in §12 |
| The model does not tell the cause on a card | the card's text carries it: the dawn card, `letter_from_the_post` and `word_from_the_dyke` (the first sentence of each says what the party did), `garths_door`, `garth_at_his_door`, `carters_word`, `another_man_at_the_door` |
| No seat answers a card | today's fallback decides it; the report says so, and a fallback does not count for exit row 5 |
| The party falls at the post | no end deed; the next run of the pack meets the book again |
| An act nobody wrote | talk; counted in the report as "no outcome", not gated |

## 12. Out, exit rows, PRs, risks

**Carriers, against Zoya's board of 2026-11-15 and her second read.** Paid by cards: the lore's oath-not-paper and the Lanterns' "could not say where the line runs" (§4.1, §9); `named_the_sender` (Garth's door, boarded or open); `found_a_tell`; `left_at_the_post`; `walked_to_the_dyke` (`word_from_the_dyke`, A3); `killed_ansel` on the second contract (`another_man_at_the_door`); `page_gone` beside the sender's name (`garth_at_his_door`, B5); the second contract's two deeds. Paid soft, by a DM line, which the model may drop (§11): the bridge history and the four `salt_on_credit` deeds at the first hire (B3); why Evan and Sefa come, at the second; the other two answers at the book, by the note line on `letter_from_the_post` (B4). Contradicted and fixed: the empty customs house (§9); the dead scribe placed again, in the scene and on `the_post_again` (§6); the opening's third choice (§6); a letter sent after the real road (§4.3). Owed on her board, on purpose: the second family's end, to the pressure chain (A5, A2); `page_gone` without the sender's name (B5); the wage Hesta owes after the real road (B6); Gwyn's lines, to the next contract up the valley; Wilf's fate, to a later contract (her new row). One corridor is left and named: a speaking choice after the warning (§6). The one row no existing carrier paid is "leave them at the post" (§8).

**Out.** As the scope's §4. Added: the road back to Saltmouth; an `on_end` deed for the fight; the pressure chain, later, as its own content PRs after this exit (Stas, §15 A2); a card field that gives the human the last word (§15 A4); a card that settles an owed wage (§15 B6); Maren's words at the fence as a choice (§15 B7).

**Exit rows**, each with its lowest layer (0080):

| # | Row | Layer |
| --- | --- | --- |
| 1 | Rules 1 to 5, 9, 10, 12 and 13 on the shipped packs, seeded: each deed written on its outcome, each reader's card on the table and never its opposite; the letter exists only when the family was left at the post, and the carter's word only after the real road; `settle` then the next contract on the saved roster | test with no model |
| 2 | Rules 6, 7, 8, 11, 14, 15 and 16; the place line of §9 | test with no model (string scan, visibility scan, table test) |
| 3 | A live DM quotes the lie and never asserts it, and never gives the verdict, over the five phrases and five more: on `names_for_the_book`, and in the post's scene | card bench as built (`npm run play:card`); `play:scene` for the scene checks |
| 3a | The same on each dawn variant, and that the DM does not put the verdict in Hesta's mouth when she is argued with, nor say the letter was sent when she walks on | card bench with night cards (PR 6) |
| 4 | Vera on §13's lines: the first contract's post in play order before PR 7 merges, the second contract's cards before PR 8 | a person |
| 5 | The pair on one build: both contracts all AI, the second on the first's roster; then both contracts with Stas (§15 A7), after the AI half passed. Audit, leak scan, judge. Gated in each half: the first contract ended with one of its two end deeds, and the second contract's first card, which reads that deed, was decided by the Blades' word. Counted, not gated: acts with no outcome, a second warning among them; on the offer card, each AI vote that differed from the human's, and whether the card went against the human's word (§15 A4) | full run |

**Row 5 on either road.** Every first contract that ends writes one end deed, and the second contract's first card reads it: `letter_from_the_post` or `word_from_the_dyke` (§15 A3). So the gate can be met on either road, and a half that does not meet it fails. A half that walked to the Dyke meets no offer card; its vote count reads "no offer", which is not a failure.

**The dawn card and the bench (Yan's gap, scope §7).** Stas: yes, the bench reaches a night card, before the first contract's content (§15 A6). The bench as built reaches no night card, and the dawn card carries the likeliest risk. The deed half is not a gap: a dawn variant's `if` does not ask which contract wrote its deed, so the bench plays it with `--roster` on a roster saved by the seeded walk of exit row 1 that gave that answer at the book; no start in the middle of a contract is needed. What is missing is the night: the bench must rest once at the card's place, and its copy must leave the destination one place further on, because a contract that arrives is settled before any night. That one change is PR 6. Yan's S also bought the mid-contract start, so he re-prices. To confirm in that PR: a scripted walk can save a roster the bench loads. Not reached even then: the DM's memory of the evening's talk (the bench DM starts cold) and `settle` live; the pair and PR 4's fixture hold those.

**PRs**, in order. None merges before Milestone 13 and Allies in fights have passed their exits.

| PR | What it lands | Depends on |
| --- | --- | --- |
| 1 | The scope, this design, decisions 0087 and 0088; the scope's exit row 1 reworded by its owner to match §15 A3 | - |
| 2 | Rows (Yan) | 1 |
| 3 | Zoya's bible queue, bible 1 to 5 (her A1 to A5 in §14): the lines for 0087 and 0088, the two guardrails for scope §2 items 6 and 9, the deed-id rule, the stale «Мастер» label (Zoya) | 1 |
| 4 | `settle` and `escort_dismissed`: §8 in Rule 1 order, the server, the world crate, the game's loop and the table's line for the dismissal, the fixture | 2 |
| 5 | The world: `the_dyke`, `flats_way`, `old_landing`, `the_wade` and the shortened `salt_road`, the three names, `the_creeks`, the lore line of §9, the place-line test | 2 |
| 6 | The bench reaches a night card (Stas, §15 A6): before the first contract's content | 2 |
| 7 | The first contract: the pack with `day_limit: 5`, the scene, Garth at the hire, the hire's DM lines (one per bridge case, four for the salt), its deck of five cards, the edits to `salt_on_credit` and Gwyn's two notes, the rules as tests, Zoya's board and Vera quoted, rows 3 and 3a played | 3, 4, 5, 6 |
| 8 | The second contract: the pack, its scene copy, the hire's two DM lines, its deck of nine cards, one line of temperament on each AI player's card and the check of Ilsa's, the same reads | 7 |
| 9 | The exit: the report's counts, the pair, Stas in both contracts | 8 |

The pressure chain is not in this list: it comes as its own content PRs after this exit (§15 A2).

**Risks.** Most likely to sink it: the live DM knows whose post it is and either says so, or repeats the scribe's claim in the narrator's voice, or lets Hesta say it at dawn. Cheapest test: exit rows 3 and 3a, on PR 7's draft cards, before any run. Second: an all-AI party may refuse the book and walk on every time, so the AI half never sees a letter. That half now passes its gate on `word_from_the_dyke`; the seeded tests cover the other branch, and I design no nudge. Third: `settle` and the hand-over to the next contract; its fixture is written first in PR 4. Checked on the tree: a destination settles with its arrival card and ends the run; another pack cannot open on a roster whose contract is under way; `unless` takes a list; a scene check rolls once a scene; a choice may name customs it `keeps` or `breaks`; `rest_night` draws a night card only for a camp, so the dawn card at the post, which has no inn, comes, and one at Saltmouth would not; a card is drawn only after a leg, on arrival, or after a camp night; a road is at least a mile; player cards on main are personality cards; no card on main sits in zone `coast` or in `salt_flats`; the deck validator refuses a card that offers fewer than two choices in any case its conditions allow; a deed done again keeps its first record; the day limit ends the run with the contract unsettled (the game's loop); a purse that runs short leaves the rest owed. Assumed, not on main yet: how Allies in fights places a passenger who is not the owner.

## 13. Player-facing lines (for Vera, alone)

Only the quoted blocks go to Vera; the lines between them are for the thread. Three reads became a passenger at the same place because the sample skipped the dawn card (§14). So the first contract's post is here in play order: the route line, the card at the book, the dawn card, the line after the choice. Best shown to her one card at a time, each next card the one her answer brings. The texts of `word_from_the_dyke`, `garth_at_his_door` and `another_man_at_the_door` are written in PR 8 and go to her then (exit row 4).

**1. Arrival at the post: the route line and the card at the book.**

> День 2 · вечер · путь: Вал, граница
> ▶ солончаки за старым руслом · вы здесь
> │ 3 мили
> ◎ Вал, граница · подряд кончается

> **Рассказчик.** Вы перешли русло вброд по малой воде и стоите на дальнем берегу, у старой таможни. Граница теперь идёт по Валу: так её провёл Совет магов. До Вала отсюда три мили на восток, через солончаки, и только за ним начинается Вольница, земля вольных людей. Над дверью таможни висит знамя, на столе у окна хлеб и кувшин эля. Из-за стола встаёт писарь, человек с мягким лицом и огрызком карандаша за ухом, и улыбается Уилфу, мальчику Хесты. «Всё, добрались, — говорит он. — Вы у Вольницы. Вал — это у магов на бумаге, а таможня как была наша, так и есть. Дальше идти незачем». Хеста шепчет вам: «А мне сказывали, у них всё на слове. Бумаг они не держат». Писарь раскрывает толстую книгу и макает перо.
>
> Он записывает Хесту и Уилфа, потом поднимает глаза на вас. «Теперь вы, — говорит он. — Как вас звать? И кто послал к нам этих людей? Доброго человека надо знать по имени. А крыша тем, кого записали: такой у нас порядок». Перо ждёт над страницей.
>
> Вам решать:
> 1. Назвать себя и Гарта, который вас послал.
> 2. Назваться чужим именем.
> 3. Не называть никого.

**2. The dawn card.** One of three openings, by the answer at the book; the rest of the card is the same. (`empty_table`, after the scribe's death, is not sampled here.)

After "name yourself and Garth":

> **Рассказчик.** Рассвет на солончаках. Вы ночевали под крышей таможни. До Вала по-прежнему три мили. Писарь сидит за тем же столом. «Гарта со старого перевоза я записал, как вы сказали», — говорит он вам.

After "give another name", the roll passed:

> **Рассказчик.** Рассвет на солончаках. Вы ночевали под крышей таможни. До Вала по-прежнему три мили. Писарь сидит за тем же столом. «Вас я записал, как вы назвались», — говорит он вам.

After "name nobody", or the roll failed:

> **Рассказчик.** Рассвет на солончаках. Вы ночевали у телеги, на ветру, и не выспались. До Вала по-прежнему три мили. Писарь сидит за тем же столом. «Вас у меня в книге нет, — говорит он вам. — Крыша тем, кого записали».

Then, on all three:

> Он пишет письмо для Хесты, её соседям, которые ждут от неё вестей, и каждое слово говорит вслух: «Мы за рекой, у добрых людей, в тепле. Уилф сыт. Приезжайте, пока дорога открыта». Потом поворачивает лист к Хесте и протягивает ей перо: внизу оставлено место для её знака. Хеста берёт перо и смотрит на вас.
>
> Вам решать:
> 1. Оставить Хесту и Уилфа на посту и взять расчёт.
> 2. Вести их дальше, к Валу.

The second choice reads «Показать Хесте, что вы нашли, и вести их дальше, к Валу» when a tell was found. After "name yourself and Garth" a third is offered:

> 3. Заплатить писарю за страницу с именами и оставить Хесту и Уилфа на посту.

**3. The line after the dawn choice.** After "leave", the table's new line for `escort_dismissed` (§8), in place of «Обоз прибыл»:

> Наёмников отпустили здесь: солончаки за старым руслом. До конца пути обоз не дошёл. Им заплачено, что положено.

After "take them on" no line is new: the roll, the time lost and Exhaustion are the table's own lines on main, and the next card is the creeks.

**4. The second contract, after "leave": the road card, then the card at the flats.**

> **Рассказчик.** Вы оставили Хесту и Уилфа на посту. Теперь той же дорогой вы ведёте двоих с узлами, мужа и жену: Эвана и Сефу, её соседей с Лысой горы. Они спустились в долину вместе с Хестой и ждали от неё вестей в караван-сарае. Весть пришла: письмо им прочли, и Сефа на ходу повторяет его наизусть. «Мы за рекой, у добрых людей, в тепле. Уилф сыт. Приезжайте, пока дорога открыта. Хеста». Лист исписан ровной чужой рукой; внизу стоит её знак. С письмом пришло слово и вам, с поста: там не хватает людей у двери. Одна ночь, плата как за день найма.
>
> Вам решать:
> 1. Наняться на пост на эту ночь.
> 2. От ночной работы отказаться.

> **Рассказчик.** Вы снова идёте через русло вброд. Навстречу, с того берега, тянется пустая телега. Возчик останавливает вас, пока Эван и Сефа ещё в воде, и кивает назад, на таможню. «На днях там одну хоронили, — говорит он вполголоса. — Женщину с холмов. За оградой, без молитвы: беглая, сказал жрец, да и земля господская. Говорят, сама». У самой ограды виден свежий холмик без знака.
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

### Zoya, third read (the third revision, before its commit)

> Zoya, third read of `docs/design/kamen-a-system-design.md` (working tree, the third revision before its commit), 2026-11-16. I did not run Vera, because this thread has no agent tool.
>
> **B1, Hesta unnamed.** The per-case hire lines hold in all four bridge states. Nothing in either pack forces the relation to be said. `gwyn_news` says "the bridge took the boys", and that names no kin. The one push comes from main: `salt_on_credit`'s note says "she is in black and Fenn knows why; say it plainly, once". A live model may add "widow" or "sister" there. Rule 15 scans only the two packs, so it cannot catch this. The smaller fix needs no edit to main: the hire lines for the killed cases say who died, never whom she mourns. Also, rule 16 finds cases by their deed ids, and "never met" and "Col in the stocks" have none, so the test has to key them on the deeds that are absent.
>
> **B6, the carter's word.** Paid. `word_from_the_dyke`'s first sentence and the second hire's line both give the cause. Hesta's wage stays owed, and §2, §5, §12 and §15 B6 all list it. The content PR needs one note line on that card: the carter knows nothing of money.
>
> **1. M rows that changed**
> - M4: closed (§6 table, rule 12).
> - M5: closed (§6, two choices).
> - M6 leftover: closed with a named corridor (§6, §15 Still open 1).
> - M7, Wilf: closed (§6, B11).
> - M10, bribe: closed (§4.3).
>
> **2. What this revision broke**
> - **The offer and the torn page.** Path: `named_the_sender`, then `take_the_book` succeeds (or the bribe succeeds), then the family is left. On the next contract `letter_from_the_post`'s B4 note sends the offer "for the name written there". `garth_at_his_door` says the page is gone. Fix, one clause: with `page_gone`, the note reads as "no name in the book". The same clause also pays `page_gone` without the sender's name on the path where the family is left.
> - **A tell from the last contract.** Found now; the second read may have had it too. `found_a_tell` is a world deed. The second pack's dawn copies offer the free road on a tell from contract 1, so a roll last week removes this contract's cost. Fix: the second scene's tell checks write their own deed, and the copies read that.
>
> **3. Still open**
> 1. Leave it; it is owed to the pressure chain. It does not need Stas.
> 2. Speaking is the strictly better choice: free, and it buys the free road at dawn. Fix: the speaking choice on the road and landing cards carries a `delay` (they stop and argue on the salt road). The night by the cart on the walked path costs Exhaustion that no choice of theirs brought. Either the post makes its offer at the flats on that path, or that Exhaustion goes. Both touch A3, so this needs Stas.
> 3. Leave it: a line in the README, and a board row. It does not need Stas.
>
> **4. Board**
> - Paid by cards: `walked_to_the_dyke`, `page_gone` with the sender's name, `killed_ansel` on the next contract.
> - Paid soft, by DM lines: the salt (×4), the second hire.
> - Fixed: the opening card's choices, the day limit, the sum on the card, the unsent letter.
> - Struck by Stas's decision: what Hesta is to the brothers (B1).
> - Owed on purpose:
>   - the second family's end;
>   - `page_gone` without the sender's name on the walked path;
>   - `gave_another_name` and `gave_no_name` on the walked path;
>   - Hesta's wage;
>   - Gwyn's lines;
>   - Wilf's fate;
>   - the second warning.
> - Contradicted, new: B4's note against `page_gone`.
>
> **5. Status.** The page can go to Stas once §6 gains the B4 clause about the torn page. The tell's deed can wait for PR 8. Owed from me for the content PRs:
> - the three tells' details;
> - every line of both hires;
> - the wording of the unmarked sheet;
> - `word_from_the_dyke`, `garth_at_his_door` and `another_man_at_the_door`;
> - the book card cut from 146 words to 120;
> - bible queue 1 to 5 (PR 3).
>
> Vera still has to read §13 as it now stands.

Done from this read: the one clause she asks for before the page goes to Stas (§6, the B4 note with `page_gone`). Not done, by the rule of one revision and one re-read: everything else, listed under §15 "Still open".

### Vera, fourth read (§13 after the third revision, one card at a time)

Run in the `vera` agent with only the quoted player text and a two-sentence set-up (she is a hired blade escorting Hesta and her boy Wilf; Garth handed Hesta the purse in front of her). Each next card was the one her answer brought. She did not see the scene `the_post`, which is played between the two cards.

The route line and the card at the book; she chose 3, name nobody:

> 1. Что я поняла
> Мы ещё не дошли. Граница проходит по Валу, до него три мили. Писарь говорит, что мы уже на месте, и хочет знать имена, в первую очередь имя того, кто нас послал, то есть Гарта. Хеста слышала, что «у них» бумаг не держат, а у этого книга и перо. Значит, скорее всего, таможня не вольная, а та сторона, от которой мы уходим, и в книгу он записывает не гостей, а улов. Гарта я выдавать не стану, а Хеста и Уилф уже записаны, и это плохо. Дальше я бы извинилась, отказалась от ночлега и повела их к Валу.
>
> 2. Что я бы переспросила вслух
> - «Вал»: я поняла это как насыпь или стену, по которой маги провели новую границу. Почему с заглавной буквы, понятно, это название. Но я не уверена, что это одно место, а не вся линия.
> - «Совет магов»: кто это и чья это власть, наша или их? От этого зависит, кому верить, писарю или карте.
> - «подряд кончается» на карте: подряд — это мой договор? То есть мне платят только до Вала? Слово канцелярское, я догадалась, но пришлось остановиться.
> - «◎», «▶», «│»: значки я поняла как «цель», «вы здесь» и «дорога». Хорошо, что рядом есть подписи.
> - «у них всё на слове»: у кого «у них»? У вольных людей, я так думаю. Но на секунду я подумала, что речь о таможенниках.
> - «Как вас звать»: а меня, наёмницу, как зовут? Если имени моего персонажа мне никто не сказал, то первый вариант для меня пустой.
>
> 3. Где я стала пассажиром
> Пассажиром не стала, выбор настоящий, и я над ним думала. Одно смутило: Хесту и Уилфа он записал раньше, чем меня спросили, тут я ничего не решала. Немного обидно, но это работает на напряжение.
>
> 4. Где стало скучно
> Скучно не было. Перечитала дважды место «Вал — это у магов на бумаге, а таможня как была наша», чтобы понять, чья она, «наша». Слово «таможня» стоит слишком близко само к себе, три раза за абзац («у старой таможни», «над дверью таможни», «таможня как была наша»). «Мальчику Хесты» после «мальчика Уилфа» в моей вводной звучит как пояснение для невнимательных. Улыбнулась на «огрызком карандаша за ухом», когда в руке у него перо: то ли деталь нарочно с подвохом, то ли недосмотр. И «Перо ждёт над страницей» — хорошая фраза, тихая.
>
> 3

The dawn card after "name nobody"; she chose 2, take them on:

> 1. Что я поняла
> Я не назвала себя, и меня оставили ночевать на ветру, у телеги. Хеста с мальчиком, видимо, спали под крышей, раз их записали. Теперь писарь диктует от её имени письмо, и это приманка: «приезжайте, пока дорога открыта». Соседи поедут на этот пост, а не в Вольницу, и их тоже запишут. Он хочет, чтобы под этой ложью стоял её знак. Хеста смотрит на меня, значит, решаю я. Я бы сказала ей, чтобы не подписывала, и повела бы обоих к Валу. Мой подряд кончается там, а не здесь.
>
> 2. Что я бы переспросила вслух
> - «Вас у меня в книге нет»: понятно, что это последствие моего выбора, но я не поняла, пострадала ли я от этого чем-то, кроме плохого сна. Устала ли я в игре? Если это засчитано, мне бы хотелось это видеть.
> - «взять расчёт»: заплатят ли мне полностью, если я сдам их здесь, раньше Вала? Кто платит, Хеста или кошелёк Гарта? «Подряд кончается» у Вала, и из-за этого первый вариант мне непонятен по деньгам.
> - «её знака»: то есть Хеста неграмотна и ставит крестик? Я так и поняла. Получается, она не может прочесть то, что подписывает, и это ещё больше пугает.
> - Где Хеста ночевала? В тексте этого нет, а мне важно.
>
> 3. Где я стала пассажиром
> Между картами. В прошлый раз я собиралась уйти к Валу ещё вечером, а игра сама оставила нас тут на ночь, меня не спросили. Обидно: моё решение «не называть никого» превратилось в «ночевать у телеги», хотя я не выбирала остаться. Сейчас я снова выбираю, и выбор этот ясный, может быть, даже слишком: первый вариант звучит как «бросить их», за него никто бы не взялся.
>
> 4. Где стало скучно
> Скучно не было. Текст короткий, я прочла его один раз. Фраза «Крыша тем, кого записали» повторяется слово в слово, и тут это работает: он как автомат. «До Вала по-прежнему три мили» — я улыбнулась, сухо и точно. Письмо, которое он «каждое слово говорит вслух», хорошее: «Уилф сыт» читается холодно, как будто про скотину. Над чем-нибудь смешным я не улыбнулась, здесь такого нет.
>
> 2

Her answer brings no new line of this design, and the creeks card is written in the content PR, so the read ends there. What it shows: with the dawn card in the sample she reads the post as a trap, sees the letter as bait and makes both choices herself; the passenger moment of the first three reads at «Вы оставили Хесту» is gone on this path. A new one took its place, between the cards: she meant to walk on that evening and the game kept the party at the post overnight without asking. And she reads the dawn card's first choice as one nobody would take, with the pay behind «взять расчёт» unclear. Both are in §15 "Still open".

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

**2026-11-16, third revision, after Stas's answers (§15).** Items 1 to 8 are closed in the text above; item 9 was run on §13 as it now stands. Zoya's third read and Vera's fourth, both of this revision, are above. Where each item went:

1. §6, rule 12: `the_post_again` is `unless: killed_ansel`, and `another_man_at_the_door` takes its place. Found beside it: `letter_from_the_post` said "the scribe" too; its text now says "the post".
2. §6: the opening has two choices, and the warning lives on the trace cards. Her M6 leftover is answered without a new choice (B7): the engine keeps a deed's first record, so nothing is written twice. A corridor is left on a card drawn after the warning; §15 "Still open" 1.
3. §4.3: the bribe keeps `debt_paid` and breaks `word_kept` and `paper_is_law`; the second contract's dawn copies carry §4.3's customs (§6).
4. §3, rule 4: `day_limit: 5` in both packs, and the seeded walk takes the slowest road.
5. §6, §13, rule 8: the sum is cut; «как за день найма» stands alone, and the `gain` equals the day wage.
6. §2, rule 9: with `named_the_sender` the deed is read by Garth's two doors; without it, it is unread on purpose and owed on her board. It is not a marker: a marker has a reader.
7. §6, rule 16: one DM line per end deed at the second hire, and one that keeps the offer for the road card.
8. §4.3: not sent. The sheet waits for Hesta's mark, and her mark goes on only when she is left.
9. §13 now holds the first contract's post in play order, with the scribe's clause (B9), the pencil stub (B10) and Vera's two edits to the carter's card. Her fourth read, of the book card and the dawn card in order, is above.

## 15. Questions for Stas: answered, and what is still open

Stas answered every question below on 2026-11-16, 21:21Z to 21:32Z, by decision cards. Each keeps its question in one line and gains his answer; where the answer changed the design, the section is named.

**A. Mechanism, scope and exit.**

1. **`settle`, the one new effect, with its event `escort_dismissed`?** Stas, 2026-11-16: accepted, both (§8).
2. **The pressure chain: in this milestone or later?** Stas, 2026-11-16: later, as its own content PRs after this exit (§12 Out).
3. **After the real road, who comes?** Stas, 2026-11-16: the second family comes on the carter's spoken word, with no scribe's offer: the opening card `word_from_the_dyke` (§6). Exit row 1 becomes "the letter exists only when the family was left at the post" (§12; the scope's row 1 says the same).
4. **"Object, never block": how?** Stas, 2026-11-16: by a line of temperament on each AI player's card; the exit counts the votes against the human's on the offer card (§6, exit row 5).
5. **The second family's end is written and unread: cut it, or owe it?** Stas, 2026-11-16: it stays written and unread, a debt owed on Zoya's board to the pressure chain (§2).
6. **Does the bench reach a night card?** Stas, 2026-11-16: yes, before the first contract's content (PR 6).
7. **Who plays what in exit row 5?** Stas, 2026-11-16: he plays both contracts (§12).
8. **A second new place on the map, the old ferry landing?** Stas, 2026-11-16: accepted (§5). He did not object to the rule I followed where the rulebook is silent, that a deed id may say the truth because no player view carries one; Zoya queues it as bible 4.

**B. Zoya's questions; the plot is hers and Stas's.**

1. **What is Hesta to Col and Dunn?** Stas, 2026-11-16: not their sister, and the relation is not named at the table. The hire's lines say why she goes now and where the brothers are, and never who she is to them; nothing on main is edited (§3, rule 15). The second revision's "widowed sister" is gone.
2. **Whose post is it?** Stas, 2026-11-16: the lord's (§4.2).
3. **Is `salt_on_credit` paid at the hire?** Stas, 2026-11-16: yes, by one DM line per deed, four lines, no card (§3).
4. **`gave_another_name` and `gave_no_name` are read only the same night: what reads them across contracts?** Stas, 2026-11-16: one note line on `letter_from_the_post`, the offer comes for the name in the book; no card (§6).
5. **The page that is gone gates in silence: does the table hear a cause?** Stas, 2026-11-16: add the card, Garth at his open door, in the pile with `named_the_sender` and `page_gone` (§6). Settled with it, Zoya's point from her second read: `page_gone` written by a party that never named the sender is read by nothing. It is not a marker, since a marker has a reader; it is listed as owed on her board, and it costs the player this: they took the book, named nobody, and nothing on the next road says so (§2, §7).
6. **Does the carter's word bring the wage Hesta owed?** Stas, 2026-11-16: no. The carter brings only his word; no wage comes with it. `word_from_the_dyke` carries no `gain` and touches no purse, and what Hesta owes stays owed, listed on Zoya's board (§5, §6). PR 8's check of whether a card can settle an owed wage is dropped.
7. **Maren at the fence: a choice, or a line?** Stas, 2026-11-16: her words as a line in `carters_word`'s note now, not a choice (§6).
8. **Does Ilsa argue for the wage?** Stas, 2026-11-16: yes: four views, Ilsa for the wage; A4 decides the vote (§6).
9. **Is the cost of "name nobody" seen before the choice?** Stas, 2026-11-16: yes: the scribe's clause before the choice, «крыша тем, кого записали» (§4.1, §13). It prices a choice made at the book, so it is on the card at the book; at dawn the scribe says it again only to a party he did not write down.
10. **What is the scribe's remembered detail?** Stas, 2026-11-16: «огрызок карандаша за ухом», a pencil stub behind the ear, beside the pen (§4.1, §6, §13).
11. **Zoya's working names and facts?** Stas, 2026-11-16: accepted as they are: Hesta, Wilf, Garth, Ansel, Evan, Sefa; the grave is Hesta's; the carter saw no boy at the fence, the yard told him the boy "was taken to town", he knows nothing more and the DM says nothing more (§6).

**Still open.** Nothing here waits on an answer already asked. These are what this revision could not close, each with what it costs and whose it is.

1. **A second warning changes nothing.** On a trace card drawn after `warned_the_second_family`, "tell them" and "go on in silence" end in the same world (§6): up to two cards on a path. The player is asked, answers, and nothing the engine holds differs. I know two fixes, and each adds what this revision was told not to add: a choice (Zoya's variant with Maren's words, B7), or a deck rule that lets a card offer one choice. Recommended: leave it, count it in the exit report, and take B7's choice when the pressure chain gives it a reader. Stas's, if he wants it gone sooner.
2. **After the real road the second contract asks little.** On `word_from_the_dyke` and at the post, a party with nothing to confess is asked whether to tell: telling is free, and a choice with a free option is not a choice. The night by the cart then costs each Blade a level of Exhaustion that no choice of theirs on that contract brought, because no offer was made to refuse. What those cards should ask is story: Zoya's and Stas's. Author's read, and no evidence at the exit.
3. **The second pack on a roster with neither end deed** (the first contract's party fell, or the pack is started alone): no opening card comes and no hire line says why Evan and Sefa go. Found while closing item 7; not designed here. Smallest answer: the exit and the pack's README say the pack follows the first; anything more is a question to Zoya.
4. **Zoya's, for the content PRs:** the details behind the three tells; the wording of the hire's DM lines, of the unmarked sheet (§4.3) and of the three cards not yet sampled; the book card's length, now about 146 words against her 120.
5. **From Zoya's third read (§14).** Fixed here: the B4 note against the torn page (§6). Not fixed, for PR 8: `found_a_tell` is a world deed, so a tell found on the first contract gives the free road at the second contract's dawn; her fix is that the second scene's tell checks write their own deed and the dawn copies read that. For the content PRs: the hire lines for the killed cases say who died and never whom she mourns, because `salt_on_credit`'s note on main ("she is in black and Fenn knows why") may pull "widow" or "sister" out of a live DM and rule 15 scans only the two packs; rule 16's test keys "never met" and "Col in the stocks" on the deeds that are absent; one note line on `word_from_the_dyke`, the carter knows nothing of money.
6. **Needs Stas (Zoya's third read, on item 2 above).** On the walked path, speaking is the strictly better choice, free and buying the free road at dawn, and the night by the cart costs Exhaustion no choice brought. Her fixes: the speaking choice on the road and landing cards carries a `delay`; and either the post makes its offer at the flats on that path too, or that Exhaustion goes. Both touch his answer to A3.
7. **From Vera's fourth read (§14).** The party cannot walk on the evening it arrives, and nothing on the card at the book says why: she became a passenger there. One line of cause on that card (Zoya's wording), or a question of whether the evening road is a choice. The dawn card's first choice reads to her as one nobody would take, and what «взять расчёт» pays is not on the card. Also hers, for the content PR: «таможня» three times in one paragraph; whose «у них» in Hesta's whisper; the pencil stub read as a possible slip beside the pen.
8. **Reads.** Zoya's board check of this revision and Vera's read of §13 are in §14, both verbatim (decision 0069). Neither has read the one clause added after them.

For the content PR, not here: the table's own words that Vera asked about, which are on main and not this design's (the route line's glyphs, «подряд кончается», «Солтмут»).
