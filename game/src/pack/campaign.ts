// What the game reads from a living-world pack's campaign.json (M9, AGT-80). The engine reads its
// `world` block; the game reads where the run starts and how many days it plays. A pack with no
// campaign.json plays its scenes in order, as before.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { REPO } from "../paths.ts";

/** A living-world pack as the run needs it. */
export interface CampaignPack {
  /** The scene the run loads first: the start place's own scene, or the road scene. */
  startScene: string;
  /** The last game day the run plays, from `day_limit`; none means no limit. */
  dayLimit?: number;
  /** The game day the campaign starts on (`world.day`, default 1). */
  startDay: number;
}

interface CampaignFile {
  day_limit?: number;
  world: { map: string; start: string; road_scene: string; day?: number; scenes?: Record<string, string> };
}

interface MapFile {
  places: Array<{ id: string; scene?: string | null }>;
}

/** The world folder a campaign pack plays in: the pack's own `worlds/<map>`, else the shared one. */
function worldDir(pack: string, map: string): string {
  const own = path.join(pack, "worlds", map);
  return existsSync(path.join(own, "map.json")) ? own : path.join(REPO, "worlds", map);
}

/**
 * The Russian names of the world's place NPCs (AGT-38), each `id: name_ru`, for the DM's name
 * line: the pack's own NPCs carry theirs in the skeleton. None for a pack without a campaign or a
 * world without `npcs.json`. Place NPCs are world data, so only the DM's prompt gets them (Rule 3).
 */
export function worldNames(pack: string): string[] {
  const file = path.join(pack, "campaign.json");
  if (!existsSync(file)) return [];
  const { map } = (JSON.parse(readFileSync(file, "utf8")) as CampaignFile).world;
  const npcs = path.join(worldDir(pack, map), "npcs.json");
  if (!existsSync(npcs)) return [];
  const list = (JSON.parse(readFileSync(npcs, "utf8")) as { npcs: Array<{ id: string; name_ru?: string }> }).npcs;
  return list.flatMap((npc) => (npc.name_ru ? [`${npc.id}: ${npc.name_ru}`] : []));
}

/** Reads `<pack>/campaign.json`, or undefined when the pack has none. */
export function readCampaign(pack: string): CampaignPack | undefined {
  const file = path.join(pack, "campaign.json");
  if (!existsSync(file)) return undefined;
  const campaign = JSON.parse(readFileSync(file, "utf8")) as CampaignFile;
  const { map, start, road_scene, scenes = {} } = campaign.world;
  // The pack's own world, else the shared one, as the engine looks for it.
  const mapFile = path.join(worldDir(pack, map), "map.json");
  const places = (JSON.parse(readFileSync(mapFile, "utf8")) as MapFile).places;
  const place = places.find((p) => p.id === start);
  if (!place) throw new Error(`${file}: the start place ${start} is not on the map ${map}`);
  const dayLimit = campaign.day_limit;
  if (dayLimit !== undefined && (!Number.isInteger(dayLimit) || dayLimit < 1)) throw new Error(`${file}: day_limit is a whole number of days from 1`);
  // The pack's own scene for the place first (MAP-7), then the map's, then the road scene.
  return { startScene: scenes[start] ?? place.scene ?? road_scene, startDay: campaign.world.day ?? 1, ...(dayLimit !== undefined ? { dayLimit } : {}) };
}
