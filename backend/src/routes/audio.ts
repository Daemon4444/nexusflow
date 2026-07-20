/**
 * OpenAI-Compatible Audio API
 *
 * Endpoints:
 * - POST /v1/audio/speech - Text-to-Speech (TTS)
 * - POST /v1/audio/transcriptions - Speech-to-Text (ASR)
 *
 * Proxies to DashScope's multimodal-generation API for Qwen3 TTS/ASR models.
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import { models } from "../data/models";
import { validateApiKey } from "../data/apikeys";
import { logUsage } from "../data/usage";
import { BillingReservation, releaseReservation, reserveBalanceWithReason, settleReservation } from "../data/billing";
import { applyUserModelDiscount } from "../data/user-discounts";
import { isModelAllowed } from "../data/model-access";
import { checkConsumerLimitsAsync, checkRPM, checkTPM, recordRequest } from "../services/rate-limiter";
import { getEffectiveRateLimit } from "../data/ratelimits";
import { findProvider, getResolvedProviderApiKey } from "../services/providers";
import { sanitizeUpstreamError } from "../utils/sanitize-error";
import { sendBillingReservationFailure } from "../utils/billing-response";

const router = Router();

// ============================================================
// Helpers
// ============================================================

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

const DASHSCOPE_MULTIMODAL_URL =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

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

// ============================================================
// TTS: POST /v1/audio/speech
// ============================================================

router.post("/speech", async (req: Request, res: Response) => {
  const startTime = Date.now();
  let billingReservation: BillingReservation | null = null;
  let billableResponseReceived = false;

  try {
    // 1. Auth
    const token = extractToken(req);
    const caller = token ? await validateApiKey(token) : null;
    if (!caller) {
      res.status(401).json({
        error: { message: "Invalid API key provided.", type: "invalid_request_error", code: "invalid_api_key" },
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

    // 2. Parse request
    const { model: modelId, input: text, voice, response_format } = req.body;
    if (!modelId || !text) {
      res.status(400).json({
        error: { message: "Missing required parameters: model, input.", type: "invalid_request_error", code: "invalid_request" },
      });
      return;
    }

    // 3. Resolve model ID for upstream
    let resolvedModelId = modelId as string;
    if (modelId === "qwen3-tts-flash-realtime") {
      // -realtime models are WebSocket-only; map to the HTTP-compatible non-realtime variant
      resolvedModelId = "qwen3-tts-instruct-flash";
    }

    const model = models.find((m) => m.id === modelId);
    if (!model) {
      res.status(404).json({
        error: { message: `Model '${modelId}' not found.`, type: "invalid_request_error", code: "model_not_found" },
      });
      return;
    }

    // 4. Balance check
    const charCount = typeof text === "string" ? text.length : 0;
    const estimatedCost = (charCount / 1_000_000) * model.promptPrice;
    if (!isModelAllowed(caller.parent_user_id, caller.allowed_models, modelId)) {
      res.status(403).json({
        error: { message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`, type: "invalid_request_error", code: "model_not_allowed" },
      });
      return;
    }
    const { finalAmount: discountedCost } = await applyUserModelDiscount(caller.user_id, modelId, estimatedCost);
    // 5. Rate limits (per-user-per-model QPM/TPM via Redis + per-API-key RPM)
    const userLimits = await getEffectiveRateLimit(caller.user_id, modelId);
    const rpmCheck = await checkRPM(`user:${caller.user_id}:${modelId}`, userLimits.qpm);
    if (!rpmCheck.allowed) {
      res.status(429).json({
        error: { message: `Rate limit exceeded. Retry after ${Math.ceil(rpmCheck.resetMs / 1000)}s.`, type: "rate_limit_error", code: "rate_limit_exceeded" },
      });
      return;
    }
    const tpmCheck = await checkTPM(`user:${caller.user_id}:${modelId}`, userLimits.tpm, charCount);
    if (!tpmCheck.allowed) {
      res.status(429).json({
        error: { message: `Model-level TPM limit exceeded for '${modelId}'. Remaining: ${tpmCheck.remaining} tokens.`, type: "rate_limit_error", code: "rate_limit_exceeded" },
      });
      return;
    }
    const keyRate = await checkConsumerLimitsAsync(caller.id, caller.rate_limit);
    if (!keyRate.allowed) {
      res.status(429).json({
        error: { message: keyRate.reason, type: "rate_limit_error", code: "rate_limit_exceeded" },
      });
      return;
    }

    // 6. Find provider
    const provider = findProvider(modelId);
    if (!provider) {
      res.status(404).json({
        error: { message: `No provider for model '${modelId}'.`, type: "server_error", code: "provider_not_found" },
      });
      return;
    }
    const upstreamApiKey = getResolvedProviderApiKey(provider);
    if (!upstreamApiKey) {
      res.status(503).json({
        error: { message: "Provider is not configured.", type: "server_error", code: "provider_not_configured" },
      });
      return;
    }

    const billingReservationResult = await reserveBalanceWithReason(
      caller.user_id,
      discountedCost,
      `audio-tts:${randomUUID()}`
    );
    if (!billingReservationResult.reservation) {
      sendBillingReservationFailure(res, billingReservationResult.reason);
      return;
    }
    billingReservation = billingReservationResult.reservation;

    // 7. Build DashScope TTS request
    const dashScopeBody: Record<string, any> = {
      model: resolvedModelId,
      input: { text },
      parameters: {
        voice: resolveVoice(voice),
      },
    };
    if (response_format === "mp3") {
      dashScopeBody.parameters.format = "mp3";
    }

    // 8. Call DashScope
    const upstreamResp = await fetch(DASHSCOPE_MULTIMODAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${upstreamApiKey}`,
      },
      body: JSON.stringify(dashScopeBody),
    });

    if (!upstreamResp.ok) {
      const errBody = await upstreamResp.text();
      const sanitized = sanitizeUpstreamError(errBody);
      res.status(upstreamResp.status >= 500 ? 502 : upstreamResp.status).json({ error: sanitized });
      return;
    }
    billableResponseReceived = true;

    const result = (await upstreamResp.json()) as Record<string, any>;
    const audioUrl = result?.output?.audio?.url;
    const usage = (result?.usage || {}) as Record<string, number>;
    const characters = usage.characters || charCount;

    if (!audioUrl) {
      res.status(502).json({
        error: { message: "Upstream TTS returned no audio URL.", type: "server_error", code: "upstream_no_audio" },
      });
      return;
    }

    // 9. Download audio and stream to client
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) {
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
    res.send(buffer);

    // 10. Billing & logging
    const cost = (characters / 1_000_000) * model.promptPrice;
    const { finalAmount } = await applyUserModelDiscount(caller.user_id, modelId, cost);
    await settleReservation(billingReservation.id, finalAmount, `TTS: ${modelId} (${characters} chars)`);
    recordRequest(provider.id, modelId, caller.id, characters);

    try {
      await logUsage({
        apiKeyId: caller.id,
        userId: caller.user_id,
        model: modelId,
        promptTokens: characters,
        completionTokens: 0,
        totalTokens: characters,
        cost: finalAmount,
        status: "success",
        latencyMs: Date.now() - startTime,
      });
    } catch {
      // non-fatal
    }
  } catch (err) {
    console.error("[Audio TTS] Error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: { message: "Internal server error.", type: "server_error", code: "internal_error" },
      });
    }
  } finally {
    if (billingReservation && !billableResponseReceived) await releaseReservation(billingReservation.id);
  }
});

// ============================================================
// ASR: POST /v1/audio/transcriptions
// ============================================================

// Configure multer for audio uploads
const uploadDir = path.resolve(__dirname, "../../uploads/audio");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".wav";
    cb(null, `asr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowedExts = [".wav", ".mp3", ".flac", ".ogg", ".m4a", ".webm", ".opus", ".amr"];
    const ext = path.extname(file.originalname).toLowerCase();
    const audioMimes = ["audio/wav", "audio/mpeg", "audio/mp3", "audio/flac", "audio/ogg", "audio/webm", "audio/x-m4a", "audio/opus"];
    if (allowedExts.includes(ext) || audioMimes.includes(file.mimetype) || file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype || ext}`));
    }
  },
});

router.post("/transcriptions", audioUpload.single("file"), async (req: Request, res: Response) => {
  const startTime = Date.now();
  let billingReservation: BillingReservation | null = null;
  let billableResponseReceived = false;

  try {
    // 1. Auth
    const token = extractToken(req);
    const caller = token ? await validateApiKey(token) : null;
    if (!caller) {
      cleanupUploadedFile(req.file);
      res.status(401).json({
        error: { message: "Invalid API key provided.", type: "invalid_request_error", code: "invalid_api_key" },
      });
      return;
    }
    if (!caller.user_id) {
      cleanupUploadedFile(req.file);
      res.status(403).json({
        error: {
          message: "This API key is not associated with a user account.",
          type: "invalid_request_error",
          code: "anonymous_key_not_allowed",
        },
      });
      return;
    }

    const modelId = (req.body.model || "qwen3-asr-flash") as string;

    // 2. DashScope ASR requires a URL to the audio file.
    //    Accept file_url from the request body.
    const fileUrl = req.body.file_url as string | undefined;

    if (!fileUrl) {
      cleanupUploadedFile(req.file);
      res.status(400).json({
        error: {
          message: "ASR requires an audio file URL. Pass 'file_url' in the request body pointing to a publicly accessible audio file.",
          type: "invalid_request_error",
          code: "audio_url_required",
        },
      });
      return;
    }

    // 3. Find model
    const model = models.find((m) => m.id === modelId);
    if (!model) {
      cleanupUploadedFile(req.file);
      res.status(404).json({
        error: { message: `Model '${modelId}' not found.`, type: "invalid_request_error", code: "model_not_found" },
      });
      return;
    }

    // 4. Balance & rate check
    const estimatedCost = (14_400 / 1_000_000) * model.promptPrice;
    if (!isModelAllowed(caller.parent_user_id, caller.allowed_models, modelId)) {
      cleanupUploadedFile(req.file);
      res.status(403).json({
        error: { message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`, type: "invalid_request_error", code: "model_not_allowed" },
      });
      return;
    }
    const { finalAmount: discountedCost } = await applyUserModelDiscount(caller.user_id, modelId, estimatedCost);
    const userLimits = await getEffectiveRateLimit(caller.user_id, modelId);
    const rpmCheck = await checkRPM(`user:${caller.user_id}:${modelId}`, userLimits.qpm);
    if (!rpmCheck.allowed) {
      cleanupUploadedFile(req.file);
      res.status(429).json({
        error: { message: `Rate limit exceeded.`, type: "rate_limit_error", code: "rate_limit_exceeded" },
      });
      return;
    }
    const keyRate = await checkConsumerLimitsAsync(caller.id, caller.rate_limit);
    if (!keyRate.allowed) {
      cleanupUploadedFile(req.file);
      res.status(429).json({
        error: { message: keyRate.reason, type: "rate_limit_error", code: "rate_limit_exceeded" },
      });
      return;
    }

    // 5. Provider
    const provider = findProvider(modelId);
    if (!provider) {
      cleanupUploadedFile(req.file);
      res.status(404).json({
        error: { message: `No provider for model '${modelId}'.`, type: "server_error", code: "provider_not_found" },
      });
      return;
    }
    const upstreamApiKey = getResolvedProviderApiKey(provider);
    if (!upstreamApiKey) {
      cleanupUploadedFile(req.file);
      res.status(503).json({
        error: { message: "Provider is not configured.", type: "server_error", code: "provider_not_configured" },
      });
      return;
    }

    const billingReservationResult = await reserveBalanceWithReason(
      caller.user_id,
      discountedCost,
      `audio-asr:${randomUUID()}`
    );
    if (!billingReservationResult.reservation) {
      cleanupUploadedFile(req.file);
      sendBillingReservationFailure(res, billingReservationResult.reason);
      return;
    }
    billingReservation = billingReservationResult.reservation;

    // 6. Build DashScope ASR request
    const dashScopeBody = {
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

    // 7. Call DashScope
    const upstreamResp = await fetch(DASHSCOPE_MULTIMODAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${upstreamApiKey}`,
      },
      body: JSON.stringify(dashScopeBody),
      signal: AbortSignal.timeout(120_000),
    });

    cleanupUploadedFile(req.file);

    if (!upstreamResp.ok) {
      const errBody = await upstreamResp.text();
      const sanitized = sanitizeUpstreamError(errBody);
      res.status(upstreamResp.status >= 500 ? 502 : upstreamResp.status).json({ error: sanitized });
      return;
    }
    billableResponseReceived = true;

    const result = (await upstreamResp.json()) as Record<string, any>;
    const content = result?.output?.choices?.[0]?.message?.content;
    const text = Array.isArray(content) ? content.map((c: any) => c.text || "").join("") : "";
    const usage = (result?.usage || {}) as Record<string, number>;
    const audioSeconds = usage.seconds || 0;
    const audioTokens = usage.audio_tokens || usage.input_tokens || 0;

    // 8. Return OpenAI-compatible response
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

    // 9. Billing & logging
    const cost = (audioSeconds / 1_000_000) * model.promptPrice;
    const { finalAmount } = await applyUserModelDiscount(caller.user_id, modelId, cost);
    await settleReservation(billingReservation.id, finalAmount, `ASR: ${modelId} (${audioSeconds}s)`);
    recordRequest(provider.id, modelId, caller.id, audioTokens);

    try {
      await logUsage({
        apiKeyId: caller.id,
        userId: caller.user_id,
        model: modelId,
        promptTokens: audioTokens,
        completionTokens: usage.output_tokens || 0,
        totalTokens: audioTokens + (usage.output_tokens || 0),
        cost: finalAmount,
        status: "success",
        latencyMs: Date.now() - startTime,
      });
    } catch {
      // non-fatal
    }
  } catch (err) {
    cleanupUploadedFile(req.file);
    console.error("[Audio ASR] Error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: { message: "Internal server error.", type: "server_error", code: "internal_error" },
      });
    }
  } finally {
    if (billingReservation && !billableResponseReceived) await releaseReservation(billingReservation.id);
  }
});

function cleanupUploadedFile(file?: Express.Multer.File) {
  if (file?.path && fs.existsSync(file.path)) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // ignore cleanup errors
    }
  }
}

export default router;
