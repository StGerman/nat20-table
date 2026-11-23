// The seat wire (AGT-141, Glass Table design §4.1 and §4.2, decision 0090): the messages between the
// table host and a window, over one WebSocket on 127.0.0.1. Not the engine's wire: no engine type
// is defined here, and nothing in it goes to the engine. What the host sends is the seat's own
// events (`TableEvent`, `HumanPrompt`, made for the human's viewer); what the page sends is checked
// strictly here, since it is input. The schema's hash goes out in `hello`, and the page refuses a
// host whose hash is not the one it was built with, as the engine client does with the engine.
// This file reads nothing from the machine, so the page bundles it; the hash is in schema.ts.
import { z } from "zod";

/** The wire's version: bumped on any change to a message, with the hash. */
export const WIRE_VERSION = 1;

/**
 * The WebSocket close code a window gets when another window with the token took its seat (decision
 * 0093: one seat, one window). It is the socket's own frame, not a wire message: a window closed
 * with it stops asking for the seat, where any other close makes it come back and resume.
 */
export const CLOSE_REPLACED = 4001;

const COMMANDS = ["sheet", "where", "map", "options", "log", "usage", "pause", "suggest", "quit"] as const;

/** What the human sends at an open ask: `PlayerIntent` (game/src/table/types.ts). */
export const PlayerIntentSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("text"),
    text: z.string().min(1).max(2000),
    suggestion: z.strictObject({ n: z.int().min(1), edited: z.boolean() }).optional(),
  }),
  z.strictObject({ kind: z.literal("option"), number: z.int().min(1) }),
  z.strictObject({ kind: z.literal("back") }),
  z.strictObject({ kind: z.literal("reaction"), take: z.boolean() }),
  z.strictObject({ kind: z.literal("command"), name: z.enum(COMMANDS) }),
]);

/** Messages from the page to the host. */
export const PageMessageSchema = z.discriminatedUnion("type", [
  /** The answer to the open ask with this id. */
  z.strictObject({ type: z.literal("intent"), id: z.string(), intent: PlayerIntentSchema }),
  /** After a reload or a dropped socket: every event after `seq` again, then the open ask. `seq` 0 is the whole run. */
  z.strictObject({ type: z.literal("resume"), seq: z.int().min(0) }),
  /** A command with no ask open (design §4.2): the table pauses before its next AI wake, or stops between decisions. */
  z.strictObject({ type: z.literal("command"), name: z.enum(["pause", "quit"]) }),
]);

/** A seat event or prompt as the host made it: its own types live in game/src/table/types.ts. */
const Made = z.looseObject({ kind: z.string() });

/** Messages from the host to the page. */
export const HostMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("hello"),
    wire: z.int(),
    hash: z.string(),
    run: z.string(),
    language: z.enum(["en", "ru"]),
    handle: z.string(),
    title: z.string(),
    /** How the seat names each party character, by handle, in the run's language; a handle not named here is shown as the terminal shows it. */
    names: z.record(z.string(), z.string()).optional(),
  }),
  /** One `TableEvent`, numbered from 1 in the order the seat was shown it. */
  z.strictObject({ type: z.literal("event"), seq: z.int().min(1), event: Made }),
  /** The table waits on the human: one `HumanPrompt`, answered by an `intent` with this id. */
  z.strictObject({ type: z.literal("ask"), id: z.string(), prompt: Made }),
  /** Who the table waits on, or nothing named (`Seat.busy`). */
  z.strictObject({ type: z.literal("busy"), on: z.string().optional() }),
  /** The narration as it is written, or cleared (`Seat.preview`). */
  z.strictObject({ type: z.literal("preview"), text: z.string().optional() }),
  /** Suggestions for the open ask (`Seat.suggest`): a call started, its rows, or none. */
  z.strictObject({ type: z.literal("suggest"), state: z.enum(["waiting", "rows", "none"]), rows: z.array(z.string()).optional() }),
  /** The narration of the lines shown failed: show held lines as they are (`Seat.unnarrated`). */
  z.strictObject({ type: z.literal("unnarrated") }),
  /** The table is answering a command the human typed, or is done (`Seat.answering`). */
  z.strictObject({ type: z.literal("answering"), on: z.boolean() }),
  /** An intent or message the host would not take, and why; the open ask stays open. */
  z.strictObject({ type: z.literal("refused"), why: z.string() }),
]);

export type PageMessage = z.infer<typeof PageMessageSchema>;
export type HostMessage = z.infer<typeof HostMessageSchema>;

