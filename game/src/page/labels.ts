// Where «Где все» writes each name (Glass Table design §5.2): creatures stand five feet apart and a
// name is wider than that, so each label takes the first place around its mark that no other
// label or mark covers. Pure and in the lens's own units (feet), so the page draws the same
// layout every time and a test can check it without a browser.

/** A label to place: its text, its font size, and the marks it may sit around, in order of preference. */
export interface LabelAsk {
  key: string;
  text: string;
  /** The font size, in the lens's units (the CSS sets the same). */
  size: number;
  /** The mark's centre. */
  x: number;
  y: number;
  /** Places to try, each an offset from the centre and how the text is anchored there. */
  spots: readonly Spot[];
}

export interface Spot {
  dx: number;
  /** The baseline's offset. */
  dy: number;
  anchor: "middle" | "start" | "end";
}

/** Where a label went. */
export interface Placed {
  key: string;
  x: number;
  y: number;
  anchor: Spot["anchor"];
}

/** A mark no label may cover: a creature's disc or a place's square. */
export interface Mark {
  x: number;
  y: number;
  r: number;
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** About how wide a bold Inter glyph is, as a share of the font size. */
const GLYPH = 0.6;

/** The box a label covers at a spot, in the lens's units. */
export function labelBox(ask: LabelAsk, spot: Spot): Box {
  const w = ask.text.length * GLYPH * ask.size;
  const x = ask.x + spot.dx;
  const by = ask.y + spot.dy;
  const x0 = spot.anchor === "middle" ? x - w / 2 : spot.anchor === "start" ? x : x - w;
  return { x0, x1: x0 + w, y0: by - 0.8 * ask.size, y1: by + 0.25 * ask.size };
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Places the labels in the order given: each takes its first spot that covers no mark and no label
 * placed before it, or, when every spot is covered, the one covered least.
 */
export function placeLabels(asks: readonly LabelAsk[], marks: readonly Mark[]): Placed[] {
  const taken: Box[] = marks.map((m) => ({ x0: m.x - m.r, x1: m.x + m.r, y0: m.y - m.r, y1: m.y + m.r }));
  return asks.map((ask) => {
    let best: { spot: Spot; box: Box; cost: number } | undefined;
    for (const spot of ask.spots) {
      const box = labelBox(ask, spot);
      const cost = taken.reduce((sum, t) => sum + overlap(box, t), 0);
      if (!best || cost < best.cost) best = { spot, box, cost };
      if (cost === 0) break;
    }
    taken.push(best!.box);
    return { key: ask.key, x: ask.x + best!.spot.dx, y: ask.y + best!.spot.dy, anchor: best!.spot.anchor };
  });
}

/** Around a creature's disc: below it first, then above, to the right, to the left, and further out. */
export const TOKEN_SPOTS: readonly Spot[] = [
  { dx: 0, dy: 3.6, anchor: "middle" },
  { dx: 0, dy: -2.6, anchor: "middle" },
  { dx: 2.4, dy: 0.45, anchor: "start" },
  { dx: -2.4, dy: 0.45, anchor: "end" },
  { dx: 0, dy: 5.2, anchor: "middle" },
  { dx: 0, dy: -4.2, anchor: "middle" },
];

/** The human's «вы»: above first. */
export const ME_SPOTS: readonly Spot[] = [TOKEN_SPOTS[1]!, TOKEN_SPOTS[0]!, TOKEN_SPOTS[2]!, TOKEN_SPOTS[3]!, TOKEN_SPOTS[5]!, TOKEN_SPOTS[4]!];

/** Around a place's square: below, above, right, left, and further out above and below. */
export const PLACE_SPOTS: readonly Spot[] = [
  { dx: 0, dy: 2.6, anchor: "middle" },
  { dx: 0, dy: -1.6, anchor: "middle" },
  { dx: 1.4, dy: 0.45, anchor: "start" },
  { dx: -1.4, dy: 0.45, anchor: "end" },
  { dx: 0, dy: -4.3, anchor: "middle" },
  { dx: 0, dy: 4.2, anchor: "middle" },
  { dx: 0, dy: -5.9, anchor: "middle" },
  { dx: 0, dy: 5.8, anchor: "middle" },
];
