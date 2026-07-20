import { consume, getBillingReservation, releaseReservation, settleReservation } from "../data/billing";
import { AIModel } from "../data/models";
import { AsyncTask } from "../data/tasks";
import { logUsage } from "../data/usage";
import { applyUserModelDiscount } from "../data/user-discounts";
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

function normalizeResolution(params: AsyncCostParams): "360p" | "480p" | "540p" | "720p" | "1080p" | "4k" {
  const raw = String(params.resolution || params.quality || "").toLowerCase();
  if (raw.includes("4k") || raw.includes("2160")) return "4k";
  if (raw.includes("1080")) return "1080p";
  if (raw.includes("720")) return "720p";
  if (raw.includes("540")) return "540p";
  if (raw.includes("480")) return "480p";
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

function billingDescription(task: AsyncTask, model: AIModel): { description: string; refId?: string } {
  if (!task.api_key_id && task.user_id) {
    return {
      description: `Playground ${model.category}: ${task.model}`,
      refId: `playground:${task.user_id}`,
    };
  }
  return {
    description: `${model.category}: ${task.model}`,
    refId: task.api_key_id || undefined,
  };
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

  // ── Seedance 系列 (火山方舟 Volcengine Ark) ──
  // 火山按 token 计费：token 用量 = 宽 × 高 × 24fps × 时长 / 1024（16:9）。
  // 下列每秒成本价 = (该分辨率 tokens/秒) × (火山 token 单价 元/百万token) ÷ 1e6，
  // 单价取在线推理价（来源：volcengine.com/docs/82379/1099320）。零毛利，按需自行加价。
  // tokens/秒(16:9@24fps)：480p≈9607 / 540p≈12150 / 720p≈21600 / 1080p≈48600 / 4k≈194400
  // Seedance 2.0 系列：音画同生内置，价格不随有无声变化，仅按分辨率（及是否含输入视频）区分。
  if (modelId === "seedance-2.0") {
    // 单价 46(480/720p)/51(1080p)/26(4k) 元/百万token（无输入视频）
    return ({ "480p": 0.44, "540p": 0.56, "720p": 0.99, "1080p": 2.48, "4k": 5.05 } as Record<string, number>)[resolution] ?? 0.99;
  }
  if (modelId === "seedance-2.0-fast") {
    // 单价 37 元/百万token（无 1080p/4k）
    return ({ "480p": 0.36, "540p": 0.45, "720p": 0.80 } as Record<string, number>)[resolution] ?? 0.80;
  }
  if (modelId === "seedance-2.0-mini") {
    // 单价 23 元/百万token（无 1080p/4k）
    return ({ "480p": 0.22, "540p": 0.28, "720p": 0.50 } as Record<string, number>)[resolution] ?? 0.50;
  }
  if (modelId === "seedance-1.5-pro") {
    // 单价 有声16/无声8 元/百万token
    const silent: Record<string, number> = { "480p": 0.08, "540p": 0.10, "720p": 0.17, "1080p": 0.39 };
    const voiced: Record<string, number> = { "480p": 0.15, "540p": 0.19, "720p": 0.35, "1080p": 0.78 };
    return (audio ? voiced : silent)[resolution] ?? (audio ? 0.35 : 0.17);
  }
  if (modelId === "seedance-1.0-pro") {
    // 单价 15 元/百万token（无声）
    return ({ "480p": 0.14, "540p": 0.18, "720p": 0.32, "1080p": 0.73 } as Record<string, number>)[resolution] ?? 0.32;
  }
  if (modelId === "seedance-1.0-pro-fast") {
    // 单价 4.2 元/百万token
    return ({ "480p": 0.04, "540p": 0.05, "720p": 0.09, "1080p": 0.20 } as Record<string, number>)[resolution] ?? 0.09;
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

export async function estimateDiscountedAsyncCost(
  userId: string | null | undefined,
  model: AIModel,
  params: AsyncCostParams
): Promise<number> {
  return (await applyUserModelDiscount(userId, model.id, estimateAsyncCost(model, params))).finalAmount;
}

export async function hasEnoughBalance(userId: string | null | undefined, amount: number): Promise<boolean> {
  if (!userId || amount <= 0) return true;
  const user = await getUserById(userId);
  return !!user && user.balance >= amount;
}

export async function billAsyncSuccess(task: AsyncTask, model: AIModel, cost: number, latencyMs: number): Promise<void> {
  if (task.user_id) {
    const billing = billingDescription(task, model);
    if (task.billing_reservation_id) {
      await settleReservation(task.billing_reservation_id, cost, billing.description);
    } else if (cost > 0) {
      await consume(task.user_id, cost, billing.description, billing.refId);
    }
  }

  await logUsage({
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
}

/** Repairs the crash window between marking a task succeeded and settling it. */
export async function ensureAsyncTaskSettlement(task: AsyncTask, model: AIModel): Promise<void> {
  if (!task.billing_reservation_id) return;
  const reservation = await getBillingReservation(task.billing_reservation_id);
  if (!reservation || reservation.status !== "active") return;
  const billing = billingDescription(task, model);
  await settleReservation(task.billing_reservation_id, Number(task.cost || 0), billing.description);
}

export async function billAsyncError(
  apiKey: { id: string | null; user_id: string | null } | null,
  modelId: string,
  latencyMs: number,
  billingReservationId?: string | null
): Promise<void> {
  try {
    await logUsage({
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
  } finally {
    if (billingReservationId) {
      await releaseReservation(billingReservationId, "async_task_failed");
    }
  }
}
