// What a window shows of each scene's place (CON-26): the name it may show and the picture of the
// place, in `plates/index.json` of a pack, beside the pictures. It is not in the skeleton: the
// skeleton is DM-only and is read to the DM whole, and this is for the human's window. A picture
// is named here before it is drawn, so the window can say which one is missing.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** The file, relative to the pack folder. The pictures lie beside it. */
export const PLACES_FILE = "plates/index.json";

const Place = z
  .strictObject({
    name: z.string().min(1).describe("The place as the human's window names it. It is shown to the human: nothing the scene has not told."),
    name_ru: z.string().min(1).optional().describe("The same in a Russian run."),
    plate: z
      .string()
      .regex(/^[a-z0-9-]+\.jpg$/, "<name>.jpg: lower-case letters, digits and -")
      .describe("The picture's file in `plates/`, drawn or not: until it is, the window draws a placeholder with this name on it. The name reaches the window, so it is not the scene id."),
    plan: z
      .string()
      .regex(/^[a-z0-9-]+$/, "lower-case letters, digits and -")
      .describe("The key of the place's drawn plan under «Где все» (the scene-map design); scenes at one place share it. No plan is drawn yet: the window says so with this key."),
  })
  .describe("One scene's place.");

export const Places = z
  .strictObject({
    _comment: z.string().optional(),
    scenes: z.record(z.string(), Place).describe("By scene id."),
  })
  .describe("A pack's places as a window shows them (CON-26).");
export type Places = z.infer<typeof Places>;

/** The place of a scene as the seat is told it: `SeatPlace` (game/src/table/seat-data.ts). */
export interface PlaceShown {
  name: string;
  plate: string;
  plan: string;
}

/**
 * The pack's places by scene id, in the run's language; none for a pack with no `plates/index.json`.
 * A picture and a plan are named `<pack folder>/<name>`, as the page's build lays the pictures out.
 */
export function readPlaces(dir: string, language: "en" | "ru"): Map<string, PlaceShown> {
  const file = path.join(dir, PLACES_FILE);
  if (!existsSync(file)) return new Map();
  const places = Places.parse(JSON.parse(readFileSync(file, "utf8")));
  const pack = path.basename(path.resolve(dir));
  return new Map(
    Object.entries(places.scenes).map(([scene, place]) => [scene, { name: (language === "ru" ? place.name_ru : undefined) ?? place.name, plate: `${pack}/${place.plate}`, plan: `${pack}/${place.plan}` }]),
  );
}

/**
 * What is wrong with the pack's places file and pictures, and the pictures it names that are not
 * drawn yet, which is no fault; nothing for a pack with neither file nor pictures.
 */
export function checkPlaces(dir: string, scenes: readonly string[]): { problems: string[]; missing: string[] } {
  const file = path.join(dir, PLACES_FILE);
  const folder = path.dirname(file);
  const pictures = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith(".jpg")) : [];
  const problems: string[] = [];
  const missing: string[] = [];
  if (!existsSync(file)) return { problems: pictures.length > 0 ? [`${PLACES_FILE} is missing: plates/ holds pictures no scene names`] : [], missing };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return { problems: [`${PLACES_FILE} is not JSON: ${(error as Error).message}`], missing };
  }
  const parsed = Places.safeParse(raw);
  if (!parsed.success) return { problems: parsed.error.issues.map((issue) => `${PLACES_FILE} ${issue.path.join(".") || "(root)"}: ${issue.message}`), missing };
  const named = new Set<string>();
  for (const [scene, place] of Object.entries(parsed.data.scenes)) {
    if (!scenes.includes(scene)) problems.push(`${PLACES_FILE}: ${scene} is not a scene of this pack`);
    named.add(place.plate);
    if (!pictures.includes(place.plate)) missing.push(`plates/${place.plate} (${place.name}) is not drawn yet`);
    // The names are shown to the human's window: a scene id in one tells what the scene is before it is played.
    for (const shown of [place.plate, place.plan]) if (scenes.some((id) => shown.includes(id))) problems.push(`${PLACES_FILE}: ${shown} carries a scene id in its name`);
  }
  for (const scene of scenes) if (!(scene in parsed.data.scenes)) problems.push(`${PLACES_FILE}: scene ${scene} has no place`);
  for (const picture of pictures) if (!named.has(picture)) problems.push(`plates/${picture} is named by no scene in ${PLACES_FILE}`);
  return { problems, missing };
}
