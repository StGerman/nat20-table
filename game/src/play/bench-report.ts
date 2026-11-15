// The card bench's report (AGT-124, `docs/design/card-bench.md` §4): `bench.md` in a bench run's
// folder, one block for each line typed at the card. A block holds what the DM made of the line
// (an answer, or an own move with its check and the choices it names), what was refused, the roll,
// the decision and what the engine did on it, what the DM remembered, the DM's words to the table,
// and what the line cost. A pure function of the run's records, like the other post-run stages.
// It reports and never judges: no pass and no fail. It is the DM's side of the table (Rule 3):
// it holds DCs and DM-only engine lines, and is never shown to a player.
import type { Event } from "@nat20-table/engine-client";
import type { TranscriptRecord } from "../table/types.ts";
import { waitedMs, type UsageRecord } from "../usage.ts";
import type { RunRecord } from "./record.ts";

/** The report's file in a bench run's folder. */
export const BENCH_MD = "bench.md";

/** Engine events that are the road going on, not what a decided card did: a block's list ends before the first. */
const MOVES_ON = new Set<Event["kind"]>(["traveled", "scene_loaded", "card_shown", "cards_offered", "escort_settled"]);
/** The decision's own events, which a block tells in its own rows. */
const TOLD = new Set<Event["kind"]>(["card_own_move", "own_move_set", "card_advice", "card_resolved", "own_move_ran"]);
/** What a `remember` call left in the transcript: the fact, or the guard's refusal of it. A scene's summary is the loop's, not a call. */
const kept = (r: TranscriptRecord) => r.kind === "memory" && r.channel === "memory:dm" && !r.text.startsWith("summary:");
const calledRemember = (r: TranscriptRecord) => kept(r) || (r.kind === "retry" && r.speaker === "dm" && r.text.startsWith("memory refused: "));

const usd = (records: UsageRecord[]) => records.reduce((sum, u) => sum + u.api_equivalent_usd, 0).toFixed(2);
const seconds = (records: UsageRecord[]) => (records.reduce((sum, u) => sum + waitedMs(u), 0) / 1000).toFixed(1);
const wakes = (records: UsageRecord[]) => records.map((u) => `${u.purpose}${u.outcome === "ok" ? "" : ` (${u.outcome})`}`).join(", ");
const quote = (text: string) => text.split("\n").map((l) => `  > ${l}`);

/** `bench.md` for a card bench run, as lines; none for a run of any other command. */
export function benchReport(run: RunRecord, log: Event[], transcript: TranscriptRecord[], usage: UsageRecord[]): string[] {
  const bench = run.bench;
  if (!bench) return [];
  const shown = log.find((e) => e.kind === "card_shown" && e.card === bench.card);
  const after = shown?.seq ?? Number.POSITIVE_INFINITY;
  const drawn = log.find((e) => e.kind === "card_drawn" && e.seq > after);
  const resolved = log.find((e) => e.kind === "card_resolved" && e.seq > after);
  const choices = new Map(drawn?.kind === "card_drawn" ? drawn.choices.map((c) => [c.id, c.text]) : []);
  const named = (id: string) => `\`${id}\`${choices.has(id) ? ` (${choices.get(id)})` : ""}`;

  // A line: the human's own words while the card waited. Words after its decision are not the bench's.
  const seated = transcript.findIndex((r) => r.kind === "system" && r.text === `card ${bench.card} goes to the seats`);
  const at = transcript.flatMap((r, i) =>
    seated >= 0 && i > seated && r.human === true && r.channel === "table" && r.kind === "intent" && (!resolved || r.log_head < resolved.seq) ? [i] : [],
  );

  // The DM's wakes, in order: one `card_words` wake answers each line.
  const dm = usage.filter((u) => u.agent === "dm");
  const answers = dm.flatMap((u, i) => (u.purpose === "card_words" ? [i] : []));
  const split = answers.length === at.length;
  const reaching = dm.slice(0, answers[0] ?? dm.length);
  // A line's wakes: the one that answered it, and the `road` wake right after it, which tells what a decided card or a fallen
  // move brought. A card a person settled by a number after a fall has two: the fall's, then the card's.
  const wakesOf = (n: number, roads: number) => {
    if (!split) return [];
    const its = [answers[n]!];
    while (its.length <= roads && dm[its.at(-1)! + 1]?.purpose === "road") its.push(its.at(-1)! + 1);
    return its;
  };
  // Which wake kept a fact. A wake settles for the table on its answer, and a `remember` later in the same turn lands after the
  // seat has typed its next line, so a fact's place in the transcript does not say. `usage.jsonl` lists each turn's tool calls
  // in order, and each `remember` call left one transcript record in the same order: the two are matched one to one.
  const calls = dm.flatMap((u, i) => (u.tools ?? []).filter((t) => t === "remember").map(() => i));
  const left = transcript.filter(calledRemember);
  const byWake = dm.length > 0 && calls.length === left.length;
  const wakeOf = new Map(byWake ? left.map((r, i) => [r, calls[i]!]) : []);

  const settledBy = resolved?.kind === "card_resolved" ? `settled on ${named(resolved.choice)} (${resolved.decided})` : "still waiting when the bench run ended";
  const out = [
    `# Card bench: ${bench.card}`,
    "",
    `- Run: ${run.run_id}, build ${run.build.table_commit.slice(0, 7)}${run.build.dirty ? " with local changes" : ""}; ended: ${run.ended ?? "not recorded"}`,
    `- Pack: ${bench.pack}, cut to ${bench.route.join(" > ")}`,
    `- DM: ${run.settings.dm?.value === "scripted" ? "scripted (no model)" : `${run.settings["dm-model"]?.value ?? "model"}, effort ${run.settings["dm-effort"]?.value ?? "default"}`}; language ${run.settings.lang?.value ?? "en"}`,
    `- Lines: ${bench.lines_file ?? "typed by a person at the seat"}; ${at.length} typed in this bench run${bench.lines_before ? `, ${bench.lines_before} in the bench runs before it` : ""}`,
    `- The card: ${shown ? settledBy : "never came to the table"}`,
    usage.length === 0
      ? "- Cost: no model calls"
      : `- Cost: ${usd(usage)} USD for the bench run; before the first line (${wakes(reaching) || "no DM wake"}): ${usd(reaching)} USD, ${seconds(reaching)} s of DM wakes`,
    ...(usage.length > 0 && !split ? [`- Cost is not split by line: ${answers.length} card_words wakes for ${at.length} lines`] : []),
    ...(dm.length > 0 && !byWake ? [`- The wake of a kept fact is not known: ${calls.length} remember calls in usage.jsonl for ${left.length} in the transcript. Facts are listed by their place in the transcript`] : []),
    "",
    "No pass and no fail: a person reads the DM's words beside its calls and the engine's lines.",
  ];
  if (drawn?.kind === "card_drawn") {
    out.push("", "The card as the engine drew it:", "", ...drawn.card_text.split("\n").map((l) => `> ${l}`), "", ...drawn.choices.map((c) => `- \`${c.id}\`: ${c.text}`));
  }

  at.forEach((index, n) => {
    const line = transcript[index]!;
    const next = at[n + 1] !== undefined ? transcript[at[n + 1]!]!.log_head : Number.POSITIVE_INFINITY;
    const rest = transcript.slice(index + 1, at[n + 1] ?? transcript.length);
    const upTo = log.filter((e) => e.seq > line.log_head && e.seq <= next);
    const move = upTo.find((e): e is Extract<Event, { kind: "own_move_set" }> => e.kind === "own_move_set" && e.card === bench.card);
    const ran = upTo.find((e): e is Extract<Event, { kind: "own_move_ran" }> => e.kind === "own_move_ran" && e.card === bench.card);
    const decided = upTo.find((e): e is Extract<Event, { kind: "card_resolved" }> => e.kind === "card_resolved");
    // The block runs to the next line. After the card's decision it ends when the seat acts again, another card reaches the
    // seats, or the DM speaks of anything but the card's outcome: a wake of another kind (the arrival's scene, say), or
    // a narration after the `road` narration that told the outcome (the cut contract's pay, for an arrival card).
    let told = false;
    const end = decided
      ? rest.findIndex((r) => {
          if (r.log_head < decided.seq) return false;
          const narrates = r.speaker === "dm" && r.kind === "narration";
          if (r.speaker === line.speaker || (r.kind === "system" && /^card \S+ goes to the seats$/.test(r.text)) || (told && narrates)) return true;
          if (r.speaker === "dm" && r.wake !== undefined && r.wake !== "card_words" && r.wake !== "road") return true;
          told ||= narrates && r.wake === "road";
          return false;
        })
      : -1;
    const records = end < 0 ? rest : rest.slice(0, end);
    const events = end < 0 ? upTo : upTo.filter((e) => e.seq <= rest[end]!.log_head);
    // An own move with no failure named that fell: the card waits, and the words after the fall are told apart from those before it.
    const fell = ran && !ran.choice ? ran.seq : undefined;
    const settled = decided?.seq ?? Number.POSITIVE_INFINITY;
    const advice = (after: number, before: number) => events.flatMap((e) => (e.kind === "card_advice" && e.seq > after && e.seq < before ? [`${e.actor} ${e.choice}`] : []));
    const votes = advice(0, fell ?? settled);
    const later = fell === undefined ? [] : advice(fell, settled);
    const said = records.filter((r) => r.speaker === "dm" && r.kind === "narration");
    const answered = said.some((r) => r.wake === "card_words");

    out.push("", `## Line ${(bench.lines_before ?? 0) + n + 1}: "${line.text}"`, "");
    out.push(
      move
        ? `- The DM's call: an own move, ${move.skill} (${move.ability}) DC ${move.dc}; success brings ${named(move.success)}, failure ${move.failure ? named(move.failure) : "names no choice"}`
        : answered
          ? "- The DM's call: an answer, no own move; the card waits"
          : "- The DM's call: none reached the table",
    );
    // What `remember` left is told by the wake that called it, where the wakes are known; else by its place in the transcript.
    const its = wakesOf(n, decided && later.length > 0 ? 2 : 1);
    const called = byWake && split ? left.filter((r) => its.includes(wakeOf.get(r)!)) : records.filter(calledRemember);
    // Engine refusals, guard refusals and failed wakes, as the table logged them.
    const refused = [
      ...records.filter((r) => !calledRemember(r) && (r.kind === "retry" || r.kind === "error" || r.kind === "fallback" || (r.kind === "system" && r.text.endsWith("words are only answered")))),
      ...called.filter((r) => !kept(r)),
    ];
    if (refused.length > 0) out.push("- Refused or failed:", ...refused.map((r) => `  - ${r.kind}${r.wake ? ` (${r.wake})` : ""}: ${r.text}`));
    if (votes.length > 0) out.push(`- Votes: ${votes.join(", ")}`);
    if (ran) {
      const roll = ran.roll ? log.find((e) => e.kind === "roll" && e.roll.id === ran.roll) : undefined;
      out.push(`- The own move's roll: ${roll ? `${ran.roll}: ${roll.text}` : "none (the proposer was down, or the roll could not be made)"}`);
      out.push(`- The own move brought: ${ran.choice ? named(ran.choice) : "no choice: it fell, and the move is spent"}`);
    }
    // A person at the seat may settle the card by a number after their words (`--seat ink`); the bench's scripted seat never does.
    const picked = rest.filter((r) => r.speaker === line.speaker && r.channel === "run" && r.kind === "intent" && r.log_head < settled && !r.text.includes(' on the road card: own move "'));
    out.push(...picked.map((r) => `- The seat then chose without words: ${r.text}`));
    if (later.length > 0) out.push(`- Votes after the fall: ${later.join(", ")}`);
    out.push(decided ? `- The card was decided: ${named(decided.choice)} (${decided.decided})` : "- The card was not decided on this line");
    // What the decision or the fall did: the engine's own lines after it, until the road goes on. The cut contract ends at the
    // card's leg, so its pay follows at once and is not the card's doing. A fight is named and not played.
    const from = Math.min(settled, ran?.seq ?? Number.POSITIVE_INFINITY);
    const did: string[] = [];
    for (const e of events) {
      if (e.seq <= from || TOLD.has(e.kind)) continue;
      if (MOVES_ON.has(e.kind) || (e.kind === "roll" && e.roll.kind === "table") || (e.kind === "ledger" && e.reason === "wage")) break;
      // The own move's roll and its check stand in their own row.
      if ((e.kind === "roll" && e.roll.id === ran?.roll) || (e.kind === "check_resolved" && e.roll_id === ran?.roll)) continue;
      did.push(`  - ${e.kind === "roll" ? `${e.roll.id}: ` : ""}${e.text}`);
      if (e.kind === "combat_started") break;
    }
    if (decided || ran) out.push(did.length > 0 ? "- Then the engine logged:" : "- Then the engine logged nothing more for the card", ...did);
    // Every fact the DM kept in the line's wakes; where the wake is not known, the facts between this line and the next.
    const facts = called.filter(kept);
    out.push(
      facts.length > 0 ? "- remember:" : "- remember: none",
      ...facts.flatMap((r) => [`  - ${byWake && split ? `in its ${dm[wakeOf.get(r)!]!.purpose} wake` : "by its place in the transcript"}:`, ...quote(r.text).map((l) => `  ${l}`)]),
    );
    out.push(said.length > 0 ? "- The DM's words to the table:" : "- The DM's words to the table: none", ...said.flatMap((r) => [`  - ${r.wake ?? "narration"}:`, ...quote(r.text).map((l) => `  ${l}`)]));
    if (split) {
      const turns = its.map((i) => dm[i]!);
      out.push(`- Cost: ${usd(turns)} USD, ${seconds(turns)} s of DM wakes (${wakes(turns)})`);
    }
  });

  if (bench.left_out.length > 0) out.push("", "## Left out, not typed", "", ...bench.left_out.map((l) => `- ${l}`));
  return out;
}
