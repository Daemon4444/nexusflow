// Real-PostgreSQL test for scripts/migrate-with-lock.mjs (CI has a Postgres
// service). It verifies:
//   1. every migration file is recorded exactly once with a checksum;
//   2. re-running is idempotent;
//   3. a NULL checksum is backfilled from the file;
//   4. a recorded checksum that differs from the file makes the runner fail
//      (both --check-only and apply mode) without applying anything.
// The test restores the original ledger row before exiting.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const migrationDir = path.join(repositoryRoot, "backend/src/db/migrations");
const runner = path.join(repositoryRoot, "scripts/migrate-with-lock.mjs");

function runMigrations(args = []) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, NEXUSFLOW_APP_ROOT: repositoryRoot },
  });
}

function checksum(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(migrationDir, file))).digest("hex");
}

const files = fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
const client = new pg.Client({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

await client.connect();
const probe = "001_initial_schema.sql";
let original = null;
try {
  let result = runMigrations();
  assert.equal(result.status, 0, `initial migrate failed: ${result.stderr}`);
  result = runMigrations();
  assert.equal(result.status, 0, `idempotent migrate failed: ${result.stderr}`);
  assert.match(result.stderr, /pending=0/);

  const rows = (await client.query("SELECT filename, checksum FROM schema_migrations ORDER BY filename")).rows;
  assert.equal(rows.length, files.length, `ledger has ${rows.length}/${files.length} rows`);
  for (const row of rows) {
    assert.ok(files.includes(row.filename), `unexpected ledger row ${row.filename}`);
    assert.equal(row.checksum, checksum(row.filename), `checksum mismatch for ${row.filename}`);
  }
  console.log(`ok - ledger complete with checksums (${rows.length})`);

  original = rows.find((row) => row.filename === probe).checksum;

  await client.query("UPDATE schema_migrations SET checksum = NULL WHERE filename = $1", [probe]);
  result = runMigrations();
  assert.equal(result.status, 0, `backfill run failed: ${result.stderr}`);
  const backfilled = await client.query("SELECT checksum FROM schema_migrations WHERE filename = $1", [probe]);
  assert.equal(backfilled.rows[0].checksum, original);
  console.log("ok - NULL checksum is backfilled from the file");

  await client.query("UPDATE schema_migrations SET checksum = $1 WHERE filename = $2", ["0".repeat(64), probe]);
  result = runMigrations(["--check-only"]);
  assert.notEqual(result.status, 0, "check-only must fail on a checksum mismatch");
  assert.match(result.stderr, /changed after they were applied: 001_initial_schema\.sql/);
  result = runMigrations();
  assert.notEqual(result.status, 0, "apply must fail on a checksum mismatch");
  console.log("ok - edited applied migration is rejected in check-only and apply mode");
} finally {
  if (original) {
    await client.query("UPDATE schema_migrations SET checksum = $1 WHERE filename = $2", [original, probe]);
  }
  await client.end();
}
console.log("migration-ledger-ok");
