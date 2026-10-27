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
 * letters, then if the player likes half a sentence of why. For ACT the intent is the first
 * sentence after the word, and the rest is the why, which is never declared («ACT: Марен
 * перевязывает Снитта. — Пусть будет должен.»); for the others everything after the word is the why.
 */
export function handAnswer(text: string): Hand {
  const m = ANSWER.exec(text);
  if (!m) return { kind: "unread", text: text.trim() };
  const word = m[1].toUpperCase();
  const rest = m[2].replace(/["”*]+\s*$/, "").trim();
  if (word === "ACT") {
    const [first, ...later] = rest.split("\n");
    const sentence = /^(.+?[.!?…]+)\s+(.+)$/s.exec(first.trim());
    const intent = (sentence ? sentence[1] : first).trim();
    const why = [sentence?.[2], ...later].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return intent ? { kind: "act", intent, why } : { kind: "unread", text: text.trim() };
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
 * A sentence that speaks to someone: a question or an exclamation, a second-person word (ты, твой,
 * вы, you), or a Russian verb in the second person singular («скажешь», «видишь»).
 */
const SPOKEN_TO = /[?!]|(?<![\p{L}\p{N}_])(?:ты|тебе|тебя|тобой|твой|твоя|твоё|твое|твои|твоего|твоей|твоих|вы|вам|вас|ваш|ваша|ваши|you|your|yours)(?![\p{L}\p{N}_])|\p{L}(?:ешь|ёшь|ишь)(?![\p{L}\p{N}_])/iu;

/**
 * Where `form` first stands in `text` as a whole word, ignoring case («Торве» in «скажи Торве», not
 * inside «Торвеля»), or -1. With `addressOnly`, only where it is spoken to: after the start of a
 * sentence, a quote, a dash or a comma and followed by a comma, `!` or `?` («Ильса, твой ход»,
 * «Брен, Торва, за мной!»), or closing a sentence after a comma («Что скажешь, Ильса.»), and only
 * in a sentence that speaks to someone (`SPOKEN_TO`). «Бертил берёт хлеб у Марен, долго молчит»,
 * «У ворот стоят Торва, Марен, Ильса» and «Ильса, присев у двери, читает табличку» tell about them,
 * and don't count.
 */
function findName(text: string, form: string, addressOnly: boolean): number {
  const name = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!addressOnly) {
    const m = new RegExp(`(?<!${NOT_WORD})${name}(?!${NOT_WORD})`, "iu").exec(text);
    return m ? m.index : -1;
  }
  const address = new RegExp(`(?:^|[,.!?…:;—–«"“(])\\s*${name}(?=\\s*[,!?])|,\\s*${name}(?=\\s*(?:[.!?…»”"]|$))`, "iu");
  for (const sentence of text.matchAll(/[^.!?…]+[.!?…]*["»”]*/gu)) {
    if (!SPOKEN_TO.test(sentence[0])) continue;
    const m = address.exec(sentence[0]);
    if (m) return sentence.index! + m.index;
  }
  return -1;
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
