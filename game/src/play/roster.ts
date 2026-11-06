// The party between runs (M9 design §3, TASKS.md API-45): `rosters/<name>.json` holds what the
// engine's `save_roster` returned, as is, and `new_session{roster}` reads it back. Rosters stay out
// of the repo, like run folders (`rosters/` is gitignored).
//
// The hash chain: each save appends `{run_id, sha256, at}` to `rosters/<name>.chain.jsonl`, and
// `run.json` records the roster's sha256 when the run loaded it and when it saved it. A roster whose
// file has neither of the last two logged hashes was changed by hand: the run says so and plays on.
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
  /** `continue` played the saved party; `new` started the pack's pregens and replaces the saved one at the end; `again` played the last journey again from where it began, with the party and the world as the engine kept them then (API-51). */
  party: "continue" | "new" | "again";
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
  const logged = log.map((line) => (JSON.parse(line) as { sha256?: string }).sha256);
  // A save logs its hash before it replaces the file, so a crash in between leaves the file the
  // save before it wrote: either of the last two logged hashes is a file a save wrote.
  const chain: Chain = logged.length === 0 ? "unlogged" : logged.slice(-2).includes(hash) ? "held" : "broken";
  const roster: unknown = JSON.parse(text);
  if (!isRoster(roster)) throw new Error(`${file} is not a saved party: it needs a characters list, each with a handle, a pregen and a level`);
  return { roster, sha256: hash, chain };
}

/** Enough of a roster's shape to show it before the engine checks the rest (`bad_roster`). */
function isRoster(value: unknown): value is Roster {
  if (typeof value !== "object" || value === null) return false;
  const characters = (value as { characters?: unknown }).characters;
  return (
    Array.isArray(characters) &&
    characters.every((c) => typeof c === "object" && c !== null && typeof c.handle === "string" && typeof c.pregen === "string" && Number.isInteger(c.level))
  );
}

/**
 * Writes `roster` as `name` and logs its hash for `runId`. The file is written whole, its hash
 * logged, and only then renamed over the old one: a crash at any point leaves a roster a save
 * wrote, and a failed log leaves the old roster in place. Returns the sha256.
 */
export function writeRoster(dir: string, name: string, roster: Roster, runId: string): string {
  mkdirSync(dir, { recursive: true });
  const text = JSON.stringify(roster, null, 2) + "\n";
  const file = rosterFile(dir, name);
  const hash = sha256(text);
  writeFileSync(`${file}.tmp`, text);
  appendFileSync(chainFile(dir, name), JSON.stringify({ run_id: runId, sha256: hash, at: new Date().toISOString() }) + "\n");
  renameSync(`${file}.tmp`, file);
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

/** The roster format this game plays (API-51): an older one is refused before the engine starts. */
export const ROSTER_FORMAT = 2;

/** Why a saved party can't be carried on, in one plain line; undefined when it can. */
export function rosterRefusal(roster: Roster): string | undefined {
  if (roster.format === ROSTER_FORMAT) return undefined;
  if (roster.format > ROSTER_FORMAT) return "this party was saved by a newer version of the game, which this version can't read. Its file stays as it is. To play it, update the game; to play now, start a new party: add --new-party to the command.";
  return "this party was saved by an older version of the game, which this version can't read. Its file stays as it is. To play now, start a new party: add --new-party to the command.";
}

/**
 * The roster that plays the last journey again from where it began (API-51): the party and the
 * world as the engine kept them at the contract's start. Undefined when the saved party has no
 * journey behind it.
 */
export function replayRoster(roster: Roster): Roster | undefined {
  const start = roster.contract_start;
  if (!roster.world || !start) return undefined;
  // The start goes along too, so a replay saved before its contract begins can be played again.
  return { format: roster.format, characters: start.characters, ...(start.world ? { world: start.world } : {}), contract_start: start };
}

/** The saved party in one line for the start screen: "Torva (level 3), Maren (level 2)". */
export function rosterLine(roster: Roster, names: ReadonlyMap<string, string> = new Map()): string {
  return roster.characters.map((c) => `${names.get(c.handle) ?? c.handle} (level ${c.level})`).join(", ");
}
