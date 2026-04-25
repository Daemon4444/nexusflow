/**
 * Provider Scheduler
 * 
 * Handles intelligent routing when multiple providers serve the same model:
 * - Weighted round-robin based on remaining capacity
 * - Health-aware routing (skip unhealthy providers)
 * - Automatic failover and recovery
 */

import db from "../db";
import { getProviderUsageStats } from "./rate-limiter";
import { decryptProviderSecret } from "../utils/provider-secrets";

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

// Thresholds
const FAILURE_THRESHOLD_DEGRADED = 3;  // 3 consecutive failures -> degraded
const FAILURE_THRESHOLD_DOWN = 10;     // 10 consecutive failures -> down
const RECOVERY_CHECK_INTERVAL = 60_000; // Check recovery every 60s

// In-memory concurrent request tracking
const concurrentRequests = new Map<string, number>();

const stmts = {
  getHealth: db.prepare(
    "SELECT * FROM provider_health WHERE provider_id = ? AND model_id = ?"
  ),
  upsertHealth: db.prepare(`
    INSERT INTO provider_health (id, provider_id, model_id, status, consecutive_failures, last_success_at, last_failure_at, last_error, avg_latency_ms, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_id, model_id) DO UPDATE SET
      status = excluded.status,
      consecutive_failures = excluded.consecutive_failures,
      last_success_at = excluded.last_success_at,
      last_failure_at = excluded.last_failure_at,
      last_error = excluded.last_error,
      avg_latency_ms = excluded.avg_latency_ms,
      updated_at = excluded.updated_at
  `),
  getEndpointsForModel: db.prepare(`
    SELECT 
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
    WHERE pc.model_id = ? AND pc.is_enabled = 1 AND p.status = 'enabled'
    ORDER BY pc.priority DESC, pc.weight DESC
  `),
  getAllHealth: db.prepare("SELECT * FROM provider_health"),
};

/**
 * Get health record for a provider+model
 */
function getHealthRecord(providerId: string, modelId: string): HealthRecord | null {
  const row = stmts.getHealth.get(providerId, modelId) as any;
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

/**
 * Record a successful request - resets failure count
 */
export function recordSuccess(providerId: string, modelId: string, latencyMs: number): void {
  const existing = getHealthRecord(providerId, modelId);
  const avgLatency = existing
    ? Math.round((existing.avgLatencyMs * 0.7) + (latencyMs * 0.3))
    : latencyMs;

  const { v4: uuidv4 } = require("uuid");
  const now = new Date().toISOString();
  stmts.upsertHealth.run(
    uuidv4(), providerId, modelId, "healthy", 0,
    now, existing?.lastFailureAt || null, null, avgLatency, now
  );

  // Decrease concurrent count
  const key = `${providerId}:${modelId}`;
  const current = concurrentRequests.get(key) || 0;
  concurrentRequests.set(key, Math.max(0, current - 1));
}

/**
 * Record a failed request - increments failure count
 */
export function recordFailure(providerId: string, modelId: string, error: string): void {
  const existing = getHealthRecord(providerId, modelId);
  const failures = (existing?.consecutiveFailures || 0) + 1;

  let status: "healthy" | "degraded" | "down" = "healthy";
  if (failures >= FAILURE_THRESHOLD_DOWN) status = "down";
  else if (failures >= FAILURE_THRESHOLD_DEGRADED) status = "degraded";

  const { v4: uuidv4 } = require("uuid");
  const now = new Date().toISOString();
  stmts.upsertHealth.run(
    uuidv4(), providerId, modelId, status, failures,
    existing?.lastSuccessAt || null, now, error,
    existing?.avgLatencyMs || 0, now
  );

  // Decrease concurrent count
  const key = `${providerId}:${modelId}`;
  const current = concurrentRequests.get(key) || 0;
  concurrentRequests.set(key, Math.max(0, current - 1));
}

/**
 * Increment concurrent request count before sending upstream
 */
export function acquireConcurrency(providerId: string, modelId: string): void {
  const key = `${providerId}:${modelId}`;
  const current = concurrentRequests.get(key) || 0;
  concurrentRequests.set(key, current + 1);
}

/**
 * Select the best provider endpoint for a given model.
 * Uses weighted selection based on remaining capacity.
 */
export function selectProvider(modelId: string): ProviderEndpoint | null {
  const endpoints = stmts.getEndpointsForModel.all(modelId) as any[];
  if (endpoints.length === 0) return null;

  // Filter out disabled and unhealthy endpoints
  const available = endpoints.filter((ep) => {
    if (!ep.is_enabled) return false;

    const health = getHealthRecord(ep.provider_id, ep.model_id);
    if (health?.status === "down") return false;

    // Check concurrent limit
    const key = `${ep.provider_id}:${ep.model_id}`;
    const concurrent = concurrentRequests.get(key) || 0;
    if (concurrent >= ep.concurrent_limit) return false;

    return true;
  });

  if (available.length === 0) return null;

  // Weighted selection based on remaining RPM capacity
  const weighted = available.map((ep) => {
    const usage = getProviderUsageStats(ep.provider_id, ep.model_id);
    const remainingRpm = Math.max(0, ep.rpm - usage.rpm);
    const remainingTpm = Math.max(0, ep.tpm - usage.tpm);
    const health = getHealthRecord(ep.provider_id, ep.model_id);
    
    // Degraded providers get reduced weight
    const healthMultiplier = health?.status === "degraded" ? 0.3 : 1.0;
    
    // Score = weight * remaining_capacity_ratio * health_multiplier
    const capacityRatio = ep.rpm > 0 ? remainingRpm / ep.rpm : 1;
    const score = ep.weight * capacityRatio * healthMultiplier * (1 + ep.priority * 0.1);

    return { endpoint: ep, score };
  });

  // Sort by score descending
  weighted.sort((a, b) => b.score - a.score);

  // Pick highest scored endpoint
  const selected = weighted[0].endpoint;

  return {
    providerId: selected.provider_id,
    providerName: selected.provider_name,
    apiBaseUrl: selected.api_base_url,
    apiKey: decryptProviderSecret(selected.api_key),
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
 * Get all provider health records (for admin dashboard)
 */
export function getAllHealthRecords(): HealthRecord[] {
  const rows = stmts.getAllHealth.all() as any[];
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
