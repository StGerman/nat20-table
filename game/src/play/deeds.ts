// Outcome deeds and markers (design `docs/design/m13-system-design.md` §4.2 rule 9, AGT-104), read
// from pack data. A deed `d` is an outcome if, at some source that writes it, another outcome of
// that source writes at least one deed and does not write `d`; otherwise it is a marker. A card's
// outcomes are its choices and each check branch under them; a scene check's are its success and
// its failure; a fight's are its `on_end` rules. A death deed (`killed_<npc>`) is no alternative to
// them, so it is never a source here and stays a marker until something writes a counterpart.
//
// The verdict's `m13-carried` row asks it whether a card read an outcome of an earlier contract.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { worldDir } from "../pack/campaign.ts";

/** A deck effect, as far as deeds go: a `remember`, or a check whose branches are alternatives. */
interface Effect {
  do: string;
  deed?: string;
  success?: Effect[];
  failure?: Effect[];
  monsters?: Array<{ npc?: string }>;
}

interface DeckFile {
  cards: Array<{ id: string; choices?: Array<{ id: string; effects?: Effect[] }> }>;
}

/** A scene consequence: `remember` writes its deed. */
interface Consequence {
  kind: string;
  deed?: string;
}

interface SceneCreature {
  npc?: string;
}

interface SceneFile {
  creatures?: SceneCreature[];
  spawns?: Array<{ creatures?: SceneCreature[] }>;
  checks?: Array<{ id: string; on_success?: Consequence[]; on_failure?: Consequence[] }>;
  encounters?: Array<{ id: string; on_end?: Array<{ remember: string }> }>;
}

/** One place that writes deeds, with the deeds each of its outcomes writes. */
export interface DeedSource {
  /** `card <id>`, `check <scene>/<id>` or `fight <scene>/<id>`. */
  source: string;
  outcomes: Array<Set<string>>;
}

export interface DeedKinds {
  outcomes: Set<string>;
  markers: Set<string>;
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

const jsonFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => path.join(dir, f))
    : [];

/** Every set of deeds a list of effects can write: one per way through its checks. */
export function effectOutcomes(effects: Effect[]): Array<Set<string>> {
  let paths: Array<Set<string>> = [new Set()];
  for (const e of effects) {
    if (e.do === "remember" && e.deed) for (const p of paths) p.add(e.deed);
    else if (e.do === "check") {
      const branches = [...effectOutcomes(e.success ?? []), ...effectOutcomes(e.failure ?? [])];
      paths = paths.flatMap((p) => branches.map((b) => new Set([...p, ...b])));
    }
  }
  return paths;
}

/** The death deeds a list of effects can write: `killed_<npc>` for each named monster of a card fight. */
function effectDeaths(effects: Effect[]): string[] {
  return effects.flatMap((e) => [
    ...(e.do === "fight" ? (e.monsters ?? []).flatMap((m) => (m.npc ? [`killed_${m.npc}`] : [])) : []),
    ...effectDeaths(e.success ?? []),
    ...effectDeaths(e.failure ?? []),
  ]);
}

/** A death deed as a source of its own: one outcome, so it is a marker (rule 9). */
const death = (deed: string, at: string): DeedSource => ({ source: `death ${at}`, outcomes: [new Set([deed])] });

/** The world map a pack plays on: its campaign's `world.map`, or its adventure's `site.map`. */
export function packMap(pack: string): string | undefined {
  const campaign = path.join(pack, "campaign.json");
  if (existsSync(campaign)) return readJson<{ world?: { map?: string } }>(campaign).world?.map;
  const adventure = path.join(pack, "adventure.json");
  if (existsSync(adventure)) return readJson<{ site?: { map?: string } }>(adventure).site?.map;
  return undefined;
}

/** The sources of one deck folder. */
function deckSources(dir: string): DeedSource[] {
  return jsonFiles(path.join(dir, "deck")).flatMap((file) =>
    readJson<DeckFile>(file).cards.flatMap((card) => [
      { source: `card ${card.id}`, outcomes: (card.choices ?? []).flatMap((c) => effectOutcomes(c.effects ?? [])) },
      ...(card.choices ?? []).flatMap((c) => effectDeaths(c.effects ?? [])).map((d) => death(d, `card ${card.id}`)),
    ]),
  );
}

/** The sources of a pack's scenes: its checks and its fights. */
function sceneSources(pack: string): DeedSource[] {
  const remembered = (cs: Consequence[] | undefined) => new Set((cs ?? []).flatMap((c) => (c.kind === "remember" && c.deed ? [c.deed] : [])));
  return jsonFiles(path.join(pack, "scenes")).flatMap((file) => {
    const scene = path.basename(file, ".json");
    const s = readJson<SceneFile>(file);
    const named = [...(s.creatures ?? []), ...(s.spawns ?? []).flatMap((sp) => sp.creatures ?? [])].flatMap((c) => (c.npc ? [c.npc] : []));
    return [
      ...named.map((npc) => death(`killed_${npc}`, `${scene}/${npc}`)),
      ...(s.checks ?? []).map((c) => ({ source: `check ${scene}/${c.id}`, outcomes: [remembered(c.on_success), remembered(c.on_failure)] })),
      ...(s.encounters ?? []).filter((e) => (e.on_end ?? []).length > 0).map((e) => ({ source: `fight ${scene}/${e.id}`, outcomes: (e.on_end ?? []).map((r) => new Set([r.remember])) })),
    ];
  });
}

/**
 * Every deed source on the world `pack` plays on: the world's deck, and the decks and scenes of
 * every pack beside `pack` (its sibling folders) on that map, `pack` included.
 */
export function worldSources(pack: string): DeedSource[] {
  const map = packMap(pack);
  if (!map) return [...deckSources(pack), ...sceneSources(pack)];
  const root = path.dirname(path.resolve(pack));
  const packs = readdirSync(root)
    .map((d) => path.join(root, d))
    .filter((d) => packMap(d) === map)
    .sort();
  return [...deckSources(worldDir(pack, map)), ...packs.flatMap((p) => [...deckSources(p), ...sceneSources(p)])];
}

/** Sorts every deed the sources write into outcomes and markers (rule 9). */
export function deedKinds(sources: DeedSource[]): DeedKinds {
  const outcomes = new Set<string>();
  const written = new Set<string>();
  for (const { outcomes: ways } of sources) {
    for (const way of ways) {
      for (const d of way) {
        written.add(d);
        if (ways.some((other) => other.size > 0 && !other.has(d))) outcomes.add(d);
      }
    }
  }
  return { outcomes, markers: new Set([...written].filter((d) => !outcomes.has(d))) };
}
