import { consume } from "../data/billing";
import { AIModel } from "../data/models";
import { AsyncTask } from "../data/tasks";
import { logUsage } from "../data/usage";
import { getUserById } from "../data/users";

function money(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

type AsyncCostParams = {
  n?: number;
  duration?: number;
  quality?: string;
  resolution?: string;
  audio?: boolean;
  audio_setting?: unknown;
};

function normalizeResolution(params: AsyncCostParams): "360p" | "540p" | "720p" | "1080p" {
  const raw = String(params.resolution || params.quality || "").toLowerCase();
  if (raw.includes("1080")) return "1080p";
  if (raw.includes("720")) return "720p";
  if (raw.includes("360")) return "360p";
  return "540p";
}

function hasAudio(params: AsyncCostParams): boolean {
  if (typeof params.audio === "boolean") return params.audio;
  if (typeof params.audio_setting === "boolean") return params.audio_setting;
  if (params.audio_setting && typeof params.audio_setting === "object") return true;
  const raw = String(params.audio_setting || "").toLowerCase();
  return raw === "true" || raw === "audio" || raw === "with_audio" || raw === "有声";
}

function getVideoUnitPrice(modelId: string, params: AsyncCostParams): number {
  const resolution = normalizeResolution(params);
  const audio = hasAudio(params);

  if (modelId === "pixverse-v6") {
    const noAudio: Record<string, number> = { "360p": 0.15, "540p": 0.21, "720p": 0.27, "1080p": 0.53 };
    const withAudio: Record<string, number> = { "360p": 0.21, "540p": 0.27, "720p": 0.36, "1080p": 0.68 };
    return (audio ? withAudio : noAudio)[resolution];
  }

  if (modelId === "wan2.6-i2v-flash" || modelId === "wan2.6-r2v-flash") {
    if (audio) return resolution === "1080p" ? 0.5 : 0.3;
    return resolution === "1080p" ? 0.25 : 0.15;
  }

  if (modelId.startsWith("wan2.6-")) {
    return resolution === "1080p" ? 1 : 0.6;
  }

  if (modelId.startsWith("happyhorse-1.0-")) {
    return resolution === "1080p" ? 1.6 : 0.9;
  }

  return 0;
}

export function estimateAsyncCost(model: AIModel, params: AsyncCostParams): number {
  if (model.category === "图像生成") {
    const count = Math.max(1, Math.min(Number(params.n) || 1, 10));
    return money(count * model.promptPrice);
  }

  if (model.category === "视频生成") {
    const duration = Math.max(1, Number(params.duration) || 5);
    const unitPrice = getVideoUnitPrice(model.id, params) || model.promptPrice;
    return money(duration * unitPrice);
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

export function billAsyncError(apiKey: { id: string | null; user_id: string | null } | null, modelId: string, latencyMs: number): void {
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
