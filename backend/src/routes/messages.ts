/**
 * Anthropic Messages API Compatible Route
 *
 * Endpoint: POST /v1/messages
 *
 * Pass-through to upstream Anthropic or Anthropic-compatible endpoints
 * (native Anthropic API, or DashScope /apps/anthropic/v1/messages).
 */

import { Router, Request, Response } from "express";
import {
  getReservedOutputTokens,
  getTokenPricingTier,
  resolveCachePricing,
  resolveCompletionPrice,
} from "../data/models";
import { logUpstreamFailure, logUsage } from "../data/usage";
import { BillingReservationFailureReason, settleReservation } from "../data/billing";
import { applyUserModelDiscount, calculateDiscountedTokenCost } from "../data/user-discounts";
import { setRateLimitHeaders } from "../utils/rate-limit-headers";
import { detectModelType } from "../services/adapters";
import { buildApiDescription, isExplicitCacheRequested, type AnthropicUsage } from "../utils/cache-billing";
import { sanitizeUpstreamError } from "../utils/sanitize-error";
import {
  anthropicToOpenAiPayload,
  openAiResponseToAnthropic,
  openAiUsageToAnthropic,
  createAnthropicStreamTranslator,
} from "../utils/anthropic-openai-bridge";
import { estimateStreamUsage, isUsageMissing } from "../utils/estimate-stream-usage";
import { getBillingFailurePayload } from "../utils/billing-response";
import { restorePublicModelAlias, rewriteUpstreamModelAliasText } from "../utils/upstream-model-aliases";
import { InferenceContext } from "../pipeline/context";
import { roughTokenCount } from "../pipeline/estimates";
import {
  anthropicToken,
  authenticateApiKey,
  checkConsumer,
  checkModelAccess,
  invokeUpstream,
  reconcileTokens,
  release,
  reserveBilling,
  reserveProviderCapacity,
  reserveQpm,
  reserveTpm,
  resolveModel,
  selectRoute,
  capacityErrorType,
  capacityHttpStatus,
} from "../pipeline/stages";

const router = Router();



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

async function estimateMessageMaxCost(userId: string | null | undefined, model: any, body: any): Promise<number> {
  const promptTokens = Math.max(1, roughTokenCount(body.system) + roughTokenCount(body.messages));
  const completionTokens = getReservedOutputTokens(model, body.max_tokens);
  return (await calculateDiscountedTokenCost(userId, model, promptTokens, completionTokens)).finalAmount;
}

function estimateMessageTokens(model: any, body: any): number {
  const promptTokens = Math.max(1, roughTokenCount(body.system) + roughTokenCount(body.messages));
  const completionTokens = getReservedOutputTokens(model, body.max_tokens);
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

/**
 * 本次响应是否产出了思维链。用于按官方口径选择思考/非思考输出价。
 *
 * 必须**逐行解析 JSON 后判结构字段**，不能对全文做子串匹配：助手正文本身
 * 可能包含 `thinking_delta` 字面量（例如用户在问 Anthropic SSE 协议、贴代码），
 * 子串匹配会让非思考请求被判成思考并按思考价多收，是内容可触发的计价翻转。
 *
 * 两种流式格式都要认：直通路径是 Anthropic SSE（thinking_delta），
 * 桥路径的上游原文是 OpenAI SSE（delta.reasoning_content）。
 */
export function hasThinkingOutput(payload: unknown): boolean {
  if (typeof payload === "string") {
    for (const line of payload.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const body = trimmed.slice(5).trimStart();
      if (body === "[DONE]") continue;
      try {
        const json = JSON.parse(body);
        if (json?.type === "content_block_delta" && json?.delta?.type === "thinking_delta") return true;
        const reasoning = json?.choices?.[0]?.delta?.reasoning_content;
        if (typeof reasoning === "string" && reasoning.length > 0) return true;
      } catch {
        /* 残缺行忽略 */
      }
    }
    return false;
  }
  const blocks = (payload as { content?: unknown })?.content;
  return Array.isArray(blocks)
    && blocks.some((b) => (b as { type?: string })?.type === "thinking");
}

async function calculateAnthropicUsageCost(
  userId: string | null | undefined,
  model: any,
  usage: AnthropicUsage | null | undefined,
  // Anthropic 语义(直通上游，实测含 DashScope /apps/anthropic)：input_tokens 与缓存 token 互斥；
  // OpenAI 语义(转换桥，openAiUsageToAnthropic 产出)：input_tokens=prompt_tokens 已含缓存部分
  // explicitCache：本次请求是否真的开启了显式缓存。协议桥会把 OpenAI 的
  // prompt_tokens_details.cached_tokens（隐式命中）映射进 cache_read_input_tokens，
  // 故不能仅凭该字段非零就按显式价计费，否则显式价低于隐式价的模型会少收。
  opts: { inputIncludesCache: boolean; explicitCache: boolean; thinkingOutput?: boolean }
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
  // 官方对部分模型的思考模式单独定价。判定优先用真实信号，不能一律取较大值——
  // 那会让非思考请求被按思考价多收（qwen-plus 档1 是 4 倍）。
  // 信号来源：桥路径由 openAiUsageToAnthropic 透传 reasoning_tokens；
  // 直通路径由调用方根据响应里是否出现 thinking 块传入 thinkingOutput。
  const reasoningTokens = usage?.reasoning_tokens || 0;
  const isThinking = reasoningTokens > 0 || opts.thinkingOutput === true;
  const completionPrice = resolveCompletionPrice(model, tier, isThinking);
  // Anthropic 的 cache_control 即显式缓存，故取显式口径；解析器与展示层同源。
  const cachePricing = resolveCachePricing(model, tier);

  const cacheReadPrice = opts.explicitCache ? cachePricing.explicitHit : cachePricing.implicitHit;
  const listAmount = (baseInputTokens / 1_000_000) * promptPrice
    + (cacheCreationTokens / 1_000_000) * cachePricing.explicitCreation
    + (cacheReadTokens / 1_000_000) * cacheReadPrice
    + (outputTokens / 1_000_000) * completionPrice;
  const discounted = await applyUserModelDiscount(userId, model.id, listAmount);
  return { ...discounted, cachedTokens: cacheReadTokens, cacheCreationTokens, thinkingOutput: isThinking };
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
  const ctx = new InferenceContext("v1.messages", req, res);
  const apiKeyRecord = (await authenticateApiKey(ctx, anthropicToken(req))) ? ctx.requireCaller().apiKey! : null;
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
  // Anthropic 的显式缓存靠 messages/system 里的 cache_control 开启。
  // 不能只看 usage.cache_read_input_tokens：协议桥会把 OpenAI 的隐式 cached_tokens
  // 映射进该字段，误按显式价计费会让显式价低于隐式价的模型少收。
  const explicitCache = isExplicitCacheRequested([messages, system], req.body);

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

  const model = resolveModel(ctx, modelId) ? ctx.requireModel() : null;
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

  const routeFailure = await selectRoute(ctx);
  if (routeFailure) {
    res.status(routeFailure.status).json({
      type: "error",
      error: {
        type: routeFailure.status >= 500 ? "api_error" : routeFailure.status === 404 ? "not_found_error" : "invalid_request_error",
        message: routeFailure.message,
      },
    });
    return;
  }
  const upstream = ctx.requireUpstream();
  const upstreamApiKey = upstream.apiKey;

  const reservedMessageTokens = apiKeyRecord.user_id ? estimateMessageTokens(model, req.body) : 0;

  // Per-model rate limit
  if (apiKeyRecord.user_id) {
    if (!checkModelAccess(ctx)) {
      res.status(403).json({
        type: "error",
        error: {
          type: "permission_error",
          message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`,
        },
      });
      return;
    }
    const qpmFailure = await reserveQpm(ctx);
    if (qpmFailure) {
      setRateLimitHeaders(res, { scope: "account_model_qpm", limit: qpmFailure.limit, remaining: 0, resetMs: qpmFailure.resetMs, rejected: true });
      res.status(429).json({
        type: "error",
        error: {
          type: "rate_limit_error",
          message: `Model-level QPM limit exceeded (${qpmFailure.limit}/min) for '${modelId}'.`,
        },
      });
      return;
    }
    const tpmFailure = await reserveTpm(ctx, reservedMessageTokens);
    if (tpmFailure) {
      setRateLimitHeaders(res, { scope: "account_model_tpm", limit: tpmFailure.limit, remaining: tpmFailure.remaining ?? 0, rejected: true });
      res.status(429).json({
        type: "error",
        error: {
          type: "rate_limit_error",
          message: `Model-level TPM limit exceeded for '${modelId}'. Remaining: ${tpmFailure.remaining || 0} tokens.`,
        },
      });
      return;
    }
  }

  const consumerFailure = await checkConsumer(ctx);
  if (consumerFailure) {
    setRateLimitHeaders(res, { ...consumerFailure.check, rejected: true });
    res.status(429).json({
      type: "error",
      error: {
        type: "rate_limit_error",
        message: consumerFailure.check.reason,
      },
    });
    return;
  }

  const estimatedCost = await estimateMessageMaxCost(apiKeyRecord.user_id, model, req.body);
  const billingFailure = await reserveBilling(ctx, estimatedCost, "messages");
  if (billingFailure) {
    rejectBillingReservation(res, billingFailure);
    return;
  }
  const billingReservation = ctx.billingReservation!;

  const startTime = Date.now();
  const logId = ctx.logId;
  // 预占 TPM 归还：正常路径按实际 usage 归还，异常/上游错误路径由 release 兜底释放，且仅一次。
  const reconcileOnce = async (actualTokens: number) => {
    try {
      await reconcileTokens(ctx, actualTokens);
    } catch { /* 归还失败仅影响 60s 窗口 */ }
  };

  try {
  const capacityFailure = await reserveProviderCapacity(ctx, reservedMessageTokens);
  if (capacityFailure) {
    res.status(capacityHttpStatus(res, capacityFailure)).json({
      type: "error",
      error: { type: capacityErrorType(capacityFailure, "api_error"), message: capacityFailure.message },
    });
    return;
  }

  // anthropicPassThrough 可由后台「模型目录」按模型覆盖：false = 上游 anthropic
  // 兼容端点未接入该模型，走平台内协议转换（anthropic-openai-bridge）
  const usePassThrough = upstream.providerId === "anthropic"
    || model.anthropicPassThrough === true
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

      const response = await invokeUpstream(ctx, {
        url: `${passThroughBase}/messages`,
        auth: false,
        headers,
        body: { ...req.body, model: upstream.upstreamModelId },
      });

      if (stream) {
        if (!response.ok) {
          await response.text();
          const authorizationFailure = response.status === 401 || response.status === 403;
          const message = authorizationFailure
            ? "Upstream provider authorization failed."
            : response.status === 429
              ? "Upstream provider rate limit exceeded."
              : "Upstream provider rejected the request.";
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
            errorReason: `upstream_http_${response.status}`,
            reservationId: billingReservation.id,
            requestBody: req.body,
            responseBody: { status: response.status },
          });
          res.status(response.status).json({
            type: "error",
            error: {
              type: authorizationFailure ? "authentication_error" : "api_error",
              message,
            },
          });
          return;
        }
        ctx.billableResponseReceived = true;

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
        const decoder = new TextDecoder();
        let sseLineBuffer = "";
        const writeSseText = (text: string, flush = false) => {
          sseLineBuffer += text;
          const lines = sseLineBuffer.split("\n");
          sseLineBuffer = lines.pop() || "";
          const flushWithoutNewline = flush && sseLineBuffer.length > 0;
          if (flushWithoutNewline) {
            lines.push(sseLineBuffer);
            sseLineBuffer = "";
          }
          lines.forEach((line, index) => {
            const suffix = flushWithoutNewline && index === lines.length - 1 ? "" : "\n";
            const rewritten = rewriteUpstreamModelAliasText(
              line.replace(/"id"\s*:\s*"msg_[^"]*"/, `"id":"msg_${logId}"`),
              modelId
            ) + suffix;
            fullResponse += rewritten;
            res.write(rewritten);
          });
        };
        const writeChunk = (chunk: any) => {
          const now = Date.now();
          if (chunkCount === 0) {
            ttftMs = now - startTime;
            firstChunkTime = now;
          }
          lastChunkTime = now;
          chunkCount++;
          writeSseText(typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }));
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
        writeSseText(decoder.decode(), true);
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
        }, { inputIncludesCache: false, explicitCache, thinkingOutput: hasThinkingOutput(fullResponse) });
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
          retailListCost: billing.listAmount,
          retailDiscountRate: billing.discountRate,
          retailDiscountAmount: billing.discountAmount,
          thinkingOutput: billing.thinkingOutput,
          providerCacheMode: explicitCache ? "explicit" : "implicit",
          providerInputIncludesCache: false,
          route: "anthropic-passthrough",
          estimated: estimatedBilling,
          reservationId: billingReservation.id,
          requestBody: req.body,
          responseBody: fullResponse,
        });
        ctx.actualProviderTokens = totalTokens;
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
      restorePublicModelAlias(data, modelId);
      if (!response.ok) {
        const authorizationFailure = response.status === 401 || response.status === 403;
        const message = authorizationFailure
          ? "Upstream provider authorization failed."
          : response.status === 429
            ? "Upstream provider rate limit exceeded."
            : "Upstream provider rejected the request.";
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
          errorReason: `upstream_http_${response.status}`,
          reservationId: billingReservation.id,
          requestBody: req.body,
          responseBody: { status: response.status },
        });
        res.status(response.status).json({
          type: "error",
          error: {
            type: authorizationFailure ? "authentication_error" : "api_error",
            message,
          },
        });
        return;
      }
      ctx.billableResponseReceived = true;

      const usage = data.usage || {};
      const billing = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, usage, { inputIncludesCache: false, explicitCache, thinkingOutput: hasThinkingOutput(data) });
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
        retailListCost: billing.listAmount,
        retailDiscountRate: billing.discountRate,
        retailDiscountAmount: billing.discountAmount,
        thinkingOutput: billing.thinkingOutput,
        providerCacheMode: explicitCache ? "explicit" : "implicit",
        providerInputIncludesCache: false,
        route: "anthropic-passthrough",
        reservationId: billingReservation.id,
        requestBody: req.body,
        responseBody: data,
      });
      ctx.actualProviderTokens = totalTokens;
      await reconcileOnce(totalTokens);

      await settleReservation(
        billingReservation.id,
        billing.finalAmount,
        buildApiDescription(modelId, totalTokens, usage.cache_read_input_tokens || 0),
        billing.discountRate,
        billing.discountAmount,
      );

      if (ctx.consumerRemaining != null) res.setHeader("X-RateLimit-Remaining", ctx.consumerRemaining.toString());
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
        requestBody: req.body,
        responseBody: { error: { message: String(err?.message || err) } },
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
    const response = await invokeUpstream(ctx, {
      path: "/chat/completions",
      auth: false,
      headers: {
        "Authorization": `Bearer ${upstreamApiKey}`,
        "Content-Type": "application/json",
      },
      body: payload,
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
          requestBody: req.body,
          responseBody: (() => { try { return JSON.parse(errText); } catch { return errText; } })(),
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
      ctx.billableResponseReceived = true;

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
          // 估费已算出思维链长度，必须带上：丢了会让思考请求按非思考价少收，
          // 与 /v1/chat 断流兜底同一个坑（见 MODEL_ONBOARDING §4 第 11 条）。
          reasoning_tokens: est.completion_tokens_details.reasoning_tokens,
        };
        estimatedBilling = true;
      }

      const latencyMs = Date.now() - startTime;
      const billing = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, billingUsage, { inputIncludesCache: true, explicitCache, thinkingOutput: hasThinkingOutput(rawUpstream) });
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
        retailListCost: billing.listAmount,
        retailDiscountRate: billing.discountRate,
        retailDiscountAmount: billing.discountAmount,
        thinkingOutput: billing.thinkingOutput,
        providerCacheMode: explicitCache ? "explicit" : "implicit",
        providerInputIncludesCache: true,
        route: "anthropic-bridge",
        estimated: estimatedBilling,
        reservationId: billingReservation.id,
        requestBody: req.body,
        responseBody: rawUpstream,
      });
      ctx.actualProviderTokens = totalTokens;
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
        requestBody: req.body,
        responseBody: data,
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
    ctx.billableResponseReceived = true;

    const anthropicResponse = openAiResponseToAnthropic(data, `msg_${logId}`, modelId);
    const usage = anthropicResponse.usage || openAiUsageToAnthropic(data?.usage);
    const billing = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, usage, { inputIncludesCache: true, explicitCache, thinkingOutput: hasThinkingOutput(data) });
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
      retailListCost: billing.listAmount,
      retailDiscountRate: billing.discountRate,
      retailDiscountAmount: billing.discountAmount,
      thinkingOutput: billing.thinkingOutput,
      providerCacheMode: explicitCache ? "explicit" : "implicit",
      providerInputIncludesCache: true,
      route: "anthropic-bridge",
      reservationId: billingReservation.id,
      requestBody: req.body,
      responseBody: anthropicResponse,
    });
    ctx.actualProviderTokens = totalTokens;
    await reconcileOnce(totalTokens);
    await settleReservation(
      billingReservation.id,
      billing.finalAmount,
      buildApiDescription(modelId, totalTokens, usage.cache_read_input_tokens || 0),
      billing.discountRate,
      billing.discountAmount,
    );

    if (ctx.consumerRemaining != null) res.setHeader("X-RateLimit-Remaining", ctx.consumerRemaining.toString());
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
      requestBody: req.body,
      responseBody: { error: { message: String(err?.message || err) } },
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
    await release(ctx);
  }
});

export default router;
