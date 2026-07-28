/**
 * Anthropic Messages API Compatible Route
 *
 * Endpoint: POST /v1/messages
 *
 * Pass-through to upstream Anthropic or Anthropic-compatible endpoints
 * (native Anthropic API, or DashScope /apps/anthropic/v1/messages).
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { models, getTokenPricingTier } from "../data/models";
import { validateApiKey } from "../data/apikeys";
import { logUpstreamFailure, logUsage } from "../data/usage";
import { BillingReservationFailureReason, releaseReservation, reserveBalanceWithReason, settleReservation } from "../data/billing";
import { applyUserModelDiscount, calculateDiscountedTokenCost } from "../data/user-discounts";
import { checkConsumerLimitsAsync } from "../services/rate-limiter";
import {
  reconcileAccountTpm,
  reserveAccountQpm,
  reserveAccountTpm,
} from "../services/account-rate-limiter";
import { isModelAllowed } from "../data/model-access";
import { detectModelType } from "../services/adapters";
import { getRequestedRegion, resolveUpstream } from "../services/upstream";
import { safeProviderFetch } from "../services/outbound-url-policy";
import { buildApiDescription, type AnthropicUsage } from "../utils/cache-billing";
import {
  acquireProviderCapacity,
  releaseProviderCapacity,
  type ProviderRequestCapacityLease,
} from "../services/scheduler";
import { sanitizeUpstreamError } from "../utils/sanitize-error";
import {
  anthropicToOpenAiPayload,
  openAiResponseToAnthropic,
  openAiUsageToAnthropic,
  createAnthropicStreamTranslator,
} from "../utils/anthropic-openai-bridge";
import { estimateStreamUsage, isUsageMissing } from "../utils/estimate-stream-usage";
import { getBillingFailurePayload } from "../utils/billing-response";

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


/** Parse SSE events from upstream streaming response（SSE 规范里 data: 后的空格可选） */
function parseSseEvent(line: string): any | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trimStart();
  if (payload === "[DONE]") return null;
  try {
    return JSON.parse(payload);
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

function rejectBillingReservation(res: Response, reason: BillingReservationFailureReason): void {
  const failure = getBillingFailurePayload(reason);
  res.status(failure.status).json({
    type: "error",
    error: {
      type: failure.type,
      message: failure.message,
      code: failure.code,
    },
  });
}

async function calculateAnthropicUsageCost(
  userId: string | null | undefined,
  model: any,
  usage: AnthropicUsage | null | undefined,
  // Anthropic 语义(直通上游，实测含 DashScope /apps/anthropic)：input_tokens 与缓存 token 互斥；
  // OpenAI 语义(转换桥，openAiUsageToAnthropic 产出)：input_tokens=prompt_tokens 已含缓存部分
  opts: { inputIncludesCache: boolean }
) {
  const inputTokens = usage?.input_tokens || 0;
  const outputTokens = usage?.output_tokens || 0;
  const cacheCreationTokens = usage?.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage?.cache_read_input_tokens || 0;
  const baseInputTokens = opts.inputIncludesCache
    ? Math.max(0, inputTokens - cacheCreationTokens - cacheReadTokens)
    : inputTokens;
  const totalInputTokens = baseInputTokens + cacheCreationTokens + cacheReadTokens;

  // 分层定价与 v1 chat 实扣口径对齐（qwen3.7-plus/glm-5.x 等按输入总量取档）
  const tier = getTokenPricingTier(model, totalInputTokens);
  const promptPrice = tier?.promptPrice ?? model.promptPrice;
  const completionPrice = tier?.completionPrice ?? model.completionPrice;
  // 缓存命中价优先用档位/模型显式配置（如 kimi/kimi-k3=¥2/M、glm-5.2=¥2/M），否则按输入价 10%
  const cacheReadPrice = tier?.cacheReadPrice ?? model.cacheReadPrice ?? (promptPrice * 0.1);

  const listAmount = (baseInputTokens / 1_000_000) * promptPrice
    + (cacheCreationTokens / 1_000_000) * promptPrice * 1.25
    + (cacheReadTokens / 1_000_000) * cacheReadPrice
    + (outputTokens / 1_000_000) * completionPrice;
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

  // 与 /v1/chat/completions 口径一致：匿名 key（无归属用户）不允许使用公开推理端点
  if (!apiKeyRecord.user_id) {
    res.status(403).json({
      type: "error",
      error: {
        type: "permission_error",
        message: "This API key is not associated with a user account. Please use a key created from your dashboard.",
      },
    });
    return;
  }

  const resolvedUpstream = await resolveUpstream(modelId, {
    region: getRequestedRegion(req),
    userId: apiKeyRecord.user_id,
  });
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
    const rpmCheck = await reserveAccountQpm({
      userId: apiKeyRecord.user_id,
      parentUserId: apiKeyRecord.parent_user_id,
      modelId,
    });
    if (!rpmCheck.allowed) {
      res.status(429).json({
        type: "error",
        error: {
          type: "rate_limit_error",
          message: `Model-level QPM limit exceeded (${rpmCheck.limit}/min) for '${modelId}'.`,
        },
      });
      return;
    }
    const tpmCheck = await reserveAccountTpm({
      userId: apiKeyRecord.user_id,
      parentUserId: apiKeyRecord.parent_user_id,
      modelId,
      estimatedTokens: reservedMessageTokens,
    });
    if (!tpmCheck.allowed) {
      res.status(429).json({
        type: "error",
        error: {
          type: "rate_limit_error",
          message: `Model-level TPM limit exceeded for '${modelId}'. Remaining: ${tpmCheck.remaining || 0} tokens.`,
        },
      });
      return;
    }
  }

  const rateCheck = await checkConsumerLimitsAsync(apiKeyRecord.id, apiKeyRecord.rate_limit);
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
  const billingReservationResult = await reserveBalanceWithReason(
    apiKeyRecord.user_id,
    estimatedCost,
    `messages:${randomUUID()}`
  );
  if (!billingReservationResult.reservation) {
    rejectBillingReservation(res, billingReservationResult.reason);
    return;
  }
  const billingReservation = billingReservationResult.reservation;

  const startTime = Date.now();
  const logId = randomUUID();
  // 预占 TPM 归还：正常路径按实际 usage 归还，异常/上游错误路径由 finally 兜底释放，且仅一次。
  let tokensReconciled = false;
  let billableResponseReceived = false;
  let providerCapacityLease: ProviderRequestCapacityLease | null = null;
  let actualProviderTokens = 0;
  const reconcileOnce = async (actualTokens: number) => {
    if (tokensReconciled) return;
    tokensReconciled = true;
    if (apiKeyRecord.user_id) {
      try {
        await reconcileAccountTpm({
          userId: apiKeyRecord.user_id,
          parentUserId: apiKeyRecord.parent_user_id,
          modelId,
          reservedTokens: reservedMessageTokens,
          actualTokens,
        });
      } catch { /* 归还失败仅影响 60s 窗口 */ }
    }
  };

  try {
  const capacity = await acquireProviderCapacity(upstream, modelId, reservedMessageTokens);
  if (!capacity.ok) {
    res.status(503).json({
      type: "error",
      error: { type: "api_error", message: capacity.message },
    });
    return;
  }
  providerCapacityLease = capacity.lease;

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

      const response = await safeProviderFetch(`${passThroughBase}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
      });

      if (stream) {
        if (!response.ok) {
          const errText = await response.text();
          await logUpstreamFailure({
            logId,
            apiKeyId: apiKeyRecord.id,
            userId: apiKeyRecord.user_id,
            model: modelId,
            providerId: upstream.providerId,
            channelId: upstream.channelId,
            region: upstream.region,
            protocol: "anthropic-messages",
            latencyMs: Date.now() - startTime,
            httpStatus: response.status,
            errorReason: errText || "Upstream API error",
            reservationId: billingReservation.id,
          });
          res.status(response.status).json({
            type: "error",
            error: {
              type: "api_error",
              message: errText,
            },
          });
          return;
        }
        billableResponseReceived = true;

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
        // 单实例 decoder + stream:true：多字节 UTF-8 跨 TCP 分片时不产生乱码
        const decoder = new TextDecoder();
        const writeChunk = (chunk: any) => {
          const now = Date.now();
          if (chunkCount === 0) {
            ttftMs = now - startTime;
            firstChunkTime = now;
          }
          lastChunkTime = now;
          chunkCount++;
          const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
          // 只重写 Anthropic 事件 id（msg_ 前缀），避免误伤正文中的 JSON 示例
          const rewritten = text.replace(/"id":"msg_[^"]*"/, `"id":"msg_${logId}"`);
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

        // 断流兜底：上游在 message_delta（含 usage）发出前断开 → usage 全 0。
        // 按已转发的 Anthropic SSE 估费，避免平台承担全部上游成本而记 0。
        let estimatedBilling = false;
        if (isUsageMissing({ input_tokens: inputTokens, output_tokens: outputTokens }) && fullResponse.length > 0) {
          const est = estimateStreamUsage(fullResponse, req.body.messages);
          inputTokens = est.prompt_tokens;
          outputTokens = est.completion_tokens;
          estimatedBilling = true;
        }

        const latencyMs = Date.now() - startTime;
        const billing = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: cacheCreationInputTokens,
          cache_read_input_tokens: cacheReadInputTokens,
        }, { inputIncludesCache: false });
        const totalTokens = inputTokens + outputTokens;
        const streamDuration = lastChunkTime > firstChunkTime ? lastChunkTime - firstChunkTime : 0;
        const tpotMs = outputTokens > 1 ? streamDuration / (outputTokens - 1) : 0;

        await logUsage({
          region: upstream.region,
          providerId: upstream.providerId,
          channelId: upstream.channelId,
          protocol: "anthropic-messages",
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
          providerCacheMode: "explicit",
          providerInputIncludesCache: false,
          route: "anthropic-passthrough",
          estimated: estimatedBilling,
          reservationId: billingReservation.id,
        });
        actualProviderTokens = totalTokens;
        await reconcileOnce(totalTokens);

        await settleReservation(
          billingReservation.id,
          billing.finalAmount,
          buildApiDescription(modelId, totalTokens, cacheReadInputTokens, true),
          billing.discountRate,
          billing.discountAmount,
        );
        return;
      }

      const data: any = await response.json();
      if (!response.ok) {
        await logUpstreamFailure({
          logId,
          apiKeyId: apiKeyRecord.id,
          userId: apiKeyRecord.user_id,
          model: modelId,
          providerId: upstream.providerId,
          channelId: upstream.channelId,
          region: upstream.region,
          protocol: "anthropic-messages",
          latencyMs: Date.now() - startTime,
          httpStatus: response.status,
          errorReason: data?.error?.message || "Upstream API error",
          reservationId: billingReservation.id,
        });
        res.status(response.status).json(data);
        return;
      }
      billableResponseReceived = true;

      const usage = data.usage || {};
      const billing = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, usage, { inputIncludesCache: false });
      const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
      await logUsage({
        region: upstream.region,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        protocol: "anthropic-messages",
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
        providerCacheMode: "explicit",
        providerInputIncludesCache: false,
        route: "anthropic-passthrough",
        reservationId: billingReservation.id,
      });
      actualProviderTokens = totalTokens;
      await reconcileOnce(totalTokens);

      await settleReservation(
        billingReservation.id,
        billing.finalAmount,
        buildApiDescription(modelId, totalTokens, usage.cache_read_input_tokens || 0),
        billing.discountRate,
        billing.discountAmount,
      );

      res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
      if (data && typeof data === "object") data.id = `msg_${logId}`;
      res.json(data);
      return;
    } catch (err: any) {
      await logUsage({
        region: upstream.region,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        protocol: "anthropic-messages",
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
        reservationId: billingReservation.id,
        errorCode: "upstream_error",
        errorReason: String(err?.message || err),
      });

      // 流式中途出错时 SSE 头已发出，只能终止连接，不能再写状态码
      if (res.headersSent) {
        try { res.end(); } catch { /* 连接可能已断 */ }
        return;
      }
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
    const response = await safeProviderFetch(`${upstream.baseUrl}/chat/completions`, {
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
        // 上游 4xx 的错误说明对客户端有用（参数错/超长等），透传摘要；5xx 才收敛为通用文案
        let upstreamMsg = "Upstream API error";
        try { upstreamMsg = JSON.parse(errText)?.error?.message || upstreamMsg; } catch { /* 保持通用文案 */ }
        await logUpstreamFailure({
          logId,
          apiKeyId: apiKeyRecord.id,
          userId: apiKeyRecord.user_id,
          model: modelId,
          providerId: upstream.providerId,
          channelId: upstream.channelId,
          region: upstream.region,
          protocol: "anthropic-messages",
          latencyMs: Date.now() - startTime,
          httpStatus: response.status,
          errorReason: upstreamMsg,
          reservationId: billingReservation.id,
        });
        res.status(response.status).json({
          type: "error",
          error: {
            type: response.status === 429 ? "rate_limit_error" : response.status < 500 ? "invalid_request_error" : "api_error",
            message: response.status < 500 ? upstreamMsg : sanitizeUpstreamError(errText),
          },
        });
        return;
      }
      billableResponseReceived = true;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let ttftMs = 0;
      let chunkCount = 0;
      let firstChunkTime = 0;
      let lastChunkTime = 0;
      const translator = createAnthropicStreamTranslator(`msg_${logId}`, modelId, (text) => res.write(text));
      const decoder = new TextDecoder();
      let rawUpstream = ""; // 累积上游原始 OpenAI SSE，供断流时估费
      const feed = (chunk: any) => {
        const now = Date.now();
        if (chunkCount === 0) {
          ttftMs = now - startTime;
          firstChunkTime = now;
        }
        lastChunkTime = now;
        chunkCount++;
        const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
        rawUpstream += text;
        translator.feed(text);
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

      // 断流兜底：上游在末尾 usage 块发出前断开 → usage 全 0，按已收 OpenAI SSE 估费
      let estimatedBilling = false;
      let billingUsage = usage;
      if (isUsageMissing(usage) && rawUpstream.length > 0) {
        const est = estimateStreamUsage(rawUpstream, req.body.messages);
        billingUsage = {
          input_tokens: est.prompt_tokens,
          output_tokens: est.completion_tokens,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        };
        estimatedBilling = true;
      }

      const latencyMs = Date.now() - startTime;
      const billing = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, billingUsage, { inputIncludesCache: true });
      const totalTokens = (billingUsage.input_tokens || 0) + (billingUsage.output_tokens || 0);
      const streamDuration = lastChunkTime > firstChunkTime ? lastChunkTime - firstChunkTime : 0;
      const tpotMs = (billingUsage.output_tokens || 0) > 1 ? streamDuration / (billingUsage.output_tokens - 1) : 0;

      await logUsage({
        region: upstream.region,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        protocol: "anthropic-messages",
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        promptTokens: billingUsage.input_tokens || 0,
        completionTokens: billingUsage.output_tokens || 0,
        totalTokens,
        cost: billing.finalAmount,
        status: "success",
        latencyMs,
        ttftMs,
        tpotMs,
        cachedTokens: billingUsage.cache_read_input_tokens || 0,
        cacheCreationTokens: billingUsage.cache_creation_input_tokens || 0,
        providerCacheMode: "explicit",
        providerInputIncludesCache: true,
        route: "anthropic-bridge",
        estimated: estimatedBilling,
        reservationId: billingReservation.id,
      });
      actualProviderTokens = totalTokens;
      await reconcileOnce(totalTokens);
      await settleReservation(
        billingReservation.id,
        billing.finalAmount,
        buildApiDescription(modelId, totalTokens, usage.cache_read_input_tokens || 0, true),
        billing.discountRate,
        billing.discountAmount,
      );
      return;
    }

    const data: any = await response.json();
    if (!response.ok) {
      const upstreamMsg = typeof data?.error?.message === "string" && data.error.message ? data.error.message : "Upstream API error";
      await logUpstreamFailure({
        logId,
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        region: upstream.region,
        protocol: "anthropic-messages",
        latencyMs: Date.now() - startTime,
        httpStatus: response.status,
        errorReason: upstreamMsg,
        reservationId: billingReservation.id,
      });
      res.status(response.status).json({
        type: "error",
        error: {
          type: response.status === 429 ? "rate_limit_error" : response.status < 500 ? "invalid_request_error" : "api_error",
          message: response.status < 500 ? upstreamMsg : sanitizeUpstreamError(data?.error),
        },
      });
      return;
    }
    billableResponseReceived = true;

    const anthropicResponse = openAiResponseToAnthropic(data, `msg_${logId}`, modelId);
    const usage = anthropicResponse.usage || openAiUsageToAnthropic(data?.usage);
    const billing = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, usage, { inputIncludesCache: true });
    const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "anthropic-messages",
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
      providerCacheMode: "explicit",
      providerInputIncludesCache: true,
      route: "anthropic-bridge",
      reservationId: billingReservation.id,
    });
    actualProviderTokens = totalTokens;
    await reconcileOnce(totalTokens);
    await settleReservation(
      billingReservation.id,
      billing.finalAmount,
      buildApiDescription(modelId, totalTokens, usage.cache_read_input_tokens || 0),
      billing.discountRate,
      billing.discountAmount,
    );

    res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
    res.json(anthropicResponse);
    return;
  } catch (err: any) {
    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "anthropic-messages",
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
      reservationId: billingReservation.id,
      errorCode: "upstream_error",
      errorReason: String(err?.message || err),
    });
    // 流式中途出错时 SSE 头已发出，只能终止连接，不能再写状态码
    if (res.headersSent) {
      try { res.end(); } catch { /* 连接可能已断 */ }
      return;
    }
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
    if (!billableResponseReceived) await releaseReservation(billingReservation.id);
    await reconcileOnce(0);
    await releaseProviderCapacity(providerCapacityLease, actualProviderTokens);
  }
});

export default router;
