import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import {
  decrementProviderConcurrencyAsync,
  getProviderConcurrencyAsync,
  getProviderDailyUsageAsync,
  getProviderUsageStatsAsync,
  incrementProviderConcurrencyAsync,
  recordProviderTokens,
  recordRequest,
  releaseProviderCapacityAsync,
  reserveProviderCapacityAsync,
  type ProviderCapacityReservation,
} from "./rate-limiter";
import { decryptProviderSecret } from "../utils/provider-secrets";
import {
  getLatestProviderSlaEvidence,
  getMatchingRoutePolicy,
} from "../data/provider-operations";
import { getAllActiveProviderCostTiers } from "./provider-costs";
import {
  satisfiesMinimumObservedAvailability,
} from "./provider-monitor-semantics";
import {
  channelAllowsModel,
  getProviderChannelConfig,
  isChannelUsable,
} from "../data/provider-channels";

export interface ProviderEndpoint {
  providerId: string;
  providerName: string;
  apiBaseUrl: string;
  apiKey: string;
  modelId: string;
  rpm: number;
  tpm: number;
  dailyLimit: number;
  concurrentLimit: number;
  weight: number;
  priority: number;
  isEnabled: boolean;
}

export interface ProviderSelectionContext {
  userId?: string | null;
}

export interface ProviderCapacityRoute {
  providerId: string;
  managed: boolean;
  rpm?: number;
  tpm?: number;
  dailyLimit?: number;
  concurrentLimit?: number;
}

export interface ProviderRequestCapacityLease {
  providerId: string;
  modelId: string;
  managed: boolean;
  leaseId: string | null;
}

export type ProviderCapacityAcquireResult =
  | { ok: true; lease: ProviderRequestCapacityLease }
  | {
      ok: false;
      code: "provider_capacity_exhausted" | "provider_capacity_store_unavailable";
      reason: Exclude<ProviderCapacityReservation, { allowed: true }>["reason"];
      message: string;
    };

export interface HealthRecord {
  providerId: string;
  modelId: string;
  status: "unknown" | "healthy" | "degraded" | "down";
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  avgLatencyMs: number;
}

export type ModelAvailability = {
  status: "available" | "temporarily_unavailable";
  reason: null | "provider_not_configured" | "no_active_route" | "provider_unhealthy";
};

const FAILURE_THRESHOLD_DOWN = 10;
const concurrentRequests = new Map<string, number>();

async function hasUsableProviderCredential(
  providerId: string,
  modelId: string,
  providerApiKey: string
): Promise<boolean> {
  if (providerApiKey) return true;
  try {
    const config = await getProviderChannelConfig(providerId);
    return !!config && Object.values(config.channels).some(
      (channel) => isChannelUsable(channel) && channelAllowsModel(channel, modelId)
    );
  } catch {
    return false;
  }
}

async function getHealthRecord(providerId: string, modelId: string): Promise<HealthRecord | null> {
  const row = await db.queryOne<any>("SELECT * FROM provider_health WHERE provider_id = ? AND model_id = ?", [providerId, modelId]);
  if (!row) return null;
  return {
    providerId: row.provider_id,
    modelId: row.model_id,
    status: row.status,
    consecutiveFailures: row.consecutive_failures,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastError: row.last_error,
    avgLatencyMs: row.avg_latency_ms,
  };
}

export async function recordSuccess(providerId: string, modelId: string, latencyMs: number): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO provider_health (id, provider_id, model_id, status, consecutive_failures, last_success_at, last_failure_at, last_error, avg_latency_ms, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_id, model_id) DO UPDATE SET
       status = excluded.status,
       consecutive_failures = excluded.consecutive_failures,
       last_success_at = excluded.last_success_at,
       last_error = excluded.last_error,
       avg_latency_ms = CASE
         WHEN provider_health.last_success_at IS NOT NULL OR provider_health.last_failure_at IS NOT NULL
           THEN ROUND(provider_health.avg_latency_ms * 0.7 + excluded.avg_latency_ms * 0.3)
         ELSE excluded.avg_latency_ms
       END,
       updated_at = excluded.updated_at
     WHERE provider_health.updated_at IS NULL OR provider_health.updated_at <= excluded.updated_at`,
    [uuidv4(), providerId, modelId, "healthy", 0, now, null, null, Math.max(0, Math.round(latencyMs)), now]
  );
}

export async function recordFailure(providerId: string, modelId: string, error: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO provider_health (id, provider_id, model_id, status, consecutive_failures, last_success_at, last_failure_at, last_error, avg_latency_ms, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_id, model_id) DO UPDATE SET
       status = CASE
         WHEN provider_health.consecutive_failures + 1 >= ? THEN 'down'
         ELSE 'degraded'
       END,
       consecutive_failures = provider_health.consecutive_failures + 1,
       last_failure_at = excluded.last_failure_at,
       last_error = excluded.last_error,
       updated_at = excluded.updated_at
     WHERE provider_health.updated_at IS NULL OR provider_health.updated_at <= excluded.updated_at`,
    [uuidv4(), providerId, modelId, "degraded", 1, null, now, error, 0, now, FAILURE_THRESHOLD_DOWN]
  );
}

export function acquireConcurrency(providerId: string, modelId: string): void {
  const key = `${providerId}:${modelId}`;
  concurrentRequests.set(key, (concurrentRequests.get(key) || 0) + 1);
  void incrementProviderConcurrencyAsync(providerId, modelId).catch((error) => {
    console.warn("[scheduler] distributed concurrency increment failed:", error instanceof Error ? error.message : String(error));
  });
}

export function releaseConcurrency(providerId: string, modelId: string): void {
  const key = `${providerId}:${modelId}`;
  concurrentRequests.set(key, Math.max(0, (concurrentRequests.get(key) || 0) - 1));
  void decrementProviderConcurrencyAsync(providerId, modelId).catch((error) => {
    console.warn("[scheduler] distributed concurrency decrement failed:", error instanceof Error ? error.message : String(error));
  });
}

export async function acquireProviderCapacity(
  route: ProviderCapacityRoute,
  modelId: string,
  estimatedTokens = 0
): Promise<ProviderCapacityAcquireResult> {
  if (!route.managed) {
    recordRequest(route.providerId, modelId, "capacity-lease", 0);
    acquireConcurrency(route.providerId, modelId);
    return {
      ok: true,
      lease: {
        providerId: route.providerId,
        modelId,
        managed: false,
        leaseId: null,
      },
    };
  }

  let reservation: ProviderCapacityReservation;
  try {
    reservation = await reserveProviderCapacityAsync({
      providerId: route.providerId,
      modelId,
      estimatedTokens,
      limits: {
        rpm: route.rpm || 0,
        tpm: route.tpm || 0,
        dailyLimit: route.dailyLimit || 0,
        concurrentLimit: route.concurrentLimit || 0,
      },
    });
  } catch (error) {
    console.error(
      "[scheduler] managed provider capacity reservation failed:",
      error instanceof Error ? error.message : String(error)
    );
    reservation = { allowed: false, reason: "redis_unavailable" };
  }

  if (!reservation.allowed) {
    const storeUnavailable =
      reservation.reason === "redis_unavailable" || reservation.reason === "redis_state_invalid";
    return {
      ok: false,
      code: storeUnavailable
        ? "provider_capacity_store_unavailable"
        : "provider_capacity_exhausted",
      reason: reservation.reason,
      message: storeUnavailable
        ? "Managed provider capacity cannot be verified right now."
        : `Managed provider ${reservation.reason} capacity is exhausted.`,
    };
  }

  const key = `${route.providerId}:${modelId}`;
  concurrentRequests.set(key, (concurrentRequests.get(key) || 0) + 1);
  return {
    ok: true,
    lease: {
      providerId: route.providerId,
      modelId,
      managed: true,
      leaseId: reservation.leaseId,
    },
  };
}

export async function releaseProviderCapacity(
  lease: ProviderRequestCapacityLease | null,
  actualTokens = 0
): Promise<void> {
  if (!lease) return;
  const key = `${lease.providerId}:${lease.modelId}`;
  concurrentRequests.set(key, Math.max(0, (concurrentRequests.get(key) || 0) - 1));

  if (!lease.managed) {
    recordProviderTokens(lease.providerId, lease.modelId, actualTokens);
    void decrementProviderConcurrencyAsync(lease.providerId, lease.modelId).catch((error) => {
      console.warn("[scheduler] distributed concurrency decrement failed:", error instanceof Error ? error.message : String(error));
    });
    return;
  }

  if (!lease.leaseId) {
    console.error("[scheduler] managed provider capacity lease is missing its Redis lease id");
    return;
  }
  try {
    await releaseProviderCapacityAsync({
      providerId: lease.providerId,
      modelId: lease.modelId,
      leaseId: lease.leaseId,
      actualTokens,
    });
  } catch (error) {
    // The Redis lease and concurrency key both have a bounded TTL. Surface the
    // failed release loudly; never mutate a per-process fallback for a managed
    // route because that would hide cross-node capacity state.
    console.error(
      "[scheduler] managed provider capacity release failed:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function getManagedRouteCount(modelId: string): Promise<number> {
  const row = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM provider_capacity WHERE model_id = ?",
    [modelId]
  );
  return Number(row?.count || 0);
}

export async function selectProvider(modelId: string, context: ProviderSelectionContext = {}): Promise<ProviderEndpoint | null> {
  const endpoints = await db.queryMany<any>(
    `SELECT
      p.id as provider_id,
      p.name as provider_name,
      p.api_base_url,
      p.api_key,
      pc.model_id,
      pc.rpm_limit as rpm,
      pc.tpm_limit as tpm,
      pc.daily_limit as daily_limit,
      pc.concurrent_limit as concurrent_limit,
      pc.weight as weight,
      pc.priority as priority,
      pc.is_enabled as is_enabled
    FROM provider_capacity pc
    JOIN providers p ON pc.provider_id = p.id
    WHERE pc.model_id = ? AND pc.is_enabled = TRUE AND p.status = 'enabled'
    ORDER BY pc.priority DESC, pc.weight DESC`,
    [modelId]
  );
  if (endpoints.length === 0) return null;

  const [policy, activeCostTiers] = await Promise.all([
    getMatchingRoutePolicy(context.userId, modelId),
    getAllActiveProviderCostTiers(),
  ]);
  const costByRoute = new Map<string, {
    prompt_cost: number;
    completion_cost: number;
    fixed_cost: number;
  }>();
  for (const tier of activeCostTiers) {
    const key = `${tier.providerId}:${tier.modelId}`;
    const current = costByRoute.get(key);
    costByRoute.set(key, {
      // Routing does not currently receive request token counts. Use the
      // highest active tier as the conservative policy/ranking cost instead
      // of silently evaluating every request at the cheapest tier.
      prompt_cost: Math.max(current?.prompt_cost ?? 0, tier.promptCost),
      completion_cost: Math.max(current?.completion_cost ?? 0, tier.completionCost),
      fixed_cost: Math.max(current?.fixed_cost ?? 0, tier.fixedCost),
    });
  }

  const runtimeUsage = new Map<string, {
    available: boolean;
    rpm: number;
    tpm: number;
    daily: number;
    distributedConcurrency: number;
  }>(
    await Promise.all(
      endpoints.map(async (ep) => {
        const [minute, daily, distributedConcurrency] = await Promise.all([
          getProviderUsageStatsAsync(ep.provider_id, ep.model_id),
          getProviderDailyUsageAsync(ep.provider_id, ep.model_id),
          getProviderConcurrencyAsync(ep.provider_id, ep.model_id),
        ]);
        return [
          `${ep.provider_id}:${ep.model_id}`,
          {
            available: minute.available && distributedConcurrency !== null,
            rpm: minute.available ? minute.rpm : 0,
            tpm: minute.available ? minute.tpm : 0,
            daily,
            distributedConcurrency: distributedConcurrency ?? 0,
          },
        ] as const;
      })
    )
  );

  const available: Array<{
    ep: any;
    health: HealthRecord | null;
    apiKey: string;
    usage: {
      available: boolean;
      rpm: number;
      tpm: number;
      daily: number;
      distributedConcurrency: number;
    };
  }> = [];
  for (const ep of endpoints) {
    if (!ep.is_enabled) continue;
    let apiKey = "";
    try {
      apiKey = decryptProviderSecret(ep.api_key || "").trim();
    } catch {
      apiKey = "";
    }
    // A provider-level key is optional when an enabled channel owns its key.
    // resolveManagedUpstream performs the final channel/region choice; excluding
    // channel-only credentials here would make a valid managed route unusable.
    if (!(await hasUsableProviderCredential(ep.provider_id, ep.model_id, apiKey))) continue;
    if (policy?.pinned_provider_id && policy.strategy === "pinned" && ep.provider_id !== policy.pinned_provider_id) continue;
    if (policy?.allowed_providers.length && !policy.allowed_providers.includes(ep.provider_id)) continue;
    if (policy?.blocked_providers.includes(ep.provider_id)) continue;
    const cost = costByRoute.get(`${ep.provider_id}:${ep.model_id}`);
    if (policy?.strategy === "lowest_cost" && !cost) continue;
    if (policy?.max_prompt_cost !== null && policy?.max_prompt_cost !== undefined) {
      if (!cost || cost.prompt_cost > policy.max_prompt_cost) continue;
    }
    if (policy?.max_completion_cost !== null && policy?.max_completion_cost !== undefined) {
      if (!cost || cost.completion_cost > policy.max_completion_cost) continue;
    }
    const health = await getHealthRecord(ep.provider_id, ep.model_id);
    if (health?.status === "down") continue;
    if (policy?.min_availability !== null && policy?.min_availability !== undefined) {
      // min_availability is only enforceable with request-count evidence.
      // Missing evidence is unknown and fails closed; circuit state is never
      // converted into an invented availability percentage.
      const slaEvidence = await getLatestProviderSlaEvidence(ep.provider_id, ep.model_id);
      if (!satisfiesMinimumObservedAvailability(
        policy.min_availability,
        slaEvidence?.total_requests,
        slaEvidence?.success_requests
      )) continue;
    }
    const key = `${ep.provider_id}:${ep.model_id}`;
    const usage = runtimeUsage.get(key) || {
      available: false,
      rpm: 0,
      tpm: 0,
      daily: 0,
      distributedConcurrency: 0,
    };
    // Cross-node managed capacity is unknown when Redis cannot be read. Do not
    // turn an unavailable truth source into a routable zero.
    if (!usage.available) continue;
    if (ep.rpm > 0 && usage.rpm >= ep.rpm) continue;
    if (ep.tpm > 0 && usage.tpm >= ep.tpm) continue;
    if (ep.daily_limit > 0 && usage.daily >= ep.daily_limit) continue;
    const localConcurrency = concurrentRequests.get(key) || 0;
    const observedConcurrency = Math.max(localConcurrency, usage.distributedConcurrency);
    // Zero is an explicit "unlimited" value for synchronous text routes.
    if (ep.concurrent_limit > 0 && observedConcurrency >= ep.concurrent_limit) continue;
    available.push({ ep, health, apiKey, usage });
  }

  if (available.length === 0) return null;

  const weighted = available.map(({ ep, health, apiKey, usage }) => {
    const remainingRpm = Math.max(0, ep.rpm - usage.rpm);
    const healthMultiplier = health?.status === "degraded" ? 0.3 : 1.0;
    const capacityRatio = ep.rpm > 0 ? remainingRpm / ep.rpm : 1;
    const cost = costByRoute.get(`${ep.provider_id}:${ep.model_id}`);
    const costPenalty = policy?.strategy === "lowest_cost" && cost
      ? 1 / Math.max(0.0001, cost.prompt_cost + cost.completion_cost + cost.fixed_cost)
      : 1;
    // "highest_sla" is a legacy strategy key. This multiplier ranks the
    // current observed health state; it is not an SLA or availability percent.
    const observedHealthRankBoost = policy?.strategy === "highest_sla"
      ? (health?.status === "healthy" ? 2 : 0.5)
      : 1;
    const customBoost = policy?.priority_boost[ep.provider_id] ?? 0;
    const score = (ep.weight + customBoost) * capacityRatio * healthMultiplier * observedHealthRankBoost * costPenalty * (1 + ep.priority * 0.1);
    return { endpoint: ep, apiKey, score };
  });

  weighted.sort((a, b) => b.score - a.score);
  const selectedRoute = weighted[0];
  const selected = selectedRoute.endpoint;
  return {
    providerId: selected.provider_id,
    providerName: selected.provider_name,
    apiBaseUrl: selected.api_base_url,
    apiKey: selectedRoute.apiKey,
    modelId: selected.model_id,
    rpm: selected.rpm,
    tpm: selected.tpm,
    dailyLimit: selected.daily_limit,
    concurrentLimit: selected.concurrent_limit,
    weight: selected.weight,
    priority: selected.priority,
    isEnabled: !!selected.is_enabled,
  };
}

/**
 * Returns catalog-safe availability without exposing provider credentials.
 * A model is available when at least one enabled route has a provider- or
 * channel-level credential and is not marked down by the health circuit breaker.
 */
export async function getModelAvailabilityMap(modelIds: string[]): Promise<Map<string, ModelAvailability>> {
  const uniqueIds = [...new Set(modelIds.filter(Boolean))];
  const result = new Map<string, ModelAvailability>();
  for (const modelId of uniqueIds) {
    result.set(modelId, { status: "temporarily_unavailable", reason: "no_active_route" });
  }
  if (uniqueIds.length === 0) return result;

  const placeholders = uniqueIds.map(() => "?").join(", ");
  const routes = await db.queryMany<any>(
    `SELECT pc.model_id, pc.provider_id, p.api_key, ph.status AS health_status
       FROM provider_capacity pc
       JOIN providers p ON pc.provider_id = p.id
       LEFT JOIN provider_health ph
         ON ph.provider_id = pc.provider_id AND ph.model_id = pc.model_id
      WHERE pc.model_id IN (${placeholders})
        AND pc.is_enabled = TRUE
        AND p.status = 'enabled'`,
    uniqueIds
  );

  const configuredByModel = new Set<string>();
  for (const route of routes) {
    let apiKey = "";
    try {
      apiKey = decryptProviderSecret(route.api_key || "").trim();
    } catch {
      apiKey = "";
    }
    if (!(await hasUsableProviderCredential(route.provider_id, route.model_id, apiKey))) {
      const current = result.get(route.model_id);
      if (current?.reason === "no_active_route") {
        result.set(route.model_id, {
          status: "temporarily_unavailable",
          reason: "provider_not_configured",
        });
      }
      continue;
    }

    configuredByModel.add(route.model_id);
    if (route.health_status !== "down") {
      result.set(route.model_id, { status: "available", reason: null });
    }
  }

  for (const modelId of configuredByModel) {
    if (result.get(modelId)?.status !== "available") {
      result.set(modelId, {
        status: "temporarily_unavailable",
        reason: "provider_unhealthy",
      });
    }
  }
  return result;
}

export async function getAllHealthRecords(): Promise<HealthRecord[]> {
  const rows = await db.queryMany<any>("SELECT * FROM provider_health");
  return rows.map((row) => ({
    providerId: row.provider_id,
    modelId: row.model_id,
    status: row.status,
    consecutiveFailures: row.consecutive_failures,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastError: row.last_error,
    avgLatencyMs: row.avg_latency_ms,
  }));
}
