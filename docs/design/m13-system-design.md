# Milestone 13, Dramaturg mechanism: system design

Status: Accepted by Stas 2026-11-13 by merging table #375, all seven §12 items as recommended. Lev Neiman (cloud fallback), 2026-11-13, main 4d2e2f3. Scope: `docs/scope/dramaturg-mechanism-scope.md` (table #348), §8 answered by Stas; this design adds no mechanism to its In; where it departs from the scope is listed in §12 item 5. It answers the seven questions of the scope's §5 by number (§3). Decision 0075 (Proposed) records the one choice with real alternatives. Beside it and not part of it: `docs/design/deed-from-words.md` and decision 0071, outside M13's exit and PR count. Author's read: no verdict on itself. Zoya's board check and Vera's second read are quoted verbatim in §13; §7 is a third draft, written after both, and has not been read again.

## 1. Summary

A party that played *The Silent Mill* and later rides into Wendford with a wagon gets one new card: the village has heard how the mill yard ended, says so, and waits for the party's answer. Which of two cards comes depends on one thing the engine recorded at the mill, whether a goblin was taken alive in the yard. The answer is written down like any card choice.

The retelling: "We let the last goblin in the mill yard live. Two contracts later the Wendford folk brought it up."

One new system: a scene writes a deed. Everything else is what the road already has: the deed book, `if` on an arrival card, a pile of one, `once`.

Said early: the answer at Wendford is written and nothing reads it back (§12 item 3), and the human answers for a yard he did not fight in (§12 item 6).

## 2. Records

| Record | Who writes | When | Who reads | Where the player sees it |
| --- | --- | --- | --- | --- |
| Yard outcome: `snitt_yielded` or `yard_to_the_end`, never both | the engine, from the yard fight's `on_end` rules (§4) | at `combat_over` of `yard_fight`, party winning | the `if` of the two Wendford Mill cards | the card that comes at Wendford, and the DM's one sentence before its choices |
| Marker `wenna_saved` | the engine, same way | at `combat_over` of `cellar_fight`, party winning | the same two `if`s, as a gate: no rescue, no card | the same card (a marker gates it; it is never counted as a pay-off, amendment 3) |
| Marker `killed_gritch` | the engine (ENG-36's death rule, now for a scene creature) | right after the boss's death | nobody in M13; MAP-13 pairs it with `gritch_spared` (scope §2 item 4, §5 question 5) | nowhere in M13. Kept on the scope's word, §12 item 4 |
| The party's answer at Wendford (one deed per choice) | the engine, the card's `remember` (exists) | when the card is decided | nobody in M13 (§12 item 3); the run report and `m13-carried` count it, and a report is not a reader | nowhere yet |
| Site memory: the day, the contract number, the place the party was left at | the engine, in a session whose pack names a site (§5) | at `new_session`; saved by `save_roster` | `start_campaign` on the same map (`carry_memory`), then `trip_to_start` | the DM's one line on how the party came to the new contract's start |

Not kept: who saw a deed (`saw`), a cause in words, Snitt's fate after Scene 4, anything from Scene 4's two checks (scope §3).

## 3. The scope's questions, by number

1. **Contract.** §4. Two additive versions after M12's last: scene deeds (API-57), then the site (ENG-44).
2. **The reader.** An ordinary arrival card with `if`; no deck rule for a card that must come. The exit may rely on a pile of one, and a test holds it (§4.2 rule 7): with only Mill deeds remembered, the Wendford arrival pile of the wend deck joined with *Fair in Wend* holds exactly one card, because the four cards there today all read Millbeck bridge deeds and the route reaches the bridge after Wendford. A pile of one goes on the table with no draw-three and no DM pick (M11, unchanged). On a later contract the card may share the pile and lose a pick; `once: true` keeps it from greeting twice. Visibility: the deed stays DM only; the player sees the card's text and hears the DM's sentence (§4.4).
3. **Who `by` is.** A fight-end deed: the party-side participants of the encounter, in its order, downed ones included. A check's `remember`: the roller. A death deed: whoever dealt the last blow (ENG-36, unchanged).
4. **A pack with no world.** §5 and decision 0075.
5. **Named people.** `SceneCreature.npc`, optional: Scene 5's `boss` gets `"npc": "gritch"`, the id `adventure.json` already uses. There is no registry: the id is the same string wherever the person appears, as a card fight's `npc` is today. MAP-13 adds `gritch_spared` as an `on_end` rule on the same fight, with no converter. Snitt gets no id.
6. **The validator across packs.** §4.2 rule 8.
7. **Room for later.** Nothing is added now. `Deed` gains a later field only as an optional one with a default, left out when empty, so every roster saved before it still reads. `saw` and a cause arrive with their first reader, without a new roster format. A roster from a newer build is not read by an older one, as today.

## 4. Scene deeds (API-57)

### 4.1 What a scene may write, and on what

| Outcome the engine records | In the scene file | Deed |
| --- | --- | --- |
| A scene check resolved | `{"kind": "remember", "deed": …}` in the check's `on_success` or `on_failure` | as named |
| A fight ended | the encounter's `on_end`: an ordered list of `{when, remember}` | the first rule whose `when` holds |
| A named creature died | `npc` on the scene creature | `killed_<npc>` |

`when` is one of:
- `{"kind": "surrender", "yielded": [handles]}`: the fight ended by `end_combat{surrender}` and at least one of `yielded` is in the `surrendered` event the engine already logs;
- `{"kind": "won"}`: `combat_over` names the party as winner, for any reason.

The Mill, as data (MAP-20):
- `yard_fight.on_end`: surrender with `yielded` the four yard goblins writes `snitt_yielded`; then `won` writes `yard_to_the_end`. A surrender called with a wolf last falls to the second rule.
- `cellar_fight.on_end`: `won` writes `wenna_saved`.
- Scene 5's `boss`: `npc: gritch`.

No scene writes a deed on a scene exit, a flag or a DM tool call (Rule 4).

### 4.2 Rules (each a test could check)

1. A fight's end writes at most one `on_end` deed: the first rule that holds. A fight the party loses writes none.
2. The world keeps a fight's first outcome: if any deed of an encounter's `on_end` is already remembered, that fight's end writes nothing.
3. Rules 1 and 2 together: no world memory holds both `snitt_yielded` and `yard_to_the_end`.
4. `load_scene` answers `bad_scene` when: a deed id breaks the ENG-33 grammar; `remember` sits on a hazard; an `on_end` names a deed twice; a `surrender` rule's encounter has no surrender condition, or a `yielded` handle is not one of its `creatures`; `npc` is not snake_case or names a party handle.
5. With no world to write into (no campaign, no site), a scene deed writes and logs nothing, as `remember` does today.
6. Every new deed logs `deed_remembered{deed, by, day, contract}`, DM only, right after the event that caused it (`check_resolved`, `combat_over`, the death's `life_state`).
7. Seeded, in CI: on a roster a site session saved with `wenna_saved` and `snitt_yielded`, *Fair in Wend*'s arrival at Wendford puts the matching Mill card on the table and never the other; the same with `yard_to_the_end`; with neither, no card.
8. Across packs: for each world, every deed a card or choice reads in the world's deck joined with its packs' decks is written by a deck effect, a card fight's `npc`, or a scene (`remember`, `on_end`, a creature's `npc`) of a pack on that world. A pack is on a world by `campaign.json`'s `world.map` or `adventure.json`'s `site.map`. The test lives in the server crate, which reads both formats; the world crate's test stays as it is.
9. A deed `d` is an outcome if, at some source that writes it (a card, a scene check, a fight), another outcome of that source writes at least one deed and does not write `d`. Otherwise it is a marker. A card's outcomes are its choices and each check branch under them; a check's are success and failure; a fight's are its `on_end` rules. A death deed is not an alternative to them (it can fall in any of them), so `killed_<npc>` is a marker until MAP-13 gives it a counterpart. A unit test pins: markers `crossed_millbeck`, `wenna_saved`, `killed_gritch`; outcomes `toll_men_spared`, `toll_men_fought`, `snitt_yielded`, `yard_to_the_end`. (Amendment 3, read from pack data; AGT-104.)

### 4.3 Contract: goals and proposed shape

Goals: a scene deed comes only from an outcome the engine resolved; the DM gains no command and no field; no player view changes; additive.

`1.0.0-dev.N`, the first free after M12's last (dev.70 if API-56 and ENG-42 take 68 and 69). All scene-file types, in `crates/nat20-api-contract/src/scene.rs`:

- `Consequence::Remember { deed: String }`, a struct variant.
- `Encounter.on_end: Vec<EndRule>`, optional, empty by default. `EndRule { when: EndWhen, remember: String }`. `EndWhen`, tagged by `kind`, struct variants: `Surrender { yielded: Vec<Handle> }`, `Won {}`.
- `SceneCreature.npc: Option<String>`.
- No command, event, view or reject reason. `deed_remembered` is unchanged.

`contract/protocol.md`: the Deeds paragraph of §4.13 gains the three scene sources, §4.2 rules 1, 2 and 5, and `by` (§3 question 3). The visibility table needs no row: scene files are scenario data (DM only) and `deed_remembered` is listed.

Fixture `contract/fixtures/scene_deeds.jsonl`, seeded, in the test world under `start_campaign`: a check whose success writes a deed; a fight ended by surrender with a listed creature (first rule) and, on another seed or scene, won to the last (second rule); the same fight fought again writing nothing; a named creature's death; one `bad_scene` line per case of §4.2 rule 4.

CHANGELOG: `1.0.0-dev.N: scene deeds (API-57): Consequence remember; Encounter.on_end {when: surrender{yielded} | won, remember}; SceneCreature.npc writes killed_<npc>. Additive.`

Server: `apply` gains the `Remember` arm; `follow_blows` takes scene creatures' `npc` beside card fights'; the session evaluates `on_end` when it logs `combat_over`. `nat20_core` is not touched.

### 4.4 The reader and what the DM says

Two cards in `worlds/wend/deck/wendford.json`, `when: arrival`, `target: blades`, `once: true`: `if: [wenna_saved, snitt_yielded]` and `if: [wenna_saved, yard_to_the_end]`. Two or three choices, each with one `remember`; no check, no coin. On the first card one choice keeps `mercy_to_yielded` and one breaks it (Zoya, §13).

The cause is in the card's own text, so the table hears it even if the model says nothing (the record remembers, the model tells). The card's `note` asks for today's one plain sentence on what happened last time, and adds two bans: never say what became of the goblin after the mill, and never call the yard's end the party's choice on the `yard_to_the_end` card (a wolf may have been last). The `card_shown` event already hands the DM the deed with its `by`, day and contract.

Prose canon removed in the same PR: the "village knows them" line in `fw_wendford.md`, the last sentence of Osric's note in `npcs.json`, and "Snitt's hungry band" in the `goblin_scouts` note of `worlds/wend/deck/hills.json` (Zoya: it tells Snitt's fate, and after `yard_to_the_end` there is no Snitt).

## 5. A pack with no campaign joins the world (ENG-44, decision 0075)

- `adventure.json` gains `site: {map, place}`; the Mill's is `{"map": "wend", "place": "pells_mill"}`. `pack:check` checks the place is on the map and its `pack_slot` is the adventure's `id`, refuses `site` beside a campaign, and checks a scene creature's `npc` against the adventure's `npcs`.
- The game reads `site` and passes it in `new_session` (`game/src/engine.ts` sends only the seed and the roster today). Proposed wire, the version after API-57's: `NewSession.site: Option<Site>`, `Site {map, place}`. The server never reads `adventure.json`, so it checks only that the map has the place (`bad_request`); `start_campaign` in a site session is `bad_request`. DM-side setup; no view carries it.
- A site session has a memory and no contract part. New roster: day 1, contract 1. A roster whose world is on the same map with no contract under way: its memory is carried, the contract number goes up by one, the day moves on by one plus the walk to the place. A contract under way is `bad_roster`. A roster whose world is on another map starts fresh, as a campaign on another map does today. The site's clock does not move during the session.
- World crate (`travel.rs`): `Memory` gains an optional `left_at` (a place id; it does not exist today, the position lives in `ContractState.at`), and `SavedWorld.contract` becomes optional. `From<SavedWorld> for WorldState` and `carry_memory` need a contract part today; the carry takes its `from` from `contract.at` when there is one and from `memory.left_at` when there is not, and a memory-only state is never turned into a `WorldState` to resume.
- `save_roster` in a site session writes `world: {map, state: {memory}}`, with `left_at` the site's place. Roster format stays 2 and every roster saved before still reads.
- `start_campaign` on that roster treats a world with no contract part as a finished contract: the carry above, the next contract number, `trip_to_start` as today. Characters, purse and XP travel as API-45 saves them.
- `contract_start` stays absent for a site session, so "play the last journey again" is not offered for the Mill.
- Contract docs that change with it: the doc comment of `RosterWorld.state` (`{memory, contract}` becomes "`contract` absent when a site session saved it") and of `Roster.world`; `contract/protocol.md` §4.15, where `world` "is present once a campaign runs" gains the site session, with the load and save rules of this section.
- Fixture `site.jsonl`, on any place of the test map (no `pack_slot` is needed there): a site session writes a scene deed with contract 1 and day 1; `save_roster`; a second session starts the test campaign on that roster and its DM `world.deeds` lists the deed; the refusals.
- CHANGELOG: `1.0.0-dev.N+1: new_session.site {map, place} (ENG-44): a pack with no campaign writes deeds into its world's memory; a roster world may have no contract part. Additive.`

## 6. Failure

| What fails | What the party gets |
| --- | --- |
| A scene file breaks §4.2 rule 4 | `bad_scene` at load; `pack:check` and the fixture catch it in CI, not at the table |
| The Mill was not finished, or its roster not continued | no Mill deed or no `wenna_saved`: no Mill card, an empty arrival pile, Wendford as for strangers |
| The DM never calls the surrender | the yard is fought out: `yard_to_the_end`, which is what happened |
| The party loses a fight | no deed; the run ends as it does today |
| The model does not narrate the cause | the card's text carries it |
| No seat answers the card | today's fallback decides it and its deed is written; the report says how it was decided, and a fallback does not count for exit row 3 |
| The roster's world has a contract under way | `bad_roster`, with today's "finish that journey first" line |

## 7. Player-facing lines (for Vera, alone)

Working lines, third draft, read by Vera and Zoya (§13). Zoya's MAP-20 text replaces them and is read in both languages (`text_ru`, M12). Shown as the seat shows a card after M12.

**Card 1** (a goblin was taken alive)

> Up the lane the mill wheel is turning again. On the green stands Wenna, the miller's apprentice your company brought up out of the mill cellar. She is telling anyone who will stand still what she saw on the way out: a goblin tied to a post inside the mill, alive. Half the green does not believe her. Osric, the reeve who speaks for the village, does. He does not sound angry; he sounds like a man adding up. "Well, now," he says to you. "So one of them gave up, and your company let him live. A spared goblin is a debt. Which of you answers for him?"
>
> Choices
> 1. Say he gave up, and that was reason enough.
> 2. Say he was worth more alive than dead, and that was all.
> 3. Say nothing, and leave Wenna to be believed or not.
>
> Something else: say it in your own words.

Choice 1 keeps `mercy_to_yielded`; choice 2 breaks it.

**Card 2** (no goblin was taken)

> Up the lane the mill wheel is turning again. On the green stands Wenna, the miller's apprentice your company brought up out of the mill cellar. She is telling anyone who will stand still what she saw on the way out: goblins lying dead in the mill yard, every one. Half the green does not believe her. Osric, the reeve who speaks for the village, does. He does not sound angry; he sounds like a man adding up. "Well, now," he says to you. "Not one left alive to answer for taking her. I'd hear from your company how that came about."
>
> Choices
> 1. Say it was a fight, and it ended as fights do.
> 2. Ask him what he would have done with a goblin who gave up.
> 3. Say nothing, and leave Wenna to be believed or not.
>
> Something else: say it in your own words.

Changed for Vera's second read: Osric's question is a whole sentence and says "your company"; "tally" is gone and one line says how he sounds; "reeve" is glossed once; the text says who Wenna is to the party and where she saw what she saw; each choice carries its own words, so none needs the player to remember the yard or to have made the call there (run 1 is all AI, §12 item 6); card 2 no longer asks whether a goblin begged, which a party with a wolf last was never offered.

## 8. The exit pair and its rows (AGT-104)

As scope §4: run 1 *The Silent Mill*, `play:unattended`, all AI, a new named roster; run 2, only after run 1 passed with its flags ruled, *Fair in Wend* on that roster, `play:demo`, Stas as a Hired Blade, in M12's run language. Same build.

| Row | Run | Passes when | Read from |
| --- | --- | --- | --- |
| `m13-written` | 1 | at least two `deed_remembered` events in Mill scenes, each with `by`, day and contract, one of them `snitt_yielded` or `yard_to_the_end`; the roster was saved. It gates on run 1 alone | run 1's session log and run record |
| `m13-carried` | 2 | a Wendford arrival card whose `reads` holds an outcome deed (§4.2 rule 9) of an earlier contract that run 1's log wrote was decided by the Blades' word, not a fallback, and its choice wrote a deed; the judge answers yes to "does the DM name what the party did at the mill" and flags no contradiction | run 2's log (`card_shown.reads`, `card_resolved`, `deed_remembered`), run 1's log, the judge |
| `m13-readable` | 2 | the Vera fallback and Zoya each read the card with its narration as the seat showed it; both quoted verbatim | `seat.jsonl` (M12); the transcript if AGT-100 slipped |

The report prints the Mill deeds run 2's first DM `world.deeds` lists (where the saved memory shows; it gates nothing, §12 item 5), the card, its choice and its deed, and the lines. For `yard_to_the_end` it says "no goblin was taken", never "the party chose". `m11-thread` and `m11-memory` stay as written; `m11-memory` passes on the Mill card. Reported, not gated: p95, every deed written and read, the answer deed as "written, unread", `m12-own-move`.

Which yard deed run 1 writes does not matter to the exit: either has its card. The card run 1 did not reach is covered by §4.2 rule 7 only.

## 9. Out, and where it goes

As the scope's §3, unchanged. This design adds one line to the shelf: **a reader for the Wendford answer deeds**, to Arachas plus glue, owed on Zoya's board (§12 item 3). Not designed here: arrival without a draw, carrier B, `saw`, Snitt's fate, Scene 4 deeds, words in the own-move deed, ENG-45, MAP-13, deed from words.

## 10. PRs

Eight, as the scope counts them. No code or content PR merges before M12's exit pair has passed (scope amendment 1).

| PR | What it lands | Depends on |
| --- | --- | --- |
| 1 | Scope (table #348, merged) | - |
| 2 | This design and decision 0075 | 1 |
| 3 | Rows (Yan): API-57, ENG-44, MAP-20, AGT-104, ENG-45, the MAP-13 edit, milestone 13 in `TASKS.md` | 2 |
| 4 | Bible (Zoya): amendment 3; `examples.md` line 43 loses "Snitt freed", a fate no scene decides. The "Venna" typo is a no-op: the references no longer hold the word (checked on main), so it leaves the PR | - |
| 5 | API-57: §4.3 in Rule 1 order, the server, §4.2 rule 8's test | M12's exit |
| 6 | ENG-44: §5 in Rule 1 order (the wire field, the `RosterWorld.state` and `Roster.world` doc comments, protocol §4.15, fixture, CHANGELOG), the world crate's two optional fields and the carry, `site` in the adventure schema and `pack:check`, `game/src/engine.ts` passing it, §4.2 rule 7's test on the test world | 5 |
| 7 | MAP-20: the Mill's `on_end`, `npc` and `site`; the two cards with `text_ru`; the three prose lines removed (§4.4); §4.2 rule 7 on the shipped packs; Zoya's board check and Vera quoted | 4, 5, 6 |
| 8 | AGT-104: §4.2 rule 9, the three rows, the judge question, the report, the exit pair | 7; AGT-103 |

Beside the count: ENG-45 and MAP-13 (their own PRs), deed from words (three PRs, 0071).

## 11. Risks

- **Most likely to sink it: the roster hand-over.** Run 2's card stands on a memory-only world being carried into a campaign, a path no run has taken. Cheapest test: §4.2 rule 7 on the test world, written first in ENG-44, before any Mill content.
- **The all-AI Mill may never take a prisoner.** Then run 1 writes `yard_to_the_end`, the exit still passes, and the retelling in §1 is shown only by a seeded test. I do not design a nudge: a prompted mercy proves nothing.
- **The DM may tell Snitt's fate anyway.** The note bans it and the judge's contradiction check reads it; nothing prevents it before the seat shows it.
- **Which creature yields is the DM's call inside the engine's condition.** The engine lets the DM call the surrender with a wolf last; §4.2 rule 1 then writes `yard_to_the_end`, so the record stays true, but the scene's prose says a wolf never yields.
- **M12 slips.** As scope §7: without AGT-103 run 2 gates the M11 rows only; without AGT-100 `m13-readable` reads the transcript.

## 12. Decisions for Stas

Decided by Stas, 2026-11-13: all seven as recommended (he merged table #375; «мердж значит да»).

1. **How the Mill names its world** (decision 0075): the game passes `site {map, place}` in `new_session` from `adventure.json`. Recommended. Alternatives: a `site.json` the engine reads; a `campaign.json` for the Mill.
2. **A fight's end writes one deed, by ordered rules, and the world keeps the first outcome** (§4.1, §4.2 rules 1 and 2). Recommended: it is what makes the two cards exclude each other without a rule in the deck. The alternative, a free list of consequences per end reason, lets one fight write both.
3. **The Wendford answer is written and nothing reads it in M13.** The scope's In has the answer deeds and no reader for them; the run report is not one. Cost to the player: Stas answers the reeve and the world says nothing back in this run. Recommended: keep the scope, list the reader as owed on Zoya's board for Arachas plus glue (§9), and print "written, unread" in the report. The alternative adds to In: one `if` choice on a later *Fair in Wend* card that reads an answer. Zoya accepts it as a debt, not a pass (§13): the card fails card tests 3 and 4 until the answer-deed reader is on the Arachas plus glue board, and her page stays open until then.
4. **Two records ship with no reader in the packs, on the scope's word:** `killed_gritch` (until MAP-13) and `remember` on a scene check (fixture only; Scene 4 writes none). Recommended: accept both; each is one line of data or one match arm.
5. **Departures from the scope, to accept:**
   - two contract versions, not one: the site is its own PR and version;
   - ENG-44 is larger than the scope's S: a contract version with fixture and CHANGELOG, two contract doc comments and protocol §4.15, the world crate, the adventure schema, `pack:check` and the game. By what it touches it is an M; the price is Yan's;
   - `m13-written` gates on run 1's `deed_remembered` events alone; the saved memory is shown, not gated, in run 2's report from its first `world.deeds`, instead of opening the roster's world state, which the contract calls opaque;
   - MAP-20 also removes "Snitt's hungry band" from the `goblin_scouts` note in `hills.json` (§4.4), which the scope does not list;
   - the bible PR drops the "Venna" item (a no-op on main) and gains `examples.md` line 43.
6. **A challenge, made once, to §8 answer 1a.** The record will show Stas deciding a card about a yard the AI party fought in run 1. The loop is proven; the person who made the choice is not the one who meets it. No refinement fits M13 (it would cost Stas a 120-minute Mill sitting). Recommended: 1a stands; the Arachas plus glue exit has the human make a deed and meet its reader in the same pair. Vera's second read (summed up in §13) met it at the table: "did I spare him?"; §7's third draft gives each choice its own words so none needs the memory.
7. **`by` on a fight-end deed is every party-side participant, downed ones included** (§3 question 3). Recommended; the alternative is only those standing.

## 13. Vera and Zoya

Both came from the cloud fallback: Vera's from a general-purpose subagent given the body of `vera.md` and the two cards only, which may still see CLAUDE.md; Zoya's from one given the body of `zoya.md`. Vera read three drafts; her first two led to the rewrites (she did not know who "the Blades" were, card 2 gave her nothing to answer, Osric's question dangled, and both cards assumed she had made the call in the yard); below is her third read, of §7 as it stands. Zoya's board check read the first draft; where it says decision 0075 it said 0073 when written, renumbered after main took 0073 and 0074. Her card read is of §7 as it stands.

### Vera, third read (fallback), of §7 as it stands, verbatim

> **1. What I understood**
>
> Card 1: we come back to the village. The girl we got out of the cellar, Wenna, is on the green telling everyone that one goblin was left alive, tied to a post. The man in charge, Osric, believes her. He isn't angry; he's working out what it will cost. He wants one of us to say we'll be responsible for that goblin. I have to say why we let him live, or say nothing and leave Wenna on her own. I think I'd pick the first one, "he gave up, and that was reason enough", because that's what I'd say if I were really there.
>
> Card 2: same village, same girl, but this time she says every goblin in the yard is dead. Osric wants us to explain how that happened, because now there's nobody left to answer for taking her. I'd ask him what he would have done with one who gave up. That's the only choice that talks back, and it's what I'd say.
>
> **2. What I would ask aloud**
>
> - "Which of you answers for him?" (Card 1). He's asking for a name: which one of us. None of the three choices gives a name. They all explain *why*. So am I answering his question or dodging it? If I want to say "I do", it seems I have to use "your own words". I'd want to know whether that's what you expect, or whether I've misread him.
> - "A spared goblin is a debt." A debt to whom, and who pays it? To the village? Do we owe it, or does the goblin? I read it as "you're now responsible for whatever he does next", but I'm guessing.
> - "your company". For a second I read it as a business, like a firm. Then I understood it means the group I travel with. Fine, but it appears twice in each card, and the second time I still stumbled over it.
> - "the reeve". I know the word from Chaucer, and the card explains it ("who speaks for the village"), so no problem. I mention it only because a friend who doesn't read old English books would stop there.
> - "what she saw on the way out". I was there. Why is she the one telling the story and not me? Does Osric not believe *us*? Is he testing whether we'll back her up? If that's the point, I like it, but I'm not sure that's what's happening.
> - Card 1, choices 1 and 2: "and that was reason enough" / "and that was all". Two "and that was" endings one under the other. I hear them before I read them. They sound like the same answer said twice, though they aren't.
> - Card 1: "a goblin tied to a post inside the mill, alive". Did *we* tie him? I'd need to remember that from last time. If I'd forgotten, I'd be lost for a moment.
>
> **3. Where I became a passenger**
>
> Nowhere in Card 2. I chose, and I chose to answer back.
>
> In Card 1 I nearly did, at "Which of you answers for him?". He asks *who*, and the buttons only offer *why*. If I didn't think of typing my own answer, I'd press number 1 just to move on, not because it answers him. I wouldn't close the laptop.

### Zoya, board check (fallback), verbatim

> **Zoya Katz: board check, `wend`, with the M13 draft (Proposed) and decision 0075 among the files**
>
> Read: commandments, examples, compass-wend; the Mill's scenes and prose; *Fair in Wend*; `worlds/wend` (deck, npcs, customs). I edited nothing.
>
> **1. Consequence 2: does the table hear a cause?** Yes, on one condition. The cause sits in the card's own text, not only in the director's `note`, so the table hears it even when the model says nothing. That counts as a cause the table hears. `wenna_saved` only gates the card and is never counted as a pay-off, which is amendment 3 done right. Rule 9 keeps the yard deed an outcome. The condition is in item 3: the cause has to come from someone who saw it.
>
> **2. The board, Wendford rows**
>
> | Setup (quest, place) | Pay-off | Carrier |
> |---|---|---|
> | Mill S3, how the yard fight ended (`snitt_yielded` / `yard_to_the_end`) | *Fair in Wend*, Wendford arrival | deed plus card, MAP-20. **Paid** |
> | Mill S5 `wenna_saved` | none: a marker, it gates the card | struck as a pay-off (amendment 3) |
> | Wendford, the party's answer (one deed per choice) | **owed**: Arachas plus glue | none. Lev's decision 3 |
> | Mill S5 `killed_gritch` | **owed**: MAP-13 (`gritch_spared`), then a reader | none. Lev's decision 4 |
> | Mill S4, Snitt's fate and any promise made to him | **owed** (scope §3) | none |
> | Mill S4 checks (`knows_cellar_layout`, `boss_warned`) | struck for M13: both can run in one scene, so their deeds could contradict | none |
> | Mill S1, Osric's hidden loan | **owed**, older than this draft | none |
> | Mill S6, what Gritch said about the Hollow King, the lit barrows | **owed** to Arachas | prose only |
>
> The design pays one row and opens one, the answer deeds. Because nothing reads the answer, the card fails card test 3 (every choice changes something later) and card test 4 (no two choices end the same). Each choice writes its own deed, but nothing reads any of them, so at the table all three end alike. I accept this as a debt, not a pass. The page cannot close until the answer-deed reader is on the Arachas plus glue board.
>
> **3. The §7 card drafts.** These lines must change:
>
> - **Who saw it.** Wenna was tied up in the cellar during the yard fight, so she cannot tell the yard. She can tell what she saw:
>   - Card 1: change "and the goblin the Blades took alive" to the goblin she saw tied to the post by the hearth.
>   - Card 2: change "that not one goblin walked out of that yard" to the goblins she saw lying in the yard on her way out.
>   - On both cards, "the yard, the cellar" becomes what she saw: the cellar, and the yard afterwards.
> - **A goblin is a person** (World 3). In card 1, choice 1, "took it alive" becomes "him", as Snitt's own prose has it.
> - **The stake is not visible yet.** As written, the reeve only folds his arms and looks. That is a reaction, but nobody wants anything. Give Osric one line of want in his own voice ("Well, now"; he calls the party "the company"). His compass cell is Reeve's Tally (row 5, C2): he thinks of everything as a tally, a debt and who answers for it. The line must not ask or say what became of the goblin.
> - **"Let her tell it, and say nothing" costs nothing** (Story-space 3). Who pays for the silence has to be visible. The likely answer is Wenna, who stops being believed.
> - **A custom.** Card 1's choices touch `mercy_to_yielded`, so mark which choice keeps it and which breaks it.
> - **Guardrail 8** holds on both cards: nobody speaks or feels for the human's character, no verdict is given, no lesson is told.
> - **Lesser.** "By the well" repeats `toll_paid_word` ("stops the Blades by the well"). The wheel turning up the lane is the Mill's own image. The Russian glossary takes Венна (Венны, Венне, Венну, Венной) and староста.
>
> **4. Contradictions with the bible and the packs**
>
> - **Must go in MAP-20.** The `goblin_scouts` note in `worlds/wend/deck/hills.json` says "Snitt's hungry band". That tells Snitt's fate on the road and makes him a band leader. It breaks the design's own ban in §4.4, and in a world where `yard_to_the_end` was written, Snitt never existed. Add it to §4.4's list of prose canon to remove, beside `fw_wendford.md` and Osric's note.
> - `examples.md` line 43 still says the Mill's canon is "Snitt freed". That is a fate no scene decides. It goes in the bible PR. "Venna" no longer appears anywhere in the references, so that part of the bible PR may be a no-op: check before listing it.
> - Osric stays `attitude: indifferent` in `npcs.json` once the note goes, so after the Mill the card is the only sign that he knows the company. That is consistent with gap E being out; I note it, it is not a contradiction.
> - §1 and Lev's decision 6: the human answers for a yard he did not fight in. Story-space 1 ("never a passenger") is only half kept. It is owed to the Arachas plus glue exit, which is already on the shelf.
> - Nothing else in the design contradicts the bible. Decision 0075 is pure machinery and has no board effect.
>
> Cut: nothing. This page is a read, not a draft.

### Zoya, card read (fallback), of §7 as it stands, verbatim

> **Zoya Katz: card read of the §7 third draft (bf621b2)**
>
> All six of my item-3 points are met.
>
> - **Who saw it.** Met. Wenna tells only what she saw on her way out: in card 1 the goblin tied to a post inside the mill, which is Scene 4's post; in card 2 the goblins dead in the yard.
> - **World 3, a goblin is a person.** Met. Card 1 calls the goblin "him" throughout.
> - **Osric's voice and compass cell.** Met. "Well, now", "your company", "a man adding up", and "a debt… who answers for him" are Reeve's Tally (row 5, C2) without naming it. "A spared goblin is a debt" is his opinion, not the theme said aloud.
> - **The cost of silence.** Met. Choice 3 on both cards leaves Wenna "to be believed or not", and the green's doubt makes that cost visible.
> - **`mercy_to_yielded` marks.** Met on card 1. Card 2's choices touch no custom, which is correct.
> - **The stake.** Met. On card 1 Osric wants someone to answer for the goblin. On card 2 he wants to hear how it came about. Card 2's is the weaker stake, but it holds.
>
> Guardrail 8 holds: every choice is a "Say" or "Ask" the seat picks, with no verdict and no feeling given.
>
> **One watch, not a break.** Card 1's "Which of you answers for him?" invites the party to settle what became of Snitt in their own words. That is allowed. The director's note must still forbid the DM from saying it himself, as §4.4 already does. "Let him live" means at the mill only, and the note should say so.
>
> **"Taking her" holds in the Mill's files.** `adventure.md`: "They took the mill the morning Wenna arrived. Before they caught her she dropped the sluice gate", and the yard four are of the same band. In Scene 6 Osric hears that from Wenna. Card 2 is written only when no goblin yielded in the yard. Every cellar win leaves no goblin standing as well, since the cellar has no surrender. So "not one left alive" is true whenever card 2 comes.
>
> **New breaks of the bible:** none.
>
> **Still owed:** card tests 3 and 4 still fail, because no choice's deed has a reader (§12 item 3), and the hills `goblin_scouts` note ("Snitt's hungry band") must go in MAP-20.

Owed to MAP-20's text from the third reads: Osric asks *who* answers and the choices answer *why* (Vera's near-passenger point; the own-words line is the only way to name someone); "a debt" to whom; "your company" twice; the two "and that was" endings; the director's note says "let him live" means at the mill only (Zoya).

## Sources

Scope `docs/scope/dramaturg-mechanism-scope.md`; decisions 0043, 0063, 0066, 0071, 0075; the M11 and M12 designs. Code read: the contract's `scene.rs`, `events.rs`, `envelope.rs`, `roster.rs`; the world crate's `deck.rs`, `travel.rs`; the server's `session.rs`, `session/cards.rs`, `campaign.rs`, `adapter/game.rs`; the Mill's scenes and `adventure.json`; `worlds/wend`; *Fair in Wend*'s `campaign.json`; `game/src/play/verdict.ts`, `game/src/pack/check.ts`.
