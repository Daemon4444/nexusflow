import { db } from "../db/client";

export interface UsageLog {
  id: number;
  api_key_id: string | null;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  status: string;
  latency_ms: number;
  ttft_ms: number;
  tpot_ms: number;
  created_at: string;
}

export async function logUsage(params: {
  apiKeyId: string | null;
  userId?: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  status: string;
  latencyMs: number;
  ttftMs?: number;
  tpotMs?: number;
}): Promise<void> {
  await db.execute(
    `INSERT INTO usage_logs (api_key_id, user_id, model, prompt_tokens, completion_tokens, total_tokens, cost, status, latency_ms, ttft_ms, tpot_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.apiKeyId,
      params.userId || null,
      params.model,
      params.promptTokens,
      params.completionTokens,
      params.totalTokens,
      params.cost,
      params.status,
      params.latencyMs,
      params.ttftMs || 0,
      params.tpotMs || 0,
      new Date().toISOString(),
    ]
  );
}

function userFilter(userId?: string) {
  return userId ? { clause: "WHERE user_id = ?", and: "AND user_id = ?", params: [userId] } : { clause: "", and: "", params: [] as any[] };
}

export async function getOverview(userId?: string) {
  const { clause, params } = userFilter(userId);
  const row = await db.queryOne<any>(
    `SELECT
      SUM(CASE WHEN status = 'success' AND cost > 0 THEN 1 ELSE 0 END) as "totalRequests",
      COALESCE(SUM(total_tokens), 0) as "totalTokens",
      COALESCE(SUM(cost), 0) as "totalCost",
      COUNT(DISTINCT model) as "activeModels",
      COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0) as "avgLatencyMs",
      ROUND((SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::numeric / GREATEST(COUNT(*), 1)) * 100, 1) as "successRate"
    FROM usage_logs
    ${clause}`,
    params
  );
  return {
    totalRequests: Number(row?.totalRequests || 0),
    totalTokens: Number(row?.totalTokens || 0),
    totalCost: Number(Number(row?.totalCost || 0).toFixed(6)),
    activeModels: Number(row?.activeModels || 0),
    avgLatency: Math.round(Number(row?.avgLatencyMs || 0) / 100) / 10,
    successRate: Number(row?.successRate || 100),
  };
}

export async function getDaily(userId?: string) {
  const { and, params } = userFilter(userId);
  return db.queryMany(
    `SELECT
      to_char(created_at, 'MM-DD') as date,
      COUNT(*)::int as requests,
      COALESCE(SUM(total_tokens), 0)::int as tokens,
      ROUND(COALESCE(SUM(cost), 0)::numeric, 2)::float as cost
    FROM usage_logs
    WHERE created_at >= NOW() - INTERVAL '7 days'
      ${and}
    GROUP BY to_char(created_at, 'YYYY-MM-DD'), to_char(created_at, 'MM-DD')
    ORDER BY date`,
    params
  );
}

export async function getByModel(userId?: string) {
  const { clause, params } = userFilter(userId);
  const rows = await db.queryMany<any>(
    `SELECT
      model,
      COUNT(*)::int as requests,
      COALESCE(SUM(total_tokens), 0)::int as tokens,
      ROUND(COALESCE(SUM(cost), 0)::numeric, 6)::float as cost
    FROM usage_logs
    ${clause}
    GROUP BY model
    ORDER BY requests DESC
    LIMIT 10`,
    params
  );
  const total = rows.reduce((sum, row) => sum + Number(row.requests || 0), 0) || 1;
  return rows.map((row) => ({
    model: row.model,
    requests: Number(row.requests || 0),
    tokens: Number(row.tokens || 0),
    cost: Number(Number(row.cost || 0).toFixed(6)),
    percentage: Math.round((Number(row.requests || 0) / total) * 1000) / 10,
  }));
}

export async function getRecent(userId?: string, limit: number = 20) {
  const { clause, params } = userFilter(userId);
  return db.queryMany(
    `SELECT
      to_char(created_at, 'MM-DD HH24:MI') as time,
      model,
      total_tokens as tokens,
      ROUND(cost::numeric, 6)::float as cost,
      CASE WHEN status = 'success' THEN '成功' ELSE '失败' END as status,
      ROUND((latency_ms / 1000.0)::numeric, 1)::float as latency
    FROM usage_logs
    ${clause}
    ORDER BY created_at DESC
    LIMIT $${params.length + 1}`,
    [...params, limit]
  );
}

export async function getUsageLogs(limit: number = 100, userId?: string): Promise<UsageLog[]> {
  const params = userId ? [userId, limit] : [limit];
  return db.queryMany<UsageLog>(
    `SELECT id, api_key_id, model, prompt_tokens, completion_tokens,
      total_tokens, cost, status, latency_ms, ttft_ms, tpot_ms, created_at
    FROM usage_logs
    ${userId ? "WHERE user_id = ?" : ""}
    ORDER BY created_at DESC
    LIMIT ?`,
    params
  );
}

export async function getPerformanceOverview(userId?: string) {
  const { and, params } = userFilter(userId);
  const row = await db.queryOne<any>(
    `SELECT
      COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) as "avgTtft",
      COALESCE(MIN(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) as "minTtft",
      COALESCE(MAX(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) as "maxTtft",
      COALESCE(AVG(CASE WHEN tpot_ms > 0 THEN tpot_ms END), 0) as "avgTpot",
      COALESCE(MIN(CASE WHEN tpot_ms > 0 THEN tpot_ms END), 0) as "minTpot",
      COALESCE(MAX(CASE WHEN tpot_ms > 0 THEN tpot_ms END), 0) as "maxTpot",
      COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0) as "avgLatency",
      COUNT(*)::int as "totalRequests",
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::int as "successCount",
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::int as "errorCount",
      ROUND((SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::numeric / GREATEST(COUNT(*), 1)) * 100, 1) as "successRate"
    FROM usage_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      ${and}`,
    params
  );
  return {
    avgTtft: Math.round(Number(row?.avgTtft || 0)),
    minTtft: Math.round(Number(row?.minTtft || 0)),
    maxTtft: Math.round(Number(row?.maxTtft || 0)),
    avgTpot: Math.round(Number(row?.avgTpot || 0) * 100) / 100,
    minTpot: Math.round(Number(row?.minTpot || 0) * 100) / 100,
    maxTpot: Math.round(Number(row?.maxTpot || 0) * 100) / 100,
    avgLatency: Math.round(Number(row?.avgLatency || 0)),
    totalRequests: Number(row?.totalRequests || 0),
    successCount: Number(row?.successCount || 0),
    errorCount: Number(row?.errorCount || 0),
    successRate: Number(row?.successRate || 100),
  };
}

export async function getPerformanceHourly(userId?: string) {
  const { and, params } = userFilter(userId);
  return db.queryMany(
    `SELECT
      to_char(created_at, 'HH24:00') as hour,
      COUNT(*)::int as requests,
      ROUND(COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0))::int as "avgTtft",
      ROUND(COALESCE(AVG(CASE WHEN tpot_ms > 0 THEN tpot_ms END), 0)::numeric, 2)::float as "avgTpot",
      ROUND(COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0))::int as "avgLatency",
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::int as errors
    FROM usage_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      ${and}
    GROUP BY to_char(created_at, 'YYYY-MM-DD HH24'), to_char(created_at, 'HH24:00')
    ORDER BY to_char(created_at, 'YYYY-MM-DD HH24')`,
    params
  );
}

export async function getUsageSummary(userId: string) {
  const row = await db.queryOne<any>(
    `SELECT
      COUNT(*)::int as "totalRequests",
      COALESCE(SUM(total_tokens), 0)::int as "totalTokens",
      COALESCE(SUM(cost), 0) as "totalCost",
      COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0) as "avgLatencyMs",
      ROUND((SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::numeric / GREATEST(COUNT(*), 1)) * 100, 1) as "successRate"
    FROM usage_logs
    WHERE user_id = ?`,
    [userId]
  );
  return {
    totalRequests: Number(row?.totalRequests || 0),
    totalTokens: Number(row?.totalTokens || 0),
    totalCost: Number(Number(row?.totalCost || 0).toFixed(6)),
    avgLatency: Math.round(Number(row?.avgLatencyMs || 0) / 100) / 10,
    successRate: Number(row?.successRate || 100),
  };
}

export async function getPerformanceByModel(userId?: string) {
  const { and, params } = userFilter(userId);
  return db.queryMany(
    `SELECT
      model,
      COUNT(*)::int as requests,
      ROUND(COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0))::int as "avgTtft",
      ROUND(COALESCE(AVG(CASE WHEN tpot_ms > 0 THEN tpot_ms END), 0)::numeric, 2)::float as "avgTpot",
      ROUND(COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0))::int as "avgLatency",
      ROUND((SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::numeric / GREATEST(COUNT(*), 1)) * 100, 1) as "successRate"
    FROM usage_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      ${and}
    GROUP BY model
    ORDER BY requests DESC
    LIMIT 20`,
    params
  );
}

export async function getRecentPerformance(limit: number = 50, userId?: string) {
  const params = userId ? [userId, limit] : [limit];
  return db.queryMany(
    `SELECT
      to_char(created_at, 'HH24:MI:SS') as time,
      model,
      total_tokens as tokens,
      latency_ms as latency,
      ttft_ms as ttft,
      ROUND(tpot_ms::numeric, 2)::float as tpot,
      status,
      ROUND(cost::numeric, 6)::float as cost
    FROM usage_logs
    ${userId ? "WHERE user_id = ?" : ""}
    ORDER BY created_at DESC
    LIMIT ?`,
    params
  );
}
