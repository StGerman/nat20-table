// The card bench (AGT-123, decision 0084, `docs/design/card-bench.md`): `npm run play:card -- --card
// ID --pack PACK --lines FILE` puts one card of a campaign pack on the table of a real contract,
// hands it to the live DM and types the file's lines at the human's seat, one for each time the
// card asks. Every bench run plays a fresh temporary copy of the pack whose decks hold that card
// alone (`bench.ts`); a line that settles the card ends the bench run, and the lines left start a
// fresh one. When the lines run out with the card waiting, the bench stops: it never picks a number.
// `--roster NAME` plays a copy of a saved party, for a card that reads deeds; `--seat ink` lets a
// person type instead of the file. Every other setting is a play command's (`settings.ts`).
// The live DM runs on Stas's Mac under his Claude login (decision 0036); `--dm scripted` plays the
// same walk with no model, in English. The run itself is in driver.ts.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO } from "../paths.ts";
import { benchSeat, votesOwnMove, type BenchSeatLog } from "../table/scripted.ts";
import { BenchError, benchLines, benchPack, benchPlan, benchRoster, packsReaching, savedParty, type BenchLines } from "./bench.ts";
import { npmCommand, playRun } from "./driver.ts";
import { resolveSettings, SettingError, SETTINGS } from "./settings.ts";

const USAGE = "npm run play:card -- --card ID --pack PACK --lines FILE [--roster NAME] [--seat ink]";

/** Prints why the bench can't start and exits 2, before anything is copied or started. */
function refuse(message: string): never {
  console.error(message);
  process.exit(2);
}

// The bench's own flags come off the line first; the rest are play settings.
const argv = process.argv.slice(2);
let own: { card?: string; lines?: string };
let rest: string[];
try {
  const options = { ...Object.fromEntries(Object.entries(SETTINGS).map(([name, spec]) => [name, { type: spec.kind === "bool" ? "boolean" : "string" } as const])), card: { type: "string" }, lines: { type: "string" } } as const;
  const parsed = parseArgs({ args: argv, options, strict: true, allowPositionals: false, tokens: true });
  own = { card: parsed.values.card as string | undefined, lines: parsed.values.lines as string | undefined };
  const dropped = new Set(parsed.tokens.flatMap((t) => (t.kind === "option" && (t.name === "card" || t.name === "lines") ? (t.inlineValue ? [t.index] : [t.index, t.index + 1]) : [])));
  rest = argv.filter((_, i) => !dropped.has(i));
} catch (error) {
  refuse(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
}
/** The command's own defaults: Russian, scripted AI seats, no judge, and stops that keep a lost bench run cheap. */
const live = { lang: "ru", players: "scripted", "no-audit": true, "time-limit-min": 15, "stall-rounds": 6 } as const;
let defaults: Partial<Record<keyof typeof SETTINGS, string | number | boolean>> = live;
let flags: ReturnType<typeof resolveSettings>["values"];
let typedPack: boolean;
try {
  // The scripted DM's lines are English, which a Russian run's narration guard refuses: a run with no model is English unless --lang says otherwise.
  if (resolveSettings(rest, live).values.dm === "scripted") defaults = { ...live, lang: "en" };
  const settings = resolveSettings(rest, defaults);
  flags = settings.values;
  typedPack = settings.provenance.pack?.from !== "default";
} catch (error) {
  if (!(error instanceof SettingError)) throw error;
  refuse(error.message);
}
if (!own.card) refuse(`--card names the card to bench.\n${USAGE}`);
const card = own.card;
const reaching = () => {
  const packs = packsReaching(card);
  return packs.length > 0 ? `The packs that reach ${card}: ${packs.join(", ")}.` : `No campaign pack under scenarios/ reaches ${card}.`;
};
if (!typedPack) refuse(`--pack names the campaign pack to bench ${card} in. ${reaching()}\n${USAGE}`);
const person = flags.seat === "ink";
if (flags.seat === "ai") refuse("--seat ai has no human seat, and the card bench types at one.");
if (!person && flags.players === "model") refuse("The card bench plays scripted AI seats, which vote for the own move so that its roll always happens: leave --players out.");
if (person && own.lines) refuse("--seat ink has you type at the card, and --lines types a file's lines there: name one of the two.");
if (!person && !own.lines) refuse(`--lines names the file of lines to type at the card, one a row; or sit at the table yourself with --seat ink.\n${USAGE}`);
if (flags["new-party"] || flags["replay-journey"]) refuse("The card bench plays a copy of the saved party as it stands: leave --new-party and --replay-journey out.");
let read: BenchLines = { lines: [], leftOut: [] };
if (own.lines) {
  try {
    read = benchLines(readFileSync(own.lines, "utf8"));
  } catch (error) {
    refuse(`--lines ${own.lines}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!person && read.lines.length === 0) refuse(`--lines ${own.lines}: no line to type. One line of the player's words a row; a row that starts with # is a note, one that starts with ~ is left out.`);
}

// Everything the bench can refuse is refused here, before a pack or a saved party is copied.
try {
  const plan = benchPlan(flags.pack, card);
  if (plan.needs.length > 0 && flags.roster === undefined) refuse(`${card} comes only to a party that remembers ${plan.needs.join(", ")}: play it on a saved party with --roster NAME.`);
} catch (error) {
  if (!(error instanceof BenchError)) throw error;
  refuse(`${error.message} ${reaching()}`);
}
if (flags.roster !== undefined) {
  try {
    savedParty(flags.rosters, flags.roster);
  } catch (error) {
    if (!(error instanceof BenchError)) throw error;
    refuse(error.message);
  }
}

const recordedPack = path.relative(REPO, path.resolve(flags.pack)).startsWith("..") ? path.resolve(flags.pack) : path.relative(REPO, path.resolve(flags.pack));
let typed = 0;
let runs = 0;
let why = "";
// The copies go when the command does, however it ends: the driver exits on a refused setting.
const copies = new Set<string>();
const remove = (root: string) => {
  rmSync(root, { recursive: true, force: true });
  copies.delete(root);
};
process.on("exit", () => copies.forEach(remove));
for (;;) {
  // A fresh copy of the pack and of the saved party for every bench run (design §3).
  const root = mkdtempSync(path.join(tmpdir(), "card-bench-"));
  copies.add(root);
  try {
    let copy: ReturnType<typeof benchPack>;
    try {
      copy = benchPack(flags.pack, card, root);
      if (flags.roster !== undefined) benchRoster(flags.rosters, flags.roster, path.join(root, "rosters"));
    } catch (error) {
      if (!(error instanceof BenchError)) throw error;
      refuse(error.message);
    }
    const { plan } = copy;
    const log: BenchSeatLog = { reached: false, typed: [] };
    runs += 1;
    if (!person) console.log(`\nBench run ${runs} of ${card}: ${plan.route.join(" > ")}, ${read.lines.length - typed} line${read.lines.length - typed === 1 ? "" : "s"} to type.`);
    await playRun(
      {
        command: npmCommand("play:card"),
        folder: "card",
        defaults,
        // A campaign goes where its road takes it: the plan is the pack's scenes, as in play:full.
        allScenes: true,
        bench: { seat: benchSeat(read.lines.slice(typed), log), card: votesOwnMove, record: { card, pack: recordedPack, route: plan.route, lines_file: own.lines ?? null, left_out: read.leftOut } },
      },
      [...rest, "--pack", copy.dir, ...(flags.roster !== undefined ? ["--rosters", path.join(root, "rosters")] : [])],
    );
    typed += log.typed.length;
    if (person) break;
    if (!log.reached) {
      const reads = [...plan.needs.map((d) => `needs ${d}`), ...plan.barred.map((d) => `not with ${d}`)];
      why = `${card} never reached the table${reads.length > 0 ? `: on this party its deeds may not hold (${reads.join(", ")}), or the card is gone from its world` : ""}. See the run folder above.`;
      process.exitCode = 1;
      break;
    }
    if (log.left === "lines_out") {
      why = `The lines ran out with ${card} still waiting.`;
      break;
    }
    if (log.left !== "settled") {
      why = "The bench run ended before the card was settled: see the run folder above.";
      break;
    }
    if (typed >= read.lines.length) {
      why = `${card} was settled on the last line.`;
      break;
    }
  } finally {
    remove(root);
  }
}
if (!person) {
  console.log(`\nCard bench of ${card}: ${typed} of ${read.lines.length} line${read.lines.length === 1 ? "" : "s"} typed in ${runs} bench run${runs === 1 ? "" : "s"}. ${why}`);
  for (const line of read.leftOut) console.log(`Left out, not typed: ${line}`);
}
