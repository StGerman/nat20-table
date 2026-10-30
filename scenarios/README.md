# Scenario packs

An adventure is a scenario pack: a folder the game loads from any path (decision 0031, M6 spec §4). Each folder here is one pack; a pack can just as well live in its own repo or a private folder.

```
<pack>/
  adventure.json   the skeleton: format_version, scenes in order, exits, NPCs, check hints,
                   target times, the prose files it uses (schema: game/schema/adventure.schema.json)
  prose/           Markdown the DM reads as written; prose/npcs/ has one file per named NPC
  scenes/          the engine's scene files, one per scene (contract-typed, protocol §2.1)
  cards/           personality cards, one per party member an AI may play
  README.md        credits, licence, scene list
```

Shared setting text goes in `lore/` at the repo root; a pack names the lore it uses in its skeleton.

A personality card is the only character text in an AI player's prompt besides its sheet. It is a `# Name` heading, a sentence on who the character is, and these `##` sections (`CARD_SECTIONS` in `game/src/pack/adventure.ts`; `pack:check` refuses a card that lacks one):

- `## Goal`: what the character wants from the adventure.
- `## Temperament`: how it meets people and trouble.
- `## Quirk`: one habit the others notice.
- `## With the party`: its view of each companion at the start.
- `## Voice`: how it talks.
- `## Talk and silence`: four lines, "Speaks when…", "Acts without a word when…", "Stays silent when…", "Turns to the others…" (party talk §4.5).

A card may add `## Voice in Russian`: how the character sounds in Russian, in our own Russian words, with a line or two of example speech and the words it never uses. The cards are English and a Russian run (`--lang ru`) otherwise translates the voice word for word ("my dears" becomes a grandmother's «мои дорогие»). Only a Russian run's prompt carries the section, after its language rule; an English prompt never sees it.

Any character may be played by an AI, so the human's character gets a card too. `cards/torva.md` is a worked example.

To make a pack, copy an existing one and change it. To check one, here or anywhere else:

```bash
cargo build -p nat20-api-server
npm run pack:check -- <pack folder>     # no folder: every pack in scenarios/
```

The skeleton's type is `game/src/pack/adventure.ts`; after changing it, run `npm run pack:schema` and commit the regenerated schema. A change that old packs can't read bumps `format_version`, and the game keeps reading the old version until those packs are migrated.

A pack committed to this repo carries only our own text or CC-BY text (Rule 7). A private pack built from a published adventure stays outside the repo.
