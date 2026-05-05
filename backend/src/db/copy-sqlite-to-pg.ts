import path from "path";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import { closePool, query, transaction } from "./pg";

dotenv.config();

const sqlitePath = process.env.SQLITE_DB_PATH || path.resolve(__dirname, "../../data/ai-router.db");

const orderedTables = [
  "users",
  "sessions",
  "transactions",
  "payment_orders",
  "api_keys",
  "user_rate_limits",
  "rate_limit_requests",
  "usage_logs",
  "providers",
  "provider_models",
  "async_tasks",
  "provider_capacity",
  "provider_channel_configs",
  "provider_health",
  "tickets",
  "webhooks",
  "webhook_deliveries",
];

const booleanColumns = new Set([
  "processed",
  "is_featured",
  "is_new",
  "is_enabled",
  "is_active",
]);

function sqliteColumns(db: any, table: string): string[] {
  try {
    return (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((col) => col.name);
  } catch {
    return [];
  }
}

async function pgColumns(table: string): Promise<string[]> {
  const result = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return result.rows.map((row) => row.column_name);
}

function normalizeValue(column: string, value: unknown) {
  if (value === undefined) return null;
  if (booleanColumns.has(column)) return value === true || value === 1 || value === "1";
  return value;
}

async function resetSerial(table: string, idColumn: string) {
  await query(
    `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${idColumn}) FROM ${table}), 1), true)`,
    [table, idColumn]
  );
}

async function main() {
  const sqlite = new Database(sqlitePath, { readonly: true });
  console.log(`[PG] copying from ${sqlitePath}`);

  await transaction(async (client) => {
    for (const table of orderedTables) {
      const sourceCols = sqliteColumns(sqlite, table);
      if (sourceCols.length === 0) {
        console.log(`[PG] skip ${table}: not present in SQLite`);
        continue;
      }

      const targetCols = await pgColumns(table);
      if (targetCols.length === 0) {
        console.log(`[PG] skip ${table}: not present in PostgreSQL`);
        continue;
      }

      const cols = sourceCols.filter((col) => targetCols.includes(col));
      if (cols.length === 0) {
        console.log(`[PG] skip ${table}: no common columns`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT ${cols.map((col) => `"${col}"`).join(", ")} FROM ${table}`).all() as Record<string, unknown>[];
      if (rows.length === 0) {
        console.log(`[PG] ${table}: 0 rows`);
        continue;
      }

      const quotedCols = cols.map((col) => `"${col}"`).join(", ");
      const placeholders = cols.map((_, index) => `$${index + 1}`).join(", ");
      const sql = `INSERT INTO ${table} (${quotedCols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

      for (const row of rows) {
        await client.query(sql, cols.map((col) => normalizeValue(col, row[col])));
      }

      console.log(`[PG] ${table}: copied ${rows.length} rows`);
    }
  });

  await resetSerial("usage_logs", "id").catch(() => {});
  await resetSerial("webhook_deliveries", "id").catch(() => {});
  sqlite.close();
  console.log("[PG] copy complete");
}

main()
  .catch((error) => {
    console.error("[PG] copy failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
