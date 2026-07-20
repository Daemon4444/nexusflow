import fs from "fs";
import path from "path";
import { models, AIModel } from "../src/data/models";
import { detectModelType } from "../src/services/adapters";
import { createApiKey, getAllKeys } from "../src/data/apikeys";
import { getSupportedProtocols } from "../src/utils/model-protocols";

type SmokeStatus = "passed" | "failed" | "skipped";

interface SmokeResult {
  name: string;
  status: SmokeStatus;
  durationMs: number;
  route?: string;
  model?: string;
  detail?: string;
  statusCode?: number;
}

interface RequestResult {
  ok: boolean;
  status: number;
  headers: Headers;
  text: string;
  json?: any;
}

const args = new Set(process.argv.slice(2));
const mediaMode = getArgValue("--media") || "sample";
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3001";
const reportPath = process.env.SMOKE_REPORT_PATH || path.join(process.cwd(), "reports", "smoke-latest.json");
const referenceImageUrl =
  process.env.SMOKE_REFERENCE_IMAGE_URL ||
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/512px-Example.jpg";
let apiKey = process.env.SMOKE_API_KEY || "";

let authHeaders = {
  Authorization: "",
  "Content-Type": "application/json",
};

function getArgValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

async function ensureApiKey(): Promise<string> {
  const existing = (await getAllKeys())[0];
  if (existing?.key) return existing.key;
  return (await createApiKey("smoke-script", 600)).key;
}

function nowMs(): number {
  return Date.now();
}

async function requestJson(route: string, init: RequestInit, timeoutMs = 120_000): Promise<RequestResult> {
  const response = await fetch(`${baseUrl}${route}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { ok: response.ok, status: response.status, headers: response.headers, text, json };
}

async function requestSse(route: string, body: unknown, timeoutMs = 120_000, headers: Record<string, string> = authHeaders): Promise<{ status: number; contentType: string | null; lines: string[]; }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const contentType = response.headers.get("content-type");
  const lines: string[] = [];
  const reader = response.body?.getReader();
  if (!reader) {
    return { status: response.status, contentType, lines };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      lines.push(line);
      if (line === "data: [DONE]") {
        return { status: response.status, contentType, lines };
      }
    }

    if (lines.length >= 12) break;
  }

  return { status: response.status, contentType, lines };
}

async function runTest(name: string, fn: () => Promise<Omit<SmokeResult, "name" | "durationMs">>): Promise<SmokeResult> {
  const started = nowMs();
  try {
    const result = await fn();
    const full: SmokeResult = {
      name,
      durationMs: nowMs() - started,
      ...result,
    };
    printResult(full);
    return full;
  } catch (error: any) {
    const failed: SmokeResult = {
      name,
      status: "failed",
      durationMs: nowMs() - started,
      detail: error?.message || String(error),
    };
    printResult(failed);
    return failed;
  }
}

function printResult(result: SmokeResult): void {
  const prefix = result.status === "passed" ? "PASS" : result.status === "failed" ? "FAIL" : "SKIP";
  const modelPart = result.model ? ` [${result.model}]` : "";
  const routePart = result.route ? ` ${result.route}` : "";
  const detailPart = result.detail ? ` :: ${result.detail}` : "";
  console.log(`${prefix} ${result.name}${modelPart}${routePart}${detailPart}`);
}

function chatModels(): AIModel[] {
  return models.filter((model) =>
    detectModelType(model.category) === "chat" &&
    getSupportedProtocols(model).includes("openai/chat-completions")
  );
}

function anthropicMessageModels(): AIModel[] {
  return models.filter((model) =>
    detectModelType(model.category) === "chat" &&
    getSupportedProtocols(model).includes("anthropic/messages")
  );
}

function embeddingModels(): AIModel[] {
  return models.filter((model) => detectModelType(model.category) === "embedding");
}

function imageModels(): AIModel[] {
  return models.filter((model) => detectModelType(model.category) === "image");
}

function videoModels(): AIModel[] {
  return models.filter((model) => detectModelType(model.category) === "video");
}

function requireJsonPath(result: RequestResult, pathName: string, value: unknown): string {
  if (value === undefined || value === null) {
    throw new Error(`${pathName} missing, status=${result.status}, body=${truncate(result.text)}`);
  }
  return pathName;
}

function truncate(text: string, length = 240): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length)}...`;
}

function pickModel(ids: string[], fallback: AIModel[]): AIModel {
  for (const id of ids) {
    const found = fallback.find((item) => item.id === id);
    if (found) return found;
  }
  return fallback[0];
}

async function smokeHealth(): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/api/health", { method: "GET" }, 10_000);
  if (!result.ok || result.json?.status !== "ok") {
    throw new Error(`health check failed: status=${result.status} body=${truncate(result.text)}`);
  }
  return { status: "passed", route: "/api/health", detail: result.json.timestamp };
}

async function smokeModelsList(): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/v1/models", { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } });
  if (!result.ok) {
    throw new Error(`models list failed: status=${result.status} body=${truncate(result.text)}`);
  }
  const ids = new Set((result.json?.data || []).map((item: any) => item.id));
  const missing = models.map((item) => item.id).filter((id) => !ids.has(id));
  if (missing.length > 0) {
    throw new Error(`missing ${missing.length} model ids, first=${missing[0]}`);
  }
  return { status: "passed", route: "/v1/models", detail: `${ids.size} models` };
}

async function smokeChatModel(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/v1/chat/completions", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: "user", content: "Reply with the exact text OK." }],
      temperature: 0,
      max_tokens: 16,
      top_p: 1,
    }),
  });

  if (!result.ok) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  const choice = result.json?.choices?.[0];
  requireJsonPath(result, "choices[0]", choice);
  const content = choice?.message?.content || choice?.message?.reasoning_content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error(`empty content, body=${truncate(result.text)}`);
  }

  return {
    status: "passed",
    route: "/v1/chat/completions",
    model: model.id,
    detail: `usage=${result.json?.usage?.total_tokens ?? "n/a"}`,
  };
}

async function smokeStreamModel(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestSse("/v1/chat/completions", {
    model: model.id,
    messages: [{ role: "user", content: "Reply with the exact text OK." }],
    stream: true,
    max_tokens: 16,
  });

  if (result.status !== 200) {
    throw new Error(`status=${result.status} lines=${truncate(result.lines.join("\n"))}`);
  }
  if (!result.contentType?.includes("text/event-stream")) {
    throw new Error(`unexpected content-type: ${result.contentType}`);
  }
  if (!result.lines.some((line) => line.startsWith("data: "))) {
    throw new Error("no SSE data lines received");
  }
  return {
    status: "passed",
    route: "/v1/chat/completions",
    model: model.id,
    detail: `${result.lines.length} sse lines`,
  };
}

async function smokeChatAdvancedParams(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/v1/chat/completions", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: "user", content: "只回复 JSON，字段 ok=true。" }],
      temperature: 0.2,
      max_tokens: 64,
      top_p: 0.9,
      stop: ["\n\n"],
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!result.ok) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  const content = result.json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.includes("\"ok\"")) {
    throw new Error(`unexpected json content, body=${truncate(result.text)}`);
  }

  return {
    status: "passed",
    route: "/v1/chat/completions",
    model: model.id,
    detail: "advanced params accepted",
  };
}

async function smokeToolCallingModel(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/v1/chat/completions", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: "user", content: "Use the tool if needed and respond briefly." }],
      max_tokens: 64,
      tools: [
        {
          type: "function",
          function: {
            name: "get_status",
            description: "Return current system status.",
            parameters: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: "auto",
    }),
  });

  if (!result.ok) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  const choice = result.json?.choices?.[0];
  requireJsonPath(result, "choices[0]", choice);
  return {
    status: "passed",
    route: "/v1/chat/completions",
    model: model.id,
    detail: "tools accepted",
  };
}

async function smokeAnthropicMessages(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.id,
      max_tokens: 64,
      messages: [{ role: "user", content: "Reply with the exact text OK." }],
    }),
  });

  if (!result.ok) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  const text = result.json?.content?.[0]?.text;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`anthropic text missing, body=${truncate(result.text)}`);
  }

  return {
    status: "passed",
    route: "/v1/messages",
    model: model.id,
    detail: `usage=${result.json?.usage?.input_tokens ?? "n/a"}/${result.json?.usage?.output_tokens ?? "n/a"}`,
  };
}

async function smokeAnthropicStream(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestSse("/v1/messages", {
    model: model.id,
    max_tokens: 64,
    stream: true,
    messages: [{ role: "user", content: "Reply with the exact text OK." }],
  }, 120_000, {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  });

  if (result.status !== 200) {
    throw new Error(`status=${result.status} lines=${truncate(result.lines.join("\n"))}`);
  }
  if (!result.lines.some((line) => line.startsWith("event: message_start"))) {
    throw new Error(`anthropic stream missing message_start: ${truncate(result.lines.join("\n"))}`);
  }

  return {
    status: "passed",
    route: "/v1/messages",
    model: model.id,
    detail: `${result.lines.length} stream lines`,
  };
}

async function smokeGeminiGenerateContent(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const route = `/v1beta/models/${encodeURIComponent(model.id)}:generateContent`;
  const result = await requestJson(route, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Reply with the exact text OK." }] }],
    }),
  });

  if (!result.ok) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  const text = result.json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`gemini text missing, body=${truncate(result.text)}`);
  }

  return {
    status: "passed",
    route,
    model: model.id,
    detail: `usage=${result.json?.usageMetadata?.totalTokenCount ?? "n/a"}`,
  };
}

async function smokeGeminiStream(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const route = `/v1beta/models/${encodeURIComponent(model.id)}:streamGenerateContent?alt=sse`;
  const result = await requestSse(route, {
    contents: [{ role: "user", parts: [{ text: "Reply with the exact text OK." }] }],
  }, 120_000, {
    "x-goog-api-key": apiKey,
    "Content-Type": "application/json",
  });

  if (result.status !== 200) {
    throw new Error(`status=${result.status} lines=${truncate(result.lines.join("\n"))}`);
  }
  if (!result.lines.some((line) => line.startsWith("data: "))) {
    throw new Error(`gemini stream missing data lines: ${truncate(result.lines.join("\n"))}`);
  }

  return {
    status: "passed",
    route,
    model: model.id,
    detail: `${result.lines.length} stream lines`,
  };
}

async function smokeEmbeddingModel(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/v1/embeddings", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: model.id,
      input: "nexusflow smoke embedding",
    }),
  });

  if (!result.ok) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  const embedding = result.json?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(`embedding missing, body=${truncate(result.text)}`);
  }

  return {
    status: "passed",
    route: "/v1/embeddings",
    model: model.id,
    detail: `dim=${embedding.length}`,
  };
}

async function smokeEmbeddingParams(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/v1/embeddings", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: model.id,
      input: ["hello", "world"],
      encoding_format: "float",
    }),
  });

  if (!result.ok) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  const rows = result.json?.data;
  if (!Array.isArray(rows) || rows.length !== 2) {
    throw new Error(`expected 2 embedding rows, body=${truncate(result.text)}`);
  }

  return {
    status: "passed",
    route: "/v1/embeddings",
    model: model.id,
    detail: "array input accepted",
  };
}

async function submitTask(body: Record<string, unknown>): Promise<RequestResult> {
  return requestJson("/v1/tasks", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(body),
  });
}

async function smokeTaskStatus(taskId: string): Promise<string> {
  const result = await requestJson(`/v1/tasks/${taskId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!result.ok) {
    throw new Error(`task poll failed: status=${result.status} body=${truncate(result.text)}`);
  }
  const status = result.json?.status;
  if (typeof status !== "string") {
    throw new Error(`task status missing: body=${truncate(result.text)}`);
  }
  return status;
}

async function smokeOpenAiImages(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/v1/images/generations", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: model.id,
      prompt: "a minimal blue geometric logo on white background",
      n: 1,
      size: "1024x1024",
    }),
  }, 180_000);

  if (!result.ok) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  const url = result.json?.data?.[0]?.url;
  if (typeof url !== "string" || !url.startsWith("http")) {
    throw new Error(`image url missing: body=${truncate(result.text)}`);
  }

  return {
    status: "passed",
    route: "/v1/images/generations",
    model: model.id,
    detail: "returned image url",
  };
}

async function smokeTaskImage(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await submitTask({
    model: model.id,
    prompt: "a minimalist product icon on white background",
    size: "1024x1024",
    n: 1,
  });

  if (result.status !== 202) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  const taskId = result.json?.id;
  if (typeof taskId !== "string") {
    throw new Error(`task id missing: body=${truncate(result.text)}`);
  }

  const taskStatus = await smokeTaskStatus(taskId);
  return {
    status: "passed",
    route: "/v1/tasks",
    model: model.id,
    detail: `task=${taskStatus}`,
  };
}

async function smokeVideoTask(model: AIModel, body: Record<string, unknown>): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await submitTask(body);
  if (result.status !== 202) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }
  const taskId = result.json?.id;
  if (typeof taskId !== "string") {
    throw new Error(`task id missing: body=${truncate(result.text)}`);
  }
  const taskStatus = await smokeTaskStatus(taskId);
  return {
    status: "passed",
    route: "/v1/tasks",
    model: model.id,
    detail: `task=${taskStatus}`,
  };
}

async function smokePlaygroundChat(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/api/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: "user", content: "Reply with the exact text OK." }],
      max_tokens: 16,
    }),
  });

  if (!result.ok || !result.json?.success) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  return {
    status: "passed",
    route: "/api/chat/completions",
    model: model.id,
    detail: "playground chat ok",
  };
}

async function smokePlaygroundImage(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/api/image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.id,
      prompt: "a simple blue square icon",
      size: "1024x1024",
      n: 1,
    }),
  });

  if (!result.ok || !result.json?.success) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  const taskId = result.json?.data?.task_id;
  if (typeof taskId !== "string") {
    throw new Error(`task id missing: body=${truncate(result.text)}`);
  }

  const status = await requestJson(`/api/image/status/${taskId}`, { method: "GET" });
  if (!status.ok || !status.json?.success) {
    throw new Error(`image status failed: status=${status.status} body=${truncate(status.text)}`);
  }

  return {
    status: "passed",
    route: "/api/image/generate",
    model: model.id,
    detail: `status=${status.json?.data?.task_status ?? "unknown"}`,
  };
}

async function smokePlaygroundVideo(model: AIModel): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson("/api/video/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.id,
      prompt: "a paper airplane flying in a blue sky",
      duration: 5,
      size: "1280*720",
    }),
  });

  if (!result.ok || !result.json?.success) {
    throw new Error(`status=${result.status} body=${truncate(result.text)}`);
  }

  const taskId = result.json?.data?.task_id;
  if (typeof taskId !== "string") {
    throw new Error(`task id missing: body=${truncate(result.text)}`);
  }

  const status = await requestJson(`/api/video/status/${taskId}`, { method: "GET" });
  if (!status.ok || !status.json?.success) {
    throw new Error(`video status failed: status=${status.status} body=${truncate(status.text)}`);
  }

  return {
    status: "passed",
    route: "/api/video/generate",
    model: model.id,
    detail: `status=${status.json?.data?.status ?? "unknown"}`,
  };
}

async function smokeContract(route: string, body: Record<string, unknown>, expectedStatus: number, expectedCode?: string): Promise<Omit<SmokeResult, "name" | "durationMs">> {
  const result = await requestJson(route, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(body),
  });

  if (result.status !== expectedStatus) {
    throw new Error(`expected ${expectedStatus}, got ${result.status}, body=${truncate(result.text)}`);
  }

  if (expectedCode && result.json?.error?.code !== expectedCode) {
    throw new Error(`expected code=${expectedCode}, got body=${truncate(result.text)}`);
  }

  return { status: "passed", route, detail: `status=${expectedStatus}` };
}

async function main(): Promise<void> {
  apiKey = apiKey || await ensureApiKey();
  authHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const results: SmokeResult[] = [];
  const chat = chatModels();
  const anthropicMessages = anthropicMessageModels();
  const embeddings = embeddingModels();
  const images = imageModels();
  const videos = videoModels();

  results.push(await runTest("health", smokeHealth));
  results.push(await runTest("models-list", smokeModelsList));

  const firstImage = pickModel(["wan2.6-t2i"], images);
  const firstChat = pickModel(["deepseek-v4-flash", "qwen3.5-plus", chat[0]?.id || ""], chat);
  const firstEmbedding = embeddings[0];
  const streamCandidates = [
    pickModel(["qwen3.5-plus"], chat),
    pickModel(["deepseek-v4-flash"], chat),
    pickModel(["glm-4.7", "qwen-plus"], chat),
  ].filter((model, index, array) => array.findIndex((item) => item.id === model.id) === index);

  const toolModels = chat
    .filter((model) => model.supported.includes("函数调用"))
    .slice(0, 3);

  results.push(await runTest("contract-chat-reject-image", () =>
    smokeContract("/v1/chat/completions", {
      model: firstImage.id,
      messages: [{ role: "user", content: "hello" }],
    }, 400, "unsupported_model")));

  results.push(await runTest("contract-tasks-reject-chat", () =>
    smokeContract("/v1/tasks", {
      model: firstChat.id,
      prompt: "hello",
    }, 400, "unsupported_model")));

  const firstClaude = pickModel(["claude-haiku-4-5", "claude-sonnet-4-6"], anthropicMessages.filter((model) => model.id.startsWith("claude-")));
  if (firstClaude) {
    results.push(await runTest("contract-claude-reject-openai-chat", () =>
      smokeContract("/v1/chat/completions", {
        model: firstClaude.id,
        messages: [{ role: "user", content: "hello" }],
      }, 400, "unsupported_protocol")));
  }

  if (firstEmbedding) {
    results.push(await runTest("contract-embeddings-reject-chat", () =>
      smokeContract("/v1/embeddings", {
        model: firstChat.id,
        input: "hello",
      }, 400, "unsupported_model")));
  }

  for (const model of chat) {
    results.push(await runTest(`chat-${model.id}`, () => smokeChatModel(model)));
  }

  for (const model of streamCandidates) {
    results.push(await runTest(`stream-${model.id}`, () => smokeStreamModel(model)));
  }

  for (const model of toolModels) {
    results.push(await runTest(`tools-${model.id}`, () => smokeToolCallingModel(model)));
  }

  if (firstChat) {
    results.push(await runTest(`chat-advanced-params-${firstChat.id}`, () => smokeChatAdvancedParams(firstChat)));
    results.push(await runTest(`anthropic-${firstChat.id}`, () => smokeAnthropicMessages(firstChat)));
    results.push(await runTest(`anthropic-stream-${firstChat.id}`, () => smokeAnthropicStream(firstChat)));
    results.push(await runTest(`gemini-${firstChat.id}`, () => smokeGeminiGenerateContent(firstChat)));
    results.push(await runTest(`gemini-stream-${firstChat.id}`, () => smokeGeminiStream(firstChat)));
  }

  for (const model of embeddings) {
    results.push(await runTest(`embedding-${model.id}`, () => smokeEmbeddingModel(model)));
  }

  if (firstEmbedding) {
    results.push(await runTest(`embedding-params-${firstEmbedding.id}`, () => smokeEmbeddingParams(firstEmbedding)));
  }

  if (mediaMode !== "none") {
    results.push(await runTest(`openai-image-${firstImage.id}`, () => smokeOpenAiImages(firstImage)));
    results.push(await runTest(`task-image-${firstImage.id}`, () => smokeTaskImage(firstImage)));
    const t2vModel = pickModel(["wan2.6-t2v"], videos);
    results.push(await runTest(`task-video-${t2vModel.id}`, () =>
      smokeVideoTask(t2vModel, {
        model: t2vModel.id,
        prompt: "a paper airplane flying across a blue sky",
        duration: 5,
        size: "1280*720",
      })));

    const i2vModel = pickModel(["wan2.6-i2v-flash", "wan2.6-i2v"], videos);
    results.push(await runTest(`task-video-${i2vModel.id}`, () =>
      smokeVideoTask(i2vModel, {
        model: i2vModel.id,
        prompt: "make the image gently pan and add subtle motion",
        duration: 5,
        img_url: referenceImageUrl,
        size: "1280*720",
      })));

    results.push(await runTest(`playground-chat-${firstChat.id}`, () => smokePlaygroundChat(firstChat)));
    results.push(await runTest(`playground-image-${firstImage.id}`, () => smokePlaygroundImage(firstImage)));
    results.push(await runTest(`playground-video-${t2vModel.id}`, () => smokePlaygroundVideo(t2vModel)));
  }

  if (mediaMode === "all") {
    for (const model of images.filter((item) => item.id !== firstImage.id)) {
      const body: Record<string, unknown> = {
        model: model.id,
        prompt: "a minimal product photo on white background",
        n: 1,
        size: "1024x1024",
      };

      results.push(await runTest(`task-image-all-${model.id}`, async () => {
        const result = await submitTask(body);
        if (result.status !== 202) {
          throw new Error(`status=${result.status} body=${truncate(result.text)}`);
        }
        return {
          status: "passed",
          route: "/v1/tasks",
          model: model.id,
          detail: "submitted",
        };
      }));
    }

    for (const model of videos) {
      const body: Record<string, unknown> = {
        model: model.id,
        prompt: "a paper airplane flying across a blue sky",
        duration: 5,
        size: "1280*720",
      };
      if (model.id.includes("-i2v") || model.id.includes("-r2v")) {
        body.img_url = referenceImageUrl;
      }
      results.push(await runTest(`task-video-all-${model.id}`, async () => {
        const result = await submitTask(body);
        if (result.status !== 202) {
          throw new Error(`status=${result.status} body=${truncate(result.text)}`);
        }
        return {
          status: "passed",
          route: "/v1/tasks",
          model: model.id,
          detail: "submitted",
        };
      }));
    }
  }

  const summary = {
    baseUrl,
    mediaMode,
    reportPath,
    total: results.length,
    passed: results.filter((item) => item.status === "passed").length,
    failed: results.filter((item) => item.status === "failed").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    failedItems: results.filter((item) => item.status === "failed"),
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ summary, results }, null, 2));

  console.log(`SUMMARY passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped} report=${reportPath}`);

  if (summary.failed > 0 && !args.has("--allow-fail")) {
    process.exitCode = 1;
  }
}

void main();
