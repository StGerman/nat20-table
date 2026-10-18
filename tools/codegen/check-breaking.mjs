// Fails when the generated schemas break their readers relative to a base revision, unless the
// protocol major was bumped (CLAUDE.md Rule 2). Three schemas: the wire (`nat20-api.schema.json`,
// whose request side is everything reachable from Request), the scene file
// (`nat20-scene.schema.json`) and the pregen file (`nat20-pregen.schema.json`), both all input:
// the files are written against them.
// Breaking: a type, property, enum value or union variant removed; a type changed; an input-side
// property newly required, or added as required to an object that already existed. Additions pass.
// While the base contract version is a pre-release (`1.0.0-dev.N`), nothing is published yet and
// breaking changes are reported but allowed; each still needs its CHANGELOG.md line.
// Usage: node tools/codegen/check-breaking.mjs --base origin/main
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const SCHEMAS = [
  // [file, root type name, the type whose reachable types are input-side; null: the whole schema]
  ["generated/nat20-api.schema.json", "Nat20Api", "Request"],
  ["generated/nat20-scene.schema.json", "SceneFile", null],
  ["generated/nat20-pregen.schema.json", "PregenFile", null],
];
const baseRef = process.argv[process.argv.indexOf("--base") + 1] || "origin/main";
const major = (s) => s["x-nat20-protocol"]?.major ?? 0;

// Names of every $def reachable from `start`: input-side types, where a new required field breaks senders.
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

// Every named type in a schema, with the root object itself under its own name.
function types(schema, rootName) {
  const { $defs, $schema, title, "x-nat20-protocol": _, ...root } = schema;
  return { ...$defs, [rootName]: root };
}

const problems = [];
let base;
for (const [file, rootName, inputStart] of SCHEMAS) {
  let baseText;
  try {
    baseText = execFileSync("git", ["show", `${baseRef}:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    console.log(`check-breaking: ${baseRef} has no ${file}; nothing to compare.`);
    continue;
  }
  const baseSchema = JSON.parse(baseText);
  const headSchema = JSON.parse(fs.readFileSync(file, "utf8"));
  base ??= baseSchema;
  if (major(headSchema) > major(baseSchema)) {
    console.log(`check-breaking: protocol major ${major(baseSchema)} -> ${major(headSchema)}; breaking changes allowed.`);
    process.exit(0);
  }
  const baseTypes = types(baseSchema, rootName);
  const headTypes = types(headSchema, rootName);
  const inputSide = inputStart ? reachable(headSchema, inputStart) : new Set(Object.keys(headTypes));
  for (const [name, baseDef] of Object.entries(baseTypes)) {
    const headDef = headTypes[name];
    if (!headDef) {
      problems.push(`${file} ${name}: type removed`);
      continue;
    }
    const before = facts(baseDef);
    const after = facts(headDef);
    for (const [path, was] of before) {
      const now = after.get(path);
      if (!now) {
        problems.push(`${file} ${name}${path}: removed`);
        continue;
      }
      if (was.type !== now.type) problems.push(`${file} ${name}${path}: type changed ${was.type} -> ${now.type}`);
      for (const value of was.values) if (!now.values.has(value)) problems.push(`${file} ${name}${path}: enum value ${JSON.stringify(value)} removed`);
      if (inputSide.has(name) && !was.required && now.required) problems.push(`${file} ${name}${path}: newly required in an input type`);
    }
    if (!inputSide.has(name)) continue;
    for (const [path, now] of after) {
      const parent = path.slice(0, path.lastIndexOf("/")) || "/";
      if (now.required && !before.has(path) && before.has(parent)) problems.push(`${file} ${name}${path}: new required field in an input type`);
    }
  }
}
if (!base) process.exit(0);

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
