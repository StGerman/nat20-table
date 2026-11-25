// A pack's places as a window shows them (CON-26): `plates/index.json` beside the pictures. The
// Mill's file is read in both languages, and each mistake a places file can make is caught, with a
// picture that is named and not drawn yet listed as no fault. No engine and no model.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/engine.ts";
import { checkPlaces, PLACES_FILE, type Places, readPlaces } from "../src/pack/places.ts";

const MILL = path.join(REPO, "scenarios/the_silent_mill");
const SCENES = (JSON.parse(readFileSync(path.join(MILL, "adventure.json"), "utf8")) as { scenes: Array<{ id: string }> }).scenes.map((s) => s.id);

/** The Mill's plates in a folder of the same name, with `edit` applied to the places file. */
function planted(edit: (places: Places, plates: string) => void): { pack: string; close(): void } {
  const root = mkdtempSync(path.join(tmpdir(), "places-"));
  const pack = path.join(root, "the_silent_mill");
  cpSync(path.join(MILL, "plates"), path.join(pack, "plates"), { recursive: true });
  const places = JSON.parse(readFileSync(path.join(pack, PLACES_FILE), "utf8")) as Places;
  edit(places, path.join(pack, "plates"));
  writeFileSync(path.join(pack, PLACES_FILE), JSON.stringify(places, null, 2));
  return { pack, close: () => rmSync(root, { recursive: true, force: true }) };
}

test("the Mill's places are read in the run's language, each picture and plan under the pack's folder", () => {
  const ru = readPlaces(MILL, "ru");
  assert.deepEqual([...ru.keys()], SCENES);
  assert.deepEqual(ru.get("s1_village_green"), { name: "Луг в Вендфорде", plate: "the_silent_mill/green.jpg", plan: "the_silent_mill/green" });
  assert.equal(readPlaces(MILL, "en").get("s1_village_green")?.name, "The village green");
  // Two scenes at one place share its plan and not its picture.
  assert.equal(ru.get("s6_wrap_up")?.plan, ru.get("s1_village_green")?.plan);
  assert.notEqual(ru.get("s6_wrap_up")?.plate, ru.get("s1_village_green")?.plate);
  assert.equal(readPlaces(path.join(REPO, "crates/nat20-api-server/data"), "ru").size, 0, "a pack with no places file has none");
});

test("nothing a window is told of a place names its scene", () => {
  for (const language of ["en", "ru"] as const) {
    const told = JSON.stringify([...readPlaces(MILL, language).values()]);
    for (const scene of SCENES) assert.ok(!told.includes(scene), `${scene} is not told (${language})`);
  }
});

test("the Mill's places pass the check, and a picture named and not drawn is listed and is no fault", () => {
  const { problems, missing } = checkPlaces(MILL, SCENES);
  assert.deepEqual(problems, []);
  assert.deepEqual(missing, ["plates/mill-road.jpg (The mill road) is not drawn yet", "plates/mill-yard.jpg (The mill yard) is not drawn yet"]);
  assert.deepEqual(checkPlaces(path.join(REPO, "crates/nat20-api-server/data"), ["m5_s3_yard"]), { problems: [], missing: [] });
});

const MISTAKES: Array<[string, (places: Places, plates: string) => void, RegExp]> = [
  ["a scene with no place", (p) => void delete p.scenes.s2_mill_road, /scene s2_mill_road has no place$/],
  ["a place of no scene", (p) => void (p.scenes.s9_nowhere = { name: "Nowhere", plate: "nowhere.jpg", plan: "nowhere" }), /s9_nowhere is not a scene of this pack$/],
  ["a picture named by its scene", (p) => void (p.scenes.s2_mill_road.plate = "s2_mill_road.jpg"), /plates\/index\.json scenes\.s2_mill_road\.plate: /],
  ["a picture no scene names", (_p, plates) => writeFileSync(path.join(plates, "stray.jpg"), ""), /plates\/stray\.jpg is named by no scene/],
  ["a field the format does not have", (p) => void ((p.scenes.s1_village_green as Record<string, unknown>).dc = 15), /scenes\.s1_village_green: /],
];

for (const [name, edit, said] of MISTAKES) {
  test(`the places check catches ${name}`, () => {
    const t = planted(edit);
    try {
      const { problems } = checkPlaces(t.pack, SCENES);
      assert.equal(problems.length, 1, problems.join("\n"));
      assert.match(problems[0], said);
    } finally {
      t.close();
    }
  });
}

test("the places check says when the file is not JSON, and when pictures lie with no file", () => {
  const t = planted(() => {});
  try {
    writeFileSync(path.join(t.pack, PLACES_FILE), "{");
    assert.match(checkPlaces(t.pack, SCENES).problems[0], /^plates\/index\.json is not JSON: /);
    rmSync(path.join(t.pack, PLACES_FILE));
    assert.deepEqual(checkPlaces(t.pack, SCENES).problems, ["plates/index.json is missing: plates/ holds pictures no scene names"]);
  } finally {
    t.close();
  }
});

test("the places check catches a picture or a plan that carries its scene's id", () => {
  // The Mill's ids could not be written in a file's name; a pack's may be plain words.
  const root = mkdtempSync(path.join(tmpdir(), "places-"));
  try {
    cpSync(path.join(MILL, "plates/green.jpg"), path.join(root, "plates/green.jpg"));
    writeFileSync(path.join(root, PLACES_FILE), JSON.stringify({ scenes: { green: { name: "The green", plate: "green.jpg", plan: "lawn" }, ambush: { name: "The road", plate: "road.jpg", plan: "ambush-road" } } }));
    assert.deepEqual(checkPlaces(root, ["green", "ambush"]).problems, ["plates/index.json: green.jpg carries a scene id in its name", "plates/index.json: ambush-road carries a scene id in its name"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
