// `npm run audit:show -- <run-dir> [--roll rN] [--kind K] [--limit N]` (AGT-135): the roll audit, readable. For
// each roll the transcript cites it prints the engine's own log entry (`session-log.jsonl`), the line
// the DM's channel heard and whether it is the engine's words, what each player's channel heard of
// it (the player view: no AC, no DC), and the first narration after it. Read-only: no engine, no
// model. The audit that gates a run is `nat20-audit` (decision 0033); this only shows its ground.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

interface Line {
  speaker: string;
  channel: string;
  kind: string;
  text: string;
  rolls?: string[];
}

interface Roll {
  id: string;
  kind?: string;
  label: string;
  roller: string;
  target?: string;
  dice: Array<{ dice: string; results: number[]; kept: number }>;
  modifiers: Array<{ source: string; value: number }>;
  total: number;
  against?: { kind: string; value: number };
  outcome: string;
  advantage?: string;
}

interface Logged {
  seq: number;
  round?: number;
  scene?: string;
  text: string;
  roll: Roll;
}

const jsonl = <T>(file: string): T[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);

const clip = (text: string, width: number) => (text.length > width ? `${text.slice(0, width - 1)}…` : text);
const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

/** The roll as arithmetic: dice, kept die, each modifier, total, target and outcome. */
export function arithmetic(roll: Roll): string {
  // `kept` is the die advantage or disadvantage kept, or else the dice's sum (`4d6`): named only for the first.
  const dice = roll.dice.map((d) => `${d.dice} [${d.results.join(", ")}${d.results.length > 1 && d.results.includes(d.kept) ? `, kept ${d.kept}` : ""}]`).join(" + ");
  const mods = roll.modifiers.map((m) => `${signed(m.value)} ${m.source.replace(/ Modifier$/, "").replace(/^Proficiency: Proficient$/, "proficiency")}`).join(" ");
  const against = roll.against ? ` vs ${roll.against.kind} ${roll.against.value}` : "";
  const outcome = roll.outcome === "value" ? "" : ` → ${roll.outcome.replace(/_/g, " ")}`;
  return `${dice}${mods ? ` ${mods}` : ""} = ${roll.total}${against}${outcome}`;
}

/** The page for a run folder: one block per cited roll, newest last, at most `limit` (0 for all). */
export function auditPage(dir: string, options: { roll?: string; kind?: string; limit?: number } = {}): string[] {
  const transcript = jsonl<Line>(path.join(dir, "transcript.jsonl"));
  const logged = new Map(
    jsonl<Logged & { kind: string }>(path.join(dir, "session-log.jsonl"))
      .filter((e) => e.kind === "roll")
      .map((e) => [e.roll.id, e] as const),
  );
  const run = existsSync(path.join(dir, "run.json")) ? (JSON.parse(readFileSync(path.join(dir, "run.json"), "utf8")) as { run_id?: string; command?: string; seed?: number; build?: { table_commit?: string; engine_rev?: string } }) : {};
  const audit = existsSync(path.join(dir, "audit.json")) ? (JSON.parse(readFileSync(path.join(dir, "audit.json"), "utf8")) as { passed: boolean; output: string }) : undefined;

  const cited: string[] = [];
  for (const line of transcript) for (const id of line.rolls ?? []) if (!cited.includes(id)) cited.push(id);
  const invented = cited.filter((id) => !logged.has(id));
  // `--kind attack` keeps one kind of roll (`attack`, `skill_check`, `save`, `damage`, `initiative`…).
  const kinded = options.kind ? cited.filter((id) => logged.get(id)?.roll.kind === options.kind) : cited;
  const shown = options.roll ? cited.filter((id) => id === options.roll) : options.limit ? kinded.slice(0, options.limit) : kinded;

  const out = [
    `Run ${run.run_id ?? path.basename(path.resolve(dir))}${run.command ? ` (${run.command})` : ""}${run.seed !== undefined ? `, seed ${run.seed}` : ""}${run.build?.table_commit ? `, build ${run.build.table_commit.slice(0, 7)}` : ""}${run.build?.engine_rev ? `, engine ${run.build.engine_rev.slice(0, 7)}` : ""}`,
    `The engine logged ${logged.size} rolls; the transcript cites ${cited.length}${invented.length ? `, ${invented.length} of them not in the log: ${invented.join(", ")}` : ", every one in the log"}.`,
    audit ? `nat20-audit: ${audit.passed ? "PASS" : "FAIL"}. ${audit.output.split("\n")[0]}` : "nat20-audit: not run on this folder yet.",
    "",
  ];
  for (const id of shown) {
    const event = logged.get(id);
    const at = transcript.findIndex((l) => l.rolls?.includes(id));
    if (!event) {
      out.push(`${id}  NOT IN THE ENGINE LOG`, `  cited by   ${transcript[at].speaker} on ${transcript[at].channel}: ${clip(transcript[at].text, 100)}`, "");
      continue;
    }
    const roll = event.roll;
    const where = [`log seq ${event.seq}`, event.round !== undefined ? `round ${event.round}` : "", event.scene ?? ""].filter(Boolean).join(", ");
    out.push(`${id}  ${roll.roller}${roll.target ? ` → ${roll.target}` : ""}: ${roll.label.replace(/ vs \S+$/, "")}   (${where})`);
    out.push(`  engine     ${arithmetic(roll)}${roll.advantage && roll.advantage !== "normal" ? `, ${roll.advantage}` : ""}`);
    const heard = transcript.filter((l) => l.kind === "engine" && l.rolls?.includes(id));
    if (!heard.some((l) => l.channel === "dm")) out.push(`  ${"DM heard".padEnd(10)} no line on the DM's channel  ✗`);
    for (const line of heard) {
      const who = line.channel === "dm" ? "DM heard" : line.channel.startsWith("to:") ? `${line.channel.slice(3)} heard` : `${line.channel} heard`;
      const same = line.channel === "dm" ? (line.text === `[${id}] ${event.text}` ? "  ✓ the engine's words" : "  ✗ not the engine's words") : "";
      out.push(`  ${who.padEnd(10)} ${clip(line.text, 110)}${same}`);
    }
    const story = transcript.slice(at + 1).find((l) => l.speaker === "dm" && l.kind === "narration");
    if (story) out.push(`  then       «${clip(story.text.replace(/\s+/g, " "), 110)}»`);
    out.push("");
  }
  if (shown.length < kinded.length && !options.roll) out.push(`${kinded.length - shown.length} more: --limit 0 shows every roll, --roll rN one.`);
  return out;
}

// Run as `npm run audit:show`; a test imports the page alone.
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { roll: { type: "string" }, kind: { type: "string" }, limit: { type: "string", default: "12" } } });
  const dir = positionals[0];
  if (!dir || !existsSync(path.join(dir, "transcript.jsonl")) || !existsSync(path.join(dir, "session-log.jsonl"))) {
    console.error("usage: npm run audit:show -- <run-dir> [--roll rN] [--kind K] [--limit N]   (a run folder with transcript.jsonl and session-log.jsonl)");
    process.exit(2);
  }
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 0) {
    console.error(`--limit takes a whole number of rolls, 0 for all; not ${values.limit}.`);
    process.exit(2);
  }
  console.log(auditPage(dir, { roll: values.roll, kind: values.kind, limit }).join("\n"));
}
