import { randomUUID } from "node:crypto";
import { getRedis } from "./redis";
import { isProductionRuntime } from "../utils/runtime-safety";

export type RequestBodyAdmissionReason =
  | "api_key_concurrency"
  | "api_key_bytes"
  | "ip_concurrency"
  | "ip_bytes"
  | "global_concurrency"
  | "global_bytes"
  | "lease_expired"
  | "redis_unavailable";

export type RequestBodyAdmission =
  | { allowed: true; leaseId: string }
  | { allowed: false; reason: RequestBodyAdmissionReason };

type AdmissionLimits = {
  apiKeyConcurrency: number;
  apiKeyBytes: number;
  ipConcurrency: number;
  ipBytes: number;
  globalConcurrency: number;
  globalBytes: number;
  leaseTtlSeconds: number;
};

type MemoryLease = { expiresAt: number; bytes: number };
const memoryBuckets = new Map<string, Map<string, MemoryLease>>();

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRequestBodyAdmissionLimits(
  env: NodeJS.ProcessEnv = process.env
): AdmissionLimits {
  return {
    apiKeyConcurrency: positiveInteger(env.PUBLIC_BODY_API_KEY_CONCURRENCY, 3),
    apiKeyBytes: positiveInteger(env.PUBLIC_BODY_API_KEY_BYTES, 100 * 1024 * 1024),
    ipConcurrency: positiveInteger(env.PUBLIC_BODY_IP_CONCURRENCY, 8),
    ipBytes: positiveInteger(env.PUBLIC_BODY_IP_BYTES, 256 * 1024 * 1024),
    globalConcurrency: positiveInteger(env.PUBLIC_BODY_GLOBAL_CONCURRENCY, 64),
    globalBytes: positiveInteger(env.PUBLIC_BODY_GLOBAL_BYTES, 1024 * 1024 * 1024),
    leaseTtlSeconds: positiveInteger(env.PUBLIC_BODY_LEASE_TTL_SECONDS, 90),
  };
}

function bucketNames(apiKeyId: string, clientIp: string): string[] {
  return [
    `nexusflow:public-body:v1:key:${apiKeyId}`,
    `nexusflow:public-body:v1:ip:${clientIp}`,
    "nexusflow:public-body:v1:global",
  ];
}

function redisBucketKeys(bucket: string): string[] {
  return [`${bucket}:leases`, `${bucket}:sizes`, `${bucket}:bytes`];
}

const RESERVE_SCRIPT = `
  local leaseId = ARGV[1]
  local now = tonumber(ARGV[2])
  local expiresAt = tonumber(ARGV[3])
  local bytes = tonumber(ARGV[4])
  local ttl = tonumber(ARGV[5])

  local function cleanup(zkey, hkey, totalKey)
    local expired = redis.call("ZRANGEBYSCORE", zkey, 0, now)
    local removedBytes = 0
    for _, id in ipairs(expired) do
      removedBytes = removedBytes + tonumber(redis.call("HGET", hkey, id) or "0")
      redis.call("HDEL", hkey, id)
    end
    if #expired > 0 then
      redis.call("ZREMRANGEBYSCORE", zkey, 0, now)
      local current = tonumber(redis.call("GET", totalKey) or "0")
      local nextValue = math.max(0, current - removedBytes)
      if nextValue == 0 then redis.call("DEL", totalKey)
      else redis.call("SET", totalKey, nextValue, "EX", ttl) end
    end
  end

  for i = 0, 2 do
    local offset = i * 3
    cleanup(KEYS[offset + 1], KEYS[offset + 2], KEYS[offset + 3])
    local countLimit = tonumber(ARGV[6 + i * 2])
    local byteLimit = tonumber(ARGV[7 + i * 2])
    if tonumber(redis.call("ZCARD", KEYS[offset + 1]) or "0") >= countLimit then
      return {0, i * 2 + 1}
    end
    local currentBytes = tonumber(redis.call("GET", KEYS[offset + 3]) or "0")
    if currentBytes + bytes > byteLimit then return {0, i * 2 + 2} end
  end

  for i = 0, 2 do
    local offset = i * 3
    redis.call("ZADD", KEYS[offset + 1], expiresAt, leaseId)
    redis.call("HSET", KEYS[offset + 2], leaseId, bytes)
    redis.call("INCRBY", KEYS[offset + 3], bytes)
    redis.call("EXPIRE", KEYS[offset + 1], ttl)
    redis.call("EXPIRE", KEYS[offset + 2], ttl)
    redis.call("EXPIRE", KEYS[offset + 3], ttl)
  end
  return {1, 0}
`;

const RELEASE_SCRIPT = `
  local leaseId = ARGV[1]
  local ttl = tonumber(ARGV[2])
  for i = 0, 2 do
    local offset = i * 3
    local size = tonumber(redis.call("HGET", KEYS[offset + 2], leaseId) or "0")
    local removed = redis.call("ZREM", KEYS[offset + 1], leaseId)
    redis.call("HDEL", KEYS[offset + 2], leaseId)
    if removed == 1 and size > 0 then
      local current = tonumber(redis.call("GET", KEYS[offset + 3]) or "0")
      local nextValue = math.max(0, current - size)
      if nextValue == 0 then redis.call("DEL", KEYS[offset + 3])
      else redis.call("SET", KEYS[offset + 3], nextValue, "EX", ttl) end
    end
    if redis.call("ZCARD", KEYS[offset + 1]) == 0 then
      redis.call("DEL", KEYS[offset + 1], KEYS[offset + 2], KEYS[offset + 3])
    end
  end
  return 1
`;

const INCREASE_SCRIPT = `
  local leaseId = ARGV[1]
  local now = tonumber(ARGV[2])
  local expiresAt = tonumber(ARGV[3])
  local deltaBytes = tonumber(ARGV[4])
  local ttl = tonumber(ARGV[5])

  local function cleanup(zkey, hkey, totalKey)
    local expired = redis.call("ZRANGEBYSCORE", zkey, 0, now)
    local removedBytes = 0
    for _, id in ipairs(expired) do
      removedBytes = removedBytes + tonumber(redis.call("HGET", hkey, id) or "0")
      redis.call("HDEL", hkey, id)
    end
    if #expired > 0 then
      redis.call("ZREMRANGEBYSCORE", zkey, 0, now)
      local current = tonumber(redis.call("GET", totalKey) or "0")
      local nextValue = math.max(0, current - removedBytes)
      if nextValue == 0 then redis.call("DEL", totalKey)
      else redis.call("SET", totalKey, nextValue, "EX", ttl) end
    end
  end

  for i = 0, 2 do
    local offset = i * 3
    cleanup(KEYS[offset + 1], KEYS[offset + 2], KEYS[offset + 3])
    if not redis.call("ZSCORE", KEYS[offset + 1], leaseId) then
      return {0, 7}
    end
    local byteLimit = tonumber(ARGV[6 + i])
    local currentBytes = tonumber(redis.call("GET", KEYS[offset + 3]) or "0")
    if currentBytes + deltaBytes > byteLimit then
      return {0, i * 2 + 2}
    end
  end

  for i = 0, 2 do
    local offset = i * 3
    redis.call("ZADD", KEYS[offset + 1], expiresAt, leaseId)
    redis.call("HINCRBY", KEYS[offset + 2], leaseId, deltaBytes)
    redis.call("INCRBY", KEYS[offset + 3], deltaBytes)
    redis.call("EXPIRE", KEYS[offset + 1], ttl)
    redis.call("EXPIRE", KEYS[offset + 2], ttl)
    redis.call("EXPIRE", KEYS[offset + 3], ttl)
  end
  return {1, 0}
`;

const REASON_BY_CODE: Record<number, RequestBodyAdmissionReason> = {
  1: "api_key_concurrency",
  2: "api_key_bytes",
  3: "ip_concurrency",
  4: "ip_bytes",
  5: "global_concurrency",
  6: "global_bytes",
  7: "lease_expired",
};

function reserveInMemory(
  buckets: string[],
  leaseId: string,
  bytes: number,
  limits: AdmissionLimits
): RequestBodyAdmission {
  const now = Date.now();
  const dimensions = [
    [limits.apiKeyConcurrency, limits.apiKeyBytes],
    [limits.ipConcurrency, limits.ipBytes],
    [limits.globalConcurrency, limits.globalBytes],
  ] as const;

  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = memoryBuckets.get(buckets[index]) || new Map<string, MemoryLease>();
    for (const [id, lease] of bucket) {
      if (lease.expiresAt <= now) bucket.delete(id);
    }
    const currentBytes = [...bucket.values()].reduce((sum, lease) => sum + lease.bytes, 0);
    if (bucket.size >= dimensions[index][0]) {
      return { allowed: false, reason: REASON_BY_CODE[index * 2 + 1] };
    }
    if (currentBytes + bytes > dimensions[index][1]) {
      return { allowed: false, reason: REASON_BY_CODE[index * 2 + 2] };
    }
  }

  for (const bucketName of buckets) {
    const bucket = memoryBuckets.get(bucketName) || new Map<string, MemoryLease>();
    bucket.set(leaseId, {
      bytes,
      expiresAt: now + limits.leaseTtlSeconds * 1000,
    });
    memoryBuckets.set(bucketName, bucket);
  }
  return { allowed: true, leaseId };
}

export async function reserveRequestBodyAdmission(params: {
  apiKeyId: string;
  clientIp: string;
  declaredBytes: number;
}): Promise<RequestBodyAdmission> {
  const limits = getRequestBodyAdmissionLimits();
  const leaseId = randomUUID();
  const buckets = bucketNames(params.apiKeyId, params.clientIp);
  const hasRedis = !!process.env.REDIS_HOST?.trim();

  if (!hasRedis) {
    if (isProductionRuntime()) return { allowed: false, reason: "redis_unavailable" };
    return reserveInMemory(buckets, leaseId, params.declaredBytes, limits);
  }

  const keys = buckets.flatMap(redisBucketKeys);
  const now = Date.now();
  try {
    const result = await getRedis().eval(
      RESERVE_SCRIPT,
      keys.length,
      ...keys,
      leaseId,
      now,
      now + limits.leaseTtlSeconds * 1000,
      params.declaredBytes,
      limits.leaseTtlSeconds + 5,
      limits.apiKeyConcurrency,
      limits.apiKeyBytes,
      limits.ipConcurrency,
      limits.ipBytes,
      limits.globalConcurrency,
      limits.globalBytes
    ) as [number, number];
    return result[0] === 1
      ? { allowed: true, leaseId }
      : { allowed: false, reason: REASON_BY_CODE[Number(result[1])] };
  } catch {
    return { allowed: false, reason: "redis_unavailable" };
  }
}

export async function releaseRequestBodyAdmission(params: {
  apiKeyId: string;
  clientIp: string;
  leaseId: string;
}): Promise<void> {
  const buckets = bucketNames(params.apiKeyId, params.clientIp);
  const hasRedis = !!process.env.REDIS_HOST?.trim();
  if (!hasRedis) {
    for (const bucket of buckets) memoryBuckets.get(bucket)?.delete(params.leaseId);
    return;
  }
  const keys = buckets.flatMap(redisBucketKeys);
  const limits = getRequestBodyAdmissionLimits();
  await getRedis().eval(
    RELEASE_SCRIPT,
    keys.length,
    ...keys,
    params.leaseId,
    limits.leaseTtlSeconds + 5
  );
}

export async function increaseRequestBodyAdmission(params: {
  apiKeyId: string;
  clientIp: string;
  leaseId: string;
  deltaBytes: number;
}): Promise<RequestBodyAdmission> {
  if (!Number.isSafeInteger(params.deltaBytes) || params.deltaBytes <= 0) {
    throw new Error("request-body admission increment must be a positive integer");
  }

  const buckets = bucketNames(params.apiKeyId, params.clientIp);
  const limits = getRequestBodyAdmissionLimits();
  const hasRedis = !!process.env.REDIS_HOST?.trim();
  const now = Date.now();

  if (!hasRedis) {
    if (isProductionRuntime()) return { allowed: false, reason: "redis_unavailable" };
    const dimensions = [limits.apiKeyBytes, limits.ipBytes, limits.globalBytes];
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = memoryBuckets.get(buckets[index]);
      if (bucket) {
        for (const [id, currentLease] of bucket) {
          if (currentLease.expiresAt <= now) bucket.delete(id);
        }
      }
      const lease = bucket?.get(params.leaseId);
      if (!bucket || !lease) {
        return { allowed: false, reason: "lease_expired" };
      }
      const currentBytes = [...bucket.values()].reduce(
        (sum, currentLease) => sum + currentLease.bytes,
        0
      );
      if (currentBytes + params.deltaBytes > dimensions[index]) {
        return { allowed: false, reason: REASON_BY_CODE[index * 2 + 2] };
      }
    }
    for (const bucketName of buckets) {
      const lease = memoryBuckets.get(bucketName)!.get(params.leaseId)!;
      lease.bytes += params.deltaBytes;
      lease.expiresAt = now + limits.leaseTtlSeconds * 1000;
    }
    return { allowed: true, leaseId: params.leaseId };
  }

  const keys = buckets.flatMap(redisBucketKeys);
  try {
    const result = await getRedis().eval(
      INCREASE_SCRIPT,
      keys.length,
      ...keys,
      params.leaseId,
      now,
      now + limits.leaseTtlSeconds * 1000,
      params.deltaBytes,
      limits.leaseTtlSeconds + 5,
      limits.apiKeyBytes,
      limits.ipBytes,
      limits.globalBytes
    ) as [number, number];
    return result[0] === 1
      ? { allowed: true, leaseId: params.leaseId }
      : { allowed: false, reason: REASON_BY_CODE[Number(result[1])] };
  } catch {
    return { allowed: false, reason: "redis_unavailable" };
  }
}
