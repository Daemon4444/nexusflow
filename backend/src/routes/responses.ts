/**
 * OpenAI Responses API Compatible Route
 *
 * Endpoints:
 * - POST /v1/responses - Create a response
 * - GET /v1/responses/:id - Retrieve a response
 * - DELETE /v1/responses/:id - Delete a response
 * - GET /v1/responses/:id/input_items - List input items
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { getReservedOutputTokens, models } from "../data/models";
import { validateApiKey } from "../data/apikeys";
import { logUpstreamFailure, logUsage } from "../data/usage";
import { releaseReservation, reserveBalanceWithReason, settleReservation } from "../data/billing";
import { sendBillingReservationFailure } from "../utils/billing-response";
import { calculateDiscountedTokenCost } from "../data/user-discounts";
import { checkConsumerLimitsAsync } from "../services/rate-limiter";
import {
  reconcileAccountTpm,
  reserveAccountQpm,
  reserveAccountTpm,
} from "../services/account-rate-limiter";
import { isModelAllowed } from "../data/model-access";
import {
  getRequestedRegion,
  resolveUpstream,
  upstreamErrorBody,
  type ResolvedUpstream,
} from "../services/upstream";
import { detectModelType } from "../services/adapters";
import { calculateOpenAiCacheAwareCost, buildApiDescription, isExplicitCacheRequested } from "../utils/cache-billing";
import {
  acquireProviderCapacity,
  releaseProviderCapacity,
  type ProviderRequestCapacityLease,
} from "../services/scheduler";
import { sanitizeUpstreamError } from "../utils/sanitize-error";
import { db } from "../db/client";
import { safeProviderFetch } from "../services/outbound-url-policy";
import { estimateStreamUsage, isUsageMissing } from "../utils/estimate-stream-usage";
import {
  getUpstreamModelId,
  restorePublicModelAlias,
  rewriteUpstreamModelAliasText,
} from "../utils/upstream-model-aliases";
import { startSseHeartbeat } from "../utils/sse-heartbeat";

/** 记录 response 归属（POST 成功后调用）。失败不影响主流程，但会导致该 response 后续不可检索（fail-closed）。 */
async function recordResponseOwnership(responseId: string | null | undefined, userId: string | null): Promise<void> {
  if (!responseId || !userId) return;
  try {
    await db.execute(
      "INSERT INTO response_ownership (response_id, user_id) VALUES (?, ?) ON CONFLICT (response_id) DO NOTHING",
      [responseId, userId]
    );
  } catch (err) {
    console.error("[responses] record ownership failed:", err);
  }
}

/** 归属校验：非本人（或无记录）一律 404，不泄露资源存在性。查询异常按拒绝处理（fail-closed）。 */
async function assertResponseOwnership(responseId: string, userId: string | null, res: Response): Promise<boolean> {
  try {
    const row = await db.queryOne<{ user_id: string | null }>(
      "SELECT user_id FROM response_ownership WHERE response_id = ?",
      [responseId]
    );
    if (row && userId && row.user_id === userId) return true;
  } catch (err) {
    console.error("[responses] ownership lookup failed:", err);
  }
  res.status(404).json({
    error: { message: `Response '${responseId}' not found.`, type: "invalid_request_error", code: "response_not_found" },
  });
  return false;
}

/** 从流式响应中提取 response id（response.created 事件） */
function extractResponseIdFromStream(fullResponse: string): string | null {
  for (const line of fullResponse.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    try {
      const json = JSON.parse(trimmed.slice(5));
      const id = json?.response?.id;
      if (typeof id === "string" && id) return id;
    } catch { /* 忽略残缺行 */ }
  }
  return null;
}

const router = Router();
const UPSTREAM_TIMEOUT = 600000;

// Built-in tools can create material non-token upstream charges. Keep the safe
// local function tool enabled by default and require an explicit production
// allowlist before forwarding any billable built-in tool.
const ALLOWED_RESPONSE_TOOL_TYPES = new Set(
  (process.env.RESPONSE_ALLOWED_TOOLS || "function")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const MAX_RESPONSE_TOOLS = 32;

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function roughTokenCount(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return Math.ceil(value.length / 2);
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + roughTokenCount(item), 0);
  if (typeof value === "object") return Math.ceil(JSON.stringify(value).length / 2);
  return Math.ceil(String(value).length / 2);
}

function resolveModelFromBody(body: any): string | null {
  return body?.model || null;
}

async function proxyResponseControlRequest(params: {
  req: Request;
  res: Response;
  apiKeyRecord: NonNullable<Awaited<ReturnType<typeof validateApiKey>>>;
  upstream: ResolvedUpstream;
  url: string;
  method: "GET" | "DELETE";
  onSuccess?: () => Promise<void>;
}): Promise<void> {
  const modelId = "qwen-plus";
  const startTime = Date.now();
  const logId = randomUUID();
  let capacityLease: ProviderRequestCapacityLease | null = null;
  let upstreamCompleted = false;
  try {
    const capacity = await acquireProviderCapacity(params.upstream, modelId, 0);
    if (!capacity.ok) {
      params.res.status(503).json({
        error: { message: capacity.message, type: "server_error", code: capacity.code },
      });
      return;
    }
    capacityLease = capacity.lease;

    const response = await safeProviderFetch(params.url, {
      method: params.method,
      headers: { Authorization: `Bearer ${params.upstream.apiKey}` },
      signal: AbortSignal.timeout(30000),
    });
    let data: any;
    try {
      data = await response.json();
    } catch {
      data = {
        error: {
          message: "Upstream returned an invalid JSON response.",
          type: "upstream_error",
          code: "upstream_invalid_response",
        },
      };
    }
    if (!response.ok) {
      await logUpstreamFailure({
        logId,
        apiKeyId: params.apiKeyRecord.id,
        userId: params.apiKeyRecord.user_id,
        model: modelId,
        providerId: params.upstream.providerId,
        channelId: params.upstream.channelId,
        region: params.upstream.region,
        protocol: "openai-responses-control",
        latencyMs: Date.now() - startTime,
        httpStatus: response.status,
        errorCode: data?.error?.code || "upstream_error",
        errorReason: data?.error?.message || "Upstream Responses control request failed.",
      });
    }
    upstreamCompleted = true;
    if (response.ok && params.onSuccess) await params.onSuccess();
    params.res.status(response.status).json(data);
  } catch (error: any) {
    if (!upstreamCompleted) {
      await logUpstreamFailure({
        logId,
        apiKeyId: params.apiKeyRecord.id,
        userId: params.apiKeyRecord.user_id,
        model: modelId,
        providerId: params.upstream.providerId,
        channelId: params.upstream.channelId,
        region: params.upstream.region,
        protocol: "openai-responses-control",
        latencyMs: Date.now() - startTime,
        errorCode: "upstream_exception",
        errorReason: String(error?.message || error),
      });
    }
    params.res.status(500).json({
      error: { message: sanitizeUpstreamError(error), type: "server_error", code: "upstream_error" },
    });
  } finally {
    await releaseProviderCapacity(capacityLease, 0);
  }
}

// POST /responses — Create a response (proxy to upstream)
router.post("/", async (req: Request, res: Response) => {
  const token = extractToken(req);
  const apiKeyRecord = token ? await validateApiKey(token) : null;
  if (!apiKeyRecord) {
    res.status(401).json({
      error: {
        message: "Invalid API key provided.",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    });
    return;
  }

  const modelId = resolveModelFromBody(req.body);
  if (!modelId) {
    res.status(400).json({
      error: {
        message: "Missing required parameter: model.",
        type: "invalid_request_error",
        code: "invalid_request",
      },
    });
    return;
  }

  const model = models.find((m) => m.id === modelId);
  if (!model) {
    res.status(404).json({
      error: {
        message: `Model '${modelId}' not found.`,
        type: "invalid_request_error",
        code: "model_not_found",
      },
    });
    return;
  }

  if (modelId.startsWith("claude-")) {
    res.status(400).json({
      error: {
        message: `Model '${modelId}' is only available through the Anthropic Messages API at /v1/messages.`,
        type: "invalid_request_error",
        code: "unsupported_protocol",
      },
    });
    return;
  }

  const modelType = detectModelType(model.category);
  if (modelType !== "chat") {
    res.status(400).json({
      error: {
        message: `Model '${modelId}' does not support the Responses API.`,
        type: "invalid_request_error",
        code: "unsupported_model",
      },
    });
    return;
  }

  const resolvedUpstream = await resolveUpstream(modelId, {
    region: getRequestedRegion(req),
    userId: apiKeyRecord.user_id,
  });
  if (!resolvedUpstream.ok) {
    res.status(resolvedUpstream.status).json({ error: upstreamErrorBody(resolvedUpstream) });
    return;
  }
  const upstream = resolvedUpstream.upstream;

  if (!apiKeyRecord.user_id) {
    res.status(403).json({
      error: {
        message: "This API key is not associated with a user account.",
        type: "invalid_request_error",
        code: "anonymous_key_not_allowed",
      },
    });
    return;
  }

  // Validate tools (reject unknown tool types, cap count) before forwarding upstream
  if (req.body.tools !== undefined) {
    if (!Array.isArray(req.body.tools) || req.body.tools.length > MAX_RESPONSE_TOOLS) {
      res.status(400).json({
        error: {
          message: `Invalid 'tools': must be an array of at most ${MAX_RESPONSE_TOOLS} items.`,
          type: "invalid_request_error",
          code: "invalid_request",
        },
      });
      return;
    }
    for (const tool of req.body.tools) {
      if (!tool || typeof tool.type !== "string" || !ALLOWED_RESPONSE_TOOL_TYPES.has(tool.type)) {
        res.status(400).json({
          error: {
            message: `Unsupported tool type: ${tool?.type ?? "unknown"}.`,
            type: "invalid_request_error",
            code: "unsupported_tool",
          },
        });
        return;
      }
    }
  }

  // Rate limiting
  const estimatedInputTokens = Math.max(1, roughTokenCount(req.body.input) + roughTokenCount(req.body.tools));
  const estimatedOutputTokens = getReservedOutputTokens(model, req.body.max_output_tokens);
  const estimatedTokens = estimatedInputTokens + estimatedOutputTokens;
  if (!isModelAllowed(apiKeyRecord.parent_user_id, apiKeyRecord.allowed_models, modelId)) {
    res.status(403).json({
      error: {
        message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`,
        type: "invalid_request_error",
        code: "model_not_allowed",
      },
    });
    return;
  }
  const rpmCheck = await reserveAccountQpm({
    userId: apiKeyRecord.user_id,
    parentUserId: apiKeyRecord.parent_user_id,
    modelId,
  });
  if (!rpmCheck.allowed) {
    res.status(429).json({
      error: {
        message: `Model-level QPM limit exceeded: ${rpmCheck.limit} requests/min for '${modelId}'.`,
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
    });
    return;
  }
  const tpmCheck = await reserveAccountTpm({
    userId: apiKeyRecord.user_id,
    parentUserId: apiKeyRecord.parent_user_id,
    modelId,
    estimatedTokens,
  });
  if (!tpmCheck.allowed) {
    res.status(429).json({
      error: {
        message: `Model-level TPM limit exceeded for '${modelId}'. Remaining: ${tpmCheck.remaining} tokens.`,
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
    });
    return;
  }
  const rateCheck = await checkConsumerLimitsAsync(apiKeyRecord.id, apiKeyRecord.rate_limit);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: {
        message: rateCheck.reason,
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
    });
    return;
  }

  // Balance check
  const estimatedCost = (await calculateDiscountedTokenCost(
    apiKeyRecord.user_id,
    model,
    estimatedInputTokens,
    estimatedOutputTokens
  )).finalAmount;
  const billingReservationResult = await reserveBalanceWithReason(
    apiKeyRecord.user_id,
    estimatedCost,
    `responses:${randomUUID()}`
  );
  if (!billingReservationResult.reservation) {
    sendBillingReservationFailure(res, billingReservationResult.reason);
    return;
  }
  const billingReservation = billingReservationResult.reservation;

  const startTime = Date.now();
  const logId = randomUUID();
  const isStream = req.body.stream === true;

  // 预占的 TPM 必须在所有出口恰好归还一次；billAndLog 内 reconcile 后置 true，
  // 上游错误/异常路径由 finally 兜底释放。
  let tokensReconciled = false;
  let billableResponseReceived = false;
  let providerCapacityLease: ProviderRequestCapacityLease | null = null;
  let actualProviderTokens = 0;

  try {
    const capacity = await acquireProviderCapacity(upstream, modelId, estimatedTokens);
    if (!capacity.ok) {
      res.status(503).json({
        error: {
          message: capacity.message,
          type: "server_error",
          code: capacity.code,
        },
      });
      return;
    }
    providerCapacityLease = capacity.lease;

    // Build upstream request — pass through body directly, upstream is DashScope Responses API
    const upstreamUrl = `${upstream.baseUrl}/responses`;
    const upstreamHeaders: Record<string, string> = {
      Authorization: `Bearer ${upstream.apiKey}`,
      "Content-Type": "application/json",
    };
    // Forward session cache header if present
    const sessionCache = req.headers["x-dashscope-session-cache"];
    if (sessionCache) {
      upstreamHeaders["x-dashscope-session-cache"] = String(sessionCache);
    }

    const response = await safeProviderFetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify({ ...req.body, model: getUpstreamModelId(modelId) }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    });

    if (!response.ok) {
      let errMsg = "Upstream API error";
      try {
        const errJson = await response.json() as any;
        errMsg = errJson?.error?.message || errMsg;
      } catch {}
      await logUpstreamFailure({
        logId,
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        region: upstream.region,
        protocol: "openai-responses",
        latencyMs: Date.now() - startTime,
        httpStatus: response.status,
        errorReason: errMsg,
        reservationId: billingReservation.id,
      });
      res.status(response.status).json({
        error: { message: errMsg, type: "upstream_error", code: "upstream_error" },
      });
      return;
    }
    billableResponseReceived = true;

    if (isStream) {
      // Stream SSE directly to client
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
      const heartbeat = startSseHeartbeat(res);

      let fullResponse = "";
      const reader = response.body as any;

      try {
        if (reader && typeof reader[Symbol.asyncIterator] === "function") {
          const iterDecoder = new TextDecoder();
          for await (const chunk of reader) {
            const text = typeof chunk === "string" ? chunk : iterDecoder.decode(chunk, { stream: true });
            const rewritten = rewriteUpstreamModelAliasText(text, modelId);
            fullResponse += rewritten;
            heartbeat.write(rewritten);
          }
        } else if (reader && reader.getReader) {
          const r = reader.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await r.read();
            if (done) break;
            const rewritten = rewriteUpstreamModelAliasText(decoder.decode(value, { stream: true }), modelId);
            fullResponse += rewritten;
            heartbeat.write(rewritten);
          }
        }
      } catch (streamErr: any) {
        const errMsg = streamErr?.name === "AbortError" ? "upstream_timeout" : "upstream_stream_error";
        heartbeat.write(`event: error\ndata: ${JSON.stringify({ error: { message: errMsg, type: "server_error" } })}\n\n`);
      }
      res.end();

      // Extract usage from the response.completed event for billing
      const usage = extractUsageFromStream(fullResponse);
      await recordResponseOwnership(extractResponseIdFromStream(fullResponse), apiKeyRecord.user_id);
      // 断流兜底：上游在 response.completed（含 usage）发出前断开 → usage 为空，按已收内容估费
      let estimated = false;
      let billableUsage = usage;
      if (isUsageMissing(usage) && fullResponse.length > 0) {
        const est = estimateStreamUsage(fullResponse, req.body.input);
        billableUsage = { input_tokens: est.prompt_tokens, output_tokens: est.completion_tokens, total_tokens: est.total_tokens };
        estimated = true;
      }
      actualProviderTokens = await billAndLog(billableUsage, {
        upstream, logId, apiKeyRecord, modelId, model, startTime, estimatedTokens, billingReservationId: billingReservation.id, estimated,
        requestBody: req.body,
        onReconciled: () => { tokensReconciled = true; },
      });
    } else {
      // Non-streaming: parse response and return
      const data: any = await response.json();
      restorePublicModelAlias(data, modelId);

      res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
      res.json(data);

      await recordResponseOwnership(data?.id, apiKeyRecord.user_id);
      // Bill based on response usage
      const usage = data?.usage || {};
      actualProviderTokens = await billAndLog(usage, {
        upstream, logId, apiKeyRecord, modelId, model, startTime, estimatedTokens, billingReservationId: billingReservation.id, estimated: false,
        requestBody: req.body,
        onReconciled: () => { tokensReconciled = true; },
      });
    }
  } catch (err: any) {
    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "openai-responses",
      logId,
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      status: "error",
      latencyMs: Date.now() - startTime,
      reservationId: billingReservation.id,
      errorCode: "upstream_error",
      errorReason: String(err?.message || err),
    });
    // 流式响应已 end 后（如计费段 DB 异常）不能再写状态码
    if (res.headersSent) {
      try { res.end(); } catch { /* 连接可能已断 */ }
    } else {
      res.status(500).json({
        error: {
          message: sanitizeUpstreamError(err),
          type: "server_error",
          code: "upstream_error",
        },
      });
    }
  } finally {
    if (!billableResponseReceived) await releaseReservation(billingReservation.id);
    if (!tokensReconciled) {
      try {
        await reconcileAccountTpm({
          userId: apiKeyRecord.user_id,
          parentUserId: apiKeyRecord.parent_user_id,
          modelId,
          reservedTokens: estimatedTokens,
          actualTokens: 0,
        });
      } catch { /* 归还失败仅影响 60s 窗口，不阻断 */ }
    }
    await releaseProviderCapacity(providerCapacityLease, actualProviderTokens);
  }
});

// GET /responses/:id — Retrieve a response
router.get("/:id", async (req: Request, res: Response) => {
  const token = extractToken(req);
  const apiKeyRecord = token ? await validateApiKey(token) : null;
  if (!apiKeyRecord) {
    res.status(401).json({
      error: { message: "Invalid API key provided.", type: "invalid_request_error", code: "invalid_api_key" },
    });
    return;
  }

  const responseId = String(req.params.id);
  // 归属校验：上游所有用户的 response 存在平台同一账号下，必须校验本人才可读（IDOR 防护）
  if (!(await assertResponseOwnership(responseId, apiKeyRecord.user_id, res))) return;
  // Must resolve a provider to get the upstream URL. Use a default qwen model for routing.
  const resolvedUpstream = await resolveUpstream("qwen-plus", {
    region: getRequestedRegion(req),
    userId: apiKeyRecord.user_id,
  });
  if (!resolvedUpstream.ok) {
    res.status(resolvedUpstream.status).json({ error: upstreamErrorBody(resolvedUpstream) });
    return;
  }

  const upstream = resolvedUpstream.upstream;
  await proxyResponseControlRequest({
    req,
    res,
    apiKeyRecord,
    upstream,
    url: `${upstream.baseUrl}/responses/${responseId}`,
    method: "GET",
  });
});

// DELETE /responses/:id — Delete a response
router.delete("/:id", async (req: Request, res: Response) => {
  const token = extractToken(req);
  const apiKeyRecord = token ? await validateApiKey(token) : null;
  if (!apiKeyRecord) {
    res.status(401).json({
      error: { message: "Invalid API key provided.", type: "invalid_request_error", code: "invalid_api_key" },
    });
    return;
  }

  const responseId = String(req.params.id);
  if (!(await assertResponseOwnership(responseId, apiKeyRecord.user_id, res))) return;
  const resolvedUpstream = await resolveUpstream("qwen-plus", {
    region: getRequestedRegion(req),
    userId: apiKeyRecord.user_id,
  });
  if (!resolvedUpstream.ok) {
    res.status(resolvedUpstream.status).json({ error: upstreamErrorBody(resolvedUpstream) });
    return;
  }

  const upstream = resolvedUpstream.upstream;
  await proxyResponseControlRequest({
    req,
    res,
    apiKeyRecord,
    upstream,
    url: `${upstream.baseUrl}/responses/${responseId}`,
    method: "DELETE",
    onSuccess: async () => {
      try { await db.execute("DELETE FROM response_ownership WHERE response_id = ?", [responseId]); } catch { /* 清理失败不影响主流程 */ }
    },
  });
});

// GET /responses/:id/input_items — List input items
export function buildResponseInputItemsUrl(
  baseUrl: string,
  responseId: string,
  query: Record<string, unknown>
): string {
  const allowedParams = ["after", "limit", "order"] as const;
  const forwarded = new URLSearchParams();
  for (const name of allowedParams) {
    const value = query[name];
    if (typeof value === "string" && value.length > 0) forwarded.set(name, value);
  }
  const queryString = forwarded.toString();
  return `${baseUrl}/responses/${encodeURIComponent(responseId)}/input_items${
    queryString ? `?${queryString}` : ""
  }`;
}

router.get("/:id/input_items", async (req: Request, res: Response) => {
  const token = extractToken(req);
  const apiKeyRecord = token ? await validateApiKey(token) : null;
  if (!apiKeyRecord) {
    res.status(401).json({
      error: { message: "Invalid API key provided.", type: "invalid_request_error", code: "invalid_api_key" },
    });
    return;
  }

  const responseId = String(req.params.id);
  if (!(await assertResponseOwnership(responseId, apiKeyRecord.user_id, res))) return;
  const resolvedUpstream = await resolveUpstream("qwen-plus", {
    region: getRequestedRegion(req),
    userId: apiKeyRecord.user_id,
  });
  if (!resolvedUpstream.ok) {
    res.status(resolvedUpstream.status).json({ error: upstreamErrorBody(resolvedUpstream) });
    return;
  }

  const upstream = resolvedUpstream.upstream;
  // Forward only whitelisted query params (after, limit, order).
  const url = buildResponseInputItemsUrl(upstream.baseUrl, responseId, req.query);
  await proxyResponseControlRequest({ req, res, apiKeyRecord, upstream, url, method: "GET" });
});

// --- Helpers ---

function extractUsageFromStream(fullResponse: string): any {
  // Look for the response.completed event which contains usage
  const lines = fullResponse.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("data:")) continue;
    try {
      const json = JSON.parse(line.slice(5));
      if (json?.type === "response.completed" && json?.response?.usage) {
        return json.response.usage;
      }
    } catch {}
  }
  return {};
}

async function billAndLog(
  usage: any,
  ctx: {
    upstream: any;
    logId: string;
    apiKeyRecord: any;
    modelId: string;
    model: any;
    startTime: number;
    estimatedTokens: number;
    billingReservationId: string;
    estimated?: boolean;
    onReconciled?: () => void;
    /** 原始请求体，用于判定是否开启了显式缓存（本路由整体透传上游）。 */
    requestBody?: unknown;
  },
): Promise<number> {
  const { upstream, logId, apiKeyRecord, modelId, model, startTime, estimatedTokens, billingReservationId, estimated, requestBody } = ctx;
  const latencyMs = Date.now() - startTime;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const totalTokens = usage.total_tokens || inputTokens + outputTokens;
  const cachedTokens = usage.input_tokens_details?.cached_tokens || 0;

  // Map Response API usage to OpenAI-style for billing calculation
  const billingUsage = {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: totalTokens,
    prompt_tokens_details: { cached_tokens: cachedTokens },
    completion_tokens_details: {
      reasoning_tokens: usage.output_tokens_details?.reasoning_tokens
        ?? usage.completion_tokens_details?.reasoning_tokens
        ?? 0,
    },
  };

  const explicitCache = isExplicitCacheRequested(
    (requestBody as Record<string, unknown> | undefined)?.input,
    requestBody
  );

  const billing = await calculateOpenAiCacheAwareCost({
    userId: apiKeyRecord.user_id,
    model,
    usage: billingUsage,
    // 本路由把整个 req.body 原样透传上游，用户可经 input 里的 cache_control
    // 或 enable_context_caching 开启显式缓存；硬编码 false 会按隐式价多收。
    explicitCache,
  });

  await logUsage({
    region: upstream.region,
    providerId: upstream.providerId,
    channelId: upstream.channelId,
    protocol: "openai-responses",
    logId,
    apiKeyId: apiKeyRecord.id,
    userId: apiKeyRecord.user_id,
    model: modelId,
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens,
    cost: billing.finalAmount,
    status: "success",
    latencyMs,
    cachedTokens: billing.cachedTokens,
    cacheCreationTokens: billing.cacheCreationTokens,
    retailListCost: billing.listAmount,
    retailDiscountRate: billing.discountRate,
    retailDiscountAmount: billing.discountAmount,
    thinkingOutput: billing.thinkingOutput,
    providerCacheMode: explicitCache ? "explicit" : "implicit",
    providerInputIncludesCache: true,
    estimated,
    reservationId: billingReservationId,
  });
  await reconcileAccountTpm({
    userId: apiKeyRecord.user_id,
    parentUserId: apiKeyRecord.parent_user_id,
    modelId,
    reservedTokens: estimatedTokens,
    actualTokens: totalTokens,
  });
  ctx.onReconciled?.();

  await settleReservation(
    billingReservationId,
    billing.finalAmount,
    buildApiDescription(modelId, totalTokens, billing.cachedTokens),
    billing.discountRate,
    billing.discountAmount,
  );
  return totalTokens;
}

export default router;
