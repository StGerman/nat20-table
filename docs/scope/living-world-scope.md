# Living world: scope

Status: accepted by Stas. Decisions D0 to D4 on 2026-11-01 (Milestone 9 spec), S1 to S4 on 2026-11-02 (Milestone 9 system design), Q1 to Q7 on 2026-11-06 (Milestone 11, §8). Owner: Stas.
Companion documents: the system design `docs/design/m9-system-design.md` (how it is built), decisions 0057 (where the world rules and the bookkeeping live) and 0058 (who the human plays in the first session). Commentable copies: spec https://claude.ai/artifact/T3cwJH8snR6q9GXj1Mnedu, design https://claude.ai/artifact/526ws4LhGXdCB9ZVz7ZiYo. For Milestone 11 (§8): the spec and system design `docs/design/m11-system-design.md` (commentable copy https://claude.ai/artifact/VEh7rGHVVWmXntPNYuWw5Q) and decision 0063.

This scope sits beside `docs/scope/demo-run-scope.md`; it does not edit it (D0). The demo scope stays frozen, so the Demo Run's acceptance stays checkable on its own terms. Where the two disagree, this document governs Milestone 9 and later work, and the demo scope governs the Demo Run.

## 1. Bottom line

1. **Money, things, time, the road and experience become engine state**, not the DM's words. Rules 1, 3 and 4 do not loosen; one invariant is added: coin and items appear and disappear only through recorded events, and the ledger balances to the copper.
2. **Two roles at the table.** The Merchant leads the caravan; the Guards, also called Hired Blades, escort it. In the first session the human plays a Hired Blade, and the merchant is an NPC or an AI player (S4, decision 0058).
3. **Three loops, held together by time and survival:** adventure (exists), trade (the escort contract now, markets later) and growth (XP, level 3, a roster that outlives a run).
4. **The test bed is a new sandbox, *Fair in Wend*,** on a hand-written map of the Wend valley that later carries *The Lair of Arachas* too (D3). *The Silent Mill* stays the regression run.

## 2. What the table must do

### 2.1 Things change hands
- Every character has a purse on the sheet. Coin and items move only through engine commands: give, steal (Sleight of Hand against passive Perception), loot (the fallen creature's `carries`), wages.
- The DM may place an SRD stat block from the pack's allowed list and start a fight outside the scene file. The DM never names an amount of coin.

### 2.2 Days pass
- A world clock (day, watch) that only engine commands move: travel, the night, waiting.
- A graph map of places and roads. Travel time follows SRD pace and the caravan's load. Undiscovered places exist only in the DM view.
- The caravan is one or more wagons (SRD Cart or Wagon), each with its own cargo and limit; the slowest wagon sets the pace.
- The night is an inn (a fee) or a camp (rations from the cargo, a watch, a night card). Long Rest follows SRD 5.2.1, including the 16 hours between Long Rests. Going hungry follows the SRD Malnutrition rule and leads to exhaustion.
- A road event deck: every leg and every night in camp draws a card (a roll with an id); a card offers 2 or 3 choices that the engine resolves; places, NPCs and packs add their own cards. Players see the card's text and choices, never the deck. A caravan card is the owner's call after asking the party; a Blade card is the Blades' own vote; with a human at the table, no card resolves without them (decision 0058).

### 2.3 Heroes grow
- Level-up choices come in plain words, one line each, with a recommended pick.
- The engine awards XP by CR and splits it by the SRD rule.
- Level-up runs through the engine, with prompts the player answers. Milestone 9 completes level 3 in core for all four pregens (S3, CHR-12): Life Domain, Evoker, Berserker Frenzy, domain spells and level 2 spells. Today only the Champion is done.
- A roster file carries the party between runs: XP, choices, purses, gear, exhaustion, the caravan and the day. HP is not stored. A hash chain in `run.json` catches a hand edit. The roster is written on every exit and after every night.
- Place NPCs persist as records between visits; they act only while the party is in their place.

### 2.4 The escort contract
- The merchant hires the party. Each Hired Blade is paid the SRD skilled-hireling wage, 2 GP a day, from the merchant's purse, one ledger entry per Blade. The terms (an advance, the rest on arrival) are in the sandbox's `campaign.json`. A fallen Blade is paid for the days served.
- `campaign.json.caravan_owner` names who leads the caravan: a player or `npc:<id>` (S2). With an NPC owner the engine follows the sandbox's route, any Hired Blade says "we move on", and the DM never calls travel, rest or card commands.

## 3. Rules sources

- **SRD 5.2.1 rules on creatures live in core** on the fork's `demo` branch: purse arithmetic, passive checks, XP, exhaustion and Malnutrition, Long Rest, townsfolk stat blocks, level 3 (decision 0057).
- **SRD tables about the world live as attributed data** in the table crate `nat20-world`: travel pace, vehicles, rations, prices. The Trade Goods table comes from SRD 5.1, since 5.2.1 has none (a 2014 fill under Rule 7).
- **Our own rules beyond the SRD** (the deck, later markets and haggling) are allowed only labelled as variant rules and switched on per campaign (D2). Their text is ours.
- Every roll, from core or from the world, uses the one session RNG and gets an `rN` id.

## 4. Out of scope

Out of Milestone 9: crafting and tools; reputation; our own shop with a hired AI shopkeeper (later, M17); markets with haggling and the orders board (the second sandbox, API-46); the `/ledger` panel (with markets); the road generator (the first step of the Arachas milestone); new pregens and backgrounds (D4); crimes in the Mill (MAP-5); NPC schedules between visits.

Still out of scope, as in the demo: character creation; vision and darkvision; Hide and Stealth; grappling; Weapon Mastery; Heroic Inspiration; magic items beyond Potions of Healing; graphics; voice; more than one human; saving a whole session (the roster is a partial save of the party, not of the session).

This scope brings in, against demo scope §5: loot and coin changing hands, long rests, level-up from 2 to 3, a roster between runs, subclasses at level 3, and stat blocks beyond the demo's four monsters.

## 5. Acceptance (the Milestone 9 exit)

Two runs of *Fair in Wend* on one build, one with every character an AI player and one with Stas as a Hired Blade. In each:

1. 3 game days in 120 minutes or less.
2. At least 2 journeys on the map, the escort contract done with the pay in the ledger, 1 road event and 1 fight outside a scene.
3. The party arrives with the previous run's roster.
4. Every roll cited; the ledger trial balance holds to the copper against core purses; the roster hash chain holds.
5. 0 leaks: no hidden field, deck content, undiscovered place, unlooted `carries` or another player's theft in a player view.
6. AI player turn p95 and DM narration p95 measured and compared with the phase 0 baseline (a report, not a gate).

Not checked by the exit: level 3 is out of reach in three game days (about 1,550 XP for the party). Level-up is checked by a contract fixture and one hand run with a roster near the threshold.

## 6. Order

Four phases, each ending in a run on Stas's Mac and a regression of *The Silent Mill* on `play:cheap`. Phase 0 is hygiene and the DM latency fixes; phase 1 is things changing hands (the old Milestone 9); phase 2 is days passing and heroes growing; phase 3 is the escort contract and the sandbox. Rows and their phases are in `TASKS.md` § Milestones, row 9.

## 7. Risks

- **One scene at a time stays.** Travel loads the next scene with the party; a place's NPCs live in core only while the party is there.
- **Latency.** DM narration p95 was 9.3 s against 6 s on the demo models before this milestone (AGT-77 run); every road event adds a call. Phase 0 fixes the baseline first.
- **Cost.** A multi-day sandbox is longer than the Mill: above about $11.50 a run on `play:unattended`. The day limit in `campaign.json` bounds it.
- **LLMs and money.** Agents do no arithmetic; they get finished totals. The narration judge checks narrated coin against the ledger.
- **Vera.** Pay at the table must sound like a scene, not a table of numbers; as a Hired Blade she never reads a price list.

## 8. Milestone 11: Word on the road

Accepted by Stas on 2026-11-06 (Q1 to Q7, decision 0063). How it is built: `docs/design/m11-system-design.md`. Input: the Faces of the Road deck doc (https://claude.ai/artifact/89fYVEn1nvGmUH64vmP5LJ), decisions 1 to 12.

### 8.1 Bottom line

1. **The road remembers.** A choice on a card writes a **deed**; later cards and arrivals read it (`if`, `unless`). Deeds stay DM-only: players remember what they did through the story.
2. **The DM picks the card that continues the story.** The engine rolls three cards; the DM picks one and logs why. Without an answer, the engine takes the first card rolled.
3. **The world outlives a contract.** The memory (clock, deeds, deck, place NPCs, discovered places) is kept; only the contract (caravan, escort, position) is rebuilt from the next pack. A `once` card is gone for the world.
4. **A Blade can scout ahead:** a Wisdom check, Perception or Survival as the card ahead names it, against the terrain's Search DC (SRD 5.2.1); a success shows the card before the caravan meets it.
5. **Every scene opens on a problem for the human's character** (the five story-space rules in the DM prompt; the five card tests on every card).
6. **A second pack, *The Way Back*:** the next contract in the same world, up the valley with a new merchant, Fenn Lusk; each merchant may bring a few cards of their own in the pack.

### 8.2 Out of scope

Hearsay, road NPCs, addressed cards, fight outcomes and NPC schedules (until this cut has been played once); variants (per-case choices do the job); foretell for the DM alone; live DM cards; a real party split on the map; Russian TUI lines (decision 0038); a converter for old rosters (a roster saved before Milestone 11 is refused, and the party starts new); core work; latency gates.

### 8.3 Acceptance (the Milestone 11 exit)

Two runs on one build: *Fair in Wend* with every seat AI on a new roster, then *The Way Back* on the same roster with Stas as a Hired Blade. In each:

1. The Milestone 9 rows that still apply: the contract done and paid in the ledger, the trial balance, every roll cited, 0 leaks, the roster hash chain, the contract in 120 minutes or less.
2. At least 3 road cards and 1 arrival card decided, each DM pick with its logged reason.
3. At least one deed written by a choice and read later in the same run.
4. No story-space flag from the narration judge that Stas confirms; the Vera test reads one scene opening and one deed-reading card from each run and is quoted verbatim.

In run 2 also:

5. At least one card or arrival reads a deed written in run 1.

Reported, not gated: p95 against the Milestone 9 pair, every fight, the draw-three counts, the DM's suggested cards. Fights are a recommendation, not a gate (Stas, 2026-11-06): the Milestone 9 row "1 fight outside a scene" does not carry over.

### 8.4 Order

Five phases, in one stack merged after the exit pair: the world crate, the contract and server, the table, the content, the exit. The docs (CON-18) merge first on their own. Rows and their phases are in `TASKS.md` § Milestones, row 11.

## Sources

- Milestone 9 spec, D0 to D4 (Claude Doc above; Markdown copy in the project files, `engine/m9/m9-spec.md`).
- `docs/design/m9-system-design.md`.
- SRD 5.2.1: Travel Pace, Long Rest, Exhaustion, Malnutrition, Hirelings, Mounts and Vehicles. SRD 5.1: Trade Goods.
- Milestone 11: `docs/design/m11-system-design.md`, decision 0063, the Faces of the Road deck doc (above). SRD 5.2.1: Search, Travel Pace, Travel Terrain.
