/**
 * Load-test accounts and measurements (docs/load-testing.md).
 *
 *   ts-node src/cli/load-test-account.ts create  --id <suffix> --key-out <file> [--balance 20]
 *   ts-node src/cli/load-test-account.ts report  --id <suffix> [--json]
 *   ts-node src/cli/load-test-account.ts waits   [--seconds 20] [--interval-ms 500]
 *   ts-node src/cli/load-test-account.ts shadow
 *   ts-node src/cli/load-test-account.ts cleanup --id <suffix>
 *
 * Every account is `nf-loadtest-<suffix>` with a `@loadtest.nexusflow.hk`
 * email, so nothing here can touch a customer: report/cleanup refuse any
 * other id, and cleanup refuses an account that has payment orders. The API
 * key is written only to --key-out (created 0600, never overwritten) and the
 * database stores just the mask and SHA-256 hash, exactly like a normal key.
 * `report` exits 3 when the ledger does not reconcile. `waits` and `shadow`
 * are read-only (pg_stat_activity sampling / SCAN of nf:shadow:* counters).
 * Operators only; never run against production without the go/no-go in the
 * load-testing runbook.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { closeDb, db } from "../db/client";

export const LOAD_TEST_PREFIX = "nf-loadtest-";
export const LOAD_TEST_EMAIL_DOMAIN = "loadtest.nexusflow.hk";
export const MAX_LOAD_TEST_BALANCE = 100;

/** Tables that reference users and may hold load-test rows, in delete order. */
const CLEANUP_TABLES: Array<{ table: string; where: string }> = [
  { table: "usage_logs", where: "user_id = $1" },
  { table: "billing_reservations", where: "user_id = $1 OR billing_owner_id = $1" },
  { table: "transactions", where: "user_id = $1" },
  { table: "rate_limit_requests", where: "user_id = $1" },
  { table: "sessions", where: "user_id = $1" },
  { table: "user_rate_limits", where: "user_id = $1" },
  { table: "user_model_discounts", where: "user_id = $1" },
  { table: "api_keys", where: "user_id = $1" },
];

export function loadTestUserId(suffix: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(suffix)) {
    throw new Error("--id must be 1-32 chars of lowercase letters, digits and '-'");
  }
  return `${LOAD_TEST_PREFIX}${suffix}`;
}

export function assertLoadTestUserId(userId: string): void {
  if (!userId.startsWith(LOAD_TEST_PREFIX) || userId.length <= LOAD_TEST_PREFIX.length) {
    throw new Error(`refusing to operate on ${userId}: not a ${LOAD_TEST_PREFIX}* account`);
  }
}

export function parseBalance(raw: string | undefined): number {
  const balance = raw === undefined ? 20 : Number(raw);
  if (!Number.isFinite(balance) || balance <= 0 || balance > MAX_LOAD_TEST_BALANCE) {
    throw new Error(`--balance must be > 0 and <= ${MAX_LOAD_TEST_BALANCE}`);
  }
  return balance;
}

export function percentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export interface LedgerFigures {
  initialBalance: number;
  balance: number;
  usageCost: number;
  transactionAmount: number;
  successCount: number;
  settledReservations: number;
  openReservations: number;
}

/** Money is compared at the 6-decimal ledger precision. */
export function reconcile(f: LedgerFigures): { ok: boolean; problems: string[] } {
  const micros = (value: number) => Math.round(value * 1_000_000);
  const spent = micros(f.initialBalance) - micros(f.balance);
  const problems: string[] = [];
  if (spent !== micros(f.usageCost)) problems.push(`balance spent ${spent / 1e6} != usage cost ${f.usageCost}`);
  if (micros(Math.abs(f.transactionAmount)) !== micros(f.usageCost)) problems.push(`transactions ${f.transactionAmount} != usage cost ${f.usageCost}`);
  if (f.settledReservations !== f.successCount) problems.push(`settled reservations ${f.settledReservations} != successful calls ${f.successCount}`);
  if (f.openReservations !== 0) problems.push(`${f.openReservations} reservations are neither settled nor released`);
  return { ok: problems.length === 0, problems };
}

export async function createLoadTestAccount(suffix: string, balance: number, keyOut: string): Promise<string> {
  const userId = loadTestUserId(suffix);
  const token = "sk-air-" + crypto.randomBytes(24).toString("hex");
  const keyHash = crypto.createHash("sha256").update(token).digest("hex");
  const masked = `${token.slice(0, 12)}••••••••${token.slice(-8)}`;
  // Create the key file first (exclusive, 0600) so a failure never leaves an
  // account whose key nobody holds.
  fs.writeFileSync(keyOut, token, { mode: 0o600, flag: "wx" });
  try {
    await db.transaction(async (client) => {
      const existing = await client.queryOne("SELECT id FROM users WHERE id = $1", [userId]);
      if (existing) throw new Error(`${userId} already exists; run cleanup first`);
      await client.execute(
        "INSERT INTO users (id, email, nickname, balance) VALUES ($1, $2, $3, $4)",
        [userId, `${suffix}@${LOAD_TEST_EMAIL_DOMAIN}`, `loadtest-${suffix}`, balance]
      );
      await client.execute(
        "INSERT INTO api_keys (id, user_id, name, key, key_hash) VALUES ($1, $2, $3, $4, $5)",
        [`${userId}-key`, userId, "load-test", masked, keyHash]
      );
    });
  } catch (error) {
    fs.rmSync(keyOut, { force: true });
    throw error;
  }
  return userId;
}

export async function loadTestReport(userId: string, initialBalance: number) {
  assertLoadTestUserId(userId);
  const user = await db.queryOne<{ balance: string }>("SELECT balance FROM users WHERE id = $1", [userId]);
  if (!user) throw new Error(`${userId} does not exist`);
  const rows = await db.queryMany<{ model: string; status: string; error_code: string | null; latency_ms: number | null; cost: string | null; prompt_tokens: number | null; completion_tokens: number | null }>(
    "SELECT model, status, error_code, latency_ms, cost, prompt_tokens, completion_tokens FROM usage_logs WHERE user_id = $1",
    [userId]
  );
  const reservations = await db.queryMany<{ status: string; n: string }>(
    "SELECT status, COUNT(*) AS n FROM billing_reservations WHERE user_id = $1 GROUP BY status",
    [userId]
  );
  const tx = await db.queryOne<{ n: string; amount: string | null }>(
    "SELECT COUNT(*) AS n, SUM(amount) AS amount FROM transactions WHERE user_id = $1",
    [userId]
  );

  const groups = new Map<string, { model: string; status: string; errorCode: string | null; calls: number; cost: number; promptTokens: number; completionTokens: number; latency: number[] }>();
  let usageCost = 0;
  let successCount = 0;
  for (const row of rows) {
    const key = `${row.model}\u0000${row.status}\u0000${row.error_code ?? ""}`;
    const group = groups.get(key) ?? { model: row.model, status: row.status, errorCode: row.error_code, calls: 0, cost: 0, promptTokens: 0, completionTokens: 0, latency: [] };
    group.calls += 1;
    group.cost += Number(row.cost ?? 0);
    group.promptTokens += Number(row.prompt_tokens ?? 0);
    group.completionTokens += Number(row.completion_tokens ?? 0);
    if (row.latency_ms !== null) group.latency.push(Number(row.latency_ms));
    groups.set(key, group);
    usageCost += Number(row.cost ?? 0);
    if (row.status === "success") successCount += 1;
  }
  const byStatus = Object.fromEntries(reservations.map((r) => [r.status, Number(r.n)]));
  const settled = byStatus.settled ?? 0;
  const open = Object.entries(byStatus).filter(([s]) => s !== "settled" && s !== "released").reduce((sum, [, n]) => sum + n, 0);
  const figures: LedgerFigures = {
    initialBalance,
    balance: Number(user.balance),
    usageCost: Math.round(usageCost * 1e6) / 1e6,
    transactionAmount: Number(tx?.amount ?? 0),
    successCount,
    settledReservations: settled,
    openReservations: open,
  };
  return {
    userId,
    usage: [...groups.values()].map((g) => {
      const sorted = g.latency.sort((a, b) => a - b);
      return {
        model: g.model, status: g.status, errorCode: g.errorCode, calls: g.calls,
        promptTokens: g.promptTokens, completionTokens: g.completionTokens, cost: Math.round(g.cost * 1e6) / 1e6,
        serverLatencyMs: { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99), max: sorted.length ? sorted[sorted.length - 1] : null },
      };
    }),
    reservations: byStatus,
    transactions: Number(tx?.n ?? 0),
    ledger: figures,
    reconciliation: reconcile(figures),
  };
}

export async function cleanupLoadTestAccount(userId: string): Promise<Record<string, number>> {
  assertLoadTestUserId(userId);
  return db.transaction(async (client) => {
    const user = await client.queryOne<{ email: string | null }>("SELECT email FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!user) throw new Error(`${userId} does not exist`);
    if (!String(user.email ?? "").endsWith(`@${LOAD_TEST_EMAIL_DOMAIN}`)) {
      throw new Error(`refusing to delete ${userId}: email is not @${LOAD_TEST_EMAIL_DOMAIN}`);
    }
    const payments = await client.queryOne<{ n: string }>("SELECT COUNT(*) AS n FROM payment_orders WHERE user_id = $1", [userId]);
    if (Number(payments?.n ?? 0) > 0) throw new Error(`refusing to delete ${userId}: it has payment orders`);
    const deleted: Record<string, number> = {};
    for (const { table, where } of CLEANUP_TABLES) {
      deleted[table] = await client.execute(`DELETE FROM ${table} WHERE ${where}`, [userId]);
    }
    deleted.users = await client.execute("DELETE FROM users WHERE id = $1", [userId]);
    return deleted;
  });
}

export async function sampleDbWaits(seconds: number, intervalMs: number) {
  const states: Record<string, number> = {};
  const lockedQueries: Record<string, number> = {};
  let samples = 0;
  let maxNonIdle = 0;
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const rows = await db.queryMany<{ state: string; wait: string; query: string }>(
      `SELECT state,
              COALESCE(wait_event_type, '-') || ':' || COALESCE(wait_event, '-') AS wait,
              LEFT(regexp_replace(query, '\\s+', ' ', 'g'), 100) AS query
         FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'`
    );
    samples += 1;
    maxNonIdle = Math.max(maxNonIdle, rows.length);
    for (const row of rows) {
      states[`${row.state} ${row.wait}`] = (states[`${row.state} ${row.wait}`] ?? 0) + 1;
      if (row.wait.startsWith("Lock:")) lockedQueries[row.query] = (lockedQueries[row.query] ?? 0) + 1;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const connections = await db.queryOne<{ n: string }>("SELECT COUNT(*) AS n FROM pg_stat_activity WHERE datname = current_database()");
  const maxConnections = await db.queryOne<{ max_connections: string }>("SHOW max_connections");
  return {
    samples, maxNonIdle,
    connections: Number(connections?.n ?? 0),
    maxConnections: Number(maxConnections?.max_connections ?? 0),
    states, lockedQueries,
  };
}

async function readShadowCounters(): Promise<Record<string, string | null>> {
  const { getRedis, closeRedis } = await import("../services/redis");
  const redis = getRedis();
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await redis.scan(cursor, "MATCH", "nf:shadow:*", "COUNT", 1000);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== "0");
    keys.sort();
    const out: Record<string, string | null> = {};
    for (const key of keys) out[key] = await redis.get(key);
    return out;
  } finally {
    await closeRedis();
  }
}

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const [command, ...argv] = process.argv.slice(2);
  const suffix = argValue(argv, "--id");
  if (command === "create") {
    const keyOut = argValue(argv, "--key-out");
    if (!suffix || !keyOut) throw new Error("create needs --id and --key-out");
    const userId = await createLoadTestAccount(suffix, parseBalance(argValue(argv, "--balance")), keyOut);
    console.log(`[load-test] created ${userId}; key written to ${keyOut} (0600)`);
  } else if (command === "report") {
    if (!suffix) throw new Error("report needs --id");
    const report = await loadTestReport(loadTestUserId(suffix), parseBalance(argValue(argv, "--balance")));
    if (argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else {
      console.table(report.usage.map((u) => ({ ...u, serverLatencyMs: JSON.stringify(u.serverLatencyMs) })));
      console.log("reservations", report.reservations, "transactions", report.transactions);
      console.log("ledger", report.ledger);
      console.log(report.reconciliation.ok ? "[load-test] ledger reconciled" : `[load-test] NOT RECONCILED: ${report.reconciliation.problems.join("; ")}`);
    }
    if (!report.reconciliation.ok) process.exitCode = 3;
  } else if (command === "waits") {
    const seconds = Number(argValue(argv, "--seconds") ?? 20);
    const intervalMs = Number(argValue(argv, "--interval-ms") ?? 500);
    console.log(JSON.stringify(await sampleDbWaits(seconds, intervalMs), null, 2));
  } else if (command === "shadow") {
    const counters = await readShadowCounters();
    console.log(Object.keys(counters).length ? JSON.stringify(counters, null, 2) : "[load-test] no nf:shadow:* counters (zero shadow differences)");
  } else if (command === "cleanup") {
    if (!suffix) throw new Error("cleanup needs --id");
    console.log(JSON.stringify(await cleanupLoadTestAccount(loadTestUserId(suffix))));
  } else {
    throw new Error("usage: load-test-account.ts create|report|waits|shadow|cleanup (see file header)");
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`[load-test] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
