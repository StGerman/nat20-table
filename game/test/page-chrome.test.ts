// The chrome state (AGT-153): what a native shell's controls show, read from the page's
// view. Each recorded seat wire is replayed through the reducer; after every message the chrome
// state must name only moves the open list holds, open a pick or a road card as the ask itself, and
// offer a fight turn as a few chips with the whole sheet behind them. No engine and no model.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HostMessageSchema, type HostMessage } from "../src/seat-wire/schema.ts";
import { chromeOf, type Chrome } from "../src/page/chrome.ts";
import { EMPTY, reduce, settle } from "../src/page/reduce.ts";
import type { TableEvent } from "../src/table/types.ts";
import { ASK_KINDS, everyAsk } from "./page-wires.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function chromes(name: string): Chrome[] {
  const records = readFileSync(path.join(FIXTURES, name), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { seat: string; seq?: number; event?: TableEvent; message?: HostMessage });
  let v = reduce(EMPTY, HostMessageSchema.parse({ type: "hello", wire: 1, hash: "", run: "", language: "ru", handle: records[0].seat, title: "" }));
  const out: Chrome[] = [];
  for (const r of records) {
    v = settle(reduce(v, HostMessageSchema.parse(r.event ? { type: "event", seq: r.seq, event: r.event } : r.message)));
    const c = chromeOf(v);
    // It crosses to Swift as JSON: nothing in it may be lost on the way.
    assert.deepEqual(JSON.parse(JSON.stringify(c)), c);
    out.push(c);
  }
  return out;
}

for (const name of ["yard.seat-wire.jsonl", "the-way-back-ru.seat-wire.jsonl"]) {
  test(`${name}: the chrome state offers only what the open list holds`, () => {
    const all = chromes(name);
    for (const c of all) {
      const rows = c.dock.sheet?.groups.flatMap((g) => g.moves.map((m) => m.n)) ?? [];
      for (const chip of c.dock.chips) assert.ok(rows.includes(chip.n), `chip ${chip.n} of ask ${c.dock.ask} is in the sheet`);
      assert.ok(c.dock.chips.length <= 4);
      assert.equal(new Set(rows).size, rows.length, "a move is listed once");
      if (c.dock.form === "waiting" || c.dock.form === "ended") assert.equal(c.dock.open, false);
      if (c.dock.card?.asked) for (const choice of c.dock.card.choices) assert.ok(choice.n !== undefined, `card choice ${choice.id} can be pressed`);
    }
    assert.equal(all.at(-1)!.dock.form, "ended");
  });
}

test("a fight turn is a few chips with the sheet behind them; a pick is the sheet itself", () => {
  const all = chromes("yard.seat-wire.jsonl");
  const turn = all.find((c) => c.dock.budget !== undefined && c.dock.chips.length > 0);
  assert.ok(turn, "a fight turn was offered");
  assert.equal(turn.dock.sheet?.forced, false);
  assert.ok(turn.dock.more);
  assert.ok(turn.dock.endTurn);
  assert.equal(turn.dock.budget?.length, 3);
  assert.ok(turn.pill?.mine);
  const pick = all.find((c) => c.dock.sheet?.forced === true);
  assert.ok(pick, "a pick opened as its own sheet");
  assert.equal(pick.dock.chips.length, 0);
});

test("a road card carries its choices, their numbers while asked, and the table's votes", () => {
  const all = chromes("the-way-back-ru.seat-wire.jsonl");
  const asked = all.find((c) => c.dock.card?.asked);
  assert.ok(asked, "a card was asked");
  assert.ok(asked.dock.card!.choices.length >= 2);
  const voted = all.find((c) => (c.dock.card?.choices.flatMap((x) => x.votes).length ?? 0) > 1);
  assert.ok(voted, "the table's votes landed on a card");
  assert.ok(all.some((c) => c.dock.card?.decided !== undefined), "a card was decided");
  assert.ok(all.some((c) => c.dock.form === "input" && c.dock.open), "words were asked out of a fight");
});

test("on a wire that holds every kind of ask, each ask puts up a control a shell can press", () => {
  let v = reduce(EMPTY, HostMessageSchema.parse({ type: "hello", wire: 1, hash: "", run: "", language: "ru", handle: "bren", title: "" }));
  const seen = new Set<string>();
  for (const r of everyAsk()) {
    const message = HostMessageSchema.parse(r.event !== undefined ? { type: "event", seq: r.seq, event: r.event } : r.message);
    v = settle(reduce(v, message));
    if (message.type !== "ask") continue;
    const kind = (message.prompt as { kind: string }).kind;
    const dock = chromeOf(v).dock;
    seen.add(kind);
    assert.equal(dock.ask, message.id);
    assert.ok(dock.open, `${kind}: the ask is open`);
    const rows = dock.sheet?.groups.flatMap((g) => g.moves) ?? [];
    const control =
      kind === "reaction" ? dock.sheet?.reaction !== undefined
      : kind === "answer" ? dock.sheet?.question !== undefined
      : kind === "paused" ? dock.form === "paused"
      : kind === "explore" ? dock.form === "input"
      : kind === "card" ? dock.card?.asked === true && dock.card.choices.every((c) => c.n !== undefined)
      : rows.length > 0;
    assert.ok(control, `${kind} ${message.id}: nothing to press`);
    // An ask that is its own sheet stands open; a fight turn and words out of a fight keep theirs behind the chips.
    if (["pick", "surrender", "level_up", "road", "reaction", "answer"].includes(kind)) assert.equal(dock.sheet?.forced, true, `${kind}: the sheet is the ask`);
  }
  assert.deepEqual([...seen].sort(), [...ASK_KINDS].sort());
});

test("a reaction names its one answer under yes, and shows each of several as its own row", () => {
  const at = (options: string[]) => {
    let v = reduce(EMPTY, HostMessageSchema.parse({ type: "hello", wire: 1, hash: "", run: "", language: "en", handle: "bren", title: "" }));
    v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 1, event: { kind: "reaction", summary: "wolf 3 leaves your reach.", options } }));
    v = reduce(v, HostMessageSchema.parse({ type: "ask", id: "a1", prompt: { kind: "reaction" } }));
    return chromeOf(v).dock.sheet?.reaction;
  };
  assert.deepEqual(at(["Opportunity Attack"]), { yes: "yes", no: "no", what: "Opportunity Attack" });
  assert.deepEqual(at(["Opportunity Attack", "Shield Bash"]), { yes: "yes", no: "no", answers: [{ n: 1, label: "Opportunity Attack" }, { n: 2, label: "Shield Bash" }] });
});

test("the chrome state tells a shell the place of the scene and whether a fight is on (CON-26)", () => {
  const green = chromes("green.seat-wire.jsonl");
  // Before the table has said where anyone is, neither is said: a shell turns its page on a change, not on the first word.
  assert.equal(green[0].place, undefined);
  assert.equal(green[0].fight, undefined);
  const places = green.flatMap((c) => (c.place ? [c.place] : []));
  assert.deepEqual(places[0], { name: "Луг в Вендфорде", plate: "the_silent_mill/green.jpg", plan: "the_silent_mill/green" });
  // The road after it is a place whose picture is not drawn: the shell draws a placeholder with this name on it.
  const road = { name: "Дорога к мельнице", plate: "the_silent_mill/mill-road.jpg", plan: "the_silent_mill/mill-road" };
  assert.ok(green.some((c) => c.fight === false && JSON.stringify(c.place) === JSON.stringify(road)), "the road before the fight");
  // The run ends in a fight on that road: the place stands, and the shell turns its page to «Где все».
  assert.deepEqual(green.at(-1)!.place, road);
  assert.equal(green.at(-1)!.fight, true);
  assert.equal(places.filter((p) => p.plate === places[0].plate).every((p) => p.name === "Луг в Вендфорде"), true);
  // A wire recorded before places were told carries none, and its fight is still told.
  const yard = chromes("yard.seat-wire.jsonl");
  assert.ok(yard.every((c) => c.place === undefined));
  assert.ok(yard.some((c) => c.fight === true));
});
