// Run settings and profiles (M7 spec §4.1, D5; design §3.1): defaults, then a profile, then typed
// flags, each with where it came from; a bad profile is refused before a run starts.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PROFILES, readProfile, resolveSettings, SettingError } from "../src/play/settings.ts";

function profileFile(json: unknown): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "profile-")), "mine.json");
  writeFileSync(file, JSON.stringify(json));
  return file;
}

test("every committed profile loads and passes its checks", () => {
  const names = readdirSync(PROFILES).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  assert.ok(names.includes("cheap") && names.includes("demo"));
  for (const name of names) {
    const profile = readProfile(name);
    assert.equal(profile.name, name);
    assert.match(profile.sha256, /^[0-9a-f]{64}$/);
  }
});

test("the cheap profile is the D4 setup: a Sonnet DM at medium effort and Haiku players at high, in Russian", () => {
  const { values, provenance, profile } = resolveSettings(["--profile", "cheap"]);
  assert.equal(values["dm-model"], "claude-sonnet-5-5");
  assert.equal(values["dm-effort"], "medium");
  assert.equal(values["player-model"], "claude-haiku-5-5");
  assert.equal(values.effort, "high");
  assert.equal(values.lang, "ru");
  assert.deepEqual(provenance["dm-model"], { value: "claude-sonnet-5-5", from: "profile" });
  assert.equal(profile?.name, "cheap");
});

test("a typed flag wins over the profile, and the profile over the command's defaults and the built-in ones", () => {
  const { values, provenance } = resolveSettings(["--profile", "cheap", "--dm-model", "claude-opus-5-5", "--seed", "7"], { lang: "en", "time-limit-min": 120 });
  assert.deepEqual(provenance["dm-model"], { value: "claude-opus-5-5", from: "flag" });
  assert.deepEqual(provenance.lang, { value: "ru", from: "profile" });
  assert.deepEqual(provenance["time-limit-min"], { value: 120, from: "default" });
  assert.deepEqual(provenance.craft, { value: "prompt", from: "default" });
  assert.equal(values.seed, 7);
  assert.equal(values.scenes, undefined);
  assert.equal(provenance.scenes, undefined);
});

test("a profile with an unknown key, a bad value, an unpriced model or a typed-only setting is refused", () => {
  const refused = (json: unknown, why: RegExp) => assert.throws(() => resolveSettings(["--profile", profileFile(json)]), (e: Error) => e instanceof SettingError && why.test(e.message));
  refused({ "dm-modle": "claude-opus-5-5" }, /unknown setting dm-modle/);
  refused({ effort: "huge" }, /effort is one of low, medium, high, xhigh, max/);
  refused({ "player-model": "claude-sonnet-4" }, /not in the price table/);
  refused({ "max-steps": "many" }, /whole number/);
  refused({ verbose: "yes" }, /true or false/);
  refused({ "dry-run": true }, /can only be typed/);
  // A comment is not a setting.
  assert.equal(resolveSettings(["--profile", profileFile({ _comment: "mine", seed: 3 })]).values.seed, 3);
});

test("a bad typed flag or a missing profile is refused too", () => {
  assert.throws(() => resolveSettings(["--seat", "nobody"]), SettingError);
  assert.throws(() => resolveSettings(["--no-such-flag"]), SettingError);
  assert.throws(() => resolveSettings(["--profile", "no-such-profile"]), /no such profile/);
});
