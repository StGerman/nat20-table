// The page for `--seat web` (AGT-144): the built page (game/dist/page, `npm run page:build`) served
// on 127.0.0.1 for one run, so a browser window can sit at the table before the Tauri shell exists.
// Local only, read only, and the seat wire still asks for the run's token.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { REPO } from "../engine.ts";

export const PAGE_DIR = path.join(REPO, "game/dist/page");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg" };

export interface PageHost {
  /** `http://127.0.0.1:<port>`: the one origin the seat wire lets in. */
  origin: string;
  close(): Promise<void>;
}

/** Serves the built page; refuses before the run starts when it was never built. */
export function servePage(root = PAGE_DIR): Promise<PageHost> {
  if (!existsSync(path.join(root, "index.html")) || !existsSync(path.join(root, "main.js"))) {
    return Promise.reject(new Error(`the page is not built: run npm run page:build first (${path.relative(process.cwd(), root)}/ has no index.html or main.js)`));
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const file = path.resolve(root, `.${url.pathname}`.replace(/\/$/, "/index.html"));
    if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    // A file that goes between the check and the read (a page build during a run) fails this request only.
    createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

/** Opens the address in the default browser on a Mac; elsewhere the caller prints it. */
export function openInBrowser(url: string): boolean {
  if (process.platform !== "darwin") return false;
  const child = spawn("open", [url], { stdio: "ignore", detached: true });
  child.on("error", () => undefined);
  child.unref();
  return true;
}
