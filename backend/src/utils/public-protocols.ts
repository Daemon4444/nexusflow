import type { Request } from "express";

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

function makeDataUrl(source: any): string | null {
  if (!source) return null;
  if (source.type === "base64" && source.media_type && source.data) {
    return `data:${source.media_type};base64,${source.data}`;
  }
  if (source.type === "url" && source.url) {
    return source.url;
  }
  return null;
}

function finalizeOpenAiContent(items: any[]): string | any[] {
  if (items.length === 0) return "";
  if (items.every((item) => item?.type === "text")) {
    return items.map((item) => item.text).join("\n");
  }
  return items;
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlocks = content
      .filter((block) => block?.type === "text")
      .map((block) => normalizeText(block.text));
    if (textBlocks.length > 0) return textBlocks.join("\n");
  }
  return normalizeText(content);
}

function extractSystemText(system: unknown): string {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) {
    return system
      .filter((block) => block?.type === "text")
      .map((block) => normalizeText(block.text))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function anthropicBlocksToOpenAi(blocks: any[]): { content: string | any[]; toolCalls: any[]; toolResults: any[] } {
  const contentItems: any[] = [];
  const toolCalls: any[] = [];
  const toolResults: any[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block) continue;

    if (block.type === "text") {
      contentItems.push({ type: "text", text: normalizeText(block.text) });
      continue;
    }

    if (block.type === "image") {
      const url = makeDataUrl(block.source);
      if (url) {
        contentItems.push({ type: "image_url", image_url: { url } });
      }
      continue;
    }

    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id || `toolu_${index}`,
        type: "function",
        function: {
          name: block.name || `tool_${index}`,
          arguments: JSON.stringify(block.input || {}),
        },
      });
      continue;
    }

    if (block.type === "tool_result") {
      toolResults.push({
        tool_call_id: block.tool_use_id || block.id || `toolu_${index}`,
        content: stringifyToolResult(block.content),
      });
    }
  }

  return {
    content: finalizeOpenAiContent(contentItems),
    toolCalls,
    toolResults,
  };
}

function geminiPartsToOpenAi(parts: any[]): { content: string | any[]; toolCalls: any[]; toolResults: any[] } {
  const contentItems: any[] = [];
  const toolCalls: any[] = [];
  const toolResults: any[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part) continue;

    if (typeof part.text === "string") {
      contentItems.push({ type: "text", text: part.text });
      continue;
    }

    const inlineData = part.inlineData || part.inline_data;
    if (inlineData?.data && inlineData?.mimeType) {
      contentItems.push({
        type: "image_url",
        image_url: {
          url: `data:${inlineData.mimeType};base64,${inlineData.data}`,
        },
      });
      continue;
    }

    const fileData = part.fileData || part.file_data;
    if (fileData?.fileUri || fileData?.uri) {
      contentItems.push({
        type: "image_url",
        image_url: {
          url: fileData.fileUri || fileData.uri,
        },
      });
      continue;
    }

    const functionCall = part.functionCall || part.function_call;
    if (functionCall?.name) {
      toolCalls.push({
        id: functionCall.id || `call_${index}`,
        type: "function",
        function: {
          name: functionCall.name,
          arguments: JSON.stringify(functionCall.args || {}),
        },
      });
      continue;
    }

    const functionResponse = part.functionResponse || part.function_response;
    if (functionResponse?.name) {
      toolResults.push({
        tool_call_id: functionResponse.id || functionResponse.name || `call_${index}`,
        content: JSON.stringify(functionResponse.response || functionResponse.output || {}),
      });
    }
  }

  return {
    content: finalizeOpenAiContent(contentItems),
    toolCalls,
    toolResults,
  };
}

function mapFinishReasonToAnthropic(finishReason: string | null | undefined, hasTools: boolean): string | null {
  if (hasTools) return "tool_use";
  if (finishReason === "stop") return "end_turn";
  if (finishReason === "length") return "max_tokens";
  return null;
}

function mapFinishReasonToGemini(finishReason: string | null | undefined): string {
  if (finishReason === "length") return "MAX_TOKENS";
  if (finishReason === "content_filter") return "SAFETY";
  return "STOP";
}

function mapErrorStatus(status: number): string {
  if (status === 400 || status === 404) return "INVALID_ARGUMENT";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 402 || status === 403) return "PERMISSION_DENIED";
  if (status === 429) return "RESOURCE_EXHAUSTED";
  return "INTERNAL";
}

export function extractPublicApiKey(req: Request): string | null {
  const auth = headerValue(req.headers.authorization);
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }

  const anthropicKey = headerValue(req.headers["x-api-key"]);
  if (anthropicKey) return anthropicKey;

  const geminiKey = headerValue(req.headers["x-goog-api-key"]);
  if (geminiKey) return geminiKey;

  if (typeof req.query.key === "string" && req.query.key.trim().length > 0) {
    return req.query.key.trim();
  }

  return null;
}

export function buildLocalOpenAiBase(): string {
  return `http://127.0.0.1:${Number(process.env.PORT) || 3001}/v1`;
}

export function anthropicRequestToOpenAi(body: any): any {
  const messages: any[] = [];
  const systemText = extractSystemText(body.system);
  if (systemText) {
    messages.push({ role: "system", content: systemText });
  }

  for (const rawMessage of Array.isArray(body.messages) ? body.messages : []) {
    const blocks = Array.isArray(rawMessage?.content)
      ? rawMessage.content
      : typeof rawMessage?.content === "string"
        ? [{ type: "text", text: rawMessage.content }]
        : [];

    const { content, toolCalls, toolResults } = anthropicBlocksToOpenAi(blocks);

    if (rawMessage?.role === "assistant") {
      const assistantMessage: any = { role: "assistant", content };
      if (toolCalls.length > 0) assistantMessage.tool_calls = toolCalls;
      messages.push(assistantMessage);
    } else {
      if (content !== "") {
        messages.push({ role: "user", content });
      }
      for (const toolResult of toolResults) {
        messages.push({ role: "tool", ...toolResult });
      }
    }
  }

  const tools = Array.isArray(body.tools)
    ? body.tools.map((tool: any) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description || "",
          parameters: tool.input_schema || { type: "object", properties: {} },
        },
      }))
    : undefined;

  let toolChoice: any;
  const anthropicToolChoice = body.tool_choice;
  if (anthropicToolChoice?.type === "tool" && anthropicToolChoice.name) {
    toolChoice = { type: "function", function: { name: anthropicToolChoice.name } };
  } else if (anthropicToolChoice?.type === "any") {
    toolChoice = "required";
  } else if (anthropicToolChoice?.type === "none") {
    toolChoice = "none";
  } else if (anthropicToolChoice?.type === "auto") {
    toolChoice = "auto";
  }

  const requestBody: any = {
    model: body.model,
    messages,
    stream: !!body.stream,
  };

  if (body.temperature !== undefined) requestBody.temperature = body.temperature;
  if (body.top_p !== undefined) requestBody.top_p = body.top_p;
  if (body.max_tokens !== undefined) requestBody.max_tokens = body.max_tokens;
  if (Array.isArray(body.stop_sequences) && body.stop_sequences.length > 0) {
    requestBody.stop = body.stop_sequences;
  }
  if (tools && tools.length > 0) requestBody.tools = tools;
  if (toolChoice) requestBody.tool_choice = toolChoice;

  return requestBody;
}

export function openAiResponseToAnthropic(data: any, fallbackModel: string): any {
  const message = data?.choices?.[0]?.message || {};
  const usage = data?.usage || {};
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const content: any[] = [];

  if (typeof message.content === "string" && message.content.length > 0) {
    content.push({ type: "text", text: message.content });
  }

  for (const toolCall of toolCalls) {
    let input = {};
    try {
      input = JSON.parse(toolCall?.function?.arguments || "{}");
    } catch {
      input = { raw_arguments: toolCall?.function?.arguments || "" };
    }
    content.push({
      type: "tool_use",
      id: toolCall.id || `toolu_${Date.now()}`,
      name: toolCall?.function?.name || "tool",
      input,
    });
  }

  return {
    id: (typeof data?.id === "string" ? data.id.replace(/^chatcmpl/, "msg") : null) || `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: data?.model || fallbackModel,
    content,
    stop_reason: mapFinishReasonToAnthropic(data?.choices?.[0]?.finish_reason, toolCalls.length > 0),
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
    },
  };
}

export function anthropicErrorPayload(status: number, payload: any): any {
  const message = payload?.error?.message || payload?.message || "Request failed";
  const type =
    status === 401 ? "authentication_error" :
    status === 402 || status === 403 ? "permission_error" :
    status === 429 ? "rate_limit_error" :
    status >= 500 ? "api_error" :
    "invalid_request_error";

  return {
    type: "error",
    error: {
      type,
      message,
    },
  };
}

export function geminiRequestToOpenAi(modelId: string, body: any, stream: boolean): any {
  const messages: any[] = [];

  const systemInstruction = body.systemInstruction || body.system_instruction;
  if (systemInstruction) {
    const parts = Array.isArray(systemInstruction?.parts)
      ? systemInstruction.parts
      : typeof systemInstruction === "string"
        ? [{ text: systemInstruction }]
        : [];
    const systemContent = geminiPartsToOpenAi(parts).content;
    if (systemContent !== "") {
      messages.push({ role: "system", content: systemContent });
    }
  }

  const contents = Array.isArray(body.contents)
    ? body.contents
    : typeof body.contents === "string"
      ? [{ role: "user", parts: [{ text: body.contents }] }]
      : body.contents
        ? [body.contents]
        : [];

  for (const rawContent of contents) {
    const role = rawContent?.role === "model" ? "assistant" : "user";
    const { content, toolCalls, toolResults } = geminiPartsToOpenAi(Array.isArray(rawContent?.parts) ? rawContent.parts : []);

    if (role === "assistant") {
      const assistantMessage: any = { role: "assistant", content };
      if (toolCalls.length > 0) assistantMessage.tool_calls = toolCalls;
      messages.push(assistantMessage);
    } else {
      if (content !== "") {
        messages.push({ role: "user", content });
      }
      for (const toolResult of toolResults) {
        messages.push({ role: "tool", ...toolResult });
      }
    }
  }

  const tools = Array.isArray(body.tools)
    ? body.tools.flatMap((tool: any) => {
        const declarations = tool.functionDeclarations || tool.function_declarations || [];
        return declarations.map((declaration: any) => ({
          type: "function",
          function: {
            name: declaration.name,
            description: declaration.description || "",
            parameters: declaration.parameters || { type: "object", properties: {} },
          },
        }));
      })
    : undefined;

  let toolChoice: any;
  const mode = body.toolConfig?.functionCallingConfig?.mode || body.tool_config?.function_calling_config?.mode;
  if (mode === "ANY") {
    toolChoice = "required";
  } else if (mode === "NONE") {
    toolChoice = "none";
  } else if (mode === "AUTO") {
    toolChoice = "auto";
  }

  const generationConfig = body.generationConfig || body.generation_config || {};
  const requestBody: any = {
    model: modelId,
    messages,
    stream,
  };

  if (generationConfig.temperature !== undefined) requestBody.temperature = generationConfig.temperature;
  if (generationConfig.topP !== undefined) requestBody.top_p = generationConfig.topP;
  if (generationConfig.maxOutputTokens !== undefined) requestBody.max_tokens = generationConfig.maxOutputTokens;
  if (Array.isArray(generationConfig.stopSequences) && generationConfig.stopSequences.length > 0) {
    requestBody.stop = generationConfig.stopSequences;
  }
  if (tools && tools.length > 0) requestBody.tools = tools;
  if (toolChoice) requestBody.tool_choice = toolChoice;

  return requestBody;
}

export function openAiResponseToGemini(data: any, fallbackModel: string): any {
  const message = data?.choices?.[0]?.message || {};
  const usage = data?.usage || {};
  const parts: any[] = [];

  if (typeof message.content === "string" && message.content.length > 0) {
    parts.push({ text: message.content });
  }

  for (const toolCall of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    let args = {};
    try {
      args = JSON.parse(toolCall?.function?.arguments || "{}");
    } catch {
      args = { raw_arguments: toolCall?.function?.arguments || "" };
    }
    parts.push({
      functionCall: {
        name: toolCall?.function?.name || "tool",
        args,
      },
    });
  }

  return {
    modelVersion: data?.model || fallbackModel,
    candidates: [
      {
        index: 0,
        content: {
          role: "model",
          parts,
        },
        finishReason: mapFinishReasonToGemini(data?.choices?.[0]?.finish_reason),
      },
    ],
    usageMetadata: {
      promptTokenCount: usage.prompt_tokens || 0,
      candidatesTokenCount: usage.completion_tokens || 0,
      totalTokenCount: usage.total_tokens || 0,
    },
  };
}

export function geminiErrorPayload(status: number, payload: any): any {
  const message = payload?.error?.message || payload?.message || "Request failed";
  return {
    error: {
      code: status,
      status: mapErrorStatus(status),
      message,
    },
  };
}
