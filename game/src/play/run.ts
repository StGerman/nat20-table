// What every live-run command shares (M6 spec §8 "where things run", runbook Part 2): the party and
// its cards from a scenario pack, a run folder, the audit and leak scan over it, and the report.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Handle, State } from "@nat20-table/engine-client";
import { cardName } from "../agents/player.ts";
import { REPO, type GameEngine } from "../engine.ts";
import { Adventure } from "../pack/adventure.ts";
import { narrationGuard, packIds, speechGuard } from "../table/guards.ts";
import type { FightReaction, RunReport, SceneChoice, TalkRound } from "../table/loop.ts";
import type { TextGuard } from "../table/state.ts";
import type { TranscriptRecord } from "../table/types.ts";
import { percentile, summarize, type UsageRecord } from "../usage.ts";
import type { RunRecord } from "./record.ts";

/** p95 latency targets (scope §6.4): an AI player's turn, a DM narration. */
export const TARGET_P95_MS = { player: 10_000, dm: 6_000 };

/** Talk-round targets (party talk §2, goals 2 and 5): the silent share of AI player slots, the first line's p50, the round's p95. */
export const TALK_TARGETS = { silentShare: 0.3, firstLineP50Ms: 7_000, roundP95Ms: 20_000, fightLinesPerRound: 0.5 };

export interface PackParty {
  /** The human's character; absent for a table with no human (`--seat ai`, AGT-40). */
  human?: Handle;
  /** The AI players' characters, in seat order. */
  ai: Handle[];
  /** Each AI player's personality card (CHR-5). */
  cards: Map<Handle, string>;
  /**
   * What the table calls each party member, whichever seat plays it: its handle, its card's name
   * and the pack's `names`. A line that names an AI player gives it the floor first (party talk §4.2).
   */
  names: Map<Handle, string[]>;
}

/**
 * Who plays whom (M7 spec §4.2, design §3.2): the pack's party, with the human on the character the
 * pack seats there by default, or with no human (`none`): then every character is an AI player.
 * The AI players' cards are read from the pack.
 */
export type Casting = "default" | "none";

/** The party of a scenario pack's skeleton, cast per `casting`, with the AI players' cards read from the pack. */
export function castParty(pack: string, casting: Casting = "default"): PackParty {
  const adventure = Adventure.parse(JSON.parse(readFileSync(path.join(pack, "adventure.json"), "utf8")));
  const human = casting === "none" ? undefined : adventure.party.find((p) => p.seat === "human")?.handle;
  if (casting !== "none" && !human) throw new Error(`${pack}: the party has no human seat`);
  const ai = adventure.party.filter((p) => p.handle !== human);
  const cards = new Map(
    ai.map((p) => {
      if (!p.card) throw new Error(`${pack}: party ${p.handle} has an AI seat and no card (npm run pack:check)`);
      return [p.handle, readFileSync(path.resolve(pack, p.card), "utf8")] as const;
    }),
  );
  const names = new Map(
    adventure.party.map((p): [Handle, string[]] => {
      const card = p.card ? readFileSync(path.resolve(pack, p.card), "utf8") : "";
      return [p.handle, [...new Set([p.handle, cardName(p.handle, card), ...(p.names ?? [])])]];
    }),
  );
  return { ...(human ? { human } : {}), ai: ai.map((p) => p.handle), cards, names };
}

/** The guards every live run puts on free text (spec §3.5): the DM's against the pack's ids. */
export function guards(pack: string, engine: GameEngine): { narrationGuard: TextGuard; speechGuard: TextGuard } {
  const ids = packIds(pack);
  return { narrationGuard: narrationGuard({ ids, knownRoll: (id) => engine.rolls.has(id) }), speechGuard: speechGuard({ shown: ids.shown }) };
}

/**
 * Loads the pack's scenes before `scene` in order, the party carried along, and marks all of it as
 * read, so the run starts at `scene` with nobody told about the rest. Returns the party to carry
 * into `scene`, or undefined when it is the first.
 */
export async function startAt(engine: GameEngine, pack: string, scene: string, party: Handle[]): Promise<Handle[] | undefined> {
  const scenes = Adventure.parse(JSON.parse(readFileSync(path.join(pack, "adventure.json"), "utf8"))).scenes.map((s) => s.id);
  const at = scenes.indexOf(scene);
  if (at < 0) throw new Error(`${pack} has no scene ${scene}; its scenes: ${scenes.join(", ")}`);
  for (const [i, id] of scenes.slice(0, at).entries()) {
    const loaded = await engine.request("dm", { cmd: "load_scene", scene_id: id, party: i === 0 ? undefined : party });
    if (!loaded.ok) throw new Error(`scene ${id} didn't load: ${loaded.error?.message}`);
  }
  engine.skipAll();
  return at === 0 ? undefined : party;
}

/**
 * Which scenes a run plays (`--scenes`): the listed ones, in the pack's order. A scene the DM loads
 * on the way forward, after the furthest scene played (or the first listed one) and before a listed
 * one not played yet, is passed over: that listed scene loads in its place. The run stops before any
 * other scene. An id that isn't in the pack is never passed over: it loads as asked, so the engine
 * refuses an unknown one and the DM can try again. Returns the scene to start at and the loop's
 * `onScene`.
 */
export function scenePlan(pack: string, listed: string[]): { first: string; onScene: (sceneId: string, played: readonly string[]) => SceneChoice } {
  const order = Adventure.parse(JSON.parse(readFileSync(path.join(pack, "adventure.json"), "utf8"))).scenes.map((s) => s.id);
  const at = listed.map((id) => order.indexOf(id));
  const unknown = listed.filter((_, i) => at[i] < 0);
  if (listed.length === 0) throw new Error("no scene to play");
  if (unknown.length > 0) throw new Error(`${pack} has no scene ${unknown.join(", ")}; its scenes: ${order.join(", ")}`);
  if (at.some((n, i) => i > 0 && n <= at[i - 1])) throw new Error(`list the scenes once each, in the pack's order: ${order.join(", ")}`);
  return {
    first: listed[0],
    onScene: (sceneId, played) => {
      if (listed.includes(sceneId)) return "continue";
      const here = order.indexOf(sceneId);
      const furthest = Math.max(at[0], ...played.map((id) => order.indexOf(id)));
      const next = here > furthest ? listed.find((id) => order.indexOf(id) > here && !played.includes(id)) : undefined;
      return next ? { skipTo: next } : "stop";
    },
  };
}

/** A new run folder, `<out>/<name>-<time>/`. */
export function runFolder(out: string, name: string): string {
  const dir = path.resolve(out, `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Refuses a model run while an API key is set: it would bill the API, not Stas's plan (decision 0036). */
export function refuseApiKey(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is set, so the run would bill the API instead of your Claude plan (decision 0036). Unset it and run again.");
    process.exit(2);
  }
}

/** The audit and the leak scan over a run folder (`nat20-audit`, decision 0033). */
export function audit(scenes: string, runDir: string): { passed: boolean; output: string } {
  const run = spawnSync("cargo", ["run", "--quiet", "-p", "nat20-duel", "--bin", "nat20-audit", "--", "--pack", scenes, runDir], {
    cwd: REPO,
    encoding: "utf8",
  });
  if (run.error) return { passed: false, output: `nat20-audit didn't run: ${run.error.message}` };
  return { passed: run.status === 0, output: `${run.stdout}${run.stderr}`.trim() };
}

/** Every creature as the DM sees it at the end: Hit Points and life state, for the report. */
export async function endState(engine: GameEngine): Promise<string[]> {
  const r = await engine.request("dm", { cmd: "get_state" });
  const state = r.result?.cmd === "get_state" ? (r.result.state as State) : undefined;
  if (state?.view !== "dm") return [];
  return state.creatures.map((c) => `${c.handle} (${c.side}): ${c.hp}/${c.hp_max} HP, ${c.life_state}`);
}

/**
 * The report's lines on the talk rounds out of combat (party talk §2, §7): how many spoke, how many
 * stayed silent, how hands went, whether named players answered, and how long a round took.
 */
export function talkLines(rounds: TalkRound[]): string[] {
  if (rounds.length === 0) return [];
  const sum = (count: (r: TalkRound) => number) => rounds.reduce((n, r) => n + count(r), 0);
  const slots = sum((r) => new Set([...r.spoke, ...r.declared, ...r.silent]).size);
  const silent = sum((r) => r.silent.length);
  const kinds = ["speak", "both", "act", "pass", "unread"] as const;
  const hands = kinds.map((kind) => `${kind} ${sum((r) => Object.values(r.hands).filter((k) => k === kind).length)}`);
  const named = sum((r) => r.named.length);
  const answered = sum((r) => r.named.filter((h) => r.spoke.includes(h) || r.declared.includes(h)).length);
  const first = rounds.flatMap((r) => (r.first_line_ms === undefined ? [] : [r.first_line_ms]));
  const walls = rounds.map((r) => r.wall_ms);
  const share = slots === 0 ? 0 : Math.round((100 * silent) / slots);
  return [
    `- Talk rounds: ${rounds.length}; lines per round ${(sum((r) => r.spoke.length) / rounds.length).toFixed(1)}; silent share ${share}% (target at least ${100 * TALK_TARGETS.silentShare}%); floor wakes ${sum((r) => r.floor_wakes)}, hands lapsed ${sum((r) => r.lapsed.length)}`,
    `- Hands: ${hands.join(", ")}; named players who answered first: ${answered} of ${named}; hand-offs ${sum((r) => (r.handed_to ? 1 : 0))}, addresses carried to the next round ${sum((r) => r.carried.length)}`,
    `- Talk round time: first line p50 ${first.length > 0 ? `${percentile(first, 50)} ms` : "n/a"} (target ${TALK_TARGETS.firstLineP50Ms} ms), round p50 ${percentile(walls, 50)} ms, p95 ${percentile(walls, 95)} ms (target ${TALK_TARGETS.roundP95Ms} ms)`,
  ];
}

/**
 * The report's lines on talk in fights (party talk goal 4, §5): the AI players' lines per combat
 * round, on their own turns and between them, and how the reactions between turns went (R1).
 */
export function fightLines(run: Pick<RunReport, "reactions" | "fight">, usage: UsageRecord[]): string[] {
  if (run.fight.rounds === 0) return [];
  const count = (pick: (r: FightReaction) => number) => run.reactions.reduce((n, r) => n + pick(r), 0);
  const barks = usage.filter((u) => u.purpose === "bark").map((u) => u.wall_ms);
  return [
    `- Fight talk: ${run.fight.lines} AI lines in ${run.fight.rounds} combat rounds, ${(run.fight.lines / run.fight.rounds).toFixed(2)} a round (target about ${TALK_TARGETS.fightLinesPerRound})`,
    ...(run.reactions.length > 0
      ? [
          `- Fight reactions: triggers ${run.reactions.length}; bark wakes ${count((r) => r.woke.length)}; lines shown ${count((r) => (r.spoke ? 1 : 0))}, passed ${count((r) => r.passed.length)}, beaten by another's line ${count((r) => r.beaten.length)}, cancelled or timed out ${count((r) => r.cut.length)}; bark wake p50 ${percentile(barks, 50) || "n/a"} ms, p95 ${percentile(barks, 95) || "n/a"} ms`,
        ]
      : []),
  ];
}

/** How often the AI players spoke to one companion with `say`'s `to` (party talk §4.4, goal 6). */
export function addressLines(transcript: TranscriptRecord[]): string[] {
  const addresses = transcript.filter((r) => r.kind === "speech" && r.to !== undefined && !r.human);
  if (addresses.length === 0) return [];
  const speech = transcript.filter((r) => r.kind === "speech" && !r.human).length;
  const pairs = new Map<string, number>();
  for (const r of addresses) pairs.set(`${r.speaker} to ${r.to}`, (pairs.get(`${r.speaker} to ${r.to}`) ?? 0) + 1);
  const most = [...pairs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([pair, n]) => `${pair} ${n}`);
  return [`- Lines spoken to a companion: ${addresses.length} of ${speech} AI lines (${most.join(", ")})`];
}

/** The report's table of scene times against the pack's targets (M7 spec §4.1), from `run.json`. */
export function timingLines(record: Pick<RunRecord, "scenes" | "ended_at">): string[] {
  if (record.scenes.length === 0) return [];
  const minutes = (ms: number) => (ms / 60_000).toFixed(1);
  const rows = record.scenes.map((s) => {
    const end = s.ended_at ?? record.ended_at;
    const took = end ? Date.parse(end) - Date.parse(s.started_at) : undefined;
    const over = took !== undefined && s.target_minutes !== null && took > s.target_minutes * 60_000;
    return `| ${s.id} | ${took === undefined ? "n/a" : minutes(took)}${s.ended_at ? "" : " (not finished)"} | ${s.target_minutes ?? "n/a"}${over ? " (over)" : ""} | ${s.rounds} |`;
  });
  const first = Date.parse(record.scenes[0].started_at);
  const last = record.scenes.at(-1)!.ended_at ?? record.ended_at;
  const total = last ? minutes(Date.parse(last) - first) : "n/a";
  const target = record.scenes.reduce((n, s) => n + (s.target_minutes ?? 0), 0);
  return ["Scene times:", "", "| Scene | Minutes | Target | Combat rounds |", "|---|---|---|---|", ...rows, `| All | ${total} | ${target} | |`];
}

/** The report's Markdown sections on the run, the usage and the audit. */
export function reportSections(options: {
  run: RunReport | undefined;
  failure?: unknown;
  transcript: TranscriptRecord[];
  usage: UsageRecord[];
  endState: string[];
  audit?: { passed: boolean; output: string };
}): string[] {
  const { run, transcript, usage } = options;
  const lines = (kind: string) => transcript.filter((r) => r.channel === "run" && r.kind === kind).map((r) => `${r.speaker}: ${r.text}`);
  const outcome = transcript.filter((r) => r.channel === "dm" && r.text.startsWith("Combat is over")).map((r) => r.text);
  // A combat turn is every wake it took, the nudge included, as the loop timed it; a timed-out
  // wake counts at its timeout.
  const turns = run?.playerTurns.map((t) => t.wall_ms) ?? [];
  const wakes = run?.playerTurns.reduce((sum, t) => sum + t.wakes, 0) ?? 0;
  const narrations = usage.filter((r) => r.agent === "dm" && r.purpose === "narrate").map((r) => r.wall_ms);
  const out = [
    `- Ended: ${run?.ended ?? `the run failed: ${options.failure instanceof Error ? options.failure.message : String(options.failure)}`}`,
    ...(outcome.length > 0 ? [`- Fights: ${outcome.join(" ")}`] : []),
    `- Fallbacks: ${run?.fallbacks ?? "n/a"}; retries: ${lines("retry").length}; errors and timeouts: ${lines("error").length}`,
    `- Player combat turns: ${turns.length} (${wakes} wakes), p50 ${percentile(turns, 50) || "n/a"} ms, p95 ${percentile(turns, 95) || "n/a"} ms (target ${TARGET_P95_MS.player} ms)`,
    ...(narrations.length > 0
      ? [`- DM narrations: ${narrations.length}, p50 ${percentile(narrations, 50)} ms, p95 ${percentile(narrations, 95)} ms (target ${TARGET_P95_MS.dm} ms)`]
      : []),
    ...talkLines(run?.talkRounds ?? []),
    ...(run ? fightLines(run, usage) : []),
    ...addressLines(transcript),
    "",
    // Per model wake, whether it ended with its result or not: a combat turn can take two.
    "| Agent | Wakes | p50 ms | p95 ms | Input | Cache read | Cache write | Output | API-equivalent $ |",
    "|---|---|---|---|---|---|---|---|---|",
    ...summarize(usage).map(
      (s) =>
        `| ${s.agent} | ${s.turns} | ${s.p50_ms} | ${s.p95_ms} | ${s.input_tokens} | ${s.cache_read_tokens} | ${s.cache_write_tokens} | ${s.output_tokens} | ${s.api_equivalent_usd} |`,
    ),
    "",
    "End state (DM view):",
    ...options.endState.map((line) => `- ${line}`),
  ];
  for (const [title, kind] of [["Retries", "retry"], ["Fallbacks", "fallback"], ["Errors and timeouts", "error"]] as const) {
    const found = lines(kind);
    if (found.length > 0) out.push("", `${title}:`, ...found.map((line) => `- ${line}`));
  }
  if (options.audit) out.push("", `Audit and leak scan: ${options.audit.passed ? "passed" : "FAILED"}`, "", "```", options.audit.output, "```");
  return out;
}
