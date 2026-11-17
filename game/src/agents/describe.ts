// The person card in the hero's words (AGT-127; allies-in-fights design §6.3): a tool-less agent
// rewords one line of a person's card, `look`, as the human's character would see that person. It
// reads only the viewer's own line, the character's card and the language, never the roster or
// the scenario (Rule 3), and it never acts (Rule 4). `heard` and `remembers` show as authored. A
// reworded line shows only if it passes rules N9 and N10; otherwise, and until one is ready, the
// authored line shows. A slow or failed call shows nothing new: no error, no line.
import { createHash } from "node:crypto";
import type { Handle } from "@nat20-table/engine-client";
import { UsageLimitReached } from "../errors.ts";
import { hasNumber } from "../table/guards.ts";
import type { UsageLog } from "../usage.ts";
import type { Language } from "./language.ts";
import { promptCard } from "./player.ts";
import { AgentSession, type ModelChoice, type SessionConfig, type TurnSession } from "./sdk-session.ts";

/** A call that runs longer gives up silently, and the authored line stays (§6.3). */
export const DESCRIBE_TIMEOUT_MS = 5_000;

/** The default model and effort (§6.3): Haiku at low effort. */
export const DESCRIBE_CHOICE: ModelChoice = { model: "claude-haiku-5-5", effort: "low" };

/** A reworded line may be at most this many times its source's length (rule N10). */
export const DESCRIBE_STRETCH = 1.5;

export interface DescriberConfig {
  /** The human's character: the viewer. */
  handle: Handle;
  /** Its personality card from the pack, as an AI player for it would get it. */
  card: string;
  language?: Language;
  choice?: ModelChoice;
  usage?: UsageLog;
  timeoutMs?: number;
  /** Opens a session; `AgentSession` by default. Tests pass a stand-in, so no model is called. */
  open?: (config: SessionConfig) => TurnSession;
}

/** The describer's system prompt: the character's card, and how to answer. */
export function describePrompt(handle: Handle, card: string, language: Language = "en"): string {
  return [
    `You reword one line that describes a person, as ${handle} would see that person at a tabletop role-playing table. You never play and never act.`,
    "",
    "The character who looks:",
    "",
    promptCard(card),
    "",
    "How to answer:",
    "- One line, nothing before or after it: the same person and the same facts, seen with this character's eye for detail.",
    "- About the person described, in the third person: no I, me, my, we, no feeling, judgement, advice or plan of the one who looks.",
    "- Add no fact, name, place or number the line does not have; keep the person's gender, and keep any \"you\" or \"your company\" as it is.",
    `- At most half again as long as the line.`,
    ...(language === "ru" ? ["- In Russian, in the line's own register."] : []),
  ].join("\n");
}

const FIRST_PERSON = {
  en: /\b(?:i|me|my|mine|myself|we|us|our|ours)\b/iu,
  ru: /(?<![\p{L}])(?:я|меня|мне|мной|мой|моя|моё|мое|мои|моего|моей|моих|моим|мы|нас|нам|нами|наш|наша|наше|наши|нашего|нашей|наших)(?![\p{L}])/iu,
};
/** Advice and verdict words (rule N9): what the viewer should do or think of the person. */
const ADVICE = {
  en: /\b(?:should|must|ought|better|trust|beware|seems?|probably)\b/iu,
  ru: /(?<![\p{L}])(?:следует|стоит|надо|нужно|лучше|доверять|остерегаться|кажется|похоже|наверное|видимо)(?![\p{L}])/iu,
};
const SHE = { en: /\b(?:she|her|hers|herself)\b/iu, ru: /(?<![\p{L}])(?:она|её|ее|ей|неё|нее|ней)(?![\p{L}])/iu };
const HE = { en: /\b(?:he|him|his|himself)\b/iu, ru: /(?<![\p{L}])(?:он|его|ему|него|нему|ним|нём|нем)(?![\p{L}])/iu };
const YOU = { en: /\b(?:you|your|yours)\b/iu, ru: /(?<![\p{L}])(?:вы|вас|вам|вами|ваш|ваша|ваше|ваши|вашего|вашей|ваших|вашим|вашими|вашему)(?![\p{L}])/iu };
const COMPANY = { en: /\bcompany\b/iu, ru: /(?<![\p{L}])отряд/iu };

/**
 * Whether a reworded line may show in place of `source` (rules N9 and N10): no first-person word,
 * advice or verdict; no number; no name from `known` and no capitalised word inside a sentence
 * that the source lacks; the person's gender, and «вы» or «ваш отряд», kept; at most 1.5 times as
 * long. Any doubt keeps the authored line.
 */
export function describedLine(source: string, line: string, language: Language = "en", known: readonly string[] = []): boolean {
  const out = line.trim();
  if (out === "" || out.includes("\n") || out === source) return false;
  if ([...out].length > DESCRIBE_STRETCH * [...source].length) return false;
  if (FIRST_PERSON[language].test(out) || ADVICE[language].test(out)) return false;
  if (hasNumber(out)) return false;
  const words = (text: string) => new Set(text.split(/[^\p{L}\p{M}'’-]+/u).filter(Boolean));
  const own = words(source);
  for (const name of known) if (name && contains(out, name) && !contains(source, name)) return false;
  // A capitalised word inside a sentence is a name; the source must have it.
  for (const sentence of out.split(/(?<=[.!?…])\s+/u)) {
    const inner = sentence.split(/\s+/u).slice(1).map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""));
    if (inner.some((w) => /^\p{Lu}/u.test(w) && !own.has(w))) return false;
  }
  for (const [a, b] of [[SHE, HE], [HE, SHE]] as const) if (a[language].test(source) && !b[language].test(source) && b[language].test(out)) return false;
  if (YOU[language].test(source) && !YOU[language].test(out)) return false;
  if (COMPANY[language].test(source) && !COMPANY[language].test(out)) return false;
  return true;
}

/** `name` as a whole word or phrase in `text`. */
function contains(text: string, name: string): boolean {
  const at = text.indexOf(name);
  if (at < 0) return false;
  const before = text[at - 1];
  const after = text[at + name.length];
  return !(before && /[\p{L}\p{M}]/u.test(before)) && !(after && /[\p{L}\p{M}]/u.test(after));
}

/** A line the describer reworded and the seat showed, for the transcript (AGT-109 reads the pairs). */
export interface Described {
  person: string;
  authored: string;
  shown: string;
}

/**
 * The human's describer: one line at a time, written ahead and cached for the run per person and
 * line (never in the roster, 0071). `shown` answers at once with the checked line when it is
 * ready, else the authored one, and starts the call when none has run for that line.
 */
export class Describer {
  readonly handle: Handle;
  readonly systemPrompt: string;
  private readonly config: DescriberConfig;
  private readonly lines = new Map<string, string | undefined>();
  private readonly pending = new Map<string, Promise<void>>();
  private session: TurnSession | undefined;
  private queue: Promise<void> = Promise.resolve();
  /** The plan's limit was reached: no more calls, every line as authored. */
  private stopped = false;
  /** Each reworded line, the first time it shows. */
  onShown: (pair: Described) => void = () => {};
  private readonly told = new Set<string>();

  constructor(config: DescriberConfig) {
    this.config = config;
    this.handle = config.handle;
    this.systemPrompt = describePrompt(config.handle, config.card, config.language);
  }

  /** The line to show for `person`'s `authored` look: the checked rewording once ready, the authored line until then. */
  shown(person: string, authored: string, known: readonly string[] = []): string {
    const key = `${person}\u0000${createHash("sha256").update(authored).digest("hex")}`;
    if (!this.lines.has(key)) {
      if (!this.pending.has(key) && !this.stopped) {
        // One call at a time on the one session: the lines are written in the order they show.
        const job = this.queue.then(() => this.write(key, authored, known));
        this.queue = job;
        this.pending.set(key, job);
      }
      return authored;
    }
    const line = this.lines.get(key);
    if (line === undefined) return authored;
    if (!this.told.has(key)) {
      this.told.add(key);
      this.onShown({ person, authored, shown: line });
    }
    return line;
  }

  /** Every call started so far, settled: tests and the run's end wait on it. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.pending.values()]);
  }

  private async write(key: string, authored: string, known: readonly string[]): Promise<void> {
    if (this.stopped) {
      this.lines.set(key, undefined);
      this.pending.delete(key);
      return;
    }
    this.session ??= (this.config.open ?? ((c) => new AgentSession(c)))(this.sessionConfig());
    const session = this.session;
    try {
      const result = await session.turn(authored, "describe");
      const line = result.final.trim();
      this.lines.set(key, describedLine(authored, line, this.config.language, known) ? line : undefined);
    } catch (error) {
      // Nobody awaits this call, so nothing is thrown: the limit stops the run through the agents
      // that act, and the card keeps its authored lines. A failed line is not asked again.
      if (error instanceof UsageLimitReached) this.stopped = true;
      this.lines.set(key, undefined);
      if (this.session === session) this.session = undefined;
      await session.close().catch(() => undefined);
    } finally {
      this.pending.delete(key);
    }
  }

  async close(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    await session?.close();
  }

  sessionConfig(): SessionConfig {
    return {
      agent: `describe:${this.handle}`,
      role: "describe",
      choice: this.config.choice ?? DESCRIBE_CHOICE,
      systemPrompt: this.systemPrompt,
      tools: [],
      usage: this.config.usage,
      turnTimeoutMs: this.config.timeoutMs ?? DESCRIBE_TIMEOUT_MS,
    };
  }
}
