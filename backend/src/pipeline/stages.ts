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
import { getRequestedRegion, resolveUpstream, resolveUpstreamFromControlPlane, type ResolvedUpstream, type ResolveUpstreamResult } from "../services/upstream";
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
import { controlPlaneMode, paramMode, protocolMode, trafficMode } from "../config/feature-flags";
import { droppedParamNames, guardedParamsRequested, passthroughChatRequest } from "../control-plane/params";
import { cpModelFromAIModel } from "../control-plane/mapping";
import { CHAT_PROTOCOLS, type CpModel, type CpProtocol } from "../control-plane/schema";
import { recordShadowDiff, runShadow } from "../services/shadow";
import { controlPlaneRuntime, isModelServable, type LoadedControlPlane } from "../control-plane/runtime";
import { controlPlaneCandidates, diffModel, diffRoute } from "../control-plane/shadow-compare";
import { effectivePolicy } from "../traffic/policy";
import { coolingRoutes, parseRetryAfter, recordUpstreamCooldown, reserveScopes } from "../traffic/reservation";
import { capacityExhaustedMessage, controlPlaneRouteFor, scopesFor, type OverflowBehavior } from "../traffic/engine";
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
  const mode = controlPlaneMode();
  const snapshot = mode === "legacy" ? null : controlPlaneRuntime.get();
  if (mode === "enforce" && snapshot) {
    // NF_CP_MODE=enforce: the published version decides, including the
    // preview allowlist and retired models (with their replacement hint).
    const cp = snapshot.models.get(modelId);
    const servable = !!cp && isModelServable(cp, ctx.caller?.userId ?? null);
    ctx.model = servable ? snapshot.aiModels.get(modelId) || null : null;
    ctx.retiredReplacement = cp?.lifecycle === "retired" ? cp.replacement_model_id ?? null : null;
    return !!ctx.model;
  }
  ctx.model = findModel(modelId) || null;
  if (mode === "shadow" && snapshot) {
    const legacy = ctx.model;
    const userId = ctx.caller?.userId ?? null;
    const diffs = (() => {
      try {
        return diffModel(modelId, legacy, snapshot, userId).map((diff) => ({ route: ctx.route, version: snapshot.version, ...diff }));
      } catch {
        return null; // reported by runShadow below
      }
    })();
    void runShadow("cp_resolve_model", () => {
      if (!diffs) throw new Error("cp_resolve_model comparison failed");
      return diffs.filter((diff) => diff.kind !== "pricing");
    });
    void runShadow("cp_pricing", () => (diffs || []).filter((diff) => diff.kind === "pricing"));
  }
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
  const mode = controlPlaneMode();
  const snapshot = mode === "shadow" ? controlPlaneRuntime.get() : null;
  if (snapshot) {
    const decision = result.ok
      ? { ok: true, providerId: result.upstream.providerId, upstreamModelId: result.upstream.upstreamModelId }
      : { ok: false, code: result.code };
    void runShadow("cp_select_route", () =>
      diffRoute(ctx.modelId, decision, snapshot).map((diff) => ({ route: ctx.route, version: snapshot.version, ...diff }))
    );
  }
  if (!result.ok) return result;
  ctx.upstream = trafficMode() === "enforce"
    ? await failoverToRouteWithCapacity(ctx, result.upstream)
    : result.upstream;
  ctx.adapter = (await adapterForUpstream(
    ctx.upstream.providerId,
    ctx.upstream.channelId,
    ctx.upstream.nativeBaseUrl
  )).adapter;
  return null;
}

/**
 * NF_TRAFFIC_MODE=enforce, D1: walk the model's candidate routes in order
 * and keep the first whose route/pool/fair-share scopes still admit the
 * request (dry run; the real reservation follows in reserveProviderCapacity).
 * Choosing here keeps the upstream fixed for the rest of the handler. When
 * every candidate is full the first choice is kept, and the reservation
 * then answers 429 (chat) or queues (async).
 */
async function failoverToRouteWithCapacity(ctx: InferenceContext, first: ResolvedUpstream): Promise<ResolvedUpstream> {
  const snapshot = controlPlaneRuntime.get();
  if (!snapshot || !first.managed) return first;
  const userId = ctx.caller?.userId ?? null;
  const policy = effectivePolicy(snapshot, { modelId: ctx.modelId, userId });
  const tried = new Set<string>();
  let current = first;
  for (;;) {
    const route = controlPlaneRouteFor(snapshot, ctx.modelId, current.providerId);
    if (!route) return current;
    const cooling = await coolingRoutes([route.id]);
    if (!cooling.has(route.id)) {
      const check = await reserveScopes({ scopes: scopesFor(snapshot, route, userId, policy), estimatedTokens: 0, dryRun: true });
      if (check.allowed || check.reason === "redis_unavailable") return current;
    }
    tried.add(current.providerId);
    const next = await resolveUpstreamFromControlPlane(ctx.modelId, snapshot, {
      region: getRequestedRegion(ctx.req),
      userId,
      excludeProviders: tried,
    });
    if (!next.ok) return first;
    logToSLS({ status: "info", model: ctx.modelId, providerId: next.upstream.providerId, errorCode: "capacity_failover", errorReason: `from ${current.providerId}` });
    current = next.upstream;
  }
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

export type CapacityFailure = Extract<ProviderCapacityAcquireResult, { ok: false }> | {
  ok: false;
  /** NF_TRAFFIC_MODE=enforce overflow: 429 + Retry-After instead of 503 (D1). */
  code: "capacity_exhausted";
  status: 429;
  reason: string;
  message: string;
  retryAfterSeconds: number;
  /** Async routes queue the task instead of failing (see traffic/queue.ts). */
  queue: boolean;
};

/**
 * Reserves upstream capacity for the selected route. NF_TRAFFIC_MODE:
 * legacy → per-route limiter only; shadow → the same, plus a dry run of the
 * route/pool/fair-share rules whose would-be decision is logged; enforce →
 * the multi-scope reservation with failover (chat) or queueing (async).
 */
export async function reserveProviderCapacity(
  ctx: InferenceContext,
  estimatedTokens: number,
  options: { overflow?: OverflowBehavior } = {}
): Promise<CapacityFailure | null> {
  const overflow = options.overflow ?? "failover";
  const mode = trafficMode();
  const snapshot = mode === "legacy" ? null : controlPlaneRuntime.get();
  if (mode === "enforce" && snapshot && ctx.requireUpstream().managed) {
    return reserveTrafficEnforced(ctx, estimatedTokens, snapshot, overflow);
  }
  const capacity = await acquireProviderCapacity(ctx.requireUpstream(), ctx.modelId, estimatedTokens);
  if (mode === "shadow" && snapshot && ctx.upstream?.managed) {
    const upstream = ctx.upstream;
    const userId = ctx.caller?.userId ?? null;
    void runShadow("traffic", async () => {
      const decision = await trafficDryRun(snapshot, ctx.modelId, upstream.providerId, userId, estimatedTokens, overflow);
      const legacy = capacity.ok ? "admit" : "reject_503";
      if (decision.decision === legacy) return [];
      return [{ route: ctx.route, model: ctx.modelId, providerId: upstream.providerId, legacy, enforce: decision.decision, scope: decision.scope }];
    });
  }
  if (!capacity.ok) return capacity;
  ctx.providerLease = capacity.lease;
  return null;
}

/**
 * HTTP status for a capacity failure: 429 + Retry-After for the enforce
 * overflow (D1), otherwise the legacy 503.
 */
export function capacityHttpStatus(res: { setHeader(name: string, value: string): unknown }, failure: CapacityFailure): number {
  if (failure.code === "capacity_exhausted") {
    res.setHeader("Retry-After", String(failure.retryAfterSeconds));
    return 429;
  }
  return 503;
}

/** Error `type` for a capacity failure in OpenAI/Anthropic bodies. */
export function capacityErrorType(failure: CapacityFailure, legacyType: string): string {
  return failure.code === "capacity_exhausted" ? "rate_limit_error" : legacyType;
}

/** What NF_TRAFFIC_MODE=enforce would decide, without reserving anything. */
async function trafficDryRun(
  snapshot: LoadedControlPlane,
  modelId: string,
  providerId: string,
  userId: string | null,
  estimatedTokens: number,
  overflow: OverflowBehavior
): Promise<{ decision: "admit" | "failover" | "reject_429" | "queue"; scope: string | null }> {
  const route = controlPlaneRouteFor(snapshot, modelId, providerId);
  if (!route) return { decision: "admit", scope: null };
  const policy = effectivePolicy(snapshot, { modelId, kind: overflow === "queue" ? "async" : "chat", userId });
  const result = await reserveScopes({ scopes: scopesFor(snapshot, route, userId, policy), estimatedTokens, dryRun: true });
  if (result.allowed) return { decision: "admit", scope: null };
  if (overflow === "queue") return { decision: "queue", scope: result.scope };
  for (const other of controlPlaneCandidates(snapshot, modelId)) {
    if (other.id === route.id) continue;
    const alt = await reserveScopes({ scopes: scopesFor(snapshot, other, userId, policy), estimatedTokens, dryRun: true });
    if (alt.allowed) return { decision: "failover", scope: result.scope };
  }
  return { decision: "reject_429", scope: result.scope };
}

async function reserveTrafficEnforced(
  ctx: InferenceContext,
  estimatedTokens: number,
  snapshot: LoadedControlPlane,
  overflow: OverflowBehavior
): Promise<CapacityFailure | null> {
  const upstream = ctx.requireUpstream();
  const userId = ctx.caller?.userId ?? null;
  const policy = effectivePolicy(snapshot, { modelId: ctx.modelId, kind: overflow === "queue" ? "async" : "chat", userId });
  const route = controlPlaneRouteFor(snapshot, ctx.modelId, upstream.providerId);
  if (!route) {
    // Not a control-plane route (e.g. a legacy-only provider): legacy limiter.
    const capacity = await acquireProviderCapacity(upstream, ctx.modelId, estimatedTokens);
    if (!capacity.ok) return capacity;
    ctx.providerLease = capacity.lease;
    return null;
  }
  let reason: string;
  let retryAfterSeconds = policy.chat.retryAfterS;
  const cooling = await coolingRoutes([route.id]);
  if (cooling.has(route.id)) {
    reason = "upstream_cooldown";
    retryAfterSeconds = Math.max(1, Math.ceil((cooling.get(route.id)! - Date.now()) / 1000));
  } else {
    const result = await reserveScopes({ scopes: scopesFor(snapshot, route, userId, policy), estimatedTokens });
    if (result.allowed) {
      ctx.providerLease = {
        providerId: upstream.providerId,
        modelId: ctx.modelId,
        managed: true,
        leaseId: null,
        traffic: { leaseId: result.leaseId, scopes: result.scopes },
      };
      return null;
    }
    if (result.reason === "redis_unavailable") {
      // Fail closed, exactly like the legacy managed limiter.
      return {
        ok: false,
        code: "provider_capacity_store_unavailable",
        reason: "redis_unavailable",
        message: "Managed provider capacity cannot be verified right now.",
      };
    }
    reason = `${result.scope}:${result.reason}`;
  }
  logToSLS({ status: "rejected", model: ctx.modelId, providerId: upstream.providerId, errorCode: "capacity_exhausted", errorReason: reason });
  return {
    ok: false,
    code: "capacity_exhausted",
    status: 429,
    reason,
    message: capacityExhaustedMessage(ctx.modelId, retryAfterSeconds),
    retryAfterSeconds,
    queue: overflow === "queue",
  };
}

/**
 * Upstream 429 (NF_TRAFFIC_MODE≠legacy): the route cools down for the
 * upstream's Retry-After (default from policy). Shared through Redis, so
 * all processes skip it. Shadow only logs what would have happened.
 */
export async function noteUpstreamRateLimited(ctx: InferenceContext, retryAfterHeader: string | null): Promise<void> {
  const mode = trafficMode();
  if (mode === "legacy" || !ctx.upstream) return;
  const snapshot = controlPlaneRuntime.get();
  if (!snapshot) return;
  const route = controlPlaneRouteFor(snapshot, ctx.modelId, ctx.upstream.providerId);
  if (!route) return;
  const policy = effectivePolicy(snapshot, { modelId: ctx.modelId });
  const seconds = parseRetryAfter(retryAfterHeader, policy.chat.retryAfterS);
  if (mode === "shadow") {
    recordShadowDiff("traffic", { route: ctx.route, model: ctx.modelId, routeId: route.id, legacy: "none", enforce: "cooldown", seconds });
    return;
  }
  await recordUpstreamCooldown(route.id, seconds);
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
  }).then((response) => {
    if (response.status === 429) {
      void noteUpstreamRateLimited(ctx, response.headers.get("retry-after")).catch(() => undefined);
    }
    return response;
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

// ------------------------------------------------------------ chat params

export type ParamFailure = {
  status: 400;
  error: { message: string; type: "invalid_request_error"; code: "unsupported_parameter"; param: string };
};

function cpModelFor(ctx: InferenceContext): CpModel {
  const snapshot = controlPlaneRuntime.get();
  return snapshot?.models.get(ctx.modelId) || cpModelFromAIModel(ctx.requireModel());
}

/**
 * NF_PARAM_MODE=enforce (D2): billing_guarded parameters the model's
 * billing cannot price are rejected with 400 unsupported_parameter. Runs
 * before any quota or billing reservation.
 */
export function checkGuardedParams(ctx: InferenceContext, body: Record<string, unknown>): ParamFailure | null {
  if (paramMode() !== "enforce") return null;
  const cp = cpModelFor(ctx);
  const guarded = guardedParamsRequested(body, cp.param_overrides?.allow_guarded || []);
  if (!guarded.length) return null;
  return {
    status: 400,
    error: {
      message: `Parameter '${guarded[0]}' is not supported for model '${ctx.modelId}': it changes cost or resource usage that the platform cannot bill yet.`,
      type: "invalid_request_error",
      code: "unsupported_parameter",
      param: guarded[0],
    },
  };
}

/**
 * NF_PARAM_MODE (D2). legacy: the legacy allow-list request. shadow: the
 * same request; only the *names* of parameters legacy dropped, and of
 * guarded parameters enforce would reject, are logged. enforce: every
 * client parameter is passed through (guarded ones were rejected earlier
 * by checkGuardedParams), then the model's rewrite/fixed overrides apply.
 */
export function prepareChatParams(
  ctx: InferenceContext,
  body: Record<string, unknown>,
  legacyRequest: Record<string, unknown>
): Record<string, unknown> {
  const mode = paramMode();
  if (mode === "legacy") return legacyRequest;
  const cp = cpModelFor(ctx);
  if (mode === "shadow") {
    const dropped = droppedParamNames(body, legacyRequest);
    const guarded = guardedParamsRequested(body, cp.param_overrides?.allow_guarded || []);
    if (dropped.length || guarded.length) {
      recordShadowDiff("params", {
        route: ctx.route,
        model: ctx.modelId,
        userId: ctx.caller?.userId ?? null,
        apiKeyId: ctx.caller?.apiKeyId ?? null,
        dropped,
        wouldReject: guarded,
      });
    }
    return legacyRequest;
  }
  return passthroughChatRequest(body, legacyRequest, cp.param_overrides);
}

// ---------------------------------------------------------------- protocol

export type ProtocolFailure = { status: 400; message: string; available: CpProtocol[] };

/**
 * NF_PROTOCOL_MODE=enforce (D6): a model is only served on the chat
 * protocols its routes support natively (cp `protocols`). Without a
 * loaded control-plane version this stays legacy (logged).
 */
export function checkProtocol(ctx: InferenceContext, protocol: CpProtocol): ProtocolFailure | null {
  if (protocolMode() !== "enforce") return null;
  const snapshot = controlPlaneRuntime.get();
  const cp = snapshot?.models.get(ctx.modelId);
  if (!cp) {
    logToSLS({ status: "warning", model: ctx.modelId, errorCode: "protocol_enforce_without_version", errorReason: protocol });
    return null;
  }
  if (cp.protocols.includes(protocol)) return null;
  const available = cp.protocols.filter((item) => CHAT_PROTOCOLS.has(item));
  return {
    status: 400,
    available,
    message: `Model '${ctx.modelId}' does not support the ${protocol} protocol. Available protocols: ${available.join(", ") || "none"}.`,
  };
}

/** Whether /v1/messages would forward natively (vs. the legacy protocol bridge). */
export function anthropicPassThrough(upstream: ResolvedUpstream, model: AIModel): boolean {
  return upstream.providerId === "anthropic"
    || model.anthropicPassThrough === true
    || (!!upstream.anthropicCompatBaseUrl && model.anthropicPassThrough !== false);
}
