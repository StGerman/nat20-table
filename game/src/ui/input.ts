// What the human typed, as the loop takes it (M6 spec §3.4, TASKS.md AGT-7): a slash command, an
// option number, a reaction answer, or free text the DM maps. Pure, so the terminal UI and its
// tests read input the same way.
import type { HumanPrompt, PlayerIntent } from "../table/types.ts";

/** The slash commands the loop answers (scope §4.5). */
export const COMMANDS = ["sheet", "where", "options", "log", "usage", "pause", "quit"] as const;
export type CommandName = (typeof COMMANDS)[number];

/** What each command does, for `/help`. */
export const COMMAND_HELP: Record<CommandName | "help" | "panel", string> = {
  sheet: "your character sheet",
  where: "places and the creatures you can see, with distances",
  options: "your numbered options now",
  log: "the last engine lines, with their roll ids",
  usage: "tokens and API-equivalent cost so far, per agent",
  pause: "AI players wait until you type /pause again",
  quit: "end the run (the run folder keeps everything so far)",
  panel: "fold the situation panel to one line, or open it again",
  help: "this list",
};

/** A typed line as the seat reads it: an intent for the loop, help for the screen, or a mistake. */
export type Typed = { kind: "intent"; intent: PlayerIntent } | { kind: "help" } | { kind: "panel" } | { kind: "error"; text: string } | { kind: "empty" };

/**
 * Reads one typed line for a prompt (undefined: the table isn't waiting on the human). A number is
 * an option, or a reaction's option; y or n answers a reaction; anything else is words for the DM.
 * An answer to the DM's question is always words, even a number.
 */
export function readLine(line: string, prompt: HumanPrompt | undefined): Typed {
  const text = line.trim();
  if (!text) return { kind: "empty" };
  if (text.startsWith("/")) {
    const name = text.slice(1).split(/\s+/)[0].toLowerCase();
    if (name === "help" || name === "?") return { kind: "help" };
    if (name === "panel") return { kind: "panel" };
    if ((COMMANDS as readonly string[]).includes(name)) return { kind: "intent", intent: { kind: "command", name: name as CommandName } };
    return { kind: "error", text: `There is no /${name}. Commands: ${["help", "panel", ...COMMANDS].map((c) => `/${c}`).join(" ")}` };
  }
  if (!prompt) return { kind: "error", text: "The table is busy: wait for your prompt. A command typed now is answered when it comes." };
  if (prompt.kind === "paused") return { kind: "error", text: "Paused: only commands until /pause again." };
  if (prompt.kind === "reaction") {
    if (/^(y|yes)$/i.test(text)) return { kind: "intent", intent: { kind: "reaction", take: true } };
    if (/^(n|no)$/i.test(text)) return { kind: "intent", intent: { kind: "reaction", take: false } };
    if (/^\d+$/.test(text)) return { kind: "intent", intent: { kind: "option", number: Number(text) } };
    return { kind: "error", text: "Answer y or n, or the number of a reaction." };
  }
  if (prompt.kind !== "answer" && /^\d+$/.test(text)) return { kind: "intent", intent: { kind: "option", number: Number(text) } };
  return { kind: "intent", intent: { kind: "text", text } };
}

/** What the prompt line says while the table waits on the human. */
export function promptHint(prompt: HumanPrompt, handle: string): string {
  const name = handle.charAt(0).toUpperCase() + handle.slice(1);
  switch (prompt.kind) {
    case "combat_turn":
      return `Your turn: an option number, or what ${name} does in words. /options lists them again.`;
    case "reaction":
      return "React? y or n (or the reaction's number).";
    case "explore":
      return `What does ${name} do or say? Words, or a number from /options.`;
    case "answer":
      return "The DM asks you: answer in words.";
    case "pick":
      return "Pick a number from this list, or say what you do instead.";
    case "paused":
      return "Paused. Commands only; /pause goes on.";
    case "surrender":
      return "Accept the surrender (1), fight on (2), or say what you do.";
  }
}
