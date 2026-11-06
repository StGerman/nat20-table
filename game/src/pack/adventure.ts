// A scenario pack's skeleton, `adventure.json` (M6 spec §4, decision 0031, TASKS.md MAP-4): what
// can break the game, typed and checked; everything else is Markdown prose the DM reads as written.
// The engine never reads this file, so its type lives here, not in the contract crate. Packs depend
// on the JSON shape and `format_version`, not on where the type is defined. The JSON Schema in
// `game/schema/adventure.schema.json` is generated from this file (`npm run pack:schema`).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** The skeleton versions this game reads. A format change adds one and keeps reading the old. */
export const FORMAT_VERSIONS = [1, 2] as const;

/** The first format with `stat_blocks` (API-33, AGT-24): a pack of format 1 may not list them. */
export const STAT_BLOCKS_SINCE = 2;

/**
 * The first format whose coin and items change hands at the table (ITM-6): its DM gets `give`,
 * `steal` and `loot`. *The Silent Mill* (format 1) keeps the Demo Run's scope, where loot is out.
 */
export const GOODS_SINCE = 2;

/**
 * The sections of a personality card (CHR-5), each a `## ` heading under the card's `# Name`: the
 * player prompt names some of them, so `pack:check` refuses a card without all of them.
 */
export const CARD_SECTIONS = ["Goal", "Temperament", "Quirk", "With the party", "Voice", "Talk and silence"] as const;

/** A note for people editing the file. Allowed on the file and on every section. */
const comment = z.string().optional().describe("A note for people editing the file; the game ignores it.");

/** A file in the pack, relative to the pack folder, e.g. `prose/s1_village_green.md`. */
const packPath = z.string().min(1).describe("A file path relative to the pack folder.");

/** A plain name, as the engine's ids are: letters, digits, `_` and `-` (protocol §2.1). */
const id = z.string().regex(/^[A-Za-z0-9_-]+$/, "a plain name: letters, digits, _ and -");

const PartyMember = z
  .strictObject({
    _comment: comment,
    handle: id.describe("The character's creature handle in the first scene's file."),
    seat: z.enum(["human", "ai"]).describe("Who plays it by default: the human, or an AI player agent."),
    card: packPath
      .optional()
      .describe("Its personality card (CHR-5): the only character text in an AI player's prompt besides its sheet."),
    names: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "What the table calls the character, every form of it: its name in each language and each case («Торва», «Торве», «Торву»). A line that names an AI player gives it the floor first (party talk §4.2); its handle and its card's name always count.",
      ),
    pronouns: z
      .string()
      .min(1)
      .optional()
      .describe("How the table refers to the character, such as she/her (M7 design §3.4): the DM's prompt names it, and the narration check holds the DM to it."),
    name_ru: z
      .string()
      .min(1)
      .optional()
      .describe("The one Russian form the agents write in a Russian run (AGT-38), such as «Ильза»; it must be among `names`."),
  })
  .describe("One party member.");

const Npc = z
  .strictObject({
    _comment: comment,
    id,
    name: z.string().min(1).describe("What the characters call them."),
    name_ru: z.string().min(1).optional().describe("What a Russian run calls them (AGT-38), such as «староста Осрик Хейл»."),
    prose: packPath.describe("Who they are, voice, wants, what they know and tell, what they hide."),
    stat_block: id
      .optional()
      .describe(
        "An entry of `stat_blocks` (format 2): what the NPC fights as when the story turns violent and the scene doesn't place them, such as town_guard. The DM brings them in with place_creature under that entry (MON-11).",
      ),
    creatures: z
      .array(z.strictObject({ scene: id.describe("A scene id of this skeleton."), handle: id.describe("A creature in that scene's file, its spawns included.") }))
      .optional()
      .describe(
        "When the NPC is also an engine creature (it can be fought, talked down or captured): the scene and handle it has. Several entries when any one of them may become the NPC, such as whichever goblin surrenders.",
      ),
  })
  .describe("A named NPC.");

const coin = z.number().int().nonnegative().optional();

const StatBlock = z
  .strictObject({
    _comment: comment,
    id: id.describe("What the DM names in place_creature, such as road_bandit. DM-only, like the stat block id."),
    monster: z
      .string()
      .min(1)
      .describe("A stat block id in the engine's registry, as in a scene file's `monster` (`wolf`, or a namespaced id)."),
    side: z
      .enum(["hostile", "neutral", "party"])
      .default("hostile")
      .describe("Which side of a fight it is on. The engine refuses a side its stat block can't take beside the party."),
    name: z.string().min(1).max(40).optional().describe("What the table calls the creature instead of the stat block's name, such as Grey wolf."),
    carries: z
      .strictObject({
        coins: z.strictObject({ cp: coin, sp: coin, ep: coin, gp: coin, pp: coin }).optional(),
        items: z
          .array(z.strictObject({ item: id.describe("An item id as on a sheet, such as potion_of_healing."), quantity: z.number().int().positive() }))
          .optional(),
      })
      .optional()
      .describe("Coin and items each such creature carries, taken by loot once it falls or surrenders. Authored here, never by the DM; DM-only until looted."),
  })
  .describe("A creature the DM may bring in when a story beat needs one the scene file doesn't hold (API-33, AGT-24).");

const CheckHint = z
  .strictObject({
    _comment: comment,
    check: id.describe("A check id in the scene's file."),
    intent: z.string().min(1).describe("The kind of thing a character says or does that this check answers."),
  })
  .describe("Which engine check fits which player intent. Anything else the DM checks from the SRD DC ladder.");

const EncounterHint = z
  .strictObject({
    _comment: comment,
    encounter: id.describe("An encounter id in the scene's file."),
    when: z.string().min(1).describe("What starts it."),
  })
  .describe("A fight the scene holds.");

const Exit = z
  .strictObject({
    _comment: comment,
    to: id.describe("The scene it loads: a scene id of this skeleton."),
    when: z.string().min(1).describe("What ends the scene this way."),
    carry: z
      .enum(["party", "party_and_captives"])
      .describe("Who goes along: the party, or the party and any creature that surrendered to it."),
  })
  .describe("A way out of a scene.");

const Scene = z
  .strictObject({
    _comment: comment,
    id: id.describe("The engine scene id: `scenes/<id>.json` in the pack."),
    title: z.string().min(1),
    beat: z.enum(["social", "exploration", "fight", "narrative"]),
    target_minutes: z.number().int().positive().describe("The scene's share of the run (scope §3)."),
    prose: packPath.describe("Read-aloud opening, what the characters can notice, how to run it."),
    npcs: z.array(id).default([]).describe("NPCs present, by id."),
    checks: z.array(CheckHint).default([]),
    encounters: z.array(EncounterHint).default([]),
    rest: z
      .literal("short")
      .optional()
      .describe("The DM offers a Short Rest here. Leaving the scene while the party is hurt and nobody rested in it reminds the DM once."),
    exits: z.array(Exit).describe("Empty for the last scene."),
  })
  .describe("One scene, in play order.");

export const Adventure = z
  .strictObject({
    $schema: z.string().optional().describe("For editors: the path or URL of this schema."),
    _comment: comment,
    format_version: z.number().int().describe(`The skeleton format, one of ${FORMAT_VERSIONS.join(", ")}.`),
    id,
    title: z.string().min(1),
    licence: z.string().min(1).describe("The pack's licence, e.g. CC-BY-4.0. A committed pack carries only our own or CC-BY text."),
    credit: z.string().min(1).describe("Who to credit."),
    prose: z.array(packPath).describe("Adventure-wide prose: premise, the truth behind it, tone."),
    lore: z.array(packPath).default([]).describe("Setting text the DM reads, possibly shared with other packs (paths may leave the pack)."),
    party: z.array(PartyMember).min(1).describe("The party, in seat order. The first scene's file places them."),
    npcs: z.array(Npc).default([]),
    glyphs: z
      .record(z.string().min(1), z.string().min(1))
      .default({})
      .describe(
        "One glyph per creature kind for the turn-order line of the human's panel (M10 P7, AGT-67), keyed by a party handle or by a creature's kind as the panel names it (\"Goblin Warrior\"). Each is one grapheme, such as one emoji. The bar shows it in front of the handle; the roster never does.",
      ),
    stat_blocks: z
      .array(StatBlock)
      .default([])
      .describe(
        `The only creatures the DM may place beyond the scene files (format ${STAT_BLOCKS_SINCE} and later). Empty: the DM improvises no creatures.`,
      ),
    scenes: z.array(Scene).min(1).describe("In play order; the first places the party, every later one carries it in."),
  })
  .describe("A scenario pack's skeleton (M6 spec §4). DM-only, like the prose and scene files.");

export type Adventure = z.infer<typeof Adventure>;

/** One entry of the pack's `stat_blocks` list. */
export type StatBlockEntry = z.infer<typeof StatBlock>;

/** Where the skeleton's JSON Schema is published. */
export const SCHEMA_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../schema/adventure.schema.json");

/** The skeleton's JSON Schema. */
export function adventureSchema(): Record<string, unknown> {
  return {
    $comment: "Generated from game/src/pack/adventure.ts by `npm run pack:schema`. Do not edit by hand.",
    ...z.toJSONSchema(Adventure, { io: "input" }),
  };
}

/** The schema file's text: what `pack:schema` writes and the freshness test compares. */
export function schemaText(): string {
  return `${JSON.stringify(adventureSchema(), null, 2)}\n`;
}

/**
 * The pack's canonical Russian names (AGT-38): party members by handle, and NPCs by id for the DM
 * only. The NPCs are scenario data, so a player's prompt gets the party's names alone (Rule 3).
 */
export function russianNames(
  adventure: { party: Array<{ handle: string; name_ru?: string }>; npcs?: Array<{ id: string; name_ru?: string }> },
  options: { npcs: boolean } = { npcs: true },
): string[] {
  return [
    ...adventure.party.flatMap((p) => (p.name_ru ? [`${p.handle}: ${p.name_ru}`] : [])),
    ...(options.npcs ? (adventure.npcs ?? []) : []).flatMap((n) => (n.name_ru ? [`${n.id}: ${n.name_ru}`] : [])),
  ];
}
