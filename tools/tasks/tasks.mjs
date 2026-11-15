#!/usr/bin/env node
// The task list: one OKF concept per task in tasks/<milestone or backlog>/<ID>.md (decision 0085).
//
//   node tools/tasks/tasks.mjs [list] [--all] [<folder>]   open tasks as a Markdown table (--all: closed too)
//   node tools/tasks/tasks.mjs check                       validate every file; CI job `tasks`
//   node tools/tasks/tasks.mjs next <PREFIX>               the next free id, e.g. `next AGT`
//
// No index is committed: this script is the index, so no shared file collects one line per PR.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const TASKS = path.join(ROOT, 'tasks');
const DONE = path.join(ROOT, 'docs/tasks-done.md');

const PREFIXES = ['API', 'ENG', 'MON', 'CHR', 'ITM', 'CHK', 'MAP', 'AGT', 'UPS', 'DAT', 'CON'];
const ENUMS = {
  pri: ['P0', 'P1', 'P2'],
  dest: ['Fork', 'Ours'],
  size: ['XS', 'S', 'M', 'L'],
  state: ['todo', 'partial', 'done', 'wont-do'],
};
const MILESTONE_STATES = ['open', 'done', 'closed', 'dropped'];
const OPEN = new Set(['todo', 'partial']);
const BACKLOG = 'backlog';

/** Flat YAML front matter: `key: value`, the value bare or a JSON string. */
function frontMatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return { error: 'no front matter' };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!kv) return { error: `front matter line is not \`key: value\`: ${line}` };
    let v = kv[2];
    if (v.startsWith('"')) {
      try { v = JSON.parse(v); } catch { return { error: `bad quoted value for ${kv[1]}` }; }
    }
    fm[kv[1]] = v;
  }
  return { fm };
}

function load() {
  const tasks = [];
  const milestones = new Map();
  const errors = [];
  for (const entry of fs.readdirSync(TASKS, { withFileTypes: true })) {
    if (!entry.isDirectory()) { errors.push(`tasks/${entry.name}: only folders at the bundle root`); continue; }
    const dir = path.join(TASKS, entry.name);
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = `tasks/${entry.name}/${f.name}`;
      if (!f.isFile() || !f.name.endsWith('.md')) { errors.push(`${rel}: only .md files, one folder level`); continue; }
      const { fm, error } = frontMatter(path.join(dir, f.name));
      if (error) { errors.push(`${rel}: ${error}`); continue; }
      if (f.name === 'milestone.md') {
        if (fm.type !== 'Milestone') errors.push(`${rel}: type must be Milestone`);
        if (!MILESTONE_STATES.includes(fm.state)) errors.push(`${rel}: state must be one of ${MILESTONE_STATES.join(', ')}`);
        if (!fm.title) errors.push(`${rel}: title is required`);
        milestones.set(entry.name, fm);
        continue;
      }
      if (fm.type !== 'Task') { errors.push(`${rel}: type must be Task`); continue; }
      if (!new RegExp(`^(${PREFIXES.join('|')})-\\d+$`).test(fm.id ?? '')) errors.push(`${rel}: id must be PREFIX-N with a known prefix`);
      if (`${fm.id}.md` !== f.name) errors.push(`${rel}: file name must be <id>.md`);
      if (!fm.title) errors.push(`${rel}: title is required`);
      for (const [k, vals] of Object.entries(ENUMS)) {
        if (!vals.includes(fm[k])) errors.push(`${rel}: ${k} must be one of ${vals.join(', ')}`);
      }
      tasks.push({ ...fm, folder: entry.name, rel });
    }
  }
  for (const folder of new Set(tasks.map(t => t.folder))) {
    if (folder !== BACKLOG && !milestones.has(folder)) errors.push(`tasks/${folder}/: a milestone folder needs milestone.md`);
  }
  return { tasks, milestones, errors };
}

/** Ids of the rows closed before decision 0085, frozen in docs/tasks-done.md. */
function closedIds() {
  const ids = new Set();
  for (const line of fs.readFileSync(DONE, 'utf8').split('\n')) {
    const m = /^\| ([A-Z]+-\d+) \|/.exec(line);
    if (m) ids.add(m[1]);
  }
  return ids;
}

function check() {
  const { tasks, errors } = load();
  const seen = new Map();
  const frozen = closedIds();
  for (const t of tasks) {
    if (seen.has(t.id)) errors.push(`${t.rel}: id ${t.id} also in ${seen.get(t.id)}`);
    seen.set(t.id, t.rel);
    if (frozen.has(t.id)) errors.push(`${t.rel}: id ${t.id} is a closed row in docs/tasks-done.md; take \`next\``);
  }
  if (errors.length) {
    for (const e of errors) console.error(e);
    console.error(`\n${errors.length} problem(s) in tasks/`);
    process.exit(1);
  }
  console.log(`tasks/ ok: ${tasks.length} tasks, ${tasks.filter(t => OPEN.has(t.state)).length} open`);
}

function next(prefix) {
  if (!PREFIXES.includes(prefix)) { console.error(`prefix must be one of ${PREFIXES.join(', ')}`); process.exit(2); }
  const nums = [...load().tasks.map(t => t.id), ...closedIds()]
    .filter(id => id.startsWith(`${prefix}-`)).map(id => Number(id.split('-')[1]));
  console.log(`${prefix}-${Math.max(0, ...nums) + 1}`);
}

function list(args) {
  const all = args.includes('--all');
  const only = args.find(a => !a.startsWith('--'));
  const { tasks, milestones, errors } = load();
  if (errors.length) console.error(`warning: ${errors.length} problem(s); run \`check\``);
  const num = id => [id.split('-')[0], Number(id.split('-')[1])];
  const folders = [...new Set(tasks.map(t => t.folder))]
    .filter(f => !only || f === only)
    .sort((a, b) => (a === BACKLOG) - (b === BACKLOG) || a.localeCompare(b));
  const cell = s => String(s).replace(/\|/g, '\\|');
  for (const folder of folders) {
    const rows = tasks.filter(t => t.folder === folder && (all || OPEN.has(t.state)))
      .sort((a, b) => { const [pa, na] = num(a.id), [pb, nb] = num(b.id); return pa.localeCompare(pb) || na - nb; });
    if (!rows.length) continue;
    const m = milestones.get(folder);
    console.log(`## ${m ? `${m.title} (${m.state})` : 'Backlog'}: tasks/${folder}/\n`);
    console.log('| ID | Title | Pri | Dest | Size | State |\n|---|---|---|---|---|---|');
    for (const t of rows) console.log(`| [${t.id}](${t.rel}) | ${cell(t.title)} | ${t.pri} | ${t.dest} | ${t.size} | ${t.state} |`);
    console.log('');
  }
}

const [cmd = 'list', ...rest] = process.argv.slice(2);
if (cmd === 'check') check();
else if (cmd === 'next') next(rest[0]);
else if (cmd === 'list') list(rest);
else list([cmd, ...rest]);
