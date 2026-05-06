import { Router, Request, Response as ExpressResponse } from "express";
import {
  buildLocalOpenAiBase,
  extractPublicApiKey,
  geminiErrorPayload,
  geminiRequestToOpenAi,
  openAiResponseToGemini,
} from "../utils/public-protocols";

const router = Router();
const localOpenAiBase = buildLocalOpenAiBase();

function parseJsonText(text: string): any {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return { message: text };
  }
}

function mappedToolInput(rawArguments: string): any {
  try {
    return JSON.parse(rawArguments || "{}");
  } catch {
    return { raw_arguments: rawArguments || "" };
  }
}

async function forwardToOpenAi(token: string, body: any): Promise<globalThis.Response> {
  return fetch(`${localOpenAiBase}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
}

async function streamOpenAiToGemini(response: globalThis.Response, res: ExpressResponse, modelId: string): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    res.status(500).json(geminiErrorPayload(500, { message: "Missing stream body" }));
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const decoder = new TextDecoder();
  let buffer = "";
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let finishReason = "stop";
  const toolBuffers = new Map<number, { id: string; name: string; arguments: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n")) {
      const lineEnd = buffer.indexOf("\n");
      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);

      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;

      const json = parseJsonText(line.slice(6));
      if (json?.usage) {
        usage = json.usage;
      }

      const choice = json?.choices?.[0];
      const delta = choice?.delta;
      if (!delta) continue;

      if (typeof delta.content === "string" && delta.content.length > 0) {
        res.write(`data: ${JSON.stringify({
          candidates: [
            {
              index: 0,
              content: {
                role: "model",
                parts: [{ text: delta.content }],
              },
            },
          ],
          modelVersion: modelId,
        })}\n\n`);
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const toolDelta of delta.tool_calls) {
          const toolIndex = toolDelta.index ?? 0;
          const current = toolBuffers.get(toolIndex) || { id: "", name: "", arguments: "" };
          if (toolDelta.id) current.id = toolDelta.id;
          if (toolDelta.function?.name) current.name = toolDelta.function.name;
          if (toolDelta.function?.arguments) current.arguments += toolDelta.function.arguments;
          toolBuffers.set(toolIndex, current);
        }
      }

      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }
  }

  for (const tool of [...toolBuffers.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value)) {
    res.write(`data: ${JSON.stringify({
      candidates: [
        {
          index: 0,
          content: {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: tool.name || "tool",
                  args: mappedToolInput(tool.arguments),
                },
              },
            ],
          },
        },
      ],
      modelVersion: modelId,
    })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({
    candidates: [
      {
        index: 0,
        finishReason: finishReason === "length" ? "MAX_TOKENS" : "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: usage.prompt_tokens || 0,
      candidatesTokenCount: usage.completion_tokens || 0,
      totalTokenCount: usage.total_tokens || 0,
    },
    modelVersion: modelId,
  })}\n\n`);

  res.end();
}

router.post("/v1beta/models/:modelAndAction", async (req: Request, res: ExpressResponse) => {
  const token = extractPublicApiKey(req);
  if (!token) {
    res.status(401).json(geminiErrorPayload(401, { message: "Missing API key" }));
    return;
  }

  const modelAndAction = String(req.params.modelAndAction || "");
  const match = /^([^:]+):(generateContent|streamGenerateContent)$/.exec(modelAndAction);
  if (!match) {
    res.status(404).json(geminiErrorPayload(404, { message: "Unsupported Gemini endpoint" }));
    return;
  }

  const [, modelId, action] = match;
  const isStream = action === "streamGenerateContent";
  const openAiBody = geminiRequestToOpenAi(modelId, req.body, isStream);
  const response = await forwardToOpenAi(token, openAiBody);

  if (!response.ok) {
    const payload = parseJsonText(await response.text());
    res.status(response.status).json(geminiErrorPayload(response.status, payload));
    return;
  }

  if (isStream) {
    await streamOpenAiToGemini(response, res, modelId);
    return;
  }

  const payload = parseJsonText(await response.text());
  res.json(openAiResponseToGemini(payload, modelId));
});

export default router;
