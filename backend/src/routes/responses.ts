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
import { models } from "../data/models";
import { validateApiKey } from "../data/apikeys";
import { logUsage } from "../data/usage";
import { releaseReservation, reserveBalanceWithReason, settleReservation } from "../data/billing";
import { sendBillingReservationFailure } from "../utils/billing-response";
import { calculateDiscountedTokenCost } from "../data/user-discounts";
import { checkConsumerLimitsAsync, checkRPM, checkTPM, reconcileTokensAsync, recordRequest, recordProviderTokens } from "../services/rate-limiter";
import { getEffectiveRateLimit } from "../data/ratelimits";
import { isModelAllowed } from "../data/model-access";
import { getRequestedRegion, resolveUpstream, upstreamErrorBody } from "../services/upstream";
import { detectModelType } from "../services/adapters";
import { calculateOpenAiCacheAwareCost, buildApiDescription } from "../utils/cache-billing";
import { acquireConcurrency, releaseConcurrency } from "../services/scheduler";
import { sanitizeUpstreamError } from "../utils/sanitize-error";
import { db } from "../db/client";
import { estimateStreamUsage, isUsageMissing } from "../utils/estimate-stream-usage";

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

  const resolvedUpstream = await resolveUpstream(modelId, { region: getRequestedRegion(req) });
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
  const estimatedOutputTokens = model.maxOutput || 4096;
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
  const userLimits = await getEffectiveRateLimit(apiKeyRecord.user_id, modelId);
  const rpmCheck = await checkRPM(`user:${apiKeyRecord.user_id}:${modelId}`, userLimits.qpm);
  if (!rpmCheck.allowed) {
    res.status(429).json({
      error: {
        message: `Model-level QPM limit exceeded: ${userLimits.qpm} requests/min for '${modelId}'.`,
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
    });
    return;
  }
  const tpmCheck = await checkTPM(`user:${apiKeyRecord.user_id}:${modelId}`, userLimits.tpm, estimatedTokens);
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

  recordRequest(upstream.providerId, modelId, apiKeyRecord.id, 0);
  acquireConcurrency(upstream.providerId, modelId);

  // 预占的 TPM 必须在所有出口恰好归还一次；billAndLog 内 reconcile 后置 true，
  // 上游错误/异常路径由 finally 兜底释放。
  let tokensReconciled = false;
  let billableResponseReceived = false;

  try {
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

    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    });

    if (!response.ok) {
      let errMsg = "Upstream API error";
      try {
        const errJson = await response.json() as any;
        errMsg = errJson?.error?.message || errMsg;
      } catch {}
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

      let fullResponse = "";
      const reader = response.body as any;

      try {
        if (reader && typeof reader[Symbol.asyncIterator] === "function") {
          const iterDecoder = new TextDecoder();
          for await (const chunk of reader) {
            const text = typeof chunk === "string" ? chunk : iterDecoder.decode(chunk, { stream: true });
            fullResponse += text;
            res.write(text);
          }
        } else if (reader && reader.getReader) {
          const r = reader.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await r.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            fullResponse += text;
            res.write(text);
          }
        }
      } catch (streamErr: any) {
        const errMsg = streamErr?.name === "AbortError" ? "upstream_timeout" : "upstream_stream_error";
        res.write(`event: error\ndata: ${JSON.stringify({ error: { message: errMsg, type: "server_error" } })}\n\n`);
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
      await billAndLog(billableUsage, {
        upstream, logId, apiKeyRecord, modelId, model, startTime, estimatedTokens, billingReservationId: billingReservation.id, estimated,
        onReconciled: () => { tokensReconciled = true; },
      });
    } else {
      // Non-streaming: parse response and return
      const data: any = await response.json();

      res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
      res.json(data);

      await recordResponseOwnership(data?.id, apiKeyRecord.user_id);
      // Bill based on response usage
      const usage = data?.usage || {};
      await billAndLog(usage, {
        upstream, logId, apiKeyRecord, modelId, model, startTime, estimatedTokens, billingReservationId: billingReservation.id, estimated: false,
        onReconciled: () => { tokensReconciled = true; },
      });
    }
  } catch (err: any) {
    await logUsage({
      region: upstream.region,
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
        await reconcileTokensAsync(`user:${apiKeyRecord.user_id}:${modelId}`, estimatedTokens, 0);
      } catch { /* 归还失败仅影响 60s 窗口，不阻断 */ }
    }
    releaseConcurrency(upstream.providerId, modelId);
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
  const resolvedUpstream = await resolveUpstream("qwen-plus", { region: getRequestedRegion(req) });
  if (!resolvedUpstream.ok) {
    res.status(resolvedUpstream.status).json({ error: upstreamErrorBody(resolvedUpstream) });
    return;
  }

  const upstream = resolvedUpstream.upstream;
  try {
    const response = await fetch(`${upstream.baseUrl}/responses/${responseId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${upstream.apiKey}` },
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(500).json({
      error: { message: sanitizeUpstreamError(err), type: "server_error", code: "upstream_error" },
    });
  }
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
  const resolvedUpstream = await resolveUpstream("qwen-plus", { region: getRequestedRegion(req) });
  if (!resolvedUpstream.ok) {
    res.status(resolvedUpstream.status).json({ error: upstreamErrorBody(resolvedUpstream) });
    return;
  }

  const upstream = resolvedUpstream.upstream;
  try {
    const response = await fetch(`${upstream.baseUrl}/responses/${responseId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${upstream.apiKey}` },
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    if (response.ok) {
      try { await db.execute("DELETE FROM response_ownership WHERE response_id = ?", [responseId]); } catch { /* 清理失败不影响主流程 */ }
    }
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(500).json({
      error: { message: sanitizeUpstreamError(err), type: "server_error", code: "upstream_error" },
    });
  }
});

// GET /responses/:id/input_items — List input items
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
  const resolvedUpstream = await resolveUpstream("qwen-plus", { region: getRequestedRegion(req) });
  if (!resolvedUpstream.ok) {
    res.status(resolvedUpstream.status).json({ error: upstreamErrorBody(resolvedUpstream) });
    return;
  }

  const upstream = resolvedUpstream.upstream;
  try {
    // Forward only whitelisted query params (after, limit, order)
    const allowedParams = ["after", "limit", "order"] as const;
    const forwarded = new URLSearchParams();
    for (const name of allowedParams) {
      const value = req.query[name];
      if (typeof value === "string" && value.length > 0) forwarded.set(name, value);
    }
    const queryString = forwarded.toString();
    const url = `${upstream.baseUrl}/responses/${responseId}/input_items${queryString ? `?${queryString}` : ""}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${upstream.apiKey}` },
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(500).json({
      error: { message: sanitizeUpstreamError(err), type: "server_error", code: "upstream_error" },
    });
  }
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
  },
): Promise<void> {
  const { upstream, logId, apiKeyRecord, modelId, model, startTime, estimatedTokens, billingReservationId, estimated } = ctx;
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
  };

  const billing = await calculateOpenAiCacheAwareCost({
    userId: apiKeyRecord.user_id,
    model,
    usage: billingUsage,
    explicitCache: false,
  });

  await logUsage({
    region: upstream.region,
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
    estimated,
  });
  recordProviderTokens(upstream.providerId, modelId, totalTokens);
  await reconcileTokensAsync(`user:${apiKeyRecord.user_id}:${modelId}`, estimatedTokens, totalTokens);
  ctx.onReconciled?.();

  await settleReservation(
    billingReservationId,
    billing.finalAmount,
    buildApiDescription(modelId, totalTokens, billing.cachedTokens),
    billing.discountRate,
    billing.discountAmount,
  );
}

export default router;
