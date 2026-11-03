// The pack check (M6 spec §4, decision 0031, TASKS.md MAP-4): what can break the game in a scenario
// pack is caught before anyone plays it. CI runs it on every pack in `scenarios/`; anyone can run
// it on a pack anywhere with `npm run pack:check -- <pack>`.
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GameEngine, REPO } from "../engine.ts";
import { Adventure, CARD_SECTIONS, FORMAT_VERSIONS, STAT_BLOCKS_SINCE } from "./adventure.ts";
import { readCampaign } from "./campaign.ts";
import { skeletonFile } from "./read.ts";

/** Every pack in the repository: each folder of `scenarios/`. */
export function repoPacks(): string[] {
  const scenarios = path.join(REPO, "scenarios");
  return readdirSync(scenarios, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(scenarios, entry.name))
    .sort();
}

export interface PackReport {
  pack: string;
  title?: string;
  /** Scenes the engine loaded, in order. */
  loaded: string[];
  problems: string[];
}

/** The ids a scene file declares, read as plain JSON: the engine checks the rest when it loads. */
interface SceneIds {
  checks: Set<string>;
  encounters: Set<string>;
  /** Its creatures and its spawns' creatures. */
  creatures: Map<string, string>;
  /** The stat block id of each creature it places or spawns, by handle. */
  monsters: Map<string, string>;
  partyStarts: number;
}

function sceneIds(file: string): SceneIds {
  const scene = JSON.parse(readFileSync(file, "utf8"));
  const creatures = new Map<string, string>();
  const monsters = new Map<string, string>();
  for (const c of [...(scene.creatures ?? []), ...(scene.spawns ?? []).flatMap((s: { creatures?: unknown[] }) => s.creatures ?? [])]) {
    creatures.set(c.handle, c.side);
    if (typeof c.monster === "string") monsters.set(c.handle, c.monster);
  }
  return {
    checks: new Set((scene.checks ?? []).map((c: { id: string }) => c.id)),
    encounters: new Set((scene.encounters ?? []).map((e: { id: string }) => e.id)),
    creatures,
    monsters,
    partyStarts: (scene.party_start ?? []).length,
  };
}

function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

/**
 * Checks the pack in `dir`: the skeleton against its schema and `format_version`, every file it
 * names, every id it names against the pack's scene files, and then that the engine loads every
 * scene in order with the party carried in.
 */
export async function checkPack(dir: string, options: { binary?: string; pregens?: string } = {}): Promise<PackReport> {
  const report: PackReport = { pack: dir, loaded: [], problems: [] };
  const problem = (text: string) => report.problems.push(text);
  const skeleton = skeletonFile(dir);
  const name = path.basename(skeleton);
  if (!existsSync(skeleton)) {
    problem("no adventure.json or campaign.json");
    return report;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(skeleton, "utf8"));
  } catch (error) {
    problem(`${name} is not JSON: ${(error as Error).message}`);
    return report;
  }
  const parsed = Adventure.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problem(`${name} ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return report;
  }
  const adventure = parsed.data;
  report.title = adventure.title;
  // A living-world pack (MAP-7): its world lives in campaign.json, and its scenes are joined by the road.
  const campaign = name === "campaign.json";
  if (campaign && !adventure.world) problem("campaign.json has no world block");
  if (!campaign && (adventure.world || adventure.day_limit)) problem("world and day_limit belong in campaign.json, not adventure.json");
  if (!(FORMAT_VERSIONS as readonly number[]).includes(adventure.format_version)) {
    problem(`format_version ${adventure.format_version} is not one this game reads (${FORMAT_VERSIONS.join(", ")})`);
    return report;
  }

  if (adventure.stat_blocks.length > 0 && adventure.format_version < STAT_BLOCKS_SINCE) {
    problem(`stat_blocks needs format_version ${STAT_BLOCKS_SINCE} or later`);
  }

  // Every file it names. The pack's own files stay inside it, so the folder can be moved or shared
  // whole; only lore may be shared text outside it.
  const own = [
    ...adventure.prose,
    ...adventure.party.flatMap((p) => (p.card ? [p.card] : [])),
    ...adventure.npcs.map((n) => n.prose),
    ...adventure.scenes.map((s) => s.prose),
  ];
  const outside = (relative: string) => path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`);
  const root = realpathSync(dir);
  for (const file of own) {
    const full = path.resolve(dir, file);
    if (path.isAbsolute(file) || outside(path.relative(path.resolve(dir), full))) problem(`${file} is outside the pack; only lore may be`);
    // A link inside the pack to a file outside it doesn't travel with the folder either.
    else if (existsSync(full) && outside(path.relative(root, realpathSync(full)))) problem(`${file} links outside the pack; only lore may be`);
  }
  // Each one is read here, as the game reads it: the engine never reads this text.
  for (const file of [...own, ...adventure.lore]) {
    const full = path.resolve(dir, file);
    if (!existsSync(full)) {
      problem(`${file} is named but missing`);
      continue;
    }
    try {
      readFileSync(full, "utf8");
    } catch (error) {
      problem(`${file} can't be read as a file: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`);
    }
  }
  for (const member of adventure.party) {
    if (member.seat === "ai" && !member.card) problem(`party ${member.handle} has an AI seat and no card`);
    // Any character may be played by an AI, so every card has every section, the human's too.
    const card = member.card ? path.resolve(dir, member.card) : undefined;
    if (!card || !existsSync(card) || !statSync(card).isFile()) continue;
    const headings = new Set([...readFileSync(card, "utf8").matchAll(/^## +(.+?)\s*$/gm)].map((m) => m[1]));
    for (const section of CARD_SECTIONS) if (!headings.has(section)) problem(`${member.card} has no "## ${section}" section`);
  }

  // A Russian run's one name for a character is one the table's name matcher knows (AGT-38).
  for (const member of adventure.party) {
    if (member.name_ru && !(member.names ?? []).includes(member.name_ru)) problem(`party ${member.handle}: name_ru ${member.name_ru} is not among its names`);
  }

  // A turn-order glyph is one grapheme (AGT-67), so it can't push the bar's text around by more than one cell's drift.
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const [key, glyph] of Object.entries(adventure.glyphs).filter(([key]) => key !== "_comment")) {
    if ([...graphemes.segment(glyph)].length !== 1) problem(`glyphs ${key}: ${JSON.stringify(glyph)} is not one glyph`);
  }

  // Every id it names.
  const sceneIdList = adventure.scenes.map((s) => s.id);
  for (const [what, list] of [
    ["scene", sceneIdList],
    ["npc", adventure.npcs.map((n) => n.id)],
    ["party handle", adventure.party.map((p) => p.handle)],
    ["stat block entry", adventure.stat_blocks.map((s) => s.id)],
  ] as const) {
    for (const id of duplicates([...list])) problem(`${what} ${id} is listed twice`);
  }
  let sceneFiles: string[] = [];
  try {
    if (existsSync(path.join(dir, "scenes"))) {
      sceneFiles = readdirSync(path.join(dir, "scenes")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length));
    }
  } catch (error) {
    problem(`scenes can't be read as a folder: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`);
  }
  for (const orphan of sceneFiles.filter((f) => !sceneIdList.includes(f))) problem(`scenes/${orphan}.json is in no scene of the skeleton`);
  const ids = new Map<string, SceneIds>();
  for (const id of sceneIdList) {
    const file = path.join(dir, "scenes", `${id}.json`);
    if (!existsSync(file)) {
      problem(`scene ${id} has no scenes/${id}.json`);
      continue;
    }
    try {
      ids.set(id, sceneIds(file));
    } catch (error) {
      problem(`scenes/${id}.json is not JSON: ${(error as Error).message}`);
    }
  }
  const npcIds = new Set(adventure.npcs.map((n) => n.id));
  for (const [index, scene] of adventure.scenes.entries()) {
    const declared = ids.get(scene.id);
    for (const npc of scene.npcs) if (!npcIds.has(npc)) problem(`scene ${scene.id} lists npc ${npc}, which the skeleton doesn't`);
    for (const exit of scene.exits) if (!sceneIdList.includes(exit.to)) problem(`scene ${scene.id} exits to ${exit.to}, which the skeleton doesn't list`);
    const last = index === adventure.scenes.length - 1;
    if (!campaign && last && scene.exits.length > 0) problem(`scene ${scene.id} is the last and has exits`);
    if (!campaign && !last && scene.exits.length === 0) problem(`scene ${scene.id} has no exit`);
    if (!declared) continue;
    for (const hint of scene.checks) if (!declared.checks.has(hint.check)) problem(`scene ${scene.id} names check ${hint.check}, which its file doesn't declare`);
    for (const hint of scene.encounters) if (!declared.encounters.has(hint.encounter)) problem(`scene ${scene.id} names encounter ${hint.encounter}, which its file doesn't declare`);
    if (index === 0) {
      for (const member of adventure.party) {
        if (declared.creatures.get(member.handle) !== "party") problem(`the first scene doesn't place party member ${member.handle}`);
      }
    } else if (declared.partyStarts < adventure.party.length) {
      problem(`scene ${scene.id} has ${declared.partyStarts} party_start anchors for a party of ${adventure.party.length}`);
    }
  }
  const entries = new Set(adventure.stat_blocks.map((s) => s.id));
  for (const npc of adventure.npcs) {
    if (npc.stat_block && !entries.has(npc.stat_block)) problem(`npc ${npc.id} names stat block entry ${npc.stat_block}, which stat_blocks doesn't list`);
    for (const link of npc.creatures ?? []) {
      const declared = ids.get(link.scene);
      if (!sceneIdList.includes(link.scene)) problem(`npc ${npc.id} names scene ${link.scene}, which the skeleton doesn't list`);
      else if (declared && !declared.creatures.has(link.handle)) problem(`npc ${npc.id} names ${link.handle}, which scene ${link.scene} doesn't place`);
    }
  }
  if (report.problems.length > 0) return report;

  // Every scene loads, in order, with the party carried in.
  const runDir = mkdtempSync(path.join(tmpdir(), "pack-check-"));
  let engine: GameEngine | undefined;
  try {
    engine = await GameEngine.start({ pack: dir, runDir, seed: 1, binary: options.binary, pregens: options.pregens });
    const party = adventure.party.map((p) => p.handle);
    // The creature kinds the scenes place, as the seat names them: what a glyph key may be. A kind
    // the engine shows on a scene's load is read from it; one that only ever arrives later (a spawn)
    // is named from its stat block id, goblin_warrior as Goblin Warrior.
    const kinds = new Set<string>();
    const named = new Set<string>();
    const look = async (monsters: Map<string, string>) => {
      const r = await engine!.request("dm", { cmd: "get_state" });
      if (!(r.ok && r.result?.cmd === "get_state" && r.result.state.view === "dm")) return;
      for (const c of r.result.state.creatures) {
        kinds.add(c.name);
        const monster = monsters.get(c.handle);
        if (monster) named.add(monster);
      }
    };
    for (const [index, scene] of adventure.scenes.entries()) {
      const loaded = await engine.request("dm", { cmd: "load_scene", scene_id: scene.id, party: index === 0 ? undefined : party });
      if (!loaded.ok) {
        problem(`the engine refused scene ${scene.id}: ${loaded.error?.message}`);
        break;
      }
      report.loaded.push(scene.id);
      await look(ids.get(scene.id)?.monsters ?? new Map());
    }
    // A living-world pack's campaign starts where the run starts it, on its start place's scene:
    // the engine checks the world, its deck, NPCs and every scene a journey can load (MAP-6, MAP-7).
    if (campaign && report.loaded.length === adventure.scenes.length) {
      // A start the table can't resolve still goes to the engine from the first scene, so the
      // engine says what is wrong with the campaign.
      let start = adventure.scenes[0].id;
      try {
        start = readCampaign(dir)?.startScene ?? start;
      } catch {
        // the engine's refusal below names the fault
      }
      const first = await engine.request("dm", { cmd: "load_scene", scene_id: start });
      const started = first.ok ? await engine.request("dm", { cmd: "start_campaign", party }) : first;
      if (!started.ok) problem(`the engine refused the campaign: ${started.error?.message}`);
    }
    for (const monster of new Set([...ids.values()].flatMap((d) => [...d.monsters.values()]))) {
      if (named.has(monster)) continue;
      kinds.add((monster.split(/[.:]/).at(-1) ?? monster).split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
    }
    // Every stat_blocks entry places, beside the party in the last scene: the engine knows the stat
    // block, the side and every item it carries (API-33). The next load would clear them.
    if (report.loaded.length === adventure.scenes.length && adventure.stat_blocks.length > 0) {
      const r = await engine.request("dm", { cmd: "get_state" });
      const near = r.ok && r.result?.cmd === "get_state" && r.result.state.view === "dm"
        ? r.result.state.creatures.find((c) => party.includes(c.handle))?.position_ft
        : undefined;
      // A spot with no room says nothing about the entry: the next spot around the party is tried,
      // and an entry that finds room at none of them is a problem too, so every entry is checked.
      // Offsets on the ground, east-west and north-south (`z_ft` is up).
      const spots = [[30, 0], [-30, 0], [0, 30], [0, -30], [60, 0], [-60, 0]];
      for (const [i, entry] of adventure.stat_blocks.entries()) {
        if (!near) break;
        let refused: string | undefined = "no spot near the party had room for it";
        for (const [dx, dy] of spots) {
          const placed = await engine.request("dm", {
            cmd: "place_creature",
            handle: `pack_check_${i + 1}`,
            monster: entry.monster,
            side: entry.side,
            at: { kind: "point", point: { x_ft: near.x_ft + dx, y_ft: near.y_ft + dy, z_ft: near.z_ft } },
            // The authored name goes too: the engine checks it as the DM tool will send it.
            ...(entry.name ? { name: entry.name } : {}),
            ...(entry.carries ? { carries: entry.carries } : {}),
          });
          if (!placed.ok && placed.error?.reason === "no_room") continue;
          refused = placed.ok ? undefined : placed.error?.message;
          break;
        }
        if (refused !== undefined) problem(`stat_blocks ${entry.id}: the engine refused it: ${refused}`);
      }
    }
    for (const entry of adventure.stat_blocks) {
      kinds.add((entry.monster.split(/[.:]/).at(-1) ?? entry.monster).split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
      if (entry.name) kinds.add(entry.name);
    }
    // A glyph key that is no party handle and no kind any scene places would never be drawn (AGT-67).
    if (report.loaded.length === adventure.scenes.length) {
      for (const key of Object.keys(adventure.glyphs).filter((key) => key !== "_comment")) {
        if (!party.includes(key) && !kinds.has(key)) problem(`glyphs ${key}: no party handle, and no creature kind a scene places (${[...kinds].sort().join(", ")})`);
      }
    }
  } catch (error) {
    problem(`the engine didn't start on the pack: ${(error as Error).message}`);
  } finally {
    engine?.close();
    rmSync(runDir, { recursive: true, force: true });
  }
  return report;
}
