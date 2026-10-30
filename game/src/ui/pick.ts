// The pick list (M7 spec §4.2, TASKS.md AGT-35): before the terminal UI takes the screen, the human
// picks the character they play from the pack's party, by number. The others become AI players.
import { createInterface } from "node:readline/promises";
import type { Handle } from "@nat20-table/engine-client";
import { rosterLines, type RosterEntry } from "../play/run.ts";

/**
 * Prints the party and asks for a number until one names a character; Enter, or input that ends,
 * keeps `fallback`, the pack's default. Reads from `input` and writes to `output` (the terminal by default).
 */
export async function pickCharacter(
  roster: RosterEntry[],
  fallback: Handle,
  io: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream } = { input: process.stdin, output: process.stdout },
): Promise<Handle> {
  const rl = createInterface({ input: io.input, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  try {
    io.output.write(["Who do you play?", ...rosterLines(roster, fallback), ""].join("\n"));
    for (;;) {
      io.output.write(`Pick 1 to ${roster.length}, or Enter for ${roster.find((r) => r.handle === fallback)?.name ?? fallback}: `);
      const line = await lines.next();
      // Input that ends before a pick keeps the default.
      if (line.done) return fallback;
      const answer = line.value.trim();
      if (answer === "") return fallback;
      const picked = roster[Number(answer) - 1];
      if (/^\d+$/.test(answer) && picked) return picked.handle;
      io.output.write(`There is no ${answer} on the list.\n`);
    }
  } finally {
    rl.close();
    // Closing the interface pauses the input, and on a terminal the table screen's key listener
    // then never hears a key: the first prompt took none, Ctrl+C included (Stas's `play:demo`,
    // 2026-10-30, AGT-54). Resuming hands the keyboard on.
    io.input.resume();
  }
}
