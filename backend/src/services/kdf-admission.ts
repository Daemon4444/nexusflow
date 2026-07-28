import { createHash, randomUUID } from "node:crypto";
import { getRedis } from "./redis";
import { isProductionRuntime } from "../utils/runtime-safety";

export type KdfAdmission =
  | { allowed: true; leaseId: string; actorKey: string; ipKey: string }
  | { allowed: false; reason: "rate" | "concurrency" | "redis_unavailable" };

const memoryCounters = new Map<string, { count: number; expiresAt: number }>();
const memoryConcurrency = new Map<string, Set<string>>();

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function limit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function keys(actor: string, ip: string) {
  const actorKey = digest(actor);
  const ipKey = digest(ip);
  return {
    actorKey,
    ipKey,
    counters: [
      `nexusflow:kdf:v1:actor:${actorKey}:count`,
      `nexusflow:kdf:v1:ip:${ipKey}:count`,
      "nexusflow:kdf:v1:global:count",
    ],
    leases: [
      `nexusflow:kdf:v1:actor:${actorKey}:leases`,
      `nexusflow:kdf:v1:ip:${ipKey}:leases`,
      "nexusflow:kdf:v1:global:leases",
    ],
  };
}

const RESERVE_SCRIPT = `
  local now = tonumber(ARGV[1])
  local expiresAt = tonumber(ARGV[2])
  local leaseId = ARGV[3]
  local windowSeconds = tonumber(ARGV[4])
  local leaseSeconds = tonumber(ARGV[5])
  for i = 1, 3 do
    local count = tonumber(redis.call("GET", KEYS[i]) or "0")
    redis.call("ZREMRANGEBYSCORE", KEYS[i + 3], 0, now)
    if count >= tonumber(ARGV[5 + i]) then return {0, 1} end
    if redis.call("ZCARD", KEYS[i + 3]) >= tonumber(ARGV[8 + i]) then
      return {0, 2}
    end
  end
  for i = 1, 3 do
    local count = redis.call("INCR", KEYS[i])
    if count == 1 then redis.call("EXPIRE", KEYS[i], windowSeconds) end
    redis.call("ZADD", KEYS[i + 3], expiresAt, leaseId)
    redis.call("EXPIRE", KEYS[i + 3], leaseSeconds + 1)
  end
  return {1, 0}
`;

const RELEASE_SCRIPT = `
  for i = 1, 3 do
    redis.call("ZREM", KEYS[i], ARGV[1])
    if redis.call("ZCARD", KEYS[i]) == 0 then redis.call("DEL", KEYS[i]) end
  end
  return 1
`;

function reserveMemory(actor: string, ip: string, leaseId: string): KdfAdmission {
  const now = Date.now();
  const windowMs = 60_000;
  const keyParts = keys(actor, ip);
  const dimensions = [
    [`actor:${keyParts.actorKey}`, limit("KDF_ACTOR_PER_MINUTE", 10), limit("KDF_ACTOR_CONCURRENCY", 2)],
    [`ip:${keyParts.ipKey}`, limit("KDF_IP_PER_MINUTE", 30), limit("KDF_IP_CONCURRENCY", 4)],
    ["global", limit("KDF_GLOBAL_PER_MINUTE", 200), limit("KDF_GLOBAL_CONCURRENCY", 32)],
  ] as const;
  for (const [key, rateLimit, concurrencyLimit] of dimensions) {
    const counter = memoryCounters.get(key);
    const count = counter && counter.expiresAt > now ? counter.count : 0;
    if (count >= rateLimit) return { allowed: false, reason: "rate" };
    if ((memoryConcurrency.get(key)?.size || 0) >= concurrencyLimit) {
      return { allowed: false, reason: "concurrency" };
    }
  }
  for (const [key] of dimensions) {
    const current = memoryCounters.get(key);
    memoryCounters.set(key, {
      count: current && current.expiresAt > now ? current.count + 1 : 1,
      expiresAt: now + windowMs,
    });
    const leases = memoryConcurrency.get(key) || new Set<string>();
    leases.add(leaseId);
    memoryConcurrency.set(key, leases);
  }
  return { allowed: true, leaseId, actorKey: keyParts.actorKey, ipKey: keyParts.ipKey };
}

export async function reserveKdfAdmission(
  actor: string,
  ip: string
): Promise<KdfAdmission> {
  const leaseId = randomUUID();
  const keyParts = keys(actor, ip);
  if (!process.env.REDIS_HOST?.trim()) {
    if (isProductionRuntime()) {
      return { allowed: false, reason: "redis_unavailable" };
    }
    return reserveMemory(actor, ip, leaseId);
  }
  const now = Date.now();
  const leaseSeconds = limit("KDF_LEASE_SECONDS", 30);
  try {
    const result = await getRedis().eval(
      RESERVE_SCRIPT,
      6,
      ...keyParts.counters,
      ...keyParts.leases,
      now,
      now + leaseSeconds * 1000,
      leaseId,
      60,
      leaseSeconds,
      limit("KDF_ACTOR_PER_MINUTE", 10),
      limit("KDF_IP_PER_MINUTE", 30),
      limit("KDF_GLOBAL_PER_MINUTE", 200),
      limit("KDF_ACTOR_CONCURRENCY", 2),
      limit("KDF_IP_CONCURRENCY", 4),
      limit("KDF_GLOBAL_CONCURRENCY", 32)
    ) as [number, number];
    if (Number(result[0]) !== 1) {
      return {
        allowed: false,
        reason: Number(result[1]) === 2 ? "concurrency" : "rate",
      };
    }
    return {
      allowed: true,
      leaseId,
      actorKey: keyParts.actorKey,
      ipKey: keyParts.ipKey,
    };
  } catch {
    return { allowed: false, reason: "redis_unavailable" };
  }
}

export async function releaseKdfAdmission(
  admission: Extract<KdfAdmission, { allowed: true }>
): Promise<void> {
  if (!process.env.REDIS_HOST?.trim()) {
    for (const key of [
      `actor:${admission.actorKey}`,
      `ip:${admission.ipKey}`,
      "global",
    ]) {
      memoryConcurrency.get(key)?.delete(admission.leaseId);
    }
    return;
  }
  await getRedis().eval(
    RELEASE_SCRIPT,
    3,
    `nexusflow:kdf:v1:actor:${admission.actorKey}:leases`,
    `nexusflow:kdf:v1:ip:${admission.ipKey}:leases`,
    "nexusflow:kdf:v1:global:leases",
    admission.leaseId
  );
}
