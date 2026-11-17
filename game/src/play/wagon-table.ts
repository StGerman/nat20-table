// The wagon fights' death and wound table (ENG-48, design `allies-in-fights-system-design.md`
// §15 and §16 item 1): `npm run play:wagon-table [-- --seeds N]`. For each wagon card it plays the
// card's fight N times on seeds 1 to N, with the monsters arriving at the wagon and at `ahead`, and
// prints how often each ally died or came out hurt, and how often the Blades lost. It counts; it
// tunes nothing. No model and no seat: every creature, the Blades too, is played by the engine's
// own script, on a temporary copy of the pack whose deck holds that card alone, on the first leg.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Event } from "@nat20-table/engine-client";
import { GameEngine, REPO } from "../engine.ts";

/** A wagon card's fight, as the deck half of ENG-48 marks it. */
interface WagonCard {
  pack: string;
  card: string;
  /** The choice whose fight is played */
  choice: string;
  /** Whether the NPC owner stands in it (design §16 item 7: not at the bridge) */
  owner: boolean;
}

const CARDS: WagonCard[] = [
  { pack: "fair_in_wend", card: "night_wolves", choice: "stand", owner: true },
  { pack: "fair_in_wend", card: "goblin_ambush", choice: "fight", owner: true },
  { pack: "fair_in_wend", card: "millbeck_bridge", choice: "argue", owner: false },
  { pack: "the_way_back", card: "men_at_the_iron", choice: "go", owner: true },
];

/** Where the monsters arrive: the scene's first anchor (the wagon), or up the road. */
const FROMS = [undefined, "ahead"] as const;

/**
 * Who else rides, for the table only: the dog, and Tam at the wagon or following behind (the deck
 * half and MAP-23 write them into `company.json`; until then this copy does, Tam as a Commoner).
 * Each rides on a deed the played choice writes first. One Tam a fight, as on the road.
 */
const DOG = { id: "dog", monster: "mastiff", name: "the dog", if: "table_rides", hurt: true };
const COMPANIES = [
  { name: "Tam at the wagon", company: [DOG, { id: "tam", monster: "commoner", name: "Tam", if: "table_rides", hurt: true }] },
  { name: "Tam behind", company: [DOG, { id: "tam", monster: "commoner", name: "Tam", if: "table_rides", at: "behind", hurt: true }] },
];

type Json = Record<string, unknown>;
const read = (file: string): Json => JSON.parse(readFileSync(file, "utf8")) as Json;

/** The card as the deck files hold it: the world's, then the pack's own. */
function findCard(pack: string, id: string): Json {
  const dirs = [path.join(REPO, "worlds", "wend", "deck"), path.join(REPO, "scenarios", pack, "deck")];
  for (const dir of dirs.filter(existsSync)) {
    for (const file of readFileSyncDir(dir)) {
      const found = (read(path.join(dir, file)).cards as Json[]).find((c) => c.id === id);
      if (found) return found;
    }
  }
  throw new Error(`no card ${id} on ${pack}'s world`);
}

function readFileSyncDir(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
}

/** The fight effect of a choice, wherever it sits (a check's outcome included). */
function fightOf(effects: Json[]): Json | undefined {
  for (const effect of effects) {
    if (effect.do === "fight") return effect;
    const inner = fightOf([...((effect.success as Json[]) ?? []), ...((effect.failure as Json[]) ?? [])]);
    if (inner) return inner;
  }
  return undefined;
}

/**
 * A copy of the pack and its world whose deck is the card alone, as a road card of the first leg
 * the Blades vote on, its choice reduced to the fight; every party creature scripted.
 */
function copyFor(entry: WagonCard, from: string | undefined, company: Json[], root: string): { dir: string; legs: string[]; scene: string; party: string[] } {
  const dir = mkdtempSync(path.join(root, `${entry.card}-`));
  cpSync(path.join(REPO, "scenarios", entry.pack), dir, { recursive: true });
  const world = path.join(dir, "worlds", "wend");
  cpSync(path.join(REPO, "worlds", "wend"), world, { recursive: true });
  rmSync(path.join(dir, "deck"), { recursive: true, force: true });
  rmSync(path.join(world, "deck"), { recursive: true, force: true });
  const campaign = read(path.join(dir, "campaign.json"));
  const w = campaign.world as Json;
  const route = w.route as string[];
  // The fight is on the road, in the road scene with its `ahead` and `behind`: the first leg that
  // ends at a place with no scene of its own.
  const scenes = w.scenes as Record<string, string>;
  const end = route.findIndex((place, i) => i > 0 && !scenes[place]);
  if (end < 0) throw new Error(`${entry.pack}: no leg ends on the road`);
  const start = route[0]!;
  const legs = route.slice(1, end + 1);
  const map = read(path.join(world, "map.json"));
  const road = (map.roads as Json[]).find((r) => (r.from === route[end - 1] && r.to === route[end]) || (r.from === route[end] && r.to === route[end - 1]));
  if (!road) throw new Error(`${entry.pack}: no road from ${route[end - 1]} to ${route[end]}`);
  const card = findCard(entry.pack, entry.card);
  const choice = (card.choices as Json[]).find((c) => c.id === entry.choice);
  const fight = choice && fightOf(choice.effects as Json[]);
  if (!fight) throw new Error(`${entry.card}.${entry.choice} has no fight`);
  const wagon = { ...fight, wagon: true, ...(from ? { from } : {}), ...(entry.owner ? {} : { owner: false }) };
  const deck = {
    cards: [
      {
        id: entry.card,
        zone: road.zone,
        target: "blades",
        text: "The table's fight.",
        text_ru: "Бой для таблицы.",
        choices: [
          { id: "fight", text: "Fight.", text_ru: "Бой.", effects: [{ do: "remember", deed: "table_rides" }, wagon] },
          { id: "pass", text: "Pass.", text_ru: "Мимо.", effects: [{ do: "delay", minutes: 10 }] },
          // Readers that speak, so the copy's company passes rule A9.
          { id: "read_dead", if: ["dog_dead", "tam_dead"], text: "Read.", text_ru: "Читать.", effects: [{ do: "delay", minutes: 20 }] },
          { id: "read_hurt", if: ["dog_hurt", "tam_hurt"], unless: "dog_dead", text: "Read.", text_ru: "Читать.", effects: [{ do: "delay", minutes: 30 }] },
        ],
      },
    ],
  };
  const deckDir = path.join(world, "deck");
  mkdirSync(deckDir);
  writeFileSync(path.join(deckDir, "table.json"), JSON.stringify(deck));
  writeFileSync(path.join(world, "company.json"), JSON.stringify({ company }));
  // The Merchant fights as a roster person from the Commoner block (design §5); until MAP-24 puts
  // the Merchants in the world's roster, the copy does.
  const owner = ((w.caravan as Json).owner as string).replace(/^npc:/, "");
  const npcsFile = path.join(world, "npcs.json");
  const npcs = read(npcsFile);
  const roster = npcs.npcs as Json[];
  if (!roster.some((n) => n.id === owner)) {
    roster.push({ id: owner, name: owner, monster: "commoner", attitude: "friendly" });
    writeFileSync(npcsFile, JSON.stringify(npcs));
  }
  const scene = scenes[start];
  if (!scene) throw new Error(`${entry.pack}: ${start} has no scene`);
  const party = (campaign.party as Json[]).map((p) => p.handle as string);
  const sceneFile = path.join(dir, "scenes", `${scene}.json`);
  const sceneJson = read(sceneFile);
  for (const c of sceneJson.creatures as Json[]) if (party.includes(c.handle as string)) c.control = "scripted";
  writeFileSync(sceneFile, JSON.stringify(sceneJson));
  return { dir, legs, scene, party };
}

interface Tally {
  fights: number;
  lost: number;
  dead: Map<string, number>;
  hurt: Map<string, number>;
  stood: Map<string, number>;
}

async function play(entry: WagonCard, from: string | undefined, company: Json[], seeds: number, root: string): Promise<Tally> {
  const copy = copyFor(entry, from, company, root);
  const runDir = mkdtempSync(path.join(root, "run-"));
  const tally: Tally = { fights: 0, lost: 0, dead: new Map(), hurt: new Map(), stood: new Map() };
  const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const engine = await GameEngine.start({ pack: copy.dir, runDir, seed: 1 });
  const must = async (viewer: string, command: Json): Promise<Event[]> => {
    const r = await engine.request(viewer as never, command as never);
    if (!r.ok) throw new Error(`${entry.card}: ${JSON.stringify(command)} refused: ${r.error?.message}`);
    return r.events;
  };
  for (let seed = 1; seed <= seeds; seed++) {
    await must("dm", { cmd: "new_session", seed });
    await must("dm", { cmd: "load_scene", scene_id: copy.scene });
    await must("dm", { cmd: "start_campaign", party: copy.party });
    const driver = copy.party[0]!;
    // Each leg in turn, a night between when the day is spent.
    for (const to of copy.legs) {
      let r = await engine.request(driver as never, { cmd: "travel", actor: driver, to, pace: "normal" } as never);
      if (!r.ok) {
        await must(driver, { cmd: "rest_night", actor: driver, where: "camp" });
        r = await engine.request(driver as never, { cmd: "travel", actor: driver, to, pace: "normal" } as never);
      }
      if (!r.ok) throw new Error(`${entry.card}: travel to ${to} refused: ${r.error?.message}`);
    }
    const events: Event[] = [];
    for (const blade of copy.party) events.push(...(await must(blade, { cmd: "choose_card", actor: blade, choice: "fight" })));
    const started = events.find((e) => e.kind === "combat_started");
    if (!started || started.kind !== "combat_started") throw new Error(`${entry.card}: seed ${seed}: no fight started`);
    tally.fights++;
    const state = await engine.request("dm", { cmd: "get_state" });
    const creatures = state.result?.cmd === "get_state" && state.result.state.view === "dm" ? state.result.state.creatures : [];
    const allies = creatures.filter((c) => c.side === "party" && !copy.party.includes(c.handle) && started.participants.includes(c.handle));
    for (const ally of allies) {
      add(tally.stood, ally.handle);
      if (ally.life_state === "dead") add(tally.dead, ally.handle);
      else if (ally.hp < ally.hp_max) add(tally.hurt, ally.handle);
    }
    const over = events.find((e) => e.kind === "combat_over");
    if (over?.kind === "combat_over" && over.winner !== "party") tally.lost++;
  }
  await engine.shutdown();
  return tally;
}

const { values } = parseArgs({ options: { seeds: { type: "string", default: "200" } } });
const seeds = Number(values.seeds);
const root = mkdtempSync(path.join(tmpdir(), "wagon-table-"));
const pct = (n: number, of: number) => `${of ? Math.round((100 * n) / of) : 0}%`;
const lines = [`Wagon fights, ${seeds} seeds each (ENG-48): per ally, dead and hurt of the fights it stood in.`, "", "| card | monsters from | company | Blades lost | ally | stood | dead | hurt |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
try {
  for (const entry of CARDS) {
    for (const from of FROMS) {
      for (const { name, company } of COMPANIES) {
        const t = await play(entry, from, company, seeds, root);
        const where = from ?? "the wagon";
        for (const [ally, stood] of [...t.stood].sort()) {
          lines.push(`| ${entry.card} | ${where} | ${name} | ${pct(t.lost, t.fights)} | ${ally} | ${stood} | ${pct(t.dead.get(ally) ?? 0, stood)} | ${pct(t.hurt.get(ally) ?? 0, stood)} |`);
        }
      }
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log(lines.join("\n"));
