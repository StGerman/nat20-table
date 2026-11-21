// The seat wire's hash (AGT-141, decision 0090): the messages are in messages.ts, which the page
// bundles; the hash is made here with node:crypto, and the page's build writes it in.
import { createHash } from "node:crypto";
import { z } from "zod";
import { HostMessageSchema, PageMessageSchema, WIRE_VERSION } from "./messages.ts";

export * from "./messages.ts";

/** The wire as JSON Schema: what the page is built against. */
export function wireSchema(): Record<string, unknown> {
  return { version: WIRE_VERSION, host: z.toJSONSchema(HostMessageSchema), page: z.toJSONSchema(PageMessageSchema) };
}

/** The sha256 of the wire's JSON Schema, sent in `hello`. */
export const WIRE_HASH = createHash("sha256").update(JSON.stringify(wireSchema())).digest("hex");
