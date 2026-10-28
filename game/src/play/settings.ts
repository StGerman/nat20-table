// A live run's settings (M7 spec §4.1, D5; design §3.1, TASKS.md AGT-14): built-in defaults, then a
// run profile (`--profile cheap` loads `game/profiles/cheap.json`, a path loads that file), then the
// flags typed on the command line. Every setting keeps where its value came from, and the run's
// `run.json` records it. A profile with an unknown key, a value outside its allowed set or a model the
// price table in `usage.ts` doesn't list is refused before the engine starts, so a typo never costs a run.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { LANGUAGES } from "../agents/language.ts";
import { REPO } from "../paths.ts";
import { priced } from "../usage.ts";

/** Where the committed run profiles live. */
export const PROFILES = path.join(REPO, "game/profiles");

/** The SDK's effort levels (`EffortLevel`). */
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

interface Spec {
  kind: "string" | "int" | "bool";
  /** Its value when neither the profile nor a flag sets it. */
  default?: string | number | boolean;
  allowed?: readonly string[];
  /** A model id: refused unless the price table lists it. */
  model?: true;
  /** Typed only: a profile can't set it. */
  flagOnly?: true;
}

/** Every play setting, under its flag's name. */
export const SETTINGS = {
  scene: { kind: "string", default: "s3_mill_yard" },
  scenes: { kind: "string" },
  seed: { kind: "int" },
  "dm-model": { kind: "string", default: "claude-opus-5-5", model: true },
  "player-model": { kind: "string", default: "claude-sonnet-5-5", model: true },
  "dm-effort": { kind: "string", default: "medium", allowed: EFFORTS },
  effort: { kind: "string", default: "low", allowed: EFFORTS },
  craft: { kind: "string", default: "prompt", allowed: ["prompt", "skills"] },
  lang: { kind: "string", default: "en", allowed: LANGUAGES },
  "dm-timeout-ms": { kind: "int" },
  pack: { kind: "string", default: path.join(REPO, "scenarios/the_silent_mill") },
  dm: { kind: "string", default: "model", allowed: ["model", "scripted"] },
  players: { kind: "string", default: "model", allowed: ["model", "scripted"] },
  seat: { kind: "string", default: "scripted", allowed: ["scripted", "ink", "ai"] },
  out: { kind: "string", default: path.join(REPO, "runs") },
  "max-steps": { kind: "int", default: 2000 },
  verbose: { kind: "bool", default: false },
  "no-audit": { kind: "bool", default: false },
  /** Minutes from the first scene's load until the run stops as a fail (`time_limit`); 0 for none. */
  "time-limit-min": { kind: "int", default: 0 },
  /** Explore rounds in a row with no engine event before the run stops as a fail (`stalled`); 0 for none. */
  "stall-rounds": { kind: "int", default: 0 },
  /** The runs repo to upload the run folder to (AGT-41): `owner/repo`, a git URL or a path; `NAT20_RUNS_REPO` when unset. */
  upload: { kind: "string" },
  "no-upload": { kind: "bool", default: false },
  /** Also zip the run folder next to it, and show it in Finder. */
  zip: { kind: "bool", default: false },
  "dry-run": { kind: "bool", default: false, flagOnly: true },
  profile: { kind: "string", flagOnly: true },
} as const satisfies Record<string, Spec>;

export type SettingName = keyof typeof SETTINGS;
type ValueOf<S> = S extends { kind: "int" } ? number : S extends { kind: "bool" } ? boolean : string;
/** Every setting's value: one with a built-in default always has one. */
export type Values = { -readonly [K in SettingName]: (typeof SETTINGS)[K] extends { default: unknown } ? ValueOf<(typeof SETTINGS)[K]> : ValueOf<(typeof SETTINGS)[K]> | undefined };

/** Where a setting's value came from. */
export type From = "default" | "profile" | "flag";

export interface Settings {
  values: Values;
  /** Each setting that has a value, with where it came from: what `run.json` records. */
  provenance: Partial<Record<SettingName, { value: string | number | boolean; from: From }>>;
  /** The profile loaded, by name (or path) and the sha256 of its file. */
  profile?: { name: string; file: string; sha256: string };
}

/** A setting refused before the run starts: the command prints it and exits 2. */
export class SettingError extends Error {}

/** Checks one value against its setting and returns it typed. `where` is the file it came from, or undefined for a typed flag. */
function check(name: string, raw: unknown, where: string | undefined): string | number | boolean {
  const spec = (SETTINGS as Record<string, Spec>)[name];
  if (!spec) throw new SettingError(`${where}: unknown setting ${name}; the settings: ${Object.keys(SETTINGS).join(", ")}`);
  const it = where === undefined ? `--${name}` : `${where}: ${name}`;
  let value: string | number | boolean;
  if (spec.kind === "bool") {
    if (typeof raw !== "boolean") throw new SettingError(`${it} is true or false`);
    value = raw;
  } else if (spec.kind === "int") {
    const n = typeof raw === "string" && /^-?\d+$/.test(raw.trim()) ? Number(raw) : raw;
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) throw new SettingError(`${it} is a whole number, 0 or more`);
    value = n;
  } else {
    if (typeof raw !== "string" || raw.trim() === "") throw new SettingError(`${it} is a non-empty string`);
    value = raw;
  }
  if (spec.allowed && !spec.allowed.includes(value as string)) throw new SettingError(`${it} is one of ${spec.allowed.join(", ")}`);
  if (spec.model && !priced(value as string)) throw new SettingError(`${it} ${value} is not in the price table in game/src/usage.ts`);
  return value;
}

/** Reads a profile by name (`game/profiles/<name>.json`) or by path, and checks every key in it. */
export function readProfile(nameOrPath: string): { name: string; file: string; sha256: string; values: Partial<Record<SettingName, string | number | boolean>> } {
  const byName = /^[a-z0-9-]+$/.test(nameOrPath);
  const file = byName ? path.join(PROFILES, `${nameOrPath}.json`) : path.resolve(nameOrPath.replace(/^~(?=\/)/, process.env.HOME ?? "~"));
  if (!existsSync(file)) throw new SettingError(`--profile ${nameOrPath}: no such profile (${path.relative(process.cwd(), file) || file})`);
  const text = readFileSync(file, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new SettingError(`${file}: not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) throw new SettingError(`${file}: a profile is a JSON object`);
  const values: Partial<Record<SettingName, string | number | boolean>> = {};
  for (const [key, raw] of Object.entries(json)) {
    if (key === "_comment") continue;
    const spec = (SETTINGS as Record<string, Spec>)[key];
    if (spec?.flagOnly) throw new SettingError(`${file}: ${key} can only be typed, not set in a profile`);
    values[key as SettingName] = check(key, raw, file);
  }
  return { name: byName ? nameOrPath : file, file, sha256: createHash("sha256").update(text).digest("hex"), values };
}

/**
 * Resolves a play command's settings from its arguments: `defaults` are the command's own (play:full
 * plays every scene in Russian with the 120-minute stop), over the built-in ones.
 */
export function resolveSettings(args: string[], defaults: Partial<Record<SettingName, string | number | boolean>> = {}): Settings {
  const options = Object.fromEntries(Object.entries(SETTINGS).map(([name, spec]) => [name, { type: spec.kind === "bool" ? "boolean" : "string" }])) as Record<
    string,
    { type: "boolean" | "string" }
  >;
  let typed: Record<string, string | boolean | undefined>;
  try {
    // No defaults here: an absent flag is undefined, so where each value came from is exact.
    typed = parseArgs({ args, options, strict: true, allowPositionals: false }).values as Record<string, string | boolean | undefined>;
  } catch (error) {
    throw new SettingError(error instanceof Error ? error.message : String(error));
  }
  const profile = typeof typed.profile === "string" ? readProfile(typed.profile) : undefined;
  const values: Record<string, string | number | boolean | undefined> = {};
  const provenance: Settings["provenance"] = {};
  for (const [name, spec] of Object.entries(SETTINGS) as Array<[SettingName, Spec]>) {
    let value: string | number | boolean | undefined;
    let from: From | undefined;
    if (typed[name] !== undefined) [value, from] = [check(name, typed[name], undefined), "flag"];
    else if (profile && profile.values[name] !== undefined) [value, from] = [profile.values[name], "profile"];
    else if (defaults[name] !== undefined) [value, from] = [check(name, defaults[name], "the command's default"), "default"];
    else if (spec.default !== undefined) [value, from] = [spec.default, "default"];
    values[name] = value;
    if (value !== undefined && from && name !== "profile") provenance[name] = { value, from };
  }
  return { values: values as Values, provenance, ...(profile ? { profile: { name: profile.name, file: profile.file, sha256: profile.sha256 } } : {}) };
}
