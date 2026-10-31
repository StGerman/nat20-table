// Streaming spike (M10 S4, AGT-66). Run on Stas's Mac under his Claude login, never in CI or a
// cloud session: `npm run spike:partial`. One DM-like session with one `narrate` MCP tool and the
// SDK's partial messages on; it asks for three narrations and prints, per turn, each growing
// fragment of the tool's input with its time, what the seat's preview would show, and a verdict:
// whether fragments arrived for the MCP tool at all, in order (each extends the last), and how much
// sooner the first readable sentence came than the finished call. The preview stays off by default
// (`--preview`) until this prints PASS.
import { z } from "zod";
import { AgentSession, reply, seatTool } from "../src/agents/sdk-session.ts";
import { previewFor } from "../src/agents/preview.ts";
import { refuseApiKey } from "../src/play/run.ts";

refuseApiKey();
const model = process.argv.includes("--sonnet") ? "claude-sonnet-5-5" : "claude-opus-5-5";
let sent = 0;
let fragments: Array<{ ms: number; json: string }> = [];
let finished = 0;
// The DM's own narrate shape: `to` required and first, "table" for everyone.
const narrate = seatTool("narrate", 'Say this to the table, or to one character only. Give `to` first: "table" for everyone, or one character\'s handle.', { to: z.string().describe('"table" for everyone, or one character\'s handle for that character only.'), text: z.string() }, async () => {
  finished = performance.now() - sent;
  return reply("said");
});
const session = new AgentSession({
  agent: "dm",
  choice: { model, effort: "low" },
  systemPrompt: "You are a Dungeon Master. Answer every message with exactly one narrate call of two or three sentences, then stop.",
  tools: [narrate],
  turnTimeoutMs: 60_000,
  onPartial: (tool, json) => {
    if (tool === "narrate") fragments.push({ ms: Math.round(performance.now() - sent), json });
  },
});
let pass = true;
for (const ask of ["The party reaches the mill gate at dusk.", "A goblin shrieks from the roof.", "Tell only maren (to: maren) that she hears a child crying."]) {
  fragments = [];
  finished = 0;
  sent = performance.now();
  await session.turn(ask, "narrate");
  const ordered = fragments.every((f, i) => i === 0 || f.json.startsWith(fragments[i - 1].json));
  const readable = fragments.find((f) => previewFor(f.json, "bren"));
  console.log(`\n> ${ask}`);
  for (const f of fragments) console.log(`  ${String(f.ms).padStart(6)} ms  ${JSON.stringify(f.json.slice(-60))}  preview: ${JSON.stringify(previewFor(f.json, "bren") ?? null)}`);
  console.log(`  fragments ${fragments.length}, in order ${ordered}, first readable at ${readable?.ms ?? "never"} ms, call finished at ${Math.round(finished)} ms`);
  const toMaren = ask.includes("to: maren");
  if (fragments.length < 2 || !ordered || (!toMaren && !readable) || (toMaren && readable)) pass = false;
}
await session.close();
console.log(`\n${pass ? "PASS" : "FAIL"}: ${pass ? "fragments stream in order for the MCP tool, and a line to maren never previews at bren's seat" : "see above"}`);
process.exit(pass ? 0 : 1);
