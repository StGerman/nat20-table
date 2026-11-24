# The contract line that bites: system design

Status: Accepted by Stas on 2026-11-23 («Ок по всем»: Lev's recommendation on all three questions in §10). Lev Neiman, 2026-11-23, branch `table/contract-line-that-bites`, main 958f389. No scope: the goals are Stas's decisions of 2026-11-23 (no literacy field, no reading roll; every contract is read aloud to the last line before anyone signs). For the next contract written; the two ready packs keep their terms. Author's read, no verdict on itself. Revised once on Zoya's and Vera's reads (§9); neither has read this revision.

## 1. Summary

On the first evening the merchant reads the whole paper aloud, and its last line says how many days his purse holds. On the road, every choice that loses a day is now a day nobody is paid for. At the gate the purse runs out on a name, and the table quotes the line.

The retelling: "It was in the paper. He read it to us the first evening, to the last line. We stopped a day anyway." The question to the player: what is a day's pay worth, when you know whose name it comes off?

Said early: there is no signing card. Nothing in the engine ends a contract early, so "sign or refuse" would be a card whose choices both sign (question 1).

## 2. The five phrases

| Stas's words | Answered? |
| --- | --- |
| «Что написано в бумаге? До конца.» | Yes: every term, the last line last, no roll |
| «Опоздаем на день: кто платит?» | Yes: the last line says it, the engine does it |
| «Не подпишу, пока не вычеркнет строку» | Half: his reason, from the pack; the line stays |
| «Не подписываю, уходим» | No: talk |
| At the gate: «Почему Ильзе недоплатили?» | Yes: the arrival line has her name, the sum and the line |

Three yes, one half, one no: build.

## 3. Records

| Record | Who writes | Who reads | Where the player sees it |
| --- | --- | --- | --- |
| The terms and the purse (`world.escort`; exists) | the pack | `escort.rs` | the reading |
| The line's last sentence (a pack string; new) | Zoya | the Narrator; the arrival line | the reading; before a choice that loses time; the gate |
| Days served, coin paid per Blade (exists) | the engine | the arrival line | the arrival line |
| Deed `read_the_company_paper` (exists; nothing reads it) | card `bridge_again` | the next contract's opening prose | one sentence there |

No record of who signed: nothing would read it.

## 4. Rules (each a test could check)

1. For every party size the pack can start with, the purse is the wage times the Blades times the route's days with none lost; the day limit allows one day more.
2. `advance_days` is 0: no wage line precedes the reading.
3. The paper names every term `escort.rs` pays by and no other. Nobody rolls to hear or read it.
4. The names are written in before the reading. The Narrator never makes the human's mark.
5. The opening prose holds the pack string verbatim. Each card with a `delay` choice names it in its note, to be said before the choices, never with whether this delay costs the day.
6. After `escort_settled`, unless the purse was shared out, if a Blade earned more than they were paid the seat's line gives the name, the sum and the pack string, and never says «заплачено, что положено». Otherwise today's lines stand.

## 5. Carriers

**(a) The clause.** A rule `escort.rs` already has (a short purse pays what is left, in party order; test `a_short_purse_pays_what_is_left`) and one number in the campaign file. `purse_cp` is one number, so a party of three would never run short: the pack starts at one size, or the purse is counted in days (a change to `world.escort`, Rule 1). Tried first: an arrival card that docks pay; it fires before the pay and sends the coin to the world.

The line, in Zoya's wording (the merchant is hers and Stas's):

> «Плата идёт из этого кошеля и ни из какого другого, по именам в том порядке, в каком они вписаны ниже. В нём плата каждому нанятому за четыре дня. Пятого дня в нём нет.»

The arrival line (`{…}` filled by the table, coins in its own words):

> «Обоз прибыл: {место}. Кошель торговца пуст. Недоплачено: {Ильза}, {8 золотых} из {10}. В бумаге: „{Пятого дня в нём нет}“.»
> "The caravan has arrived: {place}. The merchant's purse is empty. Short: {Ilsa}, {8 gp} of {10}. The paper: '{A fifth day it does not hold}'."
> For the human's own character, as the third sentence: «Вам недоплатили {8 золотых} из {10}.» / "You were paid {8 gp} short of {10}."

**(b) The scene before the mark.** The opening prose and rules 2 and 4: the paper waits for the human's mark.

- **Signs:** the human's own words, or calling the road. Needs nothing.
- **Asks to strike the line:** his reason, with no roll: it is the situation, and a roll would withhold it. Striking it needs terms a card can change; not proposed.
- **Refuses:** talk. Needs a card put on the table at `start_campaign` before the advance, as `death_card` is, and `settle` (table #417, not on main).

**(c) `read_the_company_paper`.** Keep it. One reader: a paragraph in the next contract's opening prose, conditional on the deed, saying who carried the word there. First, in *The Way Back*: `bridge_again`'s note says what the paper says (today the Narrator invents it), and a failed read, which takes the toll, writes `paid_the_company`.

## 6. Contract, failure, risk, out

- **Contract and core.** No change. The arrival line reads `wage_cp`, `served` and `paid_cp`, public in `EscortView`; the pack string is read by the game alone, as `glossary_ru` is.
- **Failure.** No new check. If the Narrator does not answer, the seat's line still carries the name, the sum and the line.
- **Risk.** The line never fires, or always fires: E3.
- **Out.** The unpaid day as a debt: nothing records it, so the paper says "no other purse". The company making the short Blade whole: `give` exists; I don't know whether a turn follows the pay.

## 7. PRs

1. Lore: the "Reading and papers" lines of my 2026-11-23 page. After the company's rename.
2. Game: the pack string and the arrival line, with E2.
3. *The Way Back*: `bridge_again`'s note and failure branch. Zoya's text; its new small print is Stas's call.
4. The next contract's pack, with E1 and E3. After 1 and 2.
5. The scene bench for E4. After 4.

## 8. Exit rows

| | Row | Lowest layer |
| --- | --- | --- |
| E1 | Rules 1, 2 and 5 on the pack's files, for each party size; the opening prose names `read_the_company_paper` | a test with no model |
| E2 | Rule 6: short, not short, the human's own line, a purse shared out | a test with no model |
| E3 | Two scripted journeys per party size: losing every day a choice can lose leaves the last name short by one day's pay for the company; losing none pays all in full | a test with no model |
| E4 | The Narrator reads the whole paper before the first leg and never makes the human's mark | a live run smaller than the exit run, read by the narration judge |
| E5 | A reader given only the lines says what the last line cost, and whether it wears thin by the third card | a person (Vera) |

## 9. Board and Vera

Zoya, first round (project file `demo/contract-line/zoya-2026-11-23.md`): "**Verdict: not ready for Stas.** The main line holds: the clause is read on the first evening and the arrival line answers it in the same pack, and nothing in it is a withheld fact. But four things are broken": three Blades, the arrival line, the mark, the reader's witness.

Vera, blind (project file `demo/contract-line/vera-2026-11-23.md`): "Если дорога займёт пятый день, кому-то не хватит." "«Пятого дня в нём нет» стоит у меня в ухе."

Taken: Zoya's fixes 1 to 8. From Vera: «знаки» became names written below, «зм» the table's coin words, and "of 10" says how much 8 is.

Not taken:
- «Фургон дошёл» (Zoya), the colon (Vera): main's three arrival lines say «Обоз прибыл:»; changing all four is its own PR.
- The rename inside PR 1 (Zoya): one concern a PR.
- Pity at the gate, and the ledger tone (Vera): the seat's line is the ledger; the Narrator and the companions answer it.

## 10. Decisions for Stas

Stas, 2026-11-23: «Ок по всем». 1: after `settle`. 2: party order (Ilsa), with amendment B. 3: yes, amendment A. Recorded in decision 0094.

1. **A signing card with a way to refuse: now, or after `settle`?** Now costs a contract change of its own on top of `settle`. I recommend after: no card is better than a corridor.
2. **Who goes short?** The last name in party order: Ilsa. I first put the human last; party order also sets rations, anchors and odd coppers, so I now recommend today's order, with Zoya's amendment B: a shared cost falls on a name the table heard before the first choice that can bring it on. Cost to the player: the day comes off a companion's pay. The other way: "the human's seat last".
3. **May the paper say what the purse holds?** `purse_cp` is DM-only and the rules are silent. Zoya's amendment A: a pack's own sentence may state a DM-only amount in story units when a test ties it to the file. I recommend accepting it over a field in the player's view.
