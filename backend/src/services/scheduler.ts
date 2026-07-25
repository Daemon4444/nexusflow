import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { getProviderUsageStats } from "./rate-limiter";
import { decryptProviderSecret } from "../utils/provider-secrets";
import {
  getActiveCostVersions,
  getLatestProviderSlaEvidence,
  getMatchingRoutePolicy,
} from "../data/provider-operations";
import { satisfiesMinimumObservedAvailability } from "./provider-monitor-semantics";

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

export interface HealthRecord {
  providerId: string;
  modelId: string;
  status: "healthy" | "degraded" | "down";
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

const FAILURE_THRESHOLD_DEGRADED = 3;
const FAILURE_THRESHOLD_DOWN = 10;
const concurrentRequests = new Map<string, number>();

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
  const existing = await getHealthRecord(providerId, modelId);
  const avgLatency = existing ? Math.round(existing.avgLatencyMs * 0.7 + latencyMs * 0.3) : latencyMs;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO provider_health (id, provider_id, model_id, status, consecutive_failures, last_success_at, last_failure_at, last_error, avg_latency_ms, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_id, model_id) DO UPDATE SET
       status = excluded.status,
       consecutive_failures = excluded.consecutive_failures,
       last_success_at = excluded.last_success_at,
       last_failure_at = excluded.last_failure_at,
       last_error = excluded.last_error,
       avg_latency_ms = excluded.avg_latency_ms,
       updated_at = excluded.updated_at`,
    [uuidv4(), providerId, modelId, "healthy", 0, now, existing?.lastFailureAt || null, null, avgLatency, now]
  );
  releaseConcurrency(providerId, modelId);
}

export async function recordFailure(providerId: string, modelId: string, error: string): Promise<void> {
  const existing = await getHealthRecord(providerId, modelId);
  const failures = (existing?.consecutiveFailures || 0) + 1;
  let status: "healthy" | "degraded" | "down" = "healthy";
  if (failures >= FAILURE_THRESHOLD_DOWN) status = "down";
  else if (failures >= FAILURE_THRESHOLD_DEGRADED) status = "degraded";
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO provider_health (id, provider_id, model_id, status, consecutive_failures, last_success_at, last_failure_at, last_error, avg_latency_ms, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_id, model_id) DO UPDATE SET
       status = excluded.status,
       consecutive_failures = excluded.consecutive_failures,
       last_success_at = excluded.last_success_at,
       last_failure_at = excluded.last_failure_at,
       last_error = excluded.last_error,
       avg_latency_ms = excluded.avg_latency_ms,
       updated_at = excluded.updated_at`,
    [uuidv4(), providerId, modelId, status, failures, existing?.lastSuccessAt || null, now, error, existing?.avgLatencyMs || 0, now]
  );
  releaseConcurrency(providerId, modelId);
}

export function acquireConcurrency(providerId: string, modelId: string): void {
  const key = `${providerId}:${modelId}`;
  concurrentRequests.set(key, (concurrentRequests.get(key) || 0) + 1);
}

export function releaseConcurrency(providerId: string, modelId: string): void {
  const key = `${providerId}:${modelId}`;
  concurrentRequests.set(key, Math.max(0, (concurrentRequests.get(key) || 0) - 1));
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

  const [policy, activeCosts] = await Promise.all([
    getMatchingRoutePolicy(context.userId, modelId),
    getActiveCostVersions(),
  ]);
  const costByRoute = new Map(activeCosts.map((cost) => [`${cost.provider_id}:${cost.model_id}`, cost]));

  const available: Array<{ ep: any; health: HealthRecord | null; apiKey: string }> = [];
  for (const ep of endpoints) {
    if (!ep.is_enabled) continue;
    let apiKey = "";
    try {
      apiKey = decryptProviderSecret(ep.api_key || "").trim();
    } catch {
      apiKey = "";
    }
    // A route without credentials is configuration, not capacity. Excluding it
    // here prevents paid requests from reaching an upstream with an empty
    // bearer token and lets callers return provider_not_configured before
    // creating a billing reservation.
    if (!apiKey) continue;
    if (policy?.pinned_provider_id && policy.strategy === "pinned" && ep.provider_id !== policy.pinned_provider_id) continue;
    if (policy?.allowed_providers.length && !policy.allowed_providers.includes(ep.provider_id)) continue;
    if (policy?.blocked_providers.includes(ep.provider_id)) continue;
    const cost = costByRoute.get(`${ep.provider_id}:${ep.model_id}`);
    if (policy?.max_prompt_cost !== null && policy?.max_prompt_cost !== undefined && cost && cost.prompt_cost > policy.max_prompt_cost) continue;
    if (policy?.max_completion_cost !== null && policy?.max_completion_cost !== undefined && cost && cost.completion_cost > policy.max_completion_cost) continue;
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
    const concurrent = concurrentRequests.get(key) || 0;
    if (concurrent >= ep.concurrent_limit) continue;
    available.push({ ep, health, apiKey });
  }

  if (available.length === 0) return null;

  const weighted = available.map(({ ep, health, apiKey }) => {
    const usage = getProviderUsageStats(ep.provider_id, ep.model_id);
    const remainingRpm = Math.max(0, ep.rpm - usage.rpm);
    const healthMultiplier = health?.status === "degraded" ? 0.3 : 1.0;
    const capacityRatio = ep.rpm > 0 ? remainingRpm / ep.rpm : 1;
    const cost = costByRoute.get(`${ep.provider_id}:${ep.model_id}`);
    const costPenalty = policy?.strategy === "lowest_cost" && cost
      ? 1 / Math.max(0.0001, cost.prompt_cost + cost.completion_cost + cost.fixed_cost)
      : 1;
    const slaBoost = policy?.strategy === "highest_sla" ? (health?.status === "healthy" ? 2 : 0.5) : 1;
    const customBoost = policy?.priority_boost[ep.provider_id] ?? 0;
    const score = (ep.weight + customBoost) * capacityRatio * healthMultiplier * slaBoost * costPenalty * (1 + ep.priority * 0.1);
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
 * A model is available when at least one enabled route has a configured secret
 * and is not marked down by the health circuit breaker.
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
    `SELECT pc.model_id, p.api_key, ph.status AS health_status
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
    if (!apiKey) {
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
