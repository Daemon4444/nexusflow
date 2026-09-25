/**
 * OpenAI-Compatible API v1
 *
 * Endpoints:
 * - GET /v1/models - List all models
 * - POST /v1/chat/completions - Chat completions (with rate limiting)
 * - POST /v1/embeddings - Text embeddings
 */

import { Router, Request, Response } from "express";
import { models } from "../data/models";
import { validateApiKey } from "../data/apikeys";
import { logUpstreamFailure, logUsage } from "../data/usage";
import { BillingReservationFailureReason, settleReservation } from "../data/billing";
import { applyUserModelDiscount, calculateDiscountedTokenCost } from "../data/user-discounts";
import { setRateLimitHeaders } from "../utils/rate-limit-headers";
import { parseAllowedModels } from "../data/model-access";
import { detectModelType, adaptImageRequest, pollDashScopeTask } from "../services/adapters";
import { upstreamErrorBody } from "../services/upstream";
import { getSupportedProtocols } from "../utils/model-protocols";
import { getAllowedChatParameters, getModelCapabilities } from "../utils/model-capabilities";
import { buildUpstreamChatRequest } from "../utils/chat-request";
import { estimateStreamUsage, isUsageMissing } from "../utils/estimate-stream-usage";
import { calculateOpenAiCacheAwareCost, buildApiDescription, isExplicitCacheRequested } from "../utils/cache-billing";
import { getModelAvailabilityMap } from "../services/scheduler";
import { sanitizeUpstreamError } from "../utils/sanitize-error";
import { logToSLS } from "../services/sls";
import { sendBillingReservationFailure } from "../utils/billing-response";
import { getTrustedClientIp } from "../utils/client-ip";
import {
  createOpenAiStreamState,
  finishOpenAiStream,
  observeOpenAiStreamLine,
} from "../utils/openai-stream-state";
import { restorePublicModelAlias } from "../utils/upstream-model-aliases";
import { InferenceContext } from "../pipeline/context";
import { estimateChatMaxCost, estimateChatTokens, roughTokenCount } from "../pipeline/estimates";
import {
  authenticateApiKey,
  bearerToken,
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

// 上游请求超时时间（毫秒）

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractImageUrls(data: any): string[] {
  const choiceUrls = (data?.output?.choices || [])
    .flatMap((choice: any) => choice?.message?.content || [])
    .map((item: any) => item?.image)
    .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);

  const resultUrls = (data?.output?.results || [])
    .map((item: any) => item?.url)
    .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);

  return [...choiceUrls, ...resultUrls];
}

function normalizeOpenAiStreamLine(line: string, logId: string, modelId: string): string {
  const hasCarriageReturn = line.endsWith("\r");
  const content = hasCarriageReturn ? line.slice(0, -1) : line;
  const trimmed = content.trim();
  if (!trimmed.startsWith("data:")) return line; // SSE 规范里 data: 后空格可选
  const payload = trimmed.slice(5).trimStart();
  if (payload === "[DONE]") return line;

  try {
    const event = JSON.parse(payload);
    if (event && typeof event === "object") {
      event.id = logId;
      restorePublicModelAlias(event, modelId);
      if (event.usage && typeof event.usage === "object") {
        const details =
          event.usage.prompt_tokens_details &&
          typeof event.usage.prompt_tokens_details === "object"
            ? event.usage.prompt_tokens_details
            : {};
        const compDetails =
          event.usage.completion_tokens_details &&
          typeof event.usage.completion_tokens_details === "object"
            ? event.usage.completion_tokens_details
            : {};
        event.usage.prompt_tokens = Number(event.usage.prompt_tokens || 0);
        event.usage.completion_tokens = Number(event.usage.completion_tokens || 0);
        event.usage.total_tokens = Number(
          event.usage.total_tokens || event.usage.prompt_tokens + event.usage.completion_tokens
        );
        event.usage.prompt_tokens_details = {
          ...details,
          cached_tokens: Number(details.cached_tokens || 0),
          cache_write_tokens: Number(details.cache_write_tokens || 0),
          cache_creation_input_tokens: Number(details.cache_creation_input_tokens || 0),
        };
        event.usage.completion_tokens_details = {
          ...compDetails,
          reasoning_tokens: Number(compDetails.reasoning_tokens || 0),
        };
      }
    }
    return `data: ${JSON.stringify(event)}${hasCarriageReturn ? "\r" : ""}`;
  } catch {
    return line.replace(/"id":"[^"]*"/, `"id":"${logId}"`);
  }
}

function parseSseEvents(payload: string): any[] {
  const events: any[] = [];
  for (const line of payload.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const dataPayload = trimmed.slice(5).trimStart();
    if (dataPayload === "[DONE]") continue;
    try {
      events.push(JSON.parse(dataPayload));
    } catch {
      continue;
    }
  }
  return events;
}

function buildChatCompletionFromSse(events: any[], includeReasoning = false): any {
  const first = events.find((event) => event?.choices?.[0]);
  const last = [...events].reverse().find((event) => event?.choices?.[0]);
  const usage = [...events].reverse().find((event) => event?.usage)?.usage || {};
  let role = "assistant";
  let content = "";
  let reasoningContent = "";

  for (const event of events) {
    const delta = event?.choices?.[0]?.delta;
    if (!delta) continue;
    if (delta.role) role = delta.role;
    if (typeof delta.content === "string") content += delta.content;
    if (typeof delta.reasoning_content === "string") reasoningContent += delta.reasoning_content;
  }

  return {
    id: first?.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: first?.created || Math.floor(Date.now() / 1000),
    model: first?.model || last?.model || "",
    choices: [
      {
        index: 0,
        message: {
          role,
          content,
          ...(includeReasoning && reasoningContent ? { reasoning_content: reasoningContent } : {}),
        },
        finish_reason: last?.choices?.[0]?.finish_reason || "stop",
      },
    ],
    usage,
  };
}

async function estimateEmbeddingCost(userId: string | null | undefined, model: any, input: unknown): Promise<number> {
  const promptTokens = Math.max(1, roughTokenCount(input));
  return (await calculateDiscountedTokenCost(userId, model, promptTokens, 0)).finalAmount;
}

/** Sanitize error messages — never expose internal hostnames, paths, or stack traces */
const sanitizeError = sanitizeUpstreamError;

function rejectBillingReservation(res: Response, reason: BillingReservationFailureReason): void {
  sendBillingReservationFailure(res, reason);
}

function rejectUserRateLimit(
  res: Response,
  message: string,
  dimension: "qpm" | "tpm" = "qpm",
  limit?: number,
  remaining?: number,
  resetMs?: number
): void {
  setRateLimitHeaders(res, {
    scope: dimension === "qpm" ? "account_model_qpm" : "account_model_tpm",
    limit,
    remaining,
    resetMs,
    rejected: true,
  });
  res.status(429).json({
    error: {
      message,
      type: "rate_limit_error",
      code: "rate_limit_exceeded",
    },
  });
}

// GET /v1/models — OpenAI compatible model list
router.get("/models", async (req: Request, res: Response) => {
  const token = bearerToken(req);
  const keyRecord = token ? await validateApiKey(token) : null;
  if (!keyRecord) {
    res.status(401).json({
      error: {
        message: "Invalid API key provided.",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    });
    return;
  }

  // 子账号：仅返回被授权的模型（NULL=不限→全部；[]=全禁→空）
  const allowed = keyRecord.parent_user_id ? parseAllowedModels(keyRecord.allowed_models) : null;
  const visibleModels = allowed == null ? models : models.filter((m) => allowed.includes(m.id));
  const availability = await getModelAvailabilityMap(visibleModels.map((model) => model.id));

  const data = visibleModels.map((m) => ({
    id: m.id,
    object: "model",
    created: Math.floor(new Date("2025-01-01").getTime() / 1000),
    owned_by: m.provider,
    permission: [],
    root: m.id,
    parent: null,
    supported_protocols: getSupportedProtocols(m),
    capabilities: getModelCapabilities(m),
    allowed_parameters: getAllowedChatParameters(m),
    availability: availability.get(m.id)?.status || "temporarily_unavailable",
    availability_reason: availability.has(m.id) ? availability.get(m.id)!.reason : "no_active_route",
  }));

  res.json({ object: "list", data });
});

// POST /v1/images/generations — OpenAI compatible image generation
router.post("/images/generations", async (req: Request, res: Response) => {
  const ctx = new InferenceContext(`v1${req.path}`, req, res);
  const apiKeyRecord = (await authenticateApiKey(ctx, bearerToken(req))) ? ctx.requireCaller().apiKey! : null;
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

  const {
    model: modelId,
    prompt,
    n,
    size,
    negative_prompt,
    ref_img,
    style_index,
    style_ref_url,
    model_version,
    ref_prompt_weight,
  } = req.body;

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

  const model = resolveModel(ctx, modelId) ? ctx.requireModel() : null;
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

  const modelType = detectModelType(model.category);
  if (modelType !== "image") {
    res.status(400).json({
      error: {
        message: `Model '${modelId}' does not support image generation.`,
        type: "invalid_request_error",
        code: "unsupported_model",
      },
    });
    return;
  }

  const requiresReferenceImage =
    modelId === "wanx-style-repaint" ||
    modelId === "wanx-style-repaint-v1" ||
    modelId === "wanx-background-generation" ||
    modelId === "wanx-background-generation-v2";

  if (requiresReferenceImage && !ref_img) {
    res.status(400).json({
      error: {
        message: `Model '${modelId}' requires ref_img.`,
        type: "invalid_request_error",
        code: "invalid_request",
      },
    });
    return;
  }

  if (!requiresReferenceImage && !prompt) {
    res.status(400).json({
      error: {
        message: "Missing required parameter: prompt.",
        type: "invalid_request_error",
        code: "invalid_request",
      },
    });
    return;
  }

  const routeFailure = await selectRoute(ctx);
  if (routeFailure) {
    res.status(routeFailure.status).json({ error: upstreamErrorBody(routeFailure) });
    return;
  }
  const upstream = ctx.requireUpstream();
  const upstreamApiKey = upstream.apiKey;

  // Anonymous keys (no user_id) are not allowed on public endpoints
  if (!apiKeyRecord.user_id) {
    res.status(403).json({
      error: {
        message: "This API key is not associated with a user account. Please use a key created from your dashboard.",
        type: "invalid_request_error",
        code: "anonymous_key_not_allowed",
      },
    });
    return;
  }

  if (!checkModelAccess(ctx)) {
    res.status(403).json({
      error: {
        message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`,
        type: "invalid_request_error",
        code: "model_not_allowed",
      },
    });
    return;
  }

  const qpmFailure = await reserveQpm(ctx);
  if (qpmFailure) {
    rejectUserRateLimit(res, `Model-level QPM limit exceeded: ${qpmFailure.limit} requests/min for '${modelId}'.`, "qpm", qpmFailure.limit, 0, qpmFailure.resetMs);
    return;
  }

  const consumerFailure = await checkConsumer(ctx);
  const rateCheck = consumerFailure ? consumerFailure.check : { remaining: ctx.consumerRemaining };
  if (consumerFailure) {
    setRateLimitHeaders(res, { ...consumerFailure.check, rejected: true });
    res.status(429).json({
      error: {
        message: consumerFailure.check.reason,
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
    });
    return;
  }

  const estimatedImageCost = (await applyUserModelDiscount(apiKeyRecord.user_id, modelId, (n || 1) * model.promptPrice)).finalAmount;
  const imageBillingFailure = await reserveBilling(ctx, estimatedImageCost, "v1-image");
  if (imageBillingFailure) {
    rejectBillingReservation(res, imageBillingFailure);
    return;
  }
  const imageReservation = ctx.billingReservation!;

  const startTime = Date.now();

  try {
    const capacityFailure = await reserveProviderCapacity(ctx, 0);
    if (capacityFailure) {
      res.status(capacityHttpStatus(res, capacityFailure)).json({
        error: { message: capacityFailure.message, type: capacityErrorType(capacityFailure, "server_error"), code: capacityFailure.code },
      });
      return;
    }

    const adapted = adaptImageRequest(upstreamApiKey, {
      model: modelId,
      prompt,
      n,
      size,
      negative_prompt,
      ref_img,
      style_index,
      style_ref_url,
      model_version,
      ref_prompt_weight,
    }, { nativeBase: upstream.nativeBaseUrl });

    const response = await invokeUpstream(ctx, {
      url: adapted.url,
      method: adapted.method,
      headers: adapted.headers,
      auth: false,
      body: adapted.body,
    });

    const data: any = await response.json();
    if (!response.ok) {
      const upstreamMessage = data.message || data.error?.message || "Upstream image API error";
      await logUpstreamFailure({
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        region: upstream.region,
        protocol: "openai-images",
        latencyMs: Date.now() - startTime,
        httpStatus: response.status,
        errorReason: upstreamMessage,
        reservationId: imageReservation.id,
      });
      res.status(response.status).json({
        error: {
          message: upstreamMessage,
          type: "upstream_error",
          code: data.code || data.error?.code || "upstream_error",
        },
      });
      return;
    }

    let imageUrls = extractImageUrls(data);
    if (adapted.isAsync) {
      const upstreamTaskId = data.output?.task_id;
      if (!upstreamTaskId) {
        res.status(500).json({
          error: {
            message: "No task_id returned from upstream image API.",
            type: "upstream_error",
            code: "unexpected_response",
          },
        });
        return;
      }

      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await sleep(1500);
        const result = await pollDashScopeTask(upstreamApiKey, upstreamTaskId);
        if (result.status === "failed") {
          await logUpstreamFailure({
            apiKeyId: apiKeyRecord.id,
            userId: apiKeyRecord.user_id,
            model: modelId,
            providerId: upstream.providerId,
            channelId: upstream.channelId,
            region: upstream.region,
            protocol: "openai-images",
            latencyMs: Date.now() - startTime,
            errorCode: "upstream_task_failed",
            errorReason: result.error || "Image generation failed.",
            reservationId: imageReservation.id,
          });
          res.status(502).json({
            error: {
              message: result.error || "Image generation failed.",
              type: "upstream_error",
              code: "upstream_error",
            },
          });
          return;
        }
        if (result.status === "succeeded") {
          imageUrls = extractImageUrls({ output: result.output });
          break;
        }
      }
    }

    if (imageUrls.length === 0) {
      res.status(502).json({
        error: {
          message: "Image generation completed without image URLs.",
          type: "upstream_error",
          code: "unexpected_response",
        },
      });
      return;
    }

    const imageCount = imageUrls.length;
    ctx.billableResponseReceived = true;
    const cost = (await applyUserModelDiscount(apiKeyRecord.user_id, modelId, (n || imageCount || 1) * model.promptPrice)).finalAmount;
    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "openai-images",
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost,
      status: "success",
      latencyMs: Date.now() - startTime,
      providerUnits: n || imageCount || 1,
      reservationId: imageReservation.id,
    });

    await settleReservation(
      imageReservation.id,
      cost,
      `Image generation: ${modelId} (${imageCount} images)`
    );

    if (rateCheck.remaining != null) res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
    res.json({
      created: Math.floor(Date.now() / 1000),
      data: imageUrls.map((url) => ({ url, revised_prompt: prompt || null })),
    });
  } catch (err: any) {
    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "openai-images",
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      status: "error",
      latencyMs: Date.now() - startTime,
      reservationId: imageReservation.id,
      errorCode: "upstream_error",
      errorReason: String(err?.message || err),
    });

    res.status(500).json({
      error: {
        message: sanitizeError(err),
        type: "server_error",
        code: "upstream_error",
      },
    });
  } finally {
    await release(ctx);
  }
});

// POST /v1/chat/completions — OpenAI compatible chat
router.post("/chat/completions", async (req: Request, res: Response) => {
  // Auth
  const ctx = new InferenceContext(`v1${req.path}`, req, res);
  const apiKeyRecord = (await authenticateApiKey(ctx, bearerToken(req))) ? ctx.requireCaller().apiKey! : null;
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

  const {
    model: modelId,
    messages,
    stream,
    temperature,
    max_tokens,
    max_completion_tokens,
    top_p,
    stop,
    frequency_penalty,
    presence_penalty,
    tools,
    tool_choice,
    response_format,
    include_reasoning,
    stream_options,
    enable_thinking,
    thinking_budget,
    preserve_thinking,
    top_k,
    seed,
    logprobs,
    top_logprobs,
    repetition_penalty,
    enable_search,
    search_options,
    parallel_tool_calls,
    modalities,
    audio,
  } = req.body;

  const clientIp = getTrustedClientIp(req);

  if (!modelId || !messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({
      error: {
        message: "Missing required parameters: model and messages.",
        type: "invalid_request_error",
        code: "invalid_request",
      },
    });
    return;
  }

  const model = resolveModel(ctx, modelId) ? ctx.requireModel() : null;
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

  // Check model type - redirect async models to /v1/tasks
  const modelType = detectModelType(model.category);
  if (modelType !== "chat") {
    res.status(400).json({
      error: {
        message: `Model '${modelId}' does not support chat completions.`,
        type: "invalid_request_error",
        code: "unsupported_model",
      },
    });
    return;
  }

  if (modelId.startsWith("claude-")) {
    res.status(400).json({
      error: {
        message: `Model '${modelId}' is available through the Anthropic Messages API at /v1/messages.`,
        type: "invalid_request_error",
        code: "unsupported_protocol",
      },
    });
    return;
  }

  // Resolve upstream channel (provider + region) for this model
  const routeFailure = await selectRoute(ctx);
  if (routeFailure) {
    res.status(routeFailure.status).json({ error: upstreamErrorBody(routeFailure) });
    return;
  }
  const upstream = ctx.requireUpstream();
  const upstreamApiKey = upstream.apiKey;

  // Anonymous keys (no user_id) are not allowed on public endpoints
  if (!apiKeyRecord.user_id) {
    res.status(403).json({
      error: {
        message: "This API key is not associated with a user account. Please use a key created from your dashboard.",
        type: "invalid_request_error",
        code: "anonymous_key_not_allowed",
      },
    });
    return;
  }

  const requestedOutputTokens = max_completion_tokens ?? max_tokens;
  const estimatedChatTokens = estimateChatTokens(model, messages, requestedOutputTokens);

  if (!checkModelAccess(ctx)) {
    res.status(403).json({
      error: {
        message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`,
        type: "invalid_request_error",
        code: "model_not_allowed",
      },
    });
    return;
  }

  // Per-model user-level rate limit check
  const qpmFailure = await reserveQpm(ctx);
  if (qpmFailure) {
    logToSLS({ apiKeyId: apiKeyRecord.id, userId: apiKeyRecord.user_id, model: modelId, status: "rejected", errorReason: "qpm_limit", clientIp });
    rejectUserRateLimit(res, `Model-level QPM limit exceeded: ${qpmFailure.limit} requests/min for '${modelId}'.`, "qpm", qpmFailure.limit, 0, qpmFailure.resetMs);
    return;
  }
  const tpmFailure = await reserveTpm(ctx, estimatedChatTokens);
  if (tpmFailure) {
    logToSLS({ apiKeyId: apiKeyRecord.id, userId: apiKeyRecord.user_id, model: modelId, status: "rejected", errorReason: "tpm_limit", clientIp });
    rejectUserRateLimit(res, `Model-level TPM limit exceeded: ${tpmFailure.limit} tokens/min for '${modelId}'. Remaining: ${tpmFailure.remaining || 0} tokens.`, "tpm", tpmFailure.limit, tpmFailure.remaining ?? 0);
    return;
  }

  // Rate limit check
  const consumerFailure = await checkConsumer(ctx);
  const rateCheck = consumerFailure ? consumerFailure.check : { remaining: ctx.consumerRemaining };
  if (consumerFailure) {
    logToSLS({ apiKeyId: apiKeyRecord.id, userId: apiKeyRecord.user_id, model: modelId, status: "rejected", errorReason: "rate_limit", clientIp });
    setRateLimitHeaders(res, { ...consumerFailure.check, rejected: true });
    res.status(429).json({
      error: {
        message: consumerFailure.check.reason,
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
    });
    return;
  }

  const estimatedChatCost = await estimateChatMaxCost(apiKeyRecord.user_id, model, messages, requestedOutputTokens);
  const chatBillingFailure = await reserveBilling(ctx, estimatedChatCost, "v1-chat");
  if (chatBillingFailure) {
    logToSLS({
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      status: "rejected",
      errorReason: chatBillingFailure,
      clientIp,
    });
    rejectBillingReservation(res, chatBillingFailure);
    return;
  }
  const chatReservation = ctx.billingReservation!;

  // Build request
  const wantsAudioOutput = Array.isArray(modalities) && modalities.includes("audio");
  const effectiveStream = stream || wantsAudioOutput;
  const requiresUpstreamStream = modelId === "qwq-plus" && !stream;
  const requestBody = buildUpstreamChatRequest(
    model,
    {
      model: modelId,
      messages,
      stream,
      temperature,
      max_tokens,
      max_completion_tokens,
      top_p,
      stop,
      frequency_penalty,
      presence_penalty,
      tools,
      tool_choice,
      response_format,
      stream_options,
      enable_thinking,
      thinking_budget,
      preserve_thinking,
      top_k,
      seed,
      logprobs,
      top_logprobs,
      repetition_penalty,
      enable_search,
      search_options,
      parallel_tool_calls,
      modalities,
      audio,
    },
    { forceStream: requiresUpstreamStream }
  );
  const explicitCache = isExplicitCacheRequested(messages, req.body);

  const startTime = Date.now();
  const logId = ctx.logId;

  // 预占的 TPM（reserveTpm 已 INCRBY estimatedChatTokens）必须在所有出口恰好归还一次。
  // 正常路径 reconcileTokens 后置标记；异常/上游错误路径由 release（finally）兜底释放。
  try {
    const capacityFailure = await reserveProviderCapacity(ctx, estimatedChatTokens);
    if (capacityFailure) {
      res.status(capacityHttpStatus(res, capacityFailure)).json({
        error: { message: capacityFailure.message, type: capacityErrorType(capacityFailure, "server_error"), code: capacityFailure.code },
      });
      return;
    }

    // Streaming
    if (effectiveStream) {
      const response = await invokeUpstream(ctx, { path: "/chat/completions", body: requestBody });

      if (!response.ok) {
        let upstreamMsg = "Upstream API error";
        let upstreamErrorBody: any = null;
        try {
          upstreamErrorBody = await response.json() as any;
          upstreamMsg = upstreamErrorBody?.error?.message || upstreamMsg;
        } catch { /* non-JSON response, use default */ }
        await logUpstreamFailure({
          logId,
          apiKeyId: apiKeyRecord.id,
          userId: apiKeyRecord.user_id,
          model: modelId,
          providerId: upstream.providerId,
          channelId: upstream.channelId,
          region: upstream.region,
          protocol: "openai-chat",
          latencyMs: Date.now() - startTime,
          httpStatus: response.status,
          errorReason: upstreamMsg,
          reservationId: chatReservation.id,
          requestBody: req.body,
          responseBody: upstreamErrorBody || { error: { message: upstreamMsg } },
        });
        logToSLS({ logId, apiKeyId: apiKeyRecord.id, userId: apiKeyRecord.user_id, model: modelId, status: "error", errorReason: `upstream_${response.status}: ${upstreamMsg}`, clientIp, latencyMs: Date.now() - startTime });
        res.status(response.status).json({
          error: { message: upstreamMsg, type: "upstream_error", code: "upstream_error" },
        });
        return;
      }
      ctx.billableResponseReceived = true;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if (rateCheck.remaining != null) res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());

      // Collect all chunks for billing + track TTFT/TPOT
      let fullResponse = "";
      let ttftMs = 0;
      let chunkCount = 0;
      let firstChunkTime = 0;
      let lastChunkTime = 0;
      let streamReadError: { name?: string; code?: string } | null = null;
      let errorEventForwarded = false;
      const streamState = createOpenAiStreamState();
      const reader = response.body as any;
      let sseBuffer = "";
      const forwardStreamText = (text: string, flush = false) => {
        sseBuffer += text;
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";
        if (flush && sseBuffer) {
          lines.push(sseBuffer);
          sseBuffer = "";
        }
        for (const line of lines) {
          const observation = observeOpenAiStreamLine(streamState, line);
          if (observation.kind === "error") {
            if (!errorEventForwarded) {
              const safeError = `data: ${JSON.stringify({
                error: {
                  message: "The upstream stream ended with an error.",
                  type: "server_error",
                  code: "upstream_stream_error",
                },
              })}`;
              fullResponse += `${safeError}\n\n`;
              res.write(`${safeError}\n\n`);
              errorEventForwarded = true;
            }
            continue;
          }
          const rewritten = normalizeOpenAiStreamLine(line, logId, modelId);
          fullResponse += `${rewritten}\n`;
          res.write(`${rewritten}\n`);
        }
      };
      try {
        if (reader && typeof reader[Symbol.asyncIterator] === "function") {
          const iterDecoder = new TextDecoder();
          for await (const chunk of reader) {
            const now = Date.now();
            if (chunkCount === 0) {
              ttftMs = now - startTime;
              firstChunkTime = now;
            }
            lastChunkTime = now;
            chunkCount++;
            const text = typeof chunk === "string" ? chunk : iterDecoder.decode(chunk, { stream: true });
            forwardStreamText(text);
          }
        } else if (reader && reader.getReader) {
          const r = reader.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await r.read();
            if (done) break;
            const now = Date.now();
            if (chunkCount === 0) {
              ttftMs = now - startTime;
              firstChunkTime = now;
            }
            lastChunkTime = now;
            chunkCount++;
            const text = decoder.decode(value, { stream: true });
            forwardStreamText(text);
          }
        }
        forwardStreamText("", true);
      } catch (streamErr: any) {
        streamReadError = {
          name: typeof streamErr?.name === "string" ? streamErr.name : undefined,
          code: typeof streamErr?.code === "string" ? streamErr.code : undefined,
        };
      }
      const streamOutcome = finishOpenAiStream(streamState, streamReadError);
      if (streamOutcome.ok && streamOutcome.synthesizeDone) {
        fullResponse += "data: [DONE]\n\n";
        res.write("data: [DONE]\n\n");
        logToSLS({
          logId,
          model: modelId,
          providerId: upstream.providerId,
          channelId: upstream.channelId,
          status: "warning",
          errorReason: streamReadError
            ? "upstream_stream_terminal_recovered_after_read_error"
            : "upstream_stream_terminal_synthesized",
        });
      } else if (!streamOutcome.ok && !errorEventForwarded) {
        const safeError = `data: ${JSON.stringify({
          error: {
            message: "The upstream stream was interrupted before completion.",
            type: "server_error",
            code: streamOutcome.code,
          },
        })}`;
        fullResponse += `${safeError}\n\n`;
        res.write(`${safeError}\n\n`);
        errorEventForwarded = true;
      }
      res.end();

      // Parse SSE data to extract usage for billing
      let streamTokens: any = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      let estimatedBilling = false;
      let streamFinishReason = "";
      let foundUsage = false;
      try {
        const lines = fullResponse.split("\n");
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (!line.startsWith("data:")) continue;
          const dataPayload = line.slice(5).trimStart();
          if (dataPayload === "[DONE]") continue;
          const json = JSON.parse(dataPayload);
          if (!foundUsage && json.usage) {
            streamTokens = json.usage;
            foundUsage = true;
          }
          if (!streamFinishReason && json.choices?.[0]?.finish_reason) {
            streamFinishReason = json.choices[0].finish_reason;
          }
          if (foundUsage && streamFinishReason) break;
        }
      } catch {}

      // 断流兜底：上游在 usage 块发出前断开（超时/中断），按已收内容估费，不记 0
      if (isUsageMissing(streamTokens) && fullResponse.length > 0) {
        streamTokens = estimateStreamUsage(fullResponse, messages);
        estimatedBilling = true;
      }

      // Log usage and bill
      const latencyMs = Date.now() - startTime;
      const streamFailed = !streamOutcome.ok;
      const billing = await calculateOpenAiCacheAwareCost({
        userId: apiKeyRecord.user_id,
        model,
        usage: streamTokens,
        explicitCache,
      });

      // Calculate TPOT: time per output token (ms)
      const streamDuration = lastChunkTime > firstChunkTime ? lastChunkTime - firstChunkTime : 0;
      const tpotMs = streamTokens.completion_tokens > 1
        ? streamDuration / (streamTokens.completion_tokens - 1)
        : 0;

      await logUsage({
        region: upstream.region,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        protocol: "openai-chat",
        logId,
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        promptTokens: streamTokens.prompt_tokens,
        completionTokens: streamTokens.completion_tokens,
        totalTokens: streamTokens.total_tokens,
        cost: billing.finalAmount,
        status: streamFailed ? "error" : "success",
        latencyMs,
        ttftMs,
        tpotMs,
        cachedTokens: billing.cachedTokens,
        cacheCreationTokens: billing.cacheCreationTokens,
        retailListCost: billing.listAmount,
        retailDiscountRate: billing.discountRate,
        retailDiscountAmount: billing.discountAmount,
        thinkingOutput: billing.thinkingOutput,
        providerCacheMode: explicitCache ? "explicit" : "implicit",
        providerInputIncludesCache: true,
        estimated: estimatedBilling,
        finishReason: streamFinishReason || (streamFailed ? "interrupted" : undefined),
        clientIp,
        errorCode: streamFailed ? streamOutcome.code : undefined,
        errorReason: streamFailed ? streamOutcome.code : undefined,
        requestBody: req.body,
        responseBody: fullResponse,
        reservationId: chatReservation.id,
      });
      ctx.actualProviderTokens = streamTokens.total_tokens || 0;
      await reconcileTokens(ctx, streamTokens.total_tokens || 0);

      await settleReservation(
        chatReservation.id,
        billing.finalAmount,
        buildApiDescription(modelId, streamTokens.total_tokens || 0, billing.cachedTokens, true),
        billing.discountRate,
        billing.discountAmount,
      );
      return;
    }

    // Non-streaming (or models that only expose stream mode upstream)
    if (requiresUpstreamStream) {
      const response = await invokeUpstream(ctx, { path: "/chat/completions", body: requestBody });

      if (!response.ok) {
        let upstreamMsg = "Upstream API error";
        let upstreamErrorBody: any = null;
        try {
          upstreamErrorBody = await response.json() as any;
          upstreamMsg = upstreamErrorBody?.error?.message || upstreamMsg;
        } catch { /* non-JSON response, use default */ }
        await logUpstreamFailure({
          logId,
          apiKeyId: apiKeyRecord.id,
          userId: apiKeyRecord.user_id,
          model: modelId,
          providerId: upstream.providerId,
          channelId: upstream.channelId,
          region: upstream.region,
          protocol: "openai-chat",
          latencyMs: Date.now() - startTime,
          httpStatus: response.status,
          errorReason: upstreamMsg,
          reservationId: chatReservation.id,
          requestBody: req.body,
          responseBody: upstreamErrorBody || { error: { message: upstreamMsg } },
        });
        logToSLS({ logId, apiKeyId: apiKeyRecord.id, userId: apiKeyRecord.user_id, model: modelId, status: "error", errorReason: `upstream_${response.status}: ${upstreamMsg}`, clientIp, latencyMs: Date.now() - startTime });
        res.status(response.status).json({
          error: { message: upstreamMsg, type: "upstream_error", code: "upstream_error" },
        });
        return;
      }
      ctx.billableResponseReceived = true;

      let fullResponse = "";
      const reader = response.body as any;
      if (reader && typeof reader[Symbol.asyncIterator] === "function") {
        for await (const chunk of reader) {
          fullResponse += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        }
      } else if (reader && reader.getReader) {
        const r = reader.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await r.read();
          if (done) break;
          fullResponse += decoder.decode(value, { stream: true });
        }
      }

      const events = parseSseEvents(fullResponse);
      const data = buildChatCompletionFromSse(events, !!include_reasoning);
      data.model = modelId;
      const latencyMs = Date.now() - startTime;
      const usage = data.usage || {};
      const billing = await calculateOpenAiCacheAwareCost({
        userId: apiKeyRecord.user_id,
        model,
        usage,
        explicitCache,
      });

      // Non-stream: ttft = full latency, tpot = latency / completion_tokens
      const nonStreamTtft = latencyMs;
      const nonStreamTpot = (usage.completion_tokens || 0) > 1
        ? latencyMs / ((usage.completion_tokens || 1) - 1)
        : 0;

      await logUsage({
        region: upstream.region,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        protocol: "openai-chat",
        logId,
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        cost: billing.finalAmount,
        status: "success",
        latencyMs,
        ttftMs: nonStreamTtft,
        tpotMs: nonStreamTpot,
        cachedTokens: billing.cachedTokens,
        cacheCreationTokens: billing.cacheCreationTokens,
        retailListCost: billing.listAmount,
        retailDiscountRate: billing.discountRate,
        retailDiscountAmount: billing.discountAmount,
        thinkingOutput: billing.thinkingOutput,
        providerCacheMode: explicitCache ? "explicit" : "implicit",
        providerInputIncludesCache: true,
        finishReason: data.choices?.[0]?.finish_reason,
        clientIp,
        reservationId: chatReservation.id,
      });
      ctx.actualProviderTokens = usage.total_tokens || 0;
      await reconcileTokens(ctx, usage.total_tokens || 0);

      await settleReservation(
        chatReservation.id,
        billing.finalAmount,
        buildApiDescription(modelId, usage.total_tokens || 0, billing.cachedTokens),
        billing.discountRate,
        billing.discountAmount,
      );

      if (rateCheck.remaining != null) res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
      if (data.usage && typeof data.usage === "object") {
        const compDetails = data.usage.completion_tokens_details || {};
        data.usage.completion_tokens_details = {
          ...compDetails,
          reasoning_tokens: Number(compDetails.reasoning_tokens || 0),
        };
      }
      data.id = logId;
      data.model = modelId;
      res.json(data);
      return;
    }

    // Non-streaming
    const response = await invokeUpstream(ctx, { path: "/chat/completions", body: requestBody });

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
        protocol: "openai-chat",
        latencyMs: Date.now() - startTime,
        httpStatus: response.status,
        errorCode: data.error?.code || "upstream_error",
        errorReason: data.error?.message || "Upstream API error",
        reservationId: chatReservation.id,
        requestBody: req.body,
        responseBody: data,
      });
      logToSLS({ logId, apiKeyId: apiKeyRecord.id, userId: apiKeyRecord.user_id, model: modelId, status: "error", errorReason: `upstream_${response.status}: ${data.error?.message || "Upstream API error"}`, clientIp, latencyMs: Date.now() - startTime });
      res.status(response.status).json({
        error: {
          message: data.error?.message || "Upstream API error",
          type: "upstream_error",
          code: data.error?.code || "upstream_error",
        },
      });
      return;
    }
    ctx.billableResponseReceived = true;

    // Log usage and billing
    const latencyMs = Date.now() - startTime;
    const usage = data.usage || {};
    const billing = await calculateOpenAiCacheAwareCost({
      userId: apiKeyRecord.user_id,
      model,
      usage,
      explicitCache,
    });

    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "openai-chat",
      logId,
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
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
      finishReason: data.choices?.[0]?.finish_reason,
      clientIp,
      requestBody: req.body,
      responseBody: data.choices?.[0]?.message,
      reservationId: chatReservation.id,
    });
    ctx.actualProviderTokens = usage.total_tokens || 0;
    await reconcileTokens(ctx, usage.total_tokens || 0);

    // Auto-billing
    await settleReservation(
      chatReservation.id,
      billing.finalAmount,
      buildApiDescription(modelId, usage.total_tokens || 0, billing.cachedTokens),
      billing.discountRate,
      billing.discountAmount,
    );

    // Normalize usage to always include completion_tokens_details
    if (data.usage && typeof data.usage === "object") {
      const compDetails = data.usage.completion_tokens_details || {};
      data.usage.completion_tokens_details = {
        ...compDetails,
        reasoning_tokens: Number(compDetails.reasoning_tokens || 0),
      };
    }

    // Add rate limit headers
    if (rateCheck.remaining != null) res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
    data.id = logId;
    data.model = modelId;
    res.json(data);

  } catch (err: any) {
    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "openai-chat",
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
      clientIp,
      errorReason: String(err?.message || err),
      errorCode: "upstream_error",
      reservationId: chatReservation.id,
      requestBody: req.body,
      responseBody: { error: { message: String(err?.message || err) } },
    });

    // 流式响应已 end 后（如计费段 DB 异常）不能再写状态码
    if (res.headersSent) {
      try { res.end(); } catch { /* 连接可能已断 */ }
    } else {
      res.status(500).json({
        error: {
          message: sanitizeError(err),
          type: "server_error",
          code: "upstream_error",
        },
      });
    }
  } finally {
    await release(ctx);
  }
});

// POST /v1/embeddings — OpenAI compatible embeddings
router.post("/embeddings", async (req: Request, res: Response) => {
  // Auth
  const ctx = new InferenceContext(`v1${req.path}`, req, res);
  const apiKeyRecord = (await authenticateApiKey(ctx, bearerToken(req))) ? ctx.requireCaller().apiKey! : null;
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

  const { model: modelId, input, dimensions, encoding_format } = req.body;

  if (!modelId || !input) {
    res.status(400).json({
      error: {
        message: "Missing required parameters: model and input.",
        type: "invalid_request_error",
        code: "invalid_request",
      },
    });
    return;
  }

  const model = resolveModel(ctx, modelId) ? ctx.requireModel() : null;
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

  const modelType = detectModelType(model.category);
  if (modelType !== "embedding") {
    res.status(400).json({
      error: {
        message: `Model '${modelId}' does not support embeddings.`,
        type: "invalid_request_error",
        code: "unsupported_model",
      },
    });
    return;
  }

  // Resolve upstream channel (provider + region) for this model
  const routeFailure = await selectRoute(ctx);
  if (routeFailure) {
    res.status(routeFailure.status).json({ error: upstreamErrorBody(routeFailure) });
    return;
  }
  const upstream = ctx.requireUpstream();
  const upstreamApiKey = upstream.apiKey;

  // Anonymous keys (no user_id) are not allowed on public endpoints
  if (!apiKeyRecord.user_id) {
    res.status(403).json({
      error: {
        message: "This API key is not associated with a user account. Please use a key created from your dashboard.",
        type: "invalid_request_error",
        code: "anonymous_key_not_allowed",
      },
    });
    return;
  }

  const estimatedEmbeddingTokens = Math.max(1, roughTokenCount(input));

  if (!checkModelAccess(ctx)) {
    res.status(403).json({
      error: {
        message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`,
        type: "invalid_request_error",
        code: "model_not_allowed",
      },
    });
    return;
  }

  const qpmFailure = await reserveQpm(ctx);
  if (qpmFailure) {
    rejectUserRateLimit(res, `Model-level QPM limit exceeded: ${qpmFailure.limit} requests/min for '${modelId}'.`, "qpm", qpmFailure.limit, 0, qpmFailure.resetMs);
    return;
  }
  const tpmFailure = await reserveTpm(ctx, estimatedEmbeddingTokens);
  if (tpmFailure) {
    rejectUserRateLimit(res, `Model-level TPM limit exceeded: ${tpmFailure.limit} tokens/min for '${modelId}'. Remaining: ${tpmFailure.remaining || 0} tokens.`, "tpm", tpmFailure.limit, tpmFailure.remaining ?? 0);
    return;
  }

  // Rate limit check
  const consumerFailure = await checkConsumer(ctx);
  const rateCheck = consumerFailure ? consumerFailure.check : { remaining: ctx.consumerRemaining };
  if (consumerFailure) {
    setRateLimitHeaders(res, { ...consumerFailure.check, rejected: true });
    res.status(429).json({
      error: {
        message: consumerFailure.check.reason,
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
    });
    return;
  }

  const estimatedEmbeddingCost = await estimateEmbeddingCost(apiKeyRecord.user_id, model, input);
  const embeddingBillingFailure = await reserveBilling(ctx, estimatedEmbeddingCost, "v1-embedding");
  if (embeddingBillingFailure) {
    rejectBillingReservation(res, embeddingBillingFailure);
    return;
  }
  const embeddingReservation = ctx.billingReservation!;

  const requestBody: any = { model: modelId, input };
  if (dimensions !== undefined) requestBody.dimensions = dimensions;
  if (encoding_format !== undefined) requestBody.encoding_format = encoding_format;

  const startTime = Date.now();

  try {
    const capacityFailure = await reserveProviderCapacity(ctx, estimatedEmbeddingTokens);
    if (capacityFailure) {
      res.status(capacityHttpStatus(res, capacityFailure)).json({
        error: { message: capacityFailure.message, type: capacityErrorType(capacityFailure, "server_error"), code: capacityFailure.code },
      });
      return;
    }

    const response = await invokeUpstream(ctx, { path: "/embeddings", body: requestBody });

    const data: any = await response.json();

    if (!response.ok) {
      await logUpstreamFailure({
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        region: upstream.region,
        protocol: "openai-embeddings",
        latencyMs: Date.now() - startTime,
        httpStatus: response.status,
        errorCode: data.error?.code || "upstream_error",
        errorReason: data.error?.message || "Upstream API error",
        reservationId: embeddingReservation.id,
      });
      res.status(response.status).json({
        error: {
          message: data.error?.message || "Upstream API error",
          type: "upstream_error",
          code: data.error?.code || "upstream_error",
        },
      });
      return;
    }
    ctx.billableResponseReceived = true;

    // Log usage
    const latencyMs = Date.now() - startTime;
    const usage = data.usage || {};
    const cost = (await calculateDiscountedTokenCost(apiKeyRecord.user_id, model, usage.prompt_tokens || 0, 0)).finalAmount;

    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "openai-embeddings",
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: 0,
      totalTokens: usage.total_tokens || 0,
      cost,
      status: "success",
      latencyMs,
      reservationId: embeddingReservation.id,
    });
    ctx.actualProviderTokens = usage.total_tokens || 0;
    await reconcileTokens(ctx, usage.total_tokens || 0);

    await settleReservation(
      embeddingReservation.id,
      cost,
      `Embedding: ${modelId} (${usage.prompt_tokens || 0} tokens)`
    );

    if (rateCheck.remaining != null) res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
    res.json(data);

  } catch (err: any) {
    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "openai-embeddings",
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      status: "error",
      latencyMs: Date.now() - startTime,
      reservationId: embeddingReservation.id,
      errorCode: "upstream_error",
      errorReason: String(err?.message || err),
    });

    res.status(500).json({
      error: {
        message: sanitizeError(err),
        type: "server_error",
        code: "upstream_error",
      },
    });
  } finally {
    await release(ctx);
  }
});

export default router;
