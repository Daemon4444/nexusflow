import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { closePool, getPool } from "./pg";

dotenv.config();

// Keep the lock name and destructive-operation guard in sync with
// scripts/migrate-with-lock.mjs so container Jobs and ECS releases
// serialize on the same advisory lock and enforce the same expand-only rule.
const LOCK_NAME = "nexusflow-production-schema-migrations-v1";
const LOCK_TIMEOUT_MS = Number(process.env.NEXUSFLOW_MIGRATION_LOCK_TIMEOUT_MS || "60000");

const DESTRUCTIVE_PATTERN =
  /\b(DROP\s+(TABLE|COLUMN|CONSTRAINT|TYPE|INDEX|VIEW|MATERIALIZED\s+VIEW|FUNCTION|SCHEMA|DATABASE)|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE[\s\S]{0,200}\bRENAME\b|ALTER\s+(TABLE|TYPE)[\s\S]{0,200}\bALTER\s+COLUMN\b[\s\S]{0,200}\bTYPE\b|ALTER\s+TABLE[\s\S]{0,200}\bSET\s+NOT\s+NULL\b)\b/i;

function assertExpandCompatible(migrationDir: string, files: string[]): void {
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
    const withoutComments = sql
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    if (DESTRUCTIVE_PATTERN.test(withoutComments)) {
      throw new Error(
        `migration ${file} contains a destructive/contract operation; use an expand-compatible release`
      );
    }
  }
}

async function main() {
  const migrationDir = path.resolve(__dirname, "migrations");
  const files = fs.readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No migration files found in ${migrationDir}`);
  }
  if (!Number.isSafeInteger(LOCK_TIMEOUT_MS) || LOCK_TIMEOUT_MS <= 0) {
    throw new Error("NEXUSFLOW_MIGRATION_LOCK_TIMEOUT_MS must be a positive integer");
  }

  const client = await getPool().connect();
  let locked = false;
  try {
    await client.query("SELECT set_config('lock_timeout', $1, false)", [`${LOCK_TIMEOUT_MS}ms`]);
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [LOCK_NAME]);
    locked = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query("SELECT filename FROM schema_migrations");
    const applied = new Set(appliedResult.rows.map((row) => String(row.filename)));
    const pending = files.filter((file) => !applied.has(file));
    assertExpandCompatible(migrationDir, pending);

    console.log(`[PG] advisory lock acquired; pending=${pending.length}`);
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[PG] skip ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
      console.log(`[PG] apply ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log("[PG] migrations complete");
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_NAME]);
    }
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("[PG] migration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
