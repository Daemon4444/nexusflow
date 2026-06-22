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

export interface BillingResult {
  finalAmount: number;
  listAmount: number;
  discountRate: number;
  discountAmount: number;
  cachedTokens: number;
  cacheCreationTokens: number;
}

export async function calculateOpenAiCacheAwareCost(params: {
  userId?: string | null;
  model: AIModel;
  usage: any;
  explicitCache: boolean;
}): Promise<BillingResult> {
  const { promptTokens, completionTokens, cachedTokens, cacheCreationTokens } = getOpenAiPromptCacheUsage(params.usage);
  const tier = getTokenPricingTier(params.model, promptTokens);
  const promptPrice = tier?.promptPrice ?? params.model.promptPrice;
  const completionPrice = tier?.completionPrice ?? params.model.completionPrice;
  const cacheReadMultiplier = params.explicitCache ? 0.1 : 0.2;

  // Modality split for omni models: DashScope returns audio/text token breakdown
  // in *_tokens_details. When the model has audio prices and the request actually
  // used audio tokens, bill audio separately; otherwise fall back to flat text rate.
  const { audioInputPrice, audioOutputPrice } = params.model;
  const promptDetails = params.usage?.prompt_tokens_details || {};
  const completionDetails = params.usage?.completion_tokens_details || {};
  const audioPromptTokens = (audioInputPrice && audioInputPrice > 0)
    ? Math.min(toTokenCount(promptDetails.audio_tokens), promptTokens)
    : 0;
  const audioCompletionTokens = (audioOutputPrice && audioOutputPrice > 0)
    ? Math.min(toTokenCount(completionDetails.audio_tokens), completionTokens)
    : 0;

  // Text/image/video input (non-audio) keeps the existing cache-aware text pricing.
  const textPromptTokens = Math.max(0, promptTokens - audioPromptTokens);
  const effCached = Math.min(cachedTokens, textPromptTokens);
  const effCreation = Math.min(cacheCreationTokens, Math.max(0, textPromptTokens - effCached));
  const uncachedTextPrompt = Math.max(0, textPromptTokens - effCached - effCreation);

  const inputAmount =
    (uncachedTextPrompt / 1_000_000) * promptPrice +
    (effCreation / 1_000_000) * promptPrice * 1.25 +
    (effCached / 1_000_000) * promptPrice * cacheReadMultiplier +
    (audioPromptTokens / 1_000_000) * (audioInputPrice || 0);

  // When audio is produced, official 百炼 pricing charges audio output and the
  // text part of the mixed output is free; otherwise bill text output normally.
  const outputAmount = audioCompletionTokens > 0
    ? (audioCompletionTokens / 1_000_000) * (audioOutputPrice || 0)
    : (completionTokens / 1_000_000) * completionPrice;

  const listAmount = money(inputAmount + outputAmount);

  const discounted = await applyUserModelDiscount(params.userId, params.model.id, listAmount);
  return {
    finalAmount: discounted.finalAmount,
    listAmount: discounted.listAmount,
    discountRate: discounted.discountRate,
    discountAmount: discounted.discountAmount,
    cachedTokens,
    cacheCreationTokens,
  };
}

export function buildApiDescription(modelId: string, totalTokens: number, cachedTokens: number, stream?: boolean): string {
  const suffix = stream ? ", stream" : "";
  if (cachedTokens > 0) {
    return `API call: ${modelId} (${totalTokens} tokens, ${cachedTokens} cached${suffix})`;
  }
  return `API call: ${modelId} (${totalTokens} tokens${suffix})`;
}
