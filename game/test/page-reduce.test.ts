// The page reducer (AGT-142): the window's screen as a pure function of the host's messages.
// Each recorded seat wire is replayed through the reducer and through the terminal seat, fed the
// same calls the web seat makes; after every message both must hold the same list of moves. The
// story is drawn from the data, not from the terminal's lines (Stas, 2026-11-21): no echo of a
// press, no terminal hint, no roll id, a roll with the line it belongs to, and every roll still
// reachable as a token. No engine and no model: the wires are fixtures of loop.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HostMessageSchema, WIRE_HASH, WIRE_VERSION, type HostMessage } from "../src/seat-wire/schema.ts";
import { chromeOf } from "../src/page/chrome.ts";
import { answered, EMPTY, meOf, placed, reduce, replaced, settle, type PageView } from "../src/page/reduce.ts";
import { NAMES_RU, NARRATION, narratedFight, TALK } from "./page-wires.ts";
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
  test(`page reducer: ${w.records.length} records of ${w.seat}'s ${w.language} wire hold the terminal seat's list, and a story with no terminal in it`, () => {
    let checked = 0;
    replay(w, (page, ink, at) => {
      const view = (ink as unknown as Peek).getView();
      assert.deepEqual(page.options?.lines, view.options?.lines, `options after record ${at + 1}`);
      for (const row of page.story) {
        assert.ok(!row.text.startsWith(">"), `no echo of a press: ${row.text}`);
        assert.ok(!/\[r\d+\]/.test(row.text), `no roll id in the words: ${row.text}`);
        assert.ok(!/\/(options|help|where|sheet)\b/.test(row.text), `no terminal command in the story: ${row.text}`);
        assert.notEqual(row.text, "", "no blank rows: the page spaces its beats");
      }
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
  assert.deepEqual(v.story.map((l) => [l.beat, l.text]), [["narration", "Ilsa is quick."]]);
  assert.deepEqual(v.story[0].rolls, ["r5"], "the narration carries the roll as its token");
  // The same line released by an ask shows as it is.
  let u = reduce(reduce(EMPTY, hello(w)), HostMessageSchema.parse({ type: "event", seq: 1, event: line }));
  u = reduce(u, HostMessageSchema.parse({ type: "ask", id: "a1", prompt: { kind: "explore" } }));
  assert.deepEqual(u.story.map((l) => [l.beat, l.text]), [["fact", "ilsa rolls initiative: 1d20 (19) = 20."]]);
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

test("page reducer: a reconnect keeps the story and drops what only stood at that moment; another run starts clean", () => {
  const w = WIRES[0];
  let v = reduce(EMPTY, hello(w));
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 1, event: { kind: "narration", speaker: "dm", text: "Once." } }));
  v = reduce(v, HostMessageSchema.parse({ type: "busy", on: "Ilsa" }));
  v = reduce(v, HostMessageSchema.parse({ type: "answering", on: true }));
  v = reduce(v, HostMessageSchema.parse({ type: "ask", id: "a1", prompt: { kind: "explore" } }));
  const again = reduce(v, hello(w));
  assert.deepEqual(again.story, v.story);
  assert.equal(again.seq, 1);
  assert.equal(again.busy, undefined);
  assert.equal(again.ask, undefined);
  assert.equal(again.answering, false);
  assert.equal(again.dock.form, "waiting");
  const other = reduce(v, HostMessageSchema.parse({ ...hello(w), run: "another" }));
  assert.equal(other.story.length, 0);
  assert.equal(other.seq, 0);
});

test("page reducer: a refused host draws nothing, and a matching hello after it is accepted", () => {
  const built = { wire: WIRE_VERSION, hash: WIRE_HASH };
  let v = reduce(EMPTY, HostMessageSchema.parse({ ...hello(WIRES[0]), hash: "0".repeat(64) }), built);
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 1, event: { kind: "narration", speaker: "dm", text: "Once." } }));
  assert.equal(v.story.length, 0);
  v = reduce(v, hello(WIRES[0]), built);
  assert.equal(v.refused, undefined);
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 1, event: { kind: "narration", speaker: "dm", text: "Once." } }));
  assert.equal(v.story.length, 1);
  assert.equal(reduce(EMPTY, HostMessageSchema.parse({ type: "event", seq: 1, event: { kind: "status", text: "x" } })), EMPTY, "nothing before hello");
});

test("page reducer: the dead of the first frame with people were told before; an empty first frame does not count", () => {
  const frame = (seq: number, people: unknown[]) => HostMessageSchema.parse({ type: "event", seq, event: { kind: "situation", situation: { mode: "explore", people } } });
  const dead = { id: "npc:old_tam", name: "Old Tam", state: "dead" };
  let v = reduce(EMPTY, hello(WIRES[0]));
  v = reduce(v, frame(1, []));
  v = reduce(v, HostMessageSchema.parse({ type: "unnarrated" }));
  v = reduce(v, frame(2, [dead]));
  v = reduce(v, HostMessageSchema.parse({ type: "unnarrated" }));
  assert.deepEqual(v.told, ["npc:old_tam"]);
  assert.deepEqual(v.untold, []);
});

test("page reducer: a window whose seat another window took offers no move, says where the game is and keeps its story", () => {
  let v = reduce(EMPTY, hello(WIRES[0]));
  // The recorded yard up to its first ask: a story on the page and a turn open.
  for (const r of WIRES[0].records) {
    v = reduce(v, HostMessageSchema.parse(r.event ? { type: "event", seq: r.seq, event: r.event } : r.message));
    if (v.ask) break;
  }
  assert.ok(v.ask && v.story.length > 0);
  const gone = replaced(v, "The game is open on another device or in another tab.");
  assert.equal(gone.ask, undefined);
  assert.deepEqual(gone.dock, { form: "waiting", on: "The game is open on another device or in another tab." });
  assert.deepEqual(gone.story, v.story);
  assert.equal(gone.seq, v.seq);
});

test("page reducer: an answer the host refuses reopens its ask; one it takes does not", () => {
  let v = reduce(EMPTY, hello(WIRES[0]));
  v = reduce(v, HostMessageSchema.parse({ type: "ask", id: "a1", prompt: { kind: "combat_turn" } }));
  const sent = answered(v);
  assert.equal(sent.dock.form, "waiting");
  const back = reduce(sent, HostMessageSchema.parse({ type: "refused", why: "not a seat-wire message" }));
  assert.equal(back.ask?.id, "a1");
  assert.equal(back.dock.form, "moves");
  const taken = reduce(sent, HostMessageSchema.parse({ type: "event", seq: 1, event: { kind: "said", intent: { kind: "option", number: 2 }, text: "2. Dodge" } }));
  assert.equal(reduce(taken, HostMessageSchema.parse({ type: "refused", why: "no open ask a1" })).ask, undefined);
});

test("page reducer: a road card stays on the dock while the table says its word on it, each choice with who said it, then the decision", () => {
  const w = WIRES[1];
  const at = (seq: number) => w.records.findIndex((r) => r.seq === seq);
  const seen: Record<number, PageView> = {};
  replay(w, (page, _ink, i) => {
    for (const seq of [17, 18, 22, 23]) if (i === at(seq)) seen[seq] = page;
  });
  // The card arrives with its list: three choices, nobody has said anything yet.
  assert.equal(seen[17].card?.card.choices.length, 3);
  assert.deepEqual(seen[17].card?.votes, []);
  assert.equal(seen[17].card?.decided, undefined);
  // The human answered: the card stays on the dock while the others speak.
  assert.ok(seen[18].card, "the card stays after the human's word");
  assert.deepEqual(
    seen[22].card?.votes.map((v) => [v.name, v.choice]),
    [["Брен", "cloaks"], ["Торва", "cloaks"], ["Марен", "cloaks"], ["Ильза", "cloaks"]],
  );
  assert.equal(seen[23].card?.decided, "cloaks");
  // A later round of advice on the same card (after an own move fell) is the person's word now: it replaces the earlier one.
  const again = reduce(seen[22], HostMessageSchema.parse({ type: "event", seq: 9001, event: { kind: "engine", text: "Торва советует: «Встать под ивами и переждать».", seq: 9001, event: { seq: 9001, scene: "twb_road", visibility: { scope: "public" }, text: "torva says: willows.", kind: "card_advice", actor: "torva", choice: "willows" }, names: { torva: "Торва" } } }));
  assert.deepEqual(
    again.card?.votes.map((v) => [v.name, v.choice]),
    [["Брен", "cloaks"], ["Марен", "cloaks"], ["Ильза", "cloaks"], ["Торва", "willows"]],
  );
});

test("page reducer: the card leaves the dock when the human is asked something else", () => {
  const w = WIRES[1];
  let lastCard = -1;
  let cleared = false;
  replay(w, (page, _ink, i) => {
    if (page.card) lastCard = i;
    else if (lastCard >= 0 && page.ask && page.ask.prompt.kind !== "card") cleared = true;
  });
  assert.ok(lastCard >= 0 && cleared);
});

test("page reducer: a press is told by the engine's line, not echoed; the human's own words are a row of their own", () => {
  let v = reduce(EMPTY, hello(WIRES[1]));
  v = reduce(v, HostMessageSchema.parse({ type: "ask", id: "a1", prompt: { kind: "explore" } }));
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 1, event: { kind: "said", intent: { kind: "option", number: 3 }, text: "3. Идти дальше с обозом" } }));
  assert.equal(v.story.length, 0, "a press draws nothing");
  v = reduce(v, HostMessageSchema.parse({ type: "ask", id: "a2", prompt: { kind: "explore" } }));
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 2, event: { kind: "said", intent: { kind: "command", name: "sheet" }, text: "/sheet" } }));
  assert.equal(v.story.length, 0, "a command draws nothing: its answer does");
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 3, event: { kind: "said", intent: { kind: "text", text: "Осматриваюсь." }, text: "Осматриваюсь." } }));
  assert.deepEqual(v.story.map((l) => [l.beat, l.person, l.text]), [["words", "bren", "Осматриваюсь."]]);
  assert.equal(v.fresh, 0, "what came before the answer is read");
});

test("page reducer: a roll joins the action it belongs to, and a fight's turn-order rolls join its start", () => {
  const page = replay(WIRES[1], () => {});
  const start = page.story.find((l) => l.event === "combat_started");
  assert.ok(start, "the fight's start is a row");
  assert.equal(start.rolls.length, 6, "six turn-order rolls on it");
  assert.ok(start.rolls.every((id) => page.rolls[id].kind === "initiative"));
  assert.ok(!page.story.some((l) => l.event === "roll" && page.rolls[l.rolls[0]]?.kind === "initiative"), "no turn-order roll has a row of its own");
  const attack = page.story.find((l) => l.event === "action" && l.text.startsWith("Гоблин 2: удар саблей"));
  assert.ok(attack);
  assert.deepEqual(attack.rolls.map((id) => page.rolls[id].kind), ["attack", "damage"], "the attack and its damage sit on the action");
  assert.ok(!page.story.some((l) => l.event === "turn_start" || l.event === "turn_end" || l.event === "card_advice"), "the turn pill and the card hold these");
});

test("page reducer: a live Narrator's round carries its rolls, each in the sentence that names its roller", () => {
  const records = narratedFight().trim().split("\n").map((l) => JSON.parse(l) as { seq?: number; event?: TableEvent; message?: HostMessage });
  let v = reduce(EMPTY, HostMessageSchema.parse({ ...hello(WIRES[1]), names: NAMES_RU }));
  for (const r of records) v = settle(reduce(v, HostMessageSchema.parse(r.event ? { type: "event", seq: r.seq, event: r.event } : r.message)));
  const told = v.story.find((l) => l.text === NARRATION);
  assert.ok(told, "the narration is a row");
  assert.equal(told.beat, "narration");
  assert.deepEqual(v.story.at(-1) && [v.story.at(-1)!.beat, v.story.at(-1)!.who, v.story.at(-1)!.to, v.story.at(-1)!.text], ["speech", "Ильза", "Брен", TALK]);
  const parts = placed(told.text, told.rolls, v.rolls);
  assert.equal(parts.length, 4);
  const by = (i: number) => [...new Set(parts[i].rolls.map((id) => (v.rolls[id].kind === "initiative" ? "order" : v.rolls[id].by)))];
  assert.deepEqual(by(0), ["order", "ilsa"]);
  assert.deepEqual(by(1), ["goblin_warrior_1"]);
  assert.deepEqual(by(2), ["goblin_warrior_2"]);
  assert.deepEqual(by(3), ["torva", "maren"]);
  assert.deepEqual(parts.flatMap((p) => p.rolls).sort(), [...told.rolls].sort(), "every roll it tells has a place");
  assert.equal(v.dock.form, "moves");
});

test("page reducer: a sheet goes to «Лист», not over the story, and is old once the character changes", () => {
  const me = (hp: number) => ({ kind: "situation", situation: { mode: "explore", next: [], me: { handle: "bren", name: "Брен", hp, hp_max: 20, temp_hp: 0, conditions: [], life_state: "conscious", effects: [] }, creatures: [], down: [] } });
  let v = reduce(EMPTY, hello(WIRES[1]));
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 1, event: me(20) }));
  v = reduce(v, HostMessageSchema.parse({ type: "ask", id: "a1", prompt: { kind: "explore" } }));
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 2, event: { kind: "info", title: "Где вы", text: "У фургона." } }));
  assert.equal(v.overlay?.title, "Где вы");
  // A native shell asks the seat for a sheet only while this holds (CON-22): not on every touch of «Лист».
  assert.equal(chromeOf(v).sheetStale, true, "no sheet yet");
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 3, event: { kind: "info", title: "Лист персонажа", text: "Брен: человек, воин, уровень 2\nЗдоровье 20 из 20" } }));
  assert.equal(v.overlay, undefined, "the sheet is not an overlay, and takes the place of the last one");
  assert.equal(v.sheet?.n, 1);
  assert.equal(v.sheet?.me, meOf(v), "fresh while the character is as it was");
  assert.equal(chromeOf(v).sheetStale, false);
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 4, event: me(12) }));
  assert.notEqual(v.sheet?.me, meOf(v), "old once the character changed");
  assert.equal(chromeOf(v).sheetStale, true);
  assert.equal(v.story.length, 0, "nothing in the story");
  // The purse is on the sheet and not on the panel's line: a sheet is old once anything happened.
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 5, event: { kind: "info", title: "Лист персонажа", text: "Брен: человек, воин, уровень 2\nЗдоровье 12 из 20" } }));
  assert.equal(chromeOf(v).sheetStale, false, "fresh again");
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 6, event: me(12) }));
  assert.equal(chromeOf(v).sheetStale, false, "the same frame sent again changes nothing");
  v = reduce(v, HostMessageSchema.parse({ type: "event", seq: 7, event: { kind: "narration", speaker: "dm", text: "Торговец отсчитывает жалованье." } }));
  assert.equal(chromeOf(v).sheetStale, true, "old once a line was told");
});

test("a new place opens the story with its picture, above the narration that told the place, and the same place opens once (CON-27)", () => {
  const story = (name: string) => {
    const records = readFileSync(path.join(FIXTURES, name), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { seat: string; seq?: number; event?: TableEvent; message?: HostMessage });
    let v = reduce(EMPTY, HostMessageSchema.parse({ type: "hello", wire: 1, hash: "", run: "", language: "ru", handle: records[0].seat, title: "" }));
    for (const r of records) v = settle(reduce(v, HostMessageSchema.parse(r.event ? { type: "event", seq: r.seq, event: r.event } : r.message)));
    return v.story;
  };
  const green = story("green.seat-wire.jsonl");
  const plates = green.filter((line) => line.beat === "plate");
  // The green, then the road: the fight on the road is the same place and opens nothing.
  assert.deepEqual(plates.map((line) => [line.text, line.title]), [["Луг в Вендфорде", "the_silent_mill/green.jpg"], ["Дорога к мельнице", "the_silent_mill/mill-road.jpg"]]);
  // The seat names the place after its opening is told: the picture stands over those words, and the run opens with it.
  assert.equal(green[0].beat, "plate");
  for (const plate of plates) assert.equal(green[green.indexOf(plate) + 1].beat, "narration");
  // What the human said on the green stays under the green's words, over the road's picture.
  assert.equal(green[green.indexOf(plates[1]) - 1].beat, "words");
  assert.equal(new Set(green.map((line) => line.id)).size, green.length);
  // A wire recorded before places were told opens with none.
  assert.equal(story("yard.seat-wire.jsonl").some((line) => line.beat === "plate"), false);
});

test("a place reached by an answer that leaves no row opens under the words of the place before it, not over them (CON-27)", () => {
  // The green wire with the human's words replaced by a pick by number: nothing then lies between the green's narration and the road's.
  const records = readFileSync(path.join(FIXTURES, "green.seat-wire.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { seat: string; seq?: number; event?: TableEvent; message?: HostMessage });
  let v = reduce(EMPTY, HostMessageSchema.parse({ type: "hello", wire: 1, hash: "", run: "", language: "ru", handle: records[0].seat, title: "" }));
  for (const r of records) {
    const event = r.event?.kind === "said" ? ({ kind: "said", intent: { kind: "option", number: 1 }, text: "1" } as TableEvent) : r.event;
    v = settle(reduce(v, HostMessageSchema.parse(event ? { type: "event", seq: r.seq, event } : r.message)));
  }
  assert.equal(v.story.some((line) => line.beat === "words"), false);
  const beats = v.story.map((line) => (line.beat === "plate" ? line.title : line.beat));
  assert.deepEqual(beats.slice(0, 4), ["the_silent_mill/green.jpg", "narration", "the_silent_mill/mill-road.jpg", "narration"]);
});
