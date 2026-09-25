/**
 * Inference pipeline stages.
 *
 *   authenticate → resolveModel → checkModelAccess → reserveUserQuota →
 *   selectRoute → reserveProviderCapacity → reserveBilling → invokeUpstream →
 *   settle → logUsage → release (always, from `finally`)
 *
 * Each stage reads and writes only the InferenceContext and returns a
 * structured outcome. Routes decide the order (it differs slightly per
 * public contract) and render failures in their own protocol format, so the
 * wire behaviour of every entry point is unchanged by the refactor (see
 * scripts/test-inference-characterization.ts).
 */
import { randomUUID } from "crypto";
import type { Request } from "express";
import { models, type AIModel } from "../data/models";
import { validateApiKey } from "../data/apikeys";
import { validateSession } from "../data/users";
import { isModelAllowed } from "../data/model-access";
import {
  releaseReservation,
  reserveBalanceWithReason,
  settleReservation,
  type BillingReservationFailureReason,
} from "../data/billing";
import { logUsage as persistUsage } from "../data/usage";
import { reconcileAccountTpm, reserveAccountQpm, reserveAccountTpm } from "../services/account-rate-limiter";
import { checkConsumerLimitsAsync } from "../services/rate-limiter";
import { getRequestedRegion, resolveUpstream, type ResolveUpstreamResult } from "../services/upstream";
import {
  acquireProviderCapacity,
  releaseProviderCapacity,
  type ProviderCapacityAcquireResult,
} from "../services/scheduler";
import { safeProviderFetch } from "../services/outbound-url-policy";
import { getProviderAuthHeaders } from "../services/providers";
import { getProviderChannel } from "../data/provider-channels";
import { logToSLS } from "../services/sls";
import { resolveUpstreamAdapter } from "./adapters";
import type { InferenceContext, PipelineCaller } from "./context";

export const UPSTREAM_TIMEOUT_MS = 600_000;

// ------------------------------------------------------------ authenticate

/** `Authorization: Bearer <token>`. */
export function bearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

/** Anthropic clients send `x-api-key`; Bearer is accepted as well. */
export function anthropicToken(req: Request): string | null {
  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string" && xApiKey.trim()) return xApiKey.trim();
  return bearerToken(req);
}

function callerFromApiKey(record: NonNullable<Awaited<ReturnType<typeof validateApiKey>>>): PipelineCaller {
  return {
    userId: record.user_id,
    parentUserId: record.parent_user_id,
    apiKeyId: record.id,
    allowedModels: record.allowed_models,
    rateLimitOverride: record.rate_limit_override ?? null,
    apiKey: record,
    errorIdentity: record,
    kind: "api_key",
  };
}

/** Adopts an API key that a pre-body middleware already validated. */
export function useApiKeyCaller(
  ctx: InferenceContext,
  record: NonNullable<Awaited<ReturnType<typeof validateApiKey>>>
): PipelineCaller {
  ctx.caller = callerFromApiKey(record);
  return ctx.caller;
}

/** API key only. Returns false when the token is missing or invalid. */
export async function authenticateApiKey(ctx: InferenceContext, token: string | null): Promise<boolean> {
  const record = token ? await validateApiKey(token) : null;
  if (!record) return false;
  ctx.caller = callerFromApiKey(record);
  return true;
}

/** Dashboard session only (Playground). */
export async function authenticateSession(ctx: InferenceContext, token: string | null): Promise<boolean> {
  const session = token ? await validateSession(token) : null;
  if (!session) return false;
  ctx.caller = {
    userId: session.id,
    parentUserId: session.parent_user_id ?? null,
    apiKeyId: null,
    allowedModels: session.allowed_models ?? null,
    rateLimitOverride: null,
    apiKey: null,
    errorIdentity: { id: null, user_id: session.id },
    kind: "session",
  };
  return true;
}

/** API key first, then dashboard session (image/video media routes). */
export async function authenticateApiKeyOrSession(ctx: InferenceContext, token: string | null): Promise<boolean> {
  if (!token) return false;
  if (await authenticateApiKey(ctx, token)) return true;
  return authenticateSession(ctx, token);
}

/**
 * Whether the bearer token (API key or session) may read an async task:
 * the creating key, or any key/session of the owning user.
 */
export async function canAccessTask(req: Request, taskUserId: string | null, taskApiKeyId: string | null): Promise<boolean> {
  const token = bearerToken(req);
  if (!token) return false;
  const apiKeyRecord = await validateApiKey(token);
  if (apiKeyRecord) {
    return (!!taskApiKeyId && apiKeyRecord.id === taskApiKeyId) || (!!taskUserId && apiKeyRecord.user_id === taskUserId);
  }
  const session = await validateSession(token);
  return !!session && !!taskUserId && session.id === taskUserId;
}

// ------------------------------------------------------------ resolveModel

export function findModel(modelId: string): AIModel | undefined {
  return models.find((model) => model.id === modelId);
}

export function resolveModel(ctx: InferenceContext, modelId: string): boolean {
  ctx.modelId = modelId;
  ctx.model = findModel(modelId) || null;
  return !!ctx.model;
}

// -------------------------------------------------------- checkModelAccess

export function checkModelAccess(ctx: InferenceContext): boolean {
  const caller = ctx.requireCaller();
  return isModelAllowed(caller.parentUserId, caller.allowedModels, ctx.modelId);
}

// -------------------------------------------------------- reserveUserQuota

export type QpmFailure = { dimension: "qpm"; limit: number; resetMs?: number };
export type TpmFailure = { dimension: "tpm"; limit: number; remaining?: number };
export type ConsumerFailure = {
  dimension: "consumer";
  check: Awaited<ReturnType<typeof checkConsumerLimitsAsync>>;
};
export type QuotaFailure = QpmFailure | TpmFailure | ConsumerFailure;

/** Account/model QPM (main account and sub-account buckets). */
export async function reserveQpm(ctx: InferenceContext): Promise<QpmFailure | null> {
  const caller = ctx.requireCaller();
  const result = await reserveAccountQpm({
    userId: caller.userId!,
    parentUserId: caller.parentUserId,
    modelId: ctx.modelId,
  });
  if (result.allowed) {
    ctx.qpmRemaining = result.remaining ?? null;
    return null;
  }
  return { dimension: "qpm", limit: result.limit, resetMs: result.resetMs };
}

/** Account/model TPM; the reservation is returned by reconcileTokens/release. */
export async function reserveTpm(ctx: InferenceContext, estimatedTokens: number): Promise<TpmFailure | null> {
  const caller = ctx.requireCaller();
  const result = await reserveAccountTpm({
    userId: caller.userId!,
    parentUserId: caller.parentUserId,
    modelId: ctx.modelId,
    estimatedTokens,
  });
  if (!result.allowed) return { dimension: "tpm", limit: result.limit, remaining: result.remaining };
  ctx.reservedTokens = estimatedTokens;
  return null;
}

/** Optional explicit per-key RPM override (API keys only). */
export async function checkConsumer(ctx: InferenceContext): Promise<ConsumerFailure | null> {
  const caller = ctx.requireCaller();
  const check = await checkConsumerLimitsAsync(caller.apiKeyId!, caller.rateLimitOverride);
  if (!check.allowed) return { dimension: "consumer", check };
  ctx.consumerRemaining = check.remaining;
  return null;
}

/** Returns the reserved TPM exactly once with the actual token count. */
export async function reconcileTokens(ctx: InferenceContext, actualTokens: number): Promise<void> {
  if (ctx.tokensReconciled) return;
  ctx.tokensReconciled = true;
  const caller = ctx.requireCaller();
  await reconcileAccountTpm({
    userId: caller.userId!,
    parentUserId: caller.parentUserId,
    modelId: ctx.modelId,
    reservedTokens: ctx.reservedTokens,
    actualTokens,
  });
}

// ------------------------------------------------------------- selectRoute

/**
 * Resolves the upstream (provider, channel, region) and its protocol
 * adapter. The adapter comes from provider/channel data (see ./adapters).
 */
export async function selectRoute(
  ctx: InferenceContext
): Promise<Extract<ResolveUpstreamResult, { ok: false }> | null> {
  const caller = ctx.requireCaller();
  const result = await resolveUpstream(ctx.modelId, {
    region: getRequestedRegion(ctx.req),
    userId: caller.userId,
  });
  if (!result.ok) return result;
  ctx.upstream = result.upstream;
  ctx.adapter = (await adapterForUpstream(
    result.upstream.providerId,
    result.upstream.channelId,
    result.upstream.nativeBaseUrl
  )).adapter;
  return null;
}

/** Adapter for a provider/channel pair, logging data/URL disagreements. */
export async function adapterForUpstream(providerId: string, channelId: string | null, baseUrl: string | null) {
  let channelAdapter: string | null = null;
  if (channelId) {
    try {
      channelAdapter = (await getProviderChannel(providerId, channelId))?.adapter ?? null;
    } catch {
      channelAdapter = null;
    }
  }
  const resolution = resolveUpstreamAdapter({ providerId, channelAdapter, baseUrl });
  if (resolution.mismatch) {
    logToSLS({
      status: "warning",
      providerId,
      channelId,
      errorCode: "adapter_mapping_mismatch",
      errorReason: `provider data says ${resolution.adapter}, legacy URL rule says ${resolution.mismatch.legacy}`,
    });
  }
  return resolution;
}

// ------------------------------------------------- reserveProviderCapacity

export async function reserveProviderCapacity(
  ctx: InferenceContext,
  estimatedTokens: number
): Promise<Extract<ProviderCapacityAcquireResult, { ok: false }> | null> {
  const capacity = await acquireProviderCapacity(ctx.requireUpstream(), ctx.modelId, estimatedTokens);
  if (!capacity.ok) return capacity;
  ctx.providerLease = capacity.lease;
  return null;
}

// ------------------------------------------------------------ reserveBilling

export async function reserveBilling(
  ctx: InferenceContext,
  estimatedAmount: number,
  refPrefix: string,
  ttlSeconds?: number
): Promise<BillingReservationFailureReason | null> {
  const caller = ctx.requireCaller();
  const result = await reserveBalanceWithReason(
    caller.userId!,
    estimatedAmount,
    `${refPrefix}:${randomUUID()}`,
    ttlSeconds
  );
  if (!result.reservation) return result.reason;
  ctx.billingReservation = result.reservation;
  return null;
}

// ----------------------------------------------------------- invokeUpstream

export interface UpstreamCall {
  /** Absolute URL, or a path appended to the chosen base. */
  url?: string;
  path?: string;
  base?: "openai" | "native" | "anthropic";
  method?: string;
  /** Extra headers; provider auth is added unless `auth: false`. */
  headers?: Record<string, string>;
  auth?: boolean;
  body?: unknown;
  timeoutMs?: number | null;
}

export function upstreamUrl(ctx: InferenceContext, call: Pick<UpstreamCall, "url" | "path" | "base">): string {
  if (call.url) return call.url;
  const upstream = ctx.requireUpstream();
  const base = call.base === "native"
    ? upstream.nativeBaseUrl
    : call.base === "anthropic"
      ? upstream.anthropicCompatBaseUrl || upstream.baseUrl
      : upstream.baseUrl;
  return `${base}${call.path || ""}`;
}

/** The only way pipeline stages talk to an upstream (outbound URL policy). */
export function invokeUpstream(ctx: InferenceContext, call: UpstreamCall): Promise<Response> {
  const upstream = ctx.requireUpstream();
  const callerSetsContentType = Object.keys(call.headers || {}).some((name) => name.toLowerCase() === "content-type");
  const headers: Record<string, string> = {
    ...(call.auth === false ? {} : getProviderAuthHeaders(upstream.providerId, upstream.apiKey)),
    ...(call.body !== undefined && !callerSetsContentType ? { "Content-Type": "application/json" } : {}),
    ...(call.headers || {}),
  };
  const timeout = call.timeoutMs === undefined ? UPSTREAM_TIMEOUT_MS : call.timeoutMs;
  return safeProviderFetch(upstreamUrl(ctx, call), {
    method: call.method || "POST",
    headers,
    ...(call.body !== undefined
      ? { body: typeof call.body === "string" ? call.body : JSON.stringify(call.body) }
      : {}),
    ...(timeout ? { signal: AbortSignal.timeout(timeout) } : {}),
  });
}

// -------------------------------------------------------------- settle/log

export async function settle(
  ctx: InferenceContext,
  amount: number,
  description: string,
  discountRate?: number,
  discountAmount?: number
) {
  return settleReservation(ctx.billingReservation!.id, amount, description, discountRate, discountAmount);
}

/** Fields every usage row of a routed request carries. */
export function usageBase(ctx: InferenceContext) {
  const caller = ctx.requireCaller();
  const upstream = ctx.upstream;
  return {
    region: upstream?.region,
    providerId: upstream?.providerId,
    channelId: upstream?.channelId,
    logId: ctx.logId,
    apiKeyId: caller.apiKeyId,
    userId: caller.userId,
    model: ctx.modelId,
    reservationId: ctx.billingReservation?.id,
  };
}

export const logUsage = persistUsage;

// ------------------------------------------------------------------ release

/**
 * Always runs from `finally`: releases an unsettled billing reservation,
 * returns any unreconciled TPM reservation and the provider capacity lease.
 */
export async function release(
  ctx: InferenceContext,
  options: { releaseReason?: string; reconcileTokens?: boolean; releaseReservation?: boolean } = {}
): Promise<void> {
  // Async media routes hand their reservation to the task lifecycle
  // (billAsyncSuccess/billAsyncError) and opt out here.
  if (options.releaseReservation !== false && ctx.billingReservation && !ctx.billableResponseReceived) {
    await releaseReservation(ctx.billingReservation.id, options.releaseReason);
  }
  if (options.reconcileTokens !== false && ctx.reservedTokens > 0 && !ctx.tokensReconciled) {
    try {
      await reconcileTokens(ctx, 0);
    } catch {
      // A failed return only over-counts the 60-second TPM window.
    }
  }
  const lease = ctx.providerLease;
  ctx.providerLease = null;
  await releaseProviderCapacity(lease, ctx.actualProviderTokens);
}
