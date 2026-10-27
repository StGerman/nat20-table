// Scripted stand-ins for the agents and the human (M6 spec §8: CI never calls a model). They play
// through the same bound tools as the model agents, from a fixed policy, so the loop, bindings,
// transcript and audit are tested deterministically with a seeded engine.
import type { ActionOption, Handle, State } from "@nat20-table/engine-client";
import type { Choice } from "./choices.ts";
import type { DmTools, PlayerTools } from "./tools.ts";
import type { DmAgent, DmWake, HumanPrompt, PlayerAgent, PlayerIntent, PlayerWake, Seat, TableEvent } from "./types.ts";
import { reactingTo, type LegalActionsResult } from "../view.ts";

/** A combat policy: what a scripted player does on its turn. */
export type CombatPolicy = (tools: PlayerTools) => Promise<void>;

/**
 * The default fight: the first option that harms a hostile creature already in reach; with none in
 * reach, walk up to the nearest hostile it can see (dashing first if it is too far) and look again;
 * then end the turn.
 */
export const attackNearest: CombatPolicy = async (tools) => {
  let pick = await nearestAttack(tools, true);
  if (!pick) {
    const look = await tools.look();
    const state = look.data as State | undefined;
    const hostile = state?.view === "player"
      ? [...state.others].filter((c) => c.side === "hostile" && c.health !== "down").sort((a, b) => a.distance_ft - b.distance_ft)[0]
      : undefined;
    if (hostile) {
      const to = { kind: "creature", handle: hostile.handle } as const;
      if (!(await tools.move(to)).ok && (await tools.submitDecision({ option_id: "dash" })).ok) await tools.move(to);
      pick = await nearestAttack(tools, true);
    }
  }
  if (pick) await tools.submitDecision(pick);
  await tools.endTurn();
};

/** The pregens' spells that heal the creature they target. */
const HEALING_SPELLS = new Set(["healing_word", "cure_wounds"]);

/**
 * A fight that looks after the party first (the whole-adventure fixture, AGT-39): a party member who
 * is down gets a healing spell, else a Potion of Healing, from whoever can reach them; then the turn
 * goes on as `attackNearest`. The engine decides whether the spell or the potion takes (Rule 4).
 */
export const rescueThenAttack: CombatPolicy = async (tools) => {
  const state = (await tools.look()).data as State | undefined;
  const down = state?.view === "player" ? state.others.filter((c) => c.side === "party" && c.health === "down").map((c) => c.handle) : [];
  if (down.length > 0) {
    const listed = await tools.legalActions();
    const options = listed.ok ? (listed.data as LegalActionsResult).options : [];
    const heals = [
      ...options.filter((o) => o.spell && HEALING_SPELLS.has(o.spell.id)),
      ...options.filter((o) => o.option_id.startsWith("use/potion_of_healing")),
    ];
    const pick = heals.flatMap((o) => o.targets.filter((t) => down.includes(t.handle) && t.in_range).map((t) => ({ option_id: o.option_id, targets: [t.handle] })))[0];
    if (pick) await tools.submitDecision(pick);
  }
  await attackNearest(tools);
};

async function nearestAttack(tools: PlayerTools, inReachOnly: boolean): Promise<{ option_id: string; targets: string[] } | undefined> {
  const listed = await tools.legalActions();
  if (!listed.ok) return undefined;
  return choose((listed.data as LegalActionsResult).options, inReachOnly);
}

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

function choose(options: ActionOption[], inReachOnly = false): { option_id: string; targets: string[] } | undefined {
  const harmful = options.filter(damages);
  for (const wantInRange of inReachOnly ? [true] : [true, false]) {
    for (const option of harmful) {
      const target = option.targets.find((t) => t.side === "hostile" && (t.in_range || !wantInRange));
      if (target) return { option_id: option.option_id, targets: [target.handle] };
    }
  }
  return undefined;
}

/**
 * The default reaction: take the first one offered, unless it answers another party member (an
 * Opportunity Attack on an ally walking away, which the rules allow and no player takes).
 */
async function reactUnlessAlly(me: Handle, briefing: string, tools: PlayerTools): Promise<void> {
  const about = reactingTo(briefing);
  if (about && about !== me) {
    const state = (await tools.look()).data as State | undefined;
    const others = state?.view === "player" ? state.others : [];
    if (others.some((c) => c.handle === about && c.side === "party")) return void (await tools.react(null));
  }
  await tools.react(0);
}

export interface ScriptedPlayerPolicy {
  combat?: CombatPolicy;
  /** The reaction choice to take, or null to decline. Default: the first one offered, unless it answers an ally. */
  reaction?: (tools: PlayerTools) => Promise<void>;
  /**
   * Answers a hand wake: `SPEAK`, `BOTH`, `ACT: <intent>` or `PASS` (party talk §4.3). Default:
   * BOTH when it has a `declare` policy, so that policy gets the floor, and PASS when it has none.
   */
  hand?: (briefing: string) => Promise<string>;
  /** With the floor: speaks with `say` and returns what it sets out to do, or nothing to pass. */
  declare?: (tools: PlayerTools, briefing: string) => Promise<string | void>;
  granted?: (tools: PlayerTools) => Promise<void>;
  /**
   * Reacts between turns in a fight (party talk R1, AGT-34): speaks with `say`, or returns nothing to
   * pass. Without it the player is never woken to react, so scripted runs play as before.
   */
  bark?: (tools: PlayerTools, briefing: string) => Promise<string | void>;
}

export class ScriptedPlayer implements PlayerAgent {
  readonly handle: Handle;
  private readonly policy: ScriptedPlayerPolicy;
  /** Every briefing it was woken with, for tests. */
  readonly briefings: Array<{ wake: PlayerWake; briefing: string }> = [];
  /** The summaries each new scene's session started from. */
  readonly scenes: string[] = [];
  /** The wakes the loop cancelled while they ran, for tests (a reaction whose moment passed, AGT-34). */
  readonly cancelled: PlayerWake[] = [];
  private running: PlayerWake | undefined;

  constructor(handle: Handle, policy: ScriptedPlayerPolicy = {}) {
    this.handle = handle;
    this.policy = policy;
  }

  get reacts(): boolean {
    return this.policy.bark !== undefined;
  }

  async wake(wake: PlayerWake, briefing: string, tools: PlayerTools): Promise<string | void> {
    this.briefings.push({ wake, briefing });
    this.running = wake;
    try {
      return await this.play(wake, briefing, tools);
    } finally {
      if (this.running === wake) this.running = undefined;
    }
  }

  /** A scripted wake goes on to its end: a cancel is only recorded, and the loop refuses its late tool calls. */
  cancel(): void {
    if (this.running) this.cancelled.push(this.running);
  }

  private async play(wake: PlayerWake, briefing: string, tools: PlayerTools): Promise<string | void> {
    switch (wake) {
      case "combat_turn":
        return (this.policy.combat ?? attackNearest)(tools);
      case "reaction":
        return this.policy.reaction ? this.policy.reaction(tools) : reactUnlessAlly(this.handle, briefing, tools);
      case "hand":
        return this.policy.hand ? this.policy.hand(briefing) : this.policy.declare ? "BOTH" : "PASS";
      case "declare":
        return this.policy.declare?.(tools, briefing);
      case "granted":
        return this.policy.granted?.(tools);
      case "bark":
        return this.policy.bark?.(tools, briefing);
      case "summary":
        return `${this.handle} remembers the scene.`;
    }
  }

  async newScene(summary: string): Promise<void> {
    this.scenes.push(summary);
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
 * A DM for the Milestone 5 yard fight on its own (the step 9 all-AI run and the yard fixture): it
 * opens the scene, starts the fight, narrates every part with one plain line, and ends the
 * adventure when the fight ends.
 */
export function yardDm(encounter = "yard_fight"): ScriptedDm {
  return new ScriptedDm({
    scene_open: async (tools) => {
      await tools.narrate("Goblins and wolves wait in the mill yard.");
      await tools.startCombat(encounter);
    },
    narrate: async (tools) => {
      await offerAnySurrender(tools);
      await tools.narrate("Steel and teeth flash in the yard.");
    },
    combat_over: async (tools) => void (await tools.endAdventure("The yard falls quiet.")),
  });
}

/**
 * Offers the human the surrender the engine shows available, of the creatures it names, whenever
 * there is one (AGT-30, decision D4: a scripted run gets offers, and the scripted human accepts).
 */
export async function offerAnySurrender(tools: DmTools): Promise<void> {
  const state = ((await tools.getState()).data as { state?: State } | undefined)?.state;
  if (state?.view !== "dm") return;
  const surrendering = state.encounters.find((e) => e.running && e.surrender_available)?.surrendering ?? [];
  if (surrendering.length > 0) await tools.offerSurrender(surrendering);
}

/**
 * A DM for a run across scenes without a model (`play:scene -- --dm scripted`): it opens each
 * scene with one plain line and starts the fight `fights` names for it, if any; out of a fight, its
 * first table turn takes the party on to the next scene in `order`; it narrates every part with one
 * plain line, and ends the adventure when a fight ends or the scenes run out.
 */
export function walkOnDm(order: string[], fights: Record<string, string>, party: Handle[]): ScriptedDm {
  let scene = "";
  return new ScriptedDm({
    scene_open: async (tools) => {
      const state = ((await tools.getState()).data as { state?: State } | undefined)?.state;
      scene = state?.view === "dm" ? (state.scene_id ?? "") : "";
      const fight = fights[scene];
      await tools.narrate(fight ? "Foes wait ahead." : "A new place opens before you.");
      if (fight) await tools.startCombat(fight);
    },
    table_turn: async (tools) => {
      const next = order[order.indexOf(scene) + 1];
      if (!next) return void (await tools.endAdventure("The road ends here."));
      await tools.narrate("You move on.");
      await tools.loadScene(next, party);
    },
    narrate: async (tools) => {
      await offerAnySurrender(tools);
      await tools.narrate("Steel and teeth flash.");
    },
    combat_over: async (tools) => void (await tools.endAdventure("The fight is done.")),
  });
}

/** One scene of an adventure as `chainDm` plays it, from the scenario pack. */
export interface ChainScene {
  id: string;
  /** The fight to start when the scene opens, if any. */
  fight?: string;
  /** The scene's checks, asked of the human's character in order when the scene opens. */
  checks: string[];
  /** Whether its exit carries the creatures that surrendered along with the party. */
  captives: boolean;
  /** Whether the party takes a short rest when it opens. */
  rest: boolean;
}

/**
 * The pack's scenes as `chainDm` plays them: each scene's first fight; an exploration scene's every
 * check and any other scene's first one (one interrogation, not two); captives where the exit says
 * so; a short rest in a scene that comes straight after a fight scene and holds no fight.
 */
export function chainScenes(
  scenes: Array<{ id: string; beat: string; checks: Array<{ check: string }>; encounters: Array<{ encounter: string }>; exits: Array<{ carry: string }> }>,
): ChainScene[] {
  return scenes.map((s, i) => ({
    id: s.id,
    ...(s.encounters[0] ? { fight: s.encounters[0].encounter } : {}),
    checks: (s.beat === "exploration" ? s.checks : s.checks.slice(0, 1)).map((c) => c.check),
    captives: s.exits.some((e) => e.carry === "party_and_captives"),
    rest: i > 0 && scenes[i - 1].beat === "fight" && s.encounters.length === 0,
  }));
}

/**
 * A DM for the whole adventure without a model (M7 spec §4.6, AGT-39): it opens each scene with
 * one plain line, short-rests the party where the scene says so (one Hit Point Die for each member
 * down any Hit Points; one at 0 can't rest), asks the scene's checks of the human's character (or
 * the first party member still up), and starts its fight;
 * it narrates every part with one plain line and offers any surrender the engine shows available;
 * out of a fight, its first table turn takes the party, and any captive the exit carries, on to the
 * next scene, and after the last scene it ends the adventure, as it does when a fight leaves nobody
 * in the party standing. The engine rolls every check and
 * decides every outcome (Rule 4): the chain only asks.
 */
export function chainDm(scenes: ChainScene[], party: Handle[], human: Handle): ScriptedDm {
  let at = -1;
  const dmState = async (tools: DmTools) => {
    const state = ((await tools.getState()).data as { state?: State } | undefined)?.state;
    return state?.view === "dm" ? state : undefined;
  };
  return new ScriptedDm({
    scene_open: async (tools) => {
      const state = await dmState(tools);
      at = scenes.findIndex((s) => s.id === state?.scene_id);
      const scene = scenes[at];
      await tools.narrate(scene?.fight ? "Foes wait ahead." : "A new place opens before you.");
      if (!scene || !state) return;
      // Only a creature with Hit Points left may rest or make a check (SRD 5.2.1, Short Rest).
      const up = party.filter((h) => state.creatures.some((c) => c.handle === h && c.hp > 0));
      if (scene.rest && up.length > 0) {
        const hurt = state.creatures.filter((c) => up.includes(c.handle) && c.hp < c.hp_max);
        await tools.shortRest(up, hurt.map((c) => ({ handle: c.handle, count: 1 })));
      }
      const asked = up.includes(human) ? human : up[0];
      if (asked) for (const check of scene.checks) await tools.requestCheck(asked, { kind: "scenario", check_id: check });
      if (scene.fight) await tools.startCombat(scene.fight);
    },
    table_turn: async (tools) => {
      const scene = scenes[at];
      const next = scenes[at + 1];
      if (!next) return void (await tools.endAdventure("The road ends here."));
      const state = await dmState(tools);
      const captives = scene?.captives
        ? (state?.creatures ?? []).filter((c) => c.side === "neutral" && c.life_state === "conscious" && !party.includes(c.handle)).map((c) => c.handle)
        : [];
      await tools.narrate("You move on.");
      await tools.loadScene(next.id, [...party, ...captives]);
    },
    narrate: async (tools) => {
      await offerAnySurrender(tools);
      await tools.narrate("Steel and teeth flash.");
    },
    combat_over: async (tools) => {
      const state = await dmState(tools);
      // A party with nobody standing goes no further.
      if (state && !state.creatures.some((c) => party.includes(c.handle) && c.life_state === "conscious")) {
        return void (await tools.endAdventure("The party falls."));
      }
      await tools.narrate("The fight is over.");
    },
  });
}

/**
 * A human seat that answers from a list of intents in order, then from a fallback policy (by
 * default `ScriptedSeat.pass`). It keeps what the loop showed it, so a policy can pick by rule.
 */
export class ScriptedSeat implements Seat {
  readonly handle: Handle;
  readonly shown: TableEvent[] = [];
  /** The numbered list on screen now: the last options event. */
  choices: Choice[] = [];
  /** The fight policy's place in its turn plan, reset by each "Your turn" status line. */
  private plan = { step: 0, attacks: 0 };
  /** The other party members: a reaction that answers one of them is let pass. */
  readonly allies: ReadonlySet<Handle>;
  private readonly answers: PlayerIntent[];
  private readonly fallback: (prompt: HumanPrompt) => PlayerIntent;

  constructor(
    handle: Handle,
    answers: PlayerIntent[] = [],
    fallback?: (prompt: HumanPrompt, seat: ScriptedSeat) => PlayerIntent,
    allies: Handle[] = [],
  ) {
    this.handle = handle;
    this.answers = [...answers];
    this.fallback = (prompt) => (fallback ?? ScriptedSeat.pass)(prompt, this);
    this.allies = new Set(allies);
  }

  /**
   * Ends every combat turn, waits out of combat, and takes every reaction except one that answers
   * an ally (an Opportunity Attack on a party member walking away, which the rules allow and no
   * player takes).
   */
  static pass(prompt: HumanPrompt, seat: ScriptedSeat): PlayerIntent {
    switch (prompt.kind) {
      case "combat_turn":
      case "pick": {
        const end = seat.choices.find((c) => c.act?.kind === "end_turn");
        return end ? { kind: "option", number: end.number } : { kind: "command", name: "options" };
      }
      case "reaction": {
        const offered = [...seat.shown].reverse().find((e) => e.kind === "reaction");
        const about = offered?.kind === "reaction" ? reactingTo(offered.summary) : undefined;
        return { kind: "reaction", take: !(about && seat.allies.has(about)) };
      }
      case "paused":
        return { kind: "command", name: "pause" };
      case "surrender":
        // The scripted human accepts every surrender it is offered (decision D4).
        return { kind: "option", number: 1 };
      default:
        return { kind: "text", text: "I wait." };
    }
  }

  /**
   * Fights by rule, the way the Milestone 3 trail driver does: attack a hostile in reach; else walk
   * up to the nearest hostile it can see, as far as its movement goes, and when that leaves it out of
   * reach, Dash and walk on; then end the turn.
   */
  static fight(prompt: HumanPrompt, seat: ScriptedSeat): PlayerIntent {
    if (prompt.kind === "pick") {
      const hostile = seat.choices.find((c) => c.target?.side === "hostile");
      return { kind: "option", number: (hostile ?? seat.choices[0]).number };
    }
    if (prompt.kind !== "combat_turn") return ScriptedSeat.pass(prompt, seat);
    const plan = seat.plan;
    const attack = seat.choices.find((c) => harms(c) && c.target?.side === "hostile" && c.target.in_range);
    if (attack && plan.attacks < 3) {
      plan.attacks += 1;
      return { kind: "option", number: attack.number };
    }
    const move = seat.choices.find((c) => c.next?.some((n) => n.act?.kind === "move" && n.target?.side === "hostile"));
    const dash = seat.choices.find((c) => c.act?.kind === "submit" && c.act.decision.option_id === "dash");
    if (plan.step === 0 && move) {
      plan.step = 1;
      return { kind: "option", number: move.number };
    }
    if (plan.step === 1 && dash && move) {
      plan.step = 2;
      return { kind: "option", number: dash.number };
    }
    if (plan.step === 2 && move) {
      plan.step = 3;
      return { kind: "option", number: move.number };
    }
    return ScriptedSeat.pass(prompt, seat);
  }

  show(event: TableEvent): void {
    this.shown.push(event);
    if (event.kind === "options") this.choices = event.choices;
    if (event.kind === "status" && event.text.startsWith("Your turn")) this.plan = { step: 0, attacks: 0 };
  }

  async ask(prompt: HumanPrompt): Promise<PlayerIntent> {
    return this.answers.shift() ?? this.fallback(prompt);
  }
}

/** A line that harms its target: not Help, not a potion. */
function harms(choice: Choice): boolean {
  return choice.act?.kind === "submit" && !choice.act.decision.option_id.startsWith("help/") && !choice.act.decision.option_id.startsWith("use/");
}
