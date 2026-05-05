import db from "../db";

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

const stmts = {
  insert: db.prepare(
    `INSERT INTO usage_logs (api_key_id, model, prompt_tokens, completion_tokens, total_tokens, cost, status, latency_ms, ttft_ms, tpot_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  overview: db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'success' AND cost > 0 THEN 1 ELSE 0 END) as totalRequests,
      COALESCE(SUM(total_tokens), 0) as totalTokens,
      COALESCE(SUM(cost), 0) as totalCost,
      COUNT(DISTINCT model) as activeModels,
      COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0) as avgLatencyMs,
      ROUND(CAST(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS REAL) / MAX(COUNT(*), 1) * 100, 1) as successRate
    FROM usage_logs
  `),
  daily: db.prepare(`
    SELECT
      strftime('%m-%d', created_at) as date,
      COUNT(*) as requests,
      COALESCE(SUM(total_tokens), 0) as tokens,
      ROUND(COALESCE(SUM(cost), 0), 2) as cost
    FROM usage_logs
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY strftime('%Y-%m-%d', created_at)
    ORDER BY date
  `),
  byModel: db.prepare(`
    SELECT
      model,
      COUNT(*) as requests,
      COALESCE(SUM(total_tokens), 0) as tokens,
      ROUND(COALESCE(SUM(cost), 0), 2) as cost
    FROM usage_logs
    GROUP BY model
    ORDER BY requests DESC
    LIMIT 10
  `),
  recent: db.prepare(`
    SELECT
      strftime('%H:%M:%S', created_at) as time,
      model,
      total_tokens as tokens,
      ROUND(cost, 6) as cost,
      CASE WHEN status = 'success' THEN '成功' ELSE '失败' END as status,
      ROUND(latency_ms / 1000.0, 1) as latency
    FROM usage_logs
    ORDER BY created_at DESC
    LIMIT 20
  `),
  totalCount: db.prepare("SELECT COUNT(*) as cnt FROM usage_logs"),
};

/** 记录一次 API 调用 */
export function logUsage(params: {
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
}) {
  const cols = db.pragma("table_info(usage_logs)") as Array<{ name: string }>;
  const hasUserId = cols.some((col) => col.name === "user_id");
  if (hasUserId) {
    db.prepare(
      `INSERT INTO usage_logs (api_key_id, user_id, model, prompt_tokens, completion_tokens, total_tokens, cost, status, latency_ms, ttft_ms, tpot_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
      new Date().toISOString()
    );
    return;
  }

  stmts.insert.run(
    params.apiKeyId,
    params.model,
    params.promptTokens,
    params.completionTokens,
    params.totalTokens,
    params.cost,
    params.status,
    params.latencyMs,
    params.ttftMs || 0,
    params.tpotMs || 0,
    new Date().toISOString()
  );
}

function whereByUser(userId?: string) {
  return userId ? { clause: "WHERE user_id = ?", params: [userId] } : { clause: "", params: [] as any[] };
}

/** 获取汇总统计 */
export function getOverview(userId?: string) {
  const { clause, params } = whereByUser(userId);
  const row: any = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'success' AND cost > 0 THEN 1 ELSE 0 END) as totalRequests,
      COALESCE(SUM(total_tokens), 0) as totalTokens,
      COALESCE(SUM(cost), 0) as totalCost,
      COUNT(DISTINCT model) as activeModels,
      COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0) as avgLatencyMs,
      ROUND(CAST(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS REAL) / MAX(COUNT(*), 1) * 100, 1) as successRate
    FROM usage_logs
    ${clause}
  `).get(...params);
  return {
    totalRequests: row.totalRequests || 0,
    totalTokens: row.totalTokens,
    // Keep micro-cost precision; frontend controls display precision.
    totalCost: Number((row.totalCost || 0).toFixed(6)),
    activeModels: row.activeModels,
    avgLatency: Math.round(row.avgLatencyMs / 100) / 10, // ms -> s, 1位小数
    successRate: row.successRate || 100,
  };
}

/** 获取每日统计 */
export function getDaily(userId?: string) {
  const { clause, params } = whereByUser(userId);
  return db.prepare(`
    SELECT
      strftime('%m-%d', created_at) as date,
      COUNT(*) as requests,
      COALESCE(SUM(total_tokens), 0) as tokens,
      ROUND(COALESCE(SUM(cost), 0), 2) as cost
    FROM usage_logs
    WHERE created_at >= datetime('now', '-7 days')
      ${userId ? "AND user_id = ?" : ""}
    GROUP BY strftime('%Y-%m-%d', created_at)
    ORDER BY date
  `).all(...params);
}

/** 获取按模型统计 */
export function getByModel(userId?: string) {
  const { params } = whereByUser(userId);
  const rows: any[] = db.prepare(`
    SELECT
      model,
      COUNT(*) as requests,
      COALESCE(SUM(total_tokens), 0) as tokens,
      ROUND(COALESCE(SUM(cost), 0), 6) as cost
    FROM usage_logs
    ${userId ? "WHERE user_id = ?" : ""}
    GROUP BY model
    ORDER BY requests DESC
    LIMIT 10
  `).all(...params);
  const total = rows.reduce((s, r) => s + r.requests, 0) || 1;
  return rows.map((r) => ({
    model: r.model,
    requests: r.requests,
    tokens: r.tokens,
    cost: Number((r.cost || 0).toFixed(6)),
    percentage: Math.round((r.requests / total) * 1000) / 10,
  }));
}

/** 获取最近请求 */
export function getRecent(userId?: string) {
  const { params } = whereByUser(userId);
  return db.prepare(`
    SELECT
      strftime('%H:%M:%S', created_at) as time,
      model,
      total_tokens as tokens,
      ROUND(cost, 6) as cost,
      CASE WHEN status = 'success' THEN '成功' ELSE '失败' END as status,
      ROUND(latency_ms / 1000.0, 1) as latency
    FROM usage_logs
    ${userId ? "WHERE user_id = ?" : ""}
    ORDER BY created_at DESC
    LIMIT 20
  `).all(...params);
}

/** 获取详细使用日志列表（管理后台用） */
export function getUsageLogs(limit: number = 100, userId?: string): UsageLog[] {
  const params = userId ? [userId, limit] : [limit];
  return db.prepare(`
    SELECT
      id, api_key_id, model, prompt_tokens, completion_tokens,
      total_tokens, cost, status, latency_ms, ttft_ms, tpot_ms, created_at
    FROM usage_logs
    ${userId ? "WHERE user_id = ?" : ""}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params) as UsageLog[];
}

/** 获取性能监控数据 */
export function getPerformanceOverview(userId?: string) {
  const { params } = whereByUser(userId);
  const row: any = db.prepare(`
    SELECT
      COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) as avgTtft,
      COALESCE(MIN(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) as minTtft,
      COALESCE(MAX(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) as maxTtft,
      COALESCE(AVG(CASE WHEN tpot_ms > 0 THEN tpot_ms END), 0) as avgTpot,
      COALESCE(MIN(CASE WHEN tpot_ms > 0 THEN tpot_ms END), 0) as minTpot,
      COALESCE(MAX(CASE WHEN tpot_ms > 0 THEN tpot_ms END), 0) as maxTpot,
      COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0) as avgLatency,
      COUNT(*) as totalRequests,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errorCount,
      ROUND(CAST(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS REAL) / MAX(COUNT(*), 1) * 100, 1) as successRate
    FROM usage_logs
    WHERE created_at >= datetime('now', '-24 hours')
      ${userId ? "AND user_id = ?" : ""}
  `).get(...params);
  return {
    avgTtft: Math.round(row.avgTtft),
    minTtft: Math.round(row.minTtft),
    maxTtft: Math.round(row.maxTtft),
    avgTpot: Math.round(row.avgTpot * 100) / 100,
    minTpot: Math.round(row.minTpot * 100) / 100,
    maxTpot: Math.round(row.maxTpot * 100) / 100,
    avgLatency: Math.round(row.avgLatency),
    totalRequests: row.totalRequests,
    successCount: row.successCount,
    errorCount: row.errorCount,
    successRate: row.successRate || 100,
  };
}

/** 获取按小时的性能趋势（最近24小时） */
export function getPerformanceHourly(userId?: string) {
  const { params } = whereByUser(userId);
  return db.prepare(`
    SELECT
      strftime('%H:00', created_at) as hour,
      COUNT(*) as requests,
      ROUND(COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0)) as avgTtft,
      ROUND(COALESCE(AVG(CASE WHEN tpot_ms > 0 THEN tpot_ms END), 0), 2) as avgTpot,
      ROUND(COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0)) as avgLatency,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
    FROM usage_logs
    WHERE created_at >= datetime('now', '-24 hours')
      ${userId ? "AND user_id = ?" : ""}
    GROUP BY strftime('%Y-%m-%d %H', created_at)
    ORDER BY created_at
  `).all(...params);
}

/** 获取单个用户的使用汇总 */
export function getUsageSummary(userId: string) {
  const row: any = db.prepare(`
    SELECT
      COUNT(*) as totalRequests,
      COALESCE(SUM(total_tokens), 0) as totalTokens,
      COALESCE(SUM(cost), 0) as totalCost,
      COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0) as avgLatencyMs,
      ROUND(CAST(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS REAL) / MAX(COUNT(*), 1) * 100, 1) as successRate
    FROM usage_logs
    WHERE user_id = ?
  `).get(userId);

  return {
    totalRequests: row.totalRequests || 0,
    totalTokens: row.totalTokens || 0,
    totalCost: Number((row.totalCost || 0).toFixed(6)),
    avgLatency: Math.round((row.avgLatencyMs || 0) / 100) / 10,
    successRate: row.successRate || 100,
  };
}

/** 获取按模型的性能数据 */
export function getPerformanceByModel(userId?: string) {
  const { params } = whereByUser(userId);
  return db.prepare(`
    SELECT
      model,
      COUNT(*) as requests,
      ROUND(COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0)) as avgTtft,
      ROUND(COALESCE(AVG(CASE WHEN tpot_ms > 0 THEN tpot_ms END), 0), 2) as avgTpot,
      ROUND(COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0)) as avgLatency,
      ROUND(CAST(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS REAL) / MAX(COUNT(*), 1) * 100, 1) as successRate
    FROM usage_logs
    WHERE created_at >= datetime('now', '-24 hours')
      ${userId ? "AND user_id = ?" : ""}
    GROUP BY model
    ORDER BY requests DESC
    LIMIT 20
  `).all(...params);
}

/** 获取最近请求的详细性能数据 */
export function getRecentPerformance(limit: number = 50, userId?: string) {
  const params = userId ? [userId, limit] : [limit];
  return db.prepare(`
    SELECT
      strftime('%H:%M:%S', created_at) as time,
      model,
      total_tokens as tokens,
      latency_ms as latency,
      ttft_ms as ttft,
      ROUND(tpot_ms, 2) as tpot,
      status,
      ROUND(cost, 6) as cost
    FROM usage_logs
    ${userId ? "WHERE user_id = ?" : ""}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params);
}
