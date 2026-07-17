/**
 * Anthropic Messages API Compatible Route
 *
 * Endpoint: POST /v1/messages
 *
 * Pass-through to upstream Anthropic or Anthropic-compatible endpoints
 * (native Anthropic API, or DashScope /apps/anthropic/v1/messages).
 */

import { Router, Request, Response } from "express";
import { models } from "../data/models";
import { validateApiKey } from "../data/apikeys";
import { logUsage } from "../data/usage";
import { consume, hasSufficientBalance } from "../data/billing";
import { applyUserModelDiscount, calculateDiscountedTokenCost } from "../data/user-discounts";
import { checkConsumerLimits, checkRPM, checkTPM, reconcileTokensAsync, recordRequest, recordProviderTokens } from "../services/rate-limiter";
import { getEffectiveRateLimit } from "../data/ratelimits";
import { isModelAllowed } from "../data/model-access";
import { detectModelType } from "../services/adapters";
import { getRequestedRegion, resolveUpstream } from "../services/upstream";
import { buildApiDescription } from "../utils/cache-billing";
import { acquireConcurrency, releaseConcurrency } from "../services/scheduler";
import { sanitizeUpstreamError } from "../utils/sanitize-error";
import {
  anthropicToOpenAiPayload,
  openAiResponseToAnthropic,
  openAiUsageToAnthropic,
  createAnthropicStreamTranslator,
} from "../utils/anthropic-openai-bridge";

const router = Router();

const UPSTREAM_TIMEOUT = 600000; // 10分钟

/** Extract API key from x-api-key header or Authorization Bearer */
function extractAnthropicToken(req: Request): string | null {
  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string" && xApiKey.trim()) return xApiKey.trim();

  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();

  return null;
}


/** Parse SSE events from upstream OpenAI streaming response */
function parseSseEvent(line: string): any | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") return null;
  try {
    return JSON.parse(trimmed.slice(6));
  } catch {
    return null;
  }
}

function roughTokenCount(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return Math.ceil(value.length / 2);
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + roughTokenCount(item), 0);
  if (typeof value === "object") return Math.ceil(JSON.stringify(value).length / 2);
  return Math.ceil(String(value).length / 2);
}

async function estimateMessageMaxCost(userId: string | null | undefined, model: any, body: any): Promise<number> {
  const promptTokens = Math.max(1, roughTokenCount(body.system) + roughTokenCount(body.messages));
  const completionTokens = Math.max(1, Math.min(Number(body.max_tokens) || model.maxOutput || 4096, model.maxOutput || 4096));
  return (await calculateDiscountedTokenCost(userId, model, promptTokens, completionTokens)).finalAmount;
}

function estimateMessageTokens(model: any, body: any): number {
  const promptTokens = Math.max(1, roughTokenCount(body.system) + roughTokenCount(body.messages));
  const completionTokens = Math.max(1, Math.min(Number(body.max_tokens) || model.maxOutput || 4096, model.maxOutput || 4096));
  return promptTokens + completionTokens;
}

function rejectInsufficientBalance(res: Response): void {
  res.status(402).json({
    type: "error",
    error: {
      type: "invalid_request_error",
      message: "Insufficient balance for estimated maximum cost. Please recharge your account or lower max_tokens.",
    },
  });
}

async function calculateAnthropicUsageCost(userId: string | null | undefined, model: any, usage: any) {
  const inputTokens = usage?.input_tokens || 0;
  const outputTokens = usage?.output_tokens || 0;
  const cacheCreationTokens = usage?.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage?.cache_read_input_tokens || 0;
  const baseInputTokens = Math.max(0, inputTokens - cacheCreationTokens - cacheReadTokens);

  // 缓存命中价优先用模型显式配置（如 kimi/kimi-k3=¥2/M、glm-5.2=¥2/M），否则按输入价 10%
  const cacheReadPrice = model.cacheReadPrice ?? (model.promptPrice * 0.1);
  const listAmount = (baseInputTokens / 1_000_000) * model.promptPrice
    + (cacheCreationTokens / 1_000_000) * model.promptPrice * 1.25
    + (cacheReadTokens / 1_000_000) * cacheReadPrice
    + (outputTokens / 1_000_000) * model.completionPrice;
  const discounted = await applyUserModelDiscount(userId, model.id, listAmount);
  return { ...discounted, cachedTokens: cacheReadTokens, cacheCreationTokens };
}

function getAnthropicVersion(req: Request): string {
  const value = req.headers["anthropic-version"];
  return typeof value === "string" && value.trim() ? value.trim() : "2023-06-01";
}

function getAnthropicBeta(req: Request): string | undefined {
  const value = req.headers["anthropic-beta"];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// POST /v1/messages — Anthropic Messages compatible
router.post("/", async (req: Request, res: Response) => {
  const token = extractAnthropicToken(req);
  const apiKeyRecord = token ? await validateApiKey(token) : null;
  if (!apiKeyRecord) {
    res.status(401).json({
      type: "error",
      error: {
        type: "authentication_error",
        message: "Invalid API key provided.",
      },
    });
    return;
  }

  const { model: modelId, messages, stream, max_tokens, temperature, top_p, system, stop_sequences, tools } = req.body;

  if (!modelId || !messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Missing required parameters: model and messages.",
      },
    });
    return;
  }

  const model = models.find((m) => m.id === modelId);
  if (!model) {
    res.status(404).json({
      type: "error",
      error: {
        type: "not_found_error",
        message: `Model '${modelId}' not found.`,
      },
    });
    return;
  }

  const modelType = detectModelType(model.category);
  if (modelType !== "chat") {
    res.status(400).json({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: `Model '${modelId}' does not support messages.`,
      },
    });
    return;
  }

  const resolvedUpstream = await resolveUpstream(modelId, { region: getRequestedRegion(req) });
  if (!resolvedUpstream.ok) {
    res.status(resolvedUpstream.status).json({
      type: "error",
      error: {
        type: resolvedUpstream.status >= 500 ? "api_error" : resolvedUpstream.status === 404 ? "not_found_error" : "invalid_request_error",
        message: resolvedUpstream.message,
      },
    });
    return;
  }
  const upstream = resolvedUpstream.upstream;
  const upstreamApiKey = upstream.apiKey;

  const reservedMessageTokens = apiKeyRecord.user_id ? estimateMessageTokens(model, req.body) : 0;

  // Per-model rate limit
  if (apiKeyRecord.user_id) {
    if (!isModelAllowed(apiKeyRecord.parent_user_id, apiKeyRecord.allowed_models, modelId)) {
      res.status(403).json({
        type: "error",
        error: {
          type: "permission_error",
          message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`,
        },
      });
      return;
    }
    const userLimits = await getEffectiveRateLimit(apiKeyRecord.user_id, modelId);
    const rpmCheck = await checkRPM(`user:${apiKeyRecord.user_id}:${modelId}`, userLimits.qpm);
    if (!rpmCheck.allowed) {
      res.status(429).json({
        type: "error",
        error: {
          type: "rate_limit_error",
          message: `Model-level QPM limit exceeded for '${modelId}'. Retry after ${Math.ceil(rpmCheck.resetMs / 1000)}s.`,
        },
      });
      return;
    }
    const tpmCheck = await checkTPM(`user:${apiKeyRecord.user_id}:${modelId}`, userLimits.tpm, reservedMessageTokens);
    if (!tpmCheck.allowed) {
      res.status(429).json({
        type: "error",
        error: {
          type: "rate_limit_error",
          message: `Model-level TPM limit exceeded for '${modelId}'. Remaining: ${tpmCheck.remaining} tokens.`,
        },
      });
      return;
    }
  }

  const rateCheck = checkConsumerLimits(apiKeyRecord.id, apiKeyRecord.rate_limit);
  if (!rateCheck.allowed) {
    res.status(429).json({
      type: "error",
      error: {
        type: "rate_limit_error",
        message: rateCheck.reason,
      },
    });
    return;
  }

  const estimatedCost = await estimateMessageMaxCost(apiKeyRecord.user_id, model, req.body);
  if (!await hasSufficientBalance(apiKeyRecord.user_id, estimatedCost)) {
    rejectInsufficientBalance(res);
    return;
  }

  const startTime = Date.now();
  const logId = require("crypto").randomUUID();
  recordRequest(upstream.providerId, modelId, apiKeyRecord.id, 0);
  acquireConcurrency(upstream.providerId, modelId);

  try {

  // anthropicPassThrough 可由后台「模型目录」按模型覆盖：false = 上游 anthropic
  // 兼容端点未接入该模型，走平台内协议转换（anthropic-openai-bridge）
  const usePassThrough = upstream.providerId === "anthropic"
    || (upstream.anthropicCompatBaseUrl && model.anthropicPassThrough !== false);

  if (usePassThrough) {
    const passThroughBase = upstream.anthropicCompatBaseUrl || upstream.baseUrl;
    try {
      const headers: Record<string, string> = {
        "x-api-key": upstreamApiKey,
        "anthropic-version": getAnthropicVersion(req),
        "Content-Type": "application/json",
      };
      const beta = getAnthropicBeta(req);
      if (beta) headers["anthropic-beta"] = beta;

      const response = await fetch(`${passThroughBase}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
      });

      if (stream) {
        if (!response.ok) {
          const errText = await response.text();
          res.status(response.status).json({
            type: "error",
            error: {
              type: "api_error",
              message: errText,
            },
          });
          return;
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        let fullResponse = "";
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheCreationInputTokens = 0;
        let cacheReadInputTokens = 0;
        let ttftMs = 0;
        let chunkCount = 0;
        let firstChunkTime = 0;
        let lastChunkTime = 0;

        const reader = response.body as any;
        const writeChunk = (chunk: any) => {
          const now = Date.now();
          if (chunkCount === 0) {
            ttftMs = now - startTime;
            firstChunkTime = now;
          }
          lastChunkTime = now;
          chunkCount++;
          const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
          const rewritten = text.replace(/"id":"[^"]*"/, `"id":"msg_${logId}"`);
          fullResponse += rewritten;
          res.write(rewritten);
        };

        if (reader && typeof reader[Symbol.asyncIterator] === "function") {
          for await (const chunk of reader) writeChunk(chunk);
        } else if (reader && reader.getReader) {
          const r = reader.getReader();
          while (true) {
            const { done, value } = await r.read();
            if (done) break;
            writeChunk(value);
          }
        }
        res.end();

        for (const line of fullResponse.split(/\r?\n/)) {
          const event = parseSseEvent(line);
          const usage = event?.message?.usage || event?.usage;
          if (!usage) continue;
          inputTokens = usage.input_tokens ?? inputTokens;
          outputTokens = usage.output_tokens ?? outputTokens;
          cacheCreationInputTokens = usage.cache_creation_input_tokens ?? cacheCreationInputTokens;
          cacheReadInputTokens = usage.cache_read_input_tokens ?? cacheReadInputTokens;
        }

        const latencyMs = Date.now() - startTime;
        const billing = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: cacheCreationInputTokens,
          cache_read_input_tokens: cacheReadInputTokens,
        });
        const totalTokens = inputTokens + outputTokens;
        const streamDuration = lastChunkTime > firstChunkTime ? lastChunkTime - firstChunkTime : 0;
        const tpotMs = outputTokens > 1 ? streamDuration / (outputTokens - 1) : 0;

        await logUsage({
          region: upstream.region,
          apiKeyId: apiKeyRecord.id,
          userId: apiKeyRecord.user_id,
          model: modelId,
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens,
          cost: billing.finalAmount,
          status: "success",
          latencyMs,
          ttftMs,
          tpotMs,
          cachedTokens: cacheReadInputTokens,
          cacheCreationTokens: cacheCreationInputTokens,
          route: "anthropic-passthrough",
        });
        recordProviderTokens(upstream.providerId, modelId, totalTokens);
        if (apiKeyRecord.user_id) {
          await reconcileTokensAsync(`user:${apiKeyRecord.user_id}:${modelId}`, reservedMessageTokens, totalTokens);
        }

        if (apiKeyRecord.user_id && billing.finalAmount > 0) {
          await consume(
            apiKeyRecord.user_id,
            billing.finalAmount,
            buildApiDescription(modelId, totalTokens, cacheReadInputTokens, true),
            apiKeyRecord.id,
            billing.discountRate,
            billing.discountAmount,
          );
        }
        return;
      }

      const data: any = await response.json();
      if (!response.ok) {
        res.status(response.status).json(data);
        return;
      }

      const usage = data.usage || {};
      const billing = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, usage);
      const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
      await logUsage({
        region: upstream.region,
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        promptTokens: usage.input_tokens || 0,
        completionTokens: usage.output_tokens || 0,
        totalTokens,
        cost: billing.finalAmount,
        status: "success",
        latencyMs: Date.now() - startTime,
        cachedTokens: usage.cache_read_input_tokens || 0,
        cacheCreationTokens: usage.cache_creation_input_tokens || 0,
        route: "anthropic-passthrough",
      });
      recordProviderTokens(upstream.providerId, modelId, totalTokens);
      if (apiKeyRecord.user_id) {
        await reconcileTokensAsync(`user:${apiKeyRecord.user_id}:${modelId}`, reservedMessageTokens, totalTokens);
      }

      if (apiKeyRecord.user_id && billing.finalAmount > 0) {
        await consume(
          apiKeyRecord.user_id,
          billing.finalAmount,
          buildApiDescription(modelId, totalTokens, usage.cache_read_input_tokens || 0),
          apiKeyRecord.id,
          billing.discountRate,
          billing.discountAmount,
        );
      }

      res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
      if (data && typeof data === "object") data.id = `msg_${logId}`;
      res.json(data);
      return;
    } catch (err: any) {
      await logUsage({
        region: upstream.region,
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        status: "error",
        latencyMs: Date.now() - startTime,
        route: "anthropic-passthrough",
      });

      res.status(500).json({
        type: "error",
        error: {
          type: "api_error",
          message: `Upstream request failed: ${sanitizeUpstreamError(err)}`,
        },
      });
      return;
    }
  }

  // OpenAI 转换回退：上游 Anthropic 兼容端点未接入该模型（或不存在）时，
  // 把 Anthropic 请求转成 OpenAI 格式打 compatible-mode，响应再转回 Anthropic 格式
  try {
    const payload = anthropicToOpenAiPayload(req.body);
    const response = await fetch(`${upstream.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${upstreamApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    });

    if (stream) {
      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).json({
          type: "error",
          error: { type: "api_error", message: sanitizeUpstreamError(errText) },
        });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let ttftMs = 0;
      let chunkCount = 0;
      let firstChunkTime = 0;
      let lastChunkTime = 0;
      const translator = createAnthropicStreamTranslator(`msg_${logId}`, modelId, (text) => res.write(text));
      const feed = (chunk: any) => {
        const now = Date.now();
        if (chunkCount === 0) {
          ttftMs = now - startTime;
          firstChunkTime = now;
        }
        lastChunkTime = now;
        chunkCount++;
        translator.feed(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      };

      const reader = response.body as any;
      if (reader && typeof reader[Symbol.asyncIterator] === "function") {
        for await (const chunk of reader) feed(chunk);
      } else if (reader && reader.getReader) {
        const r = reader.getReader();
        while (true) {
          const { done, value } = await r.read();
          if (done) break;
          feed(value);
        }
      }
      const { usage } = translator.finish();
      res.end();

      const latencyMs = Date.now() - startTime;
      const billing = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, usage);
      const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
      const streamDuration = lastChunkTime > firstChunkTime ? lastChunkTime - firstChunkTime : 0;
      const tpotMs = (usage.output_tokens || 0) > 1 ? streamDuration / (usage.output_tokens - 1) : 0;

      await logUsage({
        region: upstream.region,
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        promptTokens: usage.input_tokens || 0,
        completionTokens: usage.output_tokens || 0,
        totalTokens,
        cost: billing.finalAmount,
        status: "success",
        latencyMs,
        ttftMs,
        tpotMs,
        cachedTokens: usage.cache_read_input_tokens || 0,
        cacheCreationTokens: usage.cache_creation_input_tokens || 0,
        route: "anthropic-bridge",
      });
      recordProviderTokens(upstream.providerId, modelId, totalTokens);
      if (apiKeyRecord.user_id) {
        await reconcileTokensAsync(`user:${apiKeyRecord.user_id}:${modelId}`, reservedMessageTokens, totalTokens);
      }
      if (apiKeyRecord.user_id && billing.finalAmount > 0) {
        await consume(
          apiKeyRecord.user_id,
          billing.finalAmount,
          buildApiDescription(modelId, totalTokens, usage.cache_read_input_tokens || 0, true),
          apiKeyRecord.id,
          billing.discountRate,
          billing.discountAmount,
        );
      }
      return;
    }

    const data: any = await response.json();
    if (!response.ok) {
      res.status(response.status).json({
        type: "error",
        error: {
          type: response.status === 429 ? "rate_limit_error" : "api_error",
          message: sanitizeUpstreamError(data?.error?.message || JSON.stringify(data)),
        },
      });
      return;
    }

    const anthropicResponse = openAiResponseToAnthropic(data, `msg_${logId}`, modelId);
    const usage = anthropicResponse.usage || openAiUsageToAnthropic(data?.usage);
    const billing = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, usage);
    const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
    await logUsage({
      region: upstream.region,
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      promptTokens: usage.input_tokens || 0,
      completionTokens: usage.output_tokens || 0,
      totalTokens,
      cost: billing.finalAmount,
      status: "success",
      latencyMs: Date.now() - startTime,
      cachedTokens: usage.cache_read_input_tokens || 0,
      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
      route: "anthropic-bridge",
    });
    recordProviderTokens(upstream.providerId, modelId, totalTokens);
    if (apiKeyRecord.user_id) {
      await reconcileTokensAsync(`user:${apiKeyRecord.user_id}:${modelId}`, reservedMessageTokens, totalTokens);
    }
    if (apiKeyRecord.user_id && billing.finalAmount > 0) {
      await consume(
        apiKeyRecord.user_id,
        billing.finalAmount,
        buildApiDescription(modelId, totalTokens, usage.cache_read_input_tokens || 0),
        apiKeyRecord.id,
        billing.discountRate,
        billing.discountAmount,
      );
    }

    res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
    res.json(anthropicResponse);
    return;
  } catch (err: any) {
    await logUsage({
      region: upstream.region,
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      status: "error",
      latencyMs: Date.now() - startTime,
      route: "anthropic-bridge",
    });
    res.status(500).json({
      type: "error",
      error: {
        type: "api_error",
        message: `Upstream request failed: ${sanitizeUpstreamError(err)}`,
      },
    });
    return;
  }

  } finally {
    releaseConcurrency(upstream.providerId, modelId);
  }
});

export default router;
