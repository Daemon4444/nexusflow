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
import { randomUUID } from "crypto";
import { isProductionRuntime } from "../utils/runtime-safety";

// ============================================================
// 配置
// ============================================================

const USE_REDIS = !!(process.env.REDIS_HOST && process.env.REDIS_HOST !== "");

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
    this.cleanupInterval.unref?.();
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
      return await checkRateLimitRedis(`rpm:${key}`, limit, windowMs);
    } catch {
      // Redis 失败，降级到内存模式
      console.warn("[RateLimiter] Redis 失败，降级到内存模式");
    }
  }

  // 内存模式与 Redis 保持同样语义：检查通过即占用一个请求槽。
  const check = memoryConsumerLimiter.checkRPM(key, limit);
  if (!check.allowed) return check;
  memoryConsumerLimiter.recordRequest(key);
  return {
    ...check,
    remaining: Math.max(0, check.remaining - 1),
  };
}

/**
 * Admission control used before potentially expensive request-body parsing.
 *
 * Unlike the legacy request limiter, production must never fall back to a
 * process-local counter when Redis is unavailable: doing so would give every
 * worker an independent limit precisely while the shared safety dependency is
 * down.
 */
export async function checkRPMFailClosed(
  key: string,
  limit: number,
  windowMs: number = 60_000
): Promise<
  | { available: true; allowed: boolean; remaining: number; resetMs: number }
  | { available: false; allowed: false; remaining: 0; resetMs: number }
> {
  if (USE_REDIS) {
    try {
      return {
        available: true,
        ...(await checkRateLimitRedis(`rpm:${key}`, limit, windowMs)),
      };
    } catch {
      return { available: false, allowed: false, remaining: 0, resetMs: windowMs };
    }
  }
  if (isProductionRuntime()) {
    return { available: false, allowed: false, remaining: 0, resetMs: windowMs };
  }

  const check = memoryConsumerLimiter.checkRPM(key, limit);
  if (!check.allowed) return { available: true, ...check };
  memoryConsumerLimiter.recordRequest(key);
  return {
    available: true,
    ...check,
    remaining: Math.max(0, check.remaining - 1),
  };
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
      return await checkTPMLimitRedis(`tpm:${key}`, limit, estimatedTokens, windowMs);
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
export type ProviderUsageStats =
  | {
      available: true;
      rpm: number;
      tpm: number;
      source: "redis_provider_capacity_v2";
    }
  | {
      available: false;
      rpm: null;
      tpm: null;
      source: "unavailable";
      error: string;
    };

/**
 * Returns the same rolling-window truth used by managed capacity admission.
 *
 * Never substitutes process-local counters when Redis is unavailable. An
 * admin screen must show unknown rather than a plausible but false zero, and
 * the scheduler must not route based on a per-node fragment of global usage.
 */
export async function getProviderUsageStatsAsync(
  providerId: string,
  modelId: string
): Promise<ProviderUsageStats> {
  if (!USE_REDIS) {
    return {
      available: false,
      rpm: null,
      tpm: null,
      source: "unavailable",
      error: "redis_not_configured",
    };
  }

  const providerKey = `provider:${providerId}:${modelId}`;
  const rpmKey = `rpm:${providerKey}`;
  const { eventsKey, weightsKey, totalKey } = providerCapacityTpmKeys(providerKey);
  const now = Date.now();
  try {
    const result = await getRedis().eval(
      `
        local rpmKey = KEYS[1]
        local eventsKey = KEYS[2]
        local weightsKey = KEYS[3]
        local totalKey = KEYS[4]
        local now = tonumber(ARGV[1])
        local windowStart = tonumber(ARGV[2])

        local rpmType = redis.call("TYPE", rpmKey)["ok"]
        local eventsType = redis.call("TYPE", eventsKey)["ok"]
        local weightsType = redis.call("TYPE", weightsKey)["ok"]
        local totalType = redis.call("TYPE", totalKey)["ok"]
        if (rpmType ~= "none" and rpmType ~= "zset")
          or (eventsType ~= "none" and eventsType ~= "zset")
          or (weightsType ~= "none" and weightsType ~= "hash")
          or (totalType ~= "none" and totalType ~= "string") then
          return {0, 0, 0}
        end

        local totalRaw = redis.call("GET", totalKey)
        local totalTtl = redis.call("PTTL", totalKey)
        local total = tonumber(totalRaw or "0")
        local eventCount = tonumber(redis.call("ZCARD", eventsKey) or "0")
        local weightCount = tonumber(redis.call("HLEN", weightsKey) or "0")
        if total == nil or eventCount ~= weightCount
          or (eventCount > 0 and not totalRaw) then
          return {0, 0, 0}
        end

        local expired = redis.call("ZRANGEBYSCORE", eventsKey, 0, windowStart)
        local expiredTotal = 0
        for _, member in ipairs(expired) do
          local weight = tonumber(redis.call("HGET", weightsKey, member))
          if weight == nil then return {0, 0, 0} end
          expiredTotal = expiredTotal + weight
        end
        local nextTotal = total - expiredTotal
        if nextTotal < 0 then return {0, 0, 0} end

        redis.call("ZREMRANGEBYSCORE", rpmKey, 0, windowStart)
        if #expired > 0 then
          redis.call("ZREMRANGEBYSCORE", eventsKey, 0, windowStart)
          for _, member in ipairs(expired) do
            redis.call("HDEL", weightsKey, member)
          end
        end
        if nextTotal == 0 then
          redis.call("DEL", eventsKey, weightsKey, totalKey)
        else
          redis.call("SET", totalKey, nextTotal)
          if totalTtl > 0 then
            redis.call("PEXPIRE", totalKey, totalTtl)
          else
            redis.call("EXPIRE", totalKey, ARGV[3])
          end
        end
        return {1, redis.call("ZCARD", rpmKey), nextTotal}
      `,
      4,
      rpmKey,
      eventsKey,
      weightsKey,
      totalKey,
      now,
      now - PROVIDER_CAPACITY_WINDOW_MS,
      Math.ceil(PROVIDER_CAPACITY_WINDOW_MS / 1000) + 1
    ) as [number, number, number];

    if (Number(result[0]) !== 1) {
      return {
        available: false,
        rpm: null,
        tpm: null,
        source: "unavailable",
        error: "redis_state_invalid",
      };
    }
    return {
      available: true,
      rpm: Number(result[1]),
      tpm: Number(result[2]),
      source: "redis_provider_capacity_v2",
    };
  } catch (error) {
    return {
      available: false,
      rpm: null,
      tpm: null,
      source: "unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function providerDayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function recordProviderRequestAsync(providerId: string, modelId: string): Promise<void> {
  const providerKey = `provider:${providerId}:${modelId}`;
  if (USE_REDIS) {
    const client = getRedis();
    const now = Date.now();
    const rpmKey = `rpm:${providerKey}`;
    const dailyKey = `daily:${providerKey}:${providerDayKey()}`;
    await client
      .multi()
      .zadd(rpmKey, now, `${now}-${Math.random().toString(36).slice(2)}`)
      .expire(rpmKey, 61)
      .incr(dailyKey)
      .expire(dailyKey, 3 * 24 * 60 * 60)
      .exec();
    return;
  }

  memoryProviderLimiter.recordRequest(`${providerId}:${modelId}`);
}

export async function getProviderDailyUsageAsync(providerId: string, modelId: string): Promise<number> {
  if (!USE_REDIS) return 0;
  try {
    return Number(
      (await getRedis().get(`daily:provider:${providerId}:${modelId}:${providerDayKey()}`)) || 0
    );
  } catch {
    return 0;
  }
}

export async function getProviderConcurrencyAsync(
  providerId: string,
  modelId: string
): Promise<number | null> {
  if (!USE_REDIS) return null;
  try {
    const providerKey = `provider:${providerId}:${modelId}`;
    const key = providerCapacityConcurrencyKey(providerKey);
    const result = await getRedis().eval(
      `
        local keyType = redis.call("TYPE", KEYS[1])["ok"]
        if keyType ~= "none" and keyType ~= "zset" then
          return redis.error_reply("invalid provider concurrency key type")
        end
        redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, ARGV[1])
        return redis.call("ZCARD", KEYS[1])
      `,
      1,
      key,
      Date.now()
    );
    return Math.max(0, Number(result || 0));
  } catch {
    return null;
  }
}

export type ProviderCapacityLimits = {
  rpm: number;
  tpm: number;
  dailyLimit: number;
  concurrentLimit: number;
};

export type ProviderCapacityReservation =
  | {
      allowed: true;
      leaseId: string;
      reservedTokens: number;
    }
  | {
      allowed: false;
      reason: "rpm" | "tpm" | "daily" | "concurrency" | "redis_unavailable" | "redis_state_invalid";
    };

const PROVIDER_CAPACITY_WINDOW_MS = 60_000;
const PROVIDER_CAPACITY_LEASE_SECONDS = 60 * 60;
const PROVIDER_DAILY_TTL_SECONDS = 3 * 24 * 60 * 60;
const PROVIDER_CAPACITY_KEY_PREFIX = "provider-capacity:v2";

function providerCapacityTpmKeys(providerKey: string): {
  eventsKey: string;
  weightsKey: string;
  totalKey: string;
} {
  return {
    eventsKey: `${PROVIDER_CAPACITY_KEY_PREFIX}:tpm-events:${providerKey}`,
    weightsKey: `${PROVIDER_CAPACITY_KEY_PREFIX}:tpm-weights:${providerKey}`,
    totalKey: `${PROVIDER_CAPACITY_KEY_PREFIX}:tpm-total:${providerKey}`,
  };
}

function providerCapacityConcurrencyKey(providerKey: string): string {
  return `${PROVIDER_CAPACITY_KEY_PREFIX}:concurrency-leases:${providerKey}`;
}

function providerCapacityLeaseKey(leaseId: string): string {
  return `${PROVIDER_CAPACITY_KEY_PREFIX}:lease:${leaseId}`;
}

/**
 * Atomically checks and reserves all managed-provider hard limits.
 *
 * This intentionally does not fall back to process memory. A managed route's
 * provider limits are contractual cross-node limits; silently degrading to a
 * per-process counter would allow a Redis outage to multiply provider spend.
 */
export async function reserveProviderCapacityAsync(params: {
  providerId: string;
  modelId: string;
  limits: ProviderCapacityLimits;
  estimatedTokens: number;
  /**
   * Stable identity for a retried atomic reservation. Reusing both values
   * makes an ambiguous Redis acknowledgement safe to retry without consuming
   * RPM, daily, TPM, or concurrency twice.
   */
  reservationId?: string;
  reservationStartedAt?: number;
}): Promise<ProviderCapacityReservation> {
  if (!USE_REDIS) return { allowed: false, reason: "redis_unavailable" };

  const providerKey = `provider:${params.providerId}:${params.modelId}`;
  const rpmKey = `rpm:${providerKey}`;
  const {
    eventsKey: tpmEventsKey,
    weightsKey: tpmWeightsKey,
    totalKey: tpmTotalKey,
  } = providerCapacityTpmKeys(providerKey);
  const dailyKey = `daily:${providerKey}:${providerDayKey()}`;
  const concurrencyKey = providerCapacityConcurrencyKey(providerKey);
  const leaseId = params.reservationId || randomUUID();
  const leaseKey = providerCapacityLeaseKey(leaseId);
  const now = params.reservationStartedAt ?? Date.now();
  const reservedTokens = Math.max(0, Math.ceil(params.estimatedTokens || 0));
  const result = await getRedis().eval(
    `
      local rpmKey = KEYS[1]
      local tpmEventsKey = KEYS[2]
      local tpmWeightsKey = KEYS[3]
      local tpmTotalKey = KEYS[4]
      local dailyKey = KEYS[5]
      local concurrencyKey = KEYS[6]
      local leaseKey = KEYS[7]

      local rpmLimit = tonumber(ARGV[1])
      local tpmLimit = tonumber(ARGV[2])
      local dailyLimit = tonumber(ARGV[3])
      local concurrencyLimit = tonumber(ARGV[4])
      local reservedTokens = tonumber(ARGV[5])
      local now = tonumber(ARGV[6])
      local windowStart = tonumber(ARGV[7])
      local rpmTtl = tonumber(ARGV[8])
      local leaseTtl = tonumber(ARGV[9])
      local dailyTtl = tonumber(ARGV[10])
      local rpmMember = ARGV[11]
      local leaseId = ARGV[12]
      local leaseExpiresAt = tonumber(ARGV[13])

      local rpmType = redis.call("TYPE", rpmKey)["ok"]
      local tpmEventsType = redis.call("TYPE", tpmEventsKey)["ok"]
      local tpmWeightsType = redis.call("TYPE", tpmWeightsKey)["ok"]
      local tpmTotalType = redis.call("TYPE", tpmTotalKey)["ok"]
      local dailyType = redis.call("TYPE", dailyKey)["ok"]
      local concurrencyType = redis.call("TYPE", concurrencyKey)["ok"]
      local leaseType = redis.call("TYPE", leaseKey)["ok"]
      if (rpmType ~= "none" and rpmType ~= "zset")
        or (tpmEventsType ~= "none" and tpmEventsType ~= "zset")
        or (tpmWeightsType ~= "none" and tpmWeightsType ~= "hash")
        or (tpmTotalType ~= "none" and tpmTotalType ~= "string")
        or (dailyType ~= "none" and dailyType ~= "string")
        or (concurrencyType ~= "none" and concurrencyType ~= "zset")
        or (leaseType ~= "none" and leaseType ~= "string") then
        return {0, 6}
      end

      -- A prior attempt may have committed successfully while its Redis
      -- acknowledgement was lost. The same stable lease identity is an
      -- idempotent success only when every reserved structure still matches.
      local leaseValue = tostring(reservedTokens) .. ":" .. tostring(now)
      if leaseType == "string" then
        local existingLeaseValue = redis.call("GET", leaseKey)
        local concurrencyScore = redis.call("ZSCORE", concurrencyKey, leaseId)
        local eventScore = redis.call("ZSCORE", tpmEventsKey, leaseId)
        local eventWeight = redis.call("HGET", tpmWeightsKey, leaseId)
        if existingLeaseValue ~= leaseValue or not concurrencyScore then
          return {0, 6}
        end
        if reservedTokens > 0 then
          if not eventScore or tonumber(eventWeight) ~= reservedTokens then
            return {0, 6}
          end
        elseif eventScore or eventWeight then
          return {0, 6}
        end
        return {1, 7}
      end

      local rpm = tonumber(redis.call("ZCARD", rpmKey) or "0")
      local tpmTotalRaw = redis.call("GET", tpmTotalKey)
      local tpmTotalTtl = redis.call("PTTL", tpmTotalKey)
      local tpm = tonumber(tpmTotalRaw or "0")
      local daily = tonumber(redis.call("GET", dailyKey) or "0")
      local tpmEventCount = tonumber(redis.call("ZCARD", tpmEventsKey) or "0")
      local tpmWeightCount = tonumber(redis.call("HLEN", tpmWeightsKey) or "0")
      if rpm == nil or tpm == nil or daily == nil
        or tpmEventCount ~= tpmWeightCount
        or (tpmEventCount > 0 and not tpmTotalRaw) then
        return {0, 6}
      end

      local expiredTpmMembers = redis.call("ZRANGEBYSCORE", tpmEventsKey, 0, windowStart)
      local expiredTpm = 0
      for _, expiredMember in ipairs(expiredTpmMembers) do
        local weight = tonumber(redis.call("HGET", tpmWeightsKey, expiredMember))
        if weight == nil then return {0, 6} end
        expiredTpm = expiredTpm + weight
      end
      local activeTpm = tpm - expiredTpm
      if activeTpm < 0 then return {0, 6} end

      redis.call("ZREMRANGEBYSCORE", rpmKey, 0, windowStart)
      rpm = tonumber(redis.call("ZCARD", rpmKey) or "0")
      if #expiredTpmMembers > 0 then
        redis.call("ZREMRANGEBYSCORE", tpmEventsKey, 0, windowStart)
        for _, expiredMember in ipairs(expiredTpmMembers) do
          redis.call("HDEL", tpmWeightsKey, expiredMember)
        end
      end
      if activeTpm == 0 then
        redis.call("DEL", tpmEventsKey, tpmWeightsKey, tpmTotalKey)
      else
        redis.call("SET", tpmTotalKey, activeTpm)
        if tpmTotalTtl > 0 then
          redis.call("PEXPIRE", tpmTotalKey, tpmTotalTtl)
        else
          redis.call("EXPIRE", tpmTotalKey, rpmTtl)
        end
      end
      redis.call("ZREMRANGEBYSCORE", concurrencyKey, 0, now)
      local concurrency = tonumber(redis.call("ZCARD", concurrencyKey) or "0")

      if rpmLimit > 0 and rpm >= rpmLimit then return {0, 1} end
      if tpmLimit > 0 and activeTpm + reservedTokens > tpmLimit then return {0, 2} end
      if dailyLimit > 0 and daily >= dailyLimit then return {0, 3} end
      if concurrencyLimit > 0 and concurrency >= concurrencyLimit then return {0, 4} end

      local leaseCreated = redis.call("SET", leaseKey, leaseValue, "EX", leaseTtl, "NX")
      if not leaseCreated then return {0, 6} end

      redis.call("ZADD", rpmKey, now, rpmMember)
      redis.call("EXPIRE", rpmKey, rpmTtl)
      if reservedTokens > 0 then
        redis.call("ZADD", tpmEventsKey, now, leaseId)
        redis.call("HSET", tpmWeightsKey, leaseId, reservedTokens)
        redis.call("SET", tpmTotalKey, activeTpm + reservedTokens)
        redis.call("EXPIRE", tpmEventsKey, rpmTtl)
        redis.call("EXPIRE", tpmWeightsKey, rpmTtl)
        redis.call("EXPIRE", tpmTotalKey, rpmTtl)
      end
      redis.call("INCR", dailyKey)
      redis.call("EXPIRE", dailyKey, dailyTtl)
      redis.call("ZADD", concurrencyKey, leaseExpiresAt, leaseId)
      redis.call("EXPIRE", concurrencyKey, leaseTtl + 1)
      return {1, 0}
    `,
    7,
    rpmKey,
    tpmEventsKey,
    tpmWeightsKey,
    tpmTotalKey,
    dailyKey,
    concurrencyKey,
    leaseKey,
    Math.max(0, Math.floor(params.limits.rpm || 0)),
    Math.max(0, Math.floor(params.limits.tpm || 0)),
    Math.max(0, Math.floor(params.limits.dailyLimit || 0)),
    Math.max(0, Math.floor(params.limits.concurrentLimit || 0)),
    reservedTokens,
    now,
    now - PROVIDER_CAPACITY_WINDOW_MS,
    Math.ceil(PROVIDER_CAPACITY_WINDOW_MS / 1000) + 1,
    PROVIDER_CAPACITY_LEASE_SECONDS,
    PROVIDER_DAILY_TTL_SECONDS,
    `${now}-${leaseId}`,
    leaseId,
    now + PROVIDER_CAPACITY_LEASE_SECONDS * 1000
  ) as [number, number];

  if (Number(result[0]) === 1) {
    return { allowed: true, leaseId, reservedTokens };
  }
  const reasonByCode: Record<number, Exclude<ProviderCapacityReservation, { allowed: true }>["reason"]> = {
    1: "rpm",
    2: "tpm",
    3: "daily",
    4: "concurrency",
    6: "redis_state_invalid",
  };
  return { allowed: false, reason: reasonByCode[Number(result[1])] || "redis_state_invalid" };
}

/**
 * Idempotently releases a managed-provider concurrency lease and reconciles
 * the TPM estimate to actual usage in one Lua script. RPM and daily request
 * counts remain consumed because an upstream attempt was made.
 */
export async function releaseProviderCapacityAsync(params: {
  providerId: string;
  modelId: string;
  leaseId: string;
  actualTokens: number;
}): Promise<void> {
  if (!USE_REDIS) {
    throw new Error("Redis is required to release a managed provider capacity lease");
  }
  const providerKey = `provider:${params.providerId}:${params.modelId}`;
  const {
    eventsKey: tpmEventsKey,
    weightsKey: tpmWeightsKey,
    totalKey: tpmTotalKey,
  } = providerCapacityTpmKeys(providerKey);
  const concurrencyKey = providerCapacityConcurrencyKey(providerKey);
  const leaseKey = providerCapacityLeaseKey(params.leaseId);
  const now = Date.now();
  await getRedis().eval(
    `
      local tpmEventsKey = KEYS[1]
      local tpmWeightsKey = KEYS[2]
      local tpmTotalKey = KEYS[3]
      local concurrencyKey = KEYS[4]
      local leaseKey = KEYS[5]
      local actualTokens = tonumber(ARGV[1])
      local now = tonumber(ARGV[2])
      local windowStart = tonumber(ARGV[3])
      local tpmTtl = tonumber(ARGV[4])
      local concurrencyTtl = tonumber(ARGV[5])
      local leaseId = ARGV[6]

      local leaseType = redis.call("TYPE", leaseKey)["ok"]
      local tpmEventsType = redis.call("TYPE", tpmEventsKey)["ok"]
      local tpmWeightsType = redis.call("TYPE", tpmWeightsKey)["ok"]
      local tpmTotalType = redis.call("TYPE", tpmTotalKey)["ok"]
      local concurrencyType = redis.call("TYPE", concurrencyKey)["ok"]
      if (leaseType ~= "none" and leaseType ~= "string")
        or (tpmEventsType ~= "none" and tpmEventsType ~= "zset")
        or (tpmWeightsType ~= "none" and tpmWeightsType ~= "hash")
        or (tpmTotalType ~= "none" and tpmTotalType ~= "string")
        or (concurrencyType ~= "none" and concurrencyType ~= "zset") then
        return redis.error_reply("invalid provider capacity key type")
      end

      local reservedRaw = redis.call("GET", leaseKey)
      local reservedTokens = nil
      local leaseStartedAt = nil
      if reservedRaw then
        local reservedPart, startedPart = string.match(reservedRaw, "^([^:]+):([^:]+)$")
        reservedTokens = tonumber(reservedPart)
        leaseStartedAt = tonumber(startedPart)
      end
      if reservedRaw and (reservedTokens == nil or leaseStartedAt == nil) then
        return redis.error_reply("invalid provider capacity lease")
      end

      local totalRaw = redis.call("GET", tpmTotalKey)
      local totalTtl = redis.call("PTTL", tpmTotalKey)
      local currentTpm = tonumber(totalRaw or "0")
      local eventCount = tonumber(redis.call("ZCARD", tpmEventsKey) or "0")
      local weightCount = tonumber(redis.call("HLEN", tpmWeightsKey) or "0")
      if currentTpm == nil or eventCount ~= weightCount
        or (eventCount > 0 and not totalRaw) then
        return redis.error_reply("invalid provider capacity counter")
      end

      local expiredMembers = redis.call("ZRANGEBYSCORE", tpmEventsKey, 0, windowStart)
      local expiredTotal = 0
      for _, expiredMember in ipairs(expiredMembers) do
        local weight = tonumber(redis.call("HGET", tpmWeightsKey, expiredMember))
        if weight == nil then
          return redis.error_reply("invalid provider capacity TPM event")
        end
        expiredTotal = expiredTotal + weight
      end
      local nextTpm = currentTpm - expiredTotal
      if nextTpm < 0 then
        return redis.error_reply("invalid provider capacity TPM total")
      end

      local activeWeight = nil
      if reservedRaw and leaseStartedAt > windowStart and reservedTokens > 0 then
        activeWeight = tonumber(redis.call("HGET", tpmWeightsKey, leaseId))
        if activeWeight == nil or activeWeight ~= reservedTokens then
          return redis.error_reply("invalid provider capacity TPM lease event")
        end
      elseif reservedRaw and leaseStartedAt > windowStart and reservedTokens == 0
        and redis.call("ZSCORE", tpmEventsKey, leaseId) then
        return redis.error_reply("invalid zero-token provider capacity event")
      end

      if #expiredMembers > 0 then
        redis.call("ZREMRANGEBYSCORE", tpmEventsKey, 0, windowStart)
        for _, expiredMember in ipairs(expiredMembers) do
          redis.call("HDEL", tpmWeightsKey, expiredMember)
        end
      end
      redis.call("ZREMRANGEBYSCORE", concurrencyKey, 0, now)
      redis.call("ZREM", concurrencyKey, leaseId)

      if not reservedRaw then
        if nextTpm == 0 then
          redis.call("DEL", tpmEventsKey, tpmWeightsKey, tpmTotalKey)
        else
          redis.call("SET", tpmTotalKey, nextTpm)
          if totalTtl > 0 then
            redis.call("PEXPIRE", tpmTotalKey, totalTtl)
          else
            redis.call("EXPIRE", tpmTotalKey, tpmTtl)
          end
        end
        return 0
      end

      redis.call("DEL", leaseKey)
      if leaseStartedAt > windowStart then
        if reservedTokens > 0 then
          nextTpm = nextTpm + actualTokens - reservedTokens
          if actualTokens == 0 then
            redis.call("ZREM", tpmEventsKey, leaseId)
            redis.call("HDEL", tpmWeightsKey, leaseId)
          else
            redis.call("HSET", tpmWeightsKey, leaseId, actualTokens)
          end
        elseif actualTokens > 0 then
          nextTpm = nextTpm + actualTokens
          redis.call("ZADD", tpmEventsKey, leaseStartedAt, leaseId)
          redis.call("HSET", tpmWeightsKey, leaseId, actualTokens)
        end
      end

      if nextTpm < 0 then nextTpm = 0 end
      if nextTpm == 0 then
        redis.call("DEL", tpmEventsKey, tpmWeightsKey, tpmTotalKey)
      else
        redis.call("SET", tpmTotalKey, nextTpm)
        redis.call("EXPIRE", tpmEventsKey, tpmTtl)
        redis.call("EXPIRE", tpmWeightsKey, tpmTtl)
        redis.call("EXPIRE", tpmTotalKey, tpmTtl)
      end
      if redis.call("ZCARD", concurrencyKey) > 0 then
        redis.call("EXPIRE", concurrencyKey, concurrencyTtl + 1)
      else
        redis.call("DEL", concurrencyKey)
      end
      return 1
    `,
    5,
    tpmEventsKey,
    tpmWeightsKey,
    tpmTotalKey,
    concurrencyKey,
    leaseKey,
    Math.max(0, Math.ceil(params.actualTokens || 0)),
    now,
    now - PROVIDER_CAPACITY_WINDOW_MS,
    Math.ceil(PROVIDER_CAPACITY_WINDOW_MS / 1000) + 1,
    PROVIDER_CAPACITY_LEASE_SECONDS,
    params.leaseId
  );
}

export async function incrementProviderConcurrencyAsync(providerId: string, modelId: string): Promise<void> {
  if (!USE_REDIS) return;
  const key = `concurrency:provider:${providerId}:${modelId}`;
  await getRedis().multi().incr(key).expire(key, 60 * 60).exec();
}

export async function decrementProviderConcurrencyAsync(providerId: string, modelId: string): Promise<void> {
  if (!USE_REDIS) return;
  const key = `concurrency:provider:${providerId}:${modelId}`;
  await getRedis().eval(
    `
      local current = tonumber(redis.call("GET", KEYS[1]) or "0")
      if current <= 1 then
        redis.call("DEL", KEYS[1])
        return 0
      end
      local nextValue = redis.call("DECR", KEYS[1])
      redis.call("EXPIRE", KEYS[1], 3600)
      return nextValue
    `,
    1,
    key
  );
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
  _apiKeyId: string,
  tokens: number = 0
): void {
  const providerKey = `${providerId}:${modelId}`;
  if (USE_REDIS) {
    void recordProviderRequestAsync(providerId, modelId).catch((error) => {
      console.warn("[RateLimiter] Provider RPM 记录失败:", error instanceof Error ? error.message : String(error));
    });
    if (tokens > 0) {
      void recordTokensAsync(`provider:${providerId}:${modelId}`, tokens).catch((error) => {
        console.warn("[RateLimiter] Provider TPM 记录失败:", error instanceof Error ? error.message : String(error));
      });
    }
    return;
  }

  providerLimiter.recordRequest(providerKey);
  if (tokens > 0) providerLimiter.recordTokens(providerKey, tokens);
}

export function recordProviderTokens(providerId: string, modelId: string, tokens: number): void {
  if (tokens <= 0) return;
  if (USE_REDIS) {
    void recordTokensAsync(`provider:${providerId}:${modelId}`, tokens).catch((error) => {
      console.warn("[RateLimiter] Provider TPM 记录失败:", error instanceof Error ? error.message : String(error));
    });
    return;
  }
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
  recordProviderRequestAsync,
  getProviderDailyUsageAsync,
  getProviderConcurrencyAsync,
  reserveProviderCapacityAsync,
  releaseProviderCapacityAsync,
  incrementProviderConcurrencyAsync,
  decrementProviderConcurrencyAsync,
  // 同步接口（兼容）
  providerLimiter,
  consumerLimiter,
  checkProviderLimits,
  checkConsumerLimits,
  recordRequest,
  recordProviderTokens,
  getProviderUsageStats,
};
