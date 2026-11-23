// Makes a seat-wire for the kinds of ask the recorded runs never reach: a reaction, the Narrator's
// question, the pause, then a turn again and the end. It is the yard recording up to its first turn
// with made-up lines after it, in the shapes the table loop sends (game/src/table/loop.ts), for the
// replay host. The lines are not the Mill's: they are here to be pressed on, not read.
// usage: node asks-wire.mjs <yard.seat-wire.jsonl> <out.jsonl>
import { readFileSync, writeFileSync } from "node:fs";

const [from, to] = process.argv.slice(2);
const lines = readFileSync(from, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
const first = lines.findIndex((l) => l.message?.type === "ask");
const head = lines.slice(0, first);
const seat = head[0].seat;
const options = head.findLast((l) => l.event?.kind === "options");
const event = (e) => ({ seat, event: e });
const ask = (kind) => ({ seat, message: { type: "ask", id: "-", prompt: { kind } } });
const out = [
  ...head,
  event({ kind: "reaction", summary: "можно ответить: волк 3.", options: ["Удар длинным мечом"] }),
  ask("reaction"),
  event({ kind: "narration", speaker: "dm", text: "The wolf turns from you and the blade follows it." }),
  event({ kind: "question", text: "A goblin drops its knife and lifts its hands. What does Bren do with it?" }),
  ask("answer"),
  event({ kind: "narration", speaker: "dm", text: "The goblin sits down in the mud, hands on its head." }),
  event({ kind: "status", text: "Пауза. Наберите /pause, чтобы продолжить." }),
  ask("paused"),
  event({ kind: "status", text: "Игра идёт дальше." }),
  options,
  ask("combat_turn"),
  event({ kind: "end", text: "The yard is quiet. The run is over." }),
];
writeFileSync(to, out.map((l) => JSON.stringify(l)).join("\n") + "\n");
console.log(`asks-wire: ${out.length} lines, ${out.length - head.length} of them made up`);
