// The page inside a native shell (AGT-153; SwiftUI shell design §3, rows 1 and 2): opened with
// `shell=native` it opens no socket and draws no bar; fed a wire that holds every kind of ask
// through the shell's own entry points, each ask puts up a control in the chrome state, and what
// the page hands back for the press is a message the seat wire takes. The shell here is this test:
// with no `webkit.messageHandlers.shell`, the page keeps what it would have posted on the window.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import type { Chrome } from "../src/page/chrome.ts";
import { PageMessageSchema, WIRE_VERSION } from "../src/seat-wire/messages.ts";
import { WIRE_HASH } from "../src/seat-wire/schema.ts";
import { ASK_KINDS, everyAsk, NAMES_RU } from "../test/page-wires.ts";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures");

type Posted = { type: "chrome"; json: string } | { type: "send"; message: unknown } | { type: "open" | "ready" };
/** What a shell hands the page for a press (`Window.__nat20Shell`, declared in the page's entry). */
type Act = Parameters<NonNullable<Window["__nat20Shell"]>["act"]>[0];

const host = (page: Page, messages: unknown[]) => page.evaluate((lines) => lines.forEach((line) => window.__nat20Shell!.host(line)), messages.map((m) => JSON.stringify(m)));
const posted = (page: Page) => page.evaluate(() => (window.__nat20Posted ?? []) as unknown[]) as Promise<Posted[]>;
const act = (page: Page, a: Act) => page.evaluate((x) => window.__nat20Shell!.act(x), a);

/** The chrome state the page posted last, once it shows this ask as open (or, with no id, no ask open). */
async function chromeAt(page: Page, ask?: string): Promise<Chrome> {
  const handle = await page.waitForFunction((id) => {
    const all = (window.__nat20Posted ?? []) as Array<{ type: string; json?: string }>;
    const last = all.filter((p) => p.type === "chrome").at(-1);
    if (!last?.json) return false;
    const chrome = JSON.parse(last.json) as { dock: { ask?: string; open: boolean } };
    return (id === null ? !chrome.dock.open : chrome.dock.open && chrome.dock.ask === id) ? last.json : false;
  }, ask ?? null);
  return JSON.parse((await handle.jsonValue()) as string) as Chrome;
}

/** What a shell would press for this ask, from the chrome state alone, and the intent the wire should then carry. */
function press(kind: string, chrome: Chrome): { act: Act; intent: Record<string, unknown> } {
  const dock = chrome.dock;
  const first = dock.sheet?.groups[0]?.moves[0]?.n;
  switch (kind) {
    case "reaction": {
      // The second answer on offer: it has a control of its own.
      const answers = dock.sheet?.reaction?.answers ?? [];
      expect(answers.map((a) => a.label)).toEqual(["Удар длинным мечом", "Удар щитом"]);
      return { act: { kind: "option", n: answers[1].n }, intent: { kind: "option", number: 2 } };
    }
    case "answer":
      expect(dock.sheet?.question).toBeTruthy();
      return { act: { kind: "typed", text: "Связать ему руки и спросить, кто его послал" }, intent: { kind: "text", text: "Связать ему руки и спросить, кто его послал" } };
    case "explore":
      expect(dock.form).toBe("input");
      return { act: { kind: "typed", text: "Осматриваюсь" }, intent: { kind: "text", text: "Осматриваюсь" } };
    case "paused":
      expect(dock.form).toBe("paused");
      return { act: { kind: "command", name: "pause" }, intent: { kind: "command", name: "pause" } };
    case "card": {
      const n = dock.card?.choices[0]?.n;
      expect(dock.card?.asked && n !== undefined).toBe(true);
      return { act: { kind: "option", n: n! }, intent: { kind: "option", number: n } };
    }
    case "combat_turn": {
      const n = dock.endTurn?.n ?? dock.chips[0]?.n;
      expect(n).toBeDefined();
      return { act: { kind: "option", n: n! }, intent: { kind: "option", number: n } };
    }
    default:
      // A pick, a surrender, a level-up, the road: the ask is its own sheet of numbered rows.
      expect(dock.sheet?.forced).toBe(true);
      expect(first).toBeDefined();
      return { act: { kind: "option", n: first! }, intent: { kind: "option", number: first } };
  }
}

test("inside a native shell the page opens no socket and draws no bar, and every kind of ask is answered through the shell's entry points with a message the wire takes", async ({ page }) => {
  const sockets: string[] = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  // An address that names a live table too: the socket is still the shell's.
  await page.goto("/index.html?shell=native&show=story&port=1&token=t");
  await page.waitForFunction(() => window.__nat20Shell !== undefined);
  await host(page, [{ type: "hello", wire: WIRE_VERSION, hash: WIRE_HASH, run: "every-ask", language: "ru", handle: "bren", title: "", names: NAMES_RU }]);

  const answered = new Map<string, number>();
  let batch: unknown[] = [];
  for (const r of everyAsk()) {
    const message = (r.event !== undefined ? { type: "event", seq: r.seq, event: r.event } : r.message) as { type: string; id?: string; prompt?: { kind: string } };
    batch.push(message);
    if (message.type !== "ask") continue;
    await host(page, batch);
    batch = [];
    const kind = message.prompt!.kind;
    const chrome = await chromeAt(page, message.id);
    const before = (await posted(page)).filter((p) => p.type === "send").length;
    const { act: pressed, intent } = press(kind, chrome);
    expect(await act(page, pressed), `${kind} ${message.id}`).toMatchObject({ ok: true });
    const sent = (await posted(page)).filter((p): p is Extract<Posted, { type: "send" }> => p.type === "send").slice(before);
    expect(sent, `${kind} ${message.id}: one message for the socket`).toHaveLength(1);
    // The host parses it with this schema and takes an intent only for the ask that is open.
    expect(PageMessageSchema.parse(sent[0].message)).toEqual({ type: "intent", id: message.id, intent });
    await chromeAt(page);
    answered.set(kind, (answered.get(kind) ?? 0) + 1);
  }
  await host(page, batch);

  expect([...answered.keys()].sort()).toEqual([...ASK_KINDS].sort());
  await expect.poll(async () => (await posted(page)).filter((p) => p.type === "chrome").at(-1)).toMatchObject({ json: expect.stringContaining('"form":"ended"') });
  // Nothing to press once the run is over, and nothing the page did not get from the shell.
  expect(await act(page, { kind: "option", n: 1 })).toMatchObject({ ok: false });
  expect(sockets).toEqual([]);
  await expect(page.locator(".dock-bar, .dock-glass")).toHaveCount(0);
  await expect(page.locator(".win.native")).toHaveCount(1);
});

test("in a browser, a reaction with two answers on offer shows each as its own button, and no", async ({ page }) => {
  const wire = everyAsk();
  const reaction = wire.find((r) => (r.event as { kind?: string } | undefined)?.kind === "reaction")!;
  const body = wire.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await page.route("**/fixtures/every-ask.jsonl", (route) => route.fulfill({ body, contentType: "application/x-ndjson" }));
  await page.goto(`/index.html?replay=/fixtures/every-ask.jsonl&language=ru&to=${reaction.seq}`);
  await page.waitForFunction(() => window.__nat20?.done === true);
  await expect(page.locator(".sheet [data-answer]")).toHaveText(["Удар длинным мечом", "Удар щитом", "нет"]);
  await expect(page.locator(".sheet .sheet-lead")).toHaveText("можно ответить: гоблин 1.");
});

test("inside a native shell, «Где все» and «Лист» play a recorded run to its end: they show no stage and wait for none", async ({ page }) => {
  // The yard holds the human's own rolls. Only the story's page shows a roll on its stage; the
  // other two are separate pages, and their replay must not wait for a stage that never clears.
  for (const show of ["where", "sheet"]) {
    await page.goto(`/index.html?shell=native&show=${show}&replay=/fixtures/yard.seat-wire.jsonl&language=ru&handle=bren`);
    await page.waitForFunction(() => window.__nat20?.done === true, undefined, { timeout: 20_000 });
    await expect(page.locator(".stage, canvas[data-face]")).toHaveCount(0);
  }
});

test("inside a native shell, «Где все» draws the yard for the page it is given: a phone's scale on a phone, the whole yard in a wide window or on the right page of the Mac's open book, never under 8 px a foot, and «Лист» keeps to a column", async ({ page }) => {
  // Stas's Mac, 2026-11-25: full screen drew the yard at the phone's 185% of the page's width, and the sheet across it.
  const yard = () => page.evaluate(() => {
    const svg = document.querySelector(".lens.yard svg")!;
    return { width: svg.getBoundingClientRect().width, feet: Number(svg.getAttribute("viewBox")!.split(" ")[2]) };
  });
  const open = async (show: string) => {
    await page.goto(`/index.html?shell=native&show=${show}&replay=/fixtures/yard.seat-wire.jsonl&to=74&language=ru&handle=bren`);
    await page.waitForFunction(() => window.__nat20?.done === true, undefined, { timeout: 20_000 });
  };
  await page.setViewportSize({ width: 393, height: 760 });
  await open("where");
  expect(Math.round((await yard()).width)).toBe(Math.round(393 * 1.85));
  await page.setViewportSize({ width: 1728, height: 880 });
  await open("where");
  const wide = await yard();
  expect(wide.width).toBeLessThanOrEqual(1728);
  expect(wide.width / wide.feet).toBeGreaterThanOrEqual(8);
  expect(wide.width / wide.feet).toBeLessThanOrEqual(18);
  // A window too small for the whole yard keeps a name readable and scrolls, as the phone does.
  await page.setViewportSize({ width: 520, height: 600 });
  await open("where");
  const small = await yard();
  expect(small.width / small.feet).toBeCloseTo(8, 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeGreaterThan(520);
  // The right page of the Mac's open book (CON-25) is taller than wide and no phone: full screen it
  // takes the window's scale, and in the narrowest book it is a phone's width and keeps the phone's.
  await page.setViewportSize({ width: 795, height: 950 });
  await open("where");
  const right = await yard();
  expect(right.width / right.feet).toBeGreaterThanOrEqual(8);
  expect(right.width / right.feet).toBeLessThanOrEqual(18);
  expect(right.width).toBeLessThan(795 * 1.85);
  await page.setViewportSize({ width: 396, height: 560 });
  await open("where");
  expect(Math.round((await yard()).width)).toBe(Math.round(396 * 1.85));
  await page.setViewportSize({ width: 1728, height: 880 });
  await open("sheet");
  expect((await page.locator(".inspector").boundingBox())!.width).toBeLessThanOrEqual(42 * 16);
});

test("inside a native shell, a die finish chosen on «Лист» is the one the story's next roll shows", async ({ page, context }) => {
  const hello = { type: "hello", wire: WIRE_VERSION, hash: WIRE_HASH, run: "yard", language: "ru", handle: "bren", title: "", names: NAMES_RU };
  // The story's page is loaded first, as in the shell: the choice is made after it read its own.
  await page.goto("/index.html?shell=native&show=story");
  await page.waitForFunction(() => window.__nat20Shell !== undefined);
  await host(page, [hello]);

  const sheet = await context.newPage();
  await sheet.goto("/index.html?shell=native&show=sheet");
  await sheet.waitForFunction(() => window.__nat20Shell !== undefined);
  await host(sheet, [hello]);
  const finish = await sheet.locator('[data-test="finish"] button[aria-pressed="false"]').first().getAttribute("data-finish");
  expect(finish).toBeTruthy();
  const chosen = sheet.locator(`[data-test="finish"] button[data-finish="${finish}"]`);
  await chosen.click();
  await expect(chosen).toHaveAttribute("aria-pressed", "true");

  // The human's own roll takes the story's stage.
  const lines = readFileSync(path.join(FIXTURES, "yard.seat-wire.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as { seq?: number; event?: { kind?: string; own?: boolean; roll?: string }; message?: unknown });
  const roll = lines.findIndex((r) => r.event?.kind === "engine" && r.event.own === true && r.event.roll !== undefined);
  expect(roll).toBeGreaterThan(0);
  await host(page, lines.slice(0, roll + 1).map((r) => (r.event !== undefined ? { type: "event", seq: r.seq, event: r.event } : r.message)));
  await expect(page.locator("canvas[data-face]").first()).toHaveAttribute("data-finish", finish!);
});

test("«Где все» says what is not drawn yet by its own name: the place's plan, and the portrait of each one standing here with none (CON-26)", async ({ page }) => {
  const open = async (fixture: string, to: number) => {
    await page.goto(`/index.html?shell=native&show=where&replay=/fixtures/${fixture}&to=${to}&language=ru&handle=bren`);
    await page.waitForFunction(() => window.__nat20?.done === true, undefined, { timeout: 20_000 });
  };
  await page.setViewportSize({ width: 676, height: 912 });
  // The green: everyone here has a face, and the place's plan is not drawn.
  await open("green.seat-wire.jsonl", 2);
  await expect(page.locator('[data-missing="plan"]')).toHaveText("Нет плана места: the_silent_mill/green");
  await expect(page.locator('[data-missing="faces"]')).toHaveCount(0);
  await expect(page.locator(".lens .who.noface")).toHaveCount(0);
  await expect(page.locator('.lens .who[data-handle="osric_hale"] image')).toHaveCount(1);
  // The yard, recorded before places were told: no plan is named, and the wolf and the boss have no portrait.
  await open("yard.seat-wire.jsonl", 74);
  await expect(page.locator('[data-missing="plan"]')).toHaveCount(0);
  const faces = (await page.locator('[data-missing="faces"]').textContent()) ?? "";
  expect(faces.startsWith("Нет портретов: ")).toBe(true);
  const files = faces.replace("Нет портретов: ", "").split(", ");
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) expect(file).toMatch(/^[a-z_]+\.jpg$/);
  expect(await page.locator(".lens .who.noface").count()).toBeGreaterThanOrEqual(files.length);
  // The chip lies inside the page and off the people it names.
  const chip = (await page.locator('[data-test="missing"]').boundingBox())!;
  expect(chip.x).toBeGreaterThanOrEqual(0);
  expect(chip.y + chip.height).toBeLessThanOrEqual(912);
});
