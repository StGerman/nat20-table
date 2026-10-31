// Colour for the terminal seat, from the Mill Table design tokens in `game/theme/mill-table.json`
// (M10 U2, AGT-65): each accent owns one meaning, and the base stays the terminal's own ink. rust
// is action and danger (your turn, down), teal recovery, violet magic and conditions,
// gold the sacred and the found; hint is secondary text. With 16 colours (the default) the accents
// are the terminal's own red, cyan, magenta and yellow, so the user's theme decides the shade; a
// truecolour terminal gets Mill's hex values for a dark ground (Night) or, with NAT20_THEME=day, a
// light one. NO_COLOR turns colour off; every state still has its word.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Accent = "rust" | "teal" | "violet" | "gold" | "hint";
export const ACCENTS: readonly Accent[] = ["rust", "teal", "violet", "gold", "hint"];

/** How a span looks: an accent from the palette, and type styles that survive NO_COLOR. */
export interface Style {
  accent?: Accent;
  bold?: boolean;
  italic?: boolean;
  dim?: boolean;
}

/** The token file's shape. */
export interface Theme {
  accents: Record<Accent, { meaning: string; ansi: string; night: string; day: string }>;
  /** How each kind of line looks (`Tone` in lines.ts). */
  tones: Record<string, Style>;
  /** Each health band's accent and its word in each table language. */
  states: Record<string, { accent?: Accent; word_en: string; word_ru: string }>;
}

/** The theme file the seat reads. */
export const THEME_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../theme/mill-table.json");

/** The built-in tokens, used when the file is missing or invalid: the same values as the file today. */
const FALLBACK: Theme = {
  accents: {
    rust: { meaning: "action and danger", ansi: "red", night: "#f07a4a", day: "#a8401c" },
    teal: { meaning: "recovery", ansi: "cyan", night: "#5fb3a6", day: "#276b60" },
    violet: { meaning: "magic and conditions", ansi: "magenta", night: "#b48ad0", day: "#6e4590" },
    gold: { meaning: "the sacred and the found", ansi: "yellow", night: "#c9a33a", day: "#7a5e12" },
    hint: { meaning: "secondary text", ansi: "gray", night: "#9a9488", day: "#6c665d" },
  },
  tones: {
    dm: {},
    speech: { italic: true },
    intent: { italic: true, accent: "hint" },
    engine: { accent: "hint" },
    options: {},
    prompt: { accent: "rust", bold: true },
    info: {},
    status: { accent: "hint" },
    end: { accent: "rust", bold: true },
    error: { accent: "rust" },
  },
  states: {
    unhurt: { word_en: "unhurt", word_ru: "цел" },
    bloodied: { word_en: "bloodied", word_ru: "ранен" },
    down: { accent: "rust", word_en: "down", word_ru: "выбыл" },
  },
};

const HEX = /^#[0-9a-f]{6}$/i;

/** What is wrong with a parsed token file; empty when it is valid. */
export function themeProblems(theme: unknown): string[] {
  const t = theme as Partial<Theme> | undefined;
  const problems: string[] = [];
  for (const accent of ACCENTS) {
    const a = t?.accents?.[accent];
    if (!a || typeof a.ansi !== "string" || !HEX.test(a.night ?? "") || !HEX.test(a.day ?? "")) problems.push(`accent ${accent}: needs ansi, and night and day as #rrggbb`);
  }
  // Every tone and every state the seat draws, and no others: a missing one would drop its accent
  // or paint the healthy in the danger colour, and a misspelt one would be ignored.
  const tones = t?.tones ?? {};
  for (const name of Object.keys(FALLBACK.tones)) if (!(name in tones)) problems.push(`tone ${name}: missing`);
  for (const [name, style] of Object.entries(tones)) {
    if (!(name in FALLBACK.tones)) problems.push(`tone ${name}: unknown`);
    else if (style?.accent && !ACCENTS.includes(style.accent)) problems.push(`tone ${name}: unknown accent ${style.accent}`);
  }
  const states = t?.states ?? {};
  for (const name of Object.keys(FALLBACK.states)) if (!(name in states)) problems.push(`state ${name}: missing`);
  for (const [name, state] of Object.entries(states)) {
    if (!(name in FALLBACK.states)) problems.push(`state ${name}: unknown`);
    else {
      if (state?.accent && !ACCENTS.includes(state.accent)) problems.push(`state ${name}: unknown accent ${state.accent}`);
      if (!state?.word_en || !state?.word_ru) problems.push(`state ${name}: needs word_en and word_ru`);
    }
  }
  return problems;
}

/** The tokens from `file`; the built-in ones, with one warning, when it can't be read or is invalid. */
export function loadTheme(file = THEME_FILE, warn: (text: string) => void = (text) => process.stderr.write(`${text}\n`)): Theme {
  try {
    const theme = JSON.parse(readFileSync(file, "utf8")) as Theme;
    const problems = themeProblems(theme);
    if (problems.length === 0) return theme;
    warn(`${path.basename(file)}: ${problems.join("; ")}; using the built-in colours`);
  } catch (error) {
    warn(`${path.basename(file)} can't be read (${error instanceof Error ? error.message : String(error)}); using the built-in colours`);
  }
  return FALLBACK;
}

/** The tokens the seat uses, read once. */
export const THEME: Theme = loadTheme();

export type Palette = Record<Accent, string | undefined>;

/** The palette for this terminal, read from its environment. */
export function paletteFor(env: NodeJS.ProcessEnv = process.env, theme: Theme = THEME): Palette {
  const pick = (f: (a: Theme["accents"][Accent]) => string | undefined) => Object.fromEntries(ACCENTS.map((a) => [a, f(theme.accents[a])])) as Palette;
  if (env.NO_COLOR) return pick(() => undefined);
  const truecolor = env.COLORTERM === "truecolor" || env.COLORTERM === "24bit";
  if (!truecolor) return pick((a) => a.ansi);
  return env.NAT20_THEME === "day" ? pick((a) => a.day) : pick((a) => a.night);
}
