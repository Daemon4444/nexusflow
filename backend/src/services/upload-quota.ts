import { randomUUID } from "node:crypto";
import { getRedis } from "./redis";
import { isProductionRuntime } from "../utils/runtime-safety";

export type UploadQuotaReservation = {
  identity: string;
  dayKey: string;
  leaseId: string;
  reservedBytes: number;
};

export type UploadQuotaResult =
  | { allowed: true; reservation: UploadQuotaReservation }
  | {
      allowed: false;
      reason: "concurrency" | "daily_bytes" | "redis_unavailable";
      retryAfterSeconds?: number;
    };

const memoryDaily = new Map<string, number>();
const memoryLeases = new Map<string, Map<string, number>>();

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getUploadQuotaConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    dailyBytes: positiveInteger(env.UPLOAD_DAILY_BYTES, 512 * 1024 * 1024),
    concurrency: positiveInteger(env.UPLOAD_CONCURRENCY_PER_IDENTITY, 2),
    leaseSeconds: positiveInteger(env.UPLOAD_LEASE_SECONDS, 15 * 60),
  };
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function quotaKeys(identity: string, day: string, leaseId: string): string[] {
  const prefix = `nexusflow:upload-quota:v1:${identity}`;
  return [
    `${prefix}:daily:${day}`,
    `${prefix}:leases`,
    `${prefix}:lease:${leaseId}`,
  ];
}

const RESERVE_SCRIPT = `
  local dailyKey = KEYS[1]
  local leasesKey = KEYS[2]
  local leaseKey = KEYS[3]
  local now = tonumber(ARGV[1])
  local expiresAt = tonumber(ARGV[2])
  local requested = tonumber(ARGV[3])
  local dailyLimit = tonumber(ARGV[4])
  local concurrencyLimit = tonumber(ARGV[5])
  local leaseSeconds = tonumber(ARGV[6])
  local dailyTtl = tonumber(ARGV[7])
  local leaseId = ARGV[8]

  redis.call("ZREMRANGEBYSCORE", leasesKey, 0, now)
  local active = tonumber(redis.call("ZCARD", leasesKey) or "0")
  if active >= concurrencyLimit then return {0, 1} end
  local daily = tonumber(redis.call("GET", dailyKey) or "0")
  if daily + requested > dailyLimit then return {0, 2} end
  if not redis.call("SET", leaseKey, requested, "EX", leaseSeconds, "NX") then
    return {0, 3}
  end
  redis.call("ZADD", leasesKey, expiresAt, leaseId)
  redis.call("EXPIRE", leasesKey, leaseSeconds + 5)
  redis.call("INCRBY", dailyKey, requested)
  redis.call("EXPIRE", dailyKey, dailyTtl)
  return {1, 0}
`;

const FINALIZE_SCRIPT = `
  local dailyKey = KEYS[1]
  local leasesKey = KEYS[2]
  local leaseKey = KEYS[3]
  local leaseId = ARGV[1]
  local actual = tonumber(ARGV[2])
  local dailyTtl = tonumber(ARGV[3])
  local reserved = tonumber(redis.call("GET", leaseKey))
  if reserved == nil then return 0 end
  redis.call("DEL", leaseKey)
  redis.call("ZREM", leasesKey, leaseId)
  local current = tonumber(redis.call("GET", dailyKey) or "0")
  local nextValue = math.max(0, current - reserved + actual)
  if nextValue == 0 then redis.call("DEL", dailyKey)
  else redis.call("SET", dailyKey, nextValue, "EX", dailyTtl) end
  if redis.call("ZCARD", leasesKey) == 0 then redis.call("DEL", leasesKey) end
  return 1
`;

export async function reserveUploadQuota(
  identity: string,
  declaredBytes: number
): Promise<UploadQuotaResult> {
  const config = getUploadQuotaConfig();
  const dayKey = utcDay();
  const leaseId = randomUUID();
  const hasRedis = !!process.env.REDIS_HOST?.trim();
  if (!hasRedis) {
    if (isProductionRuntime()) return { allowed: false, reason: "redis_unavailable" };
    const leaseKey = `${identity}:${dayKey}`;
    const leases = memoryLeases.get(leaseKey) || new Map<string, number>();
    const daily = memoryDaily.get(leaseKey) || 0;
    if (leases.size >= config.concurrency) {
      return { allowed: false, reason: "concurrency", retryAfterSeconds: config.leaseSeconds };
    }
    if (daily + declaredBytes > config.dailyBytes) {
      return { allowed: false, reason: "daily_bytes" };
    }
    leases.set(leaseId, declaredBytes);
    memoryLeases.set(leaseKey, leases);
    memoryDaily.set(leaseKey, daily + declaredBytes);
    return {
      allowed: true,
      reservation: { identity, dayKey, leaseId, reservedBytes: declaredBytes },
    };
  }

  const keys = quotaKeys(identity, dayKey, leaseId);
  const now = Date.now();
  try {
    const result = await getRedis().eval(
      RESERVE_SCRIPT,
      keys.length,
      ...keys,
      now,
      now + config.leaseSeconds * 1000,
      declaredBytes,
      config.dailyBytes,
      config.concurrency,
      config.leaseSeconds,
      3 * 24 * 60 * 60,
      leaseId
    ) as [number, number];
    if (result[0] === 1) {
      return {
        allowed: true,
        reservation: { identity, dayKey, leaseId, reservedBytes: declaredBytes },
      };
    }
    return {
      allowed: false,
      reason: Number(result[1]) === 1 ? "concurrency" : "daily_bytes",
      retryAfterSeconds: Number(result[1]) === 1 ? config.leaseSeconds : undefined,
    };
  } catch {
    return { allowed: false, reason: "redis_unavailable" };
  }
}

export async function finalizeUploadQuota(
  reservation: UploadQuotaReservation,
  actualBytes: number
): Promise<void> {
  const actual = Math.max(0, Math.floor(actualBytes));
  const hasRedis = !!process.env.REDIS_HOST?.trim();
  if (!hasRedis) {
    const key = `${reservation.identity}:${reservation.dayKey}`;
    const leases = memoryLeases.get(key);
    if (!leases?.delete(reservation.leaseId)) return;
    memoryDaily.set(
      key,
      Math.max(
        0,
        (memoryDaily.get(key) || 0) - reservation.reservedBytes + actual
      )
    );
    return;
  }
  const keys = quotaKeys(
    reservation.identity,
    reservation.dayKey,
    reservation.leaseId
  );
  await getRedis().eval(
    FINALIZE_SCRIPT,
    keys.length,
    ...keys,
    reservation.leaseId,
    actual,
    3 * 24 * 60 * 60
  );
}

