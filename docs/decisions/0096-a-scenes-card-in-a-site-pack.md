# 0096. A scene of a site pack may put one deck card on the table

- **Status:** Proposed
- **Date:** 2026-11-23
- **Decided by:** Lev Neiman proposes option A in `docs/design/the-godmother-system-design.md` §5.2. Stas decides; the merge is his yes.
- **Touches:** [0075](0075-site-pack-joins-world-memory.md), whose "Revisit when" this is: a second pack with no campaign needs a card inside it.

## Context

The scope has the decision about Nell as a deck card in scene 6 (`docs/scope/the-godmother-scope.md` §2 item 7) and asks whether the promise in scene 4 is a check or a card (§6 question 2). A scene writes a deed only from a check, a fight's end or a death (Milestone 13 design §4.1), so a decision with no roll needs a card. Facts checked on c617f9c:

- The pack is a site pack, like *The Silent Mill*: `adventure.json` with `site`, no `campaign.json`.
- Every card command needs a campaign. `choose_card` answers `no_campaign`; the server's card code reads the campaign's world in 85 places; the card is shown in `world.card`, and `State.world` exists only after `start_campaign`; the game's card round runs only in a campaign.
- A site session already holds a world memory with a deck state in it (ENG-44), and the deck files are on disk beside the map it reads.
- The engine already puts a card on the table without a draw: the merchant's death card (`put_card`, ENG-49).
- A campaign with no escort never counts as finished, so the next pack would be refused with "finish that journey first".

## Options

### A. A scene names its cards; a site session serves one (proposed)
A scene file lists card ids in order. When the scene loads in a site session, the first listed card whose own `if` and `unless` hold goes on the table, and the seats answer it as they answer a road card. The card is an ordinary chained card of the pack's deck.
- Pro: the player meets the same card, the same vote and the same "say it in your own words" as on the road; the deed is written by the seats' word, never by the DM's.
- Pro: one card carries scene 2's coin, scene 4's promise with its roll, and scene 6's decision, with the typed effects cards already have.
- Con: the largest engine piece of the milestone. A site session must load the deck, run the card commands and show the card in state; the game's card round must run without a campaign.

### B. The pack becomes a campaign pack
- Pro: no card work in the engine; place people, `mention` and the world view come with it.
- Con: it needs a caravan, an owner and an escort that settles, or the world never leaves the contract. Without `travel` the world says the party is at Wendford while it stands under the oak; with `travel` every leg draws a road card, which the scope puts out. The loop and the DM prompt have no mode for scenes with exits inside a campaign.

### C. No card in the pack; the decision waits on the road
Scene 6 ends with Nell held. The decision is a Wendford arrival card on the next contract, and its reader a card on the one after.
- Pro: nothing is built.
- Con: the dawn scene ends without the player's decision, and the scope's goal needs two more contracts to show.

### D. The decision as a scenario check
One check per option, each writing its deed on success and on failure.
- Pro: nothing is built.
- Con: which check runs is the DM's reading of the table, so the deed rests on the DM's word, which the Milestone 13 design rules out; two checks can run in one scene and contradict.

## Decision

Proposed: A. It is the only option where the decision is made at dawn, in the pack, by the seats, and recorded by the engine. C is the cut if the engine work is too much for this milestone.

## Consequences

- Contract: `SceneFile.cards`, the card in a site session's state, the human's creature in `new_session` for a tied vote (design §8). Additive.
- A scene card may only `remember`, `check` and `pay`; it is `target: blades`, `chained` and `once`. A scene that lists cards declares no encounter.
- The pack ships a `deck/` folder; the validator across packs (Milestone 13 design §4.2 rule 8) counts its effects as writers.
- The card bench (0084) does not reach a scene card: `play:scene` does.
- People views in a site session (`world.npcs`, the `remembers` lines of 0077) are not part of this; they belong to the registries milestone.

## Revisit when

- The registries design gives a site session the world's people: then the card moves under the same view, and `scene_card` is retired in a breaking line.
- A second site pack wants a card drawn from a pile, not named by a scene: then B for that pack.

## Sources

- `docs/design/the-godmother-system-design.md` §5.2 and §16 item 1.
- `crates/nat20-api-server/src/session/cards.rs`, `campaign.rs` (`SiteWorld`, `Campaign::read`); `crates/nat20-world/src/deck.rs` (`put_card`); `game/src/table/loop.ts` (`cardRound`).
