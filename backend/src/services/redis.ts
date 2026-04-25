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

  // 移除过期条目
  await client.zremrangebyscore(key, 0, windowStart);

  // 获取当前窗口内的请求计数
  const count = await client.zcard(key);

  if (count >= limit) {
    // 获取最早的请求时间，计算重置时间
    const oldest = await client.zrange(key, 0, 0, "WITHSCORES");
    const resetMs = oldest.length > 0
      ? parseInt(oldest[1]) + windowMs - now
      : windowMs;

    return {
      allowed: false,
      remaining: 0,
      resetMs,
    };
  }

  // 添加当前请求
  await client.zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`);

  // 设置键过期时间
  await client.expire(key, Math.ceil(windowMs / 1000) + 1);

  return {
    allowed: true,
    remaining: limit - count - 1,
    resetMs: windowMs,
  };
}

/**
 * 检查 TPM (Token Per Minute) 限制
 */
export async function checkTPMLimitRedis(
  key: string,
  limit: number,
  estimatedTokens: number,
  windowMs: number = 60000
): Promise<{ allowed: boolean; remaining: number }> {
  const client = getRedis();
  const now = Date.now();
  const windowStart = now - windowMs;

  // 获取当前 token 总数
  const totalTokens = await client.get(key) || "0";
  const currentTokens = parseInt(totalTokens);

  // 检查过期并重置
  const ttl = await client.ttl(key);
  if (ttl <= 0) {
    await client.set(key, "0", "EX", Math.ceil(windowMs / 1000));
  }

  if (currentTokens + estimatedTokens > limit) {
    return {
      allowed: false,
      remaining: Math.max(0, limit - currentTokens),
    };
  }

  // 增加 token 计数
  await client.incrby(key, estimatedTokens);

  return {
    allowed: true,
    remaining: limit - currentTokens - estimatedTokens,
  };
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