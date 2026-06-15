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
import { consume, hasSufficientBalance } from "../data/billing";
import { calculateDiscountedTokenCost } from "../data/user-discounts";
import { checkConsumerLimits, checkRPM, checkTPM, reconcileTokensAsync, recordRequest, recordProviderTokens } from "../services/rate-limiter";
import { getEffectiveRateLimit } from "../data/ratelimits";
import { getRequestedRegion, resolveUpstream, upstreamErrorBody } from "../services/upstream";
import { detectModelType } from "../services/adapters";
import { calculateOpenAiCacheAwareCost, buildApiDescription } from "../utils/cache-billing";
import { acquireConcurrency, releaseConcurrency } from "../services/scheduler";
import { sanitizeUpstreamError } from "../utils/sanitize-error";

const router = Router();
const UPSTREAM_TIMEOUT = 600000;

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

  // Rate limiting
  const estimatedTokens = roughTokenCount(req.body.input);
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
  const rateCheck = checkConsumerLimits(apiKeyRecord.id, apiKeyRecord.rate_limit);
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
  const estimatedCost = (await calculateDiscountedTokenCost(apiKeyRecord.user_id, model, estimatedTokens, model.maxOutput || 4096)).finalAmount;
  if (!await hasSufficientBalance(apiKeyRecord.user_id, estimatedCost)) {
    res.status(402).json({
      error: {
        message: "Insufficient balance. Please recharge your account.",
        type: "billing_error",
        code: "insufficient_balance",
      },
    });
    return;
  }

  const startTime = Date.now();
  const logId = randomUUID();
  const isStream = req.body.stream === true;

  recordRequest(upstream.providerId, modelId, apiKeyRecord.id, 0);
  acquireConcurrency(upstream.providerId, modelId);

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
          for await (const chunk of reader) {
            const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
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
      await billAndLog(usage, {
        upstream, logId, apiKeyRecord, modelId, model, startTime, estimatedTokens,
      });
    } else {
      // Non-streaming: parse response and return
      const data: any = await response.json();

      res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
      res.json(data);

      // Bill based on response usage
      const usage = data?.usage || {};
      await billAndLog(usage, {
        upstream, logId, apiKeyRecord, modelId, model, startTime, estimatedTokens,
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
    res.status(500).json({
      error: {
        message: sanitizeUpstreamError(err),
        type: "server_error",
        code: "upstream_error",
      },
    });
  } finally {
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

  const responseId = req.params.id;
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

  const responseId = req.params.id;
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

  const responseId = req.params.id;
  const resolvedUpstream = await resolveUpstream("qwen-plus", { region: getRequestedRegion(req) });
  if (!resolvedUpstream.ok) {
    res.status(resolvedUpstream.status).json({ error: upstreamErrorBody(resolvedUpstream) });
    return;
  }

  const upstream = resolvedUpstream.upstream;
  try {
    // Forward query params (after, limit, order)
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
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
  },
): Promise<void> {
  const { upstream, logId, apiKeyRecord, modelId, model, startTime, estimatedTokens } = ctx;
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
  });
  recordProviderTokens(upstream.providerId, modelId, totalTokens);
  await reconcileTokensAsync(`user:${apiKeyRecord.user_id}:${modelId}`, estimatedTokens, totalTokens);

  if (billing.finalAmount > 0) {
    await consume(
      apiKeyRecord.user_id,
      billing.finalAmount,
      buildApiDescription(modelId, totalTokens, billing.cachedTokens),
      apiKeyRecord.id,
      billing.discountRate,
      billing.discountAmount,
    );
  }
}

export default router;
