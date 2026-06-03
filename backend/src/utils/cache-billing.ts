import type { AIModel } from "../data/models";
import { getTokenPricingTier } from "../data/models";
import { applyUserModelDiscount } from "../data/user-discounts";

function money(value: number): number {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function toTokenCount(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

export function hasCacheControl(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasCacheControl);
  const record = value as Record<string, unknown>;
  if (
    record.cache_control &&
    typeof record.cache_control === "object" &&
    (record.cache_control as Record<string, unknown>).type === "ephemeral"
  ) {
    return true;
  }
  return Object.values(record).some(hasCacheControl);
}

export function getOpenAiPromptCacheUsage(usage: any): {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
} {
  const details = usage?.prompt_tokens_details || {};
  return {
    promptTokens: toTokenCount(usage?.prompt_tokens),
    completionTokens: toTokenCount(usage?.completion_tokens),
    cachedTokens: toTokenCount(details.cached_tokens),
    cacheCreationTokens: toTokenCount(details.cache_creation_input_tokens),
  };
}

export async function calculateOpenAiCacheAwareCost(params: {
  userId?: string | null;
  model: AIModel;
  usage: any;
  explicitCache: boolean;
}): Promise<number> {
  const { promptTokens, completionTokens, cachedTokens, cacheCreationTokens } = getOpenAiPromptCacheUsage(params.usage);
  const uncachedPromptTokens = Math.max(0, promptTokens - cachedTokens - cacheCreationTokens);
  const tier = getTokenPricingTier(params.model, promptTokens);
  const promptPrice = tier?.promptPrice ?? params.model.promptPrice;
  const completionPrice = tier?.completionPrice ?? params.model.completionPrice;
  const cacheReadMultiplier = params.explicitCache ? 0.1 : 0.2;

  const listAmount =
    (uncachedPromptTokens / 1_000_000) * promptPrice +
    (cacheCreationTokens / 1_000_000) * promptPrice * 1.25 +
    (cachedTokens / 1_000_000) * promptPrice * cacheReadMultiplier +
    (completionTokens / 1_000_000) * completionPrice;

  return (await applyUserModelDiscount(params.userId, params.model.id, money(listAmount))).finalAmount;
}
