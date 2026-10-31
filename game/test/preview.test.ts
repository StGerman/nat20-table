// The DM's narration preview (M10 S4, AGT-66): what a partial `narrate` input shows the human's
// seat, and how a session hands the growing input to its listener. No model is called.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { completeSentences, partialNarration, previewFor } from "../src/agents/preview.ts";
import { ModelDm } from "../src/agents/dm.ts";
import { REPO } from "../src/engine.ts";
import { readPack } from "../src/pack/read.ts";
import { InkSeat } from "../src/ui/ink-seat.ts";
import { AgentSession, reply, seatTool, sessionOptions } from "../src/agents/sdk-session.ts";

test("a partial narrate input shows its complete sentences, for the table or the human only", () => {
  assert.equal(previewFor('{"to":"table","text":"The gate creaks. A goblin', "bren"), "The gate creaks.");
  assert.equal(previewFor('{"to":"table","text":"The gate creaks', "bren"), undefined);
  assert.equal(previewFor('{"to":"table","text":"The gate creaks open."}', "bren"), "The gate creaks open.");
  assert.equal(previewFor('{"to":"table","text":"He says \\"Run!\\" and runs. Then', "bren"), 'He says "Run!" and runs.');
  // Text before `to`: its `to` could still name another character, so nothing shows (Rule 3).
  assert.equal(previewFor('{"text":"The gate creaks. A goblin', "bren"), undefined);
  // A line to one character: nothing until its `to` is known, and only for the human.
  assert.equal(previewFor('{"to":"mar', "bren"), undefined);
  assert.equal(previewFor('{"to":"maren","text":"You hear a child. She', "bren"), undefined);
  assert.equal(previewFor('{"to":"bren","text":"You hear a child. She', "bren"), "You hear a child.");
  // A `to` after the text, against the schema's order, takes the preview back.
  assert.equal(previewFor('{"text":"You hear a child. ","to":"', "bren"), undefined);
  assert.equal(previewFor("", "bren"), undefined);
});

test("the scan reads escapes and an unfinished value", () => {
  assert.deepEqual(partialNarration('{"to":"bren","text":"Line\\nnext \\u00e9'), { first: "to", to: "bren", hasTo: true, text: "Line\nnext é", textDone: false });
  assert.equal(completeSentences("One. Two? Three", false), "One. Two?");
  assert.equal(completeSentences("Он вошёл… Тишина", false), "Он вошёл…");
});

test("a session with a partial listener turns on partial messages and hands it each growing tool input", async () => {
  const narrate = seatTool("narrate", "n", { text: z.string() }, async () => reply("said"));
  const heard: Array<[string, string]> = [];
  const config = { agent: "dm", choice: { model: "claude-sonnet-5-5", effort: "low" as const }, systemPrompt: "p", tools: [narrate], cwd: "/empty", onPartial: (tool: string, json: string) => heard.push([tool, json]) };
  assert.equal(sessionOptions(config, "/empty").includePartialMessages, true);
  assert.equal(sessionOptions({ ...config, onPartial: undefined }, "/empty").includePartialMessages, undefined);
  const stream = (event: object) => ({ type: "stream_event", parent_tool_use_id: null, event });
  const query = (({ prompt }: { prompt: AsyncIterable<SDKUserMessage> }) => {
    async function* run(): AsyncGenerator<SDKMessage> {
      for await (const message of prompt) {
        yield stream({ type: "message_start" }) as never;
        yield stream({ type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "mcp__table__narrate" } }) as never;
        yield stream({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"text":"Dusk' } }) as never;
        yield stream({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: ' falls."}' } }) as never;
        yield { type: "result", subtype: "success", is_error: false, result: "", user_message_uuid: message.uuid } as never;
      }
    }
    return Object.assign(run(), { interrupt: async () => undefined });
  }) as never;
  const s = new AgentSession({ ...config, query });
  await s.turn("go", "narrate");
  assert.deepEqual(heard, [["narrate", '{"text":"Dusk'], ["narrate", '{"text":"Dusk falls."}']]);
  await s.close();
});

test("the DM shows the seat only a narrate call's readable part, once per change, and only with a preview", () => {
  const pack = readPack(path.join(REPO, "scenarios/the_silent_mill"));
  const shown: Array<string | undefined> = [];
  const dm = new ModelDm({ pack, human: "bren", players: ["maren"], choice: { model: "claude-sonnet-5-5", effort: "low" }, preview: (t) => shown.push(t) });
  const onPartial = dm.sessionConfig().onPartial!;
  onPartial("narrate", '{"to":"table","text":"Dusk falls. The');
  onPartial("narrate", '{"to":"table","text":"Dusk falls. The gate');
  onPartial("request_check", '{"actor":"bren"');
  onPartial("narrate", '{"to":"table","text":"Dusk falls. The gate creaks. ');
  assert.deepEqual(shown, ["Dusk falls.", "Dusk falls. The gate creaks."]);
  const plain = new ModelDm({ pack, human: "bren", players: ["maren"], choice: { model: "claude-sonnet-5-5", effort: "low" } });
  assert.equal(plain.sessionConfig().onPartial, undefined, "off without a preview");
});

test("the terminal seat shows the preview dim until the narration comes", () => {
  const seat = new InkSeat("bren", { animate: false });
  seat.preview("Dusk falls.");
  assert.equal(seat.getView().preview, "Dusk falls.");
  seat.show({ kind: "narration", speaker: "dm", text: "Dusk falls over the mill." });
  assert.equal(seat.getView().preview, undefined);
});
