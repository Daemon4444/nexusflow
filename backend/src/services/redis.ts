/**
 * Redis Service
 *
 * 用于：
 * - 速率限制存储（替代内存）
 * - 会话缓存
 * - 语义缓存（相似请求缓存返回）
 * - 任务状态缓存
 */

import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// Redis 连接配置
const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  lazyConnect: false,
};

// 创建 Redis 客户端
let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(redisConfig);

    redis.on("connect", () => {
      console.log("[Redis] 连接成功");
    });

    redis.on("error", (err) => {
      console.error("[Redis] 连接错误:", err.message);
    });

    redis.on("close", () => {
      console.log("[Redis] 连接关闭");
    });
  }
  return redis;
}

// 关闭连接
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// ============================================================
// 速率限制
// ============================================================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Redis 滑动窗口速率限制
 * 使用 ZSET 存储时间戳，精确控制请求速率
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
 * 检查并预占 TPM (Token Per Minute) 限制。
 * 使用 Lua 保证在多实例并发下“读取当前值 + 判断 + 增量预占”是原子操作。
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
 * 调整已预占的 TPM token。实际消耗返回后，用 actual - reserved 做差额结算。
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
// 语义缓存
// ============================================================

interface CacheEntry {
  response: any;
  model: string;
  timestamp: number;
  tokens: { prompt: number; completion: number };
}

/**
 * 语义缓存 - 使用请求内容的 hash 作为 key
 * 相似请求可返回缓存结果，降低成本和延迟
 */
export async function getSemanticCache(
  prompt: string,
  model: string,
  threshold: number = 0.95
): Promise<CacheEntry | null> {
  if (process.env.SEMANTIC_CACHE_ENABLED !== "true") return null;

  const client = getRedis();
  const cacheKey = `semantic:${model}:${hashContent(prompt)}`;

  try {
    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as CacheEntry;
    }
  } catch {
    // 缓存读取失败，忽略
  }

  return null;
}

/**
 * 存储语义缓存
 */
export async function setSemanticCache(
  prompt: string,
  model: string,
  response: any,
  tokens: { prompt: number; completion: number },
  ttl: number = 3600
): Promise<void> {
  if (process.env.SEMANTIC_CACHE_ENABLED !== "true") return;

  const client = getRedis();
  const cacheKey = `semantic:${model}:${hashContent(prompt)}`;

  const entry: CacheEntry = {
    response,
    model,
    timestamp: Date.now(),
    tokens,
  };

  await client.set(cacheKey, JSON.stringify(entry), "EX", ttl);
}

/**
 * 简单 hash 函数（用于缓存 key）
 * 生产环境可替换为更精确的语义相似度算法
 */
function hashContent(content: string): string {
  // 简化处理：标准化后取 MD5-like hash
  const normalized = content
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 1000); // 取前1000字符

  // 使用简单 hash 算法
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return `${Math.abs(hash).toString(36)}`;
}

// ============================================================
// 会话缓存
// ============================================================

/**
 * 缓存用户会话信息
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
 * 获取缓存的会话
 */
export async function getCachedSession(token: string): Promise<string | null> {
  const client = getRedis();
  return await client.get(`session:${token}`);
}

/**
 * 删除会话缓存
 */
export async function deleteSession(token: string): Promise<void> {
  const client = getRedis();
  await client.del(`session:${token}`);
}

// ============================================================
// 任务状态缓存
// ============================================================

/**
 * 缓存异步任务状态（减少数据库查询）
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
 * 获取缓存的任务状态
 */
export async function getCachedTaskStatus(taskId: string): Promise<any | null> {
  const client = getRedis();
  const cached = await client.get(`task:${taskId}`);
  return cached ? JSON.parse(cached) : null;
}

// ============================================================
// 健康状态缓存
// ============================================================

/**
 * 缓存供应商健康状态
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
 * 获取缓存的供应商健康状态
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
  getSemanticCache,
  setSemanticCache,
  cacheSession,
  getCachedSession,
  deleteSession,
  cacheTaskStatus,
  getCachedTaskStatus,
  cacheProviderHealth,
  getCachedProviderHealth,
};
