/**
 * NF_TRAFFIC_MODE decisions (P4): which capacity scopes a request consumes
 * and what happens when they are full.
 *
 *   chat  → try the next candidate route of the same model; when none has
 *           capacity, 429 capacity_exhausted + Retry-After (D1).
 *   async → the task is queued (see queue.ts), bounded depth and wait.
 */
import type { CpQuotaPool, CpRoute } from "../control-plane/schema";
import type { LoadedControlPlane } from "../control-plane/runtime";
import { controlPlaneRuntime } from "../control-plane/runtime";
import { effectivePolicy, type EffectivePolicy } from "./policy";
import type { ScopeLimit } from "./reservation";

export type OverflowBehavior = "failover" | "queue";

/** The cp route serving `modelId` through a legacy provider id. */
export function controlPlaneRouteFor(snapshot: LoadedControlPlane, modelId: string, providerId: string): CpRoute | null {
  for (const route of snapshot.routesByModel.get(modelId) || []) {
    const account = snapshot.accounts.get(route.account_id);
    if ((account?.legacy_provider_id || route.account_id) === providerId) return route;
  }
  return null;
}

function share(limit: number, fraction: number): number {
  if (!limit) return 0;
  return Math.max(1, Math.floor(limit * fraction));
}

/**
 * Route → pool → caller's fair share, in that order. The fair share is
 * taken of the pool when the route has one (the scarce shared resource),
 * otherwise of the route.
 */
export function scopesFor(
  snapshot: LoadedControlPlane,
  route: CpRoute,
  userId: string | null,
  policy: EffectivePolicy
): ScopeLimit[] {
  const scopes: ScopeLimit[] = [{
    id: `route:${route.id}`,
    rpm: route.rpm,
    tpm: route.tpm,
    concurrency: route.concurrency,
    daily: route.daily,
  }];
  const pool: CpQuotaPool | null = route.quota_pool_id ? snapshot.pools.get(route.quota_pool_id) || null : null;
  if (pool) {
    scopes.push({ id: `pool:${pool.id}`, rpm: pool.rpm, tpm: pool.tpm, concurrency: pool.concurrency, daily: pool.daily });
  }
  if (policy.fairShare && userId) {
    const base = pool
      ? { key: `pool:${pool.id}`, rpm: pool.rpm, tpm: pool.tpm, concurrency: pool.concurrency, daily: pool.daily }
      : { key: `route:${route.id}`, rpm: route.rpm, tpm: route.tpm, concurrency: route.concurrency, daily: route.daily };
    scopes.push({
      id: `share:${base.key}:${userId}`,
      rpm: share(base.rpm, policy.fairShare),
      tpm: share(base.tpm, policy.fairShare),
      concurrency: share(base.concurrency, policy.fairShare),
      daily: share(base.daily, policy.fairShare),
    });
  }
  return scopes;
}

/** OpenAI-style 429 body for capacity exhaustion. */
export function openAiCapacityError(message: string) {
  return { error: { message, type: "rate_limit_error", code: "capacity_exhausted" } };
}

/** Anthropic-style 429 body for capacity exhaustion. */
export function anthropicCapacityError(message: string) {
  return { type: "error", error: { type: "rate_limit_error", message } };
}

export function capacityExhaustedMessage(modelId: string, retryAfterS: number): string {
  return `All upstream capacity for model '${modelId}' is currently in use. Retry after ${retryAfterS} seconds.`;
}

/** Async overflow policy for a model/user (built-in defaults without a version). */
export function asyncPolicy(modelId: string, userId: string | null): EffectivePolicy {
  return effectivePolicy(controlPlaneRuntime.get(), { modelId, kind: "async", userId });
}
