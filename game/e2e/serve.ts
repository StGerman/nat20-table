// Serves the built page and the recorded seat wires for the page's Playwright replay (AGT-142):
// `/` is game/dist/page, `/fixtures/` is game/test/fixtures. Local only, no writes.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const roots: Array<[string, string]> = [
  ["/fixtures/", path.resolve(here, "../test/fixtures")],
  ["/", path.resolve(here, "../dist/page")],
];
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".jsonl": "application/x-ndjson" };

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const [prefix, root] = roots.find(([p]) => url.pathname.startsWith(p))!;
  const file = path.resolve(root, `.${url.pathname.slice(prefix.length - 1)}`.replace(/\/$/, "/index.html"));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(Number(process.env.PORT ?? 4173), "127.0.0.1");
