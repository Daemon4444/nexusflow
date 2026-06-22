import crypto from "crypto";
import fs from "fs";
import path from "path";
import { newDb } from "pg-mem";

type PgAdapter = ReturnType<ReturnType<typeof newDb>["adapters"]["createPg"]>;

let adapter: PgAdapter | null = null;

function stripUnsupportedMigrationBlocks(sql: string): string {
  return sql
    .replace(/-- Create update timestamp trigger function[\s\S]*$/m, "")
    .replace(/CREATE INDEX IF NOT EXISTS idx_[^\n]+ ON [^(]+\([^;]+;/g, (statement) => statement);
}

function hashApiKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function iso(daysAgo = 0, minutesAgo = 0): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - minutesAgo * 60 * 1000).toISOString();
}

function seedSql() {
  const userId = "local-user-1";
  const apiKeyId = "local-key-1";
  const apiKey = process.env.LOCAL_TEST_API_KEY || "sk-air-local-test-000000000000000000000000";
  const sessionToken = process.env.LOCAL_TEST_SESSION_TOKEN || "sess-local-test";
  const apiKeyHash = hashApiKey(apiKey);

  return `
    INSERT INTO users (id, phone, email, nickname, balance, password_hash, created_at, updated_at)
    VALUES ('${userId}', NULL, 'local-test@nexusflow.test', 'Local Test User', 25.75, NULL, '${iso(14)}', '${iso(0)}');

    INSERT INTO sessions (id, user_id, token, created_at, expires_at)
    VALUES ('local-session-1', '${userId}', '${sessionToken}', '${iso(0)}', '${iso(-7)}');

    INSERT INTO api_keys (id, user_id, name, key, key_hash, created_at, last_used, usage_count, rate_limit)
    VALUES ('${apiKeyId}', '${userId}', 'Local E2E Key', '${apiKey}', '${apiKeyHash}', '${iso(7)}', '${iso(0, 30)}', 4, 60);

    INSERT INTO transactions (id, user_id, type, amount, balance_after, description, ref_id, created_at)
    VALUES
      ('tx-local-1', '${userId}', 'recharge', 30, 30, 'Test recharge ¥30.00', NULL, '${iso(12)}'),
      ('tx-local-2', '${userId}', 'consumption', 1.75, 28.25, 'qwen3.5-flash call', 'usage-local-1', '${iso(2)}'),
      ('tx-local-3', '${userId}', 'consumption', 2.5, 25.75, 'deepseek-v3.2 call', 'usage-local-2', '${iso(1)}');

    INSERT INTO usage_logs (api_key_id, user_id, model, prompt_tokens, completion_tokens, total_tokens, cost, status, latency_ms, ttft_ms, tpot_ms, created_at)
    VALUES
      ('${apiKeyId}', '${userId}', 'qwen3.5-flash', 420, 96, 516, 0.0012, 'success', 860, 210, 18.4, '${iso(0, 90)}'),
      ('${apiKeyId}', '${userId}', 'deepseek-v3.2', 1800, 430, 2230, 0.0178, 'success', 1420, 360, 21.2, '${iso(0, 45)}'),
      ('${apiKeyId}', '${userId}', 'wan2.6-t2v', 120, 0, 120, 0, 'error', 520, 0, 0, '${iso(0, 20)}');

    INSERT INTO user_rate_limits (id, user_id, model, qpm, tpm, source, created_at, updated_at)
    VALUES
      ('limit-local-default', '${userId}', '*', 60, 100000, 'default', '${iso(14)}', '${iso(14)}'),
      ('limit-local-qwen', '${userId}', 'qwen3.5-flash', 120, 200000, 'admin', '${iso(5)}', '${iso(5)}');

    INSERT INTO rate_limit_requests (id, user_id, model, requested_qpm, requested_tpm, reason, status, admin_reply, reviewed_by, reviewed_at, created_at, updated_at)
    VALUES
      ('rlr-local-1', '${userId}', 'deepseek-v3.2', 300, 500000, 'Local test: need higher throughput during peak hours.', 'pending', NULL, NULL, NULL, '${iso(1)}', '${iso(1)}');

    INSERT INTO tickets (id, user_id, type, subject, description, model, requested_qpm, requested_tpm, status, admin_reply, resolved_at, created_at, updated_at)
    VALUES
      ('ticket-local-1', '${userId}', 'support', 'Local test ticket', 'This is a ticket description for local end-to-end testing, longer than twenty characters.', NULL, NULL, NULL, 'open', NULL, NULL, '${iso(1)}', '${iso(1)}');
  `;
}

export function getMemoryPgAdapter() {
  if (adapter) return adapter;

  const db = newDb({ autoCreateForeignKeyIndices: true });
  const registerRound = (args: any[]) => {
    db.public.registerFunction({
      name: "round",
      args,
      returns: args.length === 1 ? args[0] : "float" as any,
      implementation: (value: number | string, precision?: number) => {
        const numeric = Number(value || 0);
        if (precision === undefined) return Math.round(numeric);
        const factor = 10 ** Number(precision || 0);
        return Math.round(numeric * factor) / factor;
      },
    });
  };
  registerRound(["float" as any]);
  registerRound(["float" as any, "integer" as any]);
  registerRound(["numeric" as any]);
  registerRound(["numeric" as any, "integer" as any]);
  registerRound(["bigint" as any]);
  db.public.registerFunction({
    name: "now",
    returns: "timestamptz" as any,
    implementation: () => new Date(),
    impure: true,
  });
  db.public.registerFunction({
    name: "to_char",
    args: ["timestamptz" as any, "text" as any],
    returns: "text" as any,
    implementation: (value: Date | string, format: string) => {
      const date = new Date(value);
      const pad = (n: number) => String(n).padStart(2, "0");
      if (format === "YYYY-MM") return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
      if (format === "YYYY-MM-DD") return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
      if (format === "YYYY-MM-DD HH24") return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}`;
      if (format === "MM-DD") return `${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
      if (format === "HH24:00") return `${pad(date.getUTCHours())}:00`;
      if (format === "HH24:MI:SS") return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
      return date.toISOString();
    },
  });

  const migrationDir = path.resolve(__dirname, "migrations");
  for (const file of fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort()) {
    if (file === "002_money_numeric.sql") continue;
    const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
    db.public.none(stripUnsupportedMigrationBlocks(sql));
  }
  db.public.none(seedSql());

  adapter = db.adapters.createPg();
  return adapter;
}
