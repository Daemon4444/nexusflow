const fs = require("node:fs");
const path = require("node:path");

const sourceDir = path.resolve(__dirname, "../src/db/migrations");
const targetDir = path.resolve(__dirname, "../dist/db/migrations");
const migrations = fs.readdirSync(sourceDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (migrations.length === 0) {
  throw new Error(`No SQL migrations found in ${sourceDir}`);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
for (const migration of migrations) {
  fs.copyFileSync(
    path.join(sourceDir, migration),
    path.join(targetDir, migration)
  );
}

console.log(`[build] copied ${migrations.length} SQL migrations`);
