// Where «Где все» writes each name (AGT-143): creatures five feet apart, as the Mill's yard has them,
// get names that cover no other name and no creature. No browser.
import assert from "node:assert/strict";
import { test } from "node:test";
import { labelBox, ME_SPOTS, PLACE_SPOTS, placeLabels, TOKEN_SPOTS, type Box, type LabelAsk } from "../src/page/labels.ts";

const meets = (a: Box, b: Box) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);

test("names of creatures five feet apart, and of the places they stand on, cover no other name and no creature", () => {
  // The Mill's yard as the engine places it (Stas's screenshot, 2026-11-21), in feet with north up:
  // the human and Torva at the gate, Maren and Ilsa ten feet behind, each on a named place.
  const at = (x: number, y: number) => ({ x, y: -y });
  const creatures: Array<[string, number, number]> = [
    ["вы", 0, 0], ["Торва", 5, 0], ["Марен", 0, -10], ["Ильза", 5, -10], ["Гоблин 1", -25, 35], ["Гоблин 2", -20, 40],
    ["Гоблин 3", 0, 45], ["Гоблин 4", 5, 45], ["Волк 1", 35, 30], ["Волк 2", 40, 25], ["Волк 3", 30, 35],
  ];
  const who = creatures.map(([, x, y]) => at(x, y));
  const names = creatures.map(([n]) => n);
  const places = ([["ворота двора", 0, 0], ["столб ворот", 5, 0], ["конец проулка", 0, -10], ["дыра в изгороди", 5, -10], ["поленница", -25, 35], ["дверь мельницы", 0, 45], ["псарня", 35, 30], ["водопойное корыто", 15, 20], ["мельничное колесо", -40, 45]] as const).map(([text, x, y]) => ({ text, ...at(x, y) }));
  const asks: LabelAsk[] = [
    ...who.map((w, i) => ({ key: `who:${i}`, text: names[i]!, size: 1.3, ...w, spots: i === 0 ? ME_SPOTS : TOKEN_SPOTS })),
    ...places.map((p, i) => ({ key: `place:${i}`, text: p.text, size: 1.3, x: p.x, y: p.y, spots: PLACE_SPOTS })),
  ];
  const marks = [...who.map((w) => ({ ...w, r: 1.9 })), ...places.map((p) => ({ x: p.x, y: p.y, r: 0.75 }))];
  const placed = placeLabels(asks, marks);
  const boxes = placed.map((p, i) => labelBox({ ...asks[i]!, x: 0, y: 0 }, { dx: p.x, dy: p.y, anchor: p.anchor }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) assert.ok(!meets(boxes[i]!, boxes[j]!), `«${asks[i]!.text}» and «${asks[j]!.text}» overlap`);
    for (const m of marks) assert.ok(!meets(boxes[i]!, { x0: m.x - m.r, x1: m.x + m.r, y0: m.y - m.r, y1: m.y + m.r }), `«${asks[i]!.text}» covers a creature`);
  }
  // A lone creature's name stays where it always was: under the disc.
  assert.deepEqual(placeLabels([{ key: "a", text: "Волк 1", size: 1.3, x: 0, y: 0, spots: TOKEN_SPOTS }], [{ x: 0, y: 0, r: 1.9 }]), [{ key: "a", x: 0, y: 3.6, anchor: "middle" }]);
});
