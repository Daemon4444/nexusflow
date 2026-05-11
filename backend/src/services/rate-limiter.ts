/**
 * Rate Limiter Service
 *
 * 支持两种模式：
 * 1. Redis 模式（生产环境推荐）- 分布式、持久化
 * 2. 内存模式（开发环境）- 单进程、快速
 *
 * Two-layer rate limiting:
 * 1. Provider-level: RPM/TPM per provider per model
 * 2. Consumer-level: RPM per API key
 */

import { adjustTPMUsageRedis, checkRateLimitRedis, checkTPMLimitRedis, getRedis } from "./redis";

// ============================================================
// 配置
// ============================================================

const USE_REDIS = process.env.REDIS_HOST && process.env.REDIS_HOST !== "";

// ============================================================
// 内存模式（备用）
// ============================================================

interface WindowEntry {
  timestamp: number;
  tokens: number;
}

interface RateLimitBucket {
  entries: WindowEntry[];
  windowMs: number;
}

class SlidingWindowLimiter {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Clean up expired entries every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 30_000);
  }

  private getBucket(key: string, windowMs: number): RateLimitBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { entries: [], windowMs };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private trimWindow(bucket: RateLimitBucket): void {
    const cutoff = Date.now() - bucket.windowMs;
    while (bucket.entries.length > 0 && bucket.entries[0].timestamp < cutoff) {
      bucket.entries.shift();
    }
  }

  checkRPM(key: string, limit: number): { allowed: boolean; remaining: number; resetMs: number } {
    const windowMs = 60_000;
    const bucket = this.getBucket(`rpm:${key}`, windowMs);
    this.trimWindow(bucket);

    const count = bucket.entries.length;
    const remaining = Math.max(0, limit - count);
    const resetMs = bucket.entries.length > 0
      ? bucket.entries[0].timestamp + windowMs - Date.now()
      : windowMs;

    return { allowed: count < limit, remaining, resetMs };
  }

  checkTPM(key: string, limit: number, estimatedTokens: number): { allowed: boolean; remaining: number } {
    const windowMs = 60_000;
    const bucket = this.getBucket(`tpm:${key}`, windowMs);
    this.trimWindow(bucket);

    const totalTokens = bucket.entries.reduce((sum, e) => sum + e.tokens, 0);
    const remaining = Math.max(0, limit - totalTokens);

    if (totalTokens + estimatedTokens > limit) {
      return { allowed: false, remaining };
    }

    bucket.entries.push({ timestamp: Date.now(), tokens: Math.max(0, Math.ceil(estimatedTokens)) });
    return { allowed: true, remaining: Math.max(0, limit - totalTokens - estimatedTokens) };
  }

  recordRequest(key: string): void {
    const bucket = this.getBucket(`rpm:${key}`, 60_000);
    bucket.entries.push({ timestamp: Date.now(), tokens: 0 });
  }

  recordTokens(key: string, tokens: number): void {
    const bucket = this.getBucket(`tpm:${key}`, 60_000);
    bucket.entries.push({ timestamp: Date.now(), tokens });
  }

  adjustTokens(key: string, deltaTokens: number): void {
    const delta = Math.ceil(deltaTokens);
    if (delta === 0) return;

    const bucket = this.getBucket(`tpm:${key}`, 60_000);
    this.trimWindow(bucket);

    if (delta > 0) {
      bucket.entries.push({ timestamp: Date.now(), tokens: delta });
      return;
    }

    let remainingToRemove = Math.abs(delta);
    for (let index = bucket.entries.length - 1; index >= 0 && remainingToRemove > 0; index--) {
      const entry = bucket.entries[index];
      const remove = Math.min(entry.tokens, remainingToRemove);
      entry.tokens -= remove;
      remainingToRemove -= remove;
    }
    bucket.entries = bucket.entries.filter((entry) => entry.tokens > 0);
  }

  getStats(key: string): { rpm: number; tpm: number } {
    const rpmBucket = this.buckets.get(`rpm:${key}`);
    const tpmBucket = this.buckets.get(`tpm:${key}`);

    if (rpmBucket) this.trimWindow(rpmBucket);
    if (tpmBucket) this.trimWindow(tpmBucket);

    return {
      rpm: rpmBucket ? rpmBucket.entries.length : 0,
      tpm: tpmBucket ? tpmBucket.entries.reduce((s, e) => s + e.tokens, 0) : 0,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      this.trimWindow(bucket);
      if (bucket.entries.length === 0) {
        this.buckets.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

// 内存模式实例（备用）
const memoryProviderLimiter = new SlidingWindowLimiter();
const memoryConsumerLimiter = new SlidingWindowLimiter();

// ============================================================
// 统一接口
// ============================================================

/**
 * 检查 RPM 限制（自动选择 Redis 或内存）
 */
export async function checkRPM(
  key: string,
  limit: number,
  windowMs: number = 60000
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  if (USE_REDIS) {
    try {
      return await checkRateLimitRedis(key, limit, windowMs);
    } catch {
      // Redis 失败，降级到内存模式
      console.warn("[RateLimiter] Redis 失败，降级到内存模式");
    }
  }

  // 内存模式
  return memoryConsumerLimiter.checkRPM(key, limit);
}

/**
 * 检查 TPM 限制
 */
export async function checkTPM(
  key: string,
  limit: number,
  estimatedTokens: number,
  windowMs: number = 60000
): Promise<{ allowed: boolean; remaining: number }> {
  if (USE_REDIS) {
    try {
      return await checkTPMLimitRedis(key, limit, estimatedTokens, windowMs);
    } catch {
      console.warn("[RateLimiter] Redis 失败，降级到内存模式");
    }
  }

  // 内存模式
  return memoryConsumerLimiter.checkTPM(key, limit, estimatedTokens);
}

/**
 * 记录请求（RPM）
 */
export async function recordRequestAsync(key: string): Promise<void> {
  if (USE_REDIS) {
    try {
      const client = getRedis();
      const now = Date.now();
      await client.zadd(`rpm:${key}`, now, `${now}-${Math.random().toString(36).slice(2)}`);
      await client.expire(`rpm:${key}`, 61);
      return;
    } catch {
      console.warn("[RateLimiter] Redis 失败，降级到内存模式");
    }
  }

  // 内存模式
  memoryConsumerLimiter.recordRequest(key);
}

/**
 * 记录 Token 使用（TPM）
 */
export async function recordTokensAsync(key: string, tokens: number): Promise<void> {
  if (USE_REDIS) {
    try {
      const client = getRedis();
      await client.incrby(`tpm:${key}`, tokens);
      await client.expire(`tpm:${key}`, 61);
      return;
    } catch {
      console.warn("[RateLimiter] Redis 失败，降级到内存模式");
    }
  }

  // 内存模式
  memoryConsumerLimiter.recordTokens(key, tokens);
}

/**
 * 结算 TPM 预占差额。checkTPM 已经预占 estimatedTokens；实际 usage 返回后，
 * 只补扣或返还差额，避免生产 Redis 模式下重复计数。
 */
export async function reconcileTokensAsync(
  key: string,
  reservedTokens: number,
  actualTokens: number,
  windowMs: number = 60000
): Promise<void> {
  const delta = Math.ceil(Math.max(0, actualTokens) - Math.max(0, reservedTokens));
  if (delta === 0) return;

  if (USE_REDIS) {
    try {
      await adjustTPMUsageRedis(`tpm:${key}`, delta, windowMs);
      return;
    } catch {
      console.warn("[RateLimiter] Redis 失败，降级到内存模式");
    }
  }

  memoryConsumerLimiter.adjustTokens(key, delta);
}

// ============================================================
// Provider-level rate limits
// ============================================================

/**
 * Check provider-level rate limits
 * Returns { allowed, reason? }
 */
export async function checkProviderLimitsAsync(
  providerId: string,
  modelId: string,
  limits: { rpm: number; tpm: number },
  estimatedTokens: number = 500
): Promise<{ allowed: boolean; reason?: string }> {
  const key = `${providerId}:${modelId}`;

  const rpmCheck = await checkRPM(`provider:${key}`, limits.rpm);
  if (!rpmCheck.allowed) {
    return {
      allowed: false,
      reason: `Provider RPM limit exceeded (${limits.rpm}/min). Retry after ${Math.ceil(rpmCheck.resetMs / 1000)}s.`,
    };
  }

  const tpmCheck = await checkTPM(`provider:${key}`, limits.tpm, estimatedTokens);
  if (!tpmCheck.allowed) {
    return {
      allowed: false,
      reason: `Provider TPM limit exceeded (${limits.tpm}/min). Remaining: ${tpmCheck.remaining} tokens.`,
    };
  }

  return { allowed: true };
}

/**
 * Check consumer-level rate limits (per API key)
 */
export async function checkConsumerLimitsAsync(
  apiKeyId: string,
  rpmLimit: number
): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
  const check = await checkRPM(`consumer:${apiKeyId}`, rpmLimit);
  if (!check.allowed) {
    return {
      allowed: false,
      remaining: 0,
      reason: `API key RPM limit exceeded (${rpmLimit}/min). Retry after ${Math.ceil(check.resetMs / 1000)}s.`,
    };
  }
  return { allowed: true, remaining: check.remaining };
}

/**
 * Record a successful request for both provider and consumer
 */
export async function recordRequestFullAsync(
  providerId: string,
  modelId: string,
  apiKeyId: string,
  tokens: number = 0
): Promise<void> {
  const providerKey = `provider:${providerId}:${modelId}`;
  const consumerKey = `consumer:${apiKeyId}`;

  await recordRequestAsync(providerKey);
  if (tokens > 0) await recordTokensAsync(providerKey, tokens);

  await recordRequestAsync(consumerKey);
  if (tokens > 0) await recordTokensAsync(consumerKey, tokens);
}

/**
 * Get provider usage stats
 */
export async function getProviderUsageStatsAsync(providerId: string, modelId: string): Promise<{ rpm: number; tpm: number }> {
  if (USE_REDIS) {
    try {
      const client = getRedis();
      const rpmCount = await client.zcard(`rpm:provider:${providerId}:${modelId}`);
      const tpmCount = parseInt(await client.get(`tpm:provider:${providerId}:${modelId}`) || "0");
      return { rpm: rpmCount, tpm: tpmCount };
    } catch {
      // 降级到内存
    }
  }

  return memoryProviderLimiter.getStats(`${providerId}:${modelId}`);
}

// ============================================================
// 同步接口兼容（保留原有接口）
// ============================================================

export const providerLimiter = memoryProviderLimiter;
export const consumerLimiter = memoryConsumerLimiter;

export function checkProviderLimits(
  providerId: string,
  modelId: string,
  limits: { rpm: number; tpm: number },
  estimatedTokens: number = 500
): { allowed: boolean; reason?: string } {
  const key = `${providerId}:${modelId}`;

  const rpmCheck = providerLimiter.checkRPM(key, limits.rpm);
  if (!rpmCheck.allowed) {
    return {
      allowed: false,
      reason: `Provider RPM limit exceeded (${limits.rpm}/min). Retry after ${Math.ceil(rpmCheck.resetMs / 1000)}s.`,
    };
  }

  const tpmCheck = providerLimiter.checkTPM(key, limits.tpm, estimatedTokens);
  if (!tpmCheck.allowed) {
    return {
      allowed: false,
      reason: `Provider TPM limit exceeded (${limits.tpm}/min). Remaining: ${tpmCheck.remaining} tokens.`,
    };
  }

  return { allowed: true };
}

export function checkConsumerLimits(
  apiKeyId: string,
  rpmLimit: number
): { allowed: boolean; remaining: number; reason?: string } {
  const check = consumerLimiter.checkRPM(apiKeyId, rpmLimit);
  if (!check.allowed) {
    return {
      allowed: false,
      remaining: 0,
      reason: `API key RPM limit exceeded (${rpmLimit}/min). Retry after ${Math.ceil(check.resetMs / 1000)}s.`,
    };
  }
  return { allowed: true, remaining: check.remaining };
}

export function recordRequest(
  providerId: string,
  modelId: string,
  apiKeyId: string,
  tokens: number = 0
): void {
  const providerKey = `${providerId}:${modelId}`;
  providerLimiter.recordRequest(providerKey);
  if (tokens > 0) providerLimiter.recordTokens(providerKey, tokens);

  consumerLimiter.recordRequest(apiKeyId);
  if (tokens > 0) consumerLimiter.recordTokens(apiKeyId, tokens);
}

export function recordProviderTokens(providerId: string, modelId: string, tokens: number): void {
  if (tokens <= 0) return;
  providerLimiter.recordTokens(`${providerId}:${modelId}`, tokens);
}

export function getProviderUsageStats(providerId: string, modelId: string) {
  return providerLimiter.getStats(`${providerId}:${modelId}`);
}

// ============================================================
// 导出
// ============================================================

export default {
  // 异步接口（推荐）
  checkRPM,
  checkTPM,
  checkProviderLimitsAsync,
  checkConsumerLimitsAsync,
  reconcileTokensAsync,
  recordRequestFullAsync,
  getProviderUsageStatsAsync,
  // 同步接口（兼容）
  providerLimiter,
  consumerLimiter,
  checkProviderLimits,
  checkConsumerLimits,
  recordRequest,
  recordProviderTokens,
  getProviderUsageStats,
};
