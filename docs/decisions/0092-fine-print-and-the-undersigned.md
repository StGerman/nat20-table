# 0092. The game is Fine Print, the party's company is the Undersigned

- **Status:** Proposed
- **Date:** 2026-11-23
- **Decided by:** Stas, in the "Name the app" thread, 2026-11-22 22:56Z («Окей погнали "Мелкий шрифт" и "Нижеподписавшиеся"»); the reading rule on a card, 23:11Z («Как советует Лев»); accepted on merge

## Context

The iPhone and Mac app needs a product name before it is built. "Glass Table" was a placeholder and sits too close to Apple's Liquid Glass; "Wend" names one region and "The Silent Mill" one demo story. Nat20 is the engine's name and never reaches the player. Stas also never liked the company's name, "Grey Lantern", and asked for both to be named in one pass. The name has to work in Russian and English, carry no tabletop jargon and no Wizards of the Coast marks, and cover every world the game will have. Stas's steer: the game is by and large a trade simulator, and the answer is in the storytelling bible.

Facts checked:

- Twelve rounds of candidates; each one that reached the pool was searched on the App Store, Steam and the web. These were web searches, not a trademark search.
- Vera (blind, names only, two runs): the only pair she would open in both languages was «Мелкий шрифт» / Fine Print, first both times. "Not for Nothing" read to her as New York slang; five legal names in a row read as "a game about lawyers".
- Zoya: The Undersigned first as a title, Fine Print second, with one objection: it promises a withheld fact (Story-space 4). For the company she named only «Нижеподписавшиеся».
- Lev: he would ship «Недаром» / Not for Nothing and cut Fine Print ("promises the game will cheat"); for the company The Undersigned, not shared with the game. He also found that prices do not move in the engine yet: a name about the contract and the ledger is paid for today, a name about prices is not.
- Trademarks, from public USPTO records read on 2026-11-22 (not legal advice; EUIPO not checked): no game mark "Fine Print" found. FINE PRINT 78640269 belongs to FinePrint Software, LLC for printing software; FINE PRINT 98790637 is a pending application in classes 41 (music publishing) and 25. The App Store has utilities named "FinePrint: Contract Analyzer" and "Fineprint: Food Scanner".

## Options

### A. Fine Print / «Мелкий шрифт», with the company The Undersigned / «Нижеподписавшиеся»
- Pro: the only title the first-time reader opened in both languages; the pair says the same thing in both.
- Pro: two names, so no world has to carry a company that bears the game's name.
- Con: read alone, the title promises hidden terms, which the bible forbids. The game has to turn that meaning.

### B. Not for Nothing / «Недаром», with the same company
- Pro: paid by the engine today: a choice with no effect is refused, and deeds are read later.
- Con: the English half failed the first reader; Zoya cut it for saying the theme aloud.

### C. The Undersigned for both the game and the company
- Pro: the title explains itself in the first scene.
- Con: too long and clerical as a title for the first reader; every world would need the same company for ever.

### D. On the Books / «На счету», with the same company
- Pro: fully paid by the ledger.
- Con: reads as a banking app; the first reader found it flat.

## Decision

A (Stas). The game is Fine Print / «Мелкий шрифт»; the party's company is The Undersigned / «Нижеподписавшиеся». The company's custom turns the title: it signs nothing until the paper has been read aloud to the last line, so in this game the fine print is read out before anyone decides. The custom comes from the company's origin, the pay-off sheet (`lore/the_wend_valley.md`).

The reading rule (Stas, on Lev's advice): no literacy field and no roll to read a contract. Every one of the four reads; how each reads is a line of prose. A paper is told whole, no clause is invented, and a failed roll never hides a line. A check on a paper is rolled only where a pack has written what there is to find beyond the words.

## Consequences

- "Grey Lantern" leaves the lore, the Wend deck, both contract packs and the compass; `docs/scope/dramaturg-mechanism-scope.md` keeps it once, where it quotes a note that was removed.
- The lore carries the company's origin, sign (seven stitched crosses), custom and the Narrator's rules for papers; the personality cards carry the name, the sign, the custom and each companion's reading habit. Never how the human's character reads.
- The app takes the display name Fine Print / «Мелкий шрифт»; the bundle id and the timing are the app thread's (table #480).
- The title is honest but not yet paid for: no contract has a clause that bites. The design of one clause read aloud that fires at settlement, a contract scene before the mark, and a reader for the deed `read_the_company_paper` is Lev's, in its own thread.
- Open on the season board (Zoya): which of the four signed before the sheet was read; the thirty-three shares in the lord's treasury; a `customs.json` entry for the company's custom.
- Before a store listing: a trademark search by a professional, and a listing name that the store accepts next to the "FinePrint" utilities.

## Revisit when

A trademark search or the App Store refuses "Fine Print"; or playtests show that players read the title as a promise that the game hides terms from them.
