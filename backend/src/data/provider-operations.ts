import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";

export interface ProviderCostVersion {
  id: string;
  provider_id: string;
  model_id: string;
  version_label: string;
  pricing_type: "token" | "per-image" | "per-second" | "per-10k-characters";
  prompt_cost: number;
  completion_cost: number;
  fixed_cost: number;
  price_book_id: string;
  input_tier_min_tokens: number;
  input_tier_max_tokens: number | null;
  cache_read_implicit_cost: number | null;
  cache_read_explicit_cost: number | null;
  cache_creation_5m_cost: number | null;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  notes: string;
  source: "unknown" | "estimate" | "contract" | "invoice" | "manual" | "import";
  source_reference: string | null;
  source_sha256: string | null;
  source_row_reference: string | null;
  condition_fingerprint: string | null;
  coverage_status: "full" | "partial" | "legacy" | null;
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

// `import` means a traceable external contract/invoice import. It is verified
// provenance, unlike `estimate` and `unknown`, and is therefore eligible for
// routing and realized-cost calculations.
const RECOGNIZED_COST_SOURCES = ["contract", "invoice", "manual", "import"] as const;
const COST_VERSION_SELECT = `
  pcv.id, pcv.provider_id, pcv.model_id, pcv.version_label, pcv.pricing_type,
  COALESCE(pcv.prompt_cost_amount, ROUND(pcv.prompt_cost::numeric, 6)) AS prompt_cost,
  COALESCE(pcv.completion_cost_amount, ROUND(pcv.completion_cost::numeric, 6)) AS completion_cost,
  COALESCE(pcv.fixed_cost_amount, ROUND(pcv.fixed_cost::numeric, 6)) AS fixed_cost,
  COALESCE(pcv.price_book_id, pcv.id) AS price_book_id,
  pcv.input_tier_min_tokens,
  pcv.input_tier_max_tokens,
  pcv.cache_read_implicit_cost_amount AS cache_read_implicit_cost,
  pcv.cache_read_explicit_cost_amount AS cache_read_explicit_cost,
  pcv.cache_creation_5m_cost_amount AS cache_creation_5m_cost,
  pcv.currency, pcv.effective_from, pcv.effective_to, pcv.notes, pcv.source,
  pcv.source_reference, pcv.source_sha256, pcv.source_row_reference,
  pcv.condition_fingerprint, pcv.coverage_status,
  pcv.created_by, pcv.created_at`;

export async function getActiveCostVersions(options: { includeEstimates?: boolean } = {}): Promise<ProviderCostVersion[]> {
  const allowedSources = options.includeEstimates
    ? [...RECOGNIZED_COST_SOURCES, "estimate"]
    : [...RECOGNIZED_COST_SOURCES];
  const placeholders = allowedSources.map(() => "?").join(", ");
  const rows = await db.queryMany<any>(
    `SELECT ${COST_VERSION_SELECT}
       FROM provider_cost_versions pcv
      WHERE pcv.effective_from <= NOW()
        AND (pcv.effective_to IS NULL OR pcv.effective_to > NOW())
        AND UPPER(pcv.currency) = 'CNY'
        AND pcv.source IN (${placeholders})
      ORDER BY pcv.provider_id,
               pcv.model_id,
               pcv.effective_from DESC,
               CASE pcv.source
                 WHEN 'invoice' THEN 5
                 WHEN 'contract' THEN 4
                 WHEN 'import' THEN 3
                 WHEN 'manual' THEN 2
                 WHEN 'estimate' THEN 1
                 ELSE 0
               END DESC,
               pcv.created_at DESC,
               pcv.id DESC`,
    allowedSources
  );
  // One deterministic row per route. Source filtering happens on the outer
  // rows themselves, so an estimate/unknown sharing the recognized row's
  // effective timestamp can never leak back through a timestamp-only join.
  const activeByRoute = new Map<string, ProviderCostVersion>();
  for (const row of rows) {
    const key = `${row.provider_id}:${row.model_id}`;
    if (!activeByRoute.has(key)) activeByRoute.set(key, parseCostVersion(row));
  }
  return [...activeByRoute.values()];
}

export async function getActiveCostVersion(
  providerId: string,
  modelId: string,
  options: { includeEstimates?: boolean } = {}
): Promise<ProviderCostVersion | null> {
  const allowedSources = options.includeEstimates
    ? [...RECOGNIZED_COST_SOURCES, "estimate"]
    : [...RECOGNIZED_COST_SOURCES];
  const placeholders = allowedSources.map(() => "?").join(", ");
  const row = await db.queryOne<any>(
    `SELECT ${COST_VERSION_SELECT}
       FROM provider_cost_versions pcv
      WHERE pcv.provider_id = ? AND pcv.model_id = ?
        AND pcv.effective_from <= NOW()
        AND (pcv.effective_to IS NULL OR pcv.effective_to > NOW())
        AND pcv.source IN (${placeholders})
        AND UPPER(pcv.currency) = 'CNY'
      ORDER BY pcv.effective_from DESC,
               CASE pcv.source
                 WHEN 'invoice' THEN 5
                 WHEN 'contract' THEN 4
                 WHEN 'import' THEN 3
                 WHEN 'manual' THEN 2
                 WHEN 'estimate' THEN 1
                 ELSE 0
               END DESC,
               pcv.created_at DESC,
               pcv.id DESC
      LIMIT 1`,
    [providerId, modelId, ...allowedSources]
  );
  return row ? parseCostVersion(row) : null;
}

export async function createCostVersion(data: {
  providerId: string;
  modelId: string;
  versionLabel?: string;
  pricingType?: "token" | "per-image" | "per-second" | "per-10k-characters";
  promptCost?: number;
  completionCost?: number;
  fixedCost?: number;
  priceBookId?: string;
  inputTierMinTokens?: number;
  inputTierMaxTokens?: number | null;
  cacheReadImplicitCost?: number | null;
  cacheReadExplicitCost?: number | null;
  cacheCreation5mCost?: number | null;
  currency?: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  notes?: string;
  source?: ProviderCostVersion["source"];
  sourceReference?: string | null;
  sourceSha256?: string | null;
  sourceRowReference?: string | null;
  conditionFingerprint?: string | null;
  coverageStatus?: ProviderCostVersion["coverage_status"];
  createdBy?: string | null;
}): Promise<ProviderCostVersion> {
  const now = new Date().toISOString();
  const currency = String(data.currency || "CNY").trim().toUpperCase();
  if (currency !== "CNY") {
    throw new Error("Provider costs must be denominated in CNY until an auditable FX ledger is available");
  }
  const promptCost = data.promptCost ?? 0;
  const completionCost = data.completionCost ?? 0;
  const fixedCost = data.fixedCost ?? 0;
  const id = uuidv4();
  const priceBookId = data.priceBookId || id;
  const inputTierMinTokens = data.inputTierMinTokens ?? 0;
  const inputTierMaxTokens = data.inputTierMaxTokens ?? null;
  const cacheRates = [
    data.cacheReadImplicitCost,
    data.cacheReadExplicitCost,
    data.cacheCreation5mCost,
  ];
  if (
    !Number.isSafeInteger(inputTierMinTokens)
    || inputTierMinTokens < 0
    || (
      inputTierMaxTokens !== null
      && (
        !Number.isSafeInteger(inputTierMaxTokens)
        || inputTierMaxTokens <= inputTierMinTokens
      )
    )
  ) {
    throw new Error("Provider cost input token tier is invalid");
  }
  if (cacheRates.some((value) => (
    value !== null
    && value !== undefined
    && (!Number.isFinite(value) || value < 0)
  ))) {
    throw new Error("Provider cache costs must be non-negative numbers or null");
  }
  const coverageStatus = data.coverageStatus || (
    cacheRates.every((value) => value !== null && value !== undefined)
      ? "full"
      : "partial"
  );
  const row = await db.queryOne<any>(
    `INSERT INTO provider_cost_versions (
      id, price_book_id, provider_id, model_id, version_label, pricing_type, prompt_cost, completion_cost,
      fixed_cost, prompt_cost_amount, completion_cost_amount, fixed_cost_amount,
      input_tier_min_tokens, input_tier_max_tokens,
      cache_read_implicit_cost_amount, cache_read_explicit_cost_amount,
      cache_creation_5m_cost_amount, currency, effective_from, effective_to,
      notes, source, source_reference, source_sha256, source_row_reference,
      condition_fingerprint, coverage_status, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *`,
    [
      id,
      priceBookId,
      data.providerId,
      data.modelId,
      data.versionLabel || "default",
      data.pricingType || "token",
      promptCost,
      completionCost,
      fixedCost,
      promptCost,
      completionCost,
      fixedCost,
      inputTierMinTokens,
      inputTierMaxTokens,
      data.cacheReadImplicitCost ?? null,
      data.cacheReadExplicitCost ?? null,
      data.cacheCreation5mCost ?? null,
      currency,
      data.effectiveFrom || now,
      data.effectiveTo || null,
      data.notes || "",
      data.source || "manual",
      data.sourceReference || null,
      data.sourceSha256 || null,
      data.sourceRowReference || null,
      data.conditionFingerprint || null,
      coverageStatus,
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
    price_book_id: row.price_book_id || row.id,
    input_tier_min_tokens: Number(row.input_tier_min_tokens || 0),
    input_tier_max_tokens: row.input_tier_max_tokens === null || row.input_tier_max_tokens === undefined
      ? null
      : Number(row.input_tier_max_tokens),
    cache_read_implicit_cost: row.cache_read_implicit_cost === null || row.cache_read_implicit_cost === undefined
      ? row.cache_read_implicit_cost_amount === null || row.cache_read_implicit_cost_amount === undefined
        ? null
        : Number(row.cache_read_implicit_cost_amount)
      : Number(row.cache_read_implicit_cost),
    cache_read_explicit_cost: row.cache_read_explicit_cost === null || row.cache_read_explicit_cost === undefined
      ? row.cache_read_explicit_cost_amount === null || row.cache_read_explicit_cost_amount === undefined
        ? null
        : Number(row.cache_read_explicit_cost_amount)
      : Number(row.cache_read_explicit_cost),
    cache_creation_5m_cost: row.cache_creation_5m_cost === null || row.cache_creation_5m_cost === undefined
      ? row.cache_creation_5m_cost_amount === null || row.cache_creation_5m_cost_amount === undefined
        ? null
        : Number(row.cache_creation_5m_cost_amount)
      : Number(row.cache_creation_5m_cost),
    source: row.source || "unknown",
    source_reference: row.source_reference || null,
    source_sha256: row.source_sha256 || null,
    source_row_reference: row.source_row_reference || null,
    condition_fingerprint: row.condition_fingerprint || null,
    coverage_status: row.coverage_status || null,
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
