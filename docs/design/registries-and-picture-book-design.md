# People, places and the picture book: system design

- **Status:** Proposed; accepted on merge
- **Date:** 2026-11-28, main bddb234
- **Milestone:** `tasks/registries/milestone.md` (scope and exit criterion)
- **Asked by:** Stas, 2026-11-28 («People and places registries merge with Picture-book milestone и внеси UI в scope этого milestone сразу, и подготовь /engineering:system-design»)
- **Builds on:** the scene-map design (table #491, page https://claude.ai/artifact/GhBDV6JZMuER1TcHsLUtgN), CON-25, CON-26 and CON-27 (the Mac open book and the pictures, tables #499, #501, #506), decision 0098 (type and marks), the SwiftUI shell design (decision 0093)
- **Prototype it describes:** [Picture Book Table](https://claude.ai/artifact/8mAsZEZfHCFXtt4eUQPebd), v6; design system [Fine Print](https://claude.ai/artifact/4JAabAo9XsvNAPPzVgKMsB)
- **Read by:** see §12

## 1. Summary

Two committed registries, people and places, become the one source the engine's scenes, the Narrator's brief and the page all read. On top of them the page becomes a picture book: a chapter opener per new place, the map as a second page, the story in Literata, and a shell that wears the page's colours.

- **No engine or contract change.** The table resolves a scene's `place` into the anchors the engine already takes. The seat wire, which is ours and not the engine's, gains two fields on `place` and makes `plate` optional.
- **The expensive part is content, not code.** Eight place records with hand-drawn layouts (plus 8 stock places), the 23 final portraits cut and wired, about a dozen place pictures, and Stas's picks of each. The code is one reader, one picker and the page's opener.
- **The one real risk is Rule 3 in pictures.** A picture shows more than a line of text, and it arrives before the party has looked around. §5.3 is the rule that keeps it honest.

## 2. Requirements

### 2.1 What it does

1. Every person who speaks has one record: names in both languages with their forms, a look, a portrait, whether the engine stands them in a scene. A pack links to that record and keeps only its DM prose.
2. Every place has one record: where it is on the Wend map, its names, its look, anchors and props with their geometry fields, its pictures and its plans. A scene names its place and adds its start spots.
3. The page opens a chapter on the first visit to a place, draws meetings in the line, turns the Mac's right page with the reading, and shows «Где все» as a second page over the drawn plan.
4. The page sets the Narrator's text in Literata and marks with Lucide and a word; the shell takes the page's accent and colours.
5. A named person can die and stay dead (MAP-31).

### 2.2 What it must hold

| Requirement | Target | Lowest layer that tests it (0080) |
|---|---|---|
| Rule 3: a picture never shows what the party has not seen | a picture is chosen by place, time and state only from facts the party holds; it reaches the seat after the scene's opening is told; each picture carries a `shows` line Zoya signed | test, no model (seat-wire replay); Zoya on each picture (a person) |
| Rule 4: the die and the roll name come only from the engine | "roll no. 11" is drawn from the roll's id; the transcript and audit keep `r11` | test, no model (existing replay, faces against the log) |
| No move the scene's text contradicts (Stas, 2026-11-21) | resolved anchors equal today's except the listed moves | test, no model |
| Layouts carry next milestones' fields from the first commit | every prop has `solid`, `cover`, `height_ft`; a door has `leads_to` | test, no model (`pack:check`) |
| Reduce Motion, Reduce Transparency, Increase Contrast | no parallax, cross-fade for the map page, solid glass | Playwright with the media features set; a person |
| One language at the seat (0067); English first, Russian keeps working (Stas, 2026-11-27) | new words only in `game/src/table/words.ts` and the shell's `Words.swift`, both languages | existing tests |
| Page weight | fonts 265 KB; a picture at most 450 KB (1200x1600 JPEG); the page still opens in under a second on the iPhone over Wi-Fi | test, no model (build size check); a person |

### 2.3 Constraints

- The engine's scene format does not change: anchors are still points in feet, and `flat_arena` still gives no cover.
- One web view per window, on the Mac and the iPhone (CON-25); the Mac's right page is native SwiftUI (`shell/Mac/Plate.swift`).
- Licences (Rule 7): pictures and portraits are our own generations; Literata is SIL OFL 1.1 (its `OFL.txt` ships beside the files); Lucide is ISC, its Feather part MIT. Moodboard sources never enter a repo or a prompt.
- Stas picks every picture and portrait. A design that needs more picks than he will make in an evening is too big.

## 3. Architecture

```
 worlds/wend/                          scenarios/<pack>/
  npcs.json  (people, + portrait)       adventure.json npcs[] ── person id ──┐
  places/<id>.json (place records) ◄─── scenes/*.json  place + spots       │
  places/pictures/*.jpg                                                     │
  places/plans/*.png                                                        ▼
        │                         game loop (table)
        │ read at start  ───────►  resolve place → anchors ──► engine (unchanged scene wire)
        │                          pick picture (place, time, state) ──► Narrator brief: `shows`
        │                          seat wire `place {id, name, plate, plan, time}` ──┐
        │                                                                          ▼
        └── page build copies pictures, plans, portraits, fonts ──►  page (reducer)
                                                                     story: opener, drop cap, meetings
                                                                     second page: «Где все» over the plan
                                                                          │ chrome state
                                                                          ▼
                                                                     SwiftUI shell: tint, gauges,
                                                                     Mac right page (Plate.swift)
```

Dependencies still point down. The registries are data under `worlds/`; nothing in core or the contract crate reads them.

## 4. Data

### 4.1 A person

`worlds/wend/npcs.json` keeps its shape and gains one field, `portrait`: the portrait's file name in `worlds/wend/portraits/`, a 512 px square JPEG cut from the final portrait. The finals are the pencil-under-oil set Stas made final on 2026-11-28, all 23 (party, goblin, 18 people), in `/mnt/project-files/assets/generations/portraits-drawn-v1/`; a new person is drawn the same way (Seedream 5.5 edit, about 0.03 USD a face, scripts in `scenes-v1/portrait-drawn-test/`). The page's build cuts the 128 px faces it bundles today from it, so `game/src/page/portraits/` keeps only the party and the kinds (goblin, wolf).

The Silent Mill's `adventure.json` `npcs[]` entries gain `person`, the record's id. Names, look and portrait come from the record; the pack keeps `prose` (DM only) and `creatures`. Bertil, Snitt and Gritch join the people file with no `place` (they come only with a pack that stands them in a scene). A Mill creature that is a person carries `npc: <id>` already (`boss` has `npc: gritch`), so the page finds a face by the person's id first and by the handle only for kinds. That gives Gritch his face.

### 4.2 A place

`worlds/wend/places/<id>.json`:

| Field | What | Who sees it |
|---|---|---|
| `id`, `in` | the record's id; the place on `worlds/wend/map.json` | all |
| `name`, `name_ru` | as the page and the Narrator name it | all |
| `ground` | `open`, `yard`, `indoors`, `cellar`: sets whether a sky is drawn and which plan base | all |
| `look`, `look_ru` | what you see on arrival, by Zoya, nothing hidden; read by the Narrator's brief on arrival and printed under the name on a title page | all |
| `anchors[]` | `id`, `name`, `name_ru`, `kind` (`prop`, `door`, `edge`, `landmark`), `position_ft`; a prop adds `footprint_ft` (a polygon), `solid`, `cover` (`half`, `three_quarters`, `total`, none), `height_ft`; a door adds `leads_to` (a place id) | anchors as today; geometry fields unused until «Walls and cover» |
| `pictures[]` | `file`, `time` (`day`, `night`, any), `when` (a deed the party holds, optional), `people` (the person ids it draws), `shows`, `shows_ru`, `focus` (x, y in 0..1, for crops) | the picture and `shows` |
| `plans[]` | `file`, `time`, `theme` (`light`, `dark`); nothing countable, no person; Zoya reads each | all |

`leads_to` never reaches the seat: a door's far side is not something the party has seen.

A scene loses its `anchors` and gains `place`, `spots` (start points only, in feet, never lettered) and `anchors_used`: the place anchors this scene shows, each with an optional `name`, `name_ru` of its own. A scene filters and renames, it never moves: *The Way Back* still calls a stall "Odda's empty stall", and the Mill's s1 still shows 4 of the green's 7 anchors. The table builds the engine scene's anchor list from the place and the filter.

One green means one set of positions, and today there are two: the Mill's well stands at (0, 0), the wagon packs' at (10, 10) with the wagon at (0, 0). So exit row 1 is "every anchor id a scene uses survives, and every change of position is listed in PR 2", not "positions equal". The party's starts in s2 to s6 are named anchors 5 ft from props (`grain_sacks`, `prisoner_post`); they become `spots`.

The pack's `plates/index.json` (CON-26) goes: what it holds moves into the place records, and its `plan` key becomes the place id. `game/src/pack/places.ts` becomes the reader of `worlds/<world>/places/`.

### 4.3 The 8 + 8

| Place | Scenes today | Picture | Plan |
|---|---|---|---|
| Wendford green | Mill s1, s6; fw, twb Wendford | green (day), green after (when the miller's family is back), new style later | painted, 4 |
| Mill road | Mill s2 | road (provisional, needs Stas's pick) | layout render |
| Mill yard | Mill s3 | yard J3a (picked) | painted, 4 |
| Mill storeroom | Mill s4 | empty; with Snitt `when: surrendered` | layout render |
| Mill cellar | Mill s5 | cellar | layout render |
| Highsteads, Wendmouth, the road | fw, twb | not drawn: title page (§5.1) | layout render |
| 8 stock places | none yet (living world); §9.8 proposes cutting them | title page | layout render |

"Layout render" is the page drawing the layout's footprints in the plan style, the way «Где все» draws today. A painted plan replaces it only where one exists.

## 5. The table

### 5.1 Picking a picture

At a scene start the loop picks the place's picture: the first entry whose `time` fits, whose `when`, if any, the party holds, and whose `people` are all creatures in the loaded scene. The engine drops the dead from a scene at `enter_scene`, so a picture never draws a dead reeve standing on the green, and the green the wagon packs share never shows a miller they do not stand there. If none fits, the page draws a title page. `time` comes from the scene's new optional `time` field, or from the living world's watch where the run has one (six watches: the first four are `day`). The pick is a pure function of the record and the party's facts, so a test with no model holds it (exit row 4).

For the Snitt storeroom, `when` is the deed Scene 3 already writes when a goblin surrenders, `snitt_yielded`; the design adds no new state.

### 5.2 The seat wire

`SeatPlace` (`game/src/table/seat-data.ts`) becomes `{ id, name, plate?, plan?, time }`, two new fields: `plate` is absent when the place has no picture, so the page never sees a file name it cannot show. The placeholders that name a missing file (CON-26) move behind the page's developer switch (`?dev=1`): Vera read file names as "the program is broken".

### 5.3 What a picture may show (Rule 3)

A picture is told before the party has looked around, so each picture holds only what the scene's opening tells on arrival: the people standing there, the place's own things. Nothing countable unless the scene says the number (the 11-24 runs said spears where the plate drew knives). Its `shows` line goes into the Narrator's brief as fact, so the telling and the picture agree. A picture whose scene hides someone at first (a lookout, a boss behind a door) gets a second entry with a `when`. Zoya reads each picture and each plan against its scene before Stas picks; that read is the person row behind exit row 4.

One case is open from CON-27: a campaign scene held behind a road card is already the seat's place while the card is played, so its picture would come before its opening. A shared, painted Wendford makes it live. The seat sends `place` only when the held scene opens; exit row 4 holds it.

### 5.4 People's deaths (MAP-31)

A named person standing in a scene is a creature already (table #477), and the engine already writes `killed_osric_hale`, `killed_bertil_pell` and `killed_wenna_thorne` (`crates/nat20-api-server/tests/deeds.rs`); MAP-31's text predates that. What is missing is a reader: no card's `if` reads the three deeds, s6 has no line for a dead reeve or miller, and s5 writes `wenna_saved` on a won fight even with Wenna dead. So MAP-31 here is the reading side: s6 after each death, no `wenna_saved` beside `killed_wenna_thorne`, and Wendford's cards without them. Wenna joins Scene 5 as a creature. Zoya's board comes before its rows; if Stas would rather not, MAP-31 goes out of this milestone by name (§9).

## 6. The page

### 6.1 The chapter opener

On a phone or a narrow window, a chapter opens when the place or its picked picture changes: the first visit to a place, and the return to the green at the end, where the picture is the one the party's deeds picked. That return is the moment a player retells, so it gets the opener too (today's reducer already opens on a changed plate, `game/src/page/reduce.ts`).

- The picture full width, cropped to 3:4 around `focus`, at most 70% of the screen's height; a soft shadow under it (Stas, 2026-11-27).
- The place name lettered on the picture in Literata, bottom left, with a text shadow that holds on a bright sky.
- A light parallax: the picture moves at 0.85 of the scroll, at most 8% of its height; none under Reduce Motion.
- A drop cap on the first narration paragraph told after the opener, in the text's face and the accent colour (0098), three lines deep on the phone, four on the Mac.
- A place seen again with the same picture opens no chapter. A title page stands in for an unpainted place: the name on paper, the place's `look` under it in italics, then the drop cap. The look line answers Vera's "is the picture still loading?": a page with words under the name reads as finished.

The half-built opener (`chapter-opener-2026-11-27.patch`, against main d440b9d) is the starting point; it is rebased onto the reducer's `plate` beat from CON-27, not merged as it is.

### 6.2 Meetings in the line

A person's first naming in a chapter puts their face, 44 px, at the start of that line, on the phone and on the Mac (Stas, 2026-11-27). Later namings keep the dotted name only. The face comes from the person's record; a person with no portrait gets the initial, never a dashed placeholder outside the developer switch.

### 6.3 The Mac's open book

`Plate.swift` draws the picture today and nothing else; the name lettered on it, a drift of at most 8% and the title page are new work there. It turns with the reading: the page posts the place of the beat at the top of the story in the chrome state, and the shell shows that place's picture. Lettering the name in Literata on a native view would need the Mac shell to register the font files from its bundle, against decision 0098's "fonts in the page only". This design uses the system serif (New York) for that one line and leaves the choice to Stas (§9).

### 6.4 «Где все» as the second page

One tab, two pages, dots under them (Stas, 2026-11-24). The map slides over the story, the story moves at a third of the speed and darkens; Reduce Motion cross-fades. The map's lens draws over the place's plan for the time and the theme, or over the layout render. A one-time hint, about 70 pt, says the map is one swipe away and goes after the first swipe or the first press on the dots; it is the one answer still open from 2026-11-25 (§9). Names on the map stay hidden until the narration names the person.

### 6.5 Type and marks

- Literata roman and italic, `woff2`, Latin and Cyrillic, 265 KB, in `game/src/page/fonts/` with `OFL.txt`; `PageScheme.swift` serves `font/woff2`; Rule 7 in CLAUDE.md gets one line for OFL fonts.
- Sizes: the prototype sets the story at 17/26 on the phone and 18/29 on the Mac; the app sets 19/31. Literata reads larger than New York at one size, so this design proposes 18/28 on the phone and 18/29 on the Mac, checked on Stas's iPhone (§9).
- The 15 Lucide marks are inlined as SVG symbols, 1.5 px stroke, the text's colour, always beside a word.
- The page names a roll "Roll no. 11", «Бросок № 11», capitalised at the start of its own phrase; the record, the transcript and the audit keep `r11`. Vera (fallback, 2026-11-28) still asked whether eleven is the throw or the result; §9 puts it back to Stas.

### 6.6 The shell's colours

The page's tokens already match the prototype; the shell drifts (2026-11-27, Stas's iPhone):

1. The accent: `.tint` takes the page's accent from the chrome state (`#b0440f` light, `#ff9a57` dark) instead of the system blue.
2. The HP gauge: the page's three HP colours instead of the system green.
3. The story's background: flat, the page's paper; no ambient wash under the story.
4. Glass on dark: one step more opaque, so the dock reads.

## 7. Failure

| What fails | What the player sees | What we do |
|---|---|---|
| A picture file missing in a build | the title page | `pack:check` fails the build on a named, missing file; the title page is the fallback, not the plan |
| A place record missing or invalid | the run does not start | `pack:check`; the loop refuses at start with the place id |
| A font fails to load | the system serif | nothing; the layout does not depend on Literata's metrics beyond a line |
| The `when` deed never written, or a person in the picture is dead or absent | the next picture that fits, else the title page | the pick never falls back to a picture with people the scene does not hold |
| A person with no portrait | their initial | the build lists missing portraits; not an error |

## 8. Tests

1. Scene resolution: every scene of the three packs, resolved anchors against today's, with the listed moves as the only diff.
2. `pack:check` on places and people: the geometry fields, no start spot within 5 ft of a prop, no lettered spot, every named file present.
3. Picture pick: the table of place, time, deeds and scene creatures against the picked file: the Snitt case both ways, the green after each of the three deaths, the wagon packs' green.
4. Seat-wire replay: no `plate` before the opening narration, a held campaign scene included; the brief holds `shows`; no `leads_to` and no hidden field on the wire (the existing scan).
5. Page on Playwright's WebKit: opener once per place, drop cap, Reduce Motion, map page by swipe and dots, the hint once, "roll no. 11" with `r11` in the transcript; pictures in light and dark next to the prototype's screens.
6. Shell tour pictures (phone and Mac): tint, gauge colours, flat background, the right page following the reading.
7. MAP-31: after each scripted death, s6 loads with its line for the dead, and s5 writes no `wenna_saved` beside `killed_wenna_thorne`.

## 9. Decisions for Stas

1. **Name.** "People, places and the picture book" for the merged milestone, folder `tasks/registries/` unchanged. Recommended.
2. **Pictures move into place records** and the pack's `plates/index.json` goes (§4.2). Recommended: one place, one record, no second list to keep in step.
3. **Unpainted places get a title page**, not a placeholder with a file name; file names only behind the developer switch (§5.2). Recommended: Vera read them as broken.
4. **The one-time map hint** (§6.4). Recommended: yes; Vera found neither the swipe nor the dots alone.
5. **Story size** 18/28 phone, 18/29 Mac, checked on your iPhone (§6.5). Recommended.
6. **Which pictures this milestone draws.** Recommended: the Mill's road (your pick), and the Mill's older plates redrawn in the new style only if you want them redrawn; Highsteads, Wendmouth and the road on title pages; painted plans only for the green and the yard, which exist. Each further place is about three picks of your time.
7. **"What we learned in this place"** stays out again. Recommended: no player asked for it at the table, and it is a ledger fact, not a picture.
8. **The 8 stock places.** You set N = 8 on 2026-11-23. No scene reads them yet, so Lev proposes cutting them until one does. Recommended: cut now, draw them in the milestone whose card first sends the party there.
9. **The geometry fields** (`solid`, `cover`, `height_ft`, `leads_to`). You asked for them from the first commit (2026-11-23); Lev notes nothing reads them, so the test checks only that they exist. Recommended: keep them as you decided; they are cheap to write while each layout is drawn.
10. **The place name on the Mac's right page**: the system serif (no font in the shell, recommended), or Literata registered in the Mac bundle (same face as the story, an exception to 0098).
11. **MAP-31 in or out.** Recommended: in, as the reading side (§5.4), after Zoya's board. Out means the three deaths stay written and unread.
12. **"Roll no. 11".** Vera still could not tell the throw's number from its result. Recommended: keep your 0098 pick and let the roll token beside it carry the die face; revisit after Friends and Family.
13. **The exit run** (row 8). Recommended: scene-size live runs (Scene 3 into 4 on both yard endings, a death into Scene 6, judge on) instead of an all-AI full run, which sees no page and may roll neither a surrender nor a death; then you play the Mill on your iPhone. That is a change from 0043's pair and needs your yes.

## 10. Trade-offs

| Choice | Taken | Rejected, and why |
|---|---|---|
| Where places live | `worlds/wend/places/`, shared by packs | per pack: Wendford's well is drawn twice today |
| Pictures in git | committed JPEGs, ≤450 KB, about 6 MB in all | Git LFS: one more thing to install for every checkout; generated at run time: after Sign in with ChatGPT at the earliest |
| Picture choice | a pure pick by place, time, flag | the Narrator picks: a model call per scene, and a picture that may contradict state |
| Mac place name font | the system serif, Stas to confirm | Literata registered in the shell: the same face, but fonts outside the page break 0098's context; the page in a second web view: one web view per window |
| Plans | painted where they exist, layout render elsewhere | 4 paintings per place for all 16: 64 pictures and as many picks |
| Opener code | rebase the 11-27 patch onto CON-27's beat | merge it as is: it predates the beat and duplicates it |

What to revisit as it grows: a second world needs `worlds/<id>/places/` read by world, not by `wend`; pictures past about 30 make the repo heavy enough to weigh LFS again; «Walls and cover» turns the geometry fields on.

## 11. PRs

In order; each one concern, Before / After / How, a code review, the shell's tour pictures next to the prototype on page PRs.

1. `table:` People records: `portrait`, Bertil, Snitt, Gritch; Mill `npcs[].person`; faces by person id. Zoya's look lines, Vera on a card.
2. `table:` Place records and the reader; scenes name `place` and `spots`; `plates/index.json` goes; `pack:check` rules. Zoya on looks and pictures.
3. `table:` The picture pick and `SeatPlace` `{id, plate?, plan?, time}`; `shows` in the Narrator's brief; placeholders behind the developer switch.
4. `table:` Literata, the marks, "roll no. 11", the story sizes (page and `PageScheme`), Rule 7's OFL line.
5. `table:` The chapter opener, the drop cap, meetings in the line (phone and Mac page).
6. `table:` «Где все» as the second page with dots and the hint, over the plan.
7. `table:` The shell: the page's tint and HP colours, flat story, glass on dark, the Mac right page following the reading with the name and drift.
8. `table:` MAP-31, the reading side: Wenna in Scene 5, s6 and Wendford's cards after a death, `wenna_saved` only with Wenna alive (after Zoya's board).
9. The exit runs (row 8).

PRs 1 to 3 are a stack; 4 to 7 sit on 3; 8 is beside them.

## 12. Read by

Lev (2026-11-28): eight findings, all applied here or put to Stas in §9 (8, 9, 10, 13); quoted on the PR. Vera (fallback, 2026-11-28) on the opener, a title page, the map hint, the roll name and a meeting: quoted on the PR; her title-page question is answered in §6.1, her roll question is §9.12. No pack, scene or card text changes in this PR, so Zoya's board check comes with PRs 1, 2 and 8.

## 13. Sources

- `tasks/registries/milestone.md`; MAP-31; `/mnt/project-files/assets/npc-registry.md`
- Scene-map design page https://claude.ai/artifact/GhBDV6JZMuER1TcHsLUtgN; painted plans `/mnt/project-files/assets/generations/scene-maps/`
- Picture Book Table https://claude.ai/artifact/8mAsZEZfHCFXtt4eUQPebd and its source `/mnt/project-files/demo/gui-glass-table-iphone/`
- Decision 0098 and the type page https://claude.ai/artifact/8ES1MCH37c58PVsex4rLRj; design system https://claude.ai/artifact/4JAabAo9XsvNAPPzVgKMsB
- Scene style `/mnt/project-files/assets/generations/scene-style-v1/STYLE.md`; picks `/mnt/project-files/assets/generations/scenes-v1/picks/README.md`
- CON-25, CON-26, CON-27 in `tasks/glass-table/`
