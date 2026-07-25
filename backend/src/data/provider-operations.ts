import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";

export interface ProviderCostVersion {
  id: string;
  provider_id: string;
  model_id: string;
  version_label: string;
  pricing_type: "token" | "per-image" | "per-second";
  prompt_cost: number;
  completion_cost: number;
  fixed_cost: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
}

export interface RouteChangeAudit {
  id: string;
  provider_id: string;
  model_id: string;
  action: string;
  before_config: string | null;
  after_config: string | null;
  actor_id: string | null;
  reason: string;
  created_at: string;
}

export interface CustomerRoutePolicy {
  id: string;
  user_id: string | null;
  model_id: string;
  strategy: "weighted" | "priority" | "lowest_cost" | "highest_sla" | "pinned";
  pinned_provider_id: string | null;
  allowed_providers: string[];
  blocked_providers: string[];
  priority_boost: Record<string, number>;
  min_availability: number | null;
  max_prompt_cost: number | null;
  max_completion_cost: number | null;
  is_enabled: boolean;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderSlaEvidence {
  id: string;
  provider_id: string;
  model_id: string;
  window_start: string;
  window_end: string;
  total_requests: number;
  success_requests: number;
  error_requests: number;
  created_at: string;
}

export async function getActiveCostVersions(): Promise<ProviderCostVersion[]> {
  const rows = await db.queryMany<any>(
    `SELECT pcv.*
       FROM provider_cost_versions pcv
       JOIN (
         SELECT provider_id, model_id, MAX(effective_from) as effective_from
           FROM provider_cost_versions
          WHERE effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())
          GROUP BY provider_id, model_id
       ) latest
         ON pcv.provider_id = latest.provider_id
        AND pcv.model_id = latest.model_id
        AND pcv.effective_from = latest.effective_from`
  );
  return rows.map(parseCostVersion);
}

export async function getActiveCostVersion(providerId: string, modelId: string): Promise<ProviderCostVersion | null> {
  const row = await db.queryOne<any>(
    `SELECT *
       FROM provider_cost_versions
      WHERE provider_id = ? AND model_id = ?
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR effective_to > NOW())
      ORDER BY effective_from DESC
      LIMIT 1`,
    [providerId, modelId]
  );
  return row ? parseCostVersion(row) : null;
}

export async function createCostVersion(data: {
  providerId: string;
  modelId: string;
  versionLabel?: string;
  pricingType?: "token" | "per-image" | "per-second";
  promptCost?: number;
  completionCost?: number;
  fixedCost?: number;
  currency?: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  notes?: string;
  createdBy?: string | null;
}): Promise<ProviderCostVersion> {
  const now = new Date().toISOString();
  const row = await db.queryOne<any>(
    `INSERT INTO provider_cost_versions (
      id, provider_id, model_id, version_label, pricing_type, prompt_cost, completion_cost,
      fixed_cost, currency, effective_from, effective_to, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *`,
    [
      uuidv4(),
      data.providerId,
      data.modelId,
      data.versionLabel || "default",
      data.pricingType || "token",
      data.promptCost ?? 0,
      data.completionCost ?? 0,
      data.fixedCost ?? 0,
      data.currency || "CNY",
      data.effectiveFrom || now,
      data.effectiveTo || null,
      data.notes || "",
      data.createdBy || null,
      now,
    ]
  );
  return parseCostVersion(row);
}

export async function recordRouteAudit(data: {
  providerId: string;
  modelId: string;
  action: string;
  beforeConfig?: unknown;
  afterConfig?: unknown;
  actorId?: string | null;
  reason?: string;
}): Promise<RouteChangeAudit> {
  const row = await db.queryOne<any>(
    `INSERT INTO route_change_audits (id, provider_id, model_id, action, before_config, after_config, actor_id, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [
      uuidv4(),
      data.providerId,
      data.modelId,
      data.action,
      data.beforeConfig === undefined ? null : JSON.stringify(data.beforeConfig),
      data.afterConfig === undefined ? null : JSON.stringify(data.afterConfig),
      data.actorId || null,
      data.reason || "",
      new Date().toISOString(),
    ]
  );
  return row;
}

export async function getRouteAudits(limit = 30): Promise<RouteChangeAudit[]> {
  return db.queryMany<RouteChangeAudit>(
    "SELECT * FROM route_change_audits ORDER BY created_at DESC LIMIT ?",
    [limit]
  );
}

export async function getRoutePolicies(): Promise<CustomerRoutePolicy[]> {
  const rows = await db.queryMany<any>("SELECT * FROM customer_route_policies ORDER BY created_at DESC");
  return rows.map(parsePolicy);
}

export async function getMatchingRoutePolicy(userId: string | null | undefined, modelId: string): Promise<CustomerRoutePolicy | null> {
  const rows = await db.queryMany<any>(
    `SELECT * FROM customer_route_policies
      WHERE is_enabled = TRUE
        AND (model_id = ? OR model_id = '*')
        AND (user_id = ? OR user_id IS NULL)
      ORDER BY
        CASE WHEN user_id = ? THEN 0 ELSE 1 END,
        CASE WHEN model_id = ? THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1`,
    [modelId, userId || null, userId || null, modelId]
  );
  return rows[0] ? parsePolicy(rows[0]) : null;
}

export async function getLatestProviderSlaEvidence(
  providerId: string,
  modelId: string
): Promise<ProviderSlaEvidence | null> {
  const row = await db.queryOne<any>(
    `SELECT id, provider_id, model_id, window_start, window_end,
            total_requests, success_requests, error_requests, created_at
       FROM provider_sla_snapshots
      WHERE provider_id = ? AND model_id = ? AND total_requests > 0
      ORDER BY window_end DESC, created_at DESC
      LIMIT 1`,
    [providerId, modelId]
  );
  if (!row) return null;
  return {
    ...row,
    total_requests: Number(row.total_requests),
    success_requests: Number(row.success_requests),
    error_requests: Number(row.error_requests),
  };
}

export async function upsertRoutePolicy(data: {
  id?: string;
  userId?: string | null;
  modelId: string;
  strategy?: CustomerRoutePolicy["strategy"];
  pinnedProviderId?: string | null;
  allowedProviders?: string[];
  blockedProviders?: string[];
  priorityBoost?: Record<string, number>;
  minAvailability?: number | null;
  maxPromptCost?: number | null;
  maxCompletionCost?: number | null;
  isEnabled?: boolean;
  notes?: string;
  createdBy?: string | null;
}): Promise<CustomerRoutePolicy> {
  const existing = data.id
    ? await db.queryOne<any>("SELECT * FROM customer_route_policies WHERE id = ?", [data.id])
    : null;
  const id = existing?.id || data.id || uuidv4();
  const now = new Date().toISOString();
  const row = await db.queryOne<any>(
    `INSERT INTO customer_route_policies (
      id, user_id, model_id, strategy, pinned_provider_id, allowed_providers, blocked_providers,
      priority_boost, min_availability, max_prompt_cost, max_completion_cost, is_enabled,
      notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      model_id = excluded.model_id,
      strategy = excluded.strategy,
      pinned_provider_id = excluded.pinned_provider_id,
      allowed_providers = excluded.allowed_providers,
      blocked_providers = excluded.blocked_providers,
      priority_boost = excluded.priority_boost,
      min_availability = excluded.min_availability,
      max_prompt_cost = excluded.max_prompt_cost,
      max_completion_cost = excluded.max_completion_cost,
      is_enabled = excluded.is_enabled,
      notes = excluded.notes,
      updated_at = excluded.updated_at
    RETURNING *`,
    [
      id,
      data.userId ?? existing?.user_id ?? null,
      data.modelId || existing?.model_id || "*",
      data.strategy || existing?.strategy || "weighted",
      data.pinnedProviderId !== undefined ? data.pinnedProviderId : existing?.pinned_provider_id || null,
      JSON.stringify(data.allowedProviders ?? parseJsonArray(existing?.allowed_providers)),
      JSON.stringify(data.blockedProviders ?? parseJsonArray(existing?.blocked_providers)),
      JSON.stringify(data.priorityBoost ?? parseJsonObject(existing?.priority_boost)),
      data.minAvailability !== undefined ? data.minAvailability : existing?.min_availability ?? null,
      data.maxPromptCost !== undefined ? data.maxPromptCost : existing?.max_prompt_cost ?? null,
      data.maxCompletionCost !== undefined ? data.maxCompletionCost : existing?.max_completion_cost ?? null,
      data.isEnabled !== undefined ? data.isEnabled : existing?.is_enabled ?? true,
      data.notes !== undefined ? data.notes : existing?.notes || "",
      data.createdBy || existing?.created_by || null,
      existing?.created_at || now,
      now,
    ]
  );
  return parsePolicy(row);
}

export async function deleteRoutePolicy(id: string): Promise<boolean> {
  return (await db.execute("DELETE FROM customer_route_policies WHERE id = ?", [id])) > 0;
}

function parseCostVersion(row: any): ProviderCostVersion {
  return {
    ...row,
    prompt_cost: Number(row.prompt_cost || 0),
    completion_cost: Number(row.completion_cost || 0),
    fixed_cost: Number(row.fixed_cost || 0),
  };
}

function parsePolicy(row: any): CustomerRoutePolicy {
  return {
    ...row,
    allowed_providers: parseJsonArray(row.allowed_providers),
    blocked_providers: parseJsonArray(row.blocked_providers),
    priority_boost: parseJsonObject(row.priority_boost),
    min_availability: row.min_availability === null || row.min_availability === undefined ? null : Number(row.min_availability),
    max_prompt_cost: row.max_prompt_cost === null || row.max_prompt_cost === undefined ? null : Number(row.max_prompt_cost),
    max_completion_cost: row.max_completion_cost === null || row.max_completion_cost === undefined ? null : Number(row.max_completion_cost),
    is_enabled: !!row.is_enabled,
  };
}

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown): Record<string, number> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, number>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
