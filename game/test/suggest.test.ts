// Response suggestions for the human (TASKS.md AGT-49; engine/m6/input-line-design.md §7): the
// suggester's answer as rows, the loop that asks for them out of combat only and counts what was
// sent, what the suggester reads (Rule 3), and the terminal picker's keys.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Suggester, suggestionRows, suggestPrompt } from "../src/agents/suggest.ts";
import type { SessionConfig } from "../src/agents/sdk-session.ts";
import { TurnCancelled } from "../src/errors.ts";
import { TableLoop } from "../src/table/loop.ts";
import { ScriptedDm } from "../src/table/scripted.ts";
import type { HumanPrompt, PlayerIntent, SuggestUpdate, TableEvent } from "../src/table/types.ts";
import { InkSeat, suggestionRows as pickerRows } from "../src/ui/ink-seat.ts";
import { StandIn } from "./stand-in.ts";
import { testTable } from "./helpers.ts";

const CARD = "# Bren\n\n## Goal\nKeep the party alive.\n\n## Voice\nShort words.";

test("the suggester's answer reads as three rows, without numbers or bullets", () => {
  assert.deepEqual(suggestionRows('1. Look for tracks\n2) "Who goes there?"\n- Wait by the gate'), ["Look for tracks", '"Who goes there?"', "Wait by the gate"]);
  assert.deepEqual(suggestionRows("\n\n"), []);
  // Exactly three usable rows, or none: never two, four, an overlong row or a slash command.
  assert.deepEqual(suggestionRows("Look for tracks\nWait by the gate"), []);
  assert.deepEqual(suggestionRows("Look for tracks\nWait\nAsk\nA fourth"), []);
  assert.deepEqual(suggestionRows(`Look for tracks\nWait\n${"x".repeat(61)}`), []);
  assert.deepEqual(suggestionRows("Look for tracks\n/quit\nWait"), []);
  const prompt = suggestPrompt("bren", CARD, "ru");
  assert.match(prompt, /Keep the party alive\./);
  assert.match(prompt, /never name a number from the rules/);
  assert.match(prompt, /in Russian/);
});

test("a slow or cancelled call shows nothing, and the next call opens a fresh session", async () => {
  const opened: StandIn<string>[] = [];
  let fail = true;
  const suggester = new Suggester({
    handle: "bren",
    card: CARD,
    open: (config: SessionConfig) => {
      const session = new StandIn<string>(config, async () => {
        if (fail) throw new TurnCancelled("the human typed first");
        return "Look around\nAsk Maren\nWait";
      });
      opened.push(session);
      return session;
    },
  });
  assert.equal(await suggester.suggest("x"), undefined);
  assert.ok(opened[0].closed);
  fail = false;
  assert.deepEqual(await suggester.suggest("x"), ["Look around", "Ask Maren", "Wait"]);
  assert.equal(opened.length, 2);
  assert.deepEqual(opened[1].config.tools, [], "the suggester has no tools: it never acts (Rule 4)");
  assert.equal(opened[1].config.choice.model, "claude-haiku-5-5");
});

/** A scripted seat that shows suggestions: it waits for them out of combat, then sends one. */
class SuggestedSeat {
  readonly handle = "bren";
  readonly shown: TableEvent[] = [];
  readonly updates: SuggestUpdate["kind"][] = [];
  readonly asked: HumanPrompt["kind"][] = [];
  private rows: ((rows: string[] | undefined) => void) | undefined;
  private sent = 0;
  show(event: TableEvent): void {
    this.shown.push(event);
  }
  suggest(update: SuggestUpdate): void {
    this.updates.push(update.kind);
    if (update.kind === "rows") this.rows?.(update.rows);
    if (update.kind === "none") this.rows?.(undefined);
  }
  async ask(prompt: HumanPrompt): Promise<PlayerIntent> {
    this.asked.push(prompt.kind);
    if (prompt.kind !== "explore") return { kind: "command", name: "quit" };
    this.sent += 1;
    if (this.sent === 1) return { kind: "command", name: "sheet" };
    if (this.sent > 3) return { kind: "command", name: "quit" };
    const rows = await new Promise<string[] | undefined>((resolve) => (this.rows = resolve));
    this.rows = undefined;
    assert.ok(rows, "the suggestions came");
    // The first time it sends the second row as offered, the next time its own line.
    return this.sent === 2 ? { kind: "text", text: rows[1], suggestion: { n: 2, edited: false } } : { kind: "text", text: "I keep my own counsel." };
  }
}

test("out of combat the loop asks the suggester once per prompt, from the human's own view, and counts the lines sent (Rule 3, S4)", async () => {
  const seat = new SuggestedSeat();
  const t = await testTable({ seed: 1, human: "bren", players: [], seat: seat as never });
  const briefings: string[] = [];
  const suggester = new Suggester({
    handle: "bren",
    card: CARD,
    open: (config) =>
      new StandIn<string>(config, async (_wake, _call, message) => {
        briefings.push(message);
        return "Look for tracks\n\"Anyone here?\"\nWait by the well";
      }),
  });
  try {
    const loop = new TableLoop({ table: t.table, dm: new ScriptedDm({}), players: [], maxSteps: 20, suggester });
    const report = await loop.run("vale_town");
    assert.equal(report.ended, "the human quit");
    // A slash command in between keeps the call: one per prompt, and both prompts got rows.
    // The third prompt was answered (quit) while its briefing was read: no call was made for it.
    assert.equal(briefings.length, 2, "one call per explore prompt answered after its rows");
    assert.deepEqual(report.suggestions, { shown: 2, unchanged: 1, edited: 0, own: 1 });
    // The briefing is the human's own: their sheet, their state, their options and what they were shown.
    const briefing = briefings[0];
    assert.match(briefing, /^Your character sheet:\n/);
    assert.match(briefing, /What the rules let you do now:/);
    assert.match(briefing, /What could your character do or say now\? Three different ideas\.$/);
    // Nothing a player view can't carry (Rule 3): no DM channel, no target numbers.
    assert.doesNotMatch(briefing, /(^|[^\p{L}])(AC|DC) \d/u);
    assert.doesNotMatch(briefing, /hp_max|"against"|dm_notes/);
    // The briefing is among the human seat's inputs, where the leak scan reads it, and the sent line says it came from a suggestion.
    const inputs = readFileSync(path.join(t.runDir, "inputs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { seat: string; text: string; human?: boolean });
    assert.ok(inputs.some((r) => r.seat === "bren" && !r.human && r.text === briefing));
    const sent = inputs.filter((r) => r.human).map((r) => JSON.parse(r.text) as PlayerIntent);
    assert.ok(sent.some((i) => i.kind === "text" && i.suggestion?.n === 2 && !i.suggestion.edited));
  } finally {
    t.close();
  }
});

test("/suggest turns the suggestions off: the call in flight is dropped and later prompts ask none", async () => {
  let n = 0;
  const seat = {
    handle: "bren",
    shown: [] as TableEvent[],
    show(event: TableEvent) {
      this.shown.push(event);
    },
    suggest() {},
    async ask(prompt: HumanPrompt): Promise<PlayerIntent> {
      n += 1;
      if (prompt.kind !== "explore" || n > 3) return { kind: "command", name: "quit" };
      return n === 1 ? { kind: "command", name: "suggest" } : { kind: "text", text: "I wait." };
    },
  };
  const t = await testTable({ seed: 1, human: "bren", players: [], seat: seat as never });
  let calls = 0;
  const suggester = new Suggester({ handle: "bren", card: CARD, open: (config) => new StandIn<string>(config, async () => (calls++, "A\nB\nC")) });
  try {
    await new TableLoop({ table: t.table, dm: new ScriptedDm({}), players: [], maxSteps: 20, suggester }).run("vale_town");
    assert.ok(seat.shown.some((e) => e.kind === "status" && e.text.startsWith("Suggestions off.")));
    // Turned off on the first prompt: its call was dropped, and the next prompts ask none.
    assert.ok(calls <= 1, `${calls} calls after /suggest turned them off`);
  } finally {
    t.close();
  }
});

test("the picker: the cursor starts on your own, ↑ and Enter send a suggestion, Tab cycles them into the line, typing is your own", async () => {
  const seat = new InkSeat("bren");
  let cancelled = 0;
  // Before the rows come, the first key typed cancels the call.
  let asked = seat.ask({ kind: "explore" });
  seat.suggest({ kind: "waiting", cancel: () => (cancelled += 1) });
  seat.type("I");
  assert.equal(cancelled, 1);
  seat.suggest({ kind: "rows", rows: ["Look", "Ask", "Wait"] });
  assert.equal(seat.getView().suggestions, undefined, "too late: the human started their own line");
  seat.type(" go\r");
  assert.deepEqual(await asked, { kind: "text", text: "I go" });

  asked = seat.ask({ kind: "explore" });
  seat.suggest({ kind: "rows", rows: ["Look", "Ask", "Wait"] });
  assert.equal(seat.getView().suggestions?.cursor, 3, "the cursor starts on Your own…");
  // Enter on "Your own…" with nothing typed sends nothing.
  seat.enter();
  assert.ok(seat.getView().prompt);
  seat.move(-1);
  seat.enter();
  assert.deepEqual(await asked, { kind: "text", text: "Wait", suggestion: { n: 3, edited: false } });
  assert.equal(seat.getView().suggestions, undefined);

  asked = seat.ask({ kind: "explore" });
  seat.suggest({ kind: "rows", rows: ["Look", "Ask", "Wait"] });
  seat.edit({ kind: "complete" });
  seat.edit({ kind: "complete" });
  assert.equal(seat.getView().draft, "Ask");
  seat.type(" Maren");
  // Edited: Tab no longer replaces the words typed.
  seat.edit({ kind: "complete" });
  assert.equal(seat.getView().draft, "Ask Maren");
  seat.enter();
  assert.deepEqual(await asked, { kind: "text", text: "Ask Maren", suggestion: { n: 2, edited: true } });

  // Numbered options own the digits: the picker hides while they are on screen.
  asked = seat.ask({ kind: "explore" });
  seat.suggest({ kind: "rows", rows: ["Look", "Ask", "Wait"] });
  assert.equal(pickerRows(seat.getView().suggestions!, "What does Bren do or say?").length, 5);
  seat.show({ kind: "options", lines: ["1. Search"], choices: [] });
  seat.move(1);
  assert.equal(seat.getView().highlight, 1, "↑/↓ light the options, not the suggestions");
  seat.type("hi\r");
  assert.deepEqual(await asked, { kind: "text", text: "hi" });
});
