/**
 * PostgreSQL Service
 *
 * 替代 SQLite，支持：
 * - 连接池
 * - 更高并发写入
 * - 更丰富的查询能力
 */

import pg from "pg";
import dotenv from "dotenv";
import { resolvePgPassword } from "./pg-password";

dotenv.config();

const { Pool } = pg;

// PostgreSQL 连接池配置
const poolConfig = {
  host: process.env.PG_HOST || "localhost",
  port: parseInt(process.env.PG_PORT || "5432"),
  user: process.env.PG_USER || "quadrant",
  database: process.env.PG_DATABASE || "quadrant",
  max: 20, // 最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// 创建连接池
let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ ...poolConfig, password: resolvePgPassword() });

    pool.on("connect", () => {
      console.log("[PostgreSQL] 新连接建立");
    });

    pool.on("error", (err) => {
      console.error("[PostgreSQL] 连接池错误:", err.message);
    });
  }
  return pool;
}

// 关闭连接池
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ============================================================
// 查询辅助函数
// ============================================================

/**
 * 执行查询
 */
export async function query(sql: string, params?: any[]): Promise<pg.QueryResult> {
  const client = getPool();
  return await client.query(sql, params);
}

/**
 * 执行查询并返回单行
 */
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const result = await query(sql, params);
  return result.rows.length > 0 ? result.rows[0] as T : null;
}

/**
 * 执行查询并返回多行
 */
export async function queryMany<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const result = await query(sql, params);
  return result.rows as T[];
}

/**
 * 执行事务
 */
export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// 数据访问层 - 用户
// ============================================================

export interface UserRow {
  id: string;
  phone: string;
  nickname: string;
  balance: number;
  created_at: Date;
  updated_at: Date;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  return await queryOne<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
}

export async function getUserByPhone(phone: string): Promise<UserRow | null> {
  return await queryOne<UserRow>("SELECT * FROM users WHERE phone = $1", [phone]);
}

export async function createUser(id: string, phone: string, nickname: string = ""): Promise<UserRow> {
  const result = await queryOne<UserRow>(
    "INSERT INTO users (id, phone, nickname) VALUES ($1, $2, $3) RETURNING *",
    [id, phone, nickname]
  );
  return result!;
}

export async function updateUserBalance(id: string, balance: number): Promise<void> {
  await query("UPDATE users SET balance = $1 WHERE id = $2", [balance, id]);
}

// ============================================================
// 数据访问层 - API Keys
// ============================================================

export interface ApiKeyRow {
  id: string;
  user_id: string | null;
  name: string;
  key: string;
  created_at: Date;
  last_used: Date | null;
  usage_count: number;
  rate_limit: number;
}

export async function getApiKeyByKey(key: string): Promise<ApiKeyRow | null> {
  return await queryOne<ApiKeyRow>("SELECT * FROM api_keys WHERE key = $1", [key]);
}

export async function getApiKeysByUser(userId: string): Promise<ApiKeyRow[]> {
  return await queryMany<ApiKeyRow>(
    "SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
}

export async function createApiKey(
  id: string,
  userId: string | null,
  name: string,
  key: string,
  rateLimit: number = 60
): Promise<ApiKeyRow> {
  const result = await queryOne<ApiKeyRow>(
    "INSERT INTO api_keys (id, user_id, name, key, rate_limit) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [id, userId, name, key, rateLimit]
  );
  return result!;
}

export async function deleteApiKey(id: string): Promise<boolean> {
  const result = await query("DELETE FROM api_keys WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateApiKeyUsage(id: string): Promise<void> {
  await query(
    "UPDATE api_keys SET usage_count = usage_count + 1, last_used = NOW() WHERE id = $1",
    [id]
  );
}

// ============================================================
// 数据访问层 - 交易流水
// ============================================================

export interface TransactionRow {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  ref_id: string | null;
  created_at: Date;
}

export async function createTransaction(
  id: string,
  userId: string,
  type: string,
  amount: number,
  balanceAfter: number,
  description: string,
  refId?: string
): Promise<TransactionRow> {
  const result = await queryOne<TransactionRow>(
    "INSERT INTO transactions (id, user_id, type, amount, balance_after, description, ref_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
    [id, userId, type, amount, balanceAfter, description, refId || null]
  );
  return result!;
}

export async function getTransactionsByUser(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ rows: TransactionRow[]; total: number }> {
  const rows = await queryMany<TransactionRow>(
    "SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    [userId, limit, offset]
  );
  const countResult = await queryOne<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM transactions WHERE user_id = $1",
    [userId]
  );
  return { rows, total: countResult?.cnt || 0 };
}

// ============================================================
// 数据访问层 - 使用日志
// ============================================================

export interface UsageLogRow {
  id: number;
  api_key_id: string | null;
  user_id: string | null;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  status: string;
  latency_ms: number;
  created_at: Date;
}

export async function logUsagePg(params: {
  apiKeyId?: string;
  userId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  status: string;
  latencyMs: number;
}): Promise<void> {
  await query(
    `INSERT INTO usage_logs (api_key_id, user_id, model, prompt_tokens, completion_tokens, total_tokens, cost, status, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [params.apiKeyId, params.userId, params.model, params.promptTokens, params.completionTokens,
     params.totalTokens, params.cost, params.status, params.latencyMs]
  );
}

export async function getUsageLogsByUser(
  userId: string,
  limit: number = 100
): Promise<UsageLogRow[]> {
  return await queryMany<UsageLogRow>(
    "SELECT * FROM usage_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
}

// ============================================================
// 数据访问层 - 异步任务
// ============================================================

export interface AsyncTaskRow {
  id: string;
  user_id: string | null;
  api_key_id: string | null;
  type: string;
  model: string;
  provider: string;
  status: string;
  input: any;
  output: any | null;
  upstream_task_id: string | null;
  error_message: string | null;
  progress: number;
  cost: number;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export async function createTaskPg(params: {
  id: string;
  userId?: string;
  apiKeyId?: string;
  type: string;
  model: string;
  provider: string;
  input: any;
}): Promise<AsyncTaskRow> {
  const result = await queryOne<AsyncTaskRow>(
    `INSERT INTO async_tasks (id, user_id, api_key_id, type, model, provider, status, input)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7) RETURNING *`,
    [params.id, params.userId, params.apiKeyId, params.type, params.model, params.provider, JSON.stringify(params.input)]
  );
  return result!;
}

export async function getTaskByIdPg(id: string): Promise<AsyncTaskRow | null> {
  const row = await queryOne<AsyncTaskRow>("SELECT * FROM async_tasks WHERE id = $1", [id]);
  if (row) {
    row.input = typeof row.input === "string" ? JSON.parse(row.input) : row.input;
    row.output = row.output ? (typeof row.output === "string" ? JSON.parse(row.output) : row.output) : null;
  }
  return row;
}

export async function updateTaskStatusPg(id: string, status: string, progress: number): Promise<void> {
  await query(
    "UPDATE async_tasks SET status = $1, progress = $2 WHERE id = $3",
    [status, progress, id]
  );
}

export async function completeTaskPg(id: string, output: any, cost: number): Promise<void> {
  await query(
    "UPDATE async_tasks SET status = 'succeeded', output = $1, progress = 100, cost = $2, completed_at = NOW() WHERE id = $3",
    [JSON.stringify(output), cost, id]
  );
}

export async function failTaskPg(id: string, errorMessage: string): Promise<void> {
  await query(
    "UPDATE async_tasks SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2",
    [errorMessage, id]
  );
}

// ============================================================
// 数据访问层 - Webhooks
// ============================================================

export interface WebhookRow {
  id: string;
  user_id: string;
  url: string;
  secret: string | null;
  events: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function getWebhooksByUser(userId: string): Promise<WebhookRow[]> {
  const rows = await queryMany<WebhookRow>(
    "SELECT * FROM webhooks WHERE user_id = $1 AND is_active = true",
    [userId]
  );
  return rows.map(row => ({
    ...row,
    events: typeof row.events === "string" ? JSON.parse(row.events) : row.events
  }));
}

export async function createWebhook(
  id: string,
  userId: string,
  url: string,
  secret?: string,
  events: string[] = ["task.completed", "task.failed"]
): Promise<WebhookRow> {
  const result = await queryOne<WebhookRow>(
    "INSERT INTO webhooks (id, user_id, url, secret, events) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [id, userId, url, secret || null, JSON.stringify(events)]
  );
  return result!;
}

export default {
  getPool,
  closePool,
  query,
  queryOne,
  queryMany,
  transaction,
  // User
  getUserById,
  getUserByPhone,
  createUser,
  updateUserBalance,
  // API Keys
  getApiKeyByKey,
  getApiKeysByUser,
  createApiKey,
  deleteApiKey,
  updateApiKeyUsage,
  // Transactions
  createTransaction,
  getTransactionsByUser,
  // Usage Logs
  logUsagePg,
  getUsageLogsByUser,
  // Tasks
  createTaskPg,
  getTaskByIdPg,
  updateTaskStatusPg,
  completeTaskPg,
  failTaskPg,
  // Webhooks
  getWebhooksByUser,
  createWebhook,
};