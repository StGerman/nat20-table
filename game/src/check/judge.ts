// The narration check's judge (M7 spec §4.3, design §3.4, TASKS.md AGT-9): it reads the DM's
// narration lines with the engine state the digest laid out for each, and reports the lines that
// contradict it through one tool, `report`. It is neither the DM nor a player: it has no game tool,
// its output reaches no agent, and it changes nothing. Each batch of lines is a fresh session, so
// its context never grows; CI runs a scripted judge and never calls a model.
import { z } from "zod";
import { AgentSession, reply, seatTool, type ModelChoice, type SessionConfig, type TurnSession } from "../agents/sdk-session.ts";
import type { DigestRecord, DigestRun, Item } from "./digest.ts";

/** Opus 5.5 at low effort (Stas, D3). */
export const JUDGE_CHOICE: ModelChoice = { model: "claude-opus-5-5", effort: "low" };

/** Narration lines a call (design §3.4): about 15 calls for a full run. */
export const BATCH_LINES = 10;

/** What a flag is about. */
export const FLAG_KINDS = ["hp", "death", "position", "condition", "action", "surrender", "inventory", "identity"] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

/** One contradiction the judge reports. */
export interface JudgeFlag {
  /** The narration's number in the run, from 1, as the batch gives it. */
  line: number;
  /** What the line claims, in a few words. */
  claim: string;
  kind: FlagKind;
  /** The engine lines (their `seq`) that show otherwise; empty when the state block alone does. */
  evidence_seq: number[];
}

/** A prop the narration mentions that the engine doesn't track: listed, not flagged (spec §4.3). */
export interface UntrackedProp {
  line: number;
  item: string;
}

export interface JudgeReport {
  flags: JudgeFlag[];
  untracked: UntrackedProp[];
}

/** Reads one batch of narration lines and reports on it. */
export interface Judge {
  judge(batch: string, lines: number[]): Promise<JudgeReport>;
  close?(): Promise<void>;
}

export const JUDGE_PROMPT = `You check a Dungeons & Dragons game's narration against the rules engine's record. The engine is always right: it resolved every roll, every hit, every move. The Dungeon Master (DM) only describes what happened, and you look for the places where a description says something the engine's state shows is false.

Each message gives you up to ten of the DM's narration lines in order. With each line comes what the engine held at the moment the DM said it: the scene, the mode and round, whose turn it was, every creature with its Hit Points, life state and conditions (and whether it surrendered or fled), which creatures stood next to each other (within 5 ft), each party member's distance in feet to every foe, the engine's own lines since the narration before (each with its seq number), each party member's equipment with quantities, and who the party members are (their names in every language and their pronouns).

Report through the report tool, once per message, with every contradiction you find in the lines you were given. Report a contradiction when a line says, as a fact of the story:
- hp: a creature is unhurt, hurt, nearly dead or healed in a way its Hit Points don't show;
- death: a creature is dead, down or up when its life state says otherwise;
- position: two creatures are next to each other, in melee, or far apart, when their distance says otherwise (more than 5 ft apart is not next to each other);
- condition: a creature is prone, frightened, grappled or otherwise when its conditions say otherwise;
- action: a creature did something the engine lines don't show, or the opposite of what they show (a hit that missed, a spell nobody cast);
- surrender: a creature surrendered, begged for mercy, threw down its weapon or fled when the engine shows no surrender or flight for it, or one the engine shows surrendered is still fighting;
- inventory: only three things. A character uses or holds an item the engine tracks but the character doesn't carry. A consumable (a potion, for one) is used with no engine line for it, or more often than the character carried. Coins or an item change hands that the equipment or the coins don't show;
- identity: a character is called by the wrong pronouns, the wrong name, or the wrong kind of person for who the party list says they are.

Do not report:
- what a line leaves out, mood, weather, smells, sounds, or anything the engine doesn't model;
- a line about what is about to happen, or a plan, or what someone says or hopes;
- anything that matches the state, or that the state can't settle either way;
- props from a character's own story or the scene (bread, a notebook, a lantern, a door): list those as untracked instead, with the line number.

Each flag names the line's number, the claim in a few words, its kind, and the seq numbers of the engine lines that show otherwise (none when the state block alone shows it). Lines may be in any language; judge what they say. If no line contradicts the engine, call report with an empty list of flags. Call report exactly once, and write nothing else.`;

const reportInput = {
  flags: z
    .array(
      z.object({
        line: z.number().int().min(1).describe("The narration line's number, as the message gives it."),
        claim: z.string().min(1).describe("What the line claims, in a few words."),
        kind: z.enum(FLAG_KINDS),
        evidence_seq: z.array(z.number().int().min(0)).describe("The seq numbers of the engine lines that show otherwise; empty when the state block alone shows it."),
      }),
    )
    .describe("Every contradiction in the lines given; empty when there is none."),
  untracked: z
    .array(z.object({ line: z.number().int().min(1), item: z.string().min(1) }))
    .optional()
    .describe("Props the lines mention that the engine doesn't track, listed and not flagged."),
};

/** The judge on a model: one fresh session a batch, with the `report` tool and nothing else. */
export class ModelJudge implements Judge {
  private readonly choice: ModelChoice;
  private readonly open: (config: SessionConfig) => TurnSession;
  private readonly turnTimeoutMs: number;

  constructor(options: { choice?: ModelChoice; open?: (config: SessionConfig) => TurnSession; turnTimeoutMs?: number } = {}) {
    this.choice = options.choice ?? JUDGE_CHOICE;
    this.open = options.open ?? ((c) => new AgentSession(c));
    this.turnTimeoutMs = options.turnTimeoutMs ?? 300_000;
  }

  async judge(batch: string, lines: number[]): Promise<JudgeReport> {
    // A batch with no report is asked again once in a new session: a turn that forgets the tool
    // is the model's slip, not an answer.
    for (let attempt = 1; attempt <= 2; attempt++) {
      let got: JudgeReport | undefined;
      const report = seatTool("report", "Report the contradictions in the lines given (and the untracked props). Call it exactly once.", reportInput, async (args) => {
        const flags = args.flags.filter((f) => lines.includes(f.line));
        got = { flags, untracked: (args.untracked ?? []).filter((u) => lines.includes(u.line)) };
        return reply(`Reported ${flags.length} contradictions.`);
      });
      const session = this.open({ agent: "judge", choice: this.choice, systemPrompt: JUDGE_PROMPT, tools: [report], turnTimeoutMs: this.turnTimeoutMs });
      try {
        await session.turn(batch, "narration check");
      } finally {
        await session.close();
      }
      if (got) return got;
    }
    throw new Error(`the judge never called report for lines ${lines[0]} to ${lines[lines.length - 1]}`);
  }
}

/** A judge for tests: fixed flags, by line, and no model. */
export class ScriptedJudge implements Judge {
  readonly batches: string[] = [];
  private readonly flags: JudgeFlag[];

  constructor(flags: JudgeFlag[] = []) {
    this.flags = flags;
  }

  async judge(batch: string, lines: number[]): Promise<JudgeReport> {
    this.batches.push(batch);
    return { flags: this.flags.filter((f) => lines.includes(f.line)), untracked: [] };
  }
}

const itemText = (i: Item) => `${i.name}${i.quantity === 1 ? "" : ` x${i.quantity}`}${i.equipped ? " (equipped)" : ""}`;

/** The party block every batch opens with: who each member is, and their coins. */
function partyBlock(run: DigestRun): string {
  return run.party
    .map((m) => `- ${m.handle}: called ${m.names.join(", ")}${m.pronouns ? `; pronouns ${m.pronouns}` : ""}${m.coins ? `; coins ${m.coins}` : ""}`)
    .join("\n");
}

/** One line and its state, as the judge reads it. Inventory in full when `full`, else only what changed since `before`. */
export function lineBlock(d: DigestRecord, full: boolean, before: DigestRecord | undefined): string {
  const out = [`## Line ${d.line} (${d.channel === "table" ? "to the table" : d.channel.replace("to:", "to ")})`, d.text, ""];
  const where = [`scene ${d.scene ?? "none"}`, d.mode === "combat" ? `combat round ${d.round ?? "?"}` : (d.mode ?? "explore"), d.turn ? `waiting on ${d.turn}` : "", d.combat_over ? "a fight just ended" : ""].filter(Boolean);
  out.push(`State: ${where.join(", ")}.`);
  out.push("Creatures:");
  for (const c of d.creatures) {
    const marks = [c.surrendered ? "surrendered" : "", c.offered_surrender ? "offered to surrender" : "", ...(c.conditions ?? [])].filter(Boolean);
    out.push(`- ${c.handle} (${c.name}, ${c.side}): ${c.hp}/${c.hp_max} HP${c.temp_hp ? ` +${c.temp_hp} temp` : ""}, ${c.life_state}${marks.length > 0 ? `, ${marks.join(", ")}` : ""}`);
  }
  if (d.fled.length > 0) out.push(`Fled the scene: ${d.fled.join(", ")}.`);
  out.push(`Next to each other: ${d.adjacent.length > 0 ? d.adjacent.map((p) => `${p[0]} and ${p[1]}`).join("; ") : "nobody"}.`);
  const foes = Object.entries(d.foes_ft);
  if (foes.length > 0) {
    out.push("Feet from each party member to each foe:");
    for (const [member, each] of foes) out.push(`- ${member}: ${Object.entries(each).map(([f, ft]) => `${f} ${ft}`).join(", ")}`);
  }
  out.push(d.engine_lines.length > 0 ? "Engine lines since the line before:" : "No engine lines since the line before.");
  for (const l of d.engine_lines) out.push(`  ${l}`);
  const shown = d.inventory.filter(([member, items]) => {
    if (full) return true;
    const was = before?.inventory.find(([m]) => m === member)?.[1];
    return JSON.stringify(was) !== JSON.stringify(items);
  });
  if (shown.length > 0) {
    out.push(full ? "Equipment:" : "Equipment that changed:");
    for (const [member, items] of shown) out.push(`- ${member}: ${items.map(itemText).join(", ") || "nothing"}`);
  } else out.push("Equipment: unchanged.");
  return out.join("\n");
}

/** The batches the judge reads: each opens with the party and the full equipment, so a fresh session has the baseline. */
export function batches(run: DigestRun, size = BATCH_LINES): Array<{ lines: number[]; text: string }> {
  const out: Array<{ lines: number[]; text: string }> = [];
  for (let at = 0; at < run.digests.length; at += size) {
    const part = run.digests.slice(at, at + size);
    const blocks = part.map((d, i) => lineBlock(d, i === 0, i === 0 ? undefined : part[i - 1]));
    out.push({ lines: part.map((d) => d.line), text: [`# The party`, partyBlock(run), "", ...blocks].join("\n\n") });
  }
  return out;
}

/** One line of `narration-check.jsonl`: a flag Stas confirms or dismisses, or an untracked prop. */
export type CheckLine = ({ id: string; text: string } & JudgeFlag) | { id: string; line: number; item: string; untracked: true };

/** Runs the judge over every batch and numbers what it found (`n<line>-<k>`, `u<line>-<k>`). */
export async function judgeRun(run: DigestRun, judge: Judge, size = BATCH_LINES): Promise<CheckLine[]> {
  const out: CheckLine[] = [];
  const counts = new Map<string, number>();
  const id = (prefix: string, line: number) => {
    const key = `${prefix}${line}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return `${key}-${counts.get(key)}`;
  };
  try {
    for (const batch of batches(run, size)) {
      const report = await judge.judge(batch.text, batch.lines);
      for (const f of report.flags) {
        const text = run.digests.find((d) => d.line === f.line)?.text ?? "";
        out.push({ id: id("n", f.line), ...f, text });
      }
      for (const u of report.untracked) out.push({ id: id("u", u.line), line: u.line, item: u.item, untracked: true });
    }
  } finally {
    await judge.close?.();
  }
  return out;
}
