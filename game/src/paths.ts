// Where the repository and the engine binary are. Node built-ins only, so the preflight can load it
// before `npm ci` has run and say what is missing.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root. */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Where `npm run engine:fetch` unpacks a released engine (CON-19): `bin/` and core's `core/` assets. */
export const PREBUILT_DIR = path.join(REPO, ".nat20/engine");

/**
 * The fetched engine's folder, when the runs use it (CON-19): `$NAT20_ENGINE_DIR` or `.nat20/engine`,
 * when it holds a binary and this checkout has no cargo build of its own (a cargo build always wins,
 * so a developer never runs a stale download), or with `NAT20_ENGINE_BUILD=prebuilt`. Never with
 * `$NAT20_API_SERVER` or `NAT20_ENGINE_BUILD=debug`.
 */
export function prebuiltEngine(env: NodeJS.ProcessEnv = process.env, exists: (file: string) => boolean = existsSync): string | undefined {
  if (env.NAT20_API_SERVER || env.NAT20_ENGINE_BUILD === "debug") return undefined;
  const dir = env.NAT20_ENGINE_DIR || PREBUILT_DIR;
  const built = exists(path.join(REPO, "target/release/nat20-api-server")) || exists(path.join(REPO, "target/debug/nat20-api-server"));
  if (built && env.NAT20_ENGINE_BUILD !== "prebuilt") return undefined;
  return exists(path.join(dir, "bin/nat20-api-server")) ? dir : undefined;
}

/**
 * The engine binary: `$NAT20_API_SERVER`, else the release build, else the debug build, else a
 * fetched engine (CON-19). With `NAT20_ENGINE_BUILD=debug` (`npm run check:ts` sets it, AGT-75) the
 * debug build alone: the one `cargo build` just made, never a release build a core pin bump left stale.
 */
export function engineBinary(env: NodeJS.ProcessEnv = process.env, exists: (file: string) => boolean = existsSync): string {
  if (env.NAT20_API_SERVER) return env.NAT20_API_SERVER;
  const debug = path.join(REPO, "target/debug/nat20-api-server");
  if (env.NAT20_ENGINE_BUILD === "debug") return debug;
  const fetched = prebuiltEngine(env, exists);
  if (fetched) return path.join(fetched, "bin/nat20-api-server");
  const release = path.join(REPO, "target/release/nat20-api-server");
  return exists(release) ? release : debug;
}

/** A fetched check binary (`nat20-audit`, `nat20-digest`) when the runs use a fetched engine; else none, and cargo runs it. */
export function checkBinary(name: "nat20-audit" | "nat20-digest", env: NodeJS.ProcessEnv = process.env, exists: (file: string) => boolean = existsSync): string | undefined {
  const fetched = prebuiltEngine(env, exists);
  return fetched ? path.join(fetched, "bin", name) : undefined;
}

/**
 * What a fetched binary needs to find its content (CON-19): a cargo build falls back to the checkout
 * it was built in, a released one to the release runner's, so every directory is named. A variable
 * already set wins. Empty with no fetched engine.
 */
export function engineEnv(env: NodeJS.ProcessEnv = process.env, exists: (file: string) => boolean = existsSync): Record<string, string> {
  const fetched = prebuiltEngine(env, exists);
  if (!fetched) return {};
  const dirs: Record<string, string> = {
    NAT20_REGISTRY_ROOT: path.join(fetched, "core/registries"),
    NAT20_DATA_DIR: path.join(REPO, "crates/nat20-api-server/data"),
    NAT20_PREGENS_DIR: path.join(REPO, "pregens"),
    NAT20_MAPS_DIR: path.join(REPO, "maps"),
    NAT20_WORLDS_DIR: path.join(REPO, "worlds"),
  };
  return Object.fromEntries(Object.entries(dirs).map(([name, dir]) => [name, env[name] || dir]));
}
