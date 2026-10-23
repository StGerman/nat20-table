// The pack commands (M6 step 8, TASKS.md MAP-4):
//   npm run pack:check -- [pack ...]   checks each pack; every pack in `scenarios/` when none is named
//   npm run pack:schema                writes `game/schema/adventure.schema.json` from `adventure.ts`
// The check starts the engine, so it needs `cargo build -p nat20-api-server` first. It exits 1 when
// any pack has a problem.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { REPO } from "../engine.ts";
import { SCHEMA_FILE, schemaText } from "./adventure.ts";
import { checkPack, repoPacks } from "./check.ts";

async function check(packs: string[]): Promise<number> {
  let failed = 0;
  for (const pack of packs.length > 0 ? packs : repoPacks()) {
    const report = await checkPack(pack);
    const name = path.relative(process.cwd(), path.resolve(pack)) || ".";
    if (report.problems.length === 0) {
      console.log(`${name}: ok, ${report.title}, ${report.loaded.length} scenes load in order`);
      continue;
    }
    failed += 1;
    console.log(`${name}: ${report.problems.length} problem(s)`);
    for (const problem of report.problems) console.log(`  - ${problem}`);
  }
  return failed > 0 ? 1 : 0;
}

const [command, ...args] = process.argv.slice(2);
if (command === "check") {
  process.exitCode = await check(args);
} else if (command === "schema") {
  writeFileSync(SCHEMA_FILE, schemaText());
  console.log(`wrote ${path.relative(REPO, SCHEMA_FILE)}`);
} else {
  console.error("usage: cli.ts check [pack ...] | cli.ts schema");
  process.exitCode = 2;
}
