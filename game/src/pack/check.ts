// The pack check (M6 spec §4, decision 0031, TASKS.md MAP-4): what can break the game in a scenario
// pack is caught before anyone plays it. CI runs it on every pack in `scenarios/`; anyone can run
// it on a pack anywhere with `npm run pack:check -- <pack>`.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GameEngine, REPO } from "../engine.ts";
import { Adventure, FORMAT_VERSIONS } from "./adventure.ts";

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
  partyStarts: number;
}

function sceneIds(file: string): SceneIds {
  const scene = JSON.parse(readFileSync(file, "utf8"));
  const creatures = new Map<string, string>();
  for (const c of [...(scene.creatures ?? []), ...(scene.spawns ?? []).flatMap((s: { creatures?: unknown[] }) => s.creatures ?? [])]) {
    creatures.set(c.handle, c.side);
  }
  return {
    checks: new Set((scene.checks ?? []).map((c: { id: string }) => c.id)),
    encounters: new Set((scene.encounters ?? []).map((e: { id: string }) => e.id)),
    creatures,
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
  const skeletonFile = path.join(dir, "adventure.json");
  if (!existsSync(skeletonFile)) {
    problem("no adventure.json");
    return report;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(skeletonFile, "utf8"));
  } catch (error) {
    problem(`adventure.json is not JSON: ${(error as Error).message}`);
    return report;
  }
  const parsed = Adventure.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problem(`adventure.json ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return report;
  }
  const adventure = parsed.data;
  report.title = adventure.title;
  if (!(FORMAT_VERSIONS as readonly number[]).includes(adventure.format_version)) {
    problem(`format_version ${adventure.format_version} is not one this game reads (${FORMAT_VERSIONS.join(", ")})`);
    return report;
  }

  // Every file it names. The pack's own files stay inside it, so the folder can be moved or shared
  // whole; only lore may be shared text outside it.
  const own = [
    ...adventure.prose,
    ...adventure.party.flatMap((p) => (p.card ? [p.card] : [])),
    ...adventure.npcs.map((n) => n.prose),
    ...adventure.scenes.map((s) => s.prose),
  ];
  for (const file of own) {
    const relative = path.relative(path.resolve(dir), path.resolve(dir, file));
    if (path.isAbsolute(file) || relative.startsWith("..")) problem(`${file} is outside the pack; only lore may be`);
  }
  for (const file of [...own, ...adventure.lore]) {
    if (!existsSync(path.resolve(dir, file))) problem(`${file} is named but missing`);
  }
  for (const member of adventure.party) {
    if (member.seat === "ai" && !member.card) problem(`party ${member.handle} has an AI seat and no card`);
  }

  // Every id it names.
  const sceneIdList = adventure.scenes.map((s) => s.id);
  for (const [what, list] of [
    ["scene", sceneIdList],
    ["npc", adventure.npcs.map((n) => n.id)],
    ["party handle", adventure.party.map((p) => p.handle)],
  ] as const) {
    for (const id of duplicates([...list])) problem(`${what} ${id} is listed twice`);
  }
  const sceneFiles = existsSync(path.join(dir, "scenes"))
    ? readdirSync(path.join(dir, "scenes")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length))
    : [];
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
    if (last && scene.exits.length > 0) problem(`scene ${scene.id} is the last and has exits`);
    if (!last && scene.exits.length === 0) problem(`scene ${scene.id} has no exit`);
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
  for (const npc of adventure.npcs) {
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
    for (const [index, scene] of adventure.scenes.entries()) {
      const loaded = await engine.request("dm", { cmd: "load_scene", scene_id: scene.id, party: index === 0 ? undefined : party });
      if (!loaded.ok) {
        problem(`the engine refused scene ${scene.id}: ${loaded.error?.message}`);
        break;
      }
      report.loaded.push(scene.id);
    }
  } catch (error) {
    problem(`the engine didn't start on the pack: ${(error as Error).message}`);
  } finally {
    engine?.close();
    rmSync(runDir, { recursive: true, force: true });
  }
  return report;
}
