// The faces the page draws for the party, the goblins and the Mill's people (portraits/README.md);
// anyone else is an initial in a dashed ring, which says a portrait is not drawn yet (CON-26).
// build.ts puts each file in as a data URL.

/** The portraits by file name, from build.ts. */
declare const __FACES__: Record<string, string>;

const FACES: Record<string, string> = typeof __FACES__ === "undefined" ? {} : __FACES__;
/** Handles that name the same face as a file: the living world's Goblin Warriors. Not the Goblin Boss. */
const SAME: Record<string, string> = { goblin_warrior: "goblin" };

/** A creature's face by its handle: `goblin_2` and `goblin_warrior_1` are goblins; none for a handle with no file. */
export function faceOf(handle: string | undefined): string | undefined {
  if (!handle) return undefined;
  const kind = handle.replace(/_\d+$/, "");
  return FACES[handle] ?? FACES[kind] ?? FACES[SAME[kind] ?? ""];
}

/** The file that would give this handle a face (CON-26): `wolf_2` wants `wolf.jpg`. For the list of portraits not drawn yet. */
export function faceFile(handle: string): string {
  const kind = handle.replace(/_\d+$/, "");
  return `${SAME[kind] ?? kind}.jpg`;
}
