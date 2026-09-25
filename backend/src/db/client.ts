import pg from "pg";
import dotenv from "dotenv";
import { getMemoryPgAdapter } from "./memory";
import { resolvePgPassword } from "./pg-password";

dotenv.config({ quiet: true });

const { Pool } = pg;

type QueryParams = any[];

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    if (process.env.USE_PG_MEM === "true") {
      const memoryPg = getMemoryPgAdapter();
      pool = new memoryPg.Pool() as pg.Pool;
      return pool;
    }

    pool = new Pool({
      host: process.env.PG_HOST || "127.0.0.1",
      port: Number(process.env.PG_PORT || 5432),
      user: process.env.PG_USER || "quadrant",
      password: resolvePgPassword(),
      database: process.env.PG_DATABASE || "quadrant",
      max: Number(process.env.PG_POOL_MAX || 20),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on("error", (err) => {
      console.error("[PostgreSQL] pool error:", err.message);
    });
  }
  return pool;
}

function normalizeSql(sql: string): string {
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  let out = "";

  for (const ch of sql) {
    if (ch === "'" && !inDoubleQuote && !escaped) inSingleQuote = !inSingleQuote;
    if (ch === '"' && !inSingleQuote && !escaped) inDoubleQuote = !inDoubleQuote;

    if (ch === "?" && !inSingleQuote && !inDoubleQuote) {
      index += 1;
      out += `$${index}`;
    } else {
      out += ch;
    }

    escaped = ch === "\\" && !escaped;
    if (ch !== "\\") escaped = false;
  }

  return out
    .replace(/\bdatetime\('now'\)/g, "NOW()")
    .replace(/\bdatetime\('now', '-7 days'\)/g, "NOW() - INTERVAL '7 days'")
    .replace(/\bdatetime\('now', '-24 hours'\)/g, "NOW() - INTERVAL '24 hours'")
    .replace(/\bdatetime\('now', '-6 months'\)/g, "NOW() - INTERVAL '6 months'");
}

export async function query<T = any>(sql: string, params: QueryParams = []): Promise<pg.QueryResult<T & pg.QueryResultRow>> {
  return getPool().query<T & pg.QueryResultRow>(normalizeSql(sql), params);
}

export async function queryOne<T = any>(sql: string, params: QueryParams = []): Promise<T | null> {
  const result = await query<T>(sql, params);
  return result.rows[0] || null;
}

export async function queryMany<T = any>(sql: string, params: QueryParams = []): Promise<T[]> {
  const result = await query<T>(sql, params);
  return result.rows;
}

export async function execute(sql: string, params: QueryParams = []): Promise<number> {
  const result = await query(sql, params);
  return result.rowCount || 0;
}

export async function transaction<T>(callback: (client: {
  query: <R = any>(sql: string, params?: QueryParams) => Promise<pg.QueryResult<R & pg.QueryResultRow>>;
  queryOne: <R = any>(sql: string, params?: QueryParams) => Promise<R | null>;
  execute: (sql: string, params?: QueryParams) => Promise<number>;
}) => Promise<T>): Promise<T> {
  const pgClient = await getPool().connect();
  const txClient = {
    query: <R = any>(sql: string, params: QueryParams = []) => pgClient.query<R & pg.QueryResultRow>(normalizeSql(sql), params),
    queryOne: async <R = any>(sql: string, params: QueryParams = []) => {
      const result = await pgClient.query<R & pg.QueryResultRow>(normalizeSql(sql), params);
      return result.rows[0] || null;
    },
    execute: async (sql: string, params: QueryParams = []) => {
      const result = await pgClient.query(normalizeSql(sql), params);
      return result.rowCount || 0;
    },
  };

  try {
    await pgClient.query("BEGIN");
    const result = await callback(txClient);
    await pgClient.query("COMMIT");
    return result;
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  } finally {
    pgClient.release();
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export const db = { query, queryOne, queryMany, execute, transaction };
