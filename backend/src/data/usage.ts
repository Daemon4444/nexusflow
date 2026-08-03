import { db } from "../db/client";
import { logToSLS } from "../services/sls";
import { randomUUID } from "crypto";
import { recordFailure, recordSuccess } from "../services/scheduler";
import {
  resolveProviderCost,
  type ProviderCacheMode,
} from "../services/provider-costs";

const SLS_LOG_FULL_CONTENT = process.env.SLS_LOG_FULL_CONTENT === "true";
const SLS_CONTENT_LIMIT = Math.max(1_000, Number(process.env.SLS_CONTENT_LIMIT || 16_000));
const SENSITIVE_FIELD = /(authorization|api[-_]?key|token|secret|password|cookie)/i;

function sanitizeTelemetryContent(value: any, depth = 0): any {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.length <= SLS_CONTENT_LIMIT
      ? value
      : `${value.slice(0, SLS_CONTENT_LIMIT)}…[truncated ${value.length - SLS_CONTENT_LIMIT} chars]`;
  }
  if (depth >= 6) return "[max-depth]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeTelemetryContent(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, any> = {};
    for (const [key, item] of Object.entries(value).slice(0, 100)) {
      output[key] = SENSITIVE_FIELD.test(key) ? "[redacted]" : sanitizeTelemetryContent(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

export interface UsageLog {
  id: number;
  log_id: string | null;
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
  logId?: string;
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
  cachedTokens?: number;
  cacheCreationTokens?: number;
  /** Authoritative retail pricing snapshot used for this settlement. */
  retailListCost?: number | null;
  retailDiscountRate?: number | null;
  retailDiscountAmount?: number | null;
  /** Whether output was charged using the model's thinking-mode price. */
  thinkingOutput?: boolean | null;
  /** Cache contract used by the selected upstream, not the customer retail mode. */
  providerCacheMode?: ProviderCacheMode | null;
  /**
   * OpenAI usage includes cache tokens in prompt_tokens; Anthropic native
   * usage reports them separately. This must be explicit whenever cache usage
   * is non-zero so upstream cost is never double-counted.
   */
  providerInputIncludesCache?: boolean | null;
  region?: string | null;
  providerId?: string | null;
  channelId?: string | null;
  protocol?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  reservationId?: string | null;
  transactionId?: string | null;
  /** Billable upstream units for per-image/per-second contracts. */
  providerUnits?: number | null;
  route?: string; // 上游路由方式标记（仅 SLS，如 anthropic-passthrough / anthropic-bridge）
  estimated?: boolean; // 是否为断流兜底估费（仅 SLS，真实 usage 缺失时按已收内容估算）
  finishReason?: string; // 仅 SLS
  clientIp?: string; // 仅 SLS，来自 nginx X-Real-IP
  errorReason?: string; // 仅 SLS，失败/拒绝原因
  requestBody?: any;
  responseBody?: any;
}): Promise<string> {
  const logId = params.logId || randomUUID();
  let realizedProviderCost: Awaited<ReturnType<typeof resolveProviderCost>>;
  try {
    realizedProviderCost = await resolveProviderCost({
      providerId: params.providerId,
      modelId: params.model,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      cachedTokens: params.cachedTokens,
      cacheCreationTokens: params.cacheCreationTokens,
      providerCacheMode: params.providerCacheMode,
      providerInputIncludesCache: params.providerInputIncludesCache,
      providerUnits: params.providerUnits,
      status: params.status,
      estimated: params.estimated === true,
    });
  } catch (error) {
    console.warn(
      "[usage] provider cost lookup failed:",
      error instanceof Error ? error.message : String(error)
    );
    realizedProviderCost = {
      amount: null,
      costVersionId: null,
      priceBookId: null,
      resolution: "lookup_error",
    };
  }
  try {
    await db.execute(
      `INSERT INTO usage_logs (
         log_id, api_key_id, user_id, model, prompt_tokens, completion_tokens, total_tokens,
         cost, status, latency_ms, ttft_ms, tpot_ms, cached_tokens, cache_creation_tokens,
         region, provider_id, channel_id, protocol, node_id, http_status, error_code,
         estimated, reservation_id, transaction_id, provider_cost, cost_version_id,
         provider_cache_mode, provider_input_includes_cache, provider_cost_resolution,
         retail_list_cost, retail_discount_rate, retail_discount_amount, thinking_output,
         created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        logId,
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
        params.cachedTokens || 0,
        params.cacheCreationTokens || 0,
        params.region || null,
        params.providerId || null,
        params.channelId || null,
        params.protocol || params.route || null,
        process.env.NEXUSFLOW_NODE_ID || process.env.HOSTNAME || null,
        params.httpStatus || null,
        params.errorCode || null,
        params.estimated === true,
        params.reservationId || null,
        params.transactionId || null,
        realizedProviderCost.amount,
        realizedProviderCost.costVersionId,
        params.providerCacheMode || null,
        params.providerInputIncludesCache ?? null,
        realizedProviderCost.resolution,
        params.retailListCost ?? null,
        params.retailDiscountRate ?? null,
        params.retailDiscountAmount ?? null,
        params.thinkingOutput ?? null,
        new Date().toISOString(),
      ]
    );
  } catch (error) {
    // Usage analytics must never suppress the authoritative billing settlement.
    // SLS still receives the event below, and the DB failure remains visible.
    console.error("[usage] PostgreSQL insert failed:", error);
  }
  logToSLS({
    logId,
    apiKeyId: params.apiKeyId,
    userId: params.userId,
    region: params.region || undefined,
    providerId: params.providerId || undefined,
    channelId: params.channelId || undefined,
    protocol: params.protocol || params.route || undefined,
    nodeId: process.env.NEXUSFLOW_NODE_ID || process.env.HOSTNAME || undefined,
    httpStatus: params.httpStatus || undefined,
    errorCode: params.errorCode || undefined,
    reservationId: params.reservationId || undefined,
    transactionId: params.transactionId || undefined,
    providerCost: realizedProviderCost.amount ?? undefined,
    costVersionId: realizedProviderCost.costVersionId || undefined,
    providerCostResolution: realizedProviderCost.resolution,
    providerCacheMode: params.providerCacheMode || undefined,
    providerInputIncludesCache: params.providerInputIncludesCache,
    retailListCost: params.retailListCost ?? undefined,
    retailDiscountRate: params.retailDiscountRate ?? undefined,
    retailDiscountAmount: params.retailDiscountAmount ?? undefined,
    thinkingOutput: params.thinkingOutput ?? undefined,
    model: params.model,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens: params.totalTokens,
    cost: params.cost,
    status: params.status,
    latencyMs: params.latencyMs,
    cachedTokens: params.cachedTokens,
    cacheCreationTokens: params.cacheCreationTokens,
    route: params.route,
    estimated: params.estimated,
    finishReason: params.finishReason,
    clientIp: params.clientIp,
    errorReason: params.errorReason,
    ...(SLS_LOG_FULL_CONTENT
      ? {
          request: sanitizeTelemetryContent(params.requestBody),
          response: sanitizeTelemetryContent(params.responseBody),
        }
      : {}),
  });

  if (params.providerId) {
    try {
      // A partially delivered/estimated response may still be billable, while
      // an upstream interruption must count as a provider-health failure.
      if (params.status === "success" && !params.errorCode && !params.errorReason) {
        await recordSuccess(params.providerId, params.model, params.latencyMs);
      } else {
        const failure = String(params.errorCode || params.errorReason || params.status || "upstream_error").slice(0, 500);
        await recordFailure(params.providerId, params.model, failure);
      }
    } catch (error) {
      console.warn("[usage] provider health update failed:", error instanceof Error ? error.message : String(error));
    }
  }
  return logId;
}

export async function logUpstreamFailure(params: {
  logId?: string;
  apiKeyId: string | null;
  userId?: string | null;
  model: string;
  providerId: string;
  channelId?: string | null;
  region?: string | null;
  protocol: string;
  latencyMs: number;
  httpStatus?: number | null;
  errorCode?: string;
  errorReason: string;
  reservationId?: string | null;
}): Promise<string> {
  return logUsage({
    logId: params.logId,
    apiKeyId: params.apiKeyId,
    userId: params.userId,
    model: params.model,
    providerId: params.providerId,
    channelId: params.channelId,
    region: params.region,
    protocol: params.protocol,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
    status: "error",
    latencyMs: params.latencyMs,
    httpStatus: params.httpStatus,
    errorCode: params.errorCode || (
      params.httpStatus ? `upstream_http_${params.httpStatus}` : "upstream_error"
    ),
    errorReason: params.errorReason,
    reservationId: params.reservationId,
  });
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
      COALESCE(SUM(prompt_tokens), 0) as "totalPromptTokens",
      COALESCE(SUM(cost), 0) as "totalCost",
      COUNT(DISTINCT model) as "activeModels",
      COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0) as "avgLatencyMs",
      ROUND((SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::numeric / GREATEST(COUNT(*), 1)) * 100, 1) as "successRate",
      COALESCE(SUM(cached_tokens), 0) as "totalCachedTokens"
    FROM usage_logs
    ${clause}`,
    params
  );
  return {
    totalRequests: Number(row?.totalRequests || 0),
    totalTokens: Number(row?.totalTokens || 0),
    totalPromptTokens: Number(row?.totalPromptTokens || 0),
    totalCost: Number(Number(row?.totalCost || 0).toFixed(6)),
    activeModels: Number(row?.activeModels || 0),
    avgLatency: Math.round(Number(row?.avgLatencyMs || 0) / 100) / 10,
    successRate: Number(row?.successRate || 100),
    totalCachedTokens: Number(row?.totalCachedTokens || 0),
  };
}

export async function getDaily(userId?: string) {
  const { and, params } = userFilter(userId);
  return db.queryMany(
    `SELECT
      to_char(timezone('Asia/Shanghai', created_at), 'MM-DD') as date,
      COUNT(*)::int as requests,
      COALESCE(SUM(total_tokens), 0)::int as tokens,
      ROUND(COALESCE(SUM(cost), 0)::numeric, 2)::float as cost
    FROM usage_logs
    WHERE created_at >= NOW() - INTERVAL '7 days'
      ${and}
    GROUP BY to_char(timezone('Asia/Shanghai', created_at), 'YYYY-MM-DD'), to_char(timezone('Asia/Shanghai', created_at), 'MM-DD')
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
      log_id,
      to_char(timezone('Asia/Shanghai', created_at), 'MM-DD HH24:MI') as time,
      model,
      total_tokens as tokens,
      ROUND(cost::numeric, 6)::float as cost,
      CASE WHEN status = 'success' THEN '成功' ELSE '失败' END as status,
      ROUND((latency_ms / 1000.0)::numeric, 1)::float as latency,
      COALESCE(cached_tokens, 0)::int as cached_tokens,
      COALESCE(cache_creation_tokens, 0)::int as cache_creation_tokens
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
