// A table with no engine and no model, for the shell's live socket: the real `WebSeat` (token,
// resume, asks by id) shown a recorded run's events in order. At each ask it waits for whatever the
// shell answers, then plays on, so a press in the app is seen to cross a real socket and come back
// as the next stretch of the story. The answer is not checked against the recording.
// usage: node replay-host.ts <seat-wire.jsonl> <file to write the link to> [language]
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HostMessageSchema } from "../../../src/seat-wire/schema.ts";
import { WebSeat } from "../../../src/seat-wire/web-seat.ts";
import type { HumanPrompt, SuggestUpdate, TableEvent } from "../../../src/table/types.ts";

const [fixture, linkFile, language = "ru"] = process.argv.slice(2);
if (!fixture || !linkFile) {
  console.error("usage: node replay-host.ts <seat-wire.jsonl> <file to write the link to> [language]");
  process.exit(2);
}
const lines = readFileSync(fixture, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as { seq?: number; seat: string; event?: unknown; message?: unknown });
const handle = lines[0]?.seat ?? "bren";
const runDir = mkdtempSync(path.join(tmpdir(), "replay-host-"));
const seat = new WebSeat(handle, { runDir, run: path.basename(fixture), language: language === "ru" ? "ru" : "en", party: ["bren", "torva", "maren", "ilsa"], origins: [], host: "0.0.0.0" });
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
      console.log(`replay-host: ask ${message.id} (${(message.prompt as { kind?: string }).kind}) waits for the shell`);
      const intent = await seat.ask(message.prompt as unknown as HumanPrompt);
      console.log(`replay-host: answered ${JSON.stringify(intent)}`);
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
// The shell may still be reading: the socket stays up until the job ends.
setInterval(() => undefined, 60_000);
