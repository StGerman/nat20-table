// Where the repository and the engine binary are. Node built-ins only, so the preflight can load it
// before `npm ci` has run and say what is missing.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root. */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The engine binary: `$NAT20_API_SERVER`, else the release build, else the debug build. With
 * `NAT20_ENGINE_BUILD=debug` (`npm run check:ts` sets it, AGT-75) the debug build alone: the one
 * `cargo build` just made, never a release build a core pin bump left stale.
 */
export function engineBinary(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NAT20_API_SERVER) return env.NAT20_API_SERVER;
  const debug = path.join(REPO, "target/debug/nat20-api-server");
  if (env.NAT20_ENGINE_BUILD === "debug") return debug;
  const release = path.join(REPO, "target/release/nat20-api-server");
  return existsSync(release) ? release : debug;
}
