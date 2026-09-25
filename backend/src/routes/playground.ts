import { Router, Request, Response } from "express";
import { logUpstreamFailure, logUsage } from "../data/usage";
import { settleReservation } from "../data/billing";
import { detectModelType } from "../services/adapters";
import { buildUpstreamChatRequest } from "../utils/chat-request";
import { restorePublicModelAlias, rewriteUpstreamModelAliasText } from "../utils/upstream-model-aliases";
import { calculateOpenAiCacheAwareCost } from "../utils/cache-billing";
import { sendBillingReservationFailure } from "../utils/billing-response";
import { InferenceContext } from "../pipeline/context";
import { estimateChatMaxCost, estimateChatTokens } from "../pipeline/estimates";
import {
  authenticateSession,
  bearerToken,
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
} from "../pipeline/stages";

const router = Router();

function openAiError(res: Response, status: number, message: string, code: string, type = "invalid_request_error"): void {
  res.status(status).json({ error: { message, type, code } });
}

function parseSseUsage(payload: string): { prompt_tokens: number; completion_tokens: number; total_tokens: number; prompt_tokens_details?: { cached_tokens?: number; cache_creation_input_tokens?: number } } {
  for (const line of payload.split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") continue;
    try {
      const json = JSON.parse(trimmed.slice(6));
      if (json.usage) return json.usage;
    } catch {
      continue;
    }
  }
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
}

router.post("/chat/completions", async (req: Request, res: Response) => {
  const ctx = new InferenceContext("playground.chat", req, res);
  if (!(await authenticateSession(ctx, bearerToken(req)))) {
    openAiError(res, 401, "请先登录后再使用 Playground。", "invalid_session");
    return;
  }
  const caller = ctx.requireCaller();
  const sessionUserId = caller.userId!;

  const {
    model: modelId,
    messages,
    stream,
    temperature,
    max_tokens,
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
    enable_context_caching,
    parallel_tool_calls,
  } = req.body;

  if (!modelId || !messages || !Array.isArray(messages) || messages.length === 0) {
    openAiError(res, 400, "Missing required parameters: model and messages.", "invalid_request");
    return;
  }

  const model = resolveModel(ctx, modelId) ? ctx.requireModel() : null;
  if (!model) {
    openAiError(res, 404, `Model '${modelId}' not found.`, "model_not_found");
    return;
  }

  if (detectModelType(model.category) !== "chat") {
    openAiError(res, 400, `Model '${modelId}' does not support chat completions.`, "unsupported_model");
    return;
  }

  if (!checkModelAccess(ctx)) {
    openAiError(res, 403, `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`, "model_not_allowed");
    return;
  }

  const routeFailure = await selectRoute(ctx);
  if (routeFailure) {
    openAiError(
      res,
      routeFailure.status,
      routeFailure.message,
      routeFailure.code,
      routeFailure.status >= 500 ? "server_error" : "invalid_request_error"
    );
    return;
  }
  const upstream = ctx.requireUpstream();
  const upstreamApiKey = upstream.apiKey;

  const qpmFailure = await reserveQpm(ctx);
  if (qpmFailure) {
    openAiError(
      res,
      429,
      `Model-level rate limit exceeded: ${qpmFailure.limit} requests/min for '${modelId}'.`,
      "rate_limit_exceeded",
      "rate_limit_error"
    );
    return;
  }
  const estimatedTokens = estimateChatTokens(model, messages, max_tokens);
  const tpmFailure = await reserveTpm(ctx, estimatedTokens);
  if (tpmFailure) {
    openAiError(
      res,
      429,
      `Model-level TPM limit exceeded: ${tpmFailure.limit} tokens/min for '${modelId}'. Remaining: ${tpmFailure.remaining || 0} tokens.`,
      "rate_limit_exceeded",
      "rate_limit_error"
    );
    return;
  }

  const estimatedChatCost = await estimateChatMaxCost(sessionUserId, model, messages, max_tokens);
  const billingFailure = await reserveBilling(ctx, estimatedChatCost, "playground");
  if (billingFailure) {
    sendBillingReservationFailure(res, billingFailure);
    return;
  }
  const billingReservation = ctx.billingReservation!;

  const requestBody = buildUpstreamChatRequest(
    model,
    {
      model: modelId,
      messages,
      stream,
      temperature,
      max_tokens,
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
      enable_context_caching,
      parallel_tool_calls,
    }
  );

  const startTime = Date.now();

  try {
    const capacityFailure = await reserveProviderCapacity(ctx, estimatedTokens);
    if (capacityFailure) {
      openAiError(res, 503, capacityFailure.message, capacityFailure.code, "server_error");
      return;
    }

    // Playground always uses Bearer auth (historic behaviour, even for
    // providers whose API key header differs).
    const response = await invokeUpstream(ctx, {
      path: "/chat/completions",
      auth: false,
      headers: {
        Authorization: `Bearer ${upstreamApiKey}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });

    if (stream) {
      if (!response.ok) {
        const errText = await response.text();
        await logUpstreamFailure({
          apiKeyId: null,
          userId: sessionUserId,
          model: modelId,
          providerId: upstream.providerId,
          channelId: upstream.channelId,
          region: upstream.region,
          protocol: "playground-openai-chat",
          latencyMs: Date.now() - startTime,
          httpStatus: response.status,
          errorReason: errText || "Upstream API error",
          reservationId: billingReservation.id,
        });
        openAiError(res, response.status, errText || "Upstream API error", "upstream_error", "upstream_error");
        return;
      }
      ctx.billableResponseReceived = true;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-RateLimit-Remaining", String(ctx.qpmRemaining ?? 0));

      let fullResponse = "";
      let ttftMs = 0;
      let chunkCount = 0;
      let firstChunkTime = 0;
      let lastChunkTime = 0;
      const reader = response.body as any;

      if (reader && typeof reader[Symbol.asyncIterator] === "function") {
        for await (const chunk of reader) {
          const now = Date.now();
          if (chunkCount === 0) {
            ttftMs = now - startTime;
            firstChunkTime = now;
          }
          lastChunkTime = now;
          chunkCount++;
          const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
          const rewritten = rewriteUpstreamModelAliasText(text, modelId);
          fullResponse += rewritten;
          res.write(rewritten);
        }
      } else if (reader?.getReader) {
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
          const rewritten = rewriteUpstreamModelAliasText(decoder.decode(value, { stream: true }), modelId);
          fullResponse += rewritten;
          res.write(rewritten);
        }
      }
      res.end();

      const usage = parseSseUsage(fullResponse);
      const playgroundCached = usage.prompt_tokens_details?.cached_tokens || 0;
      const playgroundCreation = usage.prompt_tokens_details?.cache_creation_input_tokens || 0;
      // 与 /v1/chat 实扣同一函数：分层价 + per-model/档位 cacheReadPrice + omni 分模态
      const billing = await calculateOpenAiCacheAwareCost({ userId: sessionUserId, model, usage, explicitCache: false });
      const totalCost = billing.finalAmount;
      const streamDuration = lastChunkTime > firstChunkTime ? lastChunkTime - firstChunkTime : 0;
      const tpotMs = usage.completion_tokens > 1 ? streamDuration / (usage.completion_tokens - 1) : 0;

      await logUsage({
        region: upstream.region,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        protocol: "playground-openai-chat",
        apiKeyId: null,
        userId: sessionUserId,
        model: modelId,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        cost: totalCost,
        status: "success",
        latencyMs: Date.now() - startTime,
        ttftMs,
        tpotMs,
        cachedTokens: playgroundCached,
        cacheCreationTokens: playgroundCreation,
        retailListCost: billing.listAmount,
        retailDiscountRate: billing.discountRate,
        retailDiscountAmount: billing.discountAmount,
        thinkingOutput: billing.thinkingOutput,
        providerCacheMode: "implicit",
        providerInputIncludesCache: true,
        reservationId: billingReservation.id,
      });
      ctx.actualProviderTokens = usage.total_tokens || 0;
      await reconcileTokens(ctx, usage.total_tokens || 0);
      await settleReservation(
        billingReservation.id,
        totalCost,
        `Playground 对话: ${modelId} (${usage.total_tokens || 0} tokens)`,
        billing.discountRate,
        billing.discountAmount,
      );
      return;
    }

    const data: any = await response.json();
    restorePublicModelAlias(data, modelId);
    if (!response.ok) {
      await logUpstreamFailure({
        apiKeyId: null,
        userId: sessionUserId,
        model: modelId,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        region: upstream.region,
        protocol: "playground-openai-chat",
        latencyMs: Date.now() - startTime,
        httpStatus: response.status,
        errorReason: data.error?.message || "Upstream API error",
        reservationId: billingReservation.id,
      });
      openAiError(
        res,
        response.status,
        data.error?.message || "Upstream API error",
        data.error?.code || "upstream_error",
        "upstream_error"
      );
      return;
    }
    ctx.billableResponseReceived = true;

    const usage = data.usage || {};
    const playgroundCachedNS = usage.prompt_tokens_details?.cached_tokens || 0;
    const playgroundCreationNS = usage.prompt_tokens_details?.cache_creation_input_tokens || 0;
    // 与 /v1/chat 实扣同一函数：分层价 + per-model/档位 cacheReadPrice + omni 分模态
    const billing = await calculateOpenAiCacheAwareCost({ userId: sessionUserId, model, usage, explicitCache: false });
    const totalCost = billing.finalAmount;

    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "playground-openai-chat",
      apiKeyId: null,
      userId: sessionUserId,
      model: modelId,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      cost: totalCost,
      status: "success",
      latencyMs: Date.now() - startTime,
      cachedTokens: playgroundCachedNS,
      cacheCreationTokens: playgroundCreationNS,
      retailListCost: billing.listAmount,
      retailDiscountRate: billing.discountRate,
      retailDiscountAmount: billing.discountAmount,
      thinkingOutput: billing.thinkingOutput,
      providerCacheMode: "implicit",
      providerInputIncludesCache: true,
      reservationId: billingReservation.id,
    });
    ctx.actualProviderTokens = usage.total_tokens || 0;
    await reconcileTokens(ctx, usage.total_tokens || 0);
    await settleReservation(
      billingReservation.id,
      totalCost,
      `Playground 对话: ${modelId} (${usage.total_tokens || 0} tokens)`,
      billing.discountRate,
      billing.discountAmount,
    );

    res.setHeader("X-RateLimit-Remaining", String(ctx.qpmRemaining ?? 0));
    res.json(data);
  } catch (err: any) {
    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "playground-openai-chat",
      apiKeyId: null,
      userId: sessionUserId,
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
    if (res.headersSent) {
      try { res.end(); } catch { /* connection already closed */ }
    } else {
      openAiError(res, 500, `Upstream request failed: ${err.message}`, "upstream_error", "server_error");
    }
  } finally {
    await release(ctx);
  }
});

export default router;
