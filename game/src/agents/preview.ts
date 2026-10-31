// The DM's narration as it is written (M10 S4, AGT-66): a preview for the human's seat while the
// model streams its `narrate` call, replaced by the guarded line when the tool runs. Read from the
// call's partial input JSON with a tolerant scan, not a JSON parse: the JSON is incomplete until the
// call ends. Nothing here is recorded; the transcript, the audit and the inboxes see only the
// finished line.
import type { Handle } from "@nat20-table/engine-client";

/** What the partial `narrate` input says so far. */
export interface PartialNarration {
  /** The first key written; `to` comes first in the tool's schema, so a line to one character says so before its text. */
  first?: string;
  /** The recipient, once its value is complete; `undefined` while it is absent or still streaming. */
  to?: string;
  /** Whether a `to` key has started at all. */
  hasTo: boolean;
  /** The text so far, unescaped; `undefined` before its value starts. */
  text?: string;
  /** Whether the text's closing quote has arrived. */
  textDone: boolean;
}

/** Reads a JSON string value starting just after its opening quote; stops at the end of input. */
function readString(json: string, from: number): { value: string; done: boolean } {
  let value = "";
  for (let i = from; i < json.length; i++) {
    const c = json[i];
    if (c === '"') return { value, done: true };
    if (c !== "\\") {
      value += c;
      continue;
    }
    const next = json[i + 1];
    if (next === undefined) break;
    const simple: Record<string, string> = { n: "\n", t: "\t", r: "", '"': '"', "\\": "\\", "/": "/", b: "", f: "" };
    if (next === "u") {
      const hex = json.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      value += String.fromCharCode(parseInt(hex, 16));
      i += 5;
    } else {
      value += simple[next] ?? next;
      i += 1;
    }
  }
  return { value, done: false };
}

export function partialNarration(json: string): PartialNarration {
  const first = /^\s*\{\s*"(\w+)"/.exec(json)?.[1];
  const toKey = /"to"\s*:\s*"/.exec(json);
  const to = toKey ? readString(json, toKey.index + toKey[0].length) : undefined;
  const textKey = /"text"\s*:\s*"/.exec(json);
  const text = textKey ? readString(json, textKey.index + textKey[0].length) : undefined;
  return {
    ...(first ? { first } : {}),
    ...(to?.done ? { to: to.value } : {}),
    hasTo: Boolean(toKey),
    ...(text ? { text: text.value } : {}),
    textDone: text?.done ?? false,
  };
}

/** The complete sentences of `text` so far: up to its last sentence end, or all of it once done. */
export function completeSentences(text: string, done: boolean): string {
  if (done) return text.trim();
  let end = -1;
  const re = /[.!?…](?:["»”)]*)(?=\s)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) end = m.index + m[0].length;
  return end > 0 ? text.slice(0, end).trim() : "";
}

/**
 * What the human's seat may show of a partial narration: its complete sentences, only once `to` has
 * streamed in full, first, and is "table" or `human`. Anything else shows nothing: a `to` naming
 * someone else or still streaming, and a line whose text comes first, since its `to` (required by
 * the tool) could still name another character (Rule 3).
 */
export function previewFor(json: string, human: Handle | undefined): string | undefined {
  const p = partialNarration(json);
  if (p.first !== "to" || p.to === undefined) return undefined;
  if (p.to !== "table" && p.to !== human) return undefined;
  const shown = p.text === undefined ? "" : completeSentences(p.text, p.textDone);
  return shown || undefined;
}
