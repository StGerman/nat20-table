// Builds the page (AGT-142) into game/dist/page with Bun: `npm run page:build`. The wire's version
// and hash go in as a constant, so the page refuses a host built from another wire (design §4.1).
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WIRE_HASH, WIRE_VERSION } from "../seat-wire/schema.ts";

declare const Bun: {
  build(options: Record<string, unknown>): Promise<{ success: boolean; logs: unknown[] }>;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../dist/page");
// The portraits ride inside main.js as data URLs, so the page stays the three files the hosts serve.
const portraits = path.join(here, "portraits");
const faces = Object.fromEntries(
  readdirSync(portraits)
    .filter((f) => f.endsWith(".jpg"))
    .map((f) => [f.slice(0, -4), `data:image/jpeg;base64,${readFileSync(path.join(portraits, f)).toString("base64")}`]),
);
mkdirSync(out, { recursive: true });
const built = await Bun.build({
  entrypoints: [path.join(here, "main.ts")],
  outdir: out,
  target: "browser",
  minify: process.env.PAGE_DEBUG !== "1",
  define: { __WIRE__: JSON.stringify({ wire: WIRE_VERSION, hash: WIRE_HASH }), __FACES__: JSON.stringify(faces), "process.env.NODE_ENV": '"production"' },
});
if (!built.success) {
  console.error(built.logs);
  process.exit(1);
}
for (const file of ["index.html", "page.css"]) copyFileSync(path.join(here, file), path.join(out, file));
console.log(`page: ${out}`);
