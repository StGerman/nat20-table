// The action card's words for the two lines that are the seat's own, not engine options (AGT-70):
// Move… and End turn. Every engine option brings its own text, the rule's `summary` from core
// (contract 1.0.0-dev.38), so no rule text lives here. Also the cost in the turn budget's words.
import type { ActionCost } from "@nat20-table/engine-client";
import { UI_WORDS, type UiWords } from "./words.ts";

/** The card's text for a choice: the engine's summary for an option, ours for Move and End turn. */
export function cardText(about: { id: string; summary?: string }, ui: UiWords = UI_WORDS.en): string | undefined {
  return about.summary ?? (about.id === "move" ? ui.panel.moveCard : about.id === "end_turn" ? ui.panel.endTurnCard : undefined);
}

/** What an option costs, in the turn budget's words: "Action", "Bonus Action · level 1 slot". */
export function costText(cost: ActionCost | undefined, ui: UiWords = UI_WORDS.en): string | undefined {
  if (!cost) return undefined;
  const p = ui.panel;
  const parts = [
    ...(cost.action > 0 ? [p.action] : []),
    ...(cost.bonus_action > 0 ? [p.bonusAction] : []),
    ...(cost.reaction > 0 ? [p.reactionWord] : []),
    ...(cost.spell_slot ? [p.slot(cost.spell_slot)] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** The seat's own line ids, for tests. */
export const SEAT_LINE_IDS = ["move", "end_turn"];
