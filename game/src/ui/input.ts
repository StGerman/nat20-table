// What the human typed, as the loop takes it (M6 spec §3.4, TASKS.md AGT-7): a slash command, an
// option number, a reaction answer, or free text the DM maps. Pure, so the terminal UI and its
// tests read input the same way.
import type { HumanPrompt, PlayerIntent } from "../table/types.ts";
import { UI_WORDS, type UiWords } from "../table/words.ts";

/** The slash commands the loop answers (scope §4.5). */
export const COMMANDS = ["sheet", "where", "map", "options", "log", "usage", "pause", "suggest", "quit"] as const;
export type CommandName = (typeof COMMANDS)[number];

/**
 * What each command does: the one registry `/help` and the slash-command picker read (AGT-82). Its
 * order is theirs: /options and /sheet first, the two a first-time player needs (scope §6.6).
 */
export const COMMAND_HELP: Record<CommandName | "help" | "panel", string> = UI_WORDS.en.commandHelp;

/** A typed line as the seat reads it: an intent for the loop, help for the screen, or a mistake. */
export type Typed = { kind: "intent"; intent: PlayerIntent } | { kind: "help" } | { kind: "panel" } | { kind: "error"; text: string } | { kind: "empty" };

/**
 * Reads one typed line for a prompt (undefined: the table isn't waiting on the human). A number is
 * an option, or a reaction's option; y or n answers a reaction; anything else is words for the DM.
 * An answer to the DM's question is always words, even a number.
 */
export function readLine(line: string, prompt: HumanPrompt | undefined, ui: UiWords = UI_WORDS.en): Typed {
  const text = line.trim();
  if (!text) return { kind: "empty" };
  if (text.startsWith("/")) {
    const name = text.slice(1).split(/\s+/)[0].toLowerCase();
    if (name === "help" || name === "?") return { kind: "help" };
    if (name === "panel") return { kind: "panel" };
    if ((COMMANDS as readonly string[]).includes(name)) return { kind: "intent", intent: { kind: "command", name: name as CommandName } };
    return { kind: "error", text: ui.noCommand(name, Object.keys(COMMAND_HELP).map((c) => `/${c}`).join(" ")) };
  }
  if (!prompt) return { kind: "error", text: ui.busy };
  if (prompt.kind === "paused") return { kind: "error", text: ui.pausedTyped };
  if (prompt.kind === "reaction") {
    // да and нет too, for a table played in Russian (AGT-48).
    if (/^(y|yes|д|да)$/i.test(text)) return { kind: "intent", intent: { kind: "reaction", take: true } };
    if (/^(n|no|н|нет)$/i.test(text)) return { kind: "intent", intent: { kind: "reaction", take: false } };
    if (/^\d+$/.test(text)) return { kind: "intent", intent: { kind: "option", number: Number(text) } };
    return { kind: "error", text: ui.answerYesNo };
  }
  if (prompt.kind !== "answer" && /^\d+$/.test(text)) return { kind: "intent", intent: { kind: "option", number: Number(text) } };
  return { kind: "intent", intent: { kind: "text", text } };
}

/** What the prompt line says while the table waits on the human. */
export function promptHint(prompt: HumanPrompt, handle: string, ui: UiWords = UI_WORDS.en, name = handle.charAt(0).toUpperCase() + handle.slice(1)): string {
  const hint = ui.hint;
  switch (prompt.kind) {
    case "combat_turn":
      return hint.combatTurn(name);
    case "reaction":
      return hint.reaction;
    case "explore":
      return hint.explore(name);
    case "answer":
      return hint.answer;
    case "pick":
      return hint.pick;
    case "paused":
      return hint.paused;
    case "surrender":
      return hint.surrender;
    case "card":
      return prompt.line ?? hint.card;
    case "level_up":
      return hint.levelUp;
    case "road":
      return hint.road;
  }
}
