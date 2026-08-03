import type { AIModel } from "../data/models";
import { getTokenPricingTier, resolveCachePricing, resolveCompletionPrice } from "../data/models";
import { applyUserModelDiscount } from "../data/user-discounts";

/** Token usage shapes consumed by billing. All fields optional — upstreams omit some. */
export interface OpenAiTokenDetails {
  cached_tokens?: number;
  cache_creation_input_tokens?: number;
  audio_tokens?: number;
  reasoning_tokens?: number;
}
export interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: OpenAiTokenDetails;
  completion_tokens_details?: OpenAiTokenDetails;
}
export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  /**
   * 思维链 token。Anthropic 原生 usage 没有该字段，由 openAiUsageToAnthropic
   * 从 OpenAI 的 completion_tokens_details.reasoning_tokens 透传而来，
   * 用于判定是否按思考模式输出价计费。
   */
  reasoning_tokens?: number;
}

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

/**
 * 判定本次请求是否开启了「显式缓存」。
 *
 * 有两条开启途径，且两者都会被透传上游：
 *  1. Anthropic 风格：messages[].cache_control = { type: "ephemeral" }
 *  2. DashScope 参数：enable_context_caching = true
 *
 * 漏判任一条都会把显式命中按隐式价计费。对官方显式价低于隐式价的模型
 * （如 qwen3.8-max 显式 ¥1 / 隐式 ¥1.5）即为多收客户。
 */
export function isExplicitCacheRequested(messages: unknown, requestBody: unknown): boolean {
  if (hasCacheControl(messages)) return true;
  if (requestBody && typeof requestBody === "object") {
    return (requestBody as Record<string, unknown>).enable_context_caching === true;
  }
  return false;
}

export function getOpenAiPromptCacheUsage(usage: OpenAiUsage | null | undefined): {
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
  usage: OpenAiUsage;
  explicitCache: boolean;
}): Promise<BillingResult> {
  const { promptTokens, completionTokens, cachedTokens, cacheCreationTokens } = getOpenAiPromptCacheUsage(params.usage);
  const tier = getTokenPricingTier(params.model, promptTokens);
  const promptPrice = tier?.promptPrice ?? params.model.promptPrice;
  // 官方对部分模型的思考模式单独定价（思维链+回答整体按思考价）。
  // 上游在 completion_tokens_details.reasoning_tokens 返回思维链长度，是唯一权威信号。
  const reasoningTokens = toTokenCount(params.usage?.completion_tokens_details?.reasoning_tokens);
  const completionPrice = resolveCompletionPrice(params.model, tier, reasoningTokens > 0);
  // 缓存价由 data/models 的唯一解析器给出，与对外展示同源，不在此重复倍率。
  const cachePricing = resolveCachePricing(params.model, tier);
  const cacheReadPrice = params.explicitCache ? cachePricing.explicitHit : cachePricing.implicitHit;

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
    (effCreation / 1_000_000) * cachePricing.explicitCreation +
    (effCached / 1_000_000) * cacheReadPrice +
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
    return `API 调用: ${modelId} (${totalTokens} tokens, ${cachedTokens} 缓存${suffix})`;
  }
  return `API 调用: ${modelId} (${totalTokens} tokens${suffix})`;
}
