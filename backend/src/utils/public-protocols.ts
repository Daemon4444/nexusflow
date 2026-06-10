import type { Request } from "express";

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function finalizeOpenAiContent(items: any[]): string | any[] {
  if (items.length === 0) return "";
  if (items.every((item) => item?.type === "text")) {
    return items.map((item) => item.text).join("\n");
  }
  return items;
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
      cachedContentTokenCount: usage.prompt_tokens_details?.cached_tokens || 0,
      promptTokenCount: usage.prompt_tokens || 0,
      candidatesTokenCount: usage.completion_tokens || 0,
      thoughtsTokenCount: usage.completion_tokens_details?.reasoning_tokens || 0,
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
