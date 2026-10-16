// Fails when generated/nat20-api.schema.json breaks clients relative to a base revision, unless
// the protocol major was bumped (CLAUDE.md Rule 2).
// Breaking: a type, property, enum value or union variant removed; a type changed; a request-side
// property newly required, or added as required to an object that already existed. Additions pass.
// While the base contract version is a pre-release (`1.0.0-dev.N`), nothing is published yet and
// breaking changes are reported but allowed; each still needs its CHANGELOG.md line.
// Usage: node tools/codegen/check-breaking.mjs --base origin/main
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const SCHEMA = "generated/nat20-api.schema.json";
const baseRef = process.argv[process.argv.indexOf("--base") + 1] || "origin/main";

let baseText;
try {
  baseText = execFileSync("git", ["show", `${baseRef}:${SCHEMA}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch {
  console.log(`check-breaking: ${baseRef} has no ${SCHEMA}; nothing to compare.`);
  process.exit(0);
}
const base = JSON.parse(baseText);
const head = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));

const major = (s) => s["x-nat20-protocol"]?.major ?? 0;
if (major(head) > major(base)) {
  console.log(`check-breaking: protocol major ${major(base)} -> ${major(head)}; breaking changes allowed.`);
  process.exit(0);
}

// Names of every $def reachable from Request: request-side types, where a new required field breaks senders.
function reachable(schema, start) {
  const seen = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (typeof node.$ref === "string") {
      const name = node.$ref.replace("#/$defs/", "");
      if (!seen.has(name)) {
        seen.add(name);
        visit(schema.$defs?.[name]);
      }
    }
    Object.values(node).forEach(visit);
  };
  visit(schema.$defs?.[start]);
  seen.add(start);
  return seen;
}

// Variant key for a oneOf/anyOf entry: its constant, or its tag property's constant, else its position.
function variantKey(entry, index) {
  if (entry?.const !== undefined) return `=${entry.const}`;
  for (const [prop, sub] of Object.entries(entry?.properties ?? {})) if (sub?.const !== undefined) return `${prop}=${sub.const}`;
  if (entry?.$ref) return entry.$ref.replace("#/$defs/", "");
  return `#${index}`;
}

// Flattens one $def into facts: "path" -> { type, required, values }.
function facts(def, path = "", out = new Map()) {
  if (!def || typeof def !== "object") return out;
  out.set(path || "/", { type: JSON.stringify(def.type ?? def.$ref ?? null), values: new Set(def.enum ?? []) });
  const required = new Set(def.required ?? []);
  for (const [prop, sub] of Object.entries(def.properties ?? {})) {
    facts(sub, `${path}/${prop}`, out);
    out.get(`${path}/${prop}`).required = required.has(prop);
  }
  for (const key of ["oneOf", "anyOf"]) (def[key] ?? []).forEach((entry, i) => facts(entry, `${path}|${variantKey(entry, i)}`, out));
  if (def.items) facts(def.items, `${path}[]`, out);
  return out;
}

const problems = [];
const requestSide = reachable(head, "Request");
for (const [name, baseDef] of Object.entries(base.$defs ?? {})) {
  const headDef = head.$defs?.[name];
  if (!headDef) {
    problems.push(`${name}: type removed`);
    continue;
  }
  const before = facts(baseDef);
  const after = facts(headDef);
  for (const [path, was] of before) {
    const now = after.get(path);
    if (!now) {
      problems.push(`${name}${path}: removed`);
      continue;
    }
    if (was.type !== now.type) problems.push(`${name}${path}: type changed ${was.type} -> ${now.type}`);
    for (const value of was.values) if (!now.values.has(value)) problems.push(`${name}${path}: enum value ${JSON.stringify(value)} removed`);
    if (requestSide.has(name) && !was.required && now.required) problems.push(`${name}${path}: newly required in a request type`);
  }
  if (!requestSide.has(name)) continue;
  for (const [path, now] of after) {
    const parent = path.slice(0, path.lastIndexOf("/")) || "/";
    if (now.required && !before.has(path) && before.has(parent)) problems.push(`${name}${path}: new required field in a request type`);
  }
}

const baseVersion = base["x-nat20-protocol"]?.version ?? "";
if (problems.length && baseVersion.includes("-")) {
  console.log(`check-breaking: base is pre-release ${baseVersion}; ${problems.length} breaking change(s) allowed, each needs a CHANGELOG.md line:`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(0);
}
if (problems.length) {
  console.error(`check-breaking: ${problems.length} breaking change(s) vs ${baseRef} without a major bump:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-breaking: no breaking changes vs ${baseRef}.`);
