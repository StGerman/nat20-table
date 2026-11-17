/**
 * Who a DM line names (allies-in-fights design §6.1 rule N4, API-58): the roster people one of
 * whose listed forms stands in the line as a whole word. The loop sends them to the engine as a
 * `mention`, which places a person who is with the party.
 */

/** A roster person and every form the world file lists for their name. */
export interface RosterNames {
  id: string;
  names: readonly string[];
}

/** The ids of the roster people `text` names, in roster order. A form matches only as a whole word, in its own case. */
export function namedIn(text: string, roster: readonly RosterNames[]): string[] {
  return roster.filter((p) => p.names.some((form) => form && wholeWord(form).test(text))).map((p) => p.id);
}

function wholeWord(form: string): RegExp {
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u");
}
