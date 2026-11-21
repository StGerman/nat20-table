// Builds the page (AGT-142) into game/dist/page with Bun: `npm run page:build`. The wire's version
// and hash go in as a constant, so the page refuses a host built from another wire (design §4.1).
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { WIRE_HASH, WIRE_VERSION } from "../seat-wire/schema.ts";

declare const Bun: {
  build(options: Record<string, unknown>): Promise<{ success: boolean; logs: unknown[] }>;
};

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(here, "../../dist/page");
mkdirSync(out, { recursive: true });
const built = await Bun.build({
  entrypoints: [path.join(here, "main.ts")],
  outdir: out,
  target: "browser",
  minify: process.env.PAGE_DEBUG !== "1",
  define: { __WIRE__: JSON.stringify({ wire: WIRE_VERSION, hash: WIRE_HASH }), "process.env.NODE_ENV": '"production"' },
});
if (!built.success) {
  console.error(built.logs);
  process.exit(1);
}
for (const file of ["index.html", "page.css"]) copyFileSync(path.join(here, file), path.join(out, file));
console.log(`page: ${out}`);
