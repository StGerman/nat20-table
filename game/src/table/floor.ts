// Who takes the floor in a talk round out of combat (party talk §4.2 and §4.3, decision 0039,
// TASKS.md AGT-32). Pure functions: the loop reads the human's and the DM's lines, wakes the
// players, and asks these who goes first, what each raised hand says, and in which order the
// speakers go.
import type { Handle } from "@nat20-table/engine-client";

/** At most this many floor wakes follow each other in a talk round: named players and speakers together. */
export const FLOOR_BOUND = 3;

/** What a player answers a hand wake with: speak, speak and act, act without a word, or pass. */
export type Hand =
  | { kind: "speak"; why: string }
  | { kind: "both"; why: string }
  | { kind: "act"; intent: string; why: string }
  | { kind: "pass"; why: string }
  /** An answer that isn't one of the four: the player passes. */
  | { kind: "unread"; text: string };

const ANSWER = /^\s*["“*]*\s*(SPEAK|BOTH|ACT|PASS)\b["”*]*\s*[:.,\-–—]?\s*(.*)$/is;

/**
 * Reads a hand wake's answer: `SPEAK`, `BOTH`, `ACT: <what the character does>` or `PASS`, in Latin
 * letters, then if the player likes half a sentence of why. For ACT the rest of the first line is
 * the intent and later lines are the why; for the others everything after the word is the why.
 */
export function handAnswer(text: string): Hand {
  const m = ANSWER.exec(text);
  if (!m) return { kind: "unread", text: text.trim() };
  const word = m[1].toUpperCase();
  const rest = m[2].replace(/["”*]+\s*$/, "").trim();
  if (word === "ACT") {
    const [intent, ...why] = rest.split("\n");
    const line = intent.trim();
    return line ? { kind: "act", intent: line, why: why.join(" ").trim() } : { kind: "unread", text: text.trim() };
  }
  const why = rest.replace(/\s+/g, " ");
  return word === "SPEAK" ? { kind: "speak", why } : word === "BOTH" ? { kind: "both", why } : { kind: "pass", why };
}

/** A line the loop reads for names: the human's names anyone it mentions; the DM's only those it speaks to. */
export interface NamingLine {
  text: string;
  /** Only a name the line speaks to counts («Ильса, что скажешь?»), not one it tells about («Ильса читает»). */
  addressOnly?: boolean;
}

const NOT_WORD = "[\\p{L}\\p{N}_]";

/**
 * Where `form` first stands in `text` as a whole word, ignoring case («Торве» in «скажи Торве», not
 * inside «Торвеля»), or -1. With `addressOnly`, only where it is spoken to: after the start of a
 * sentence, a quote, a dash or a comma, and followed by a comma, `!` or `?` («Ильса, твой ход»,
 * «Брен, Торва, за мной!»), or closing a sentence after a comma («Что скажешь, Ильса.»). «Бертил
 * берёт хлеб у Марен, долго молчит» tells about Maren, and doesn't count.
 */
function findName(text: string, form: string, addressOnly: boolean): number {
  const name = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = addressOnly
    ? `(?:^|[,.!?…:;—–«"“(])\\s*${name}(?=\\s*[,!?])|,\\s*${name}(?=\\s*(?:[.!?…»”"]|$))`
    : `(?<!${NOT_WORD})${name}(?!${NOT_WORD})`;
  const m = new RegExp(pattern, "iu").exec(text);
  return m ? m.index : -1;
}

/**
 * The AI players named in `lines` (the human's line, then the DM's last narration), in the order
 * they are first named: earlier lines first, then by position. `names` gives each player's forms
 * (its handle, its card's name, and the pack's `names`, Russian cases included); a player missing
 * from `names` is matched by its handle.
 */
export function namedIn(lines: readonly NamingLine[], players: readonly Handle[], names: ReadonlyMap<Handle, readonly string[]>): Handle[] {
  const found: Array<{ handle: Handle; line: number; at: number }> = [];
  for (const handle of players) {
    const forms = names.get(handle) ?? [handle];
    for (const [i, line] of lines.entries()) {
      const at = Math.min(...forms.map((form) => findName(line.text, form, line.addressOnly ?? false)).filter((n) => n >= 0));
      if (Number.isFinite(at)) {
        found.push({ handle, line: i, at });
        break;
      }
    }
  }
  return found.sort((a, b) => a.line - b.line || a.at - b.at).map((f) => f.handle);
}

/**
 * The players who raised a hand to speak (SPEAK or BOTH), in seat order shifted by one each talk
 * round: the shift only breaks ties, it never decides who talks (party talk §4.2.6).
 */
export function speakingOrder(hands: ReadonlyMap<Handle, Hand>, seats: readonly Handle[], round: number): Handle[] {
  const n = seats.length;
  const shift = n === 0 ? 0 : ((round % n) + n) % n;
  const turned = [...seats.slice(shift), ...seats.slice(0, shift)];
  return turned.filter((handle) => {
    const kind = hands.get(handle)?.kind;
    return kind === "speak" || kind === "both";
  });
}
