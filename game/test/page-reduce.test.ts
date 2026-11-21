// The page reducer (AGT-142): the window's screen as a pure function of the host's messages.
// Each recorded seat wire is replayed through the reducer and through the terminal seat, fed the
// same calls the web seat makes; after every message both must show the same story, the same list
// and the same people. No engine and no model: the wires are fixtures of loop.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HostMessageSchema, WIRE_HASH, WIRE_VERSION, type HostMessage } from "../src/seat-wire/schema.ts";
import { answered, EMPTY, reduce, settle, type PageView } from "../src/page/reduce.ts";
import type { HumanPrompt, PlayerIntent, TableEvent } from "../src/table/types.ts";
import { InkSeat } from "../src/ui/ink-seat.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

interface Wire {
  seat: string;
  language: "en" | "ru";
  records: Array<{ seq?: number; event?: TableEvent; message?: HostMessage }>;
}

function wire(name: string, language: "en" | "ru"): Wire {
  const records = readFileSync(path.join(FIXTURES, name), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { seat: records[0].seat, language, records };
}

const WIRES = [wire("yard.seat-wire.jsonl", "en"), wire("the-way-back-ru.seat-wire.jsonl", "ru")];

/** The party's handles: whoever speaks or acts in the wire. */
function party(w: Wire): string[] {
  const handles = new Set<string>([w.seat]);
  for (const r of w.records) {
    const e = r.event as { speaker?: string; to?: string } | undefined;
    for (const h of [e?.speaker, e?.to]) if (h && h !== "dm" && !h.includes(":")) handles.add(h);
  }
  return [...handles];
}

/** The keys the human pressed for an answer, so the terminal seat echoes it itself. */
function keys(intent: PlayerIntent, text: string, language: "en" | "ru"): string {
  switch (intent.kind) {
    case "option":
      return String(intent.number);
    case "reaction":
      return intent.take ? (language === "ru" ? "да" : "y") : language === "ru" ? "нет" : "n";
    case "text":
      return intent.text;
    default:
      return text;
  }
}

interface Peek {
  getView(): { lines: Array<{ text: string }>; options?: { lines: string[] }; situation?: unknown };
}

/** Replays a wire through both seats and calls `check` after each record. */
function replay(w: Wire, check: (page: PageView, ink: InkSeat, at: number) => void): PageView {
  const ink = new InkSeat(w.seat, { animate: false, language: w.language });
  const hello: HostMessage = {
    type: "hello",
    wire: WIRE_VERSION,
    hash: WIRE_HASH,
    run: "fixture",
    language: w.language,
    handle: w.seat,
    title: "",
    names: Object.fromEntries(party(w).map((h) => [h, ink.named(h)])),
  };
  let page = reduce(EMPTY, HostMessageSchema.parse(hello));
  w.records.forEach((r, at) => {
    if (r.event) {
      page = reduce(page, HostMessageSchema.parse({ type: "event", seq: r.seq, event: r.event }));
      if (r.event.kind === "said") ink.type(`${keys(r.event.intent, r.event.text, w.language)}\r`);
      else ink.show(r.event);
    } else if (r.message) {
      const m = HostMessageSchema.parse(r.message);
      page = reduce(page, m);
      if (m.type === "ask") void ink.ask(m.prompt as unknown as HumanPrompt);
      else if (m.type === "busy") ink.busy(m.on);
      else if (m.type === "preview") ink.preview(m.text);
      else if (m.type === "unnarrated") ink.unnarrated();
      else if (m.type === "answering") ink.answering(m.on);
    }
    page = settle(page);
    check(page, ink, at);
  });
  ink.stop();
  return page;
}

for (const w of WIRES) {
  test(`page reducer: ${w.records.length} records of ${w.seat}'s ${w.language} wire draw what the terminal seat draws`, () => {
    let checked = 0;
    replay(w, (page, ink, at) => {
      const view = (ink as unknown as Peek).getView();
      assert.deepEqual(
        page.story.map((l) => l.text),
        view.lines.map((l) => l.text),
        `story after record ${at + 1}`,
      );
      assert.deepEqual(page.options?.lines, view.options?.lines, `options after record ${at + 1}`);
      checked++;
    });
    assert.equal(checked, w.records.length);
  });

  test(`page reducer: every roll in ${w.seat}'s ${w.language} wire reaches the story as a token`, () => {
    const page = replay(w, () => {});
    const shown = new Set(page.story.flatMap((l) => l.rolls));
    const rolled = w.records.flatMap((r) => (r.event?.kind === "engine" && r.event.roll && (r.event.event as { kind?: string } | undefined)?.kind === "roll" ? [r.event.roll] : []));
    assert.ok(rolled.length > 0, "the wire has rolls");
    for (const id of rolled) {
      assert.ok(id in page.rolls, `${id} is a token`);
      assert.ok(shown.has(id), `${id} is drawn in a story row`);
      assert.ok(!JSON.stringify(page.rolls[id]).includes("against"), `${id} carries no target`);
    }
  });
}

test("page reducer: the human's own roll takes the stage until the page has shown it", () => {
  const w = WIRES[0];
  const own = w.records.find((r) => r.event?.kind === "engine" && r.event.own && r.event.roll && (r.event.event as { kind?: string } | undefined)?.kind === "roll");
  assert.ok(own?.event?.kind === "engine");
  const view = reduce(reduce(EMPTY, hello(w)), HostMessageSchema.parse({ type: "event", seq: own.seq, event: own.event }));
  assert.equal(view.stage, own.event.roll);
  assert.ok(view.rolls[own.event.roll!].d20.length > 0, "the stage shows the engine's d20 faces");
  assert.equal(settle(view).stage, undefined);
  assert.ok(settle(view).story.some((l) => l.rolls.includes(own.event!.kind === "engine" ? own.event!.roll! : "")));
});

test("page reducer: another character's line waits for the narration that tells it", () => {
  const w = WIRES[0];
  let v = reduce(EMPTY, hello(w));
  const line: TableEvent = {
    kind: "engine",
    text: "ilsa rolls initiative: 1d20 (19) = 20.",
    seq: 5,
    roll: "r5",
    event: { seq: 5, round: 1, scene: "s", visibility: { scope: "public" }, text: "", kind: "roll", roll: { view: "player", id: "r5", kind: "initiative", label: "initiative", roller: "ilsa", dice: [{ source: "d20", dice: "1d20", results: [19], kept: 19 }], total: 20, outcome: "value", advantage: "normal" } },
  } as unknown as TableEvent;
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 1, event: line }));
  assert.equal(v.story.length, 0, "nothing drawn yet");
  assert.equal(v.held.length, 1);
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 2, event: { kind: "narration", speaker: "dm", text: "Ilsa is quick." } }));
  assert.deepEqual(v.story.map((l) => l.text), ["DM: Ilsa is quick."]);
  assert.deepEqual(v.story[0].rolls, ["r5"], "the narration carries the roll as its token");
  // The same line released by an ask shows as it is.
  let u = reduce(reduce(EMPTY, hello(w)), HostMessageSchema.parse({ type: "event", seq: 1, event: line }));
  u = reduce(u, HostMessageSchema.parse({ type: "ask", id: "a1", prompt: { kind: "explore" } }));
  assert.deepEqual(u.story.map((l) => l.text.trim()), ["ilsa rolls initiative: 1d20 (19) = 20. [r5]"]);
  assert.equal(u.held.length, 0);
  assert.ok(u.story.at(-1)!.rolls.includes("r5"));
});

test("page reducer: every kind of ask has a form in the dock", () => {
  const kinds: Array<HumanPrompt["kind"]> = ["combat_turn", "reaction", "explore", "answer", "pick", "paused", "surrender", "card", "level_up", "road"];
  const forms = new Map<string, string>();
  for (const kind of kinds) {
    const v = reduce(reduce(EMPTY, hello(WIRES[0])), HostMessageSchema.parse({ type: "ask", id: `a-${kind}`, prompt: { kind } }));
    assert.notEqual(v.dock.form, "waiting", `${kind} opens a form`);
    assert.equal("ask" in v.dock ? v.dock.ask : undefined, `a-${kind}`);
    forms.set(kind, v.dock.form);
    assert.equal(answered(v).dock.form, "waiting", `answering ${kind} closes it`);
  }
  assert.deepEqual(Object.fromEntries(forms), {
    combat_turn: "moves",
    reaction: "reaction",
    explore: "input",
    answer: "answer",
    pick: "moves",
    paused: "paused",
    surrender: "moves",
    card: "moves",
    level_up: "moves",
    road: "moves",
  });
});

test("page reducer: a host built from another wire is refused, and a replayed event is not drawn twice", () => {
  const built = { wire: WIRE_VERSION, hash: WIRE_HASH };
  const other = reduce(EMPTY, HostMessageSchema.parse({ ...hello(WIRES[0]), hash: "0".repeat(64) }), built);
  assert.ok(other.refused);
  const ok = reduce(EMPTY, hello(WIRES[0]), built);
  assert.equal(ok.refused, undefined);
  const said = { type: "event" as const, seq: 1, event: { kind: "narration", speaker: "dm", text: "Once." } };
  const once = reduce(ok, HostMessageSchema.parse(said));
  assert.equal(reduce(once, HostMessageSchema.parse(said)), once);
});

test("page reducer: its import chain is browser-safe (no node: module)", () => {
  const seen = new Set<string>();
  const walk = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gms)) {
      const [, typeOnly, spec] = m;
      if (typeOnly) continue;
      assert.ok(!spec.startsWith("node:") && !["fs", "path", "os", "child_process"].includes(spec), `${path.relative(FIXTURES, file)} imports ${spec}`);
      if (spec.startsWith(".")) walk(path.resolve(path.dirname(file), spec));
    }
  };
  walk(path.join(FIXTURES, "../../src/page/reduce.ts"));
  assert.ok(seen.size > 3);
});

function hello(w: Wire): HostMessage {
  return HostMessageSchema.parse({ type: "hello", wire: WIRE_VERSION, hash: WIRE_HASH, run: "fixture", language: w.language, handle: w.seat, title: "" });
}
