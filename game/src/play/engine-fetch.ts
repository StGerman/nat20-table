// `npm run engine:fetch [-- --tag TAG | --file TARBALL]` (CON-19): puts a released engine into
// `.nat20/engine/`, so a checkout with no Rust toolchain plays. A release is what the `release`
// workflow publishes: `bin/` (nat20-api-server, nat20-audit, nat20-digest), core's `core/` assets at
// the pinned rev, and `engine.json` with the commit it was built from. With no flag it takes the
// release whose tag points at this checkout's commit, else the latest one. The checksum is checked
// before anything is unpacked. Node built-ins only.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { PREBUILT_DIR, REPO } from "../paths.ts";

/** The release asset for this machine; releases are built for Apple Silicon Macs only. */
export const ASSET = "nat20-engine-darwin-arm64.tar.gz";
const RELEASES = process.env.NAT20_RELEASE_REPO || "StGerman/nat20-table";

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
const git = (...args: string[]) => spawnSync("git", args, { cwd: REPO, encoding: "utf8" }).stdout.trim();

/** The sha256 a `<asset>.sha256` file names: its first word. */
export function expectedSha(text: string): string {
  return text.trim().split(/\s+/)[0].toLowerCase();
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { "user-agent": "nat20-engine-fetch" } });
  if (!response.ok) fail(`Couldn't download ${url}: HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

/** The tag to fetch: `--tag`, else a release tag on this commit, else the latest release. */
async function releaseTag(asked: string | undefined): Promise<string> {
  if (asked) return asked;
  const here = git("tag", "--points-at", "HEAD").split("\n").find((t) => t.startsWith("play-"));
  if (here) return here;
  const response = await fetch(`https://api.github.com/repos/${RELEASES}/releases/latest`, { headers: { accept: "application/vnd.github+json", "user-agent": "nat20-engine-fetch" } });
  if (!response.ok) fail(`Couldn't find the latest release of ${RELEASES}: HTTP ${response.status}. Name one with --tag.`);
  return ((await response.json()) as { tag_name: string }).tag_name;
}

const { values } = parseArgs({ options: { tag: { type: "string" }, file: { type: "string" } }, strict: true });
let tarball: Buffer;
let from: string;
if (values.file) {
  tarball = readFileSync(values.file);
  from = values.file;
  const sums = `${values.file}.sha256`;
  if (existsSync(sums) && createHash("sha256").update(tarball).digest("hex") !== expectedSha(readFileSync(sums, "utf8"))) fail(`${values.file} doesn't match ${sums}.`);
} else {
  if (process.platform !== "darwin" || process.arch !== "arm64") fail(`The released engine is built for Apple Silicon Macs; this is ${process.platform}-${process.arch}. Build it with cargo instead: cargo build --release -p nat20-api-server.`);
  const tag = await releaseTag(values.tag);
  const base = `https://github.com/${RELEASES}/releases/download/${tag}/${ASSET}`;
  console.log(`Fetching the engine of release ${tag}…`);
  tarball = await download(base);
  const sha = createHash("sha256").update(tarball).digest("hex");
  if (sha !== expectedSha((await download(`${base}.sha256`)).toString("utf8"))) fail(`The download doesn't match its checksum (${ASSET}.sha256). Run npm run engine:fetch again.`);
  from = `release ${tag}`;
}

// Unpack beside the target and swap it in, so a failed unpack leaves the old engine as it was.
mkdirSync(path.dirname(PREBUILT_DIR), { recursive: true });
const work = mkdtempSync(path.join(path.dirname(PREBUILT_DIR), "engine-"));
const file = path.join(mkdtempSync(path.join(tmpdir(), "nat20-")), ASSET);
writeFileSync(file, tarball);
const tar = spawnSync("tar", ["-xzf", file, "-C", work], { encoding: "utf8" });
rmSync(path.dirname(file), { recursive: true, force: true });
if (tar.status !== 0) {
  rmSync(work, { recursive: true, force: true });
  fail(`Couldn't unpack the engine: ${tar.stderr.trim()}`);
}
if (!existsSync(path.join(work, "bin/nat20-api-server"))) {
  rmSync(work, { recursive: true, force: true });
  fail(`The archive has no bin/nat20-api-server.`);
}
rmSync(PREBUILT_DIR, { recursive: true, force: true });
renameSync(work, PREBUILT_DIR);

const made = JSON.parse(readFileSync(path.join(PREBUILT_DIR, "engine.json"), "utf8")) as { table_commit: string; core_rev: string };
console.log(`The engine from ${from} is in ${path.relative(REPO, PREBUILT_DIR)}/: built from ${made.table_commit.slice(0, 7)}, core ${made.core_rev.slice(0, 7)}.`);
const head = git("rev-parse", "HEAD");
if (head && head !== made.table_commit) {
  console.log(`This checkout is at ${head.slice(0, 7)}, not ${made.table_commit.slice(0, 7)}. If the engine refuses to start, check out the release's commit: git checkout ${made.table_commit.slice(0, 7)}.`);
}
if (existsSync(path.join(REPO, "target/release/nat20-api-server")) || existsSync(path.join(REPO, "target/debug/nat20-api-server"))) {
  console.log("This checkout also has a cargo build, which the runs prefer; NAT20_ENGINE_BUILD=prebuilt runs the fetched engine instead.");
}
