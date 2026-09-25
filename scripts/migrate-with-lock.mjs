import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import pg from "pg";

const { Client } = pg;
const releaseRoot = path.resolve(process.env.NEXUSFLOW_APP_ROOT || process.cwd());
const backendEnvExplicit = Boolean(process.env.NEXUSFLOW_BACKEND_ENV);
const backendEnv = process.env.NEXUSFLOW_BACKEND_ENV || path.join(releaseRoot, "backend/.env");
const migrationDir = path.join(releaseRoot, "backend/src/db/migrations");
const lockName = "nexusflow-production-schema-migrations-v1";
const lockTimeoutMs = Number(process.env.NEXUSFLOW_MIGRATION_LOCK_TIMEOUT_MS || "60000");
const argumentsSet = new Set(process.argv.slice(2));
const checkOnly = argumentsSet.delete("--check-only");

if (argumentsSet.size) {
  throw new Error(`unknown migration-gate argument: ${[...argumentsSet][0]}`);
}

function fail(message) {
  console.error(`[migration-gate] ERROR: ${message}`);
  process.exitCode = 1;
}

const destructivePattern =
  /\b(DROP\s+(TABLE|COLUMN|CONSTRAINT|TYPE|INDEX|VIEW|MATERIALIZED\s+VIEW|FUNCTION|SCHEMA|DATABASE)|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE[\s\S]{0,200}\bRENAME\b|ALTER\s+(TABLE|TYPE)[\s\S]{0,200}\bALTER\s+COLUMN\b[\s\S]{0,200}\bTYPE\b|ALTER\s+TABLE[\s\S]{0,200}\bSET\s+NOT\s+NULL\b)\b/i;

// Historic migrations that were reviewed and applied to production before the
// expand gate existed. They are exempt only so that a brand-new database (CI,
// disaster recovery) can be built from the full ledger; a new contract
// migration is still rejected.
const HISTORIC_CONTRACT_MIGRATIONS = new Set(["002_money_numeric.sql"]);

function migrationChecksum(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(migrationDir, file)))
    .digest("hex");
}

function assertExpandCompatible(pending) {
  for (const file of pending) {
    if (HISTORIC_CONTRACT_MIGRATIONS.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
    const withoutComments = sql
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    if (destructivePattern.test(withoutComments)) {
      throw new Error(
        `pending migration ${file} contains a destructive/contract operation; use an expand-compatible release`
      );
    }
  }
}

async function hasChecksumColumn(client) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'schema_migrations' AND column_name = 'checksum'`
  );
  return result.rows.length > 0;
}

// Verifies recorded checksums against the files on disk. When `backfill` is
// true, applied rows whose checksum is still NULL are filled from the current
// file. A recorded checksum that differs from the file is always fatal: an
// applied migration must never be edited in place.
async function verifyChecksums(client, { backfill }) {
  const relationResult = await client.query("SELECT to_regclass('schema_migrations') AS relation");
  if (!relationResult.rows[0]?.relation) return { verified: 0, backfilled: 0 };
  if (!(await hasChecksumColumn(client))) return { verified: 0, backfilled: 0 };
  const rows = (await client.query("SELECT filename, checksum FROM schema_migrations")).rows;
  const onDisk = new Set(fs.readdirSync(migrationDir).filter((file) => file.endsWith(".sql")));
  let verified = 0;
  let backfilled = 0;
  const mismatched = [];
  for (const row of rows) {
    const file = String(row.filename);
    if (!onDisk.has(file)) continue;
    const actual = migrationChecksum(file);
    if (row.checksum === null || row.checksum === undefined || row.checksum === "") {
      if (backfill) {
        await client.query(
          "UPDATE schema_migrations SET checksum = $1 WHERE filename = $2 AND checksum IS NULL",
          [actual, file]
        );
        backfilled += 1;
      }
      continue;
    }
    if (row.checksum !== actual) mismatched.push(file);
    else verified += 1;
  }
  if (mismatched.length) {
    throw new Error(
      `applied migration(s) changed after they were applied: ${mismatched.join(", ")}; add a new migration instead of editing an applied one`
    );
  }
  return { verified, backfilled };
}

async function listPending(client, createTable) {
  if (createTable) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } else {
    const relationResult = await client.query("SELECT to_regclass('schema_migrations') AS relation");
    if (!relationResult.rows[0]?.relation) {
      return fs.readdirSync(migrationDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();
    }
  }

  const appliedResult = await client.query("SELECT filename FROM schema_migrations");
  const applied = new Set(appliedResult.rows.map((row) => String(row.filename)));
  return fs.readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql") && !applied.has(file))
    .sort();
}

async function main() {
  // An explicitly named environment file must exist. The implicit default is
  // optional so CI and local runs can use exported PG_* variables.
  if (backendEnvExplicit || fs.existsSync(backendEnv)) {
    const loaded = dotenv.config({ path: backendEnv, quiet: true });
    if (loaded.error) throw loaded.error;
  }
  if (!fs.existsSync(migrationDir)) throw new Error(`migration directory is missing: ${migrationDir}`);
  if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs <= 0) {
    throw new Error("NEXUSFLOW_MIGRATION_LOCK_TIMEOUT_MS must be a positive integer");
  }

  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  let connectionConfig;
  if (databaseUrl) {
    connectionConfig = { connectionString: databaseUrl };
  } else {
    const required = ["PG_HOST", "PG_USER", "PG_PASSWORD", "PG_DATABASE"];
    const missing = required.filter((key) => !(process.env[key] || "").trim());
    if (missing.length) {
      throw new Error(`database configuration is missing: ${missing.join(", ")}`);
    }
    const port = Number(process.env.PG_PORT || "5432");
    if (!Number.isSafeInteger(port) || port <= 0) throw new Error("PG_PORT must be a positive integer");
    connectionConfig = {
      host: process.env.PG_HOST,
      port,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      database: process.env.PG_DATABASE,
    };
  }

  const client = new Client(connectionConfig);
  await client.connect();
  let locked = false;

  try {
    if (checkOnly) {
      await verifyChecksums(client, { backfill: false });
      const pending = await listPending(client, false);
      assertExpandCompatible(pending);
      console.error(
        `[migration-gate] read-only compatibility check passed; pending=${pending.length}${pending.length ? ` (${pending.join(", ")})` : ""}`
      );
      return;
    }

    await client.query("SELECT set_config('lock_timeout', $1, false)", [`${lockTimeoutMs}ms`]);
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockName]);
    locked = true;
    const pending = await listPending(client, true);
    assertExpandCompatible(pending);
    await verifyChecksums(client, { backfill: false });

    console.error(
      `[migration-gate] advisory lock acquired; pending=${pending.length}${pending.length ? ` (${pending.join(", ")})` : ""}`
    );
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
      console.error(`[migration-gate] apply ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        if (await hasChecksumColumn(client)) {
          await client.query(
            "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
            [file, migrationChecksum(file)]
          );
        } else {
          await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const checksums = await verifyChecksums(client, { backfill: true });
    console.error(
      `[migration-gate] migrations completed under advisory lock; checksums verified=${checksums.verified} backfilled=${checksums.backfilled}`
    );
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockName]);
    }
    await client.end();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
