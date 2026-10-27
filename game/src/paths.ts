// Where the repository and the engine binary are. Node built-ins only, so the preflight can load it
// before `npm ci` has run and say what is missing.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root. */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The engine binary: `$NAT20_API_SERVER`, else the release build, else the debug build. */
export function engineBinary(): string {
  if (process.env.NAT20_API_SERVER) return process.env.NAT20_API_SERVER;
  const release = path.join(REPO, "target/release/nat20-api-server");
  return existsSync(release) ? release : path.join(REPO, "target/debug/nat20-api-server");
}
