/**
 * Anthropic Messages <-> OpenAI Chat Completions 协议桥
 *
 * 用于上游 Anthropic 兼容端点未接入的模型（见 model-protocols.ts 的
 * ANTHROPIC_COMPAT_UNSUPPORTED）：/v1/messages 收到的 Anthropic 请求在平台内
 * 转成 OpenAI 格式打 compatible-mode，再把响应（含流式）转回 Anthropic 格式。
 */

import { getUpstreamModelId } from "./upstream-model-aliases";

type AnyRecord = Record<string, any>;

function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b: AnyRecord) => (b && b.type === "text" ? b.text : typeof b === "string" ? b : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function imageBlockToOpenAi(block: AnyRecord): AnyRecord | null {
  const source = block?.source;
  if (!source) return null;
  if (source.type === "base64" && source.data) {
    return { type: "image_url", image_url: { url: `data:${source.media_type || "image/jpeg"};base64,${source.data}` } };
  }
  if (source.type === "url" && source.url) {
    return { type: "image_url", image_url: { url: source.url } };
  }
  return null;
}

/** Anthropic Messages 请求体 -> OpenAI chat/completions 请求体 */
export function anthropicToOpenAiPayload(body: AnyRecord): AnyRecord {
  const openAiMessages: AnyRecord[] = [];

  const systemText = blockText(body.system);
  if (systemText) openAiMessages.push({ role: "system", content: systemText });

  for (const message of body.messages || []) {
    const { role, content } = message || {};
    if (typeof content === "string") {
      openAiMessages.push({ role, content });
      continue;
    }
    if (!Array.isArray(content)) continue;

    if (role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: AnyRecord[] = [];
      for (const block of content) {
        if (block?.type === "text" && block.text) textParts.push(block.text);
        else if (block?.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
          });
        }
        // thinking 块不回传（对应 OpenAI 侧的 reasoning_content，默认不透传）
      }
      const assistantMsg: AnyRecord = { role: "assistant", content: textParts.length ? textParts.join("\n") : null };
      if (toolCalls.length) assistantMsg.tool_calls = toolCalls;
      openAiMessages.push(assistantMsg);
      continue;
    }

    // user 消息：图文块保持多模态数组；tool_result 拆成独立 tool 消息
    const parts: AnyRecord[] = [];
    for (const block of content) {
      if (block?.type === "text") parts.push({ type: "text", text: block.text || "" });
      else if (block?.type === "image") {
        const img = imageBlockToOpenAi(block);
        if (img) parts.push(img);
      } else if (block?.type === "tool_result") {
        // 只提取文本；图片块以占位符表示，避免把整段 base64 塞进 tool 消息（请求体膨胀数 MB）
        const resultText = blockText(block.content);
        const hasImage = Array.isArray(block.content) && block.content.some((b: AnyRecord) => b?.type === "image");
        openAiMessages.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: resultText
            ? (hasImage ? `${resultText}\n[image content omitted]` : resultText)
            : (hasImage ? "[image content omitted]" : JSON.stringify(block.content ?? "")),
        });
      }
    }
    if (parts.length) {
      const onlyText = parts.every((p) => p.type === "text");
      openAiMessages.push({ role: "user", content: onlyText ? parts.map((p) => p.text).join("\n") : parts });
    }
  }

  const payload: AnyRecord = { model: getUpstreamModelId(body.model), messages: openAiMessages };
  if (body.max_tokens != null) payload.max_tokens = body.max_tokens;
  if (body.temperature != null) payload.temperature = body.temperature;
  if (body.top_p != null) payload.top_p = body.top_p;
  if (Array.isArray(body.stop_sequences) && body.stop_sequences.length) payload.stop = body.stop_sequences;
  if (body.stream) {
    payload.stream = true;
    payload.stream_options = { include_usage: true };
  }
  if (Array.isArray(body.tools) && body.tools.length) {
    payload.tools = body.tools.map((tool: AnyRecord) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
    }));
  }
  const choice = body.tool_choice;
  if (choice?.type === "auto") payload.tool_choice = "auto";
  else if (choice?.type === "any") payload.tool_choice = "required";
  else if (choice?.type === "none") payload.tool_choice = "none";
  else if (choice?.type === "tool" && choice.name) payload.tool_choice = { type: "function", function: { name: choice.name } };

  if (body.thinking?.type === "enabled") {
    payload.enable_thinking = true;
    if (body.thinking.budget_tokens) payload.thinking_budget = body.thinking.budget_tokens;
  } else if (body.thinking?.type === "disabled") {
    payload.enable_thinking = false;
  }
  return payload;
}

function mapStopReason(finishReason: string | null | undefined): string {
  if (finishReason === "length") return "max_tokens";
  if (finishReason === "tool_calls") return "tool_use";
  return "end_turn";
}

/**
 * OpenAI usage -> Anthropic usage。
 *
 * OpenAI 的 prompt_tokens 包含缓存读/写；Anthropic 的 input_tokens、
 * cache_creation_input_tokens、cache_read_input_tokens 三者互斥。对外必须先拆分，
 * 否则 Anthropic SDK 按三者求和时会重复计算缓存 Token。
 *
 * reasoning_tokens 仅供平台内部计费判定使用。它不是 Anthropic Usage 字段，故以
 * non-enumerable 属性保留，确保 JSON/SSE 响应不会泄露非标准字段。
 */
export function openAiUsageToAnthropic(usage: AnyRecord | null | undefined): AnyRecord {
  const promptTokens = Math.max(0, Number(usage?.prompt_tokens || 0));
  const cached = Math.max(0, Number(usage?.prompt_tokens_details?.cached_tokens || 0));
  const cacheCreation = Math.max(0, Number(usage?.prompt_tokens_details?.cache_creation_input_tokens || 0));
  const result = {
    input_tokens: Math.max(0, promptTokens - cached - cacheCreation),
    output_tokens: Math.max(0, Number(usage?.completion_tokens || 0)),
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cached,
  };
  Object.defineProperty(result, "reasoning_tokens", {
    value: Math.max(0, Number(usage?.completion_tokens_details?.reasoning_tokens || 0)),
    enumerable: false,
  });
  return result;
}

/** OpenAI 非流式响应 -> Anthropic message */
export function openAiResponseToAnthropic(data: AnyRecord, msgId: string, modelId: string): AnyRecord {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const content: AnyRecord[] = [];
  if (message.reasoning_content) {
    content.push({ type: "thinking", thinking: message.reasoning_content, signature: "" });
  }
  if (message.content) {
    content.push({ type: "text", text: message.content });
  }
  for (const call of message.tool_calls || []) {
    let input: AnyRecord = {};
    try { input = JSON.parse(call.function?.arguments || "{}"); } catch { /* 保底空对象 */ }
    content.push({ type: "tool_use", id: call.id, name: call.function?.name, input });
  }
  return {
    id: msgId,
    type: "message",
    role: "assistant",
    model: modelId,
    content,
    stop_reason: mapStopReason(choice.finish_reason),
    stop_sequence: null,
    usage: openAiUsageToAnthropic(data?.usage),
  };
}

export interface StreamTranslateResult {
  usage: AnyRecord;
  stopReason: string;
}

/**
 * OpenAI SSE 流 -> Anthropic SSE 事件流的增量转换器。
 * feed() 喂入上游原始文本分片并实时输出 Anthropic 内容事件；finish() 关尾并把
 * OpenAI 上游末块才返回的真实输入/缓存 usage 放入最终 message_delta。
 */
export function createAnthropicStreamTranslator(msgId: string, modelId: string, write: (text: string) => void) {
  let buffer = "";
  let started = false;
  let blockIndex = -1;
  let currentBlock: "thinking" | "text" | "tool" | null = null;
  let currentToolIndex: number | null = null;
  let finishReason: string | null = null;
  let usage: AnyRecord | null = null;
  const serialize = (event: string, data: AnyRecord) =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  const emit = (event: string, data: AnyRecord) => {
    write(serialize(event, data));
  };

  const ensureStarted = () => {
    if (started) return;
    started = true;
    emit("message_start", {
      type: "message_start",
      message: {
        id: msgId, type: "message", role: "assistant", model: modelId, content: [],
        stop_reason: null, stop_sequence: null,
        // OpenAI 兼容流到末块才提供真实输入/缓存 usage；这里先给合法的零值，
        // 最终 message_delta 会返回完整累计 usage，同时保持真实逐字流式。
        usage: {
          input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 0,
        },
      },
    });
  };

  const closeBlock = () => {
    if (currentBlock === null) return;
    emit("content_block_stop", { type: "content_block_stop", index: blockIndex });
    currentBlock = null;
    currentToolIndex = null;
  };

  const openBlock = (kind: "thinking" | "text" | "tool", contentBlock: AnyRecord) => {
    closeBlock();
    blockIndex++;
    currentBlock = kind;
    emit("content_block_start", { type: "content_block_start", index: blockIndex, content_block: contentBlock });
  };

  const handleChunk = (chunk: AnyRecord) => {
    ensureStarted();
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta || {};

    if (delta.reasoning_content) {
      if (currentBlock !== "thinking") openBlock("thinking", { type: "thinking", thinking: "" });
      emit("content_block_delta", {
        type: "content_block_delta", index: blockIndex,
        delta: { type: "thinking_delta", thinking: delta.reasoning_content },
      });
    }
    if (delta.content) {
      if (currentBlock !== "text") openBlock("text", { type: "text", text: "" });
      emit("content_block_delta", {
        type: "content_block_delta", index: blockIndex,
        delta: { type: "text_delta", text: delta.content },
      });
    }
    for (const call of delta.tool_calls || []) {
      const toolIdx = call.index ?? 0;
      if (currentBlock !== "tool" || currentToolIndex !== toolIdx) {
        openBlock("tool", { type: "tool_use", id: call.id || `toolu_${msgId}_${toolIdx}`, name: call.function?.name || "", input: {} });
        currentToolIndex = toolIdx;
      }
      if (call.function?.arguments) {
        emit("content_block_delta", {
          type: "content_block_delta", index: blockIndex,
          delta: { type: "input_json_delta", partial_json: call.function.arguments },
        });
      }
    }
  };

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return; // SSE 规范里 data: 后空格可选
    const payload = trimmed.slice(5).trimStart();
    if (payload === "[DONE]") return;
    try { handleChunk(JSON.parse(payload)); } catch { /* 忽略残缺分片 */ }
  };

  return {
    feed(text: string) {
      buffer += text;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    },
    finish(): StreamTranslateResult {
      // 冲刷残留 buffer：上游最后一行（常含 usage）可能没有尾随换行
      if (buffer) {
        processLine(buffer);
        buffer = "";
      }
      ensureStarted();
      closeBlock();
      const anthropicUsage = openAiUsageToAnthropic(usage);
      emit("message_delta", {
        type: "message_delta",
        delta: { stop_reason: mapStopReason(finishReason), stop_sequence: null },
        usage: anthropicUsage,
      });
      emit("message_stop", { type: "message_stop" });
      return { usage: anthropicUsage, stopReason: mapStopReason(finishReason) };
    },
  };
}
