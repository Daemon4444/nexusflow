import { consume } from "../data/billing";
import { AIModel } from "../data/models";
import { AsyncTask } from "../data/tasks";
import { logUsage } from "../data/usage";
import { getUserById } from "../data/users";

function money(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function estimateAsyncCost(model: AIModel, params: { n?: number; duration?: number }): number {
  if (model.category === "图像生成") {
    const count = Math.max(1, Math.min(Number(params.n) || 1, 10));
    return money(count * model.promptPrice);
  }

  if (model.category === "视频生成") {
    const duration = Math.max(1, Number(params.duration) || 5);
    return money(duration * model.promptPrice);
  }

  return 0;
}

export function hasEnoughBalance(userId: string | null | undefined, amount: number): boolean {
  if (!userId || amount <= 0) return true;
  const user = getUserById(userId);
  return !!user && user.balance >= amount;
}

export function billAsyncSuccess(task: AsyncTask, model: AIModel, cost: number, latencyMs: number): void {
  logUsage({
    apiKeyId: task.api_key_id,
    userId: task.user_id,
    model: task.model,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost,
    status: "success",
    latencyMs,
  });

  if (task.user_id && cost > 0) {
    consume(task.user_id, cost, `${model.category}: ${task.model}`, task.api_key_id || undefined);
  }
}

export function billAsyncError(apiKey: { id: string; user_id: string | null } | null, modelId: string, latencyMs: number): void {
  logUsage({
    apiKeyId: apiKey?.id || null,
    userId: apiKey?.user_id || null,
    model: modelId,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
    status: "error",
    latencyMs,
  });
}
