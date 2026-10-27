// Background reactions in a fight (party talk §5 R1, TASKS.md AGT-34, the R1 spec in the project
// folder). Pure functions: which event in a batch the AI players may react to, and who may. The loop
// wakes every one who may at once, and the first line is heard (spec D1 B).
import type { Event, Handle } from "@nat20-table/engine-client";

/** What happened, in the order a batch's triggers are taken: the first kind in it wins. */
export const TRIGGER_KINDS = ["ally_down", "ally_up", "surrender", "foe_down", "critical", "hit"] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** A trigger: its kind, the event it came from, and whose deed it was when the batch says. */
export interface Trigger {
  kind: TriggerKind;
  seq: number;
  /** The combat round the event happened in. */
  round: number;
  /** The creature it happened to, when one did. */
  subject?: Handle;
  /** Whose deed it was: the roller of a critical hit, else the creature that last acted. */
  by?: Handle;
}

/**
 * Who last acted after `events`: the actor of the latest `action` or `turn_start`, starting from
 * `doer`, the one who last acted before them. A fight's end leaves nobody.
 */
export function doerAfter(events: readonly Event[], doer?: Handle): Handle | undefined {
  for (const event of events) {
    if (event.kind === "combat_over") doer = undefined;
    else if (event.kind === "turn_start" || event.kind === "action") doer = event.actor;
  }
  return doer;
}

/**
 * The trigger the AI players may react to in a batch of events, in the DM's view, or undefined: the
 * first of `TRIGGER_KINDS` the batch holds, the earliest event of that kind. `party` is every
 * character at the table, whoever plays it; `players` are the AI players; `doer` is who last acted
 * before the batch (`doerAfter` of the batches before it), since a turn's own events can come in a
 * batch after its `turn_start`. A trigger is an event every player view carries (a life state, a
 * surrender, a roll's outcome, damage taken), so none depends on what only the DM sees.
 */
export function triggerIn(events: readonly Event[], party: readonly Handle[], players: readonly Handle[], doer?: Handle): Trigger | undefined {
  const found: Trigger[] = [];
  for (const event of events) {
    doer = doerAfter([event], doer);
    if (event.round === null || event.round === undefined) continue;
    const at = { seq: event.seq, round: event.round, ...(doer ? { by: doer } : {}) };
    if (event.kind === "life_state") {
      const ours = party.includes(event.target);
      if (ours && (event.state === "unconscious" || event.state === "dead")) found.push({ kind: "ally_down", subject: event.target, ...at });
      else if (ours && event.state === "conscious") found.push({ kind: "ally_up", subject: event.target, ...at });
      else if (!ours && (event.state === "unconscious" || event.state === "dead")) found.push({ kind: "foe_down", subject: event.target, ...at });
    } else if (event.kind === "surrendered") {
      found.push({ kind: "surrender", ...at });
    } else if (event.kind === "roll" && event.roll.outcome === "critical_hit") {
      const target = event.roll.target ?? undefined;
      if (party.includes(event.roll.roller) || (target && party.includes(target))) {
        found.push({ kind: "critical", ...at, by: event.roll.roller, ...(target ? { subject: target } : {}) });
      }
    } else if (event.kind === "damage_taken" && players.includes(event.target)) {
      found.push({ kind: "hit", subject: event.target, ...at });
    }
  }
  const rank = (t: Trigger) => TRIGGER_KINDS.indexOf(t.kind);
  return found.sort((a, b) => rank(a) - rank(b) || a.seq - b.seq)[0];
}

/**
 * The AI players who may react to `trigger`: conscious, not the creature whose turn comes `next`,
 * and not the one whose deed it was (its own critical hit or kill is for its own turn, R0). The one
 * it happened to may react, unless it is down.
 */
export function mayReact(trigger: Trigger, players: readonly Handle[], conscious: ReadonlySet<Handle>, next?: Handle): Handle[] {
  return players.filter((h) => conscious.has(h) && h !== next && h !== trigger.by);
}
