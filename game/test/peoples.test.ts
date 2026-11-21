// A people's record (API-63, Glass Table design §4.3): the Corrins' line reaches a Russian seat by
// the English line the engine sends, and the DM's name line holds their Russian name, so the
// narration writes the word the seat underlines.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { REPO } from "../src/engine.ts";
import { peopleBook, worldNames, worldSeatNames } from "../src/pack/campaign.ts";
import { lineKey } from "../src/table/seat-lines.ts";

const WEND = path.join(REPO, "scenarios/fair_in_wend");
const LINE = "The Corrins are a small roving people: they live by families in painted carts and mend kettles all over the valley.";

test("the Corrins' line, as Stas approved it, is the Russian of the line the engine sends", () => {
  const book = peopleBook(WEND, []);
  assert.equal(book.lines.get(lineKey("corrins", LINE)), "Коррины — невысокий кочевой народ: семьями живут в расписных повозках и латают котлы по всей долине.");
});

test("the DM's name line and the seat's names hold the people's Russian name", () => {
  assert.ok(worldNames(WEND).includes("corrins: коррины"));
  assert.equal(worldSeatNames(WEND).get("people:corrins"), "коррины");
});
