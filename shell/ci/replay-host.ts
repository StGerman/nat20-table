// A table with no engine and no model, for the shell's live socket: the real `WebSeat` (token,
// resume, asks by id) shown a recorded run's events in order. At each ask it waits for whatever the
// shell answers, then plays on, so a press in the app is seen to cross a real socket and come back
// as the next stretch of the story. The answer is not checked against the recording.
//
// `every-ask` in place of a file is the wire that holds every kind of ask (game/test/page-wires.ts,
// AGT-153). With a fourth argument the host keeps what it did in that file, one JSON object a line:
// each frame the shell sent as it came (`heard`), each ask and its answer, the end. `ci/heard.mjs`
// reads it. With `take-seat` as the fifth, a second window of its own sits down once the recording
// is played out, so the shell is closed as a replaced window is.
// usage: node replay-host.ts <seat-wire.jsonl | every-ask> <file to write the link to> [language] [what the host did, .jsonl] [take-seat]
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { everyAsk } from "../../game/test/page-wires.ts";
import { HostMessageSchema } from "../../game/src/seat-wire/schema.ts";
import { WebSeat } from "../../game/src/seat-wire/web-seat.ts";
import type { HumanPrompt, SuggestUpdate, TableEvent } from "../../game/src/table/types.ts";

const [fixture, linkFile, language = "ru", didFile, after] = process.argv.slice(2);
if (!fixture || !linkFile) {
  console.error("usage: node replay-host.ts <seat-wire.jsonl | every-ask> <file to write the link to> [language] [what the host did, .jsonl] [take-seat]");
  process.exit(2);
}
type Line = { seq?: number; seat?: string; event?: unknown; message?: unknown };
const lines: Line[] =
  fixture === "every-ask"
    ? everyAsk()
    : readFileSync(fixture, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l) as Line);
const did = (what: Record<string, unknown>) => {
  if (didFile) appendFileSync(didFile, JSON.stringify(what) + "\n");
};
if (didFile) writeFileSync(didFile, "");
const handle = lines[0]?.seat ?? "bren";
const runDir = mkdtempSync(path.join(tmpdir(), "replay-host-"));
const seat = new WebSeat(handle, { runDir, run: path.basename(fixture), language: language === "ru" ? "ru" : "en", party: ["bren", "torva", "maren", "ilsa"], origins: [], host: "0.0.0.0", heard: (frame) => did({ heard: frame }) });
const { port, token } = await seat.listen();
writeFileSync(linkFile, `ws://127.0.0.1:${port}/?token=${token}\n`);
console.log(`replay-host: ${lines.length} lines of ${path.basename(fixture)} on port ${port}`);

for (const line of lines) {
  if (line.event !== undefined) {
    seat.show(line.event as TableEvent);
    continue;
  }
  const message = HostMessageSchema.parse(line.message);
  switch (message.type) {
    case "ask": {
      const kind = (message.prompt as { kind?: string }).kind;
      console.log(`replay-host: ask ${message.id} (${kind}) waits for the shell`);
      const intent = await seat.ask(message.prompt as unknown as HumanPrompt);
      console.log(`replay-host: answered ${JSON.stringify(intent)}`);
      did({ answered: kind, intent });
      if (intent.kind === "command" && intent.name === "quit") {
        await seat.close();
        process.exit(0);
      }
      break;
    }
    case "busy":
      seat.busy(message.on);
      break;
    case "preview":
      seat.preview(message.text);
      break;
    case "unnarrated":
      seat.unnarrated();
      break;
    case "answering":
      seat.answering(message.on);
      break;
    case "suggest":
      seat.suggest((message.state === "rows" ? { kind: "rows", rows: message.rows } : { kind: message.state }) as unknown as SuggestUpdate);
      break;
    default:
      break;
  }
}
console.log("replay-host: the recording is played out");
did({ played: true });
if (after === "take-seat") {
  // A second window with the same token, as a Mac window opened beside the phone would be: the seat
  // closes the shell's socket with its replaced code. When the shell takes the seat back, this one
  // is closed the same way and stays closed.
  setTimeout(() => {
    const other = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`);
    other.onopen = () => {
      console.log("replay-host: a second window took the seat");
      did({ took: true });
    };
    other.onclose = (e) => {
      console.log(`replay-host: the second window was closed with ${e.code}`);
      did({ lost: e.code });
    };
  }, 3000);
}
// The shell may still be reading: the socket stays up until the job ends.
setInterval(() => undefined, 60_000);
