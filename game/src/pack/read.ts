// A scenario pack as the DM agent reads it (M6 spec §3.2, §4, D3): the skeleton and every prose
// file, in one text for its system prompt. Nothing here reaches a player: the pack is DM-only.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Adventure } from "./adventure.ts";

export interface PackText {
  dir: string;
  adventure: Adventure;
  /** The whole pack in play order: skeleton, adventure prose, lore, scenes, NPCs. */
  text: string;
}

/**
 * The pack's skeleton file: `campaign.json` in a living-world pack (MAP-7, the adventure.json
 * format with the engine's `world` block and `day_limit`, one file and not a second), else
 * `adventure.json`.
 */
export function skeletonFile(dir: string): string {
  const campaign = path.join(dir, "campaign.json");
  return existsSync(campaign) ? campaign : path.join(dir, "adventure.json");
}

export function readPack(dir: string): PackText {
  const skeleton = skeletonFile(dir);
  const raw = readFileSync(skeleton, "utf8");
  const adventure = Adventure.parse(JSON.parse(raw));
  const file = (name: string) => readFileSync(path.resolve(dir, name), "utf8").trim();
  const text = [
    `# ${adventure.title}`,
    "",
    `## The skeleton (${path.basename(skeleton)})`,
    "",
    "Scene order, exits, NPCs, which scene check fits which intent, and the prose each part points to.",
    "",
    "```json",
    raw.trim(),
    "```",
    "",
    "## The adventure",
    "",
    ...adventure.prose.map(file),
    ...(adventure.lore.length > 0 ? ["", "## Lore", "", ...adventure.lore.map(file)] : []),
    "",
    "## Scenes",
    ...adventure.scenes.flatMap((scene, i) => ["", `### Scene ${i + 1}: ${scene.title} (${scene.id})`, "", file(scene.prose)]),
    "",
    "## NPCs",
    ...adventure.npcs.flatMap((npc) => ["", `### ${npc.name} (${npc.id})`, "", file(npc.prose)]),
  ].join("\n");
  return { dir, adventure, text };
}
