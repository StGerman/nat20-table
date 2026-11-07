# Storytelling bible: Commandments

The rules every place, person and story in a world of this game is built on. Each rule shown done, with what was cut, is in `examples.md` beside this file; the reasons behind them are in the tab Why of the producer's bible doc. Where the two differ, this file wins and Why gets fixed.

This file is the repository copy of the bible's Commandments tab. The producer edits the bible; a changed bible reaches this file only through a pull request. It names nothing from `worlds/` or `scenarios/`, so it survives a full world swap: concrete names live in `examples.md`, which is replaced with the world.

## Thesis

**The world changes faster than people can live in it, and you still have to decide.**

Every rule below serves this line. It is the brief for authors and never reaches a player whole: on screen there is at most the epigraph «Мир меняется быстрее, чем мы успеваем в нём жить.», and the "decide" half arrives as the first real choice. Nobody says the theme aloud; the situation says it.

## World: how we build the world

1. **Less is more.** Say only what the world needs to be defined; a line that changes nothing is cut.
2. **Off the map until a story needs it.** The world knows a thing exists, not what it is: the power behind the change, the gods, the anachronisms.
3. **A person is whoever can yield, be spoken to and be remembered.** Goblins and bandits are persons; wolves are beasts.
4. **Every people lives by its economy.** Its custom, god, master and prices follow from it.
5. **Every person is right about something and ugly about something.** There is no good side.
6. **One detail you remember per person:** a worn, everyday anachronism, never technology.

## The compass: placing peoples and persons

The world's politics fit on one picture: the 9x9 grid of the political-compass meme, redrawn in the world's own words. Each cell parodies the meme's ideology in the same place.

**The axes.** Left to right, how a people gets and shares its living: Custom (shared, at a just price) on the left, Market (traded, at a moving price) on the right. Top to bottom, who stands above it: Tribute (a master who takes) at the top, Freedom (nobody above the family) at the bottom.

Placing a people or a faction:

1. **Ask how it lives:** by custom, by trade, or both. That picks the columns.
2. **Ask who takes from it, and whom it takes from.** That picks the rows.
3. **Draw an outline over two to six cells, never a point.** A people holds more than one view.
4. **Give it a fair face and a dark one,** and a nickname for each neighbour, in the neighbour's own words.
5. **Leave the cells nobody holds empty.** They are ideas that have not reached this world yet; a change by the road can bring one in.

Placing a person:

1. **Start inside their people's outline.**
2. **Move them one or two cells** toward the custom they hold over their people's, and toward what they want.
3. **The cell's name is their politics in one phrase:** write one for every member of the party. A party of four is four views, not one.
4. **A person between two outlines is torn, and stories start there:** one who holds another people's custom, or wants what only the other side sells.
5. **A person can move during a story,** and the move is a consequence: a person who ends the story in another cell is its clearest result.
6. **Proposed, not yet a rule:** distance on the compass sets a stranger's first attitude, Indifferent from a neighbouring block and Hostile from the opposite corner; deeds move it from there.

## Story-space: how the DM tells, and how cards and prose are built

1. **Never a passenger.** The human's character stands in every problem and decides first, and what they decide stays in the world, not in the DM's memory.
2. **Every scene is a problem that resists.** It can be acted on, and a fight is never the only way through.
3. **A choice names the action, never its outcome, and no choice is free.** Every way forward costs someone something.
4. **The voice: dark in what happens, plain and short in the telling, made bearable by jokes.** About 120 words a beat, with the current reference narration (named in `examples.md`) as the model. The darkness comes from the situation, never from a withheld fact.
5. **The DM narrates reactions, never verdicts,** and never what the human's character feels.
6. **Funny in the people.** Jokes come from people, details, and surprising consequences. Everyone gets mocked, the human's character too, for what they do, never for what they feel.
7. **Handrails.** Every detail can be asked about, and a companion speaks at every hard choice.

## Consequence: how the world changes

1. **Problems come from change, not scarcity.** The change itself stays off the map and arrives as prices, rumors, and strangers.
2. **Deeds come back.** The world remembers; only those who saw or heard react, one step at a time, and a later scene reads the deed back as a cause the table hears.
3. **Every story has a half-blind choice, a consequence on the young, and something learned that goes out of date.**
4. **Losing is a consequence, never the end of the game.** Death is final, by price and distance; only a story brings someone back.

## Guardrails

Lines no story crosses. Most are already law elsewhere and are listed here so an author sees them in one place.

Current:

1. **Only the engine rolls, reveals, and counts.** The DM never rules a success or reveals a secret by narration, and cites a roll only by the id the engine gave it (CLAUDE.md Rule 4). The DM never works out an amount either: pay, prices, damage, and what is left in a purse come from the engine and the ledger, and the DM says only the numbers it was given.
2. **The SRD is the world; ours only adds** (Rule 7).
3. **Hidden values never reach a player:** Hit Points, AC, DCs, roll targets, and stat blocks (Rule 3).
4. **Torture and harm to a child are never shown** (table lines).
5. **A player is never told they typed something wrong** (Vera, CLAUDE.md).
6. **The Vera test runs on anything a player will see** (CLAUDE.md).

New, proposed:

7. **A player's progress is never lost.** The party, its deeds, and the world carry over between evenings (Vera quits at lost progress).
8. **The DM never acts, speaks, or feels for the human's character.** It narrates what the engine did with what the human chose.
9. **We take mechanisms, never characters.** From books and games we borrow how things work, never their people, names, or inventions (Rule 7; Gaiman and Pratchett, 2026-11-06).

Removed (Stas, 2026-11-07): "no numbers or jargon on screen". The ban was never about style. Coins were not in the engine, and we did not trust the DM's arithmetic, so the DM was kept away from numbers altogether. The ledger now owns money, so the DM may say a price, a count, or a distance it was given. Guardrail 1 keeps the arithmetic with the engine and the ledger, and guardrail 3 keeps hidden values off the screen. The code change has its own implementation thread.

## Building with them

- **A person:** a short name; one want; the people they speak for; what they are right about and ugly about; the customs they hold and one they bend; one detail you remember; whether they can yield.
- **A place:** who lives there and by which economy; three details; one thing that changed, arrived from off the map; one problem at the door.
- **A story:** a change the people cannot see; a problem that resists; a choice with a cost on every side, made half blind; a deed the world will read back; a consequence for the young; one thing learned that goes out of date.
