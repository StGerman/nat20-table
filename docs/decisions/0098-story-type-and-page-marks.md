# 0098. The story is set in Literata; the page's marks are Lucide with a word; a roll is "roll no. 11"

- **Status:** Proposed
- **Date:** 2026-11-28
- **Decided by:** Stas, in the "Build the iPhone app in SwiftUI" thread, 2026-11-27 22:49Z ("Okay, "literata" Drop Cap as the text. Deal") and 22:54Z ("Lucide icons with a word", "roll no. 11"); accepted on merge

## Context

The picture-book milestone gives a new place a chapter opener: its picture, the place name and a drop cap (Stas, 2026-11-24). That needs a decided face for the story, a face for the drop cap, and marks for the page. Today the page names `ui-serif, "New York"` for narration and the system font for controls, and has no icon set; the only design system, Mill Table, describes the old Telegram table.

Facts checked:

- The main audience reads English; Russian is mostly for Stas (Stas, 2026-11-27 22:23Z). A face is judged on its Latin and must not fail in Cyrillic.
- The narration lives only in the web page. The SwiftUI shell draws the bars, tabs and sheets with the system font and SF Symbols and carries no story text (decision 0093). So a story face is files the page carries, not a font registered in Swift.
- Sizes of the Cyrillic and Latin `woff2` files Google Fonts serves, measured 2026-11-28: Literata roman 131 KB and italic 134 KB (variable: weight, optical size); PT Serif 22 to 24 KB a style; Old Standard 22 KB; Source Serif 4 roman 211 KB; Alegreya roman 65 KB; Yeseva One 17 KB; Cormorant 600 36 KB; Ruslan Display 13 KB. The italics of Source Serif 4 and Alegreya were not measured.
- Literata: SIL Open Font License 1.1, "Copyright 2017 The Literata Project Authors", no reserved font name (its own `OFL.txt`). The licence allows bundling and cutting the files down, asks that its text ship beside them, and binds only the font: a modified font stays under it, the app's code and text do not.
- Lucide: ISC licence; the icons it inherited from Feather are MIT (its own `LICENSE`). Fifteen marks the page needs exist in it.
- Lavka, the drop cap face Stas first linked, is offered with no licence ("All Rights Reserved" on the page that hosts it).
- Vera (cloud fallback, on a screen of the page in this thread), on the line «Запись броска: r151 · r152»: «Это для меня совсем непонятно. Похоже на номер архивной описи.»

## Options

### The story's face

#### A. Literata for everything the Narrator says, the system font for everything the table says
- Pro: drawn for long reading on phone screens; its Latin is among the best open text faces and its Cyrillic keeps up.
- Pro: one variable family with optical sizes, so the text, the place names and the small print come from the same two files.
- Con: 265 KB of fonts in the page, and one more file type for the page's file server.

#### B. Keep New York and carry no files
- Pro: nothing to ship, nothing to license; it is already there.
- Con: it exists only on Apple systems, so the page opened in any other browser shows a different face; nothing about the page is the game's own.

#### C. PT Serif with Old Standard for headings
- Pro: 91 KB; a strong Cyrillic.
- Con: a plainer Latin, static styles, no optical sizes; two families to keep in step.

#### D. Source Serif 4 with Cormorant, or Alegreya with Yeseva One
- Pro: both read well in both scripts.
- Con: Source Serif costs 211 KB before its italic; Alegreya with Yeseva reads as a fantasy book cover, the look the picture book is moving away from.

### The drop cap

#### A. The text's own face, in the accent colour
- Pro: no second face, no second licence, the same in both languages.
- Con: less theatre at the top of a chapter.

#### B. A display face: Ruslan Display, Old Standard, Yeseva One
- Pro: Stas found New York with Ruslan Display "strange but good".
- Con: Ruslan Display's Latin is drawn in the Slavic manner and reads as mock-Russian to an English reader; any display face is a second family for one letter a chapter.

### The page's marks

#### A. Lucide, always with a word
- Pro: its thin line sits beside SF Symbols without a seam; permissive licence; the few marks we need exist.
- Pro: a first-time player never meets an icon alone.
- Con: one more thing to keep consistent; each mark is inlined by hand.

#### B. Words only
- Pro: nothing to draw and nothing to misread.
- Con: the map, the contract and the watches lose a quick visual anchor on a small screen.

#### C. game-icons.net, emoji, or a drawn set of our own
- Con: game-icons.net (CC BY 3.0) reads, in Claude's view, as the late-nineties game interface Stas turned down on the design boards on 2026-11-20; the project uses no emoji; fifteen marks do not pay for an illustrator's week.

### The roll's name

#### A. "roll no. 11", Russian «бросок № 11»
- Pro: a first-time player reads it as what it is.
- Con: longer than the id.

#### B. The bare id, "r11"
- Pro: equal to the transcript and the engine log, character for character.
- Con: the first reader took it for an archive number.

## Decision

Stas chose A in all four. Literata sets everything the Narrator says: narration, speech, place names, the drop cap and the engine's small print. The system font sets everything the table says: controls, the card, a speaker's name. The drop cap is the text's own face. The page's marks are Lucide, 1.5 px stroke, text-coloured, never without a word; the native bars keep SF Symbols. On the page a roll is named "roll no. 11", in Russian «бросок № 11».

Reading "literata" as the whole Literata set, place names included, is Claude's; so is leaving the other printer's signs (§ for a clause, † for the dead, three dots for a change of place) as proposed and not decided.

## Consequences

- Nothing changes in the app with this record. The fonts, the marks and the roll's name land with the picture-book milestone; its scope names the tasks.
- The page will carry Literata's roman and italic files with `OFL.txt` beside them, and lead its serif stack with Literata; New York stays behind it as the fallback. `shell/Shared/PageScheme.swift` learns the `woff2` type.
- Rule 7 names code and data, not fonts. The PR that lands the files adds the line: fonts under the Open Font License, with the licence text beside them.
- Lucide marks are inlined in the page, one by one, with its licence text in the repository. The page never loads them from a network.
- "roll no. 11" is how the page shows a roll. The id stays `r11` in the engine log, the transcript and the audit (Rule 4).
- The app gets its own design system (colours, type scale, marks) as an Artifact, which the picture-book design reads. Mill Table stays the record of the Telegram table.
- Every new player-facing line and each new mark goes past Vera before it ships.

## Revisit when

The fonts measurably slow the first screen on the iPhone; Vera or a playtest reader misreads a mark even with its word; or a display face for the drop cap is wanted again, in which case it must read as plain Latin to an English reader.

## Sources

- Type and marks proposal, with every set on one page: https://claude.ai/artifact/8ES1MCH37c58PVsex4rLRj
- Picture-book prototype with the type switch: https://claude.ai/artifact/8mAsZEZfHCFXtt4eUQPebd
- Literata's licence: https://github.com/googlefonts/literata/blob/main/OFL.txt
- Lucide's licence: https://github.com/lucide-icons/lucide/blob/main/LICENSE
- Decisions [0092](0092-fine-print-and-the-undersigned.md) (the name) and [0093](0093-swiftui-shell-over-the-page.md) (the shell over the page)
