// Shared test setup: a real seeded engine on the server's test scenes and a table around it.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GameEngine, REPO } from "../src/engine.ts";
import { ScriptedSeat } from "../src/table/scripted.ts";
import { TableState, type TextGuard } from "../src/table/state.ts";
import { Transcript } from "../src/table/transcript.ts";

/** The engine's own test scenes, used as a pack. */
export const TEST_PACK = path.join(REPO, "crates/nat20-api-server/data");

export interface TestTable {
  table: TableState;
  engine: GameEngine;
  seat: ScriptedSeat;
  runDir: string;
  /** The requests the engine received, in order. */
  requests(): Array<Record<string, unknown>>;
  close(): void;
}

export async function testTable(options: {
  seed: number;
  /** A scenario pack; the engine's test scenes by default. */
  pack?: string;
  human?: string;
  players?: string[];
  seat?: ScriptedSeat;
  narrationGuard?: TextGuard;
  speechGuard?: TextGuard;
  /** Guards built on the started engine (the narration guard reads its roll ids), as the run commands do. */
  guards?: (engine: GameEngine) => { narrationGuard: TextGuard; speechGuard: TextGuard };
}): Promise<TestTable> {
  const runDir = mkdtempSync(path.join(tmpdir(), "table-"));
  const engine = await GameEngine.start({ pack: options.pack ?? TEST_PACK, runDir, seed: options.seed });
  const human = options.human ?? "bren";
  const seat = options.seat ?? new ScriptedSeat(human);
  const table = new TableState({
    engine,
    human,
    players: options.players ?? ["torva", "maren", "ilsa"],
    seat,
    transcript: new Transcript(path.join(runDir, "transcript.jsonl"), () => engine.logHead, () => "t"),
    inputsFile: path.join(runDir, "inputs.jsonl"),
    narrationGuard: options.narrationGuard,
    speechGuard: options.speechGuard,
    ...options.guards?.(engine),
  });
  return {
    table,
    engine,
    seat,
    runDir,
    requests: () =>
      readFileSync(path.join(runDir, "engine-log.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).request),
    close: () => engine.close(),
  };
}
