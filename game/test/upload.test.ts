// Runs upload themselves (M7 spec §4.9, design §3.8, AGT-41): into a local bare repo standing in for
// StGerman/nat20-runs. Idempotent, never deletes, keeps the repo's confirmations, refuses a secret.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { RUN_FORMAT, writeRunRecord } from "../src/play/record.ts";
import { findSecret, remoteUrl, uploadRun, uploadTarget } from "../src/play/upload.ts";
import { CONFIRMATIONS_JSON, VERDICT_JSON } from "../src/play/verdict.ts";

// Commits in the clone need a name, whatever the machine's git config holds.
Object.assign(process.env, { GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.com" });

const git = (cwd: string, ...args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8" });

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "upload-"));
  const remote = path.join(root, "runs.git");
  git(root, "init", "--quiet", "--bare", "--initial-branch=main", remote);
  const runDir = path.join(root, "runs", "full-2026-10-28T09-00-00-000Z");
  mkdirSync(runDir, { recursive: true });
  writeRunRecord(runDir, {
    run_format: RUN_FORMAT,
    run_id: path.basename(runDir),
    command: "play:full",
    profile: { name: "cheap", sha256: "0".repeat(64) },
    settings: {},
    build: { table_commit: "abcdef0123", dirty: false, engine_rev: "d00786a", contract: "1.0.0-dev.36", schema_sha256: "0", node: "v26", os: "darwin arm64" },
    seed: 42,
    seats: { human: null, ai: ["bren"] },
    plan: ["s1"],
    adventure: ["s1"],
    time_limit_min: 120,
    scenes: [],
    started_at: "2026-10-28T09:00:00.000Z",
    ended_at: null,
    ended: null,
    stop: "usage_limit",
  });
  writeFileSync(path.join(runDir, "transcript.jsonl"), "");
  return { root, remote, runDir, clone: path.join(root, "clone") };
}

/** The files the remote holds under `runs/<id>/`. */
function remoteFiles(remote: string, runId: string): string[] {
  return git(remote, "ls-tree", "-r", "--name-only", "main", `runs/${runId}`).stdout.trim().split("\n").filter(Boolean).map((f) => path.basename(f));
}

test("a run folder goes to runs/<run-id>/ in the runs repo, with the run's identity in the commit", () => {
  const { root, remote, runDir, clone } = setup();
  try {
    const first = uploadRun(runDir, { repo: remote, clone });
    assert.ok(first.ok, first.ok ? "" : first.why);
    assert.equal(first.changed, true);
    assert.equal(first.pushed, true);
    const id = path.basename(runDir);
    assert.deepEqual(remoteFiles(remote, id).sort(), ["run.json", "transcript.jsonl", VERDICT_JSON].sort());
    assert.match(git(remote, "log", "-1", "--format=%s", "main").stdout, new RegExp(`^${id}: VOID, cheap, table abcdef0, seed 42`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uploading again sends only what changed, never deletes, and keeps the repo's confirmations", () => {
  const { root, remote, runDir, clone } = setup();
  try {
    assert.ok(uploadRun(runDir, { repo: remote, clone }).ok);
    const again = uploadRun(runDir, { repo: remote, clone });
    assert.ok(again.ok);
    assert.equal(again.changed, false, "nothing changed: no commit");
    assert.equal(again.pushed, false);
    // A thread wrote Stas's answers into the repo; a file the run added later goes up beside them.
    const other = path.join(root, "other");
    git(root, "clone", "--quiet", remote, other);
    writeFileSync(path.join(other, "runs", path.basename(runDir), CONFIRMATIONS_JSON), "{}\n");
    git(other, "add", ".");
    git(other, "commit", "--quiet", "-m", "confirmations");
    git(other, "push", "--quiet");
    writeFileSync(path.join(runDir, "narration-check.jsonl"), "");
    const third = uploadRun(runDir, { repo: remote, clone });
    assert.ok(third.ok, third.ok ? "" : third.why);
    assert.equal(third.changed, true);
    assert.ok(remoteFiles(remote, path.basename(runDir)).includes(CONFIRMATIONS_JSON), "the repo's file stays");
    assert.ok(remoteFiles(remote, path.basename(runDir)).includes("narration-check.jsonl"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a commit whose push failed goes up on the next upload, with nothing new to commit", () => {
  const { root, remote, runDir, clone } = setup();
  try {
    assert.ok(uploadRun(runDir, { repo: remote, clone }).ok);
    writeFileSync(path.join(runDir, "report.md"), "# report\n");
    // The remote refuses pushes for a moment: the commit stays in the clone.
    const hook = path.join(remote, "hooks", "pre-receive");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const refused = uploadRun(runDir, { repo: remote, clone });
    assert.equal(refused.ok, false);
    assert.match(refused.ok ? "" : refused.why, /git push failed/);
    assert.ok(!remoteFiles(remote, path.basename(runDir)).includes("report.md"));
    rmSync(hook);
    const retried = uploadRun(runDir, { repo: remote, clone });
    assert.ok(retried.ok, retried.ok ? "" : retried.why);
    assert.equal(retried.changed, false);
    assert.equal(retried.pushed, true);
    assert.ok(remoteFiles(remote, path.basename(runDir)).includes("report.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a folder holding a credential is refused before anything is copied", () => {
  const { root, remote, runDir, clone } = setup();
  try {
    writeFileSync(path.join(runDir, "inputs.jsonl"), `{"text":"key sk-ant-api03-${"x".repeat(40)}"}\n`);
    assert.deepEqual(findSecret(runDir), { file: "inputs.jsonl", what: "an Anthropic API key" });
    const refused = uploadRun(runDir, { repo: remote, clone });
    assert.equal(refused.ok, false);
    assert.match(refused.ok ? "" : refused.why, /inputs\.jsonl holds what looks like an Anthropic API key/);
    assert.equal(existsSync(clone), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an API key assignment is found with plain, escaped or doubly escaped quotes", () => {
  const { root, runDir } = setup();
  try {
    const value = "abcdefghijklmnopqrstuvwxyz123456";
    for (const typed of [`OPENAI_API_KEY="${value}"`, `OPENAI_API_KEY='${value}'`, `{"OPENAI_API_KEY": "${value}"}`, `OPENAI_API_KEY=${value}`]) {
      // inputs.jsonl holds typed text JSON-escaped, and a nested record escapes it again.
      for (const line of [JSON.stringify({ text: typed }), JSON.stringify({ text: JSON.stringify({ text: typed }) })]) {
        writeFileSync(path.join(runDir, "inputs.jsonl"), `${line}\n`);
        assert.equal(findSecret(runDir)?.what, "an API key assignment", line);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a clone made for another runs repo is refused, not pushed to", () => {
  const { root, remote, runDir, clone } = setup();
  try {
    assert.ok(uploadRun(runDir, { repo: remote, clone }).ok);
    const other = path.join(root, "other.git");
    git(root, "init", "--quiet", "--bare", "--initial-branch=main", other);
    const refused = uploadRun(runDir, { repo: other, clone });
    assert.equal(refused.ok, false);
    assert.match(refused.ok ? "" : refused.why, /belongs to .*runs\.git, not .*other\.git: point NAT20_RUNS_CLONE at another folder/);
    assert.equal(git(other, "rev-parse", "--verify", "--quiet", "main").status, 1, "nothing reached the other repo");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a relative path to the runs repo is read from where the command runs", () => {
  const { root, remote, runDir, clone } = setup();
  const cwd = process.cwd();
  mkdirSync(path.join(clone, "nested"), { recursive: true });
  try {
    process.chdir(root);
    // The clone's parent folder is not where the command runs: git would look for the path there.
    const result = uploadRun(runDir, { repo: path.basename(remote), clone: path.join(clone, "nested", "clone") });
    assert.ok(result.ok, result.ok ? "" : result.why);
    assert.ok(remoteFiles(remote, path.basename(runDir)).includes("run.json"));
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test("the repo's confirmations are never replaced by the Mac's older copy", () => {
  const { root, remote, runDir, clone } = setup();
  try {
    writeFileSync(path.join(runDir, CONFIRMATIONS_JSON), `{"old":true}\n`);
    assert.ok(uploadRun(runDir, { repo: remote, clone }).ok);
    const other = path.join(root, "other");
    git(root, "clone", "--quiet", remote, other);
    writeFileSync(path.join(other, "runs", path.basename(runDir), CONFIRMATIONS_JSON), `{"new":true}\n`);
    git(other, "commit", "--quiet", "-am", "confirmations");
    git(other, "push", "--quiet");
    writeFileSync(path.join(runDir, "report.md"), "# report\n");
    assert.ok(uploadRun(runDir, { repo: remote, clone }).ok);
    const kept = git(remote, "show", `main:runs/${path.basename(runDir)}/${CONFIRMATIONS_JSON}`).stdout;
    assert.equal(kept, `{"new":true}\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the destination is --upload, else NAT20_RUNS_REPO, and none with --no-upload; owner/repo is on GitHub", () => {
  assert.equal(uploadTarget({ upload: "a/b" }, { NAT20_RUNS_REPO: "c/d" }), "a/b");
  assert.equal(uploadTarget({}, { NAT20_RUNS_REPO: "c/d" }), "c/d");
  assert.equal(uploadTarget({ "no-upload": true }, { NAT20_RUNS_REPO: "c/d" }), undefined);
  assert.equal(uploadTarget({}, {}), undefined);
  assert.equal(remoteUrl("StGerman/nat20-runs"), "https://github.com/StGerman/nat20-runs.git");
  assert.equal(remoteUrl("git@github.com:StGerman/nat20-runs.git"), "git@github.com:StGerman/nat20-runs.git");
});
