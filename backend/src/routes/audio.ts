/**
 * OpenAI-Compatible Audio API
 *
 * Endpoints:
 * - POST /v1/audio/speech - Text-to-Speech (TTS)
 * - POST /v1/audio/transcriptions - Speech-to-Text (ASR)
 *
 * Proxies to DashScope's multimodal-generation API for Qwen3 TTS/ASR models.
 */

import express, { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { models } from "../data/models";
import { validateApiKey, type ValidApiKey } from "../data/apikeys";
import { logUpstreamFailure, logUsage } from "../data/usage";
import { settleReservation } from "../data/billing";
import { applyUserModelDiscount } from "../data/user-discounts";
import { checkRPMFailClosed } from "../services/rate-limiter";
import { upstreamErrorBody, type ResolvedUpstream } from "../services/upstream";
import { safeExternalResourceFetch } from "../services/outbound-url-policy";
import { sanitizeUpstreamError } from "../utils/sanitize-error";
import { parseUpstreamErrorBody, upstreamClientErrorMessage } from "../services/upstream-errors";
import { sendBillingReservationFailure } from "../utils/billing-response";
import {
  AudioPricingUnavailableError,
  QWEN3_ASR_MAX_SECONDS,
  QWEN_AUDIO_31_ASR_FLASH_ID,
  QWEN_AUDIO_31_ASR_MAX_INPUT_TOKENS,
  QWEN_AUDIO_31_ASR_MAX_OUTPUT_TOKENS,
  calculateTokenAsrCost,
  qwenAudio31AsrTokenPrices,
  QWEN3_TTS_HTTP_UPSTREAM_MODEL,
  calculateAsrCost,
  calculateTtsCost,
  qwen3AsrPricePerSecond,
  qwen3TtsPricePer10kCharacters,
} from "../services/audio-pricing";
import { InferenceContext } from "../pipeline/context";
import {
  bearerToken,
  checkModelAccess,
  invokeUpstream,
  release,
  reserveBilling,
  reserveProviderCapacity,
  reserveQpm,
  reserveTpm,
  resolveModel,
  selectRoute,
  useApiKeyCaller,
  capacityErrorType,
  capacityHttpStatus,
  modelNotFoundMessage,
} from "../pipeline/stages";

const router = Router();
const AUDIO_BODY_LIMIT_BYTES = 64 * 1024;

// ============================================================
// Helpers
// ============================================================

type AuthenticatedAudioCaller = ValidApiKey & { user_id: string };

async function requireAudioCallerBeforeBody(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = bearerToken(req);
    const caller = token ? await validateApiKey(token) : null;
    if (!caller) {
      res.status(401).json({
        error: {
          message: "Invalid API key provided.",
          type: "invalid_request_error",
          code: "invalid_api_key",
        },
      });
      return;
    }
    if (!caller.user_id) {
      res.status(403).json({
        error: {
          message: "This API key is not associated with a user account.",
          type: "invalid_request_error",
          code: "anonymous_key_not_allowed",
        },
      });
      return;
    }

    if (caller.rate_limit_override != null) {
      const keyRate = await checkRPMFailClosed(
        `consumer:${caller.id}`,
        caller.rate_limit_override
      );
      if (!keyRate.available) {
        res.status(503).json({
          error: {
            message: "Request admission control is temporarily unavailable.",
            type: "server_error",
            code: "rate_limit_unavailable",
          },
        });
        return;
      }
      if (!keyRate.allowed) {
        res
          .status(429)
          .set("X-RateLimit-Scope", "api_key")
          .set("X-RateLimit-Limit", String(caller.rate_limit_override))
          .set("X-RateLimit-Remaining", "0")
          .set("Retry-After", String(Math.max(1, Math.ceil(keyRate.resetMs / 1000))))
          .json({
            error: {
              message: `API key RPM limit exceeded (${caller.rate_limit_override}/min). Retry after ${Math.ceil(keyRate.resetMs / 1000)}s.`,
              type: "rate_limit_error",
              code: "rate_limit_exceeded",
            },
          });
        return;
      }
    }

    res.locals.audioCaller = caller as AuthenticatedAudioCaller;
    next();
  } catch (error) {
    next(error);
  }
}

// Audio requests are mounted before the broad /v1 parser. Authentication and
// key-level admission therefore happen before any JSON, form, or multipart
// body is read into application memory.
router.use(requireAudioCallerBeforeBody);
router.use(express.json({ limit: AUDIO_BODY_LIMIT_BYTES }));
router.use(express.urlencoded({ extended: false, limit: AUDIO_BODY_LIMIT_BYTES }));

function resolveMultimodalUrl(nativeBaseUrl: string): string {
  const base = nativeBaseUrl.replace(/\/$/, "");
  return base.endsWith("/api/v1")
    ? `${base}/services/aigc/multimodal-generation/generation`
    : `${base}/api/v1/services/aigc/multimodal-generation/generation`;
}

// Voice mapping: OpenAI voice names -> DashScope voice names
const OPENAI_VOICE_MAP: Record<string, string> = {
  alloy: "Cherry",
  ash: "Ethan",
  ballad: "Serena",
  coral: "Chelsie",
  echo: "Dylan",
  fable: "Jada",
  nova: "Ava",
  onyx: "Ethan",
  sage: "Cherry",
  shimmer: "Serena",
  verse: "Dylan",
};

function resolveVoice(openaiVoice?: string): string {
  if (!openaiVoice) return "Cherry";
  return OPENAI_VOICE_MAP[openaiVoice] || openaiVoice;
}

type AudioFailureContext = {
  apiKeyId: string;
  userId: string;
  modelId: string;
  protocol: string;
  upstream: ResolvedUpstream;
  reservationId: string;
  startTime: number;
};

async function recordAudioFailure(
  context: AudioFailureContext,
  errorReason: string,
  options: { httpStatus?: number; errorCode?: string } = {}
): Promise<void> {
  await logUpstreamFailure({
    apiKeyId: context.apiKeyId,
    userId: context.userId,
    model: context.modelId,
    providerId: context.upstream.providerId,
    channelId: context.upstream.channelId,
    region: context.upstream.region,
    protocol: context.protocol,
    latencyMs: Date.now() - context.startTime,
    httpStatus: options.httpStatus,
    errorCode: options.errorCode,
    errorReason,
    reservationId: context.reservationId,
  });
}

// ============================================================
// TTS: POST /v1/audio/speech
// ============================================================

router.post("/speech", async (req: Request, res: Response) => {
  const ctx = new InferenceContext("audio.speech", req, res);
  const startTime = ctx.startTime;
  let upstreamFlowCompleted = false;
  let failureContext: AudioFailureContext | null = null;

  try {
    const caller = res.locals.audioCaller as AuthenticatedAudioCaller;
    useApiKeyCaller(ctx, caller);

    // 1. Parse request
    const { model: modelId, input: text, voice, response_format } = req.body || {};
    if (!modelId || !text) {
      res.status(400).json({
        error: { message: "Missing required parameters: model, input.", type: "invalid_request_error", code: "invalid_request" },
      });
      return;
    }

    if (!resolveModel(ctx, modelId)) {
      res.status(404).json({
        error: { message: modelNotFoundMessage(ctx, modelId), type: "invalid_request_error", code: "model_not_found" },
      });
      return;
    }

    // 4. Balance check
    const charCount = typeof text === "string" ? text.length : 0;
    if (!checkModelAccess(ctx)) {
      res.status(403).json({
        error: { message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`, type: "invalid_request_error", code: "model_not_allowed" },
      });
      return;
    }
    // 5. Rate limits (per-user-per-model QPM/TPM via Redis + per-API-key RPM)
    const qpmFailure = await reserveQpm(ctx);
    if (qpmFailure) {
      res.status(429).json({
        error: { message: `Model-level QPM limit exceeded (${qpmFailure.limit}/min).`, type: "rate_limit_error", code: "rate_limit_exceeded" },
      });
      return;
    }
    const tpmFailure = await reserveTpm(ctx, charCount);
    if (tpmFailure) {
      res.status(429).json({
        error: { message: `Model-level TPM limit exceeded for '${modelId}'. Remaining: ${tpmFailure.remaining || 0} tokens.`, type: "rate_limit_error", code: "rate_limit_exceeded" },
      });
      return;
    }
    // 6. Resolve the same managed route used by the other public protocols.
    const routeFailure = await selectRoute(ctx);
    if (routeFailure) {
      res.status(routeFailure.status).json({ error: upstreamErrorBody(routeFailure) });
      return;
    }
    const upstream = ctx.requireUpstream();
    const upstreamApiKey = upstream.apiKey;
    let pricePer10kCharacters: number;
    try {
      pricePer10kCharacters = qwen3TtsPricePer10kCharacters(upstream.region);
    } catch (error) {
      if (!(error instanceof AudioPricingUnavailableError)) throw error;
      res.status(503).json({
        error: {
          message: error.message,
          type: "server_error",
          code: "audio_pricing_unavailable",
        },
      });
      return;
    }
    const estimatedCost = calculateTtsCost(charCount, pricePer10kCharacters);
    const { finalAmount: discountedCost } = await applyUserModelDiscount(
      caller.user_id,
      modelId,
      estimatedCost
    );

    const billingFailure = await reserveBilling(ctx, discountedCost, "audio-tts");
    if (billingFailure) {
      sendBillingReservationFailure(res, billingFailure);
      return;
    }
    const billingReservation = ctx.billingReservation!;
    failureContext = {
      apiKeyId: caller.id,
      userId: caller.user_id,
      modelId,
      protocol: "openai-audio-speech",
      upstream,
      reservationId: billingReservation.id,
      startTime,
    };

    // 7. Build DashScope TTS request
    const dashScopeBody: Record<string, any> = {
      model: QWEN3_TTS_HTTP_UPSTREAM_MODEL,
      input: { text },
      parameters: {
        voice: resolveVoice(voice),
      },
    };
    if (response_format === "mp3") {
      dashScopeBody.parameters.format = "mp3";
    }

    // 8. Call DashScope
    const capacityFailure = await reserveProviderCapacity(ctx, charCount);
    if (capacityFailure) {
      res.status(capacityHttpStatus(res, capacityFailure)).json({
        error: { message: capacityFailure.message, type: capacityErrorType(capacityFailure, "server_error"), code: capacityFailure.code },
      });
      return;
    }
    const upstreamResp = await invokeUpstream(ctx, {
      url: resolveMultimodalUrl(upstream.nativeBaseUrl),
      auth: false,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${upstreamApiKey}`,
      },
      body: dashScopeBody,
      timeoutMs: null,
    });

    if (!upstreamResp.ok) {
      const errBody = await upstreamResp.text();
      const sanitized = sanitizeUpstreamError(errBody);
      await recordAudioFailure(failureContext, sanitized || "Upstream TTS error", {
        httpStatus: upstreamResp.status,
        errorCode: "upstream_tts_error",
      });
      res.status(upstreamResp.status >= 500 ? 502 : upstreamResp.status).json({ error: sanitized });
      return;
    }

    const result = (await upstreamResp.json()) as Record<string, any>;
    const audioUrl = result?.output?.audio?.url;
    const usage = (result?.usage || {}) as Record<string, number>;
    const characters = Number(usage.characters);

    if (!Number.isFinite(characters) || characters <= 0) {
      await recordAudioFailure(failureContext, "Upstream TTS returned no auditable character usage.", {
        httpStatus: 502,
        errorCode: "upstream_usage_missing",
      });
      res.status(502).json({
        error: {
          message: "Upstream TTS returned no auditable character usage.",
          type: "server_error",
          code: "upstream_usage_missing",
        },
      });
      return;
    }

    if (typeof audioUrl !== "string" || !audioUrl) {
      await recordAudioFailure(failureContext, "Upstream TTS returned no audio URL.", {
        httpStatus: 502,
        errorCode: "upstream_no_audio",
      });
      res.status(502).json({
        error: { message: "Upstream TTS returned no audio URL.", type: "server_error", code: "upstream_no_audio" },
      });
      return;
    }

    // 9. Download audio and stream to client
    const audioResp = await safeExternalResourceFetch(audioUrl);
    if (!audioResp.ok) {
      await recordAudioFailure(failureContext, "Failed to download audio from upstream.", {
        httpStatus: audioResp.status,
        errorCode: "upstream_audio_failed",
      });
      res.status(502).json({
        error: { message: "Failed to download audio from upstream.", type: "server_error", code: "upstream_audio_failed" },
      });
      return;
    }

    const contentType = audioResp.headers.get("content-type") || "audio/wav";
    res.setHeader("Content-Type", contentType);
    const contentLength = audioResp.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    const buffer = Buffer.from(await audioResp.arrayBuffer());
    upstreamFlowCompleted = true;

    // 10. Billing & logging
    const cost = calculateTtsCost(characters, pricePer10kCharacters);
    const { finalAmount } = await applyUserModelDiscount(caller.user_id, modelId, cost);
    const transaction = await settleReservation(
      billingReservation.id,
      finalAmount,
      `TTS: ${modelId} (${characters} chars)`
    );
    if (finalAmount > 0 && !transaction) {
      throw new Error("TTS billing settlement did not create a transaction");
    }
    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "openai-audio-speech",
      apiKeyId: caller.id,
      userId: caller.user_id,
      model: modelId,
      promptTokens: characters,
      completionTokens: 0,
      totalTokens: characters,
      cost: finalAmount,
      status: "success",
      latencyMs: Date.now() - startTime,
      providerUnits: characters / 10_000,
      reservationId: billingReservation.id,
      transactionId: transaction?.id || null,
    });
    ctx.actualProviderTokens = characters;
    ctx.billableResponseReceived = true;
    res.send(buffer);
  } catch (err) {
    console.error("[Audio TTS] Error:", err);
    if (failureContext && !upstreamFlowCompleted) {
      await recordAudioFailure(
        failureContext,
        err instanceof Error ? err.message : String(err),
        { errorCode: "upstream_exception" }
      );
    }
    if (!res.headersSent) {
      res.status(500).json({
        error: { message: "Internal server error.", type: "server_error", code: "internal_error" },
      });
    }
  } finally {
    // Audio has never returned its account TPM reservation (kept as-is; see
    // the P2 notes in the PR). Only the billing hold and the lease are released.
    await release(ctx, { reconcileTokens: false });
  }
});

// ============================================================
// ASR: POST /v1/audio/transcriptions
// ============================================================

// This endpoint has always sent `file_url` to DashScope and never consumed the
// uploaded bytes. Accepting a `file` part therefore created a misleading 50 MB
// disk-write surface without a successful API path. `.none()` accepts small
// text fields but rejects a file as soon as its multipart header is observed;
// no storage engine is configured and no temporary file is created.
const audioTranscriptionFields = multer({
  limits: {
    fieldSize: AUDIO_BODY_LIMIT_BYTES,
    fields: 16,
    parts: 16,
    files: 0,
  },
}).none();

function parseAudioTranscriptionFields(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.is("multipart/form-data")) {
    next();
    return;
  }
  audioTranscriptionFields(req, res, next);
}

const ASR_AUDIO_FORMATS = new Set([
  "wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "amr", "wma", "webm", "3gp", "mp4", "pcm",
]);
// Tokens counted against upstream capacity before the call; settled with actual usage after.
const TOKEN_ASR_CAPACITY_ESTIMATE = 1024;

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return value.split(",");
  return [];
}

/**
 * Native DashScope request for the token-billed qwen-audio-3.x ASR models.
 * The upstream only requires a non-empty `format` (the container is sniffed),
 * so it is derived from the URL extension and defaults to wav.
 */
function buildTokenAsrRequest(
  modelId: string,
  fileUrl: string,
  body: Record<string, unknown>
): { ok: true; body: Record<string, unknown> } | { ok: false; message: string } {
  let format = typeof body.format === "string" ? body.format.trim().toLowerCase() : "";
  if (!format) {
    try {
      const ext = new URL(fileUrl).pathname.split(".").pop()?.toLowerCase() || "";
      format = ASR_AUDIO_FORMATS.has(ext) ? ext : "wav";
    } catch {
      format = "wav";
    }
  }
  if (!/^[a-z0-9]{1,8}$/.test(format)) return { ok: false, message: "'format' must be a short audio container name such as wav or mp3." };

  const hints = [...asArray(body.language_hints), ...asArray(body.language)]
    .map((item) => String(item).trim())
    .filter(Boolean);
  if (hints.some((hint) => !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(hint))) {
    return { ok: false, message: "'language' / 'language_hints' must be language codes such as zh, en or yue." };
  }
  if (hints.length > 4) return { ok: false, message: "At most 4 language hints are supported." };

  const parameters: Record<string, unknown> = { format };
  if (hints.length) parameters.language_hints = [...new Set(hints)];
  const sampleRate = body.sample_rate == null ? NaN : Number(body.sample_rate);
  if (Number.isFinite(sampleRate) && sampleRate >= 8000 && sampleRate <= 96000) {
    parameters.sample_rate = String(Math.trunc(sampleRate));
  }

  // OpenAI's `prompt` is context to bias recognition; the upstream takes it as a system message.
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length > 2000) return { ok: false, message: "'prompt' must be at most 2000 characters." };
  const messages: Array<Record<string, unknown>> = [];
  if (prompt) messages.push({ role: "system", content: [{ text: prompt }] });
  messages.push({ role: "user", content: [{ type: "input_audio", input_audio: { data: fileUrl } }] });
  return { ok: true, body: { model: modelId, input: { messages }, parameters } };
}

router.post("/transcriptions", parseAudioTranscriptionFields, async (req: Request, res: Response) => {
  const ctx = new InferenceContext("audio.transcriptions", req, res);
  const startTime = ctx.startTime;
  let upstreamFlowCompleted = false;
  let failureContext: AudioFailureContext | null = null;

  try {
    const caller = res.locals.audioCaller as AuthenticatedAudioCaller;
    useApiKeyCaller(ctx, caller);
    const modelId = (req.body?.model || "qwen3-asr-flash") as string;

    // DashScope ASR requires a remotely retrievable URL. Binary OpenAI-style
    // file upload is intentionally unsupported until it can use the managed
    // object-storage/quota path.
    const fileUrl = req.body?.file_url as string | undefined;

    if (!fileUrl) {
      res.status(400).json({
        error: {
          message: "ASR requires 'file_url'. Binary file upload is not supported by this endpoint.",
          type: "invalid_request_error",
          code: "audio_url_required",
        },
      });
      return;
    }

    // 3. Find model
    if (!resolveModel(ctx, modelId)) {
      res.status(404).json({
        error: { message: modelNotFoundMessage(ctx, modelId), type: "invalid_request_error", code: "model_not_found" },
      });
      return;
    }

    // 4. Access & rate checks
    if (!checkModelAccess(ctx)) {
      res.status(403).json({
        error: { message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`, type: "invalid_request_error", code: "model_not_allowed" },
      });
      return;
    }
    if (await reserveQpm(ctx)) {
      res.status(429).json({
        error: { message: `Rate limit exceeded.`, type: "rate_limit_error", code: "rate_limit_exceeded" },
      });
      return;
    }

    // Validate model-specific parameters before any route, capacity or billing state is taken.
    const tokenAsr = modelId === QWEN_AUDIO_31_ASR_FLASH_ID;
    let nativeAsrBody: Record<string, unknown> | null = null;
    if (tokenAsr) {
      const built = buildTokenAsrRequest(modelId, fileUrl, (req.body || {}) as Record<string, unknown>);
      if (!built.ok) {
        res.status(400).json({
          error: { message: built.message, type: "invalid_request_error", code: "invalid_asr_parameter" },
        });
        return;
      }
      nativeAsrBody = built.body;
    }

    // 5. Provider route
    const routeFailure = await selectRoute(ctx);
    if (routeFailure) {
      res.status(routeFailure.status).json({ error: upstreamErrorBody(routeFailure) });
      return;
    }
    const upstream = ctx.requireUpstream();
    const upstreamApiKey = upstream.apiKey;
    let pricePerSecond = 0;
    let tokenPrices = { input: 0, output: 0 };
    try {
      if (tokenAsr) tokenPrices = qwenAudio31AsrTokenPrices(upstream.region);
      else pricePerSecond = qwen3AsrPricePerSecond(upstream.region);
    } catch (error) {
      if (!(error instanceof AudioPricingUnavailableError)) throw error;
      res.status(503).json({
        error: {
          message: error.message,
          type: "server_error",
          code: "audio_pricing_unavailable",
        },
      });
      return;
    }
    // qwen3-asr-flash's verified synchronous HTTP limit is five minutes.
    // Reserve that documented maximum because a URL does not expose duration
    // before the upstream decodes it; actual seconds are authoritative.
    // qwen-audio-3.1-asr-flash is token-billed: hold the model's full context budget.
    const estimatedCost = tokenAsr
      ? calculateTokenAsrCost(QWEN_AUDIO_31_ASR_MAX_INPUT_TOKENS, QWEN_AUDIO_31_ASR_MAX_OUTPUT_TOKENS, tokenPrices)
      : calculateAsrCost(QWEN3_ASR_MAX_SECONDS, pricePerSecond);
    const { finalAmount: discountedCost } = await applyUserModelDiscount(
      caller.user_id,
      modelId,
      estimatedCost
    );

    const billingFailure = await reserveBilling(ctx, discountedCost, "audio-asr");
    if (billingFailure) {
      sendBillingReservationFailure(res, billingFailure);
      return;
    }
    const billingReservation = ctx.billingReservation!;
    failureContext = {
      apiKeyId: caller.id,
      userId: caller.user_id,
      modelId,
      protocol: "openai-audio-transcriptions",
      upstream,
      reservationId: billingReservation.id,
      startTime,
    };

    // 6. Build DashScope ASR request
    let dashScopeBody: Record<string, unknown> = {
      model: modelId,
      input: {
        messages: [
          {
            role: "user",
            content: [{ audio: fileUrl }],
          },
        ],
      },
    };
    if (nativeAsrBody) dashScopeBody = nativeAsrBody;

    // 7. Call DashScope
    const capacityFailure = await reserveProviderCapacity(ctx, tokenAsr ? TOKEN_ASR_CAPACITY_ESTIMATE : QWEN3_ASR_MAX_SECONDS);
    if (capacityFailure) {
      res.status(capacityHttpStatus(res, capacityFailure)).json({
        error: { message: capacityFailure.message, type: capacityErrorType(capacityFailure, "server_error"), code: capacityFailure.code },
      });
      return;
    }
    const upstreamResp = await invokeUpstream(ctx, {
      url: resolveMultimodalUrl(upstream.nativeBaseUrl),
      auth: false,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${upstreamApiKey}`,
      },
      body: dashScopeBody,
      timeoutMs: 120_000,
    });

    if (!upstreamResp.ok) {
      const errBody = await upstreamResp.text();
      const sanitized = sanitizeUpstreamError(errBody);
      // Token ASR clients need the reason for a rejected clip (unreachable URL, unsupported audio).
      const detail = tokenAsr
        ? upstreamClientErrorMessage(upstreamResp.status, parseUpstreamErrorBody(errBody), {
            publicModelId: modelId,
            upstreamModelId: upstream.upstreamModelId,
          })
        : null;
      await recordAudioFailure(failureContext, detail || sanitized || "Upstream ASR error", {
        httpStatus: upstreamResp.status,
        errorCode: "upstream_asr_error",
      });
      if (tokenAsr && upstreamResp.status === 429) {
        // The provider's own per-model rate limit: say so (and when to retry) instead of the generic masked 429.
        res.setHeader("Retry-After", "1");
        res.status(429).json({
          error: {
            message: "The upstream speech model is rate limited right now. Retry shortly.",
            type: "rate_limit_error",
            code: "upstream_rate_limited",
          },
        });
        return;
      }
      res.status(upstreamResp.status >= 500 ? 502 : upstreamResp.status).json({
        error: detail
          ? { message: detail, type: "invalid_request_error", code: "upstream_asr_error" }
          : sanitized,
      });
      return;
    }

    const result = (await upstreamResp.json()) as Record<string, any>;
    if (tokenAsr) {
      // Token-billed native ASR: output.text + usage{duration,input_tokens,output_tokens}.
      const text = typeof result?.output?.text === "string" ? result.output.text : "";
      const usage = (result?.usage || {}) as Record<string, number>;
      const inputTokens = Number(usage.input_tokens);
      const outputTokens = Number(usage.output_tokens ?? 0);
      const audioSeconds = Number(usage.duration ?? usage.seconds ?? 0);
      if (!Number.isFinite(inputTokens) || inputTokens <= 0 || !Number.isFinite(outputTokens) || outputTokens < 0) {
        await recordAudioFailure(
          failureContext,
          "Upstream ASR returned missing token usage.",
          { httpStatus: 502, errorCode: "upstream_usage_missing" }
        );
        res.status(502).json({
          error: {
            message: "Upstream ASR returned no auditable token usage.",
            type: "server_error",
            code: "upstream_usage_missing",
          },
        });
        return;
      }
      upstreamFlowCompleted = true;
      const cost = calculateTokenAsrCost(inputTokens, outputTokens, tokenPrices);
      const { finalAmount } = await applyUserModelDiscount(caller.user_id, modelId, cost);
      const transaction = await settleReservation(
        billingReservation.id,
        finalAmount,
        `ASR: ${modelId} (${inputTokens} in / ${outputTokens} out tokens)`
      );
      if (finalAmount > 0 && !transaction) {
        throw new Error("ASR billing settlement did not create a transaction");
      }
      const totalTokens = inputTokens + outputTokens;
      await logUsage({
        region: upstream.region,
        providerId: upstream.providerId,
        channelId: upstream.channelId,
        protocol: "openai-audio-transcriptions",
        apiKeyId: caller.id,
        userId: caller.user_id,
        model: modelId,
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens,
        cost: finalAmount,
        status: "success",
        latencyMs: Date.now() - startTime,
        providerUnits: Number.isFinite(audioSeconds) ? audioSeconds : 0,
        reservationId: billingReservation.id,
        transactionId: transaction?.id || null,
      });
      ctx.actualProviderTokens = totalTokens;
      ctx.billableResponseReceived = true;
      res.json({
        text,
        usage: {
          type: "tokens",
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          seconds: Number.isFinite(audioSeconds) ? audioSeconds : 0,
        },
        ...(req.body.response_format === "verbose_json"
          ? { language: "unknown", duration: Number.isFinite(audioSeconds) ? audioSeconds : 0, segments: [] }
          : {}),
      });
      return;
    }
    const content = result?.output?.choices?.[0]?.message?.content;
    const text = Array.isArray(content) ? content.map((c: any) => c.text || "").join("") : "";
    const usage = (result?.usage || {}) as Record<string, number>;
    const audioSeconds = Number(usage.seconds);
    const audioTokens = Number(usage.audio_tokens || usage.input_tokens || 0);
    const outputTokens = Number(usage.output_tokens || 0);
    if (
      !Number.isFinite(audioSeconds)
      || audioSeconds <= 0
      || audioSeconds > QWEN3_ASR_MAX_SECONDS
    ) {
      await recordAudioFailure(
        failureContext,
        "Upstream ASR returned missing or out-of-range audio duration.",
        { httpStatus: 502, errorCode: "upstream_usage_missing" }
      );
      res.status(502).json({
        error: {
          message: "Upstream ASR returned no auditable audio duration.",
          type: "server_error",
          code: "upstream_usage_missing",
        },
      });
      return;
    }
    upstreamFlowCompleted = true;

    // 8. Billing & logging happen before delivery so a successful response
    // always has an authoritative ledger transaction.
    const cost = calculateAsrCost(audioSeconds, pricePerSecond);
    const { finalAmount } = await applyUserModelDiscount(caller.user_id, modelId, cost);
    const transaction = await settleReservation(
      billingReservation.id,
      finalAmount,
      `ASR: ${modelId} (${audioSeconds}s)`
    );
    if (finalAmount > 0 && !transaction) {
      throw new Error("ASR billing settlement did not create a transaction");
    }
    const totalTokens = Math.max(0, audioTokens) + Math.max(0, outputTokens);
    await logUsage({
      region: upstream.region,
      providerId: upstream.providerId,
      channelId: upstream.channelId,
      protocol: "openai-audio-transcriptions",
      apiKeyId: caller.id,
      userId: caller.user_id,
      model: modelId,
      promptTokens: Math.max(0, audioTokens),
      completionTokens: Math.max(0, outputTokens),
      totalTokens,
      cost: finalAmount,
      status: "success",
      latencyMs: Date.now() - startTime,
      providerUnits: audioSeconds,
      reservationId: billingReservation.id,
      transactionId: transaction?.id || null,
    });
    ctx.actualProviderTokens = totalTokens;
    ctx.billableResponseReceived = true;

    // 9. Return OpenAI-compatible response only after settlement succeeds.
    res.json({
      text,
      ...(req.body.response_format === "verbose_json"
        ? {
            language: result?.output?.choices?.[0]?.message?.annotations?.[0]?.language || "unknown",
            duration: audioSeconds,
            segments: [],
          }
        : {}),
    });
  } catch (err) {
    console.error("[Audio ASR] Error:", err);
    if (failureContext && !upstreamFlowCompleted) {
      await recordAudioFailure(
        failureContext,
        err instanceof Error ? err.message : String(err),
        { errorCode: "upstream_exception" }
      );
    }
    if (!res.headersSent) {
      res.status(500).json({
        error: { message: "Internal server error.", type: "server_error", code: "internal_error" },
      });
    }
  } finally {
    // Audio has never returned its account TPM reservation (kept as-is; see
    // the P2 notes in the PR). Only the billing hold and the lease are released.
    await release(ctx, { reconcileTokens: false });
  }
});

router.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!(error instanceof multer.MulterError)) {
      next(error);
      return;
    }
    const fileRejected = error.code === "LIMIT_UNEXPECTED_FILE"
      || error.code === "LIMIT_FILE_COUNT";
    res.status(fileRejected ? 400 : 413).json({
      error: {
        message: fileRejected
          ? "Binary file upload is not supported. Provide 'file_url' instead."
          : "Audio transcription fields exceed the 64 KB request limit.",
        type: "invalid_request_error",
        code: fileRejected ? "audio_file_upload_not_supported" : "payload_too_large",
      },
    });
  }
);

export default router;
