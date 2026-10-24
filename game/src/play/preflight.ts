// Checks that a Mac is ready for the Milestone 6 live runs (runbook Part 1) without calling a model:
// `npm run preflight`. Each line is one Part 1 item, with what to do when it fails. The one thing it
// changes is the engine build: it builds the binary the runs start, so that binary matches the
// checkout. It runs the same in a terminal and through Remote Control, and exits 1 when a live run
// would fail to start or would bill the API instead of the Claude plan (decision 0036).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { engineBinary, REPO } from "../engine.ts";

interface Check {
  /** "note" is shown and never fails the preflight. */
  ok: boolean | "note";
  what: string;
  detail: string;
  fix?: string;
}

// Generous: the first `cargo` call in the repo installs the pinned Rust release, and the first engine
// build fetches `nat20_core` and takes a few minutes.
const sh = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: REPO, encoding: "utf8", timeout: 600_000 });
const rel = (file: string) => path.relative(REPO, file) || file;

function node(): Check {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return {
    ok: major > 22 || (major === 22 && minor >= 6),
    what: "Node 22.6 or later",
    detail: `node ${process.versions.node}`,
    fix: "brew install node@22, or nvm install in the repo",
  };
}

function packages(): Check {
  const sdk = path.join(REPO, "node_modules/@anthropic-ai/claude-agent-sdk/package.json");
  const ok = existsSync(sdk);
  return { ok, what: "Node packages", detail: ok ? `Agent SDK ${JSON.parse(readFileSync(sdk, "utf8")).version}` : "not installed", fix: "npm ci" };
}

function rust(): Check {
  const pinned = /channel\s*=\s*"([^"]+)"/.exec(readFileSync(path.join(REPO, "rust-toolchain.toml"), "utf8"))?.[1] ?? "?";
  const r = sh("cargo", ["--version"]);
  const version = r.error || r.status !== 0 ? undefined : r.stdout.trim();
  return {
    ok: version?.includes(pinned) ?? false,
    what: `Rust ${pinned} (rust-toolchain.toml)`,
    detail: version ?? "cargo not found",
    fix: version ? "rustup installs the pinned release on the first cargo call in the repo: rustup show" : "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
  };
}

/** Builds the binary the runs start (the release build if there is one, else the debug build). */
function engine(): Check {
  const binary = engineBinary();
  if (process.env.NAT20_API_SERVER) {
    return { ok: existsSync(binary), what: "Engine", detail: `NAT20_API_SERVER=${binary}`, fix: "point NAT20_API_SERVER at a built nat20-api-server, or unset it" };
  }
  const release = binary.includes(`${path.sep}release${path.sep}`);
  const args = ["build", "--locked", "-p", "nat20-api-server", ...(release ? ["--release"] : [])];
  const built = sh("cargo", args);
  const ok = !built.error && built.status === 0;
  return {
    ok,
    what: "Engine built from this checkout",
    detail: ok ? rel(binary) : `cargo ${args.join(" ")} failed${built.stderr ? `: ${built.stderr.trim().split("\n").at(-1)}` : ""}`,
    fix: `cargo ${args.join(" ")}, and read its errors`,
  };
}

function claudeCode(): Check[] {
  const version = sh("claude", ["--version"]);
  if (version.error || version.status !== 0) {
    return [{ ok: false, what: "Claude Code", detail: "claude not found", fix: "npm install -g @anthropic-ai/claude-code" }];
  }
  let status: { loggedIn?: boolean; authMethod?: string } = {};
  try {
    status = JSON.parse(sh("claude", ["auth", "status", "--json"]).stdout);
  } catch {
    // Not logged in, or an older Claude Code without `auth status`: reported below.
  }
  const apiKey = /api.?key/i.test(status.authMethod ?? "");
  return [
    { ok: true, what: "Claude Code", detail: version.stdout.trim() },
    {
      ok: status.loggedIn === true && !apiKey,
      what: "Claude Code logged in with your subscription",
      detail: status.loggedIn === true ? `login method: ${status.authMethod ?? "unknown"}` : "not logged in",
      fix: apiKey ? "claude auth logout, then claude and /login with the subscription account" : "claude, then /login with the subscription account",
    },
  ];
}

function noApiKey(): Check {
  const set = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    ok: !set,
    what: "No API key in the shell",
    detail: set ? "ANTHROPIC_API_KEY is set, so a run would bill the API" : "ANTHROPIC_API_KEY is not set",
    fix: "unset ANTHROPIC_API_KEY, and remove it from ~/.zshrc",
  };
}

function terminal(): Check {
  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  return {
    ok: "note",
    what: "Terminal",
    detail: tty
      ? "this is a terminal: npm run play:exit can run here"
      : "no terminal here (Remote Control or a pipe): every run works here except npm run play:exit and --seat ink",
  };
}

function checkout(): Check {
  const head = sh("git", ["log", "-1", "--format=%h %s"]).stdout.trim();
  const branch = sh("git", ["branch", "--show-current"]).stdout.trim() || "detached";
  const dirty = sh("git", ["status", "--porcelain", "--untracked-files=no"]).stdout.trim() !== "";
  return { ok: "note", what: "Checkout", detail: `${branch} at ${head}${dirty ? ", with local changes" : ""}` };
}

const checks = [node(), packages(), rust(), engine(), ...claudeCode(), noApiKey(), terminal(), checkout()];
console.log("Preflight for the Milestone 6 live runs (docs/runbook/first-local-run.md, Part 1). Nothing here calls a model.\n");
for (const c of checks) {
  console.log(`${c.ok === "note" ? "·" : c.ok ? "✓" : "✗"} ${c.what}: ${c.detail}`);
  if (c.ok === false && c.fix) console.log(`    fix: ${c.fix}`);
}
const failed = checks.filter((c) => c.ok === false).length;
console.log(failed === 0 ? "\nReady: every check passed." : `\n${failed} check${failed === 1 ? "" : "s"} failed. Fix ${failed === 1 ? "it" : "them"} and run npm run preflight again.`);
process.exitCode = failed === 0 ? 0 : 1;
