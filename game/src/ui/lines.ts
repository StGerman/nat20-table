// How each TableEvent reads on the human's screen (M6 spec §3.4, AGT-7): styled lines, already
// projected for the human by the loop, so this only lays them out. Rolls show inline as the engine
// rendered them for the human's viewer, with their roll id (dice, total and outcome; no AC or DC).
import type { TableEvent } from "../table/types.ts";

/** Ink's named colours that read on both light and dark terminals. */
export type Tone = "dm" | "speech" | "intent" | "engine" | "options" | "prompt" | "info" | "status" | "end" | "error";

export interface Line {
  text: string;
  tone: Tone;
}

/** The terminal colour of each tone (Ink `Text` `color`); undefined is the terminal's own. */
export const TONE_COLOR: Record<Tone, string | undefined> = {
  dm: "cyan",
  speech: "yellow",
  intent: "yellow",
  engine: undefined,
  options: "green",
  prompt: "magenta",
  info: "blue",
  status: "gray",
  end: "red",
  error: "red",
};

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
  }
}
