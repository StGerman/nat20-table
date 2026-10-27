// Runs upload themselves (M7 spec §4.9, design §3.8, TASKS.md AGT-41): after the audit, a play command
// pushes its run folder to the private runs repo (`StGerman/nat20-runs`, decided by Stas 2026-10-27),
// at `runs/<run-id>/`, with plain git and Stas's own login, from a clone kept at `~/.nat20/runs-repo`.
// Run records never go into nat20-table or nat20 (`runs/` stays gitignored there).
//
// It is idempotent: it copies the folder over the clone's copy (adding and replacing, never deleting),
// recomputes the verdict there (so a `confirmations.json` a thread wrote in the repo is kept and
// counted), commits only if a file changed, and pushes whenever the clone is ahead. So `npm run
// runs:upload` retries a failed push, sends what `runs:finish` added after the first upload, sends
// older runs, and does nothing for a run already up to date. A failed upload never fails the run.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { readRunRecord, RUN_JSON } from "./record.ts";
import { writeVerdict } from "./verdict.ts";

/** Names the destination when no `--upload` is typed: `owner/repo`, a git URL, or a path. */
export const RUNS_REPO_ENV = "NAT20_RUNS_REPO";
/** Where the clone lives; `~/.nat20/runs-repo` by default. */
export const RUNS_CLONE_ENV = "NAT20_RUNS_CLONE";

/** What would leak a credential: Anthropic and GitHub tokens, AWS keys, private keys, an API key assignment. */
const SECRETS: Array<[string, RegExp]> = [
  ["an Anthropic API key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["a GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ["an AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["an API key assignment", /\b[A-Z_]*API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]{16,}/],
];

export interface UploadOptions {
  /** `owner/repo` on GitHub, a git URL, or a local path (tests). */
  repo: string;
  /** The clone; `~/.nat20/runs-repo` by default. */
  clone?: string;
}

export type UploadResult =
  | { ok: true; changed: boolean; pushed: boolean; commit: string; where: string }
  | { ok: false; why: string };

/** The destination a play command uploads to: `--upload`, else `NAT20_RUNS_REPO`; none with `--no-upload`. */
export function uploadTarget(flags: { upload?: string; "no-upload"?: boolean }, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (flags["no-upload"]) return undefined;
  return flags.upload ?? (env[RUNS_REPO_ENV] || undefined);
}

/** How to set the destination up, printed when a run has none. */
export const UPLOAD_SETUP = `The run was not uploaded: no runs repo is set. Create the private repo StGerman/nat20-runs on GitHub, then add \`export ${RUNS_REPO_ENV}=StGerman/nat20-runs\` to ~/.zshrc (or pass --upload StGerman/nat20-runs; --no-upload skips it). Older runs go up with npm run runs:upload.`;

/** The git URL for `repo`: `owner/repo` is a GitHub repo; anything else is a URL or a path as given. */
export function remoteUrl(repo: string): string {
  return /^[\w.-]+\/[\w.-]+$/.test(repo) && !existsSync(repo) ? `https://github.com/${repo}.git` : repo;
}

/** The first credential in the folder, if any: the file and what it looks like. */
export function findSecret(dir: string): { file: string; what: string } | undefined {
  for (const file of files(dir)) {
    const text = readFileSync(path.join(dir, file), "utf8");
    for (const [what, pattern] of SECRETS) if (pattern.test(text)) return { file, what };
  }
  return undefined;
}

/** Every file under `dir`, relative to it. */
function files(dir: string, under = ""): string[] {
  return readdirSync(path.join(dir, under)).flatMap((name) => {
    const rel = path.join(under, name);
    return statSync(path.join(dir, rel)).isDirectory() ? files(dir, rel) : [rel];
  });
}

function git(cwd: string, ...args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8", timeout: 120_000 });
}

/** Clones the runs repo on first use, or brings the clone up to date. */
function ensureClone(remote: string, clone: string): string | undefined {
  if (!existsSync(path.join(clone, ".git"))) {
    mkdirSync(path.dirname(clone), { recursive: true });
    const cloned = git(path.dirname(clone), "clone", "--quiet", remote, clone);
    if (cloned.status !== 0) return `git clone ${remote} failed: ${(cloned.stderr || cloned.error?.message || "").trim()}`;
  }
  // An empty repo has no branch yet: the first commit makes main.
  if (git(clone, "rev-parse", "--verify", "--quiet", "HEAD").status !== 0) {
    git(clone, "symbolic-ref", "HEAD", "refs/heads/main");
    return undefined;
  }
  if (git(clone, "rev-parse", "--abbrev-ref", "@{u}").status !== 0) return undefined;
  const pulled = git(clone, "pull", "--rebase", "--quiet");
  return pulled.status === 0 ? undefined : `git pull --rebase in ${clone} failed: ${pulled.stderr.trim()}`;
}

/** Pushes the clone if it is ahead of its remote; on a rejection, pulls with rebase and tries once more. */
function pushIfAhead(clone: string): { pushed: boolean; why?: string } {
  const upstream = git(clone, "rev-parse", "--abbrev-ref", "@{u}").status === 0;
  const ahead = upstream ? Number(git(clone, "rev-list", "--count", "@{u}..HEAD").stdout.trim()) > 0 : true;
  if (!ahead) return { pushed: false };
  const push = () => git(clone, "push", "--quiet", "-u", "origin", "HEAD");
  let pushed = push();
  if (pushed.status !== 0 && upstream) {
    const pulled = git(clone, "pull", "--rebase", "--quiet");
    if (pulled.status === 0) pushed = push();
  }
  return pushed.status === 0 ? { pushed: true } : { pushed: false, why: `git push failed: ${pushed.stderr.trim()}` };
}

/** The run's place in the repo, as a link when it is on GitHub. */
function where(repo: string, runId: string): string {
  return /^[\w.-]+\/[\w.-]+$/.test(repo) && !existsSync(repo) ? `https://github.com/${repo}/tree/main/runs/${runId}` : `${repo} runs/${runId}`;
}

/** Uploads one run folder. Never throws: a failure comes back as `ok: false` with why. */
export function uploadRun(runDir: string, options: UploadOptions): UploadResult {
  try {
    const runId = path.basename(path.resolve(runDir));
    const secret = findSecret(runDir);
    if (secret) return { ok: false, why: `refused: ${secret.file} holds what looks like ${secret.what}; remove it and run npm run runs:upload -- ${runDir}` };
    const clone = options.clone ?? process.env[RUNS_CLONE_ENV] ?? path.join(homedir(), ".nat20", "runs-repo");
    const cloned = ensureClone(remoteUrl(options.repo), clone);
    if (cloned) return { ok: false, why: cloned };
    const target = path.join(clone, "runs", runId);
    for (const file of files(runDir)) {
      mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
      copyFileSync(path.join(runDir, file), path.join(target, file));
    }
    // The repo's copy may hold Stas's confirmations: its verdict counts them, not the Mac's.
    const verdict = existsSync(path.join(target, RUN_JSON)) ? writeVerdict(target).verdict : undefined;
    git(clone, "add", "--", path.join("runs", runId));
    const changed = git(clone, "diff", "--cached", "--quiet").status !== 0;
    if (changed) {
      const run = existsSync(path.join(runDir, RUN_JSON)) ? readRunRecord(runDir) : undefined;
      const subject = run
        ? `${runId}: ${verdict}, ${run.profile?.name ?? "no profile"}, table ${run.build.table_commit.slice(0, 7)}${run.build.dirty ? " (dirty)" : ""}, seed ${run.seed}`
        : `${runId}: a run folder without run.json`;
      const committed = git(clone, "commit", "--quiet", "-m", subject);
      if (committed.status !== 0) return { ok: false, why: `git commit failed: ${committed.stderr.trim() || committed.stdout.trim()}` };
    }
    const push = pushIfAhead(clone);
    if (push.why) return { ok: false, why: `${push.why}; the commit is in ${clone}, npm run runs:upload sends it` };
    return { ok: true, changed, pushed: push.pushed, commit: git(clone, "rev-parse", "--short", "HEAD").stdout.trim(), where: where(options.repo, runId) };
  } catch (error) {
    return { ok: false, why: error instanceof Error ? error.message : String(error) };
  }
}

/** `--zip`: the run folder zipped next to it, and on macOS shown in Finder. Returns the zip's path. */
export function zipRun(runDir: string): string | undefined {
  const dir = path.resolve(runDir);
  const zip = `${dir}.zip`;
  const made = spawnSync("zip", ["-qr", zip, path.basename(dir)], { cwd: path.dirname(dir) });
  if (made.status !== 0) return undefined;
  if (process.platform === "darwin") spawnSync("open", ["-R", zip]);
  return zip;
}

/**
 * The upload stage at the end of a play command: uploads when a destination is set, zips with
 * `--zip`, and returns the lines to print. It never fails the run.
 */
export function uploadStage(runDir: string, flags: { upload?: string; "no-upload"?: boolean; zip?: boolean }): string[] {
  const lines: string[] = [];
  if (flags.zip) {
    const zip = zipRun(runDir);
    lines.push(zip ? `Zipped to ${path.relative(process.cwd(), zip)}.` : "The zip failed; zip the folder by hand.");
  }
  const repo = uploadTarget(flags);
  if (!repo) {
    if (!flags["no-upload"]) lines.push(UPLOAD_SETUP);
    return lines;
  }
  const result = uploadRun(runDir, { repo });
  lines.push(
    result.ok
      ? `Uploaded ${path.basename(runDir)}: ${result.changed ? `commit ${result.commit}` : "already up to date"}${result.pushed ? ", pushed" : ""}. ${result.where}`
      : `The upload failed, and the run is kept in its folder: ${result.why}`,
  );
  return lines;
}
