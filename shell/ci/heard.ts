// Reads what the UI test left (Tour/Tour.swift `testEveryKindOfAsk`) and fails on what the shell
// must not do (SwiftUI shell design §3):
// - every frame the host heard is a message a page handed the shell, byte for byte, or the shell's
//   own `resume`; nothing else is written in Swift;
// - every kind of ask was answered and the recording was played to its end;
// - the message lost with the socket never reached the host, and its ask was answered once it was
//   offered again;
// - a socket that came back asked from the pages' place in the story, and after the story's page
//   was loaded again, from 0;
// - the host's second window took the seat and lost it back with the replaced code.
// usage: node heard.ts <what the host did, .jsonl> <what the pages handed over, sent.jsonl>
import { readFileSync } from "node:fs";
import { CLOSE_REPLACED } from "../../game/src/seat-wire/messages.ts";
import { ASK_KINDS } from "../../game/test/page-wires.ts";

const [didFile, sentFile] = process.argv.slice(2);
if (!didFile || !sentFile) {
  console.error("usage: node heard.ts <what the host did, .jsonl> <sent.jsonl>");
  process.exit(2);
}
const rows = (file: string) => readFileSync(file, "utf8").split("\n").filter((l) => l !== "");
const did = rows(didFile).map((l) => JSON.parse(l) as { heard?: string; answered?: string; played?: boolean; took?: boolean; lost?: number });
const sent = rows(sentFile);
const heard = did.flatMap((d) => (d.heard !== undefined ? [d.heard] : []));

const wrong: string[] = [];
const left = [...sent];
const resumes: number[] = [];
for (const frame of heard) {
  const resume = /^\{"type":"resume","seq":(\d+)\}$/.exec(frame);
  if (resume) {
    resumes.push(Number(resume[1]));
    continue;
  }
  const at = left.indexOf(frame);
  if (at < 0) wrong.push(`the host heard a line no page handed over: ${frame}`);
  else left.splice(at, 1);
}

const kinds = new Set(did.flatMap((d) => (d.answered ? [d.answered] : [])));
const unanswered = ASK_KINDS.filter((k) => !kinds.has(k));
if (unanswered.length > 0) wrong.push(`kinds of ask never answered: ${unanswered.join(", ")}`);
if (!did.some((d) => d.played)) wrong.push("the recording was not played to its end");

// The lost message: handed over by a page, never heard, and its ask answered by a later one.
const id = (line: string) => (JSON.parse(line) as { id?: string }).id;
if (left.length === 0) wrong.push("no message was lost with the socket: the drop did not happen");
for (const lost of left) {
  if (!heard.some((frame) => !frame.startsWith('{"type":"resume"') && id(frame) === id(lost))) wrong.push(`a lost message's ask was never answered: ${lost}`);
}

// The first socket, the one after the drop, the one after the page was loaded again, and «Играть здесь»:
// one more is a socket the shell dropped while it was alive.
if (resumes.length !== 4) wrong.push(`${resumes.length} resumes heard, 4 expected: ${resumes.join(", ")}`);
if (resumes[0] !== 0) wrong.push(`the first resume asked from ${resumes[0]}, not 0`);
if (!resumes.slice(1).some((n) => n > 0)) wrong.push("no socket that came back asked from the pages' place in the story");
if (!resumes.slice(1).some((n) => n === 0)) wrong.push("no resume from 0 after the story's page was loaded again");

if (!did.some((d) => d.took)) wrong.push("the host's second window never took the seat");
if (!did.some((d) => d.lost === CLOSE_REPLACED)) wrong.push(`the host's second window was not closed with ${CLOSE_REPLACED} when the shell took the seat back`);

console.log(`heard: ${heard.length} frames, ${resumes.length} of them resumes (${resumes.join(", ")}); ${sent.length} messages handed over by the pages, ${left.length} lost with the socket; kinds answered: ${[...kinds].sort().join(", ")}`);
if (wrong.length > 0) {
  for (const w of wrong) console.error(`heard: ${w}`);
  process.exit(1);
}
