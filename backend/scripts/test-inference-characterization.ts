/**
 * P2 characterization ("golden master") tests for the nine inference entry
 * routes: v1 (chat/embeddings), messages, responses, image, video, audio,
 * tasks, playground and upload.
 *
 * Each scenario runs against the real Express application (createApp) with
 * pg-mem, a private Redis (see the -isolated wrapper) and a fake upstream
 * installed through the test-only outbound transport. It records:
 *   - every upstream request: method, URL, headers (credentials redacted),
 *     body;
 *   - the client response: status, relevant headers, body (SSE parsed);
 *   - new usage_logs, billing_reservations and transactions rows, the balance
 *     delta, async_tasks rows and provider_health changes.
 * Volatile values (UUIDs, timestamps, latencies) are normalised.
 *
 * Usage:
 *   ts-node scripts/test-inference-characterization.ts            # compare
 *   ts-node scripts/test-inference-characterization.ts --update   # rewrite golden
 * The golden file was recorded on the pre-refactor code (d110f44 + ca95388
 * + P0/P1 of this branch, which do not touch request handling).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

process.env.USE_PG_MEM = "true";
process.env.NODE_ENV = "test";
delete process.env.NEXUSFLOW_ENV;
delete process.env.NEXUSFLOW_RELEASE_RUNTIME;
delete process.env.SLS_ACCESS_KEY_ID;
delete process.env.SLS_ACCESS_KEY_SECRET;
delete process.env.PROVIDER_SECRET_KEY;
delete process.env.DASHSCOPE_INTL_API_KEY;
delete process.env.DASHSCOPE_US_API_KEY;
delete process.env.DASHSCOPE_EU_API_KEY;
process.env.DASHSCOPE_API_KEY = "sk-upstream-dashscope-test";
process.env.ARK_API_KEY = "sk-upstream-ark-test";
process.env.PIXVERSE_API_KEY = "sk-upstream-pixverse-test";
process.env.UPLOAD_STORAGE = process.env.UPLOAD_STORAGE || "local";
process.env.PUBLIC_BODY_API_KEY_CONCURRENCY = "50";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require("../src/app") as typeof import("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db, closeDb } = require("../src/db/client") as typeof import("../src/db/client");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setOutboundTestTransport } = require("../src/services/outbound-url-policy") as typeof import("../src/services/outbound-url-policy");

const GOLDEN = path.resolve(__dirname, "fixtures/characterization/inference-golden.json");
const UPDATE = process.argv.includes("--update");
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);

// ----------------------------------------------------------------- upstream

type UpstreamReply =
  | { status: number; json: unknown; headers?: Record<string, string> }
  | { status: number; sse: string[]; headers?: Record<string, string> }
  | { status: number; text: string; headers?: Record<string, string> }
  | { throw: "timeout" | "network" };

interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

let upstreamQueue: UpstreamReply[] = [];
let recordedCalls: RecordedCall[] = [];

const SECRET_HEADERS = new Set(["authorization", "x-api-key", "api-key"]);

function normaliseHeaders(input: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const headers = new Headers(input || {});
  headers.forEach((value, key) => {
    if (SECRET_HEADERS.has(key.toLowerCase())) {
      // Keep which upstream credential was used without storing it.
      const digest = crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
      out[key.toLowerCase()] = `<secret:${digest}>`;
    } else {
      out[key.toLowerCase()] = value;
    }
  });
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

setOutboundTestTransport(async (url, init) => {
  let body: unknown = null;
  if (typeof init.body === "string") body = parseMaybeJson(init.body);
  else if (init.body instanceof URLSearchParams) body = init.body.toString();
  else if (init.body) body = `<${Object.prototype.toString.call(init.body)}>`;
  recordedCalls.push({
    method: String(init.method || "GET").toUpperCase(),
    url: url.href,
    headers: normaliseHeaders(init.headers),
    body,
  });
  const reply = upstreamQueue.shift();
  if (!reply) {
    return new Response(JSON.stringify({ error: { message: "no fake upstream reply queued" } }), { status: 599 });
  }
  if ("throw" in reply) {
    if (reply.throw === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
  }
  const headers = new Headers(reply.headers || {});
  if ("json" in reply) {
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify(reply.json), { status: reply.status, headers });
  }
  if ("sse" in reply) {
    headers.set("content-type", "text/event-stream");
    const chunks = reply.sse.map((line) => new TextEncoder().encode(line));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    return new Response(stream, { status: reply.status, headers });
  }
  return new Response(reply.text, { status: reply.status, headers });
});

// ------------------------------------------------------------ normalisation

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const VOLATILE_KEYS = /^(id|created|timestamp|latencyMs|createdAt|updatedAt)$|_(at|ms)$|^(log_id|request_id|reservation_id|ref_id|idempotency_key|user_id|api_key_id|billing_owner_id|actor_user_id|task_id|upstream_task_id|x-ratelimit-reset)$/;

function normalise(value: unknown, keyName = ""): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return "<date>";
  if (typeof value === "string") {
    if (VOLATILE_KEYS.test(keyName) && value) return `<${keyName}>`;
    return value.replace(UUID, "<uuid>").replace(ISO, "<iso>");
  }
  if (typeof value === "number") {
    if (VOLATILE_KEYS.test(keyName)) return `<${keyName}>`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => normalise(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = normalise((value as Record<string, unknown>)[key], key);
    }
    return out;
  }
  return value;
}

function normaliseUrl(url: string): string {
  return url.replace(UUID, "<uuid>").replace(/(task[-_]?id=|\/tasks\/)[A-Za-z0-9_-]+/g, "$1<task>");
}

// ---------------------------------------------------------------- fixtures

let userSeq = 0;
async function createCaller(options: { balance?: number; qpm?: number; tpm?: number } = {}) {
  userSeq += 1;
  const userId = `char-user-${userSeq}`;
  const apiKey = `sk-air-char-${String(userSeq).padStart(4, "0")}-${"0".repeat(28)}`;
  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const sessionToken = `sess-char-${userSeq}`;
  const sessionHash = crypto.createHash("sha256").update("nexusflow/session-token/v1\0").update(sessionToken).digest("hex");
  await db.execute(
    `INSERT INTO users (id, email, nickname, balance, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [userId, `${userId}@char.test`, userId, options.balance ?? 100]
  );
  await db.execute(
    `INSERT INTO api_keys (id, user_id, name, key, key_hash, created_at) VALUES (?, ?, 'char', ?, ?, NOW())`,
    [`char-key-${userSeq}`, userId, `sk-air-char-${userSeq}...masked`, keyHash]
  );
  await db.execute(
    `INSERT INTO sessions (id, user_id, token, token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, NOW(), NOW() + INTERVAL '1 day')`,
    [`char-session-${userSeq}`, userId, `session-hash-v1:char-session-${userSeq}`, sessionHash]
  );
  if (options.qpm !== undefined || options.tpm !== undefined) {
    await db.execute(
      `INSERT INTO user_rate_limits (id, user_id, model, qpm, tpm, source, created_at, updated_at)
       VALUES (?, ?, '*', ?, ?, 'admin', NOW(), NOW())`,
      [`char-limit-${userSeq}`, userId, options.qpm ?? 30000, options.tpm ?? 5_000_000]
    );
  }
  return { userId, apiKey, sessionToken, apiKeyId: `char-key-${userSeq}` };
}

async function limitRoute(modelId: string, limits: { rpm: number }) {
  await db.execute("UPDATE provider_capacity SET rpm_limit = ? WHERE model_id = ?", [limits.rpm, modelId]);
}

async function tableRows(table: string, where: string, params: unknown[]): Promise<unknown[]> {
  return db.queryMany<Record<string, unknown>>(`SELECT * FROM ${table} WHERE ${where}`, params);
}

// ----------------------------------------------------------------- requests

let baseUrl = "";

interface ClientRequest {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: Buffer;
}

async function send(request: ClientRequest) {
  const url = new URL(request.path, baseUrl);
  const bodyBytes = request.rawBody
    ?? (request.body === undefined ? undefined : Buffer.from(JSON.stringify(request.body)));
  const headers: Record<string, string> = { ...(request.headers || {}) };
  if (bodyBytes && !request.rawBody) headers["content-type"] = "application/json";
  if (bodyBytes) headers["content-length"] = String(bodyBytes.length);
  return new Promise<{ status: number; headers: Record<string, string>; body: unknown }>((resolve, reject) => {
    const req = http.request(url, { method: request.method || "POST", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const contentType = String(res.headers["content-type"] || "");
        let body: unknown = text;
        if (contentType.includes("text/event-stream")) {
          body = text.split("\n").filter((line) => line.trim()).map((line) => {
            const data = line.startsWith("data:") ? line.slice(5).trim() : null;
            return data && data !== "[DONE]" ? { [line.startsWith("data:") ? "data" : "line"]: parseMaybeJson(data) } : line;
          });
        } else if (contentType.includes("json")) {
          body = parseMaybeJson(text);
        } else if (text.length > 200) {
          body = `<${text.length} bytes>`;
        }
        const kept: Record<string, string> = {};
        for (const name of ["content-type", "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "x-ratelimit-scope", "cache-control"]) {
          const value = res.headers[name];
          if (value !== undefined) kept[name] = String(value);
        }
        resolve({ status: res.statusCode || 0, headers: kept, body });
      });
    });
    req.on("error", reject);
    if (bodyBytes) req.write(bodyBytes);
    req.end();
  });
}

// ---------------------------------------------------------------- scenarios

interface ScenarioContext {
  caller: Awaited<ReturnType<typeof createCaller>>;
  auth: Record<string, string>;
}

interface Scenario {
  name: string;
  caller?: Parameters<typeof createCaller>[0];
  setup?: () => Promise<void>;
  /** One or more requests executed in order; upstream replies are consumed from the queue. */
  requests: (ctx: ScenarioContext) => ClientRequest[];
  upstream: UpstreamReply[];
}

const chatUsage = { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19, prompt_tokens_details: { cached_tokens: 0 } };
const chatCompletion = (model: string) => ({
  id: "chatcmpl-upstream",
  object: "chat.completion",
  created: 1_790_000_000,
  model,
  choices: [{ index: 0, message: { role: "assistant", content: "hello from upstream" }, finish_reason: "stop" }],
  usage: chatUsage,
});
const chatSse = (model: string) => [
  `data: ${JSON.stringify({ id: "chatcmpl-up", object: "chat.completion.chunk", created: 1_790_000_000, model, choices: [{ index: 0, delta: { role: "assistant", content: "hel" } }] })}\n\n`,
  `data: ${JSON.stringify({ id: "chatcmpl-up", object: "chat.completion.chunk", created: 1_790_000_000, model, choices: [{ index: 0, delta: { content: "lo" }, finish_reason: "stop" }] })}\n\n`,
  `data: ${JSON.stringify({ id: "chatcmpl-up", object: "chat.completion.chunk", created: 1_790_000_000, model, choices: [], usage: chatUsage })}\n\n`,
  "data: [DONE]\n\n",
];
const anthropicMessage = (model: string) => ({
  id: "msg_upstream",
  type: "message",
  role: "assistant",
  model,
  content: [{ type: "text", text: "hello from anthropic upstream" }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 11, output_tokens: 6, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});
const anthropicSse = (model: string) => [
  `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg_up", type: "message", role: "assistant", model, content: [], usage: { input_tokens: 11, output_tokens: 0 } } })}\n\n`,
  `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
  `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } })}\n\n`,
  `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
  `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 6 } })}\n\n`,
  `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
];
const responsesBody = (model: string) => ({
  id: "resp_upstream",
  object: "response",
  created_at: 1_790_000_000,
  status: "completed",
  model,
  output: [{ type: "message", id: "msg_1", role: "assistant", content: [{ type: "output_text", text: "hello responses" }] }],
  usage: { input_tokens: 9, output_tokens: 5, total_tokens: 14, input_tokens_details: { cached_tokens: 0 } },
});
const responsesSse = (model: string) => [
  `event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: { id: "resp_up", model, status: "in_progress" } })}\n\n`,
  `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "hi" })}\n\n`,
  `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: responsesBody(model) })}\n\n`,
];
const upstreamError = (status: number, message: string) => ({ status, json: { error: { message, type: "invalid_request_error", code: "upstream_code" } } });

const CHAT = "qwen3.8-flash";
const RESPONSES_MODEL = "qwen3.8-flash";
const BRIDGE_MODEL = "MiniMax/MiniMax-M3";
const bearer = (ctx: ScenarioContext) => ({ authorization: `Bearer ${ctx.caller.apiKey}` });
const chatBody = (extra: Record<string, unknown> = {}) => ({ model: CHAT, messages: [{ role: "user", content: "hi" }], max_tokens: 64, ...extra });
const messagesBody = (model: string, extra: Record<string, unknown> = {}) => ({ model, max_tokens: 64, messages: [{ role: "user", content: "hi" }], ...extra });

const scenarios: Scenario[] = [
  // ---- v1 /chat/completions
  { name: "v1.chat.non_stream.success", requests: (ctx) => [{ path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody() }], upstream: [{ status: 200, json: chatCompletion(CHAT) }] },
  { name: "v1.chat.stream.success", requests: (ctx) => [{ path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody({ stream: true, stream_options: { include_usage: true } }) }], upstream: [{ status: 200, sse: chatSse(CHAT) }] },
  { name: "v1.chat.stream.truncated_without_usage", requests: (ctx) => [{ path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody({ stream: true }) }], upstream: [{ status: 200, sse: chatSse(CHAT).slice(0, 1) }] },
  { name: "v1.chat.upstream_400", requests: (ctx) => [{ path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody() }], upstream: [upstreamError(400, "bad parameter")] },
  { name: "v1.chat.upstream_500", requests: (ctx) => [{ path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody() }], upstream: [upstreamError(500, "internal")] },
  { name: "v1.chat.stream.upstream_500", requests: (ctx) => [{ path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody({ stream: true }) }], upstream: [upstreamError(500, "internal")] },
  { name: "v1.chat.upstream_timeout", requests: (ctx) => [{ path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody() }], upstream: [{ throw: "timeout" }] },
  { name: "v1.chat.insufficient_balance", caller: { balance: 0 }, requests: (ctx) => [{ path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody() }], upstream: [] },
  { name: "v1.chat.qpm_exceeded", caller: { qpm: 1 }, requests: (ctx) => [
    { path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody() },
    { path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody() },
  ], upstream: [{ status: 200, json: chatCompletion(CHAT) }] },
  { name: "v1.chat.invalid_key", requests: () => [{ path: "/v1/chat/completions", headers: { authorization: "Bearer sk-air-invalid" }, body: chatBody() }], upstream: [] },
  { name: "v1.chat.unknown_model", requests: (ctx) => [{ path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody({ model: "no-such-model" }) }], upstream: [] },
  { name: "v1.chat.managed_capacity_exhausted", setup: () => limitRoute("qwen3.7-flash", { rpm: 1 }), requests: (ctx) => [
    { path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody({ model: "qwen3.7-flash" }) },
    { path: "/v1/chat/completions", headers: bearer(ctx), body: chatBody({ model: "qwen3.7-flash" }) },
  ], upstream: [{ status: 200, json: chatCompletion("qwen3.7-flash") }] },
  // ---- v1 /embeddings
  { name: "v1.embeddings.success", requests: (ctx) => [{ path: "/v1/embeddings", headers: bearer(ctx), body: { model: "text-embedding-v4", input: "hello" } }], upstream: [{ status: 200, json: { object: "list", data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }], model: "text-embedding-v4", usage: { prompt_tokens: 3, total_tokens: 3 } } }] },
  { name: "v1.embeddings.upstream_500", requests: (ctx) => [{ path: "/v1/embeddings", headers: bearer(ctx), body: { model: "text-embedding-v4", input: "hello" } }], upstream: [upstreamError(500, "internal")] },
  // ---- /v1/messages
  { name: "messages.passthrough.non_stream.success", requests: (ctx) => [{ path: "/v1/messages", headers: { "x-api-key": ctx.caller.apiKey, "anthropic-version": "2023-06-01" }, body: messagesBody(CHAT) }], upstream: [{ status: 200, json: anthropicMessage(CHAT) }] },
  { name: "messages.passthrough.stream.success", requests: (ctx) => [{ path: "/v1/messages", headers: { "x-api-key": ctx.caller.apiKey }, body: messagesBody(CHAT, { stream: true }) }], upstream: [{ status: 200, sse: anthropicSse(CHAT) }] },
  { name: "messages.passthrough.upstream_400", requests: (ctx) => [{ path: "/v1/messages", headers: { "x-api-key": ctx.caller.apiKey }, body: messagesBody(CHAT) }], upstream: [{ status: 400, json: { type: "error", error: { type: "invalid_request_error", message: "bad" } } }] },
  { name: "messages.passthrough.upstream_500", requests: (ctx) => [{ path: "/v1/messages", headers: { "x-api-key": ctx.caller.apiKey }, body: messagesBody(CHAT) }], upstream: [{ status: 500, json: { type: "error", error: { type: "api_error", message: "internal" } } }] },
  { name: "messages.passthrough.timeout", requests: (ctx) => [{ path: "/v1/messages", headers: { "x-api-key": ctx.caller.apiKey }, body: messagesBody(CHAT) }], upstream: [{ throw: "timeout" }] },
  { name: "messages.bridge.non_stream.success", requests: (ctx) => [{ path: "/v1/messages", headers: { "x-api-key": ctx.caller.apiKey }, body: messagesBody(BRIDGE_MODEL) }], upstream: [{ status: 200, json: chatCompletion(BRIDGE_MODEL) }] },
  { name: "messages.bridge.stream.success", requests: (ctx) => [{ path: "/v1/messages", headers: { "x-api-key": ctx.caller.apiKey }, body: messagesBody(BRIDGE_MODEL, { stream: true }) }], upstream: [{ status: 200, sse: chatSse(BRIDGE_MODEL) }] },
  { name: "messages.insufficient_balance", caller: { balance: 0 }, requests: (ctx) => [{ path: "/v1/messages", headers: { "x-api-key": ctx.caller.apiKey }, body: messagesBody(CHAT) }], upstream: [] },
  { name: "messages.qpm_exceeded", caller: { qpm: 1 }, requests: (ctx) => [
    { path: "/v1/messages", headers: { "x-api-key": ctx.caller.apiKey }, body: messagesBody(CHAT) },
    { path: "/v1/messages", headers: { "x-api-key": ctx.caller.apiKey }, body: messagesBody(CHAT) },
  ], upstream: [{ status: 200, json: anthropicMessage(CHAT) }] },
  // ---- /v1/responses
  { name: "responses.non_stream.success", requests: (ctx) => [{ path: "/v1/responses", headers: bearer(ctx), body: { model: RESPONSES_MODEL, input: "hi", max_output_tokens: 64 } }], upstream: [{ status: 200, json: responsesBody(RESPONSES_MODEL) }] },
  { name: "responses.stream.success", requests: (ctx) => [{ path: "/v1/responses", headers: bearer(ctx), body: { model: RESPONSES_MODEL, input: "hi", stream: true } }], upstream: [{ status: 200, sse: responsesSse(RESPONSES_MODEL) }] },
  { name: "responses.upstream_400", requests: (ctx) => [{ path: "/v1/responses", headers: bearer(ctx), body: { model: RESPONSES_MODEL, input: "hi" } }], upstream: [upstreamError(400, "bad")] },
  { name: "responses.upstream_500", requests: (ctx) => [{ path: "/v1/responses", headers: bearer(ctx), body: { model: RESPONSES_MODEL, input: "hi" } }], upstream: [upstreamError(500, "internal")] },
  { name: "responses.timeout", requests: (ctx) => [{ path: "/v1/responses", headers: bearer(ctx), body: { model: RESPONSES_MODEL, input: "hi" } }], upstream: [{ throw: "timeout" }] },
  { name: "responses.insufficient_balance", caller: { balance: 0 }, requests: (ctx) => [{ path: "/v1/responses", headers: bearer(ctx), body: { model: RESPONSES_MODEL, input: "hi" } }], upstream: [] },
  // ---- /api/image
  { name: "image.generate.success", requests: (ctx) => [{ path: "/api/image/generate", headers: bearer(ctx), body: { model: "wan2.7-image", prompt: "a cat", size: "1024*1024" } }], upstream: [{ status: 200, json: { request_id: "up-req", output: { task_id: "up-task-1", task_status: "PENDING" } } }] },
  { name: "image.generate.upstream_500", requests: (ctx) => [{ path: "/api/image/generate", headers: bearer(ctx), body: { model: "wan2.7-image", prompt: "a cat" } }], upstream: [{ status: 500, json: { code: "InternalError", message: "boom" } }] },
  { name: "image.generate.insufficient_balance", caller: { balance: 0 }, requests: (ctx) => [{ path: "/api/image/generate", headers: bearer(ctx), body: { model: "wan2.7-image", prompt: "a cat" } }], upstream: [] },
  // ---- /v1/videos
  { name: "video.generate.success", requests: (ctx) => [{ path: "/v1/videos/generations", headers: bearer(ctx), body: { model: "wan2.7-t2v", prompt: "a cat", duration: 5, size: "1280*720" } }], upstream: [{ status: 200, json: { request_id: "up-req", output: { task_id: "up-video-1", task_status: "PENDING" } } }] },
  { name: "video.generate.upstream_400", requests: (ctx) => [{ path: "/v1/videos/generations", headers: bearer(ctx), body: { model: "wan2.7-t2v", prompt: "a cat", duration: 5, size: "1280*720" } }], upstream: [{ status: 400, json: { code: "InvalidParameter", message: "bad" } }] },
  // ---- /v1/audio
  { name: "audio.speech.success", requests: (ctx) => [{ path: "/v1/audio/speech", headers: bearer(ctx), body: { model: "qwen3-tts-flash", input: "你好", voice: "Cherry" } }], upstream: [{ status: 200, json: { request_id: "up", output: { audio: { url: "https://dashscope-result.oss-cn-beijing.aliyuncs.com/a.wav", id: "a" }, finish_reason: "stop" }, usage: { characters: 2 } } }, { status: 200, text: "RIFFfakewav", headers: { "content-type": "audio/wav" } }] },
  { name: "audio.speech.upstream_500", requests: (ctx) => [{ path: "/v1/audio/speech", headers: bearer(ctx), body: { model: "qwen3-tts-flash", input: "你好", voice: "Cherry" } }], upstream: [{ status: 500, json: { code: "InternalError", message: "boom" } }] },
  // ---- /v1/tasks
  { name: "tasks.create.success", requests: (ctx) => [{ path: "/v1/tasks", headers: bearer(ctx), body: { model: "wan2.7-t2v", input: { prompt: "a cat" }, parameters: { duration: 5, size: "1280*720" } } }], upstream: [{ status: 200, json: { request_id: "up-req", output: { task_id: "up-task-2", task_status: "PENDING" } } }] },
  { name: "tasks.create.upstream_500", requests: (ctx) => [{ path: "/v1/tasks", headers: bearer(ctx), body: { model: "wan2.7-t2v", input: { prompt: "a cat" }, parameters: { duration: 5, size: "1280*720" } } }], upstream: [{ status: 500, json: { code: "InternalError", message: "boom" } }] },
  { name: "tasks.list.success", requests: (ctx) => [{ method: "GET", path: "/v1/tasks", headers: bearer(ctx) }], upstream: [] },
  // ---- /api/playground
  { name: "playground.non_stream.success", requests: (ctx) => [{ path: "/api/playground/chat/completions", headers: { authorization: `Bearer ${ctx.caller.sessionToken}` }, body: chatBody() }], upstream: [{ status: 200, json: chatCompletion(CHAT) }] },
  { name: "playground.stream.success", requests: (ctx) => [{ path: "/api/playground/chat/completions", headers: { authorization: `Bearer ${ctx.caller.sessionToken}` }, body: chatBody({ stream: true }) }], upstream: [{ status: 200, sse: chatSse(CHAT) }] },
  { name: "playground.upstream_500", requests: (ctx) => [{ path: "/api/playground/chat/completions", headers: { authorization: `Bearer ${ctx.caller.sessionToken}` }, body: chatBody() }], upstream: [upstreamError(500, "internal")] },
  { name: "playground.no_session", requests: () => [{ path: "/api/playground/chat/completions", headers: {}, body: chatBody() }], upstream: [] },
  // ---- /api/upload
  { name: "upload.unauthenticated", requests: () => [{ path: "/api/upload", headers: {}, body: {} }], upstream: [] },
];

// ---------------------------------------------------------------- execution

async function runScenario(scenario: Scenario) {
  const caller = await createCaller(scenario.caller);
  const ctx: ScenarioContext = { caller, auth: { authorization: `Bearer ${caller.apiKey}` } };
  if (scenario.setup) await scenario.setup();
  upstreamQueue = [...scenario.upstream];
  recordedCalls = [];
  // Each scenario starts with a closed circuit so results do not depend on
  // the order in which failure scenarios ran.
  await db.execute("DELETE FROM provider_health");
  const responses = [];
  for (const request of scenario.requests(ctx)) {
    responses.push(await send(request));
    // Let fire-and-forget accounting finish before the next request.
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  const balance = await db.queryOne<{ balance: string | number }>("SELECT balance FROM users WHERE id = ?", [caller.userId]);
  const health = await db.queryMany("SELECT provider_id, model_id, status, consecutive_failures FROM provider_health ORDER BY provider_id, model_id");
  return normalise({
    upstreamCalls: recordedCalls.map((call) => ({ ...call, url: normaliseUrl(call.url) })),
    unusedUpstreamReplies: upstreamQueue.length,
    responses,
    usageLogs: await tableRows("usage_logs", "user_id = ? ORDER BY id", [caller.userId]),
    reservations: await tableRows("billing_reservations", "user_id = ? ORDER BY created_at, id", [caller.userId]),
    transactions: await tableRows("transactions", "user_id = ? ORDER BY created_at, id", [caller.userId]),
    asyncTasks: await tableRows("async_tasks", "user_id = ? ORDER BY created_at", [caller.userId]),
    balanceDelta: Math.round((Number(balance?.balance ?? 0) - (scenario.caller?.balance ?? 100)) * 1_000_000) / 1_000_000,
    providerHealth: health,
  });
}

async function main(): Promise<void> {
  // Production boots with ensureRoutingDefaults(): every catalog model gets a
  // managed provider_capacity route. Mirror that so routing is realistic.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ensureRoutingDefaults } = require("../src/services/providers") as typeof import("../src/services/providers");
  await ensureRoutingDefaults();
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no server address");
  baseUrl = `http://127.0.0.1:${address.port}`;

  const results: Record<string, unknown> = {};
  try {
    for (const scenario of scenarios) {
      if (ONLY && !scenario.name.includes(ONLY)) continue;
      results[scenario.name] = await runScenario(scenario);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    setOutboundTestTransport(null);
  }

  if (UPDATE) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    const existing = ONLY && fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, "utf8")) : {};
    fs.writeFileSync(GOLDEN, `${JSON.stringify({ ...existing, ...results }, null, 1)}\n`);
    console.log(`wrote ${Object.keys(results).length} scenario(s) to ${path.relative(process.cwd(), GOLDEN)}`);
    return;
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8")) as Record<string, unknown>;
  let failures = 0;
  for (const [name, actual] of Object.entries(results)) {
    try {
      assert.deepEqual(actual, golden[name], `scenario ${name} differs from the golden result`);
      console.log(`ok - ${name}`);
    } catch (error) {
      failures += 1;
      console.log(`not ok - ${name}`);
      console.log(error instanceof Error ? error.message.slice(0, 4000) : String(error));
    }
  }
  if (!ONLY) {
    const missing = Object.keys(golden).filter((name) => !(name in results));
    if (missing.length) {
      failures += missing.length;
      console.log(`not ok - golden scenarios not executed: ${missing.join(", ")}`);
    }
  }
  if (failures) throw new Error(`${failures} characterization scenario(s) changed`);
  console.log(`inference characterization passed (${Object.keys(results).length} scenarios)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { closeRedis } = require("../src/services/redis") as typeof import("../src/services/redis");
      await closeRedis();
    } catch {
      // ignore
    }
    setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
  });
