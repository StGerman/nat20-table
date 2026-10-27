// Colour for the terminal seat, from the Mill Table design system's accent code (the Telegram
// table's visual system): each accent owns one meaning, and the base stays the terminal's own ink.
// rust is action and danger (your turn, bloodied, down), teal recovery, violet magic and
// conditions, gold the sacred and the found; hint is secondary text. With 16 colours (the default)
// the accents are the terminal's own red, cyan, magenta and yellow, so the user's theme decides the
// shade; a truecolour terminal gets Mill's hex values for a dark ground (Night) or, with
// NAT20_THEME=day, a light one. NO_COLOR turns colour off; every state still has its word.

export type Accent = "rust" | "teal" | "violet" | "gold" | "hint";

const ANSI: Record<Accent, string> = { rust: "red", teal: "cyan", violet: "magenta", gold: "yellow", hint: "gray" };
// Mill Table `*-text` tokens and `tg-hint`, Night then Day.
const NIGHT: Record<Accent, string> = { rust: "#f07a4a", teal: "#5fb3a6", violet: "#b48ad0", gold: "#c9a33a", hint: "#9a9488" };
const DAY: Record<Accent, string> = { rust: "#a8401c", teal: "#276b60", violet: "#6e4590", gold: "#7a5e12", hint: "#6c665d" };

export type Palette = Record<Accent, string | undefined>;

/** The palette for this terminal, read from its environment. */
export function paletteFor(env: NodeJS.ProcessEnv = process.env): Palette {
  if (env.NO_COLOR) return { rust: undefined, teal: undefined, violet: undefined, gold: undefined, hint: undefined };
  const truecolor = env.COLORTERM === "truecolor" || env.COLORTERM === "24bit";
  if (!truecolor) return ANSI;
  return env.NAT20_THEME === "day" ? DAY : NIGHT;
}
