/**
 * Real-time speech recognition over WebSocket.
 *
 *   wss://<host>/api-ws/v1/inference            (DashScope-compatible path)
 *   wss://<host>/v1/audio/transcriptions/stream (alias)
 *
 * The wire protocol is DashScope's run-task / task-started / binary audio /
 * result-generated / finish-task / task-finished exchange, so a client only
 * swaps the base URL and API key. The gateway authenticates the key, applies
 * the account QPM and model access rules, holds a balance reservation, relays
 * frames to the Bailian qwen-audio-3.1-asr-flash-streaming endpoint with the
 * platform's upstream key, and settles the bill from the cumulative token
 * usage the upstream reports (also when the client leaves mid-stream).
 */
import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";
import { randomUUID } from "crypto";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import type { Request, Response } from "express";
import { validateApiKey, type ValidApiKey } from "../data/apikeys";
import { logUpstreamFailure, logUsage } from "../data/usage";
import { settleReservation } from "../data/billing";
import { applyUserModelDiscount } from "../data/user-discounts";
import { checkRPMFailClosed } from "../services/rate-limiter";
import { upstreamErrorBody } from "../services/upstream";
import { parseAndValidateOutboundUrl } from "../services/outbound-url-policy";
import {
  AudioPricingUnavailableError,
  QWEN_AUDIO_31_ASR_STREAMING_ID,
  calculateTokenAsrCost,
  qwenAudio31AsrStreamingPrices,
} from "../services/audio-pricing";
import { InferenceContext } from "../pipeline/context";
import {
  bearerToken,
  checkModelAccess,
  release,
  reserveBilling,
  reserveProviderCapacity,
  reserveQpm,
  resolveModel,
  selectRoute,
  useApiKeyCaller,
} from "../pipeline/stages";

export const ASR_STREAM_PATHS = new Set(["/api-ws/v1/inference", "/v1/audio/transcriptions/stream"]);

const FIRST_MESSAGE_TIMEOUT_MS = 10_000;
const CLIENT_IDLE_TIMEOUT_MS = 60_000;
const MAX_SESSION_MS = 30 * 60_000;
const PING_INTERVAL_MS = 20_000;
const MAX_CLIENT_FRAME_BYTES = 1 << 20;
const MAX_QUEUED_BYTES = 4 << 20;
const MAX_CONNECTIONS_PER_USER = 100;
const MAX_CONNECTIONS_TOTAL = 2_000;
// Upper bound of one session's spend: ~5 minutes of audio (≈45 input tokens/s,
// ≈5 output tokens/s at the listed price). Reached → the task is ended cleanly
// and the client reconnects to continue.
const SESSION_BUDGET_INPUT_TOKENS = 13_500;
const SESSION_BUDGET_OUTPUT_TOKENS = 1_500;
const CAPACITY_ESTIMATE_TOKENS = 2_000;
const PROTOCOL = "dashscope-asr-websocket";

type Usage = { input_tokens: number; output_tokens: number; duration: number };
type Caller = ValidApiKey & { user_id: string };

/** Test seam: replaces the connection to the Bailian WebSocket endpoint. */
export type UpstreamSocketFactory = (url: string, headers: Record<string, string>) => WebSocket;
let upstreamFactory: UpstreamSocketFactory = (url, headers) => new WebSocket(url, { headers, handshakeTimeout: 10_000, maxPayload: 16 << 20 });
export function setAsrStreamUpstreamFactory(factory: UpstreamSocketFactory | null): void {
  upstreamFactory = factory ?? ((url, headers) => new WebSocket(url, { headers, handshakeTimeout: 10_000, maxPayload: 16 << 20 }));
}

const perUser = new Map<string, number>();
let total = 0;

function rejectUpgrade(socket: Duplex, status: number, code: string, message: string): void {
  const body = JSON.stringify({ error: { message, type: status === 429 ? "rate_limit_error" : "invalid_request_error", code } });
  const reason = status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : status === 429 ? "Too Many Requests" : status === 503 ? "Service Unavailable" : "Not Found";
  socket.write(
    `HTTP/1.1 ${status} ${reason}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
  );
  socket.destroy();
}

function taskFailed(taskId: string, code: string, message: string): string {
  return JSON.stringify({
    header: { task_id: taskId, event: "task-failed", error_code: code, error_message: message, attributes: {} },
    payload: {},
  });
}

function toText(data: RawData): string {
  return Array.isArray(data) ? Buffer.concat(data).toString() : Buffer.from(data as Buffer).toString();
}

function upstreamWsUrl(nativeBaseUrl: string): string {
  const base = nativeBaseUrl.replace(/\/$/, "").replace(/\/api\/v1$/, "");
  return `${base.replace(/^http/, "ws")}/api-ws/v1/inference`;
}

function readUsage(message: any): Usage | null {
  const usage = message?.payload?.usage;
  if (!usage) return null;
  const input = Number(usage.input_tokens);
  const output = Number(usage.output_tokens ?? 0);
  if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0) return null;
  return { input_tokens: input, output_tokens: output, duration: Number(usage.duration) || 0 };
}

export function attachAsrStreamServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_FRAME_BYTES });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname = "";
    try {
      pathname = new URL(req.url || "/", "http://gateway").pathname;
    } catch {
      /* fall through */
    }
    if (!ASR_STREAM_PATHS.has(pathname)) {
      rejectUpgrade(socket, 404, "not_found", "WebSocket is not available on this path.");
      return;
    }
    void admit(req, socket, head).catch((error) => {
      console.error("[ASR stream] admission error:", error);
      if (!socket.destroyed) rejectUpgrade(socket, 503, "internal_error", "WebSocket admission failed.");
    });
  });

  async function admit(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const token = bearerToken(req as unknown as Request);
    const record = token ? await validateApiKey(token) : null;
    if (!record) return rejectUpgrade(socket, 401, "invalid_api_key", "Invalid API key provided.");
    if (!record.user_id) return rejectUpgrade(socket, 403, "anonymous_key_not_allowed", "This API key is not associated with a user account.");
    const caller = record as Caller;
    if (caller.rate_limit_override != null) {
      const keyRate = await checkRPMFailClosed(`consumer:${caller.id}`, caller.rate_limit_override);
      if (!keyRate.available) return rejectUpgrade(socket, 503, "rate_limit_unavailable", "Request admission control is temporarily unavailable.");
      if (!keyRate.allowed) return rejectUpgrade(socket, 429, "rate_limit_exceeded", `API key RPM limit exceeded (${caller.rate_limit_override}/min).`);
    }
    if (total >= MAX_CONNECTIONS_TOTAL || (perUser.get(caller.user_id) || 0) >= MAX_CONNECTIONS_PER_USER) {
      return rejectUpgrade(socket, 429, "too_many_connections", "Too many concurrent WebSocket connections.");
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      total += 1;
      perUser.set(caller.user_id, (perUser.get(caller.user_id) || 0) + 1);
      ws.once("close", () => {
        total -= 1;
        const left = (perUser.get(caller.user_id) || 1) - 1;
        if (left > 0) perUser.set(caller.user_id, left);
        else perUser.delete(caller.user_id);
      });
      void runSession(ws, req, caller).catch((error) => {
        console.error("[ASR stream] session error:", error);
        try {
          ws.send(taskFailed("", "InternalError", "Internal server error."));
        } catch { /* closed */ }
        ws.close(1011);
      });
    });
  }

  return wss;
}

async function runSession(client: WebSocket, req: IncomingMessage, caller: Caller): Promise<void> {
  const ctx = new InferenceContext("audio.stream", req as unknown as Request, {} as unknown as Response);
  const startTime = ctx.startTime;
  let taskId = "";
  let settled = false;
  let finished = false;
  let usage: Usage | null = null;
  let upstream: WebSocket | null = null;
  let upstreamStarted = false;
  let failure: { code: string; httpStatus?: number; reason: string } | null = null;
  const queue: Array<{ data: Buffer; binary: boolean }> = [];
  let queuedBytes = 0;
  const timers: NodeJS.Timeout[] = [];
  let idle: NodeJS.Timeout | null = null;
  let prices = { input: 0, output: 0 };
  let budgetCost = 0;

  const send = (text: string) => {
    if (client.readyState === WebSocket.OPEN) client.send(text);
  };
  const fail = (code: string, message: string, closeCode = 1011) => {
    send(taskFailed(taskId, code, message));
    failure ??= { code: code.toLowerCase(), reason: message };
    finish(closeCode);
  };

  const touch = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => fail("IdleTimeout", "No data received from the client for 60 seconds.", 1001), CLIENT_IDLE_TIMEOUT_MS);
  };

  async function settle(): Promise<void> {
    if (settled) return;
    settled = true;
    try {
      const reservation = ctx.billingReservation;
      if (reservation && usage && usage.input_tokens > 0) {
        const cost = calculateTokenAsrCost(usage.input_tokens, usage.output_tokens, prices);
        const { finalAmount } = await applyUserModelDiscount(caller.user_id, ctx.modelId, cost);
        const transaction = await settleReservation(
          reservation.id,
          finalAmount,
          `ASR stream: ${ctx.modelId} (${usage.input_tokens} in / ${usage.output_tokens} out tokens)`
        );
        if (finalAmount > 0 && !transaction) throw new Error("ASR stream billing settlement did not create a transaction");
        const upstreamInfo = ctx.requireUpstream();
        const totalTokens = usage.input_tokens + usage.output_tokens;
        await logUsage({
          region: upstreamInfo.region,
          providerId: upstreamInfo.providerId,
          channelId: upstreamInfo.channelId,
          protocol: PROTOCOL,
          apiKeyId: caller.id,
          userId: caller.user_id,
          model: ctx.modelId,
          promptTokens: usage.input_tokens,
          completionTokens: usage.output_tokens,
          totalTokens,
          cost: finalAmount,
          status: "success",
          latencyMs: Date.now() - startTime,
          providerUnits: usage.duration,
          reservationId: reservation.id,
          transactionId: transaction?.id || null,
        });
        ctx.actualProviderTokens = totalTokens;
        ctx.billableResponseReceived = true;
      } else if (reservation && failure && ctx.upstream) {
        await logUpstreamFailure({
          apiKeyId: caller.id,
          userId: caller.user_id,
          model: ctx.modelId,
          providerId: ctx.upstream.providerId,
          channelId: ctx.upstream.channelId,
          region: ctx.upstream.region,
          protocol: PROTOCOL,
          latencyMs: Date.now() - startTime,
          httpStatus: failure.httpStatus,
          errorCode: failure.code,
          errorReason: failure.reason,
          reservationId: reservation.id,
        });
      }
    } catch (error) {
      console.error("[ASR stream] settlement error:", error);
    } finally {
      await release(ctx, { reconcileTokens: false }).catch(() => undefined);
    }
  }

  function finish(closeCode = 1000): void {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    if (idle) clearTimeout(idle);
    try {
      if (upstream && upstream.readyState <= WebSocket.OPEN) upstream.close();
    } catch { /* ignore */ }
    void settle().finally(() => {
      try {
        if (client.readyState <= WebSocket.OPEN) client.close(closeCode);
      } catch { /* ignore */ }
    });
  }

  // ---- first frame: run-task
  const first = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), FIRST_MESSAGE_TIMEOUT_MS);
    client.once("message", (data, isBinary) => {
      clearTimeout(timer);
      resolve(isBinary ? "" : toText(data));
    });
    client.once("close", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
  if (first === null) {
    if (client.readyState === WebSocket.OPEN) fail("InvalidParameter", "Send a run-task message within 10 seconds of connecting.", 1008);
    return;
  }
  let runTask: any;
  try {
    runTask = JSON.parse(first);
  } catch {
    runTask = null;
  }
  taskId = typeof runTask?.header?.task_id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(runTask.header.task_id) ? runTask.header.task_id : randomUUID();
  if (runTask?.header?.action !== "run-task" || typeof runTask?.payload?.model !== "string") {
    return fail("InvalidParameter", "The first message must be a run-task command with payload.model.", 1008);
  }
  const modelId = runTask.payload.model as string;
  if (modelId !== QWEN_AUDIO_31_ASR_STREAMING_ID) {
    return fail("ModelNotFound", `WebSocket recognition supports model '${QWEN_AUDIO_31_ASR_STREAMING_ID}'.`, 1008);
  }
  const parameters = runTask.payload.parameters;
  if (!parameters || typeof parameters !== "object" || typeof parameters.format !== "string" || !Number.isFinite(Number(parameters.sample_rate))) {
    return fail("InvalidParameter", "payload.parameters.format and payload.parameters.sample_rate are required.", 1008);
  }

  useApiKeyCaller(ctx, caller);
  if (!resolveModel(ctx, modelId)) return fail("ModelNotFound", `Model '${modelId}' is not available.`, 1008);
  if (!checkModelAccess(ctx)) return fail("AccessDenied", `This account may not use model '${modelId}'.`, 1008);
  if (await reserveQpm(ctx)) return fail("Throttling.RateQuota", "Rate limit exceeded.", 1008);

  const routeFailure = await selectRoute(ctx);
  if (routeFailure) {
    const body = upstreamErrorBody(routeFailure) as { message?: string };
    return fail("ServiceUnavailable", body?.message || "No upstream route is available.");
  }
  const upstreamInfo = ctx.requireUpstream();
  try {
    prices = qwenAudio31AsrStreamingPrices(upstreamInfo.region);
  } catch (error) {
    if (!(error instanceof AudioPricingUnavailableError)) throw error;
    return fail("ServiceUnavailable", error.message);
  }
  budgetCost = calculateTokenAsrCost(SESSION_BUDGET_INPUT_TOKENS, SESSION_BUDGET_OUTPUT_TOKENS, prices);
  const { finalAmount: reserveAmount } = await applyUserModelDiscount(caller.user_id, modelId, budgetCost);
  const billingFailure = await reserveBilling(ctx, reserveAmount, "audio-asr-stream");
  if (billingFailure) {
    return fail("Billing.InsufficientBalance", `Balance is too low to start a session (needs about ¥${reserveAmount.toFixed(3)}).`, 1008);
  }
  const capacityFailure = await reserveProviderCapacity(ctx, CAPACITY_ESTIMATE_TOKENS);
  if (capacityFailure) return fail("Throttling", capacityFailure.message, 1013);

  if (finished) {
    await settle();
    return;
  }

  // ---- upstream connection
  let url: string;
  try {
    url = upstreamWsUrl(upstreamInfo.nativeBaseUrl);
    parseAndValidateOutboundUrl(url.replace(/^ws/, "http"), { kind: "provider" });
  } catch {
    return fail("ServiceUnavailable", "The configured provider endpoint is not permitted by outbound security policy.");
  }
  upstream = upstreamFactory(url, { Authorization: `Bearer ${upstreamInfo.apiKey}` });
  timers.push(setTimeout(() => fail("SessionTimeout", "The session reached the 30 minute limit.", 1000), MAX_SESSION_MS));
  timers.push(setInterval(() => {
    try {
      if (client.readyState === WebSocket.OPEN) client.ping();
      if (upstream?.readyState === WebSocket.OPEN) upstream.ping();
    } catch { /* ignore */ }
  }, PING_INTERVAL_MS) as unknown as NodeJS.Timeout);
  touch();

  const upstreamTaskPayload = {
    header: { action: "run-task", task_id: taskId, streaming: "duplex" },
    payload: {
      task_group: "audio",
      task: "asr",
      function: "recognition",
      model: upstreamInfo.upstreamModelId || modelId,
      parameters,
      input: runTask.payload.input && typeof runTask.payload.input === "object" ? runTask.payload.input : {},
    },
  };

  upstream.on("open", () => upstream!.send(JSON.stringify(upstreamTaskPayload)));
  upstream.on("message", (data, isBinary) => {
    if (isBinary) {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: true });
      return;
    }
    const text = toText(data);
    let message: any = null;
    try {
      message = JSON.parse(text);
    } catch { /* relay as-is */ }
    const event = message?.header?.event;
    const seen = readUsage(message);
    if (seen) usage = seen;
    if (event === "task-failed") {
      failure = {
        code: "upstream_asr_error",
        reason: String(message?.header?.error_message || "Upstream ASR task failed").slice(0, 300),
        httpStatus: 502,
      };
    }
    send(text);
    if (event === "task-started") {
      upstreamStarted = true;
      for (const item of queue.splice(0)) upstream!.send(item.data, { binary: item.binary });
      queuedBytes = 0;
    }
    if (event === "task-finished" || event === "task-failed") finish(1000);
    else if (usage && calculateTokenAsrCost(usage.input_tokens, usage.output_tokens, prices) >= budgetCost) {
      // Session budget reached: end the task so what was recognised is billed.
      if (upstream?.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ header: { action: "finish-task", task_id: taskId, streaming: "duplex" }, payload: { input: {} } }));
      }
    }
  });
  upstream.on("unexpected-response", (_request, response) => {
    failure = { code: "upstream_asr_error", reason: `Upstream handshake rejected (${response.statusCode})`, httpStatus: response.statusCode || 502 };
    fail("ServiceUnavailable", "The upstream recognition service rejected the connection.");
  });
  upstream.on("error", (error) => {
    if (finished) return;
    failure ??= { code: "upstream_exception", reason: error.message.slice(0, 200) };
    fail("ServiceUnavailable", "The upstream recognition service is unavailable.");
  });
  upstream.on("close", () => {
    if (!finished) {
      failure ??= usage ? null : { code: "upstream_exception", reason: "Upstream closed before the task finished" };
      if (failure) send(taskFailed(taskId, "ServiceUnavailable", "The upstream connection closed unexpectedly."));
      finish(failure ? 1011 : 1000);
    }
  });

  // ---- client frames after run-task
  client.on("message", (data, isBinary) => {
    if (finished) return;
    touch();
    if (isBinary) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data as ArrayBuffer)]);
      if (upstreamStarted && upstream?.readyState === WebSocket.OPEN) {
        upstream.send(buffer, { binary: true });
      } else {
        queuedBytes += buffer.length;
        if (queuedBytes > MAX_QUEUED_BYTES) return fail("InvalidParameter", "Audio was sent before task-started and exceeded the buffer.", 1008);
        queue.push({ data: buffer, binary: true });
      }
      return;
    }
    let message: any = null;
    try {
      message = JSON.parse(toText(data));
    } catch { /* ignore */ }
    if (message?.header?.action === "finish-task") {
      const body = JSON.stringify({ header: { action: "finish-task", task_id: taskId, streaming: "duplex" }, payload: { input: {} } });
      if (upstreamStarted && upstream?.readyState === WebSocket.OPEN) upstream.send(body);
      else queue.push({ data: Buffer.from(body), binary: false });
    }
  });
  client.on("close", () => {
    // The client left: stop the upstream task and bill what was recognised.
    ctx.clientClosed = true;
    if (!finished) finish(1000);
  });
  client.on("error", () => {
    if (!finished) finish(1011);
  });
}
