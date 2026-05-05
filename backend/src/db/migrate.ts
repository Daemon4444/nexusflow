import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { closePool, query, transaction } from "./pg";

dotenv.config();

async function main() {
  const migrationDir = path.resolve(__dirname, "migrations");
  const files = fs.readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No migration files found in ${migrationDir}`);
  }

  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const applied = await query("SELECT filename FROM schema_migrations WHERE filename = $1", [file]);
    if (applied.rowCount) {
      console.log(`[PG] skip ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
    console.log(`[PG] apply ${file}`);
    await transaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
    });
  }

  console.log("[PG] migrations complete");
}

main()
  .catch((error) => {
    console.error("[PG] migration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
