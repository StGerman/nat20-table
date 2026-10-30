// Who takes the floor in a talk round out of combat (party talk §4.2 to §4.4, decisions 0039,
// 0040 and 0049, TASKS.md AGT-32, AGT-33, AGT-55). Pure functions: the loop reads the human's and
// the DM's lines, wakes the players, and asks these who goes first, what each raised hand says, in
// which order the speakers go, and whom a line spoken to a companion hands the floor to.
import type { Handle } from "@nat20-table/engine-client";

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
 * вы, you), or a Russian verb in the second person singular («скажешь», «видишь»). The verb needs
 * two letters before its ending, so «лишь» and «тишь» don't count.
 */
const SPOKEN_TO = /[?!]|(?<![\p{L}\p{N}_])(?:ты|тебе|тебя|тобой|твой|твоя|твоё|твое|твои|твоего|твоей|твоих|вы|вам|вас|ваш|ваша|ваши|you|your|yours)(?![\p{L}\p{N}_])|\p{L}{2}(?:ешь|ёшь|ишь)(?![\p{L}\p{N}_])/iu;

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

/** A line an AI player spoke to a companion with `say`'s `to` (party talk §4.4, decision 0040). */
export interface Address {
  from: Handle;
  to: Handle;
}

/** The address that made a round's hand-off; `raised` when its addressee still had a hand up. */
export type HandedOff = Address & { raised: boolean };

/** The rest of a talk round after a floor wake's addresses (`handOff`). */
export interface AfterAddresses {
  /** The raised hands still to speak, in order; a moved addressee is first. */
  queue: Handle[];
  /** The round's one hand-off, when these addresses made it: its addressee has the floor next. */
  handedTo?: HandedOff;
  /** Addressees the hand-off didn't reach and who don't speak this round: they have the floor first next round. */
  carried: Handle[];
}

/**
 * What the addresses made in one floor wake do to the rest of the round (party talk §4.4, decision
 * 0040). Only an AI player in `players` is ever handed the floor; the human's character hears its
 * line and nobody waits for it. The round has one hand-off, made by its first address, whatever
 * its form: an addressee whose hand is still up moves to the front of `queue`, and one with no
 * hand up goes to the front for a floor wake of its own. An address after the hand-off is used is
 * carried to the next round, unless its addressee still speaks in this one.
 */
export function handOff(addresses: readonly Address[], queue: readonly Handle[], players: readonly Handle[], used: boolean): AfterAddresses {
  const rest = [...queue];
  const carried: Handle[] = [];
  let handedTo: HandedOff | undefined;
  for (const address of addresses) {
    if (!players.includes(address.to) || address.to === address.from) continue;
    const raised = rest.includes(address.to);
    if (!used) {
      used = true;
      handedTo = { ...address, raised };
      if (raised) rest.splice(rest.indexOf(address.to), 1);
      rest.unshift(address.to);
    } else if (!raised && !carried.includes(address.to)) {
      carried.push(address.to);
    }
  }
  return { queue: rest, ...(handedTo ? { handedTo } : {}), carried };
}
