// The person card in the hero's words (AGT-127; allies-in-fights design §6.3): a tool-less agent
// rewords one line of a person's card, `look`, as the human's character would see that person. It
// reads only the viewer's own line, the character's card and the language, never the roster or
// the scenario (Rule 3), and it never acts (Rule 4). `heard` and `remembers` show as authored. A
// reworded line shows only if it passes rules N9 and N10; otherwise, and until one is ready, the
// authored line shows. A slow or failed call shows nothing new: no error, no line.
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

// Word starts, so every declension and derivation counts: «довер» is «доверять», «достойная доверия».
const W = (stems: string) => new RegExp(`(?<![\\p{L}])(?:${stems})`, "iu");
const WORD = (words: string) => new RegExp(`(?<![\\p{L}])(?:${words})(?![\\p{L}])`, "iu");
const FIRST_PERSON = {
  en: WORD("i|me|my|mine|myself|we|us|our|ours|ourselves"),
  ru: WORD("я|меня|мне|мной|мною|мо[йяеёию]\\p{L}*|мы|нас|нам|нами|наш\\p{L}*"),
};
/** Advice, verdict and guesses (rule N9): what the viewer should do or think of the person. */
const ADVICE = {
  en: W("should|must|ought|better|trust|beware|seem|probabl|maybe|perhaps|likel|appear|suspic|honest|kind-hearted|cruel|dangerous|reliab"),
  ru: W("следует|стоит|надо|нужно|можно|должн|лучше|довер|остерег|кажет|похож|наверн|видим|вероятн|возможн|пожалуй|подозр|честн|опасн|надёжн|надежн"),
};
const SHE = { en: WORD("she|her|hers|herself"), ru: WORD("она|её|ее|ей|неё|нее|ней|ею") };
const HE = { en: WORD("he|him|his|himself"), ru: WORD("он|его|ему|него|нему|ним|нём|нем|им") };
/**
 * Gender marks in the line itself (Russian marks it in endings more than in pronouns): a pronoun,
 * «которая» or «который», an adjective's ending, a past tense's.
 */
const SHE_MARK = {
  en: SHE.en,
  ru: new RegExp(`${SHE.ru.source}|(?<![\\p{L}])котор(?:ая|ую)(?![\\p{L}])|\\p{L}{2,}(?:ая|яя|ла)(?![\\p{L}])`, "iu"),
};
const HE_MARK = {
  en: HE.en,
  ru: new RegExp(`${HE.ru.source}|(?<![\\p{L}])котор(?:ый|ого|ому)(?![\\p{L}])|\\p{L}{2,}(?:ый|ий)(?![\\p{L}])|\\p{L}{2,}[аеиоуыя]л(?![\\p{L}])`, "iu"),
};
const YOU = { en: WORD("you|your|yours"), ru: W("вы|вас|вам|вами|ваш") };
const COMPANY = { en: W("company"), ru: W("отряд") };

/** A name's stem: the whole name, less a Russian ending, so «Хайстедс» finds «Хайстедса». */
function stemOf(name: string): string {
  return [...name].length > 4 ? name.replace(/[аяоеуюыиьйё]+$/u, "") : name;
}

/** `name` at a word start in `text`, with at most three letters of ending after it. */
function names(text: string, name: string): boolean {
  const stem = stemOf(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}])${stem}\\p{L}{0,3}(?![\\p{L}])`, "iu").test(text);
}

/**
 * Whether a reworded line may show in place of `source` (rules N9 and N10): no first-person word,
 * advice, verdict or guess; no number; no name from `known` the source lacks, in any ending; every
 * capitalised word, a sentence's first too, one the source has; the person's gendered pronoun
 * kept where the source has one; «вы» or «ваш отряд» kept; at most 1.5 times as long. Any doubt
 * keeps the authored line.
 */
export function describedLine(source: string, line: string, language: Language = "en", known: readonly string[] = []): boolean {
  const out = line.trim();
  if (out === "" || out.includes("\n") || out === source) return false;
  if ([...out].length > DESCRIBE_STRETCH * [...source].length) return false;
  if (FIRST_PERSON[language].test(out) || ADVICE[language].test(out)) return false;
  if (hasNumber(out)) return false;
  for (const name of known) if (name && names(out, name) && !names(source, name)) return false;
  // A capitalised word is a name unless the source has the word: a sentence's first word too, so
  // «Марта, пастушка…» is caught; its stem in the source is enough there («Старая» for «старая»).
  for (const sentence of out.split(/(?<=[.!?…;:])\s+/u)) {
    const words = sentence.split(/\s+/u).map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")).filter(Boolean);
    for (const [i, w] of words.entries()) {
      if (!/^\p{Lu}/u.test(w)) continue;
      if (i === 0 ? !names(source, w) : !new RegExp(`(?<![\\p{L}])${w}(?![\\p{L}])`, "u").test(source)) return false;
    }
  }
  // The person's gender, where the source's pronoun gives it: a mark of it in the line, none of the other.
  for (const [a, b, mark, other] of [[SHE, HE, SHE_MARK, HE_MARK], [HE, SHE, HE_MARK, SHE_MARK]] as const) {
    if (a[language].test(source) && !b[language].test(source) && (other[language].test(out) || !mark[language].test(out))) return false;
  }
  if (YOU[language].test(source) && !YOU[language].test(out)) return false;
  if (COMPANY[language].test(source) && !COMPANY[language].test(out)) return false;
  return true;
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
    const key = `${person}\u0000${authored}`;
    if (!this.lines.has(key)) {
      if (!this.pending.has(key) && !this.stopped) {
        // One call at a time on the one session: the lines are written in the order they show.
        const job = this.queue.then(() => this.write(key, authored, known));
        this.queue = job.catch(() => undefined);
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

  /** Every call asked for so far, settled (they run in order, so the queue's end is theirs). */
  async settled(): Promise<void> {
    await this.queue;
  }

  private async write(key: string, authored: string, known: readonly string[]): Promise<void> {
    if (this.stopped) {
      this.lines.set(key, undefined);
      this.pending.delete(key);
      return;
    }
    let session: TurnSession | undefined;
    try {
      this.session ??= (this.config.open ?? ((c) => new AgentSession(c)))(this.sessionConfig());
      session = this.session;
      const result = await session.turn(authored, "describe");
      const line = result.final.trim();
      this.lines.set(key, describedLine(authored, line, this.config.language, known) ? line : undefined);
    } catch (error) {
      // Nobody awaits this call, so nothing is thrown: the limit stops the run through the agents
      // that act, and the card keeps its authored lines. A failed line is not asked again.
      if (error instanceof UsageLimitReached) this.stopped = true;
      this.lines.set(key, undefined);
      if (session && this.session === session) this.session = undefined;
      await session?.close().catch(() => undefined);
    } finally {
      this.pending.delete(key);
    }
  }

  /** The run is over: no call starts after this one, and the session goes. */
  async close(): Promise<void> {
    this.stopped = true;
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
