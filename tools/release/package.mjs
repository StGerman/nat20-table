// Packs a released engine (CON-19): `node tools/release/package.mjs <out.tar.gz>` after
// `cargo build --locked --release -p nat20-api-server -p nat20-duel`. The archive holds `bin/`
// (nat20-api-server, nat20-audit, nat20-digest), core's `assets/` at the pinned rev as `core/` (the
// registries a built binary otherwise reads from the cargo checkout it was built against), core's
// MIT licence, and `engine.json`; beside it goes `<out>.sha256`. `npm run engine:fetch` unpacks it.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.argv[2] ?? 'nat20-engine-darwin-arm64.tar.gz');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 }).trim();

const metadata = JSON.parse(run('cargo', ['metadata', '--format-version', '1', '--locked']));
const core = metadata.packages.find((p) => p.name === 'nat20_core');
if (!core) throw new Error('nat20_core is not in cargo metadata');
const coreRoot = path.resolve(path.dirname(core.manifest_path), '..');
const coreRev = /#([0-9a-f]{40})/.exec(core.id)?.[1] ?? /#([0-9a-f]{40})/.exec(core.source ?? '')?.[1] ?? 'unknown';
const contract = /CONTRACT_VERSION: &str = "([^"]+)"/.exec(readFileSync(path.join(REPO, 'crates/nat20-api-contract/src/lib.rs'), 'utf8'))?.[1] ?? 'unknown';

mkdirSync(path.dirname(out), { recursive: true });
const stage = mkdtempSync(path.join(tmpdir(), 'nat20-engine-'));
mkdirSync(path.join(stage, 'bin'));
for (const bin of ['nat20-api-server', 'nat20-audit', 'nat20-digest']) cpSync(path.join(REPO, 'target/release', bin), path.join(stage, 'bin', bin));
cpSync(path.join(coreRoot, 'assets'), path.join(stage, 'core'), { recursive: true });
rmSync(path.join(stage, 'core/models/geometry/cache'), { recursive: true, force: true });
cpSync(path.join(coreRoot, 'LICENSE'), path.join(stage, 'core/LICENSE'));
const made = { table_commit: run('git', ['rev-parse', 'HEAD']), core_rev: coreRev, contract_version: contract, target: `${process.platform}-${process.arch}`, built_at: new Date().toISOString() };
writeFileSync(path.join(stage, 'engine.json'), JSON.stringify(made, null, 2) + '\n');

execFileSync('tar', ['-czf', out, '-C', stage, '.']);
rmSync(stage, { recursive: true, force: true });
const sha = createHash('sha256').update(readFileSync(out)).digest('hex');
writeFileSync(`${out}.sha256`, `${sha}  ${path.basename(out)}\n`);
console.log(`${out}: ${made.table_commit.slice(0, 7)}, core ${coreRev.slice(0, 7)}, contract ${contract}, sha256 ${sha}`);
