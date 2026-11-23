// The seat wire (AGT-141, Glass Table design §4 and §9, exit rows 2 and 3): the scripted scene played
// over the socket equals the in-process run, a resume from any `seq` replays what follows, a dropped
// socket loses no event and gets its open ask again, and `seat-wire.jsonl` carries nothing a player
// view never does. The client here is a scripted seat at the far end of a real WebSocket.
import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import WebSocket from "ws";
import { REPO } from "../src/engine.ts";
import { audit } from "../src/play/run.ts";
import { CLOSE_REPLACED, HostMessageSchema, WIRE_HASH, type HostMessage } from "../src/seat-wire/schema.ts";
import { SEAT_WIRE_JSONL, WebSeat } from "../src/seat-wire/web-seat.ts";
import { readCampaign } from "../src/pack/campaign.ts";
import { TableLoop } from "../src/table/loop.ts";
import { caravanSeat, ScriptedDm, ScriptedPlayer, ScriptedSeat, yardDm } from "../src/table/scripted.ts";
import type { PlayerIntent, TableEvent } from "../src/table/types.ts";
import { TEST_PACK, testTable } from "./helpers.ts";

const TYPED: PlayerIntent[] = [
  { kind: "command", name: "sheet" },
  { kind: "command", name: "where" },
];
const policy = (prompt: Parameters<typeof ScriptedSeat.fight>[0], s: ScriptedSeat) => (prompt.kind === "combat_turn" || prompt.kind === "pick" ? ScriptedSeat.fight(prompt, s) : ScriptedSeat.pass(prompt, s));

/** A window at the far end of the socket: every host message, and a scripted seat that answers its asks. */
class Window {
  readonly messages: HostMessage[] = [];
  readonly seat: ScriptedSeat;
  constructor(seat = new ScriptedSeat("bren", [...TYPED], policy)) {
    this.seat = seat;
  }
  private ws: WebSocket | undefined;
  /** Close the socket at this ask (the n-th, from 1) instead of answering it: a dropped connection. */
  dropAt?: number;
  private asked = 0;

  connect(port: number, token: string, from = 0, origin?: string): Promise<void> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/seat?token=${token}`, origin ? { origin } : {});
    this.ws = ws;
    ws.on("message", (data) => void this.received(HostMessageSchema.parse(JSON.parse(String(data)))));
    return new Promise((resolve, reject) => {
      ws.once("open", () => {
        ws.send(JSON.stringify({ type: "resume", seq: from }));
        resolve();
      });
      ws.once("error", reject);
      ws.once("unexpected-response", () => reject(new Error("refused")));
    });
  }

  private async received(m: HostMessage): Promise<void> {
    this.messages.push(m);
    if (m.type === "event") this.seat.show(m.event as unknown as TableEvent);
    if (m.type === "ask") {
      this.asked += 1;
      if (this.asked === this.dropAt) {
        this.dropAt = undefined;
        this.ws?.terminate();
        return;
      }
      const intent = await this.seat.ask(m.prompt as never);
      this.ws?.send(JSON.stringify({ type: "intent", id: m.id, intent }));
    }
  }

  close(): Promise<void> {
    const ws = this.ws;
    if (!ws || ws.readyState === ws.CLOSED) return Promise.resolve();
    return new Promise((resolve) => {
      ws.once("close", () => resolve());
      ws.close();
    });
  }

  events(): Array<{ seq: number; event: TableEvent }> {
    return this.messages.flatMap((m) => (m.type === "event" ? [{ seq: m.seq, event: m.event as unknown as TableEvent }] : []));
  }
}

/** The yard fight with the human on a scripted seat in process. */
async function inProcess(): Promise<TableEvent[]> {
  const seat = new ScriptedSeat("bren", [...TYPED], policy);
  const t = await testTable({ seed: 23, seat });
  try {
    await new TableLoop({ table: t.table, dm: yardDm(), players: ["torva", "maren", "ilsa"].map((h) => new ScriptedPlayer(h)), maxSteps: 500, situation: true }).run("m5_s3_yard");
    return seat.shown;
  } finally {
    t.close();
  }
}

/** The same fight with the human's seat a WebSeat, and the window's scripted seat answering. */
async function overSocket(window: Window, between?: (seat: WebSeat, port: number) => Promise<void>) {
  const t = await testTable<WebSeat>({ seed: 23, seatFor: (runDir) => new WebSeat("bren", { runDir, run: path.basename(runDir) }) });
  const seat = t.seat;
  const { port, token } = await seat.listen();
  await window.connect(port, token);
  const loop = new TableLoop({ table: t.table, dm: yardDm(), players: ["torva", "maren", "ilsa"].map((h) => new ScriptedPlayer(h)), maxSteps: 500, situation: true });
  const ran = loop.run("m5_s3_yard");
  if (between) await between(seat, port);
  await ran;
  return { seat, port, runDir: t.runDir, wire: readFileSync(path.join(t.runDir, SEAT_WIRE_JSONL), "utf8"), t };
}

test("the scripted scene over the socket equals the in-process run, and the wire file holds every event in order (exit row 2)", async () => {
  const expected = await inProcess();
  const window = new Window();
  const { seat, wire, t } = await overSocket(window);
  try {
    assert.deepEqual(window.messages[0], { type: "hello", wire: 1, hash: WIRE_HASH, run: window.messages[0]!.type === "hello" ? window.messages[0].run : "", language: "en", handle: "bren", title: "" });
    const got = window.events();
    assert.deepEqual(got.map((e) => e.seq), got.map((_, i) => i + 1), "numbered from 1 with no gap");
    assert.deepEqual(got.map((e) => e.event), expected, "the same events as the in-process seat");
    const sent = window.messages.filter((m) => m.type !== "hello" && m.type !== "refused").map((m) => (m.type === "event" ? { seq: m.seq, seat: "bren", event: m.event } : { seat: "bren", message: m }));
    assert.deepEqual(wire.trim().split("\n").map((l) => JSON.parse(l)), sent, "seat-wire.jsonl holds everything that was sent, in order");
    assert.ok(sent.some((l) => "message" in l && l.message?.type === "ask"), "the asks among it");
    assert.deepEqual(window.seat.prompts.length > 0, true);
  } finally {
    await window.close();
    await seat.close();
    t.close();
  }
});

test("a resume from every seq replays exactly what follows it, and the open ask again (exit row 2)", async () => {
  const window = new Window();
  const { seat, port, t } = await overSocket(window);
  try {
    await window.close();
    const all = window.events();
    for (let from = 0; from <= all.length; from++) {
      const late = new Window();
      await late.connect(port, seat.token, from);
      await waitFor(() => late.events().length === all.length - from || from === all.length);
      assert.deepEqual(late.events(), all.slice(from), `resume from ${from}`);
      await late.close();
      await waitFor(() => (seat as unknown as { client?: unknown }).client === undefined);
    }
  } finally {
    await seat.close();
    t.close();
  }
});

test("a socket dropped at an open ask loses no event: the next connection gets the ask again by its id and the run plays on (exit row 2)", async () => {
  const expected = await inProcess();
  const window = new Window();
  window.dropAt = 3;
  let seatRef: WebSeat | undefined;
  const { seat, t } = await overSocket(window, async (seat, port) => {
    seatRef = seat;
    await waitFor(() => (seat as unknown as { client?: unknown }).client === undefined && window.messages.filter((m) => m.type === "ask").length >= 3);
    const dropped = window.messages.filter((m) => m.type === "ask").at(-1)!;
    const seen = window.events().at(-1)!.seq;
    // The page keeps its seat's state; it reconnects and asks for what came after the last event it drew.
    const again = window as unknown as { messages: HostMessage[] };
    const before = again.messages.length;
    await window.connect(port, seat.token, seen);
    await waitFor(() => again.messages.slice(before).some((m) => m.type === "ask"));
    const reasked = again.messages.slice(before).find((m) => m.type === "ask")!;
    assert.deepEqual(reasked, dropped, "the same ask, by the same id");
  });
  try {
    assert.ok(seatRef);
    assert.deepEqual(window.events().map((e) => e.event), expected, "every event once, in order, across the drop");
  } finally {
    await window.close();
    await seat.close();
    t.close();
  }
});

test("seat-wire.jsonl carries no DM-view field or value: the audit's seat-wire scan passes on it (exit row 3)", async () => {
  const window = new Window();
  const { seat, runDir, wire, t } = await overSocket(window);
  try {
    assert.doesNotMatch(wire, /"(against|dc_source|advantage_sources|modifiers|dc|purse_cp|zone)":/);
    const result = audit(TEST_PACK, runDir);
    assert.ok(result.passed, result.output);
    assert.match(result.output, /^Seat-wire scan: \d+ lines to bren, \d+ echoes of the human's input skipped, 0 leaks\.$/m);
  } finally {
    await window.close();
    await seat.close();
    t.close();
  }
});

test("the seat refuses a wrong token and a foreign origin, a new window replaces the old, and a pause with no ask open waits for the loop", async () => {
  const seat = new WebSeat("bren", { runDir: (await import("node:os")).tmpdir(), run: "t" });
  const { port, token } = await seat.listen();
  try {
    await assert.rejects(new Window().connect(port, "nope"));
    await assert.rejects(new Window().connect(port, token, 0, "https://example.com"));
    const first = new Window();
    await first.connect(port, token, 0, "tauri://localhost");
    const firstWs = (first as unknown as { ws: WebSocket }).ws;
    // A laptop that slept leaves its socket half open: the reloaded page must still get in.
    const firstClosed = once(firstWs, "close");
    const window = new Window();
    await window.connect(port, token);
    // The window that lost the seat is told so by its close code, so it does not come back for it.
    const [code] = (await firstClosed) as [number];
    assert.equal(code, CLOSE_REPLACED);
    await waitFor(() => window.messages[0]?.type === "hello");
    const ws = (window as unknown as { ws: WebSocket }).ws;
    ws.send("not json");
    ws.send(JSON.stringify({ type: "intent", id: "a9", intent: { kind: "text", text: "hi", extra: 1 } }));
    ws.send(JSON.stringify({ type: "command", name: "pause" }));
    await waitFor(() => window.messages.filter((m) => m.type === "refused").length === 2);
    await waitFor(() => seat.takeCommands().length === 1 || false, 2000).catch(() => assert.fail("the pause reaches the loop's next look"));
    await window.close();
  } finally {
    await seat.close();
  }
});

test("a seat open to the home network lets in a client with the token and no origin, and no page from any origin", async () => {
  const seat = new WebSeat("bren", { runDir: (await import("node:os")).tmpdir(), run: "t", host: "0.0.0.0", origins: [] });
  const { port, token } = await seat.listen();
  try {
    await assert.rejects(new Window().connect(port, "nope"));
    await assert.rejects(new Window().connect(port, token, 0, "tauri://localhost"));
    await assert.rejects(new Window().connect(port, token, 0, "http://127.0.0.1"));
    const phone = new Window();
    await phone.connect(port, token);
    await waitFor(() => phone.messages[0]?.type === "hello");
    await phone.close();
  } finally {
    await seat.close();
  }
});

test("a frame over the limit drops the window, not the table; a resume gets back what the table was doing; a quit with no ask open answers the next ask", async () => {
  const seat = new WebSeat("bren", { runDir: (await import("node:os")).tmpdir(), run: "t" });
  const { port, token } = await seat.listen();
  try {
    const big = new Window();
    await big.connect(port, token);
    const bigWs = (big as unknown as { ws: WebSocket }).ws;
    bigWs.send(JSON.stringify({ type: "intent", id: "a1", intent: { kind: "text", text: "x".repeat(70 * 1024) } }));
    await waitFor(() => bigWs.readyState === bigWs.CLOSED);
    seat.busy("Torva");
    seat.answering(true);
    const window = new Window();
    await window.connect(port, token);
    await waitFor(() => window.messages.some((m) => m.type === "answering"));
    assert.deepEqual(window.messages.slice(1), [{ type: "busy", on: "Torva" }, { type: "answering", on: true }], "the state the page lost on reload");
    (window as unknown as { ws: WebSocket }).ws.send(JSON.stringify({ type: "command", name: "quit" }));
    await waitFor(() => (seat as unknown as { quitting: boolean }).quitting);
    assert.deepEqual(await seat.ask({ kind: "explore" }), { kind: "command", name: "quit" }, "the terminal's Ctrl+C between asks");
    await window.close();
  } finally {
    await seat.close();
  }
});

test("the host stops the table (Ctrl+C, the time limit): the open ask ends as quit, the window is told why, and a later ask answers quit at once", async () => {
  const seat = new WebSeat("bren", { runDir: (await import("node:os")).tmpdir(), run: "t", language: "ru" });
  await seat.listen();
  try {
    // No window answers: the person is away from it.
    const asked = seat.ask({ kind: "explore" });
    seat.stopAsking("её остановили на компьютере");
    assert.deepEqual(await asked, { kind: "command", name: "quit" }, "nobody need answer it for the table to stop");
    assert.deepEqual(await seat.ask({ kind: "explore" }), { kind: "command", name: "quit" });
    const lines = readFileSync(path.join((await import("node:os")).tmpdir(), SEAT_WIRE_JSONL), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { message?: HostMessage });
    assert.ok(lines.some((l) => l.message?.type === "busy" && l.message.on === "Игра останавливается: её остановили на компьютере."), "the window's line says why");
  } finally {
    await seat.close();
  }
});

/** The page's fixtures (design §9): checked against a fresh run, and rewritten by `RECORD_FIXTURES=1`. */
function sameAsFixture(name: string, wire: string): void {
  const file = path.join(REPO, "game/test/fixtures", `${name}.seat-wire.jsonl`);
  if (process.env.RECORD_FIXTURES || !existsSync(file)) writeFileSync(file, wire);
  assert.equal(wire, readFileSync(file, "utf8"), `${name}.seat-wire.jsonl changed; RECORD_FIXTURES=1 rewrites it`);
}

test("the page's fixtures: the yard fight, and a stretch of The Way Back at a Russian seat on a saved party, with a card's votes and a person who remembers (design §9)", async () => {
  const yard = new Window();
  const fight = await overSocket(yard);
  try {
    sameAsFixture("yard", fight.wire);
  } finally {
    await yard.close();
    await fight.seat.close();
    fight.t.close();
  }
  // Fair in Wend first, on a scripted seat, for the saved party The Way Back goes on with.
  const party = ["bren", "torva", "maren", "ilsa"];
  const first = await testTable({ seed: 3, pack: path.join(REPO, "scenarios/fair_in_wend"), human: "bren", players: party.slice(1), seat: new ScriptedSeat("bren", [], caravanSeat()) });
  let roster;
  try {
    const campaign = readCampaign(path.join(REPO, "scenarios/fair_in_wend"))!;
    await new TableLoop({ table: first.table, dm: new ScriptedDm({}), players: party.slice(1).map((h) => new ScriptedPlayer(h)), maxSteps: 400, campaign: { party, keepsParty: true, startDay: campaign.startDay, ...(campaign.dayLimit !== undefined ? { dayLimit: campaign.dayLimit } : {}) } }).run(campaign.startScene);
    const saved = await first.engine.request("dm", { cmd: "save_roster" });
    assert.ok(saved.result?.cmd === "save_roster");
    roster = saved.result.roster;
  } finally {
    first.close();
  }
  const pack = path.join(REPO, "scenarios/the_way_back");
  const t = await testTable<WebSeat>({ seed: 3, pack, human: "bren", players: party.slice(1), roster, language: "ru", seatFor: (runDir) => new WebSeat("bren", { runDir, run: "the-way-back", language: "ru" }) });
  const window = new Window(new ScriptedSeat("bren", [{ kind: "command", name: "sheet" }], caravanSeat()));
  try {
    const { port, token } = await t.seat.listen();
    await window.connect(port, token);
    const campaign = readCampaign(pack)!;
    const dm = new ScriptedDm({ card: async (tools) => void (await tools.narrate("Люди с карточки выходят вперёд.")) });
    await new TableLoop({ table: t.table, dm, players: party.slice(1).map((h) => new ScriptedPlayer(h)), maxSteps: 120, language: "ru", situation: true, campaign: { party, keepsParty: true, startDay: campaign.startDay } }).run(campaign.startScene);
    const wire = readFileSync(path.join(t.runDir, SEAT_WIRE_JSONL), "utf8");
    sameAsFixture("the-way-back-ru", wire);
    const events = wire.trim().split("\n").flatMap((l) => { const line = JSON.parse(l) as { event?: TableEvent }; return line.event ? [line.event] : []; });
    assert.ok(events.some((e) => (e.kind === "options" || e.kind === "info") && e.card), "a road card as data");
    assert.ok(events.some((e) => e.kind === "engine" && e.event?.kind === "card_advice"), "a vote on it");
    assert.ok(events.some((e) => e.kind === "situation" && e.situation?.people?.some((p) => p.remembers.length > 0)), "a person who remembers the party");
  } finally {
    await window.close();
    await t.seat.close();
    t.close();
  }
});

async function waitFor(ok: () => boolean, ms = 10_000): Promise<void> {
  const until = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > until) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}
