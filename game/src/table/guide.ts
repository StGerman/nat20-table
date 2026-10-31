// The action card's words for the two lines that are the seat's own, not engine options (AGT-70):
// Move… and End turn. Every engine option brings its own text, the rule's `summary` from core
// (contract 1.0.0-dev.38), so no rule text lives here. Also the cost in the turn budget's words.
import type { ActionCost } from "@nat20-table/engine-client";

/** What the seat's own lines do, by the id `buildChoices` gives them. */
const SEAT_LINES: Record<string, string> = {
  move: "Walk next to a creature or to a place. Leaving a foe's reach lets it make an opportunity attack, unless you took Disengage.",
  end_turn: "End your turn. Whatever you didn't use is lost; your reaction comes back at the start of your next turn.",
};

/** The card's text for a choice: the engine's summary for an option, ours for Move and End turn. */
export function cardText(about: { id: string; summary?: string }): string | undefined {
  return about.summary ?? SEAT_LINES[about.id];
}

/** What an option costs, in the turn budget's words: "Action", "Bonus Action · level 1 slot". */
export function costText(cost: ActionCost | undefined): string | undefined {
  if (!cost) return undefined;
  const parts = [
    ...(cost.action > 0 ? ["Action"] : []),
    ...(cost.bonus_action > 0 ? ["Bonus Action"] : []),
    ...(cost.reaction > 0 ? ["Reaction"] : []),
    ...(cost.spell_slot ? [`level ${cost.spell_slot} slot`] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** The seat's own line ids, for tests. */
export const SEAT_LINE_IDS = Object.keys(SEAT_LINES);
