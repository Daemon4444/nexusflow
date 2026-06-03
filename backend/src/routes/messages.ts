/**
 * Anthropic Messages API Compatible Route
 *
 * Endpoint: POST /v1/messages
 *
 * Translates Anthropic Messages API format to OpenAI Chat Completions format,
 * proxies through DashScope, and translates the response back.
 */

import { Router, Request, Response } from "express";
import { models } from "../data/models";
import { validateApiKey } from "../data/apikeys";
import { logUsage } from "../data/usage";
import { consume, hasSufficientBalance } from "../data/billing";
import { applyUserModelDiscount, calculateDiscountedTokenCost } from "../data/user-discounts";
import { checkConsumerLimits, checkRPM, checkTPM, reconcileTokensAsync, recordRequest, recordProviderTokens } from "../services/rate-limiter";
import { getEffectiveRateLimit } from "../data/ratelimits";
import { detectModelType } from "../services/adapters";
import { findProvider, getResolvedProviderApiKey } from "../services/providers";
import { buildUpstreamChatRequest } from "../utils/chat-request";
import { acquireConcurrency, releaseConcurrency } from "../services/scheduler";
import { sanitizeUpstreamError } from "../utils/sanitize-error";

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

/** Convert Anthropic message content to OpenAI format */
function anthropicContentToOpenAI(content: any): string | any[] {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  // Check if all blocks are text-only
  const allText = content.every((block: any) => block.type === "text");
  if (allText) {
    return content.map((block: any) => block.text).join("");
  }

  // Mixed content: convert to OpenAI multimodal format
  return content.map((block: any) => {
    if (block.type === "text") {
      return { type: "text", text: block.text };
    }
    if (block.type === "image") {
      const source = block.source;
      if (source?.type === "base64") {
        return {
          type: "image_url",
          image_url: {
            url: `data:${source.media_type};base64,${source.data}`,
          },
        };
      }
      if (source?.type === "url") {
        return {
          type: "image_url",
          image_url: { url: source.url },
        };
      }
    }
    return { type: "text", text: "" };
  });
}

/** Convert Anthropic messages request to OpenAI chat completions request */
function convertToOpenAI(body: any): any {
  const openaiMessages: any[] = [];

  // System message
  if (body.system) {
    if (typeof body.system === "string") {
      openaiMessages.push({ role: "system", content: body.system });
    } else if (Array.isArray(body.system)) {
      const systemText = body.system
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");
      if (systemText) {
        openaiMessages.push({ role: "system", content: systemText });
      }
    }
  }

  // Messages
  for (const msg of body.messages || []) {
    openaiMessages.push({
      role: msg.role,
      content: anthropicContentToOpenAI(msg.content),
    });
  }

  const result: any = {
    model: body.model,
    messages: openaiMessages,
    stream: !!body.stream,
  };

  if (body.max_tokens !== undefined) result.max_tokens = body.max_tokens;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.stop_sequences) result.stop = body.stop_sequences;
  if (body.tools) {
    result.tools = body.tools.map((tool: any) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.input_schema || {},
      },
    }));
  }

  // Request usage stats in streaming mode for billing
  if (result.stream) {
    result.stream_options = { include_usage: true };
  }

  return result;
}

/** Convert OpenAI chat completion response to Anthropic Messages format */
function convertToAnthropic(openaiData: any, model: string): any {
  const choice = openaiData.choices?.[0];
  const message = choice?.message || {};
  const usage = openaiData.usage || {};

  const contentBlocks: any[] = [];

  // Handle tool calls
  if (message.tool_calls && message.tool_calls.length > 0) {
    for (const toolCall of message.tool_calls) {
      if (toolCall.type === "function") {
        contentBlocks.push({
          type: "tool_use",
          id: toolCall.id || `toolu_${Date.now()}`,
          name: toolCall.function.name,
          input: (() => {
            try {
              return typeof toolCall.function.arguments === "string"
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments;
            } catch {
              return toolCall.function.arguments;
            }
          })(),
        });
      }
    }
  }

  // Handle text content
  if (message.content) {
    contentBlocks.unshift({
      type: "text",
      text: message.content,
    });
  }

  // If no content at all, add empty text block
  if (contentBlocks.length === 0) {
    contentBlocks.push({ type: "text", text: "" });
  }

  const stopReason = mapFinishReason(choice?.finish_reason);

  return {
    id: `msg_${openaiData.id || Date.now()}`,
    type: "message",
    role: "assistant",
    content: contentBlocks,
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
    },
  };
}

function mapFinishReason(reason: string | undefined): string {
  switch (reason) {
    case "stop": return "end_turn";
    case "length": return "max_tokens";
    case "tool_calls": return "tool_use";
    default: return "end_turn";
  }
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

async function calculateAnthropicUsageCost(userId: string | null | undefined, model: any, usage: any): Promise<number> {
  const inputTokens = usage?.input_tokens || 0;
  const outputTokens = usage?.output_tokens || 0;
  const cacheCreationTokens = usage?.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage?.cache_read_input_tokens || 0;
  const baseInputTokens = Math.max(0, inputTokens - cacheCreationTokens - cacheReadTokens);

  const listAmount = (baseInputTokens / 1_000_000) * model.promptPrice
    + (cacheCreationTokens / 1_000_000) * model.promptPrice * 1.25
    + (cacheReadTokens / 1_000_000) * model.promptPrice * 0.1
    + (outputTokens / 1_000_000) * model.completionPrice;
  return (await applyUserModelDiscount(userId, model.id, listAmount)).finalAmount;
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

  const provider = findProvider(modelId);
  if (!provider) {
    res.status(404).json({
      type: "error",
      error: {
        type: "not_found_error",
        message: `No provider configured for model '${modelId}'.`,
      },
    });
    return;
  }

  const upstreamApiKey = getResolvedProviderApiKey(provider);
  if (!upstreamApiKey) {
    res.status(500).json({
      type: "error",
      error: {
        type: "api_error",
        message: `Provider '${provider.name}' API key not configured.`,
      },
    });
    return;
  }

  const reservedMessageTokens = apiKeyRecord.user_id ? estimateMessageTokens(model, req.body) : 0;

  // Per-model rate limit
  if (apiKeyRecord.user_id) {
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
  recordRequest(provider.id, modelId, apiKeyRecord.id, 0);
  acquireConcurrency(provider.id, modelId);

  try {

  if (provider.id === "anthropic") {
    try {
      const headers: Record<string, string> = {
        "x-api-key": upstreamApiKey,
        "anthropic-version": getAnthropicVersion(req),
        "Content-Type": "application/json",
      };
      const beta = getAnthropicBeta(req);
      if (beta) headers["anthropic-beta"] = beta;

      const response = await fetch(`${provider.baseUrl}/messages`, {
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
        const totalCost = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: cacheCreationInputTokens,
          cache_read_input_tokens: cacheReadInputTokens,
        });
        const totalTokens = inputTokens + outputTokens;
        const streamDuration = lastChunkTime > firstChunkTime ? lastChunkTime - firstChunkTime : 0;
        const tpotMs = outputTokens > 1 ? streamDuration / (outputTokens - 1) : 0;

        await logUsage({
          apiKeyId: apiKeyRecord.id,
          userId: apiKeyRecord.user_id,
          model: modelId,
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens,
          cost: totalCost,
          status: "success",
          latencyMs,
          ttftMs,
          tpotMs,
        });
        recordProviderTokens(provider.id, modelId, totalTokens);
        if (apiKeyRecord.user_id) {
          await reconcileTokensAsync(`user:${apiKeyRecord.user_id}:${modelId}`, reservedMessageTokens, totalTokens);
        }

        if (apiKeyRecord.user_id && totalCost > 0) {
          await consume(
            apiKeyRecord.user_id,
            totalCost,
            `API (Claude): ${modelId} (${totalTokens} tokens, stream)`,
            apiKeyRecord.id
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
      const totalCost = await calculateAnthropicUsageCost(apiKeyRecord.user_id, model, usage);
      const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
      await logUsage({
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        promptTokens: usage.input_tokens || 0,
        completionTokens: usage.output_tokens || 0,
        totalTokens,
        cost: totalCost,
        status: "success",
        latencyMs: Date.now() - startTime,
      });
      recordProviderTokens(provider.id, modelId, totalTokens);
      if (apiKeyRecord.user_id) {
        await reconcileTokensAsync(`user:${apiKeyRecord.user_id}:${modelId}`, reservedMessageTokens, totalTokens);
      }

      if (apiKeyRecord.user_id && totalCost > 0) {
        await consume(
          apiKeyRecord.user_id,
          totalCost,
          `API (Claude): ${modelId} (${totalTokens} tokens)`,
          apiKeyRecord.id
        );
      }

      res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
      if (data && typeof data === "object") data.id = `msg_${logId}`;
      res.json(data);
      return;
    } catch (err: any) {
      await logUsage({
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
        type: "error",
        error: {
          type: "api_error",
          message: `Upstream request failed: ${sanitizeUpstreamError(err)}`,
        },
      });
      return;
    }
  }

  // Convert Anthropic request to OpenAI format
  const convertedRequest = convertToOpenAI(req.body);
  const openaiRequest = buildUpstreamChatRequest(model, {
    ...req.body,
    ...convertedRequest,
  });
  const messageId = `msg_${logId}`;

  try {
    if (stream) {
      // Streaming mode
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstreamApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(openaiRequest),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
      });

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

      // Send message_start immediately
      const messageStartEvent = {
        type: "message_start",
        message: {
          id: messageId,
          type: "message",
          role: "assistant",
          content: [],
          model: modelId,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      };
      res.write(`event: message_start\ndata: ${JSON.stringify(messageStartEvent)}\n\n`);

      let contentBlockStarted = false;
      let inputTokens = 0;
      let outputTokens = 0;
      let ttftMs = 0;
      let chunkCount = 0;
      let firstChunkTime = 0;
      let lastChunkTime = 0;
      let fullText = "";

      const processLine = (line: string) => {
        const event = parseSseEvent(line);
        if (!event) return;

        const delta = event?.choices?.[0]?.delta;
        const finishReason = event?.choices?.[0]?.finish_reason;

        if (event?.usage) {
          inputTokens = event.usage.prompt_tokens || inputTokens;
          outputTokens = event.usage.completion_tokens || outputTokens;
        }

        if (delta?.content && !contentBlockStarted) {
          res.write(`event: content_block_start\ndata: ${JSON.stringify({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          })}\n\n`);
          contentBlockStarted = true;
        }

        if (delta?.content) {
          fullText += delta.content;
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: delta.content },
          })}\n\n`);
        }

        if (finishReason) {
          if (contentBlockStarted) {
            res.write(`event: content_block_stop\ndata: ${JSON.stringify({
              type: "content_block_stop",
              index: 0,
            })}\n\n`);
          }

          const stopReason = mapFinishReason(finishReason);
          res.write(`event: message_delta\ndata: ${JSON.stringify({
            type: "message_delta",
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: { output_tokens: outputTokens },
          })}\n\n`);

          res.write(`event: message_stop\ndata: ${JSON.stringify({
            type: "message_stop",
          })}\n\n`);
        }
      };

      let buffer = "";
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
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            processLine(line);
          }
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
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            processLine(line);
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        processLine(buffer);
      }

      res.end();

      // Billing
      const latencyMs = Date.now() - startTime;
      const totalCost = (await calculateDiscountedTokenCost(apiKeyRecord.user_id, model, inputTokens, outputTokens)).finalAmount;

      const streamDuration = lastChunkTime > firstChunkTime ? lastChunkTime - firstChunkTime : 0;
      const tpotMs = outputTokens > 1 ? streamDuration / (outputTokens - 1) : 0;

      await logUsage({
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        model: modelId,
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
        cost: totalCost,
        status: "success",
        latencyMs,
        ttftMs,
        tpotMs,
      });
      recordProviderTokens(provider.id, modelId, inputTokens + outputTokens);
      if (apiKeyRecord.user_id) {
        await reconcileTokensAsync(`user:${apiKeyRecord.user_id}:${modelId}`, reservedMessageTokens, inputTokens + outputTokens);
      }

      if (apiKeyRecord.user_id && totalCost > 0) {
        await consume(
          apiKeyRecord.user_id,
          totalCost,
          `API (Anthropic): ${modelId} (${inputTokens + outputTokens} tokens, stream)`,
          apiKeyRecord.id
        );
      }
      return;
    }

    // Non-streaming
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstreamApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiRequest),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    });

    const data: any = await response.json();

    if (!response.ok) {
      res.status(response.status).json({
        type: "error",
        error: {
          type: "api_error",
          message: data.error?.message || "Upstream API error",
        },
      });
      return;
    }

    // Convert to Anthropic format
    const anthropicResponse = convertToAnthropic(data, modelId);
    anthropicResponse.id = `msg_${logId}`;

    // Billing
    const latencyMs = Date.now() - startTime;
    const usage = data.usage || {};
    const totalCost = (await calculateDiscountedTokenCost(apiKeyRecord.user_id, model, usage.prompt_tokens || 0, usage.completion_tokens || 0)).finalAmount;

    await logUsage({
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
    if (apiKeyRecord.user_id) {
      await reconcileTokensAsync(`user:${apiKeyRecord.user_id}:${modelId}`, reservedMessageTokens, usage.total_tokens || 0);
    }

    if (apiKeyRecord.user_id && totalCost > 0) {
      await consume(
        apiKeyRecord.user_id,
        totalCost,
        `API (Anthropic): ${modelId} (${usage.total_tokens || 0} tokens)`,
        apiKeyRecord.id
      );
    }

    res.json(anthropicResponse);

  } catch (err: any) {
    await logUsage({
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
      type: "error",
      error: {
        type: "api_error",
        message: `Upstream request failed: ${sanitizeUpstreamError(err)}`,
      },
    });
  }

  } finally {
    releaseConcurrency(provider.id, modelId);
  }
});

export default router;
