/**
 * Fallback Service
 *
 * 实现：
 * - 上游健康检测（心跳）
 * - 故障自动切换
 * - 重试逻辑
 * - 多供应商冗余
 */

import dotenv from "dotenv";
import { getCachedProviderHealth, cacheProviderHealth } from "./redis";

dotenv.config();

// ============================================================
// 配置
// ============================================================

const FALLBACK_ENABLED = process.env.FALLBACK_ENABLED === "true";
const MAX_RETRIES = parseInt(process.env.FALLBACK_MAX_RETRIES || "3");
const RETRY_DELAY = parseInt(process.env.FALLBACK_RETRY_DELAY || "1000");
const HEALTH_CHECK_INTERVAL = parseInt(process.env.FALLBACK_HEALTH_CHECK_INTERVAL || "60000");

// ============================================================
// 供应商配置
// ============================================================

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  models: string[]; // 支持的模型 ID
  priority: number; // 优先级，越高越优先
  weight: number;   // 权重，用于负载均衡
  healthy: boolean;
}

// 预配置的供应商列表
const PROVIDERS: ProviderConfig[] = [
  {
    id: "dashscope",
    name: "阿里云百炼 (DashScope)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    models: [
      "qwen3-max", "qwen3.5-plus", "qwen3.5-flash", "qwen-plus", "qwen-turbo",
      "qwq-plus", "qwen-vl-max", "qwen-vl-plus",
      "deepseek-v4-flash", "deepseek-v3.2", "deepseek-r1", "glm-4.7", "kimi-k2.5", "MiniMax-M2.1"
    ],
    priority: 100,
    weight: 100,
    healthy: true,
  },
  {
    id: "pixverse",
    name: "拍我AI (PixVerse)",
    baseUrl: "https://app-api.pixverseai.cn/openapi/v2",
    apiKeyEnv: "PIXVERSE_API_KEY",
    models: ["pixverse-v4.5", "pixverse-v4", "pixverse-v3.5"],
    priority: 90,
    weight: 100,
    healthy: true,
  },
  // 可扩展添加更多供应商
];

// 模型 -> 供应商映射
const MODEL_TO_PROVIDERS: Map<string, ProviderConfig[]> = new Map();

// 初始化映射
function initModelMapping(): void {
  for (const provider of PROVIDERS) {
    for (const modelId of provider.models) {
      const existing = MODEL_TO_PROVIDERS.get(modelId) || [];
      existing.push(provider);
      // 按优先级排序
      existing.sort((a, b) => b.priority - a.priority);
      MODEL_TO_PROVIDERS.set(modelId, existing);
    }
  }
}

initModelMapping();

// ============================================================
// 健康检测
// ============================================================

interface HealthStatus {
  providerId: string;
  modelId: string;
  status: "healthy" | "degraded" | "down";
  consecutiveFailures: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  avgLatencyMs: number;
}

// 健康状态存储（内存 + Redis）
const HEALTH_STORE: Map<string, HealthStatus> = new Map();

/**
 * 获取供应商健康状态
 */
export async function getProviderHealth(
  providerId: string,
  modelId: string
): Promise<HealthStatus> {
  const key = `${providerId}:${modelId}`;

  // 先查缓存
  const cached = await getCachedProviderHealth(providerId, modelId);
  if (cached) {
    const stored = HEALTH_STORE.get(key);
    if (stored) {
      stored.status = cached;
      return stored;
    }
  }

  // 默认健康
  const defaultStatus: HealthStatus = {
    providerId,
    modelId,
    status: "healthy",
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    avgLatencyMs: 0,
  };

  return HEALTH_STORE.get(key) || defaultStatus;
}

/**
 * 记录成功请求
 */
export async function recordSuccess(
  providerId: string,
  modelId: string,
  latencyMs: number
): Promise<void> {
  const key = `${providerId}:${modelId}`;
  const status = HEALTH_STORE.get(key) || {
    providerId,
    modelId,
    status: "healthy" as const,
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    avgLatencyMs: 0,
  };

  status.consecutiveFailures = 0;
  status.lastSuccessAt = Date.now();
  status.status = "healthy";
  status.avgLatencyMs = (status.avgLatencyMs * 0.8) + (latencyMs * 0.2); // 加权平均

  HEALTH_STORE.set(key, status);
  await cacheProviderHealth(providerId, modelId, "healthy", 60);
}

/**
 * 记录失败请求
 */
export async function recordFailure(
  providerId: string,
  modelId: string,
  error: string
): Promise<void> {
  const key = `${providerId}:${modelId}`;
  const status = HEALTH_STORE.get(key) || {
    providerId,
    modelId,
    status: "healthy" as const,
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    avgLatencyMs: 0,
  };

  status.consecutiveFailures++;
  status.lastFailureAt = Date.now();
  status.lastError = error;

  // 连续失败 3 次标记为 degraded，5 次标记为 down
  if (status.consecutiveFailures >= 5) {
    status.status = "down";
  } else if (status.consecutiveFailures >= 3) {
    status.status = "degraded";
  }

  HEALTH_STORE.set(key, status);
  await cacheProviderHealth(providerId, modelId, status.status, 60);
}

// ============================================================
// 供应商选择
// ============================================================

/**
 * 获取模型可用的供应商（按健康状态和优先级排序）
 */
export function getAvailableProviders(modelId: string): ProviderConfig[] {
  const providers = MODEL_TO_PROVIDERS.get(modelId) || [];

  // 按健康状态排序：healthy > degraded > down
  return providers.sort((a, b) => {
    const aHealth = HEALTH_STORE.get(`${a.id}:${modelId}`)?.status || "healthy";
    const bHealth = HEALTH_STORE.get(`${b.id}:${modelId}`)?.status || "healthy";

    // 健康状态权重
    const healthWeight: Record<string, number> = {
      healthy: 100,
      degraded: 50,
      down: 0,
    };

    const aScore = (healthWeight[aHealth] || 0) + a.priority;
    const bScore = (healthWeight[bHealth] || 0) + b.priority;

    return bScore - aScore;
  });
}

/**
 * 选择最佳供应商
 */
export function selectBestProvider(modelId: string): ProviderConfig | null {
  const providers = getAvailableProviders(modelId);

  // 过滤掉 down 状态的供应商
  const healthyProviders = providers.filter((p) => {
    const health = HEALTH_STORE.get(`${p.id}:${modelId}`)?.status || "healthy";
    return health !== "down";
  });

  if (healthyProviders.length === 0) {
    // 所有供应商都 down，尝试降级到最近的供应商
    return providers[0] || null;
  }

  // 负载均衡：根据权重随机选择
  if (healthyProviders.length > 1) {
    const totalWeight = healthyProviders.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;

    for (const provider of healthyProviders) {
      random -= provider.weight;
      if (random <= 0) {
        return provider;
      }
    }
  }

  return healthyProviders[0];
}

// ============================================================
// 请求执行（带 Fallback）
// ============================================================

interface RequestOptions {
  modelId: string;
  method: string;
  path: string;
  body: any;
  headers?: Record<string, string>;
}

interface RequestResult {
  success: boolean;
  data?: any;
  error?: string;
  providerId: string;
  latencyMs: number;
  retries: number;
}

/**
 * 执行请求（带 Fallback 机制）
 */
export async function executeWithFallback(
  options: RequestOptions
): Promise<RequestResult> {
  if (!FALLBACK_ENABLED) {
    // Fallback 未启用，直接使用默认供应商
    return await executeDirect(options);
  }

  const providers = getAvailableProviders(options.modelId);
  let retries = 0;
  const startTime = Date.now();

  for (const provider of providers) {
    // 检查健康状态
    const health = await getProviderHealth(provider.id, options.modelId);
    if (health.status === "down") {
      continue; // 跳过 down 状态的供应商
    }

    retries++;

    try {
      const apiKey = process.env[provider.apiKeyEnv] || "";
      if (!apiKey) {
        continue; // 没有配置 API Key
      }

      const url = `${provider.baseUrl}${options.path}`;
      const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      };

      const response = await fetch(url, {
        method: options.method,
        headers,
        body: JSON.stringify(options.body),
      });

      const data = await response.json() as { error?: { message?: string } };
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        // 记录失败
        await recordFailure(provider.id, options.modelId, (data as any).error?.message || `HTTP ${response.status}`);

        // 如果是临时错误（如超时），继续尝试下一个供应商
        if (response.status >= 500 || response.status === 429) {
          continue;
        }

        // 其他错误直接返回
        return {
          success: false,
          error: (data as any).error?.message || `HTTP ${response.status}`,
          providerId: provider.id,
          latencyMs,
          retries,
        };
      }

      // 记录成功
      await recordSuccess(provider.id, options.modelId, latencyMs);

      return {
        success: true,
        data: data as any,
        providerId: provider.id,
        latencyMs,
        retries,
      };

    } catch (err: any) {
      // 网络错误，记录失败，继续尝试下一个供应商
      await recordFailure(provider.id, options.modelId, err.message);

      if (retries >= MAX_RETRIES) {
        break;
      }

      // 延迟后重试
      await sleep(RETRY_DELAY);
    }
  }

  // 所有供应商都失败
  return {
    success: false,
    error: "All providers failed for model: " + options.modelId,
    providerId: "none",
    latencyMs: Date.now() - startTime,
    retries,
  };
}

/**
 * 直接执行（无 Fallback）
 */
async function executeDirect(options: RequestOptions): Promise<RequestResult> {
  const startTime = Date.now();

  // 使用默认供应商
  const provider = PROVIDERS[0];
  const apiKey = process.env[provider.apiKeyEnv] || "";

  const url = `${provider.baseUrl}${options.path}`;
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      method: options.method,
      headers,
      body: JSON.stringify(options.body),
    });

    const data = await response.json() as any;
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        error: data?.error?.message || `HTTP ${response.status}`,
        providerId: provider.id,
        latencyMs,
        retries: 1,
      };
    }

    return {
      success: true,
      data,
      providerId: provider.id,
      latencyMs,
      retries: 1,
    };

  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      providerId: provider.id,
      latencyMs: Date.now() - startTime,
      retries: 1,
    };
  }
}

// ============================================================
// 辅助函数
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// 健康检测定时任务
// ============================================================

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

/**
 * 启动健康检测定时任务
 */
export function startHealthCheck(): void {
  if (healthCheckInterval) return;

  healthCheckInterval = setInterval(async () => {
    for (const provider of PROVIDERS) {
      for (const modelId of provider.models.slice(0, 3)) { // 只检测部分代表性模型
        try {
          const apiKey = process.env[provider.apiKeyEnv] || "";
          if (!apiKey) continue;

          // 发送轻量级请求检测健康状态
          const response = await fetch(`${provider.baseUrl}/models`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
            },
          });

          if (response.ok) {
            await recordSuccess(provider.id, modelId, 0);
          } else {
            await recordFailure(provider.id, modelId, `Health check failed: ${response.status}`);
          }

        } catch (err: any) {
          await recordFailure(provider.id, modelId, `Health check error: ${err.message}`);
        }
      }
    }
  }, HEALTH_CHECK_INTERVAL);

  console.log("[Fallback] 健康检测已启动，间隔:", HEALTH_CHECK_INTERVAL, "ms");
}

/**
 * 停止健康检测
 */
export function stopHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// ============================================================
// 导出
// ============================================================

export default {
  PROVIDERS,
  MODEL_TO_PROVIDERS,
  getProviderHealth,
  recordSuccess,
  recordFailure,
  getAvailableProviders,
  selectBestProvider,
  executeWithFallback,
  startHealthCheck,
  stopHealthCheck,
};
