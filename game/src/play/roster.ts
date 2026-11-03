// The party between runs (M9 design §3, TASKS.md API-45): `rosters/<name>.json` holds what the
// engine's `save_roster` returned, as is, and `new_session{roster}` reads it back. Rosters stay out
// of the repo, like run folders (`rosters/` is gitignored).
//
// The hash chain: each save appends `{run_id, sha256, at}` to `rosters/<name>.chain.jsonl`, and
// `run.json` records the roster's sha256 when the run loaded it and when it saved it. A roster whose
// file no longer has the hash its last save logged was changed by hand: the run says so and plays on.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Roster } from "@nat20-table/engine-client";
import type { GameEngine } from "../engine.ts";

/** A roster's name: what `--roster` takes and its file is called. */
export const ROSTER_NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Whether the roster file is the one its last save wrote: `held` when its hash is the last one
 * logged, `broken` when it differs (a hand edit), `unlogged` when no save was logged for it.
 */
export type Chain = "held" | "broken" | "unlogged";

/** `run.json`'s `roster`: which roster the run used, and its hash in and out. */
export interface RosterRecord {
  name: string;
  /** `continue` played the saved party; `new` started the pack's pregens and replaces the saved one at the end. */
  party: "continue" | "new";
  /** The sha256 of the file the run loaded; null for a new party. */
  loaded_sha256: string | null;
  /** The chain of the file loaded; null for a new party. */
  chain: Chain | null;
  /** The sha256 of the file the run saved; null when nothing was saved. */
  saved_sha256: string | null;
  /** Why nothing was saved, when nothing was. */
  not_saved: string | null;
}

/** A saved roster read back. */
export interface SavedRoster {
  roster: Roster;
  sha256: string;
  chain: Chain;
}

export function rosterFile(dir: string, name: string): string {
  return path.join(dir, `${name}.json`);
}

function chainFile(dir: string, name: string): string {
  return path.join(dir, `${name}.chain.jsonl`);
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** The saved roster called `name`, or undefined when there is none. */
export function readRoster(dir: string, name: string): SavedRoster | undefined {
  const file = rosterFile(dir, name);
  if (!existsSync(file)) return undefined;
  const text = readFileSync(file, "utf8");
  const hash = sha256(text);
  const log = existsSync(chainFile(dir, name)) ? readFileSync(chainFile(dir, name), "utf8").trim().split("\n").filter(Boolean) : [];
  const last = log.length > 0 ? (JSON.parse(log[log.length - 1]) as { sha256?: string }).sha256 : undefined;
  return { roster: JSON.parse(text) as Roster, sha256: hash, chain: last === undefined ? "unlogged" : last === hash ? "held" : "broken" };
}

/**
 * Writes `roster` as `name` and logs its hash for `runId`. The file is written whole and then
 * renamed over the old one, so a crash mid-write leaves the last good roster. Returns the sha256.
 */
export function writeRoster(dir: string, name: string, roster: Roster, runId: string): string {
  mkdirSync(dir, { recursive: true });
  const text = JSON.stringify(roster, null, 2) + "\n";
  const file = rosterFile(dir, name);
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
  const hash = sha256(text);
  appendFileSync(chainFile(dir, name), JSON.stringify({ run_id: runId, sha256: hash, at: new Date().toISOString() }) + "\n");
  return hash;
}

/**
 * Asks the engine for the party and writes it as `name`. A party with nobody in it (no scene was
 * loaded) is not written, so the saved roster stays as it was. Returns the sha256, or why nothing
 * was saved.
 */
export async function saveRoster(engine: GameEngine, dir: string, name: string, runId: string): Promise<{ sha256: string } | { not_saved: string }> {
  const response = await engine.request("dm", { cmd: "save_roster" });
  if (!response.ok || response.result?.cmd !== "save_roster") return { not_saved: `the engine refused save_roster: ${response.error?.message}` };
  const roster = response.result.roster;
  if (roster.characters.length === 0) return { not_saved: "the party never reached a scene" };
  return { sha256: writeRoster(dir, name, roster, runId) };
}

/** The saved party in one line for the start screen: "Torva (level 3), Maren (level 2)". */
export function rosterLine(roster: Roster, names: ReadonlyMap<string, string> = new Map()): string {
  return roster.characters.map((c) => `${names.get(c.handle) ?? c.handle} (level ${c.level})`).join(", ");
}
