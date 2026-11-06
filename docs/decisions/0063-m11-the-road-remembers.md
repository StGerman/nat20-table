# 0063. Milestone 11: the road remembers

- **Status:** Accepted
- **Date:** 2026-11-06
- **Decided by:** Stas, in the Faces of the Road thread: start cards 3 and 4 (15:25Z), Q1, Q3 and Q5 on decision cards, Q2 and Q6 in his message of 16:44Z, Q4 on a decision card (17:04Z), Q6 again at 17:09Z ("too strict ... it's just a recommendation"), and "Ок" at 17:16Z for Q7 and the whole Milestone 11 design

## Context

Milestone 9 closed (decision 0060) with a road that forgets: a card is drawn at random, decided and dropped, and `Campaign::read` throws the whole `WorldState` away when the saved contract is done, so a second contract starts in a valley that never saw the first. The Faces of the Road deck doc (decisions 1 to 12) asks for deeds that later cards read, a DM who picks the card that continues the story, and a world that outlives a contract (its decision 10, firm). Milestone 11 builds that first cut; `docs/design/m11-system-design.md` says how.

The design left seven questions and two start cards for Stas. Constraints: Rules 1, 3 and 4 hold (deeds and picks are DM-only; the engine rolls every check, the scout included); a card offers 2 or 3 choices and a deed-dependent choice replaces one, never adds one (the deck rule since table #282); the ruleset is SRD 5.2.1.

## Options

### Card 3. The exit
- **A. A pair of runs on one build, as in Milestone 9; run 2 continues run 1's world (chosen).** Pro: the only way to prove exit row 5, a run-2 card reading a run-1 deed. Con: run 2 depends on run 1, so a failed run 2 needs a replay from run 1's world.
- **B. One run.** Pro: cheaper. Con: proves deeds inside a contract only, which is half of the milestone.

### Card 4. Old rosters
- **A. A converter from roster format 1.** Pro: a saved party survives. Con: code for rosters that only Stas and the exit runs have; the world split changes the blob's meaning, not only its shape.
- **B. Roster format 2, format 1 refused with one plain line, a new party (chosen).** Pro: no converter to write or test. Con: Stas's saved `wend` party is lost; acceptable before friends and family have a saved party, not after (the next format change needs a converter).

### Q1. How long does a `once` card stay gone?
- **A. For the world; `once: "contract"` opts a card back in each contract (chosen).** Pro: the dead toll men stay dead; the bridge's second visit is told by cards that read its deeds. Con: a card a pack wants back each contract must say so.
- **B. For the contract only.** Con: the dead toll men would be back at the bridge next contract.

### Q2. Where and when does the next contract start?
- **A. A second pack, *The Way Back*, from where *Fair in Wend* ends; the clock carries on (chosen).** A new merchant, Fenn Lusk, takes salt and iron from Saltmouth up to the Highsteads; the next contract starts at the pack's start hour on the day after the saved day; a party elsewhere travels there at a normal pace, told in one line; a roster with a contract under way refuses any other pack. Pro: the party sees the road home and meets the people the road down left behind. Con: a second pack to write (MAP-12).
- **B. Odda's start place again, with the way back told in one line.** Con: run 2 replays run 1's road.
- **C. Reset the clock to day 1.** Con: deed days would lie.

### Q3. Build variants (deck doc change 5)?
- **A. No; per-case choices with `if` and `unless` (chosen).** Pro: one way to write a case, inside the 2-or-3 rule.
- **B. Variants too.** Con: small after deeds, but a second way to write the same thing.

### Q4. What check does scouting take?
- **A. By the card ahead (chosen).** The card names `perception` (a creature or a person) or `survival` (tracks, a trail, a hazard), as the SRD 5.2.1 Search table splits them; DC = the terrain's Search DC (15 on every Wend road; no `scout_dc`); Normal pace, so no Advantage; the card is drawn first, so a failed scout meets the same card unwarned. Pro: true to the SRD, no hidden guess for the player. Con: a public Perception roll hints that something alive is ahead, as a real DM's request for the check would.
- **B. The player picks the skill; a wrong pick finds nothing.** Con: a hidden guess for Vera.
- **C. Always Survival.** Con: the SRD gives creatures to Perception.
- **D. A group check.** Con: the whole party cannot ride ahead and guard the cart.

### Q5. What if the DM does not pick from the three?
- **A. The engine takes the first card rolled, and the report counts it (chosen).** Pro: a slow wake costs nothing; the count shows a broken wake.
- **B. A random one of the three.** Con: hides a broken DM wake.
- **C. Fail the run.** Con: one slow wake should not cost a two-hour run.

### Q6. Keep Milestone 9's "1 fight outside a scene" exit row?
- **A. More fights as a recommendation, not a gate (chosen).** No exit row asks for a fight; the DM's pick rule prefers the card that can come to a fight when two continue the story equally well; the card validator warns, never fails, on a route with fewer than two fight cards; the run report counts every fight. Pro: Stas wants more fights without controlling them. Con: a run can pass with none.
- **B. A gate: one card fight in each run.** Con: "too strict" (Stas, 17:09Z).
- **C. Drop fights from the design and only report them.** Con: Stas wants more fights, not fewer.

### Q7. Where do a merchant's own cards live?
- **A. In the merchant's pack, `scenarios/<pack>/deck/`, joining the world's deck while that pack's contract runs (chosen).** Three for Fenn in *The Way Back*, one for Odda in *Fair in Wend*; card ids unique across the world and its packs; the memory keeps their state by id. Pro: a merchant's people travel with the merchant; the world deck stays one shared deck. Con: the validator reads one more folder.
- **B. An owner field on cards in the world deck.** Con: puts each pack's people into the shared deck.
- **C. Cards by direction, up or down.** Con: the direction is already in the zones, and the merchant is the one who wants something.

## Decision

Card 3 A, card 4 B, and Q1 to Q7 option A each, as above. Together they make the world's memory the thing Milestone 11 proves: deeds survive the contract (Q1, card 4), the second contract is a real one on the same map (Q2, Q7, card 3), the DM's pick and the scout stay inside the engine's rolls (Q4, Q5), and fights are encouraged without becoming a quota (Q6).

## Consequences

- `WorldState` splits into the memory and the contract (ENG-37); roster format 2 (API-51) refuses format 1 with `bad_roster`; the start question gains *play the last contract again* (API-51).
- New deck fields and effects: `remember`, `if`, `unless`, `soon`, `when: arrival`, `scout`, `note`, `once: "contract"`; a fight monster may name an NPC (ENG-33 to ENG-36, ENG-38).
- New wire: `pick_card`, `scout`, `cards_offered`, `card_scouted`, `deed_remembered`, `WorldDm.deeds`, `WorldDm.offered`, from contract 1.0.0-dev.59 (API-52 to API-54).
- New content: 29 cards and the pack `scenarios/the_way_back` with Fenn Lusk (MAP-10, MAP-12); the validator's two static card tests and the fight warning (MAP-11).
- The Milestone 9 exit row "1 fight outside a scene" does not carry into Milestone 11 (`docs/scope/living-world-scope.md` §8.3).
- The next roster format change after Milestone 11 needs a converter (card 4, Vera).

## Revisit when

- Q5 or Q6: the draw-three counts after exit run 1 show the DM taking the mildest card or dodging fight cards; fall back to the deck doc's weighted draw.
- Q4: the scout's skill hint spoils cards in play, or Vera does not understand *Scout ahead*.
- Card 4: anyone outside the exit runs has a saved party.
- Q7: a merchant's cards need to appear outside that merchant's contract.

## Sources

- `docs/design/m11-system-design.md` (Decisions in this design; commentable copy https://claude.ai/artifact/VEh7rGHVVWmXntPNYuWw5Q).
- `docs/scope/living-world-scope.md` §8.
- The Faces of the Road deck doc, https://claude.ai/artifact/89fYVEn1nvGmUH64vmP5LJ (decisions 1 to 12).
- Decision 0060 (the Milestone 9 exit pair), 0058 (the human plays a Hired Blade), 0062 (the human votes first).
- SRD 5.2.1: Search action and table, Travel Pace, Travel Terrain.
