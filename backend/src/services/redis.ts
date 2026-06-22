/**
 * Redis Service
 *
 * Used for:
 * - Rate limit storage (replacing in-memory)
 * - Session caching
 * - Semantic caching (similar request cache responses)
 * - Task status caching
 */

import Redis from "ioredis";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  lazyConnect: false,
};

// Create Redis client
let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(redisConfig);

    redis.on("connect", () => {
      console.log("[Redis] Connected successfully");
    });

    redis.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });

    redis.on("close", () => {
      console.log("[Redis] Connection closed");
    });
  }
  return redis;
}

// Close connection
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// ============================================================
// Rate Limiting
// ============================================================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Redis sliding window rate limiting
 * Uses ZSET to store timestamps, precisely controlling request rate
 */
export async function checkRateLimitRedis(
  key: string,
  limit: number,
  windowMs: number = 60000
): Promise<RateLimitResult> {
  const client = getRedis();
  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}-${Math.random().toString(36).slice(2)}`;
  const windowSeconds = Math.ceil(windowMs / 1000) + 1;
  const result = await client.eval(
    `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local now = tonumber(ARGV[2])
      local windowStart = tonumber(ARGV[3])
      local windowMs = tonumber(ARGV[4])
      local member = ARGV[5]
      local windowSeconds = tonumber(ARGV[6])

      redis.call("ZREMRANGEBYSCORE", key, 0, windowStart)
      local count = redis.call("ZCARD", key)
      if count >= limit then
        local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
        local resetMs = windowMs
        if #oldest >= 2 then
          resetMs = math.max(0, tonumber(oldest[2]) + windowMs - now)
        end
        return {0, 0, resetMs}
      end

      redis.call("ZADD", key, now, member)
      redis.call("EXPIRE", key, windowSeconds)
      return {1, math.max(0, limit - count - 1), windowMs}
    `,
    1,
    key,
    limit,
    now,
    windowStart,
    windowMs,
    member,
    windowSeconds
  ) as [number, number, number];

  return {
    allowed: result[0] === 1,
    remaining: result[1],
    resetMs: result[2],
  };
}

/**
 * Check and pre-reserve TPM (Token Per Minute) limit.
 * Uses Lua to guarantee atomic “read current value + evaluate + increment reservation” under multi-instance concurrency.
 */
export async function checkTPMLimitRedis(
  key: string,
  limit: number,
  estimatedTokens: number,
  windowMs: number = 60000
): Promise<{ allowed: boolean; remaining: number }> {
  const client = getRedis();
  const windowSeconds = Math.ceil(windowMs / 1000) + 1;
  const tokens = Math.max(0, Math.ceil(estimatedTokens));
  const result = await client.eval(
    `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local tokens = tonumber(ARGV[2])
      local windowSeconds = tonumber(ARGV[3])
      local current = tonumber(redis.call("GET", key) or "0")

      if current + tokens > limit then
        return {0, math.max(0, limit - current)}
      end

      local nextValue = redis.call("INCRBY", key, tokens)
      local ttl = redis.call("TTL", key)
      if ttl < 0 then
        redis.call("EXPIRE", key, windowSeconds)
      end

      return {1, math.max(0, limit - nextValue)}
    `,
    1,
    key,
    limit,
    tokens,
    windowSeconds
  ) as [number, number];

  return {
    allowed: result[0] === 1,
    remaining: result[1],
  };
}

/**
 * Adjust pre-reserved TPM tokens. After actual consumption is returned, use actual - reserved for delta reconciliation.
 */
export async function adjustTPMUsageRedis(
  key: string,
  deltaTokens: number,
  windowMs: number = 60000
): Promise<void> {
  const delta = Math.ceil(deltaTokens);
  if (delta === 0) return;

  const client = getRedis();
  const windowSeconds = Math.ceil(windowMs / 1000) + 1;
  await client.eval(
    `
      local key = KEYS[1]
      local delta = tonumber(ARGV[1])
      local windowSeconds = tonumber(ARGV[2])
      local current = tonumber(redis.call("GET", key) or "0")
      local ttl = redis.call("TTL", key)
      local nextValue = current + delta
      if nextValue < 0 then
        nextValue = 0
      end

      redis.call("SET", key, nextValue)
      if ttl > 0 then
        redis.call("EXPIRE", key, ttl)
      else
        redis.call("EXPIRE", key, windowSeconds)
      end
    `,
    1,
    key,
    delta,
    windowSeconds
  );
}

// ============================================================
// Session Cache
// ============================================================

/**
 * Cache user session information
 */
export async function cacheSession(
  token: string,
  userId: string,
  ttl: number = 86400 // 24 hours
): Promise<void> {
  const client = getRedis();
  await client.set(`session:${token}`, userId, "EX", ttl);
}

/**
 * Get cached session
 */
export async function getCachedSession(token: string): Promise<string | null> {
  const client = getRedis();
  return await client.get(`session:${token}`);
}

/**
 * Delete session cache
 */
export async function deleteSession(token: string): Promise<void> {
  const client = getRedis();
  await client.del(`session:${token}`);
}

// ============================================================
// Task Status Cache
// ============================================================

/**
 * Cache async task status (reduce database queries)
 */
export async function cacheTaskStatus(
  taskId: string,
  status: any,
  ttl: number = 300 // 5 minutes
): Promise<void> {
  const client = getRedis();
  await client.set(`task:${taskId}`, JSON.stringify(status), "EX", ttl);
}

/**
 * Get cached task status
 */
export async function getCachedTaskStatus(taskId: string): Promise<any | null> {
  const client = getRedis();
  const cached = await client.get(`task:${taskId}`);
  return cached ? JSON.parse(cached) : null;
}

// ============================================================
// Health Status Cache
// ============================================================

/**
 * Cache provider health status
 */
export async function cacheProviderHealth(
  providerId: string,
  modelId: string,
  status: "healthy" | "degraded" | "down",
  ttl: number = 60
): Promise<void> {
  const client = getRedis();
  await client.set(`health:${providerId}:${modelId}`, status, "EX", ttl);
}

/**
 * Get cached provider health status
 */
export async function getCachedProviderHealth(
  providerId: string,
  modelId: string
): Promise<"healthy" | "degraded" | "down" | null> {
  const client = getRedis();
  const cached = await client.get(`health:${providerId}:${modelId}`);
  return cached as "healthy" | "degraded" | "down" | null;
}

export default {
  getRedis,
  closeRedis,
  checkRateLimitRedis,
  checkTPMLimitRedis,
  cacheSession,
  getCachedSession,
  deleteSession,
  cacheTaskStatus,
  getCachedTaskStatus,
  cacheProviderHealth,
  getCachedProviderHealth,
};
