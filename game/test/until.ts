// Waits on a frame predicate for the seat tests (AGT-76): one helper for every file that draws
// the seat on a fake terminal, instead of a fixed sleep or a cap tuned to an idle machine.
import assert from "node:assert/strict";

/**
 * Resolves once `ready()` holds, checking every 5 ms. The cap only bounds how long a real failure
 * takes to report: under a loaded `check:ts` (every test file at once on a laptop) a frame can
 * take seconds, so it is 15 s, and a timeout names the frame the test last saw (`seen`).
 */
export async function until(what: string, ready: () => boolean, seen?: () => string, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) assert.fail(`timed out waiting for ${what}${seen ? `; the last frame:\n${seen()}` : ""}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
