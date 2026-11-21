// The page replays a recorded seat wire (AGT-142; scope exit row 4, first part): the story it draws
// is the reducer's, which the node tests hold to the terminal seat's; every die the stage lands
// shows the engine's d20 faces and nothing else (Rule 4); it fits three widths in light and dark.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HostMessageSchema, type HostMessage } from "../src/seat-wire/messages.ts";
import { EMPTY, reduce, settle, type PageView } from "../src/page/reduce.ts";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures");

interface Wire {
  file: string;
  language: "en" | "ru";
  handle: string;
}
const WIRES: Wire[] = [
  { file: "yard.seat-wire.jsonl", language: "en", handle: "bren" },
  { file: "the-way-back-ru.seat-wire.jsonl", language: "ru", handle: "bren" },
];

type Rec = { seq?: number; event?: { kind: string; own?: boolean; roll?: string; event?: { kind?: string; roll?: { id: string; dice: Array<{ dice: string; results: number[] }> } } }; message?: HostMessage };
const records = (w: Wire): Rec[] => readFileSync(path.join(FIXTURES, w.file), "utf8").trim().split("\n").map((l) => JSON.parse(l));

/** The reducer's screen at the end of the wire, as the page's replay builds it (no names, hash unchecked). */
function expected(w: Wire): PageView {
  let v = reduce(EMPTY, HostMessageSchema.parse({ type: "hello", wire: 1, hash: "", run: "", language: w.language, handle: w.handle, title: "" }));
  for (const r of records(w)) v = settle(reduce(v, HostMessageSchema.parse(r.event ? { type: "event", seq: r.seq, event: r.event } : r.message)));
  return v;
}

/** The own d20 rolls of a wire, in order, with the engine's faces. */
function ownRolls(w: Wire, to = Infinity): Array<{ roll: string; faces: number[] }> {
  return records(w).flatMap((r) => {
    const e = r.event;
    if (!e || e.kind !== "engine" || !e.own || e.event?.kind !== "roll" || !e.event.roll || (r.seq ?? 0) > to) return [];
    const faces = e.event.roll.dice.filter((d) => d.dice.endsWith("d20")).flatMap((d) => d.results);
    return faces.length > 0 ? [{ roll: e.event.roll.id, faces }] : [];
  });
}

async function replay(page: Page, w: Wire, to?: number): Promise<void> {
  await page.goto(`/index.html?replay=/fixtures/${w.file}&language=${w.language}&handle=${w.handle}${to ? `&to=${to}` : ""}`);
  await page.waitForFunction(() => window.__nat20?.done === true, undefined, { timeout: 100_000 });
}

for (const w of WIRES) {
  test(`${w.file}: the page draws the reducer's story, and every die lands on the engine's faces`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await replay(page, w);
    const want = expected(w);
    // A row's words, name tokens included, without its roll tokens.
    const rows = await page.locator(".story .row:not(.preview)").evaluateAll((els) => els.map((e) => [...e.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains("token"))).map((n) => n.textContent ?? "").join("")));
    expect(rows).toEqual(want.story.filter((l) => l.text !== "").map((l) => l.text.trimStart()));
    const tokens = await page.locator(".story [data-roll]").evaluateAll((els) => els.map((e) => e.getAttribute("data-roll")));
    expect(tokens).toEqual(want.story.flatMap((l) => (l.text === "" ? [] : l.rolls)));
    const landed = await page.evaluate(() => window.__nat20!.landed);
    expect(landed.map(({ roll, faces }) => ({ roll, faces }))).toEqual(ownRolls(w));
    expect(landed.every((l) => l.gl), "the stage drew WebGL dice").toBe(true);
    await expect(page.locator(".dock")).toHaveAttribute("data-form", "ended");
  });
}

// Every finish (Stas, 2026-11-21) turns in place and lands on the engine's face, numbers upright.
for (const [finish, label] of [["chrome", "Die: mirror"], ["wire", "Die: wire"], ["glass", "Die: glass"]] as const) {
  test(`the ${finish} die rises, turns and lands on the engine's face`, async ({ page }) => {
    await page.addInitScript((f) => localStorage.setItem("nat20.die-finish", f), finish);
    const w = WIRES[0];
    const first = ownRolls(w)[0];
    const seq = records(w).find((r) => r.event?.event?.roll?.id === first.roll)!.seq!;
    await replay(page, w, seq);
    const landed = await page.evaluate(() => window.__nat20!.landed);
    expect(landed).toEqual([{ ...first, gl: true }]);
    await expect(page.locator('[data-test="finish"]')).toHaveText(label);
  });
}

test("the finish switch goes mirror, wire, glass and round again, and the choice outlasts a reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await replay(page, WIRES[1], 40);
  const finish = page.locator('[data-test="finish"]');
  await expect(finish).toHaveText("Кубик: зеркальный");
  await finish.click();
  await expect(finish).toHaveText("Кубик: проволочный");
  await replay(page, WIRES[1], 40);
  await expect(finish).toHaveText("Кубик: проволочный");
  await finish.click();
  await expect(finish).toHaveText("Кубик: стеклянный");
  await finish.click();
  await expect(finish).toHaveText("Кубик: зеркальный");
});

// Exit row 5 (AGT-143): a card with its votes, a name token and a person's «Помнит» on the page.
test("a road card shows its choices, the table's word lands on them, and the decision is marked", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const w = WIRES[1];
  await replay(page, w, 17);
  const card = page.locator('[data-test="card"]');
  // Who decides is said once, by the story just above the card.
  await expect(page.locator(".story")).toContainText("Решает хозяин обоза, а ваше слово будет советом.");
  await expect(card).not.toContainText("Решает хозяин обоза");
  await expect(card.locator(".choice")).toHaveText(["Укрыть мешки плащами.", "Встать под ивами и переждать.", "Идти дальше сквозь дождь."]);
  await expect(card.locator(".choice").first()).toBeEnabled();
  await replay(page, w, 23);
  await expect(card.locator('[data-choice="cloaks"] .vote')).toHaveText(["Б", "Т", "М", "И"]);
  await expect(card.locator('[data-choice="cloaks"] .vote.mine')).toHaveAttribute("title", "Брен");
  await expect(card).toHaveAttribute("data-decided", "cloaks");
  await expect(card.locator(".choice").first()).toBeDisabled();
});

test("a name in the story opens what the character knows of them, and «Люди» lists everyone with what they remember", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await replay(page, WIRES[1], 236);
  // The shepherd is named in the story: her name is a token that opens her card.
  await page.locator('.story .name[data-person="shepherd_gwyn"]').first().click();
  await expect(page.locator('[data-test="person-card"] h2')).toHaveText("Гвин");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-test="person-card"]')).toHaveCount(0);
  await page.locator('[data-test="people"]').click();
  const list = page.locator('[data-test="people-list"]');
  await expect(list.locator("h3")).toContainText(["Вы встречали", "Только слышали"]);
  await list.locator('[data-person="warden_brannock"]').click();
  await expect(page.locator('[data-test="person-card"] .remembers')).toHaveText(["Помнит: you gave him a sack of wheat for a pitch by the well."]);
  // Esc closes the card on top first, then the list under it.
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-test="person-card"]')).toHaveCount(0);
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  for (const width of [390, 820, 1280]) {
    test(`the yard mid-fight fits ${width} px in ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      const w = WIRES[0];
      await replay(page, w, 120);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.locator(".pill")).toBeVisible();
      await expect(page.locator(".dock")).toBeVisible();
    });
  }
}
