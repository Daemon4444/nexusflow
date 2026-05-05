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
import { logUsage } from "../data/usage";
import { consume, hasSufficientBalance } from "../data/billing";
import { checkConsumerLimits, checkRPM, recordRequest, recordRequestAsync, recordProviderTokens } from "../services/rate-limiter";
import { getEffectiveRateLimit } from "../data/ratelimits";
import { detectModelType, adaptImageRequest, pollDashScopeTask } from "../services/adapters";
import { findProvider, getResolvedProviderApiKey } from "../services/providers";
import { getSupportedProtocols } from "../utils/model-protocols";

const router = Router();

// 上游请求超时时间（毫秒）
const UPSTREAM_TIMEOUT = 120000; // 2分钟

/** Extract Bearer token from Authorization header */
function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

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

function parseSseEvents(payload: string): any[] {
  const events: any[] = [];
  for (const line of payload.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") continue;
    try {
      events.push(JSON.parse(trimmed.slice(6)));
    } catch {
      continue;
    }
  }
  return events;
}

function buildChatCompletionFromSse(events: any[]): any {
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
          ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
        },
        finish_reason: last?.choices?.[0]?.finish_reason || "stop",
      },
    ],
    usage,
  };
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
  return (promptTokens / 1_000_000) * model.promptPrice + (completionTokens / 1_000_000) * model.completionPrice;
}

function estimateEmbeddingCost(model: any, input: unknown): number {
  const promptTokens = Math.max(1, roughTokenCount(input));
  return (promptTokens / 1_000_000) * model.promptPrice;
}

function rejectInsufficientBalance(res: Response): void {
  res.status(402).json({
    error: {
      message: "Insufficient balance for estimated maximum cost. Please recharge your account or lower max_tokens.",
      type: "billing_error",
      code: "insufficient_balance",
    },
  });
}

// GET /v1/models — OpenAI compatible model list
router.get("/models", (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token || !validateApiKey(token)) {
    res.status(401).json({
      error: {
        message: "Invalid API key provided.",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    });
    return;
  }

  const data = models.map((m) => ({
    id: m.id,
    object: "model",
    created: Math.floor(new Date("2025-01-01").getTime() / 1000),
    owned_by: m.provider,
    permission: [],
    root: m.id,
    parent: null,
    supported_protocols: getSupportedProtocols(m),
  }));

  res.json({ object: "list", data });
});

// POST /v1/images/generations — OpenAI compatible image generation
router.post("/images/generations", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token || !validateApiKey(token)) {
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

  const provider = findProvider(modelId);
  if (!provider) {
    res.status(404).json({
      error: {
        message: `No provider configured for model '${modelId}'.`,
        type: "invalid_request_error",
        code: "provider_not_found",
      },
    });
    return;
  }

  const upstreamApiKey = getResolvedProviderApiKey(provider);
  if (!upstreamApiKey) {
    res.status(500).json({
      error: {
        message: `Provider '${provider.name}' API key not configured.`,
        type: "server_error",
        code: "provider_not_configured",
      },
    });
    return;
  }

  const apiKeyRecord = validateApiKey(token)!;
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

  const estimatedImageCost = (n || 1) * model.promptPrice;
  if (!hasSufficientBalance(apiKeyRecord.user_id, estimatedImageCost)) {
    rejectInsufficientBalance(res);
    return;
  }

  const startTime = Date.now();
  recordRequest(provider.id, modelId, apiKeyRecord.id, 0);

  try {
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
    });

    const response = await fetch(adapted.url, {
      method: adapted.method,
      headers: adapted.headers,
      body: JSON.stringify(adapted.body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    });

    const data: any = await response.json();
    if (!response.ok) {
      res.status(response.status).json({
        error: {
          message: data.message || data.error?.message || "Upstream image API error",
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
    const cost = (n || imageCount || 1) * model.promptPrice;
    logUsage({
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost,
      status: "success",
      latencyMs: Date.now() - startTime,
    });

    if (apiKeyRecord.user_id && cost > 0) {
      consume(
        apiKeyRecord.user_id,
        cost,
        `Image generation: ${modelId} (${imageCount} images)`,
        apiKeyRecord.id
      );
    }

    res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
    res.json({
      created: Math.floor(Date.now() / 1000),
      data: imageUrls.map((url) => ({ url, revised_prompt: prompt || null })),
    });
  } catch (err: any) {
    logUsage({
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
        message: `Upstream request failed: ${err.message}`,
        type: "server_error",
        code: "upstream_error",
      },
    });
  }
});

// POST /v1/chat/completions — OpenAI compatible chat
router.post("/chat/completions", async (req: Request, res: Response) => {
  // Auth
  const token = extractToken(req);
  if (!token || !validateApiKey(token)) {
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
    res.status(400).json({
      error: {
        message: "Missing required parameters: model and messages.",
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

  // Find provider for this model
  const provider = findProvider(modelId);
  if (!provider) {
    res.status(404).json({
      error: {
        message: `No provider configured for model '${modelId}'.`,
        type: "invalid_request_error",
        code: "provider_not_found",
      },
    });
    return;
  }

  const upstreamApiKey = getResolvedProviderApiKey(provider);
  if (!upstreamApiKey) {
    res.status(500).json({
      error: {
        message: `Provider '${provider.name}' API key not configured. Please add ${provider.apiKeyEnv} to environment.`,
        type: "server_error",
        code: "provider_not_configured",
      },
    });
    return;
  }

  const apiKeyRecord = validateApiKey(token)!;

  // Per-model user-level rate limit check
  if (apiKeyRecord.user_id) {
    const userLimits = getEffectiveRateLimit(apiKeyRecord.user_id, modelId);
    const rpmCheck = await checkRPM(`user:${apiKeyRecord.user_id}:${modelId}`, userLimits.qpm);
    if (!rpmCheck.allowed) {
      res.status(429).json({
        error: {
          message: `Model-level rate limit exceeded: ${userLimits.qpm} requests/min for '${modelId}'. Retry after ${Math.ceil(rpmCheck.resetMs / 1000)}s. Submit a ticket to request higher limits.`,
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      });
      return;
    }
  }

  // Rate limit check
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

  const estimatedChatCost = estimateChatMaxCost(model, messages, max_tokens);
  if (!hasSufficientBalance(apiKeyRecord.user_id, estimatedChatCost)) {
    rejectInsufficientBalance(res);
    return;
  }

  // Build request
  const requiresUpstreamStream = modelId === "qwq-plus" && !stream;
  const requestBody: any = { model: modelId, messages, stream: !!stream || requiresUpstreamStream };
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

  // Record rate limits
  recordRequest(provider.id, modelId, apiKeyRecord.id, 0);
  if (apiKeyRecord.user_id) {
    await recordRequestAsync(`user:${apiKeyRecord.user_id}:${modelId}`);
  }

  try {
    // Streaming
    if (stream) {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstreamApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
      });

      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).json({
          error: { message: errText, type: "upstream_error", code: "upstream_error" },
        });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());

      // Collect all chunks for billing + track TTFT/TPOT
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
          fullResponse += text;
          res.write(chunk);
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
          fullResponse += text;
          res.write(value);
        }
      }
      res.end();

      // Parse SSE data to extract usage for billing
      let streamTokens = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      try {
        const lines = fullResponse.split("\n");
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            const json = JSON.parse(line.slice(6));
            if (json.usage) {
              streamTokens = json.usage;
              break;
            }
          }
        }
      } catch {}

      // Log usage and bill
      const latencyMs = Date.now() - startTime;
      const promptCost = (streamTokens.prompt_tokens / 1_000_000) * model.promptPrice;
      const completionCost = (streamTokens.completion_tokens / 1_000_000) * model.completionPrice;
      const totalCost = promptCost + completionCost;

      // Calculate TPOT: time per output token (ms)
      const streamDuration = lastChunkTime > firstChunkTime ? lastChunkTime - firstChunkTime : 0;
      const tpotMs = streamTokens.completion_tokens > 1
        ? streamDuration / (streamTokens.completion_tokens - 1)
        : 0;

      logUsage({
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        promptTokens: streamTokens.prompt_tokens,
        completionTokens: streamTokens.completion_tokens,
        totalTokens: streamTokens.total_tokens,
        cost: totalCost,
        status: "success",
        latencyMs,
        ttftMs,
        tpotMs,
      });
      recordProviderTokens(provider.id, modelId, streamTokens.total_tokens || 0);

      if (apiKeyRecord.user_id && totalCost > 0) {
        consume(
          apiKeyRecord.user_id,
          totalCost,
          `API 调用: ${modelId} (${streamTokens.total_tokens} tokens, stream)`,
          apiKeyRecord.id
        );
      }
      return;
    }

    // Non-streaming (or models that only expose stream mode upstream)
    if (requiresUpstreamStream) {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstreamApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
      });

      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).json({
          error: {
            message: errText,
            type: "upstream_error",
            code: "upstream_error",
          },
        });
        return;
      }

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
      const data = buildChatCompletionFromSse(events);
      const latencyMs = Date.now() - startTime;
      const usage = data.usage || {};
      const promptCost = ((usage.prompt_tokens || 0) / 1_000_000) * model.promptPrice;
      const completionCost = ((usage.completion_tokens || 0) / 1_000_000) * model.completionPrice;
      const totalCost = promptCost + completionCost;

      logUsage({
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        cost: totalCost,
        status: "success",
        latencyMs,
      });
      recordProviderTokens(provider.id, modelId, usage.total_tokens || 0);

      if (apiKeyRecord.user_id && totalCost > 0) {
        consume(
          apiKeyRecord.user_id,
          totalCost,
          `API 调用: ${modelId} (${usage.total_tokens || 0} tokens)`,
          apiKeyRecord.id
        );
      }

      res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
      res.json(data);
      return;
    }

    // Non-streaming
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstreamApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    });

    const data: any = await response.json();

    if (!response.ok) {
      res.status(response.status).json({
        error: {
          message: data.error?.message || "Upstream API error",
          type: "upstream_error",
          code: data.error?.code || "upstream_error",
        },
      });
      return;
    }

    // Log usage and billing
    const latencyMs = Date.now() - startTime;
    const usage = data.usage || {};
    const promptCost = ((usage.prompt_tokens || 0) / 1_000_000) * model.promptPrice;
    const completionCost = ((usage.completion_tokens || 0) / 1_000_000) * model.completionPrice;
    
    logUsage({
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      cost: promptCost + completionCost,
      status: "success",
      latencyMs,
    });
    recordProviderTokens(provider.id, modelId, usage.total_tokens || 0);

    // Auto-billing
    const totalCost = promptCost + completionCost;
    if (apiKeyRecord.user_id && totalCost > 0) {
      consume(
        apiKeyRecord.user_id,
        totalCost,
        `API 调用: ${modelId} (${usage.total_tokens || 0} tokens)`,
        apiKeyRecord.id
      );
    }

    // Add rate limit headers
    res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
    res.json(data);

  } catch (err: any) {
    logUsage({
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
        message: `Upstream request failed: ${err.message}`,
        type: "server_error",
        code: "upstream_error",
      },
    });
  }
});

// POST /v1/embeddings — OpenAI compatible embeddings
router.post("/embeddings", async (req: Request, res: Response) => {
  // Auth
  const token = extractToken(req);
  if (!token || !validateApiKey(token)) {
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

  // Find provider for this model
  const provider = findProvider(modelId);
  if (!provider) {
    res.status(404).json({
      error: {
        message: `No provider configured for model '${modelId}'.`,
        type: "invalid_request_error",
        code: "provider_not_found",
      },
    });
    return;
  }

  const upstreamApiKey = getResolvedProviderApiKey(provider);
  if (!upstreamApiKey) {
    res.status(500).json({
      error: {
        message: `Provider '${provider.name}' API key not configured.`,
        type: "server_error",
        code: "provider_not_configured",
      },
    });
    return;
  }

  const apiKeyRecord = validateApiKey(token)!;

  // Rate limit check
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

  const estimatedEmbeddingCost = estimateEmbeddingCost(model, input);
  if (!hasSufficientBalance(apiKeyRecord.user_id, estimatedEmbeddingCost)) {
    rejectInsufficientBalance(res);
    return;
  }

  const requestBody: any = { model: modelId, input };
  if (dimensions !== undefined) requestBody.dimensions = dimensions;
  if (encoding_format !== undefined) requestBody.encoding_format = encoding_format;

  const startTime = Date.now();
  recordRequest(provider.id, modelId, apiKeyRecord.id, 0);

  try {
    const response = await fetch(`${provider.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstreamApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    });

    const data: any = await response.json();

    if (!response.ok) {
      res.status(response.status).json({
        error: {
          message: data.error?.message || "Upstream API error",
          type: "upstream_error",
          code: data.error?.code || "upstream_error",
        },
      });
      return;
    }

    // Log usage
    const latencyMs = Date.now() - startTime;
    const usage = data.usage || {};
    const cost = ((usage.prompt_tokens || 0) / 1_000_000) * model.promptPrice;

    logUsage({
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.user_id,
      model: modelId,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: 0,
      totalTokens: usage.total_tokens || 0,
      cost,
      status: "success",
      latencyMs,
    });
    recordProviderTokens(provider.id, modelId, usage.total_tokens || 0);

    if (apiKeyRecord.user_id && cost > 0) {
      consume(
        apiKeyRecord.user_id,
        cost,
        `Embedding: ${modelId} (${usage.prompt_tokens || 0} tokens)`,
        apiKeyRecord.id
      );
    }

    res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
    res.json(data);

  } catch (err: any) {
    logUsage({
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
        message: `Upstream request failed: ${err.message}`,
        type: "server_error",
        code: "upstream_error",
      },
    });
  }
});

export default router;
