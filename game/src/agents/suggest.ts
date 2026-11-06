// Response suggestions for the human (TASKS.md AGT-49; engine/m6/input-line-design.md §7): out of
// combat, one cheap model call drafts three different moves for the human's character, which the
// seat shows as a picker with a last row for the human's own words. The suggester reads what an AI
// player for that character would read and nothing more (Rule 3): its card, its own sheet, what the
// human was shown, and the options the engine offers. It has no tools and never acts (Rule 4): only
// what the human sends reaches the loop. A slow or failed call shows nothing: no error, no line.
import type { Handle } from "@nat20-table/engine-client";
import { UsageLimitReached } from "../errors.ts";
import type { Language } from "./language.ts";
import { promptCard } from "./player.ts";
import { AgentSession, type ModelChoice, type SessionConfig, type TurnSession } from "./sdk-session.ts";
import type { UsageLog } from "../usage.ts";

/** A suggestion call that runs longer gives up silently (§7.1). */
export const SUGGEST_TIMEOUT_MS = 5_000;

/** How many moves one call offers (S2: three, plus the human's own row). */
export const SUGGESTIONS = 3;

/** The longest a suggestion may be to fit its row after `❯ 1. ` at 80 columns (§7.5). */
export const SUGGESTION_MAX = 60;

/** The default model and effort (§7.1): Haiku at low effort. */
export const SUGGEST_CHOICE: ModelChoice = { model: "claude-haiku-5-5", effort: "low" };

export interface SuggesterConfig {
  /** The human's character. */
  handle: Handle;
  /** Its personality card from the pack (CHR-5), as an AI player for it would get it. */
  card: string;
  /** The language the table is played in; the suggestions are written in it. */
  language?: Language;
  choice?: ModelChoice;
  usage?: UsageLog;
  /** The call's limit; `SUGGEST_TIMEOUT_MS` by default. */
  timeoutMs?: number;
  /** Opens a session; `AgentSession` by default. Tests pass a stand-in, so no model is called. */
  open?: (config: SessionConfig) => TurnSession;
}

/** The suggester's system prompt: the character's card, and how to answer. */
export function suggestPrompt(handle: Handle, card: string, language: Language = "en"): string {
  return [
    `You help the person who plays ${handle} at a tabletop role-playing table (D&D 2024 rules) decide what to do next. You never play for them and you never act: you offer three short ideas, and they choose, change or ignore them.`,
    "",
    "Their character:",
    "",
    promptCard(card),
    "",
    "How to answer:",
    `- Exactly ${SUGGESTIONS} lines, one idea each, nothing before or after them, no numbers or bullets.`,
    "- Three different moves, not three wordings of one: one thing to do, one question or line to someone present (a spoken line goes in quotation marks), and one other approach.",
    `- Each line at most ${SUGGESTION_MAX} characters, in the first person or as a plain action ("Look for tracks by the gate").`,
    "- Only what the character could do now, from what they were told and the options they have. Never invent what lies ahead, and never name a number from the rules (no Hit Points, Armor Class, DCs or bonuses).",
    "- In the character's own voice and temperament, from the card.",
    ...(language === "ru" ? ["- Write every line in Russian; the character's name in Russian letters."] : []),
  ].join("\n");
}

/** The model's answer as rows: up to three non-empty lines, stripped of numbers, bullets and outer quotes of a whole row. */
export function suggestionRows(answer: string): string[] {
  return answer
    .split("\n")
    .map((line) => line.trim().replace(/^(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter((line) => line !== "" && line.length <= SUGGESTION_MAX * 2)
    .slice(0, SUGGESTIONS);
}

/** One suggestion call at a time for the human's character; a new call or `cancel` drops the one in flight. */
export class Suggester {
  readonly handle: Handle;
  readonly systemPrompt: string;
  private readonly config: SuggesterConfig;
  private session: TurnSession | undefined;

  constructor(config: SuggesterConfig) {
    this.config = config;
    this.handle = config.handle;
    this.systemPrompt = suggestPrompt(config.handle, config.card, config.language);
  }

  /**
   * Three moves for `briefing` (what the human was shown and may do now), or undefined when the
   * call timed out, was cancelled or failed. A plan limit still stops the run, as for every agent.
   */
  async suggest(briefing: string): Promise<string[] | undefined> {
    this.session ??= (this.config.open ?? ((c) => new AgentSession(c)))(this.sessionConfig());
    const session = this.session;
    try {
      const result = await session.turn(briefing, "suggest");
      const rows = suggestionRows(result.final);
      return rows.length > 0 ? rows : undefined;
    } catch (error) {
      if (error instanceof UsageLimitReached) throw error;
      // A timed-out or cancelled turn's answer may still come: the next call starts a fresh session.
      if (this.session === session) this.session = undefined;
      await session.close().catch(() => undefined);
      return undefined;
    }
  }

  /** The human typed first, or the prompt closed: the call in flight is no longer wanted. */
  cancel(): void {
    this.session?.cancel?.();
  }

  /** A new scene: the next call starts from the briefing alone. */
  async close(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    await session?.close();
  }

  sessionConfig(): SessionConfig {
    return {
      agent: `suggest:${this.handle}`,
      choice: this.config.choice ?? SUGGEST_CHOICE,
      systemPrompt: this.systemPrompt,
      tools: [],
      usage: this.config.usage,
      turnTimeoutMs: this.config.timeoutMs ?? SUGGEST_TIMEOUT_MS,
    };
  }
}
