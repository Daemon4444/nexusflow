import dotenv from "dotenv";
import { closePool, queryOne } from "./pg";

dotenv.config();

const tables = [
  "users",
  "sessions",
  "api_keys",
  "transactions",
  "payment_orders",
  "usage_logs",
  "async_tasks",
  "providers",
  "provider_models",
  "provider_capacity",
  "provider_channel_configs",
  "provider_health",
  "user_rate_limits",
  "rate_limit_requests",
  "tickets",
];

async function count(table: string): Promise<number> {
  const row = await queryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
  return Number(row?.count || 0);
}

async function scalar(sql: string): Promise<number> {
  const row = await queryOne<{ value: string }>(sql);
  return Number(row?.value || 0);
}

async function main() {
  const counts: Record<string, number> = {};
  for (const table of tables) counts[table] = await count(table);

  const fullKeyRows = await scalar("SELECT COUNT(*)::text AS value FROM api_keys WHERE key ~ '^sk-air-[0-9a-f]{48}$'");
  const unhashedRows = await scalar("SELECT COUNT(*)::text AS value FROM api_keys WHERE key_hash IS NULL OR key_hash = ''");
  const negativeBalances = await scalar("SELECT COUNT(*)::text AS value FROM users WHERE balance < 0");
  const orphanTransactions = await scalar(`
    SELECT COUNT(*)::text AS value
    FROM transactions t LEFT JOIN users u ON u.id = t.user_id
    WHERE u.id IS NULL
  `);

  console.log(JSON.stringify({
    ok: fullKeyRows === 0 && unhashedRows === 0 && negativeBalances === 0 && orphanTransactions === 0,
    counts,
    checks: {
      fullKeyRows,
      unhashedRows,
      negativeBalances,
      orphanTransactions,
    },
  }, null, 2));

  if (fullKeyRows || unhashedRows || negativeBalances || orphanTransactions) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[PG] verify failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
