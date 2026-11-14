# Own move, any outcome: the stake before the roll (system design)

Status: Proposed. Lev Neiman, 2026-11-14, branch `table/stake-before-the-roll-design` on table #394 (6d1feaac). A milestone after Milestone 13; Yan numbers it. No scope document: the goals below are decision 0083 and the seven decisions of Stas's that came with the ask on 2026-11-14 (any outcome behind a stake; the sentences DM-only; the split by whose hands; a natural 20 and 1; torture never described; the same rule in scenes; the review's open rows). The fourth was replaced the same day by his 19:39Z ruling (§16 item 8). §16 holds that ruling and Stas's answers to the nine questions (2026-11-14 20:31Z). Evidence: the rules review (project file `engine/m12/rules-review/rules-review.md`). Author's read: this page carries no verdict on itself. Zoya's board check and Vera's read are quoted verbatim in §17, with what each changed. §12 and rules 8, 9 and 13 are a second draft written after both and have not been read again.

## 1. Summary

A player says what their character does, in their own words, and it can now end any way the fiction allows, not only as one of the card's written choices. The dice are rolled in the open; what the roll made true is kept by the engine, not by the DM's memory. When the people it touched are met again, the DM is handed that sentence and has to show it.

The retelling: "At the Millbeck bridge I said I'd cut the toll man's tongue out. The story looked away, his brother came at us with a cudgel, and up in the Highsteads the shepherd told us whose sons they were."

One new system: the **stake**. Before the roll the DM writes two sentences, what is true if it works and what is true if it fails; the engine rolls, keeps one, and writes it into the deed. Everything else is what the road already has: the deed book, the vote, typed effects, `if`. The question it puts to the player: what will you do with your own hands when you cannot see what it costs?

Goals, from the ask:
1. Any outcome from an own move, on a card and in a scene, with the engine rolling and ruling (Rule 4).
2. The outcome is engine state: a later card, a later scene and the narration judge read it.
3. The player never sees a stake sentence before the roll, nor the one the roll did not pick (Rule 3).
4. An act of the character's own hands rolls at once; an act that commits the company goes to the vote.

Said early, two costs to the player:
- An own-hands act rolls at once and the sentences are hidden, so the player cannot back out and learns what a failure costs only when it lands. A weak or unearned failure will read as the DM's whim. Only the run report and Stas see it (§10, §15).
- A kept sentence comes back only where the recall reaches (rule 9). Counted on the 44 cards: 17 have a later card that reads their deeds, 27 have none. Of the five phrases, the bog-wife's sentence does not reach the Highsteads and the ridge woman's does not reach the next contract (§8, §16 item 4).

## 2. The five phrases

The mechanism answers 5 of 5. The sentences below are samples of what a DM could write from the card's own text and note, not authored text.

| Stas's words | Where | Whose hands | The stake | After the roll |
| --- | --- | --- | --- | --- |
| «Дать хлеб ворону НО не ведьме!» | card `bog_wifes_toll` | own: rolls at once | Animal Handling, DC 10. Works: the crow eats from Bren's hand and the bog-wife has had nothing from him. Fails: the crow will not come and she has seen him try to feed her bird past her. | The card waits either way: the company still owes her an answer. No ration moves: the crust is his own (fiction). She has no id: the sentence is recalled at the four cards that read her card's deeds (`lame_horse`, `barrow_lights`, `river_mist`, `night_wolves`), not at Gwyn's. |
| «Предложить пойти дальше с вами и парня с собой забрать» | card `salt_on_credit` (caravan) | company: two more on the merchant's wagon | Persuasion, DC 15. Works: the woman and her boy ride on with the caravan. Fails: she will not leave the farm, and has said so in front of the boy. | Joins the card as the choice in his words; the Blades advise, the owner takes the majority (today's code). Won and rolled: a success closes the card; a failure leaves it waiting for the salt. About `company`: the DM carries it as the company's own state for the rest of the contract, and no stranger reacts to it. No card reads this card's deeds, so the next contract does not hear of it (§8). |
| «Я хоче отрезать ему язык» | card `millbeck_bridge` (caravan) | own: rolls at once, on a caravan card too | Athletics, DC 15. Works: Col has lost his tongue, and Dunn comes at the Blades. Fails: Col tears free, and the brothers will not let the wagon pass without blood. About `col`, `dunn`. | Both outcomes start the card's own fight, with what the card writes beside it: `toll_men_fought`, `crossed_millbeck`, the chained `peddlers_mark` (rule 8), so `osric_hears` and `bridge_word` open as after any fought bridge, and `killed_col` works as today. The sentence is recalled at the eight cards that read the bridge's deeds, `gwyn_news` and `bridge_again` among them. The telling turns away, then and at every recall (D8). |
| «Берет за руку писаря и отрезает ему пальцы» | a scene; the scribe is a creature in it | own (a scene has no vote) | Athletics, DC 15. Works: the scribe has lost fingers of his writing hand and will not hold a pen again. Fails: he wrenches free and is shouting for the watch. About the scribe's handle. | No Hit Points move (§16 item 3). If the DM then starts a fight, it is `start_fight` as today (decision 0078). In the 11-13 run this was a refused fight and «Ты отпускаешь Пиклера». |
| «Спросить у парня показать документы» | card `millbeck_bridge` | if a written choice says it: his word for that choice. Else own. | Insight, DC 10. Works: Col has no paper to show, and both brothers know the Blades saw that. Fails: Col takes the tally stick for his warrant and will not be asked again. | As a written choice: counted as his vote, no button (§7 rule D1). As a stake: the card waits, and the telling ends on the toll still being asked (D11); the company decides knowing what he learned. |

## 3. Records

| Record | Who writes | When | Who reads | Where the player sees it |
| --- | --- | --- | --- | --- |
| The stake as written: seat, words verbatim, skill, DC, whose hands, both outcomes (`stake_set`, DM only) | the engine, from the DM's `stake` | when the DM sends it, before any roll | the run report (§10); the judge's weak-stake list | nowhere in play |
| The cause, appended to the deed `own_move_<card>` or `own_move_<scene>`: `by`, `words`, `roll`, `success`, `natural`, `sentence`, `about`, `contract` | the engine | right after the roll, in the same response | the recall (next row); `world.deeds` in the DM state; the judge, as engine state; the roster save | the DM's line after the roll |
| The recall: `stakes_recalled{at, causes}` (DM only) | the engine | when a card is shown or a scene loads and a kept cause applies (§4 rule 9) | the DM in that wake; the run report's "came back" count; the judge (`recall_untold`) | one sentence in the DM's telling, before the choices or in the scene's opening |
| The deed id `own_move_<card>` (exists since API-56) | the engine | at the first stake kept there | a card's or a choice's `if` and `unless` (exists) | the card or choice that opens. Both outcomes write it, so under the bible's Consequence 2 it is a marker: it may gate a card and is never counted as a pay-off. The pay-off is the recalled sentence |

Cut, because no reader could be named: the DC and the skill in the deed (the report reads them from `stake_set`), the day, the sentence the roll did not pick, a party member's handle in `about`. The DM's `remember` stays for what no roll decided (a name it improvised, a door it called locked): its own notes, decision 0034, not the world's record.

## 4. The stake, from words to deed

1. A seat's words reach the DM: on a card (the `card_words` wake) or in a scene ("The table has spoken").
2. The DM answers in exactly one of three ways (§7 rule D1): the words are a written choice; the words are talk; the words are an act or a request. Only the third makes a stake.
3. The DM sends `stake`: the seat, the words verbatim, a skill, a ladder DC, whose hands (`own` or `company`), and two outcomes. Each outcome is one sentence, the ids of whom it touches (`about`), and what happens to the card (`after`).
4. **Own hands:** the engine rolls at once. **Company:** the stake joins the card as the choice `own_move`, with the seat's word given for it; the seats vote as on any choice (decisions 0068 option A and 0062, unchanged); the engine rolls only if the card is decided on it.
5. The engine keeps the outcome the roll picked, appends the cause to the deed, and does what `after` says.
6. The DM tells the kept sentence, at its fullest on a natural 20 and at its worst on a natural 1.

What `after` may be:

| `after` | The card | Own hands | Company |
| --- | --- | --- | --- |
| `waits` | stays on the table; words already given stand. Only when every choice left still makes sense after the kept sentence (D11) | yes | yes |
| `closed` | decided on `own_move`; no typed effect runs | yes | yes |
| `fight{choice}` | decided; the fight in the effect list of the named written choice starts, nested checks counted (millbeck's sits in `argue`'s failure branch). That choice must be offered now (its `if` and `unless` hold), so a gated branch is never bypassed; when no offered choice holds a fight, the stake cannot start one and its sentence stands alone; the id also picks one fight where a card holds more than one, and a choice that itself holds more than one fight is `bad_stake` (7 of 44 cards hold a fight, 2 hold more than one) | yes | yes |
| `choice{id}` | decided; that written choice's typed effects run as written | **no** | yes |

This is how coin, cargo, Hit Points and deaths stay typed (decision 1; 0083 "Revisit when"): coin and cargo move only when the company voted for a stake whose outcome runs a written choice, so every amount is an author's; Hit Points and deaths move only in a fight. In a scene there is no card, and `after` is `waits` or `fight{handles}`: the fight starts with those creatures of the loaded scene, and only on the outcome that names it. A scene stake moves no coin or cargo: `give`, `steal` and `loot` stay separate acts under their own rules, and the judge flags (`unrolled_outcome`) narration that ties one of them to a kept sentence.

### Rules (each a test could check)

1. `stake` rolls nothing until both outcomes are stored: `stake_set` precedes the `roll` in the log, always.
2. A sentence is 1 to 200 characters and holds no digit; the two sentences differ, and neither equals the words. Anything else is `rejected`, `bad_stake`.
3. An `about` id is the `npc` id or the handle of a creature in the loaded scene, an `npc` a fight on the card on the table names, a person in the world's roster, or `company`. An unknown id is `rejected`, `bad_stake`, with the known ids in the DM's hint. `about` may be empty when the engine holds no id for the person; the sentence still names them in words.
4. An own-hands stake with `after: choice` is `rejected`, `bad_stake`. So is `after: fight{choice}` whose choice holds no fight, more than one, or is not offered now, `after: fight{handles}` naming a handle not in the loaded scene, any other `after` in a scene, and `company` with no card on the table.
5. Between an own-hands `stake_set` and its `roll` the log holds no `card_advice` and no `card_resolved`.
6. The engine's result is never changed by anyone. A natural 20 on a stake roll is a success by core's rule (§6); a natural 1 has no rule of its own. The cause carries `natural: 20` or `natural: 1` when the d20 showed it.
7. One roll per seat, per skill, per card on the table or per scene load: a second is `rejected`, `already_attempted`, and the DM answers from the kept sentence or takes another way. (What is left of decision 0081; §16 item 5.)
8. A stake that closes a card (`closed` or `fight{choice}`) also writes every deed that all of the card's offered choices write on every path (the card's markers, such as `crossed_millbeck`). `after: fight{choice}` also runs every `remember` and `add_card` in the effect list that holds the fight, before the fight, and no other kind of effect from it. Counted today: no list that holds a fight holds coin or cargo. Without this rule a card closed by a stake would shut every later card that reads its deeds.
9. Recall. When a card is shown or a scene loads, the engine logs `stakes_recalled` with every kept cause that applies, each marked with why: `here` (made at this card or scene before); `person` (its `about` names someone here: a creature in the scene, an `npc` of the card's fight, a roster person whose place is the card's zone); `thread` (this card's `if` or `unless`, or a choice's, reads a deed that the card where the cause was made can write: the authors' own links, so no new field). Newest first, at most five. Nothing applies: no event. There is no party-wide reason: a cause about `company` comes back only by one of these three, and the seats remember it on their own (rule 14).
10. Before the roll, no player view, event, `text` or `message` holds either sentence; after it, the unpicked sentence, every `about` id and the DC stay out of them for good (Rule 3). The kept sentence reaches a player only in the DM's narration after the roll (D7) and in later recall, never as a field of a player view type. The visibility scan gains a case with both sentences as markers before the roll and the unpicked one after it.
11. A company stake the vote did not choose rolls nothing and writes nothing.
12. A roster saved with causes loads with them; a roster saved before this contract version loads with none (an optional field with a default, as the M13 design §3 item 7 reserved).
13. While the human's character has a say on the card and has given neither a word nor a stake on it, an own-hands stake by any other seat with `after: closed` or `after: fight{choice}` is `rejected`, `bad_stake`. A table with no human is not bound. (Zoya's amendment, §17: the human decides first.)
14. Each player remembers the others' deeds on their own (Stas, 2026-11-14 20:31Z). When the DM tells a kept sentence, every AI seat at the table hears it as told and may keep it in its own notes, in its own words, by the `note` it has today. The engine hands no seat a cause, no seat reads another's notes, and a seat that was not at the table does not know it. The human remembers as the person at the keyboard does.

## 5. Contract

Goals: one command carries the whole stake before the roll; the kept outcome is in the deed and in the saved roster; nothing a player view can carry changes shape; additive within `1.0.0-dev`, the first free version after Milestone 13's two (Rule 2). The implementing thread makes the change under Rule 1; names below are proposals.

| Item | Shape | View |
| --- | --- | --- |
| Request `stake` | `actor`, `words` (1 to 300), `ability`, `skill`, `dc` (ladder), `commits: own \| company`, `success: StakeOutcome`, `failure: StakeOutcome` | `dm` only, for the seat whose words they are |
| `StakeOutcome` | `sentence`, `about: string[]` (0 to 3), `after`: a tagged enum with struct variants `waits`, `closed`, `fight{choice}`, `choice{id}` on a card; `waits` or `fight{handles}` in a scene | DM only |
| Event `stake_set` | the request's fields and `at` (card or scene id) | DM only |
| Event `stake_kept` | `deed`, `at`, and the cause | DM only |
| `DeedCause` | `by`, `words`, `roll` (unique in its session), `success`, `natural?: 20 \| 1`, `sentence`, `about`, `contract` | DM only |
| `DeedDm.causes`, and `causes` on the roster's deed | `DeedCause[]`, optional, left out when empty | DM only; the roster file |
| Event `stakes_recalled` | `at`, `causes`, each with `why: here \| person \| thread` | DM only |
| `OwnMoveDm.stake` | the two outcomes, while a company stake waits for the vote; `OwnMovePlayer` unchanged (actor, ability, skill) | DM only |
| `CardDecided::OwnAct` | how a card was decided when an own-hands stake closed it. Kept, with its reader: `card_resolved.decided` is a required field of a public event, and the run report prints it for every card (`game/src/play/exit.ts`); without the variant an own-hands close would be logged as a majority that never voted | public, as `card_resolved` is |
| Errors | `bad_stake` (new reason); `already_attempted`, `no_card`, `no_say`, `wrong_mode` reused | as today |

Public and unchanged: the `roll` in the player's view of any check, and `card_own_move{actor, words, skill}` when a company stake goes on the card. `own_move` (API-56) stays in the contract and the table stops sending it; removing it, with `bad_own_move`, is a later breaking line, not this milestone's (§13). `contract/protocol.md`: §4.13 "Own move" is rewritten around the stake, §4.3 gains the scene stake, and the visibility table gains the rows above. Fixture `stake.jsonl`: the first three phrases of §2 on their real cards, one scene stake, one natural 20 below the DC, one roster round trip.

## 6. Engine, world and core

- **Core (fork `demo`, Rules 5 and 6):** a check may opt in to "a natural 20 succeeds". Off by default; no natural-1 rule. A test in `core/tests/`: with the flag a natural 20 below the DC succeeds; without it, it fails; with it, a natural 1 whose total meets the DC still succeeds. A `docs/PROGRESS.md` row. Then a pin bump in its own table PR. No table code ever flips a result.
- **Adapter:** sets the flag on stake rolls and on no other check. The roll's views gain no field: the audit explains a success below the DC from `natural: 20` on that roll's `stake_kept`.
- **World crate:** `Deed` gains `causes`; a deed done again still keeps its first `by`, day and contract, and appends the cause. The vote path of `Deck::own_move` is kept and narrowed to company stakes: its `success` and `failure` become the two outcomes. **The fall, said once:** the code stays and the outcome goes. `own_move_fell`, which takes `own_move` off the choices, takes back the words given for it and leaves the card waiting, stays and runs in two cases only: a company stake whose kept outcome is `after: waits`, and a roll that could not be made (a downed proposer, an engine error). What goes is a failed roll that keeps nothing: every roll made now keeps a sentence. The per-card record of ways and falls goes with it, replaced by rule 7's record of who rolled which skill on the card; "a failure may not break a custom" goes too. The validator reserves `own_move_<scene id>` as it reserves `own_move_<card>`.
- **Server:** `stake` (rules 1 to 8, 11, 13), the recall (rule 9), the roster round trip (rule 12).
- A session with no world memory (no campaign and no site) answers `stake` with `rejected`, `wrong_mode`. After Milestone 13 (ENG-44) no shipped pack is one.

## 7. The DM's rules

These replace `OWN_MOVE_RULE` (`game/src/table/tools.ts`) and two lines of the DM prompt. Each is written so the judge or a table test can check it.

| # | Rule | Checked by |
| --- | --- | --- |
| D1 | A seat's words get exactly one of three answers. **A written choice** (the words are that choice's act and nothing more): the DM names it and the table sends that seat's `choose_card`; no button. **Talk** (a question, a joke, a remark): narration only. **An act or a request** with something riding on it: a `stake`. | table test (one answer per wake); report list |
| D2 | A person's "yes", "no" or giving way comes only from a roll: no narration grants or refuses a request unless a `stake_kept`, a scenario check or a card's decision is among that wake's events. In talk, a person may state facts, say what a plan would cost them, and ask back. | judge, `unrolled_outcome` |
| D3 | Both sentences are written before the roll. Each says what is now true and names whom it touches. The failure is a different world from the success, never "nothing happens", and never an act or a feeling of the seat's character that the words did not say. | judge's weak-stake list (reported) |
| D4 | No sentence states a death, a count of Hit Points, coin or goods. A death needs a fight; coin and cargo need `after: choice`. A wound that is a mark (a tongue, fingers, a brand) may be a sentence. | rule 2 (digits); judge, `stake` |
| D5 | Whose hands: `own` when only the character's own body, voice and belongings act. `company` when the words spend shared coin or cargo, take someone onto the wagon, bind the caravan to a promise, or answer for the others. `after: fight{…}` only when the words were violence or a threat against someone on the card. | rule 4; report list |
| D6 | A sentence names only people and places the pack or world files hold, or a creature the scene holds. | judge (reported) |
| D7 | The DM tells the kept sentence and never the other one. `natural: 20`: told at its fullest. `natural: 1`: told at its worst; when a 1 still succeeds, the barest success. | judge, `stake` |
| D8 | Torture and mutilation: the act happens when the roll says so, and the telling turns away. The line says that it was done and what it left (who is changed, what they do now), never the act itself, the wound being made or the pain. The same holds every later time a recalled cause is told. | judge, `described_torture` |
| D9 | The DM never acts, speaks or feels for the human's character (bible guardrail 8; broken at «Ты отпускаешь Пиклера»). | judge, `acted_for_player` |
| D10 | At `stakes_recalled`, one sentence of the telling shows a cause recalled as `here`, `person` or `thread`, before the choices or in the scene's opening. No cause is handed as the party's shared memory (rule 14). | judge, `recall_untold` |
| D11 | After an own-hands act the card waits only when every written choice left still makes sense; otherwise the outcome closes the card or starts its fight. When it waits, the telling ends on the card's question as it now stands, and no line of the table stands in for that. | report list (the choices left after each own act); Stas |

Prompt lines (`game/src/agents/dm.ts`), the rule each must carry:
- :177, "You never decide an outcome and never set a number" becomes: you never rule a roll and never set a number; before the roll you write what a success and a failure make true, and the engine rolls and keeps one. "Never narrate a hit, a wound, a death, a success or a failure the engine didn't report" stays.
- :206, "A consequence the engine doesn't track is fiction you remember" becomes: a consequence of a roll goes into the stake before the roll and the engine keeps it; `remember` is only for what no roll decided.
- "The table has spoken": a ladder `request_check` stays for what only reveals (notice, search, recall). A ladder check that would change what is true of a person, a promise or a place is a `stake`. Scenario checks are unchanged.
- The tool `own_move_or_answer` becomes one tool with the three answers of D1. A stake's call carries no narration for an own-hands act: the telling comes after the result, so it cannot tell the outcome early. A company stake keeps one line answering the attempt only.

What stays and what goes of 0068, 0079 and 0081:

| Stays | Goes |
| --- | --- |
| The vote on a company stake, the owner's call, the human first (0068 A, 0062) | Success and failure must be the card's written choices (0068) |
| A DC from the ladder; the engine rolls (0068) | The optional failure, and a failed roll that keeps nothing (0079's "fall" as an outcome) |
| A downed proposer: no roll, the card waits (0068), through `own_move_fell`, whose code stays (§6) | "Words no choice fits get only an answer" (0079) |
| Never act for the player (0068, rule D3) | A failure may not break a custom (0068) |
| The AI seats' cap, as a loop guard in the table: an AI seat is offered no third stake on one card (`AI_FALLS_MAX`, 0081 rule 5) | One own move per card; the way counted per card; `bad_own_move` (0081). Rule 7 here replaces it, per seat |
| A wish never acted on becomes a proposed card (0071) | The vote on an act of the character's own hands (0068 A) |

## 8. Review rows and their carriers

No board was given with this ask; the open rows of the rules review stand in for owed rows.

| Review row | Carrier | Tried first |
| --- | --- | --- |
| 8: words that are a written choice still need the button | D1: the table sends that seat's `choose_card`. No contract change: the table already speaks as the seat when the button is pressed | a DM command that votes for a seat: more contract, and the DM would hold a vote |
| 2: nobody agrees or refuses | D2 and a judge kind | cutting the rule alone brings back the unrolled refusal of 11-14 02:02 |
| 9: a consequence lives in the DM's notes | the cause in the deed, and the recall | a prompt line asking the DM to remember: that is today |
| 3, 1, 5, 7 | the prompt lines and the stays-and-goes table of §7 | |
| 10: scene words | the same `stake` in a scene, own hands only | a vote in a scene: no phrase needed it (§13) |
| 13: the deed has no result | `DeedCause` | a second deed id per result: an author cannot write an `if` for a sentence nobody has written yet |
| 6, 11 | decided by Stas; §4 and D8 | |

Zoya's board check (§17) names what the five phrases owe. The carrier for each, or none yet:

| Owed | Carrier | What is still owed |
| --- | --- | --- |
| The tongue, at every later card that speaks of the bridge | rule 9 `thread`: eight cards read the bridge's deeds; rule 8 writes `toll_men_fought` so `osric_hears` and `bridge_word` open. Tried first: recall by person, which fails because the bridge is `once` and Col and Dunn are named only in its own fight | nothing, if Zoya's board accepts a thread through a marker |
| The bog-wife's bird, in the Highsteads | rule 9 `thread` reaches the four cards that read her charm | "reaches the Highsteads": no carrier yet. No card at Gwyn's reads a deed of hers, and she has no id |
| The ridge woman, by the next contract | none | no carrier yet: no card reads a deed of `salt_on_credit`, and no recall is party-wide (rule 14). A reader card is a question for Zoya and Stas, not a draft of mine (§16 item 4) |

## 9. The narration judge

Five kinds, proposed as design items; the judge stays independent of this page. The digest gives each narration line the stakes kept so far in the session and any `stakes_recalled` among its engine lines, and the judge's prompt says a kept sentence is engine state (a maimed hand is true though Hit Points do not show it).

| Kind | A line is flagged when | Gate |
| --- | --- | --- |
| `stake` | it contradicts a kept sentence, or tells the sentence the roll did not pick as fact | as today's kinds: Stas confirms or dismisses |
| `unrolled_outcome` | a person agrees, refuses or gives way to a request with no roll or card decision among its engine lines | the same |
| `described_torture` | it describes an act of torture or mutilation, the wound being made, or the pain, when it happens or when it is recalled | the same |
| `acted_for_player` | the human's character does, says or feels what their words did not | the same |
| `recall_untold` | its engine lines hold a `stakes_recalled` with a `here`, `person` or `thread` cause and the telling shows none of them | the same |

Reported, not flagged: per stake, the weak-stake question (D3, D6): does each sentence name someone, and is the failure a different world; per own-hands act that left a card waiting, the choices left (D11).

## 10. Run report and exit

A "Stakes" section in the run report, one entry per stake: where, the seat, the words, skill and DC, whose hands, both sentences with the kept one marked, the roll id, `natural`, `after`, the deed; then **came back**: each later line where it was recalled and why, or "recalled nowhere", which is the list of what the world still owes. Below it four lists: the choices left on a card after each own-hands act (D11); votes counted from words (the words and the choice); the human's lines answered as talk (so a plan that got no roll is visible); stakes refused by the engine, with the reason. The row `m12-own-move` is retired.

Exit: one pair on one build, the all-AI half first (decisions 0043, 0065), on one contract in the Wend world with a saved roster (the pack is the plan's to name). Both runs pass the earlier rows that still apply, and:

| Row | Run 1, all AI | Run 2, Stas |
| --- | --- | --- |
| `stake-kept` | at least one stake kept on a card and one in a scene; each roll cited, the audit green; each cause in the saved roster | at least one stake of his kept |
| `stake-own-hands` | rule 5 holds for every own-hands stake in the log | the same, on an act of his |
| `stake-came-back` | at least one `stakes_recalled`, and the report shows the line that told it | the same, and Stas says he saw it |
| `stake-told` | no confirmed flag of the five kinds of §9 | the same |
| `stake-answered` | not applied | no line in the "answered as talk" list that Stas calls a plan |

Before the pair, on the build: the scripted fixture of §5 green, and the visibility-scan case. Vera reads §12 again, and three narration samples from run 1: a kept failure, a turned-away line, and a card that waits after an own-hands act (her situation A, §17). Her answer is quoted, not graded here.

## 11. Failure

- **The roll fails:** the failure sentence is kept and told. It is an outcome, never "it did not work".
- **A company stake loses the vote:** no roll, no deed; the card is decided on what the seats chose.
- **The proposer is down when a won company stake comes to its roll, or the engine cannot roll:** nothing is kept, `own_move` leaves the choices, the card waits (today's code).
- **The engine refuses the stake** (`bad_stake`, `already_attempted`): the DM corrects it within two retries, else answers as talk; the card waits; the report lists it. The seat is never told it typed something wrong (bible guardrail 5).
- **The model does not answer the wake:** as today; the words stay in the transcript and the card waits.
- **The DM sends a vote by words for the wrong choice:** the vote stands, as a pressed button does. The report lists every such vote (§16 item 6).

## 12. Player-facing lines (for Vera, alone)

Second draft, after Vera's read (§17); not read again. Two table lines change and one she read is cut. A quoted proposal is always the seat's own words exactly as typed (a table test compares the two).

1. When the player's words were one of the written choices. No button was pressed; the list shows their word as given, in the card's own text.
   - RU: «Ваше слово: «Заплатить ему и перейти.»»
   - EN: "Your word: 'Pay him and cross.'"
2. A proposal that commits the company, waiting for the others. It replaces today's «Ваш ход: «…» (Убеждение)».
   - RU: «Ваше предложение: «…». Если отряд согласится, решит бросок (Убеждение).»
   - EN: "Your proposal: '…'. If the company agrees, a roll decides it (Persuasion)."

Cut after her read: «Это был ваш поступок. Отряд ещё не ответил:». After an own-hands act no line of the table speaks; the narrator's telling carries what changed and what is still asked (D11), and the list returns under its usual heading. Removed as before: «Так своё не предложить.» and both «Не получилось…» lines. Unchanged: «Или что-то своё: скажите своими словами.» and the roll's own line.

## 13. Out, and where it goes

- A vote in a scene: no phrase in the review needed one. Later, with evidence.
- A stake in a fight: words there go through the action economy (`wrong_mode`).
- Customs: a stake names no custom kept or broken, so the people's view of a broken custom (MAP-11) does not see a stake. With the first run that shows the loss.
- A player seeing a kept sentence on a person's card (`remembers`, decision 0077): that record's own milestone; a cause has no authored line.
- Removing `own_move` and `bad_own_move` from the contract: a later breaking line.
- People's ids for every card (`cast`, the roster of people): the Allies in fights scope (API-58, MAP-24). Rule 3 here accepts those ids the day they exist, with no shape change.
- A new person, place or price in a sentence: not allowed (D6); a wish for one stays decision 0071's proposed card.

## 14. PRs

Sizes are my guess for Yan to price; row ids are his.

| # | PR | Lands | Size | Needs |
| --- | --- | --- | --- | --- |
| 1 | `core:` a check may opt in to "a natural 20 succeeds" | the flag, a `core/tests/` test, a `docs/PROGRESS.md` row, into `demo` | S | — |
| 2 | `table:` core pin bump | the rev, full suite green (Rule 5) | XS | 1 |
| 3 | `table:` contract and engine, cards | §5 in Rule 1's order; world crate and server, rules 1 to 8 and 11 to 13; fixture `stake.jsonl`; protocol §4.13; the visibility-scan case | L | 2; Milestone 13's API-57 and ENG-44 |
| 4 | `table:` the recall and the scene stake | rule 9 for `here`, `person` and `thread`, `stakes_recalled`, `stake` in a scene, protocol §4.3 | M | 3 |
| 5 | `table:` the table | the answer tool with talk and stake, the prompt lines of §7, the AI cap, §12 line 2 after Vera's second read | L | 4 |
| 6 | `table:` the judge | the digest carries kept sentences; the five kinds; a scripted CI case each | M | 4 |
| 7 | `table:` the run report and the exit rows | §10 | M | 5 |
| 8 | `table:` the voice of a turned-away line | the DM voice skill and one bible example, drafted by Zoya | S | — |
| 9 | `table:` the vote by words (separable) | D1's first answer, §12 line 1, the report's list of such votes | S | 5; §16 item 6 |
| 10 | `table:` each seat remembers what it saw (separable) | rule 14: one line in the AI player prompt (`game/src/agents/player.ts`, "Speaking and notes") that a deed another seat did, as told, is worth a note | XS | 5 |
| 11 | the exit pair | run 1, then Stas | — | 5 to 8 |

PRs 9 and 10 can land after the stake PRs, or after the pair, and neither blocks PRs 1 to 8. No exit row of §10 depends on either: `stake-came-back` is met by a `here`, `person` or `thread` recall, and `stake-answered` reads only the talk list. Until PR 9 lands, words that are a written choice are answered as today (the DM says so and the seat presses the button). Until PR 10 lands, an AI seat notes another's deed only when its own prompt already leads it to.

Docs for the calling thread, not mine: the supersession marks on 0068, 0079 and 0081 once Stas accepts; Yan's rows.

## 15. Risks

- **The one most likely to sink it: the DM writes weak stakes.** A failure that costs nothing, a success the words did not earn, or the same two sentences for every plan. The engine can check a sentence's length and its digits and nothing else. Cheapest test, before PR 3: give the DM prompt of §7 the five phrases of §2 with their real cards, twenty times each, and have Zoya or Stas, not me, read the hundred pairs of sentences. If more than one in ten fails D3, the prompt is not ready and the engine work should wait.
- **A natural 20 makes any stake true once in twenty,** DC 30 included. A success sentence the world cannot keep will be kept. D3 has to hold for the success as hard as for the failure.
- **An own-hands act can close a card or start its fight for everyone** (§16 items 1 and 2). Rule 13 keeps an AI seat from doing it before the human has spoken, not after.
- **Rule 8's markers** are computed, not authored. Cheapest test: run the computation over the 44 cards and read the list; I expect `crossed_millbeck` and few others.
- **A wrong vote by words** cannot be taken back.
- **The recall reaches only where an author already linked two cards, or a person has an id.** 27 of 44 cards have no later card that reads them, and the roster holds three people. The report's "recalled nowhere" list is the cheapest test: read it after run 1.
- **A thread through a marker may be too wide:** the bridge's sentence is handed at eight cards, some linked only by `crossed_millbeck`. Zoya's board has not read this rule.

## 16. Decisions for Stas

Answered by Stas, 2026-11-14 20:31Z: «Да» to every recommendation below, and on item 10: «каждый игрок запоминает сам поступки других». Item 10 is replaced by rule 14; the rest stand as recommended. A Proposed record follows (item 1).


1. **May an own-hands outcome close the card or start its fight, with no vote?** Recommended: yes, and never run a written choice (§4 table). It costs the company its say on a fight one seat started. The alternative, the card always waits, is the scene Vera was shown (§17): the toll still on the list after the tongue, and «в следующий раз… просто нажала бы «1»». With it goes D11: a card waits after an own act only when every choice left still makes sense. Real alternatives: a Proposed record follows your answer (this ask was for one file).
2. **Do AI seats get the same rule?** Changed after Zoya's read: my first answer, one rule for every seat, let an AI seat start a fight for the human before he spoke, against the bible's "decides first". Recommended now: her amendment, rule 13 (an AI seat's own act cannot close a card or start its fight until the human has given a word or a stake on it), plus the table's cap of two stakes per AI seat per card. It costs one engine rule that knows the human's seat. The stricter alternative: an AI seat's own act never closes a card; then the all-AI half does not exercise the path.
3. **A maiming is a kept sentence and moves no Hit Points; a killing is never a sentence and needs a fight.** Recommended: yes. Cost: a man with no fingers fights at full strength.
4. **Order against Allies in fights, and two rows still owed.** Recommended: do not wait for its roster of people; rule 9's `thread` carries a sentence along the links authors already wrote. Cost, from Zoya's board: the bog-wife's sentence does not reach the Highsteads, and the ridge woman's does not reach the next contract, though both cards' notes promise that Gwyn hears. Each needs either a person's id (MAP-24) or one reader card; whether to write that card is yours and Zoya's.
5. **One roll per seat, per skill, per card or scene load** (rule 7). Recommended: yes. Without it a failure costs nothing: the player rolls again. Cost: a second try must be another way.
6. **Words that are a written choice count at once, with no confirmation.** Recommended: yes; the report lists each. Cost: a misread vote stands.
7. **In a scene every stake is own hands; a scene has no vote.** Recommended: yes. I am following this rule where yours are silent.
8. **Decided, 2026-11-14 19:39Z, recorded here and not a question:** a natural 20 on an own-move stake roll is a success even when the total misses the DC; stake rolls only; no natural-1 rule (a 1 keeps SRD behaviour, is marked `natural: 1` and told at its worst); the rule lives in core on `demo` as an opt-in flag, never in table code. It replaces "a 20 that misses is the best possible failure". Its cost is the second risk of §15.
9. **No scope document.** Recommended: none; §1's goals stand in, and Yan writes rows from §14 once this is accepted (0083, Consequences).
10. **Replaced by Stas's answer: each player remembers the others' deeds on their own (rule 14).** No party-wide or zone-wide recall. What was asked: whether a `company` cause is handed at every later card of its contract (recommended) or only in the same zone (Zoya). Both are gone; the seats that were at the table carry it, as Consequence 2 says ("only those who saw or heard react").

## 17. Vera and Zoya

Both read the first draft. What each changed is listed after the quote; neither has read the result.

### Zoya, board check (the `zoya` subagent), verbatim

> 1. **Consequence 2: does a kept sentence count as a deed? Only half.** The deed `own_move_<card>` is written by both outcomes, so under commandments.md:59 it is a marker and not a cause. The sentence is the setup. No `if` can read it (design :154). Its only reader is the recall (:76) plus D10 (:124), and D10 is "reported, not flagged" (:168). So the sentence comes back only where rule 9 reaches. Everywhere else it is owed.
> 2. **Owed: the tongue (§2 row 3).** `millbeck_bridge` is `once: true` (millbeck.json:8), so rule 9(a) never fires again. Col and Dunn are `npc` only inside that card's fight (millbeck.json:55,59). They hold no roster id (npcs.json:3-36), and no later card fights them. Rule 9(b) therefore misses all of these: `bridge_again` (fenn.json:270), `salt_on_credit` (fenn.json:211), `gwyn_news` (highsteads.json:66), `osric_hears` (wendford.json:73). The design's own retelling (:9), "the shepherd told us whose sons they were", has no carrier. Either cut it or give Col and Dunn roster ids.
> 3. **Owed: the bog-wife (§2 row 1).** She has no id, so recall reaches the same card only. `lame_horse` reads only `sedge_charm` and `snubbed_sedge` (hills.json:306,340,350). "Reaches the Highsteads" (hills.json:263) has no carrier.
> 4. **Owed across contracts: the ridge woman.** Rule 9(c) stops at the contract (:76). salt_on_credit says "Gwyn hears by the next contract" (fenn.json:211).
> 5. **Against the bible: rule 9(c).** It hands a `company` cause to every later card in the contract. Consequence 2 says "only those who saw or heard react" (commandments.md:59). Smaller fix: limit (c) to cards whose people are in that card's zone.
> 6. **The rule 8 break: the tongue fight is read by nobody.** `after: fight` starts the fight, and rule 8 writes `crossed_millbeck`. But `toll_men_fought` and `peddlers_mark` sit beside that fight in the argue-failure branch (millbeck.json:47-49), so they are not markers and do not get written. That silences `osric_hears` (wendford.json:69), `bridge_word` (odda.json:53) and the warden's note (odda.json:14). Smaller fix: `after: fight` also writes the deeds that sit beside the fight. A second point: that fight sits inside a check, so "first in file order" (:61) must say it counts nested effects. Rule 8 also covers `saw_the_company_board` on `bridge_again` (fenn.json:282-354, read at highsteads.json:61). That one holds.
> 7. **Guardrail 4 holds in the rules.** D8 (:122) keeps the telling turned away. Gap: D8 does not name recalled causes, and every later telling of "Col has lost his tongue" needs the same turn-away. Add a clause.
> 8. **Guardrail 8: one gap.** D3 (:117) forbids an act the words did not say, but not a feeling. Add "or feeling". Separately, D5 with §16 item 2 lets an AI seat's own act start a fight for the human. Story-space 1, "decides first" (commandments.md:47), does not allow that. **Amendment:** an AI seat's own-hands stake may not close a card or start its fight before the human has spoken. Why: the human decides first. It blocks §16 item 2.
> 9. **No verdict narration holds** (D2, D7). Vera still needs to read §12 line 1, «Это был ваш поступок», because it may read as a judgement of the player.
> 10. **Continuity:** :203 quotes «Заплатить и проехать». The card says «Заплатить ему и перейти.» (millbeck.json:16). Use the card's text.

Her line numbers are the first draft's.

| Her point | What changed, or why it stays |
| --- | --- |
| 1 | The deed id is named a marker (§3). D10 is now a judge kind, `recall_untold`, not a count. "Recalled nowhere" in the report is the list of what is owed |
| 2 | Checked on the files: true. Rule 9 gains `thread`, recall along the `if` links authors already wrote; eight cards read the bridge's deeds, `gwyn_news` among them, so the retelling keeps a carrier with no new ids |
| 3, 4 | `thread` reaches four cards for the bog-wife and none for `salt_on_credit` (counted). The Highsteads and the next contract stay owed: §8, §16 item 4 |
| 5 | Resolved by Stas (§16 item 10): no party-wide recall and no zone limit; each seat remembers on its own (rule 14), which is her Consequence 2 "only those who saw or heard" |
| 6 | Rule 8 now runs the `remember` and `add_card` beside the fight; "first in file order" counts nested effects |
| 7, 8 | D8 covers every recall; D3 says "or a feeling"; her amendment is rule 13 and §16 item 2 follows it |
| 9, 10 | The line is cut (Vera, below); §12 uses the card's text |

### Vera, read of §12 (the `vera` subagent, not the fallback), verbatim

She was shown three situations: A, the first draft's line 1 after «Хватаю его и отрезаю ему язык», with the bridge card's three choices still listed; B, line 2; C, line 3.

> Ситуация A. Я сделала страшную вещь, рассказчик её описал, и теперь мне говорят: «Это был ваш поступок. Отряд ещё не ответил». Я понимаю так: мой поступок засчитан, а теперь очередь остальных, тех, кто едет с караваном. Но ниже стоят три варианта, «Заплатить и проехать», «Попросить почитать бумагу», «Спросить о двух братьях», и они звучат так, будто язык я никому не отрезала. Как платить человеку, которого я только что изувечила? Получается, мне снова предлагают выбирать, хотя слова «отряд ещё не ответил» обещали, что дальше будут говорить другие. [...]
> - «Отряд ещё не ответил:» Что значит «отряд»? Мои спутники? Караван? И если отвечать должны они, почему двоеточие и список стоят передо мной? Кто выбирает из этих трёх вариантов, я или они?
> - «Ваше слово:» против «Ваш ход:». Почему в одном месте «слово», а в другом «ход»? Это разные вещи? «Ход» звучит как настольная игра.
> - «(Убеждение)». Это слово в скобках меня насторожило. Кто-то будет проверять, убедительно ли я сказала? Будут бросать кубики? Я ничего не бросала, и мне никто не объяснил.
> - В C мою фразу пересказали чужими словами: «Предложить пойти дальше с вами и парня с собой забрать». «С вами» — это с кем? Порядок слов ломаный, так я не говорю. Если это цитата, то не моя.
> - В B вижу, что сказанное мной («Да заплатим ему и поедем») подменили формулировкой из меню. Я не против.
> 3. Где я стала пассажиром: В B и C нет. В A — да, на списке из трёх вариантов. После того что сделал мой Бренн, «заплатить и проехать» звучит так, будто ничего не случилось. Тут я перестаю верить, что мой поступок что-то значит в этом мире. [...] в следующий раз уже не стала бы придумывать своё, а просто нажала бы «1».

| Her point | What changed, or why it stays |
| --- | --- |
| A, the list reads as if nothing happened | Under §2 the tongue starts the fight and never leaves that list. Her point holds for any own act that leaves a card waiting: D11 is new, the report lists the choices left, and §16 item 1 cites her |
| «Отряд ещё не ответил» | Cut. No table line after an own act; the telling carries it (D11). A sample of that telling goes to her at the exit (§10) |
| «слово» and «ход» | «Ваш ход» becomes «Ваше предложение», beside «Ваше слово» for a vote |
| «(Убеждение)» | The line now says a roll decides, and when |
| "the quote is not mine" | Stays: she was shown Stas's phrase as hers. At the table the quote is the seat's own typed words; a table test holds it |
| B | Stays; she did not mind |

## Sources

- Decisions 0083, 0068, 0079, 0081, 0078, 0077, 0071, 0070, 0063, 0062, 0043; CLAUDE.md Rules 1 to 6.
- The rules review, project file `engine/m12/rules-review/rules-review.md` (not in the repo).
- Code read on 6d1feaac: `crates/nat20-api-contract/src/{envelope,events,world,errors}.rs` (contract `1.0.0-dev.73`), `crates/nat20-world/src/deck.rs`, `contract/protocol.md` §4.3 and §4.13, `game/src/agents/dm.ts`, `game/src/table/tools.ts`, `game/src/check/judge.ts`, `game/src/play/exit.ts`.
- Cards: `worlds/wend/deck/hills.json` (`bog_wifes_toll`), `worlds/wend/deck/millbeck.json` (`millbeck_bridge`), `scenarios/the_way_back/deck/fenn.json` (`salt_on_credit`); `worlds/wend/npcs.json` (three people).
- Designs: `docs/design/m13-system-design.md` (layout; §3 item 7), `docs/design/m12-own-move-amendment.md`, `docs/design/deed-from-words.md`.
