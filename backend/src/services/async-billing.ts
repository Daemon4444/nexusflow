import { consume, getBillingReservation, hasSufficientBalance, releaseReservation, settleReservation } from "../data/billing";
import { AIModel } from "../data/models";
import { AsyncTask } from "../data/tasks";
import { logUsage } from "../data/usage";
import { applyUserModelDiscount } from "../data/user-discounts";
import { resolveVideoSizeTier } from "../utils/video-parameters";

function money(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

type AsyncCostParams = {
  n?: number;
  duration?: number;
  quality?: string;
  resolution?: string;
  size?: string;
  audio?: boolean;
  audio_setting?: unknown;
  video_url?: string;
  usage?: Record<string, unknown>;
};

function normalizeResolution(params: AsyncCostParams): "360p" | "480p" | "540p" | "720p" | "1080p" | "4k" {
  const raw = String(params.resolution || params.quality || "").toLowerCase();
  if (raw) {
    if (raw.includes("4k") || raw.includes("2160")) return "4k";
    if (raw.includes("1080")) return "1080p";
    if (raw.includes("720")) return "720p";
    if (raw.includes("540")) return "540p";
    if (raw.includes("480")) return "480p";
    if (raw.includes("360")) return "360p";
  }
  // t2v/r2v 归一化后只留下 size（parameters.size 才是下发给上游的字段）。不读它
  // 会让「按 size 表达的 1080P」按 720P 结算，也会让只配了 720P/1080P 的模型
  // （wan2.7 系列）在默认档上直接失去价格。
  const sizeTier = resolveVideoSizeTier(params.size);
  if (sizeTier) return sizeTier === "1080P" ? "1080p" : "720p";
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

function getVideoUnitPrice(modelId: string, params: AsyncCostParams): number | undefined {
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

  if (modelId.startsWith("wan2.7-")) {
    if (resolution === "720p") return 0.6;
    if (resolution === "1080p") return 1;
    return undefined;
  }

  if (modelId === "wan3.0-video-prime") {
    return 0.45;
  }

  if (modelId === "wan3.0-video") {
    return 0.3;
  }

  if (modelId.startsWith("happyhorse-1.1-")) {
    return 0.45;
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

  return undefined;
}

function getVideoBillableDuration(modelId: string, params: AsyncCostParams): number {
  const usage = params.usage;
  if (usage) {
    const total = Number(usage.duration);
    if (Number.isFinite(total) && total > 0) return total;
    const input = Number(usage.input_video_duration);
    const output = Number(usage.output_video_duration);
    if (Number.isFinite(input) && input >= 0 && Number.isFinite(output) && output > 0) {
      return input + output;
    }
    // usage 缺时长时不能抛错：这里跑在任务轮询路径上，抛错会让 completeTask
    // 永远不执行，任务卡在 pending 且预留余额不释放。下面的回退公式已经把
    // 输入视频时长计入，直接落回退即可。
  }

  if (modelId === "wan2.7-videoedit") {
    return (Math.max(2, Number(params.duration) || 10)) + 10;
  }
  if (modelId === "wan2.7-r2v" && params.video_url) {
    return Math.max(1, Number(params.duration) || 5) + 5;
  }
  return Math.max(1, Number(params.duration) || 5);
}

export function estimateAsyncCost(model: AIModel, params: AsyncCostParams): number {
  if (model.category === "图像生成") {
    const count = Math.max(1, Math.min(Number(params.n) || 1, 10));
    return money(count * model.promptPrice);
  }

  if (model.category === "视频生成") {
    const unitPrice = getVideoUnitPrice(model.id, params);
    if (unitPrice === undefined) {
      throw new Error(`No price is configured for '${model.id}' at resolution '${normalizeResolution(params)}'`);
    }
    return money(getVideoBillableDuration(model.id, params) * unitPrice);
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

/**
 * 任务轮询路径的结算取价。跑在 completeTask 之前，所以这里绝不能抛错：
 * 抛错会让任务永远停在 pending，并且预留余额不会释放。优先用上游 usage 的
 * 真实时长；取价失败就退回创建时那套参数（它在建单时已经成功过一次）；
 * 都失败才记一条日志并按 0 结算，把任务放行给退款路径。
 */
export async function settleAsyncCost(
  userId: string | null | undefined,
  model: AIModel,
  input: AsyncCostParams,
  usage: Record<string, unknown> | undefined
): Promise<number> {
  try {
    return await estimateDiscountedAsyncCost(userId, model, { ...input, usage });
  } catch (withUsageError) {
    try {
      const fallback = await estimateDiscountedAsyncCost(userId, model, input);
      console.warn(
        `[async-billing] usage-based pricing failed for '${model.id}', fell back to request parameters:`,
        withUsageError instanceof Error ? withUsageError.message : withUsageError
      );
      return fallback;
    } catch (fallbackError) {
      console.error(
        `[async-billing] no price could be resolved for '${model.id}', settling at 0:`,
        fallbackError instanceof Error ? fallbackError.message : fallbackError
      );
      return 0;
    }
  }
}

export async function hasEnoughBalance(userId: string | null | undefined, amount: number): Promise<boolean> {
  if (!userId || amount <= 0) return true;
  return hasSufficientBalance(userId, amount);
}

function getProviderUnits(task: AsyncTask): number {
  if (task.type !== "video") return Math.max(1, Number(task.input?.n) || 1);
  return getVideoBillableDuration(task.model, {
    ...(task.input || {}),
    usage: task.output?.usage,
  });
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
    providerId: task.provider || null,
    channelId: task.input?._route?.channelId || null,
    region: task.input?._route?.region || null,
    protocol: `async-${task.type}`,
    apiKeyId: task.api_key_id,
    userId: task.user_id,
    model: task.model,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost,
    status: "success",
    latencyMs,
    providerUnits: getProviderUnits(task),
    reservationId: task.billing_reservation_id,
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
      protocol: "async-task",
      reservationId: billingReservationId || null,
      errorCode: "upstream_error",
    });
  } finally {
    if (billingReservationId) {
      await releaseReservation(billingReservationId, "async_task_failed");
    }
  }
}
