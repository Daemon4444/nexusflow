#!/usr/bin/env node
// Keeps docs/README.md honest: every Markdown file under docs/ (outside the
// generated report directories) must be linked from the index, and every
// relative link in the index must exist. Run by CI (npm run test:docs-index).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const docs = path.join(root, "docs");
const index = path.join(docs, "README.md");
// Tool output and verbatim archives: the directory must be linked, files need not be.
const GENERATED_DIRS = ["consistency", "control-plane", "upstream-sync", "pricing"];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith(".md") ? [full] : [];
  });
}

const text = fs.readFileSync(index, "utf8");
const links = [...text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)]
  .map((m) => m[1])
  .filter((href) => !/^[a-z]+:/i.test(href));
const problems = [];
const linked = new Set();
for (const href of links) {
  const target = path.resolve(docs, href);
  if (!fs.existsSync(target)) problems.push(`docs/README.md links to missing ${href}`);
  linked.add(path.relative(docs, target).replace(/\/$/, ""));
}
for (const file of walk(docs)) {
  const rel = path.relative(docs, file);
  if (rel === "README.md") continue;
  const top = rel.split(path.sep)[0];
  if (GENERATED_DIRS.includes(top)) {
    if (!linked.has(top)) problems.push(`docs/README.md does not link the generated directory ${top}/`);
    continue;
  }
  if (!linked.has(rel)) problems.push(`docs/${rel} is not listed in docs/README.md`);
}
if (problems.length) {
  for (const problem of [...new Set(problems)]) console.error(`[docs-index] ${problem}`);
  process.exit(1);
}
console.log(`[docs-index] ok: ${linked.size} entries, every docs/*.md is indexed`);
