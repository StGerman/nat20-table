// The card bench's temporary pack (AGT-123, decision 0084, `docs/design/card-bench.md` §3): a copy
// of a campaign pack and its world whose decks hold one card, on a route cut to the stretch that
// reaches it. A pile of one goes on the table with no pick, so the real loop meets that card first.
// Nothing here calls a model or the engine: it reads and writes files.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO } from "../paths.ts";

/** A card the bench can't reach, or a pack it can't cut: the command prints it and exits 2. */
export class BenchError extends Error {}

/** How the bench reaches one card. */
export interface BenchPlan {
  /** The benched card's id. */
  card: string;
  /** The pack it is benched in, as given. */
  pack: string;
  when: "road" | "night" | "arrival";
  /** The card's zone: a road's zone for a road or night card, a place for an arrival card. */
  zone: string;
  /** The copy's start: the last place on the pack's route with a scene of its own before the card. */
  start: string;
  /** The copy's route, from `start` to the place where the card's leg ends. */
  route: string[];
  /** The deeds the card needs (`if`): it comes only on a saved party that remembers them all. */
  needs: string[];
  /** The deeds that keep the card out (`unless`). */
  barred: string[];
  /** The cards the copy keeps: the benched card and the chained cards its choices add. */
  kept: string[];
}

interface DeckCard {
  id: string;
  zone: string;
  when?: "road" | "night" | "arrival";
  chained?: boolean;
  if?: string | string[];
  unless?: string | string[];
  choices: unknown[];
}

interface World {
  map: string;
  start: string;
  route?: string[];
  road_scene: string;
  scenes?: Record<string, string>;
  escort?: { destination: string; death_card?: string };
}

/** A scene file, as far as the bench reads it: the creatures it places and where a carried party stands. */
interface SceneFile {
  creatures?: Array<{ handle: string; side: string; at: unknown }>;
  party_start?: string[];
}

interface MapFile {
  places: Array<{ id: string; scene?: string | null }>;
  roads: Array<{ from: string; to: string; zone: string }>;
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

/** The world folder a campaign pack plays in: the pack's own `worlds/<map>`, else the shared one (as `pack/campaign.ts` and the engine look for it). */
function worldOf(pack: string, map: string): string {
  const own = path.join(pack, "worlds", map);
  return existsSync(path.join(own, "map.json")) ? own : path.join(REPO, "worlds", map);
}

/** The deck files of a folder's `deck/`, sorted; none when it has no deck. */
function deckFiles(dir: string): string[] {
  const deck = path.join(dir, "deck");
  if (!existsSync(deck)) return [];
  return readdirSync(deck).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(deck, f));
}

/** Every card a pack's journeys can draw: the world's deck, then the pack's own. */
function cardsOf(pack: string, world: string): DeckCard[] {
  return [...deckFiles(world), ...deckFiles(pack)].flatMap((file) => readJson<{ cards: DeckCard[] }>(file).cards);
}

/** The cards an `add_card` effect names anywhere in `effects`, a check's outcomes included. */
function added(effects: unknown): string[] {
  if (Array.isArray(effects)) return effects.flatMap(added);
  if (typeof effects !== "object" || effects === null) return [];
  const e = effects as Record<string, unknown>;
  return [...(e.do === "add_card" && typeof e.card === "string" ? [e.card] : []), ...Object.values(e).flatMap(added)];
}

const deeds = (d: string | string[] | undefined): string[] => (d === undefined ? [] : typeof d === "string" ? [d] : d);

/** `ids` and the chained cards their choices add, and what those add: the deck's own check wants every `add_card` to name a card. */
function withAdded(cards: DeckCard[], ids: string[]): string[] {
  const kept = [...ids];
  for (let i = 0; i < kept.length; i++) {
    const c = cards.find((x) => x.id === kept[i]);
    for (const next of added(c?.choices)) if (!kept.includes(next)) kept.push(next);
  }
  return kept;
}

/** Whether a card reads `deed` in its own `if` or a choice's. */
const reads = (card: DeckCard, deed: string): boolean => [card, ...(card.choices as Array<{ if?: string | string[] }>)].some((d) => deeds(d.if).includes(deed));

/**
 * How the bench reaches `card` in `pack` (design §3): the leg of the pack's route where the card is
 * drawn, and the last place with a scene of its own before it. Refuses a pack with no campaign, a
 * card the pack doesn't have, a chained card (out of this version), a night card of a place (the
 * bench's seat camps where the day's travel runs out, on the road), and a card whose zone the route
 * never crosses or never arrives at. A night card's stretch runs on to the end of the last leg in
 * its zone that follows the first, so that a night falls on a road of that zone (AGT-131).
 */
export function benchPlan(pack: string, card: string): BenchPlan {
  const file = path.join(pack, "campaign.json");
  if (!existsSync(file)) throw new BenchError(`${pack} has no campaign.json: the card bench plays a card of a campaign pack, such as scenarios/fair_in_wend.`);
  const world = readJson<{ world: World }>(file).world;
  const dir = worldOf(pack, world.map);
  const map = readJson<MapFile>(path.join(dir, "map.json"));
  const cards = cardsOf(pack, dir);
  const found = cards.find((c) => c.id === card);
  if (!found) throw new BenchError(`${pack} has no card ${card}: neither its own deck nor the deck of its world ${world.map} holds it.`);
  if (found.chained) throw new BenchError(`${card} is a chained card: it is in play only once another card's choice adds it, and the card bench does not reach those yet.`);
  const when = found.when ?? "road";
  if (when === "night" && !map.roads.some((r) => r.zone === found.zone)) throw new BenchError(`${card} is a night card of the place ${found.zone}: the card bench camps where the day's travel runs out, on the road, so it reaches only a night card of a road's zone.`);
  const route = world.route ?? [];
  // Whether the leg into route[i] is a road of the card's zone.
  const inZone = (i: number) => i > 0 && map.roads.some((r) => r.zone === found.zone && ((r.from === route[i - 1] && r.to === route[i]) || (r.to === route[i - 1] && r.from === route[i])));
  // Where the card's leg ends: the place the caravan arrives at, or the far end of the first leg in the card's zone.
  let end = -1;
  if (when === "arrival") end = route.findIndex((place, i) => i > 0 && place === found.zone);
  else end = route.findIndex((_, i) => inZone(i));
  // A night card: on to the end of the zone's legs in a row, so the day's travel runs out on one of them.
  if (when === "night" && end > 0) while (inZone(end + 1)) end += 1;
  if (end < 1) {
    const way = route.length > 0 ? `its route ${route.join(" > ")}` : "it has no route";
    throw new BenchError(when === "arrival" ? `${card} is an arrival card of ${found.zone}, where ${pack} never arrives: ${way}.` : `${card} is a ${when} card of the zone ${found.zone}, which ${pack} never crosses: ${way}.`);
  }
  // The last place before the card's leg ends that has a scene of its own; the route's first place when none has.
  // The road scene is loaded again on the way, so a place that plays it is no start.
  const scened = (place: string) => ![undefined, null, world.road_scene].includes(world.scenes?.[place] ?? map.places.find((p) => p.id === place)?.scene);
  let start = end - 1;
  while (start > 0 && !scened(route[start]!)) start -= 1;
  // The chained cards the card's choices add stay, and what those add.
  const kept = withAdded(cards, [card]);
  return { card, pack, when, zone: found.zone, start: route[start]!, route: route.slice(start, end + 1), needs: deeds(found.if), barred: deeds(found.unless), kept };
}

/**
 * Makes the bench's copy of `pack` in the folder `root` (design §3) and returns the copy's folder
 * and the plan it was cut by:
 * - the pack and its world, copied, so the copy plays its own `worlds/<map>`;
 * - every deck file of both with only the plan's kept cards and the escort's death card, and the
 *   world's company cut to the entries those cards read the death of (rule A9);
 * - `world.start` and `world.route` cut to the plan's stretch, with the escort's destination at
 *   its end, so a card that never comes ends the bench run after that stretch and not at the
 *   pack's far end;
 * - the party of the pack's own first scene placed in the copy's first scene, at that scene's
 *   `party_start` anchors as a carried party would stand: the engine starts a contract only in a
 *   scene that places its party;
 * - prose and lore paths that leave the pack made absolute, so the DM's pack text still reads;
 * - each company entry named in `rides` kept, its `unless` taken off, and the deeds of its `if`
 *   remembered first by every choice of the benched card (AGT-131): those deeds count only when
 *   written on the contract under way, which a bench run starts fresh, so `--rides tam` is how a
 *   wagon fight is benched with Tam at the wagon.
 * Every bench run takes a fresh copy: a card decided in one run (`once`) would be gone from the next.
 */
export function benchPack(pack: string, card: string, root: string, rides: readonly string[] = []): { dir: string; plan: BenchPlan } {
  const plan = benchPlan(pack, card);
  const source = path.resolve(pack);
  const dir = path.join(root, path.basename(source));
  if (existsSync(dir)) throw new BenchError(`${dir} is already there: each bench run takes a fresh folder.`);
  mkdirSync(root, { recursive: true });
  cpSync(source, dir, { recursive: true });
  const file = path.join(dir, "campaign.json");
  const campaign = readJson<{ prose?: string[]; lore?: string[]; world: World }>(file);
  const world = path.join(dir, "worlds", campaign.world.map);
  // A pack that carries its own world was copied with it.
  if (!existsSync(path.join(world, "map.json"))) cpSync(worldOf(source, campaign.world.map), world, { recursive: true });
  const companyFile = path.join(world, "company.json");
  const company = existsSync(companyFile) ? readJson<{ company: Array<{ id: string; hurt?: boolean; if: string | string[]; unless?: unknown }> }>(companyFile) : { company: [] };
  const riding = company.company.filter((e) => rides.includes(e.id));
  const unknown = rides.filter((id) => !riding.some((e) => e.id === id));
  if (unknown.length > 0) {
    const ids = company.company.map((e) => e.id);
    throw new BenchError(`--rides ${unknown.join(",")}: the world ${campaign.world.map} has no such company entry${ids.length > 0 ? `; it has ${ids.join(", ")}` : ", and no company at all"}.`);
  }
  // The escort's death card stays too (ENG-49): it is the reader of the owner's death a wagon fight
  // needs (rule A9), and it comes only once the owner is dead. A riding entry brings the cards that
  // read its death and its wound, by the same rule, and what their choices add.
  const all = cardsOf(source, worldOf(source, campaign.world.map));
  const readers = riding.flatMap((e) => all.filter((c) => reads(c, `${e.id}_dead`) || (e.hurt === true && reads(c, `${e.id}_hurt`))).map((c) => c.id));
  const kept = withAdded(all, [...plan.kept, ...(campaign.world.escort?.death_card ? [campaign.world.escort.death_card] : []), ...readers]);
  // A chained reader needs a card that adds it, or the deck's check refuses the copy: the first one stays, with what it adds.
  for (let i = 0; i < kept.length; i++) {
    const c = all.find((x) => x.id === kept[i]);
    if (!c?.chained || kept.some((k) => added(all.find((x) => x.id === k)?.choices).includes(c.id))) continue;
    const adder = all.find((x) => added(x.choices).includes(c.id));
    if (adder) for (const id of withAdded(all, [adder.id])) if (!kept.includes(id)) kept.push(id);
  }
  const read = new Set<string>();
  for (const deck of [...deckFiles(world), ...deckFiles(dir)]) {
    const content = readJson<{ cards: DeckCard[] }>(deck);
    const cards = content.cards.filter((c) => kept.includes(c.id));
    for (const c of cards) for (const d of [c, ...(c.choices as Array<{ if?: string | string[] }>)]) for (const deed of deeds(d.if)) read.add(deed);
    writeFileSync(deck, JSON.stringify({ ...content, cards }, null, 4) + "\n");
  }
  // A company entry rides only when the cards kept read its death, and its wound when it can be
  // hurt (rule A9): the bench plays the card with the allies its own choices answer for. A card
  // whose choices only ask whether an ally rides (`rides:`) reads no death, so it is benched alone.
  if (existsSync(companyFile)) {
    company.company = company.company.flatMap((e) => {
      if (rides.includes(e.id)) {
        const { unless: _unless, ...always } = e;
        return [always];
      }
      return read.has(`${e.id}_dead`) && (!e.hurt || read.has(`${e.id}_hurt`)) ? [e] : [];
    });
    writeFileSync(companyFile, JSON.stringify(company, null, 4) + "\n");
  }
  // What makes a riding entry ride is written on the contract under way: each choice of the benched card remembers it first.
  const written = riding.flatMap((e) => deeds(e.if));
  if (written.length > 0) {
    for (const deck of [...deckFiles(world), ...deckFiles(dir)]) {
      const content = readJson<{ cards: Array<DeckCard & { choices: Array<{ effects?: unknown[] }> }> }>(deck);
      const found = content.cards.find((c) => c.id === card);
      if (!found) continue;
      for (const choice of found.choices) choice.effects = [...written.map((deed) => ({ do: "remember", deed })), ...(choice.effects ?? [])];
      writeFileSync(deck, JSON.stringify(content, null, 4) + "\n");
    }
  }
  const outside = (name: string) => (path.resolve(source, name).startsWith(source + path.sep) ? name : path.resolve(source, name));
  if (campaign.prose) campaign.prose = campaign.prose.map(outside);
  if (campaign.lore) campaign.lore = campaign.lore.map(outside);
  if (campaign.world.start !== plan.start) startScene(dir, campaign.world, plan.start);
  campaign.world.start = plan.start;
  campaign.world.route = plan.route;
  if (campaign.world.escort) campaign.world.escort.destination = plan.route.at(-1)!;
  writeFileSync(file, JSON.stringify(campaign, null, 4) + "\n");
  return { dir, plan };
}

/** Places the party of the pack's own first scene in the scene of `start`, in the copy `dir`. */
function startScene(dir: string, world: World, start: string): void {
  const map = readJson<MapFile>(path.join(dir, "worlds", world.map, "map.json"));
  const sceneOf = (place: string) => world.scenes?.[place] ?? map.places.find((p) => p.id === place)?.scene ?? world.road_scene;
  const file = (place: string) => path.join(dir, "scenes", `${sceneOf(place)}.json`);
  const party = (readJson<SceneFile>(file(world.start)).creatures ?? []).filter((c) => c.side === "party");
  const scene = readJson<SceneFile>(file(start));
  const anchors = scene.party_start ?? [];
  if (party.length === 0 || anchors.length === 0) {
    throw new BenchError(`The card bench can't start ${path.basename(dir)} at ${start}: ${party.length === 0 ? `its first scene ${sceneOf(world.start)} places no party` : `the scene ${sceneOf(start)} has no party_start for a party to stand at`}.`);
  }
  // In party order, the last anchor taking any extra creatures, as the engine places a carried party.
  const placed = party.map((c, i) => ({ ...c, at: { kind: "anchor", anchor: anchors[Math.min(i, anchors.length - 1)] } }));
  writeFileSync(file(start), JSON.stringify({ ...scene, creatures: [...(scene.creatures ?? []), ...placed] }, null, 4) + "\n");
}

/** The file of the saved party `name`; refuses a name with no saved party, since the bench never starts a new one. */
export function savedParty(rosters: string, name: string): string {
  const file = path.join(rosters, `${name}.json`);
  if (!existsSync(file)) throw new BenchError(`--roster ${name}: no saved party ${path.relative(process.cwd(), file) || file}. The card bench plays a copy of a saved party and never starts a new one.`);
  return file;
}

/**
 * The bench's copy of the saved party `name` in the folder `into` (design §3): the roster file and
 * its hash chain, so the run plays and saves the copy and the saved party is never written over.
 */
export function benchRoster(rosters: string, name: string, into: string): void {
  const file = savedParty(rosters, name);
  mkdirSync(into, { recursive: true });
  cpSync(file, path.join(into, `${name}.json`));
  const chain = path.join(rosters, `${name}.chain.jsonl`);
  if (existsSync(chain)) cpSync(chain, path.join(into, `${name}.chain.jsonl`));
}

/** A lines file read (design §4): the lines to type, in order, and the ones marked left out. */
export interface BenchLines {
  lines: string[];
  /** Lines the file marks with a leading `~`: they lean on an earlier scene, so they are named and never typed. */
  leftOut: string[];
}

/** Reads a lines file's text: one line of the player's words a row; blank rows and rows that start with `#` are skipped; a row that starts with `~` is left out. */
export function benchLines(text: string): BenchLines {
  const rows = text.split("\n").map((row) => row.trim()).filter((row) => row !== "" && !row.startsWith("#"));
  return {
    lines: rows.filter((row) => !row.startsWith("~")),
    leftOut: rows.filter((row) => row.startsWith("~")).map((row) => row.slice(1).trim()).filter((row) => row !== ""),
  };
}

/** The campaign packs under `scenarios/` whose route reaches `card`, by folder: what the command suggests when `--pack` is missing or wrong. */
export function packsReaching(card: string): string[] {
  const scenarios = path.join(REPO, "scenarios");
  return readdirSync(scenarios)
    .sort()
    .map((name) => path.join(scenarios, name))
    .filter((pack) => {
      try {
        benchPlan(pack, card);
        return true;
      } catch {
        return false;
      }
    })
    .map((pack) => path.relative(REPO, pack));
}
