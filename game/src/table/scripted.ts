// Scripted stand-ins for the agents and the human (M6 spec §8: CI never calls a model). They play
// through the same bound tools as the model agents, from a fixed policy, so the loop, bindings,
// transcript and audit are tested deterministically with a seeded engine.
import type { ActionOption, Handle } from "@nat20-table/engine-client";
import type { DmTools, PlayerTools } from "./tools.ts";
import type { DmAgent, DmWake, HumanPrompt, PlayerAgent, PlayerIntent, PlayerWake, Seat, TableEvent } from "./types.ts";
import type { LegalActionsResult } from "../view.ts";

/** A combat policy: what a scripted player does on its turn. */
export type CombatPolicy = (tools: PlayerTools) => Promise<void>;

/**
 * The default fight: the first option that attacks or harms a hostile creature already in reach,
 * else the first one that names a hostile target (the engine walks there first), then end the turn.
 */
export const attackNearest: CombatPolicy = async (tools) => {
  const listed = await tools.legalActions();
  if (listed.ok) {
    const options = (listed.data as LegalActionsResult).options;
    const pick = choose(options);
    if (pick) await tools.submitDecision(pick);
  }
  await tools.endTurn();
};

/** The pregens' spells that harm the creature they target. Cure Wounds or Guidance on a goblin is no attack. */
const HARMFUL_SPELLS = new Set(["acid_splash", "fire_bolt", "guiding_bolt", "ice_knife", "ray_of_frost", "sacred_flame"]);

/**
 * Whether an option damages the one creature it targets: an attack, or a damaging spell. Help and
 * items help, and an option with variants needs a pick this policy doesn't make.
 */
function damages(option: ActionOption): boolean {
  if (option.targeting !== "single" || option.variants.length > 0) return false;
  if (option.spell) return HARMFUL_SPELLS.has(option.spell.id);
  return !option.option_id.startsWith("help/") && !option.option_id.startsWith("use/");
}

function choose(options: ActionOption[]): { option_id: string; targets: string[] } | undefined {
  const harmful = options.filter(damages);
  for (const wantInRange of [true, false]) {
    for (const option of harmful) {
      const target = option.targets.find((t) => t.side === "hostile" && (t.in_range || !wantInRange));
      if (target) return { option_id: option.option_id, targets: [target.handle] };
    }
  }
  return undefined;
}

export interface ScriptedPlayerPolicy {
  combat?: CombatPolicy;
  /** The reaction choice to take, or null to decline. Default: take the first one offered. */
  reaction?: (tools: PlayerTools) => Promise<void>;
  declare?: (tools: PlayerTools, briefing: string) => Promise<void>;
  granted?: (tools: PlayerTools) => Promise<void>;
}

export class ScriptedPlayer implements PlayerAgent {
  readonly handle: Handle;
  private readonly policy: ScriptedPlayerPolicy;
  /** Every briefing it was woken with, for tests. */
  readonly briefings: Array<{ wake: PlayerWake; briefing: string }> = [];

  constructor(handle: Handle, policy: ScriptedPlayerPolicy = {}) {
    this.handle = handle;
    this.policy = policy;
  }

  async wake(wake: PlayerWake, briefing: string, tools: PlayerTools): Promise<string | void> {
    this.briefings.push({ wake, briefing });
    switch (wake) {
      case "combat_turn":
        return (this.policy.combat ?? attackNearest)(tools);
      case "reaction":
        return this.policy.reaction ? this.policy.reaction(tools) : void (await tools.react(0));
      case "declare":
        return this.policy.declare?.(tools, briefing);
      case "granted":
        return this.policy.granted?.(tools);
      case "summary":
        return `${this.handle} remembers the scene.`;
    }
  }
}

/** A DM script: what the scripted DM does for each kind of wake. Unscripted wakes do nothing. */
export type DmScript = Partial<Record<DmWake, (tools: DmTools, briefing: string) => Promise<string | void>>>;

export class ScriptedDm implements DmAgent {
  private readonly script: DmScript;
  readonly briefings: Array<{ wake: DmWake; briefing: string }> = [];

  constructor(script: DmScript) {
    this.script = script;
  }

  async wake(wake: DmWake, briefing: string, tools: DmTools): Promise<string | void> {
    this.briefings.push({ wake, briefing });
    return this.script[wake]?.(tools, briefing);
  }
}

/**
 * A human seat that answers from a list of intents in order, then a default per prompt kind:
 * end the turn in a fight (`/options` number 0 is never used), take a reaction, pass out of combat.
 */
export class ScriptedSeat implements Seat {
  readonly handle: Handle;
  readonly shown: TableEvent[] = [];
  private readonly answers: PlayerIntent[];
  private readonly fallback: (prompt: HumanPrompt) => PlayerIntent;

  constructor(handle: Handle, answers: PlayerIntent[] = [], fallback?: (prompt: HumanPrompt, seat: ScriptedSeat) => PlayerIntent) {
    this.handle = handle;
    this.answers = [...answers];
    this.fallback = fallback ? (prompt) => fallback(prompt, this) : ScriptedSeat.pass;
  }

  static pass(prompt: HumanPrompt): PlayerIntent {
    switch (prompt.kind) {
      case "combat_turn":
        return { kind: "text", text: "end turn" };
      case "reaction":
        return { kind: "reaction", take: true };
      default:
        return { kind: "text", text: "I wait." };
    }
  }

  show(event: TableEvent): void {
    this.shown.push(event);
  }

  async ask(prompt: HumanPrompt): Promise<PlayerIntent> {
    return this.answers.shift() ?? this.fallback(prompt);
  }
}
