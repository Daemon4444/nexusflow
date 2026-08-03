import { closeDb, db } from "../db/client";
import {
  getTokenPricingTier,
  models,
  resolveCachePricing,
  resolveCompletionPrice,
} from "../data/models";
import {
  applyRetailListPriceFallback,
  providerCostStorageFields,
  resolveProviderCost,
  type ProviderCacheMode,
  type ProviderCostResolution,
} from "../services/provider-costs";

interface UsageRow {
  id: number;
  provider_id: string | null;
  model: string;
  prompt_tokens: number | string;
  completion_tokens: number | string;
  cached_tokens: number | string | null;
  cache_creation_tokens: number | string | null;
  provider_cache_mode: ProviderCacheMode | null;
  provider_input_includes_cache: boolean | null;
  retail_list_cost: number | string | null;
  settlement_amount: number | string | null;
  settlement_discount_amount: number | string | null;
}

export interface ProviderCostBackfillOptions {
  apply: boolean;
  sinceHours: number;
  limit: number;
}

export interface ProviderCostBackfillSummary extends ProviderCostBackfillOptions {
  dryRun: boolean;
  scanned: number;
  exact: number;
  listPriceFallback: number;
  changed: number;
  unresolved: Record<string, number>;
}

function positiveNumber(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
}

function parseArguments(argv: string[]): ProviderCostBackfillOptions {
  let apply = false;
  let sinceHours = 24;
  let limit = 10_000;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") apply = true;
    else if (argument === "--since-hours") {
      sinceHours = positiveNumber(argv[index += 1], "--since-hours");
    } else if (argument === "--limit") {
      limit = Math.floor(positiveNumber(argv[index += 1], "--limit"));
    } else throw new Error(`unknown argument: ${argument}`);
  }
  if (sinceHours > 24 * 366) throw new Error("--since-hours exceeds one year");
  if (limit > 100_000) throw new Error("--limit exceeds 100000");
  return { apply, sinceHours, limit };
}

function tokens(value: number | string | null): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function nullableMoney(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

const MODEL_BY_ID = new Map(models.map((model) => [model.id, model]));

function catalogListCost(
  row: UsageRow,
  cacheFacts: ReturnType<typeof inferDashScopeCacheFacts>
): number | null {
  const model = MODEL_BY_ID.get(row.model);
  if (!model || (model.pricingType && model.pricingType !== "token")) return null;

  const promptTokens = tokens(row.prompt_tokens);
  const cachedTokens = tokens(row.cached_tokens);
  const cacheCreationTokens = tokens(row.cache_creation_tokens);
  const totalInputTokens = cacheFacts.providerInputIncludesCache === false
    ? promptTokens + cachedTokens + cacheCreationTokens
    : promptTokens;
  const tier = getTokenPricingTier(model, totalInputTokens);
  const promptPrice = tier?.promptPrice ?? model.promptPrice;
  const completionPrice = resolveCompletionPrice(model, tier, false);
  const cachePricing = resolveCachePricing(model, tier);
  const cacheReadPrice = cacheFacts.providerCacheMode === "explicit"
    ? cachePricing.explicitHit
    : cachePricing.implicitHit;
  const uncachedPromptTokens = cacheFacts.providerInputIncludesCache === false
    ? promptTokens
    : Math.max(0, promptTokens - cachedTokens - cacheCreationTokens);
  const amount =
    (uncachedPromptTokens / 1_000_000) * promptPrice
    + (cachedTokens / 1_000_000) * cacheReadPrice
    + (cacheCreationTokens / 1_000_000) * cachePricing.explicitCreation
    + (tokens(row.completion_tokens) / 1_000_000) * completionPrice;
  return Math.round((amount + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function reconstructListCost(
  row: UsageRow,
  cacheFacts: ReturnType<typeof inferDashScopeCacheFacts>
): number | null {
  const direct = nullableMoney(row.retail_list_cost);
  if (direct !== null) return direct;

  const settlement = nullableMoney(row.settlement_amount);
  const discount = nullableMoney(row.settlement_discount_amount);
  if (settlement === null) return null;
  if (discount !== null) return settlement + discount;

  // Older settlements did not always persist an explicit zero discount. Only
  // accept their amount as list price when the captured token facts reproduce
  // the current official catalog amount exactly at ledger precision.
  const catalog = catalogListCost(row, cacheFacts);
  return catalog !== null && Math.abs(catalog - settlement) <= 0.000001
    ? catalog
    : null;
}

function inferDashScopeCacheFacts(row: UsageRow, providerId: string | null) {
  const hasCache = tokens(row.cached_tokens) > 0 || tokens(row.cache_creation_tokens) > 0;
  if (providerId !== "dashscope" || !hasCache) {
    return {
      providerCacheMode: row.provider_cache_mode,
      providerInputIncludesCache: row.provider_input_includes_cache,
    };
  }
  return {
    providerCacheMode: row.provider_cache_mode || "implicit" as ProviderCacheMode,
    providerInputIncludesCache: row.provider_input_includes_cache ?? true,
  };
}

export async function backfillProviderCosts(
  options: ProviderCostBackfillOptions
): Promise<ProviderCostBackfillSummary> {
  const cutoff = new Date(Date.now() - options.sinceHours * 3_600_000).toISOString();
  const rows = await db.queryMany<UsageRow>(
    `SELECT ul.id, ul.provider_id, ul.model, ul.prompt_tokens,
            ul.completion_tokens, ul.cached_tokens, ul.cache_creation_tokens,
            ul.provider_cache_mode, ul.provider_input_includes_cache,
            ul.retail_list_cost,
            settlement.amount AS settlement_amount,
            settlement.discount_amount_cny AS settlement_discount_amount
       FROM usage_logs ul
       LEFT JOIN LATERAL (
         SELECT t.amount, t.discount_amount_cny
           FROM transactions t
          WHERE t.type = 'consumption'
            AND ul.reservation_id IS NOT NULL
            AND t.ref_id = 'reservation:' || ul.reservation_id
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT 1
       ) settlement ON TRUE
      WHERE ul.created_at >= ?
        AND ul.status = 'success'
        AND ul.estimated IS NOT TRUE
        AND ul.provider_cost IS NULL
      ORDER BY ul.created_at, ul.id
      LIMIT ?`,
    [cutoff, options.limit]
  );

  const models = [...new Set(rows.map((row) => row.model))];
  const uniqueProviderByModel = new Map<string, string>();
  if (models.length > 0) {
    const placeholders = models.map(() => "?").join(", ");
    const routes = await db.queryMany<{ model_id: string; providers: string[] }>(
      `SELECT model_id, ARRAY_AGG(DISTINCT provider_id) AS providers
         FROM provider_capacity
        WHERE is_enabled = TRUE AND model_id IN (${placeholders})
        GROUP BY model_id`,
      models
    );
    for (const route of routes) {
      if (route.providers.length === 1) uniqueProviderByModel.set(route.model_id, route.providers[0]);
    }
  }

  const updates: Array<{
    id: number;
    providerId: string;
    providerCacheMode: ProviderCacheMode | null;
    providerInputIncludesCache: boolean | null;
    retailListCost: number | null;
    amount: number;
    costVersionId: string | null;
    resolution: ProviderCostResolution;
  }> = [];
  const unresolved: Record<string, number> = {};
  let exact = 0;
  let listPriceFallback = 0;

  for (const row of rows) {
    const providerId = row.provider_id || uniqueProviderByModel.get(row.model) || null;
    const cacheFacts = inferDashScopeCacheFacts(row, providerId);
    const retailListCost = reconstructListCost(row, cacheFacts);
    const exactResult = await resolveProviderCost({
      providerId,
      modelId: row.model,
      promptTokens: tokens(row.prompt_tokens),
      completionTokens: tokens(row.completion_tokens),
      cachedTokens: tokens(row.cached_tokens),
      cacheCreationTokens: tokens(row.cache_creation_tokens),
      providerCacheMode: cacheFacts.providerCacheMode,
      providerInputIncludesCache: cacheFacts.providerInputIncludesCache,
      status: "success",
      estimated: false,
    });
    const result = applyRetailListPriceFallback(exactResult, {
      providerId,
      retailListCost,
      status: "success",
      estimated: false,
    });
    if (providerId && result.amount !== null) {
      if (result.resolution === "exact") exact += 1;
      else if (result.resolution === "list_price_fallback") listPriceFallback += 1;
      updates.push({
        id: row.id,
        providerId,
        ...cacheFacts,
        retailListCost,
        amount: result.amount,
        costVersionId: result.costVersionId,
        resolution: result.resolution,
      });
    } else {
      unresolved[result.resolution] = (unresolved[result.resolution] || 0) + 1;
    }
  }

  let changed = 0;
  if (options.apply && updates.length > 0) {
    changed = await db.transaction(async (client) => {
      let count = 0;
      for (const update of updates) {
        const storage = providerCostStorageFields({
          amount: update.amount,
          costVersionId: update.costVersionId,
          priceBookId: null,
          resolution: update.resolution,
        });
        count += await client.execute(
          `UPDATE usage_logs
              SET provider_id = COALESCE(provider_id, ?),
                  provider_cache_mode = COALESCE(provider_cache_mode, ?),
                  provider_input_includes_cache = COALESCE(provider_input_includes_cache, ?),
                  retail_list_cost = COALESCE(retail_list_cost, ?),
                  provider_cost = ?, cost_version_id = ?, provider_cost_resolution = ?,
                  provider_cost_basis = ?
            WHERE id = ? AND provider_cost IS NULL`,
          [
            update.providerId,
            update.providerCacheMode,
            update.providerInputIncludesCache,
            update.retailListCost,
            update.amount,
            update.costVersionId,
            storage.resolution,
            storage.basis,
            update.id,
          ]
        );
      }
      return count;
    });
  }

  return {
    ...options,
    dryRun: !options.apply,
    scanned: rows.length,
    exact,
    listPriceFallback,
    changed,
    unresolved,
  };
}

if (require.main === module) {
  backfillProviderCosts(parseArguments(process.argv.slice(2)))
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch((error) => {
      console.error("[provider-cost-backfill] failed:", error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
