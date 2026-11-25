// The faces the page draws for the party, the goblins and the wolves (portraits/README.md);
// anyone else is an initial (scope §9 question 5). build.ts puts each file in as a data URL.

/** The portraits by file name, from build.ts. */
declare const __FACES__: Record<string, string>;

const FACES: Record<string, string> = typeof __FACES__ === "undefined" ? {} : __FACES__;
/** Kinds that share a file's face: the living world's Goblin Warriors (not the Goblin Boss) and the Wend road's grey wolves. */
const SAME: Record<string, string> = { goblin_warrior: "goblin", grey_wolf: "wolf" };

/**
 * A creature's face by its handle, or else by the engine's name for its kind: `goblin_2`, `goblin_warrior_1`
 * and a placed creature of kind «Grey wolf» all have one; none for a creature with no file.
 */
export function faceOf(handle: string | undefined, kind?: string): string | undefined {
  if (!handle) return undefined;
  const byHandle = handle.replace(/_\d+$/, "");
  const byKind = kind?.toLowerCase().replace(/\s+/g, "_") ?? "";
  return FACES[handle] ?? FACES[byHandle] ?? FACES[SAME[byHandle] ?? ""] ?? FACES[byKind] ?? FACES[SAME[byKind] ?? ""];
}
