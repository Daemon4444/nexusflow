/**
 * Pre-flight estimates used to reserve TPM and balance before the upstream
 * call. Actual usage from the upstream response always settles the request.
 */
import { getReservedOutputTokens, type AIModel } from "../data/models";
import { calculateDiscountedTokenCost } from "../data/user-discounts";

/** Deliberately generous: ~2 characters per token for any JSON-ish value. */
export function roughTokenCount(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return Math.ceil(value.length / 2);
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + roughTokenCount(item), 0);
  if (typeof value === "object") return Math.ceil(JSON.stringify(value).length / 2);
  return Math.ceil(String(value).length / 2);
}

/** Prompt estimate + the output reservation for chat-style requests. */
export function estimateChatTokens(model: AIModel, messages: unknown[], maxTokens?: number): number {
  const promptTokens = Math.max(1, roughTokenCount(messages));
  const completionTokens = getReservedOutputTokens(model, maxTokens);
  return promptTokens + completionTokens;
}

/** Maximum discounted cost of a chat-style request, for the balance hold. */
export async function estimateChatMaxCost(
  userId: string | null | undefined,
  model: AIModel,
  messages: unknown[],
  maxTokens?: number
): Promise<number> {
  const promptTokens = Math.max(1, roughTokenCount(messages));
  const completionTokens = getReservedOutputTokens(model, maxTokens);
  return (await calculateDiscountedTokenCost(userId, model, promptTokens, completionTokens)).finalAmount;
}
