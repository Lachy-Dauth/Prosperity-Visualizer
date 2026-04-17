#!/usr/bin/env node
// Static import-graph check. Walks every .js file in the repo and
// verifies each relative `import` / `import.meta.url` specifier
// resolves to an existing file. No bare specifiers are allowed — the
// site runs without a bundler so every import must be relative (or a
// fully-qualified URL, though we have none).

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".git")) continue;
    const full = `${dir}/${name}`;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

const files = walk(ROOT);

const errors = [];

// Match `import ... from "..."` and `import("...")` for relative
// specifiers. Also catches `new URL("./foo", import.meta.url)` which
// is how the Worker is constructed.
const staticImport = /\bimport\s+(?:[\s\S]+?from\s+)?["']([^"']+)["']/g;
const dynamicImport = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const newUrl = /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g;

let resolved = 0;

for (const file of files) {
  const text = readFileSync(file, "utf-8");
  for (const re of [staticImport, dynamicImport, newUrl]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const spec = m[1];
      if (/^https?:/.test(spec)) continue;
      if (!spec.startsWith(".") && !spec.startsWith("/")) {
        errors.push(`${file}: bare specifier not allowed: ${spec}`);
        continue;
      }
      const base = spec.startsWith("/") ? ROOT : dirname(file);
      const target = resolve(base, spec.replace(/^\//, ""));
      if (!existsSync(target)) {
        errors.push(`${file}: import target missing: ${spec} -> ${target}`);
      } else {
        resolved++;
      }
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log(`import graph ok: ${resolved} imports across ${files.length} files`);
