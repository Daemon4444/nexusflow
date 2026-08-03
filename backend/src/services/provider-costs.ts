import { db } from "../db/client";

export const RECOGNIZED_PROVIDER_COST_SOURCES = [
  "contract",
  "invoice",
  "manual",
  "import",
] as const;

export type RecognizedProviderCostSource =
  typeof RECOGNIZED_PROVIDER_COST_SOURCES[number];

export type ProviderCacheMode = "implicit" | "explicit";

export type ProviderCostResolution =
  | "exact"
  | "list_price_fallback"
  | "not_applicable"
  | "missing_provider"
  | "missing_version"
  | "missing_tier"
  | "ambiguous_tier"
  | "missing_cache_mode"
  | "missing_cache_rate"
  | "inconsistent_usage"
  | "lookup_error"
  | "unsupported_pricing";

export interface ProviderCostTier {
  id: string;
  priceBookId: string;
  providerId: string;
  modelId: string;
  versionLabel: string;
  pricingType: "token" | "per-image" | "per-second" | "per-10k-characters";
  inputTierMinTokens: number;
  inputTierMaxTokens: number | null;
  promptCost: number;
  completionCost: number;
  fixedCost: number;
  cacheReadImplicitCost: number | null;
  cacheReadExplicitCost: number | null;
  cacheCreation5mCost: number | null;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: RecognizedProviderCostSource | "estimate" | "unknown";
  sourceReference: string | null;
  sourceSha256: string | null;
  sourceRowReference: string | null;
  conditionFingerprint: string | null;
  coverageStatus: "full" | "partial" | "legacy" | null;
  notes: string;
  createdBy: string | null;
  createdAt: string;
}

export interface ProviderCostResult {
  amount: number | null;
  costVersionId: string | null;
  priceBookId: string | null;
  resolution: ProviderCostResolution;
}

export function providerCostStorageFields(result: ProviderCostResult): {
  resolution: Exclude<ProviderCostResolution, "list_price_fallback">;
  basis: "price_book" | "official_list" | null;
} {
  if (result.resolution === "list_price_fallback") {
    return { resolution: "exact", basis: "official_list" };
  }
  return {
    resolution: result.resolution,
    basis: result.resolution === "exact" ? "price_book" : null,
  };
}

const LIST_PRICE_FALLBACK_RESOLUTIONS = new Set<ProviderCostResolution>([
  "missing_version",
  "missing_tier",
  "ambiguous_tier",
  "missing_cache_mode",
  "missing_cache_rate",
  "unsupported_pricing",
]);

export function applyRetailListPriceFallback(
  result: ProviderCostResult,
  params: {
    providerId?: string | null;
    retailListCost?: number | null;
    status: string;
    estimated?: boolean;
  }
): ProviderCostResult {
  const listCost = Number(params.retailListCost);
  if (
    result.amount !== null
    || !LIST_PRICE_FALLBACK_RESOLUTIONS.has(result.resolution)
    || !params.providerId
    || params.status !== "success"
    || params.estimated === true
    || params.retailListCost === null
    || params.retailListCost === undefined
    || !Number.isFinite(listCost)
    || listCost < 0
  ) {
    return result;
  }
  return {
    amount: Math.round((listCost + Number.EPSILON) * 1_000_000) / 1_000_000,
    costVersionId: null,
    priceBookId: null,
    resolution: "list_price_fallback",
  };
}

export interface ProviderCostUsage {
  providerId?: string | null;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  providerCacheMode?: ProviderCacheMode | null;
  providerInputIncludesCache?: boolean | null;
  providerUnits?: number | null;
  status: string;
  estimated: boolean;
}

interface RawProviderCostTier {
  id: string;
  price_book_id: string | null;
  provider_id: string;
  model_id: string;
  version_label: string;
  pricing_type: ProviderCostTier["pricingType"];
  input_tier_min_tokens: string | number;
  input_tier_max_tokens: string | number | null;
  prompt_cost: string | number;
  completion_cost: string | number;
  fixed_cost: string | number;
  cache_read_implicit_cost_amount: string | number | null;
  cache_read_explicit_cost_amount: string | number | null;
  cache_creation_5m_cost_amount: string | number | null;
  currency: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
  source: ProviderCostTier["source"];
  source_reference: string | null;
  source_sha256: string | null;
  source_row_reference: string | null;
  condition_fingerprint: string | null;
  coverage_status: ProviderCostTier["coverageStatus"];
  notes: string;
  created_by: string | null;
  created_at: string | Date;
}

const ACTIVE_TIER_SELECT = `
  pcv.id,
  pcv.price_book_id,
  pcv.provider_id,
  pcv.model_id,
  pcv.version_label,
  pcv.pricing_type,
  pcv.input_tier_min_tokens,
  pcv.input_tier_max_tokens,
  COALESCE(pcv.prompt_cost_amount, ROUND(pcv.prompt_cost::numeric, 6)) AS prompt_cost,
  COALESCE(pcv.completion_cost_amount, ROUND(pcv.completion_cost::numeric, 6)) AS completion_cost,
  COALESCE(pcv.fixed_cost_amount, ROUND(pcv.fixed_cost::numeric, 6)) AS fixed_cost,
  pcv.cache_read_implicit_cost_amount,
  pcv.cache_read_explicit_cost_amount,
  pcv.cache_creation_5m_cost_amount,
  pcv.currency,
  pcv.effective_from,
  pcv.effective_to,
  pcv.source,
  pcv.source_reference,
  pcv.source_sha256,
  pcv.source_row_reference,
  pcv.condition_fingerprint,
  pcv.coverage_status,
  pcv.notes,
  pcv.created_by,
  pcv.created_at`;

function numeric(value: string | number | null | undefined): number {
  return Number(value || 0);
}

function nullableNumeric(
  value: string | number | null | undefined
): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function parseTier(row: RawProviderCostTier): ProviderCostTier {
  return {
    id: row.id,
    priceBookId: row.price_book_id || row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    versionLabel: row.version_label,
    pricingType: row.pricing_type,
    inputTierMinTokens: numeric(row.input_tier_min_tokens),
    inputTierMaxTokens: nullableNumeric(row.input_tier_max_tokens),
    promptCost: numeric(row.prompt_cost),
    completionCost: numeric(row.completion_cost),
    fixedCost: numeric(row.fixed_cost),
    cacheReadImplicitCost: nullableNumeric(row.cache_read_implicit_cost_amount),
    cacheReadExplicitCost: nullableNumeric(row.cache_read_explicit_cost_amount),
    cacheCreation5mCost: nullableNumeric(row.cache_creation_5m_cost_amount),
    currency: String(row.currency || "").toUpperCase(),
    effectiveFrom: iso(row.effective_from)!,
    effectiveTo: iso(row.effective_to),
    source: row.source || "unknown",
    sourceReference: row.source_reference || null,
    sourceSha256: row.source_sha256 || null,
    sourceRowReference: row.source_row_reference || null,
    conditionFingerprint: row.condition_fingerprint || null,
    coverageStatus: row.coverage_status || null,
    notes: row.notes || "",
    createdBy: row.created_by || null,
    createdAt: iso(row.created_at)!,
  };
}

function sourcePriority(source: ProviderCostTier["source"]): number {
  switch (source) {
    case "invoice": return 5;
    case "contract": return 4;
    case "import": return 3;
    case "manual": return 2;
    case "estimate": return 1;
    default: return 0;
  }
}

function compareBookRank(a: ProviderCostTier, b: ProviderCostTier): number {
  const effective = Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom);
  if (effective !== 0) return effective;
  const priority = sourcePriority(b.source) - sourcePriority(a.source);
  if (priority !== 0) return priority;
  const created = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (created !== 0) return created;
  return b.priceBookId.localeCompare(a.priceBookId);
}

function sameBookRank(a: ProviderCostTier, b: ProviderCostTier): boolean {
  return (
    Date.parse(a.effectiveFrom) === Date.parse(b.effectiveFrom)
    && sourcePriority(a.source) === sourcePriority(b.source)
    && Date.parse(a.createdAt) === Date.parse(b.createdAt)
  );
}

function selectCurrentBook(tiers: ProviderCostTier[]): ProviderCostTier[] {
  if (tiers.length === 0) return [];
  const bookRepresentatives = new Map<string, ProviderCostTier>();
  for (const tier of tiers) {
    if (!bookRepresentatives.has(tier.priceBookId)) {
      bookRepresentatives.set(tier.priceBookId, tier);
    }
  }
  const rankedBooks = [...bookRepresentatives.values()].sort(compareBookRank);
  const winner = rankedBooks[0];
  const tiedBooks = rankedBooks.filter((book) => sameBookRank(book, winner));
  if (tiedBooks.length !== 1) return [];
  return tiers
    .filter((tier) => tier.priceBookId === winner.priceBookId)
    .sort((a, b) => (
      a.inputTierMinTokens - b.inputTierMinTokens
      || (a.inputTierMaxTokens ?? Number.MAX_SAFE_INTEGER)
        - (b.inputTierMaxTokens ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id)
    ));
}

function nonNegativeInteger(value: number | undefined): number {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.floor(numericValue));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export async function getActiveProviderCostTiers(
  providerId: string,
  modelId: string
): Promise<ProviderCostTier[]> {
  const placeholders = RECOGNIZED_PROVIDER_COST_SOURCES.map(() => "?").join(", ");
  const rows = await db.queryMany<RawProviderCostTier>(
    `SELECT ${ACTIVE_TIER_SELECT}
       FROM provider_cost_versions pcv
      WHERE pcv.provider_id = ?
        AND pcv.model_id = ?
        AND pcv.effective_from <= NOW()
        AND (pcv.effective_to IS NULL OR pcv.effective_to > NOW())
        AND pcv.source IN (${placeholders})
        AND UPPER(pcv.currency) = 'CNY'
      ORDER BY pcv.effective_from DESC, pcv.created_at DESC, pcv.id DESC`,
    [providerId, modelId, ...RECOGNIZED_PROVIDER_COST_SOURCES]
  );
  if (rows.length === 0) return [];

  return selectCurrentBook(rows.map(parseTier));
}

export async function getAllActiveProviderCostTiers(): Promise<ProviderCostTier[]> {
  const placeholders = RECOGNIZED_PROVIDER_COST_SOURCES.map(() => "?").join(", ");
  const rows = await db.queryMany<RawProviderCostTier>(
    `SELECT ${ACTIVE_TIER_SELECT}
       FROM provider_cost_versions pcv
      WHERE pcv.effective_from <= NOW()
        AND (pcv.effective_to IS NULL OR pcv.effective_to > NOW())
        AND pcv.source IN (${placeholders})
        AND UPPER(pcv.currency) = 'CNY'
      ORDER BY pcv.provider_id, pcv.model_id,
               pcv.effective_from DESC, pcv.created_at DESC, pcv.id DESC`,
    [...RECOGNIZED_PROVIDER_COST_SOURCES]
  );
  const byRoute = new Map<string, ProviderCostTier[]>();
  for (const tier of rows.map(parseTier)) {
    const key = `${tier.providerId}\0${tier.modelId}`;
    const routeTiers = byRoute.get(key) || [];
    routeTiers.push(tier);
    byRoute.set(key, routeTiers);
  }
  return [...byRoute.values()].flatMap(selectCurrentBook);
}

export function calculateProviderCostFromTiers(
  tiers: ProviderCostTier[],
  usage: Omit<ProviderCostUsage, "providerId" | "modelId" | "status" | "estimated">
): ProviderCostResult {
  if (tiers.length === 0) {
    return {
      amount: null,
      costVersionId: null,
      priceBookId: null,
      resolution: "missing_version",
    };
  }

  const promptTokens = nonNegativeInteger(usage.promptTokens);
  const completionTokens = nonNegativeInteger(usage.completionTokens);
  const cachedTokens = nonNegativeInteger(usage.cachedTokens);
  const cacheCreationTokens = nonNegativeInteger(usage.cacheCreationTokens);
  const hasCacheUsage = cachedTokens > 0 || cacheCreationTokens > 0;

  if (hasCacheUsage && usage.providerInputIncludesCache == null) {
    return {
      amount: null,
      costVersionId: null,
      priceBookId: tiers[0].priceBookId,
      resolution: "missing_cache_mode",
    };
  }
  if (
    usage.providerInputIncludesCache === true
    && cachedTokens + cacheCreationTokens > promptTokens
  ) {
    return {
      amount: null,
      costVersionId: null,
      priceBookId: tiers[0].priceBookId,
      resolution: "inconsistent_usage",
    };
  }

  const totalInputTokens = usage.providerInputIncludesCache === false
    ? promptTokens + cachedTokens + cacheCreationTokens
    : promptTokens;
  const matching = tiers.filter((tier) => (
    totalInputTokens >= tier.inputTierMinTokens
    && (
      tier.inputTierMaxTokens === null
      || totalInputTokens < tier.inputTierMaxTokens
    )
  ));
  if (matching.length === 0) {
    return {
      amount: null,
      costVersionId: null,
      priceBookId: tiers[0].priceBookId,
      resolution: "missing_tier",
    };
  }
  if (matching.length !== 1) {
    return {
      amount: null,
      costVersionId: null,
      priceBookId: tiers[0].priceBookId,
      resolution: "ambiguous_tier",
    };
  }

  const tier = matching[0];
  if (tier.pricingType !== "token") {
    const units = usage.providerUnits;
    if (units === null || units === undefined || !Number.isFinite(units) || units < 0) {
      return {
        amount: null,
        costVersionId: null,
        priceBookId: tier.priceBookId,
        resolution: "unsupported_pricing",
      };
    }
    return {
      amount: roundMoney(units * tier.promptCost + tier.fixedCost),
      costVersionId: tier.id,
      priceBookId: tier.priceBookId,
      resolution: "exact",
    };
  }

  let cacheReadCost = 0;
  if (cachedTokens > 0) {
    if (!usage.providerCacheMode) {
      return {
        amount: null,
        costVersionId: null,
        priceBookId: tier.priceBookId,
        resolution: "missing_cache_mode",
      };
    }
    const rate = usage.providerCacheMode === "explicit"
      ? tier.cacheReadExplicitCost
      : tier.cacheReadImplicitCost;
    if (rate === null) {
      return {
        amount: null,
        costVersionId: null,
        priceBookId: tier.priceBookId,
        resolution: "missing_cache_rate",
      };
    }
    cacheReadCost = (cachedTokens / 1_000_000) * rate;
  }

  let cacheCreationCost = 0;
  if (cacheCreationTokens > 0) {
    if (tier.cacheCreation5mCost === null) {
      return {
        amount: null,
        costVersionId: null,
        priceBookId: tier.priceBookId,
        resolution: "missing_cache_rate",
      };
    }
    cacheCreationCost =
      (cacheCreationTokens / 1_000_000) * tier.cacheCreation5mCost;
  }

  const uncachedPromptTokens = usage.providerInputIncludesCache === false
    ? promptTokens
    : Math.max(0, promptTokens - cachedTokens - cacheCreationTokens);
  const amount =
    (uncachedPromptTokens / 1_000_000) * tier.promptCost
    + cacheReadCost
    + cacheCreationCost
    + (completionTokens / 1_000_000) * tier.completionCost
    + tier.fixedCost;

  return {
    amount: roundMoney(amount),
    costVersionId: tier.id,
    priceBookId: tier.priceBookId,
    resolution: "exact",
  };
}

export async function resolveProviderCost(
  usage: ProviderCostUsage
): Promise<ProviderCostResult> {
  if (!usage.providerId) {
    return {
      amount: null,
      costVersionId: null,
      priceBookId: null,
      resolution: "missing_provider",
    };
  }
  if (usage.status !== "success" || usage.estimated) {
    return {
      amount: null,
      costVersionId: null,
      priceBookId: null,
      resolution: "not_applicable",
    };
  }

  const tiers = await getActiveProviderCostTiers(
    usage.providerId,
    usage.modelId
  );
  return calculateProviderCostFromTiers(tiers, usage);
}
