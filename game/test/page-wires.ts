// Seat wires for the page's tests that the recorded fixtures do not hold (AGT-142). The recorded
// runs were played by the scripted Narrator, whose narration tells no roll; a live table's Narrator
// tells a round in one paragraph and its rolls become tokens in it. `narratedFight` is the Russian
// fixture to the human's first fight turn with one such paragraph and one line of party talk
// written in before the list: every other line is the recorded run's.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

/** The narration written into the fight: each sentence names who rolls in it. */
export const NARRATION =
  "Ильза первой вскидывает руку, и огненная искра проносится мимо второго гоблина. Первый гоблин рубит Брена саблей, но клинок соскальзывает. Второй гоблин бьёт точнее: сабля входит Брену в плечо. Торва без оружия обрушивается на первого гоблина, а луч Марен добивает его.";
export const TALK = "Брен, держись за мной, второго я возьму сама.";

export function narratedFight(): string {
  const records = readFileSync(path.join(FIXTURES, "the-way-back-ru.seat-wire.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { seq?: number; event?: { kind: string; roll?: string; own?: boolean }; message?: { type: string; prompt?: { kind: string } } });
  const ask = records.findIndex((r) => r.message?.type === "ask" && r.message.prompt?.kind === "combat_turn");
  let list = ask;
  while (list > 0 && records[list].event?.kind !== "options") list--;
  // The rolls the narration tells: every other character's roll since the fight began, as a live Narrator's would.
  const start = records.findIndex((r) => (r.event as { event?: { kind?: string } } | undefined)?.event?.kind === "combat_started");
  const rolls = records.slice(start, list).flatMap((r) => (r.event?.kind === "engine" && r.event.roll && !r.event.own ? [r.event.roll] : []));
  const seq = records[list].seq!;
  const written = [
    { seq, event: { kind: "narration", speaker: "dm", text: NARRATION, rolls } },
    { seq: seq + 1, event: { kind: "speech", speaker: "ilsa", text: TALK, to: "bren" } },
  ];
  const after = records.slice(list, ask + 1).map((r) => (r.seq !== undefined ? { ...r, seq: r.seq + 2 } : r));
  return [...records.slice(0, list), ...written, ...after].map((r) => JSON.stringify(r)).join("\n") + "\n";
}

/** The names a live host sends at `hello` for the Russian fixture's party. */
export const NAMES_RU: Record<string, string> = { bren: "Брен", torva: "Торва", maren: "Марен", ilsa: "Ильза" };
