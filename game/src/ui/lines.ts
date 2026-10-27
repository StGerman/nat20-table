// How each TableEvent reads on the human's screen (M6 spec §3.4, AGT-7): styled lines, already
// projected for the human by the loop, so this only lays them out. Rolls show inline as the engine
// rendered them for the human's viewer, with their roll id (dice, total and outcome; no AC or DC).
import type { TableEvent } from "../table/types.ts";
import type { Accent, Palette } from "./palette.ts";

/** What a line means on screen; `TONE_STYLE` says how that looks. */
export type Tone = "dm" | "speech" | "intent" | "engine" | "options" | "prompt" | "info" | "status" | "end" | "error";

export interface Line {
  text: string;
  tone: Tone;
}

/** How a span looks: an accent from the palette, and type styles that survive NO_COLOR. */
export interface Style {
  accent?: Accent;
  bold?: boolean;
  italic?: boolean;
  dim?: boolean;
}

/**
 * Each tone in the Mill Table accent code (palette.ts): narration and plain values carry no accent,
 * engine lines are secondary text, your turn and the run's end are rust.
 */
export const TONE_STYLE: Record<Tone, Style> = {
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
};

/** Ink `Text` props for a style in a palette. */
export function textProps(style: Style, palette: Palette): { color?: string; bold?: boolean; italic?: boolean; dimColor?: boolean } {
  const color = style.accent ? palette[style.accent] : undefined;
  return {
    ...(color ? { color } : {}),
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    // Secondary text dims itself when there is no colour to mark it.
    ...(style.dim || (style.accent === "hint" && !color) ? { dimColor: true } : {}),
  };
}

const name = (handle: string) => handle.charAt(0).toUpperCase() + handle.slice(1);

/** The lines one event adds to the screen. */
export function eventLines(event: TableEvent): Line[] {
  switch (event.kind) {
    case "narration":
      return [{ tone: "dm", text: `${event.speaker === "dm" ? "DM" : name(event.speaker)}${event.to ? " (to you)" : ""}: ${event.text}` }];
    case "speech":
      return [{ tone: "speech", text: `${name(event.speaker)} says: ${event.text}` }];
    case "intent":
      return [{ tone: "intent", text: `${name(event.speaker)}: ${event.text}` }];
    case "engine":
      return [{ tone: "engine", text: event.roll ? `  [${event.roll}] ${event.text}` : `  ${event.text}` }];
    case "options":
      return [...(event.title ? [{ tone: "options" as const, text: `${event.title}:` }] : []), ...event.lines.map((text) => ({ tone: "options" as const, text: `  ${text}` }))];
    case "reaction":
      return [
        { tone: "prompt", text: `Reaction: ${event.summary}` },
        ...event.options.map((option, i) => ({ tone: "options" as const, text: `  ${i + 1}. ${option}` })),
      ];
    case "question":
      return [{ tone: "dm", text: `DM asks you: ${event.text}` }];
    case "info":
      return [{ tone: "info", text: `${event.title}:` }, ...event.text.split("\n").map((text) => ({ tone: "info" as const, text: `  ${text}` }))];
    case "status":
      return [{ tone: "status", text: `— ${event.text}` }];
    case "end":
      return [{ tone: "end", text: `The run is over: ${event.text}` }];
    case "situation":
      // The panel draws it; nothing goes into the log.
      return [];
  }
}
