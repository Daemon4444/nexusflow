import { Router, Request, Response } from "express";
import { calculateTokenCost, models } from "../data/models";
import { validateSession } from "../data/users";
import { logUsage } from "../data/usage";
import { consume, hasSufficientBalance } from "../data/billing";
import { getEffectiveRateLimit } from "../data/ratelimits";
import { detectModelType } from "../services/adapters";
import { findProvider, getResolvedProviderApiKey } from "../services/providers";
import { checkRPM, recordRequest, recordRequestAsync, recordProviderTokens } from "../services/rate-limiter";

const router = Router();
const UPSTREAM_TIMEOUT = 120000;

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function openAiError(res: Response, status: number, message: string, code: string, type = "invalid_request_error"): void {
  res.status(status).json({ error: { message, type, code } });
}

function roughTokenCount(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return Math.ceil(value.length / 2);
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + roughTokenCount(item), 0);
  if (typeof value === "object") return Math.ceil(JSON.stringify(value).length / 2);
  return Math.ceil(String(value).length / 2);
}

function estimateChatMaxCost(model: any, messages: unknown[], maxTokens?: number): number {
  const promptTokens = Math.max(1, roughTokenCount(messages));
  const completionTokens = Math.max(1, Math.min(Number(maxTokens) || model.maxOutput || 4096, model.maxOutput || 4096));
  return calculateTokenCost(model, promptTokens, completionTokens);
}

function parseSseUsage(payload: string): { prompt_tokens: number; completion_tokens: number; total_tokens: number } {
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
  const token = extractToken(req);
  const session = token ? await validateSession(token) : null;
  if (!session) {
    openAiError(res, 401, "请先登录后再使用 Playground。", "invalid_session");
    return;
  }

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
  } = req.body;

  if (!modelId || !messages || !Array.isArray(messages) || messages.length === 0) {
    openAiError(res, 400, "Missing required parameters: model and messages.", "invalid_request");
    return;
  }

  const model = models.find((item) => item.id === modelId);
  if (!model) {
    openAiError(res, 404, `Model '${modelId}' not found.`, "model_not_found");
    return;
  }

  if (detectModelType(model.category) !== "chat") {
    openAiError(res, 400, `Model '${modelId}' does not support chat completions.`, "unsupported_model");
    return;
  }

  const provider = findProvider(modelId);
  if (!provider) {
    openAiError(res, 404, `No provider configured for model '${modelId}'.`, "provider_not_found");
    return;
  }

  const upstreamApiKey = getResolvedProviderApiKey(provider);
  if (!upstreamApiKey) {
    openAiError(res, 500, `Provider '${provider.name}' API key not configured.`, "provider_not_configured", "server_error");
    return;
  }

  const userLimits = await getEffectiveRateLimit(session.id, modelId);
  const rpmCheck = await checkRPM(`user:${session.id}:${modelId}`, userLimits.qpm);
  if (!rpmCheck.allowed) {
    openAiError(
      res,
      429,
      `Model-level rate limit exceeded: ${userLimits.qpm} requests/min for '${modelId}'. Retry after ${Math.ceil(rpmCheck.resetMs / 1000)}s.`,
      "rate_limit_exceeded",
      "rate_limit_error"
    );
    return;
  }

  const estimatedChatCost = estimateChatMaxCost(model, messages, max_tokens);
  if (!await hasSufficientBalance(session.id, estimatedChatCost)) {
    openAiError(res, 402, "账户余额不足，请充值后再调用。", "insufficient_balance", "insufficient_balance");
    return;
  }

  const requestBody: any = { model: modelId, messages, stream: !!stream };
  if (temperature !== undefined) requestBody.temperature = temperature;
  if (max_tokens !== undefined) requestBody.max_tokens = max_tokens;
  if (top_p !== undefined) requestBody.top_p = top_p;
  if (stop !== undefined) requestBody.stop = stop;
  if (frequency_penalty !== undefined) requestBody.frequency_penalty = frequency_penalty;
  if (presence_penalty !== undefined) requestBody.presence_penalty = presence_penalty;
  if (tools) requestBody.tools = tools;
  if (tool_choice) requestBody.tool_choice = tool_choice;
  if (response_format) requestBody.response_format = response_format;
  if (stream_options !== undefined) requestBody.stream_options = stream_options;
  if (requestBody.stream && requestBody.stream_options === undefined) {
    requestBody.stream_options = { include_usage: true };
  }
  if (enable_thinking !== undefined) requestBody.enable_thinking = enable_thinking;
  if ((modelId === "qwen3-32b" || modelId === "qwen3-8b") && !requestBody.stream) {
    requestBody.enable_thinking = false;
  }

  const startTime = Date.now();
  const refId = `playground:${session.id}`;
  recordRequest(provider.id, modelId, refId, 0);
  await recordRequestAsync(`user:${session.id}:${modelId}`);

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstreamApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    });

    if (stream) {
      if (!response.ok) {
        const errText = await response.text();
        openAiError(res, response.status, errText || "Upstream API error", "upstream_error", "upstream_error");
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-RateLimit-Remaining", rpmCheck.remaining.toString());

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
          fullResponse += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
          res.write(chunk);
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
          fullResponse += decoder.decode(value, { stream: true });
          res.write(value);
        }
      }
      res.end();

      const usage = parseSseUsage(fullResponse);
      const totalCost = calculateTokenCost(model, usage.prompt_tokens || 0, usage.completion_tokens || 0);
      const streamDuration = lastChunkTime > firstChunkTime ? lastChunkTime - firstChunkTime : 0;
      const tpotMs = usage.completion_tokens > 1 ? streamDuration / (usage.completion_tokens - 1) : 0;

      await logUsage({
        apiKeyId: null,
        userId: session.id,
        model: modelId,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        cost: totalCost,
        status: "success",
        latencyMs: Date.now() - startTime,
        ttftMs,
        tpotMs,
      });
      recordProviderTokens(provider.id, modelId, usage.total_tokens || 0);
      if (totalCost > 0) await consume(session.id, totalCost, `Playground 对话: ${modelId} (${usage.total_tokens || 0} tokens)`, refId);
      return;
    }

    const data: any = await response.json();
    if (!response.ok) {
      openAiError(
        res,
        response.status,
        data.error?.message || "Upstream API error",
        data.error?.code || "upstream_error",
        "upstream_error"
      );
      return;
    }

    const usage = data.usage || {};
    const totalCost = calculateTokenCost(model, usage.prompt_tokens || 0, usage.completion_tokens || 0);

    await logUsage({
      apiKeyId: null,
      userId: session.id,
      model: modelId,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      cost: totalCost,
      status: "success",
      latencyMs: Date.now() - startTime,
    });
    recordProviderTokens(provider.id, modelId, usage.total_tokens || 0);
    if (totalCost > 0) await consume(session.id, totalCost, `Playground 对话: ${modelId} (${usage.total_tokens || 0} tokens)`, refId);

    res.setHeader("X-RateLimit-Remaining", rpmCheck.remaining.toString());
    res.json(data);
  } catch (err: any) {
    await logUsage({
      apiKeyId: null,
      userId: session.id,
      model: modelId,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      status: "error",
      latencyMs: Date.now() - startTime,
    });
    openAiError(res, 500, `Upstream request failed: ${err.message}`, "upstream_error", "server_error");
  }
});

export default router;
