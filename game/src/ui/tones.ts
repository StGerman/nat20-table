// How each tone looks in the terminal (M10 U2), apart from lines.ts so that the lines themselves
// need no theme file and a window's page can lay them out too (AGT-142).
import { THEME, type Palette, type Style } from "./palette.ts";
import type { Tone } from "./lines.ts";

const TONES: readonly Tone[] = ["dm", "speech", "intent", "engine", "options", "prompt", "info", "status", "end", "error"];

/**
 * Each tone in the Mill Table accent code, from the theme file's `tones` (M10 U2): narration and
 * plain values carry no accent, engine lines are secondary text, your turn and the run's end are rust.
 */
export const TONE_STYLE: Record<Tone, Style> = Object.fromEntries(TONES.map((tone) => [tone, THEME.tones[tone] ?? {}])) as Record<Tone, Style>;

/** Ink `Text` props for a style in a palette. */
export function textProps(style: Style, palette: Palette): { color?: string; bold?: boolean; italic?: boolean; underline?: boolean; dimColor?: boolean } {
  const color = style.accent ? palette[style.accent] : undefined;
  return {
    ...(color ? { color } : {}),
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    // Secondary text dims itself when there is no colour to mark it.
    ...(style.dim || (style.accent === "hint" && !color) ? { dimColor: true } : {}),
  };
}

