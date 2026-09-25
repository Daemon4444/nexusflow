/**
 * Multi-scope capacity reservation (P4, NF_TRAFFIC_MODE).
 *
 * One Lua script checks and then reserves every scope of a request —
 * route → quota pool → the caller's fair share of that pool — atomically,
 * so the 4 production processes share one truth in Redis. Lease/release
 * semantics follow services/rate-limiter.ts: RPM and daily counts stay
 * consumed once an attempt was made; concurrency is returned on release;
 * the TPM estimate is reconciled to actual tokens.
 *
 * Redis unavailable → the reservation fails closed ("redis_unavailable"),
 * exactly like the legacy managed-provider limiter.
 */
import { randomUUID } from "node:crypto";
import { getRedis } from "../services/redis";

/** Same rule as services/rate-limiter.ts: Redis is configured via REDIS_HOST. */
function redisConfigured(): boolean {
  return !!(process.env.REDIS_HOST && process.env.REDIS_HOST !== "");
}

export interface ScopeLimit {
  /** Stable scope key, e.g. "route:dashscope:qwen-plus", "pool:bailian-kimi", "share:pool:bailian-kimi:user-1". */
  id: string;
  rpm: number;
  tpm: number;
  concurrency: number;
  daily: number;
}

export type ScopeReason = "rpm" | "tpm" | "daily" | "concurrency";

export type TrafficReservation =
  | { allowed: true; leaseId: string; scopes: string[]; reservedTokens: number }
  | { allowed: false; reason: ScopeReason | "redis_unavailable"; scope: string | null };

const PREFIX = "nf:traffic:v1";
const WINDOW_MS = 60_000;
const LEASE_SECONDS = 60 * 60;
const DAILY_TTL_SECONDS = 3 * 24 * 60 * 60;

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
}

function scopeKeys(scope: string, now: number): string[] {
  const base = `${PREFIX}:${scope}`;
  return [`${base}:rpm`, `${base}:tpm`, `${base}:tpmw`, `${base}:tpmt`, `${base}:conc`, `${base}:daily:${dayKey(now)}`];
}

type RedisLike = {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
};

let clientOverride: RedisLike | null = null;

/** Test hook: route reservations through a specific Redis client. */
export function setTrafficRedisClient(client: RedisLike | null): void {
  clientOverride = client;
}

function client(): RedisLike | null {
  if (clientOverride) return clientOverride;
  if (!redisConfigured()) return null;
  return getRedis() as unknown as RedisLike;
}

// KEYS: 6 per scope (rpm, tpm, tpmw, tpmt, conc, daily) + lease key.
// ARGV: scopeCount, reservedTokens, now, windowStart, leaseId, leaseTtl,
//       dailyTtl, dryRun, then 4 limits per scope (rpm, tpm, conc, daily).
const RESERVE_SCRIPT = `
local n = tonumber(ARGV[1])
local tokens = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local windowStart = tonumber(ARGV[4])
local leaseId = ARGV[5]
local leaseTtl = tonumber(ARGV[6])
local dailyTtl = tonumber(ARGV[7])
local dryRun = ARGV[8] == "1"
local leaseKey = KEYS[n * 6 + 1]
if (not dryRun) and redis.call("EXISTS", leaseKey) == 1 then return {1, 0} end
local tpmNow = {}
for i = 0, n - 1 do
  local k = i * 6
  local rpmKey, tpmKey, tpmwKey, tpmtKey, concKey, dailyKey = KEYS[k+1], KEYS[k+2], KEYS[k+3], KEYS[k+4], KEYS[k+5], KEYS[k+6]
  local a = 9 + i * 4
  local rpmLimit, tpmLimit, concLimit, dailyLimit = tonumber(ARGV[a]), tonumber(ARGV[a+1]), tonumber(ARGV[a+2]), tonumber(ARGV[a+3])
  -- expire the sliding windows
  redis.call("ZREMRANGEBYSCORE", rpmKey, 0, windowStart)
  local expired = redis.call("ZRANGEBYSCORE", tpmKey, 0, windowStart)
  local total = tonumber(redis.call("GET", tpmtKey) or "0")
  for _, member in ipairs(expired) do
    total = total - (tonumber(redis.call("HGET", tpmwKey, member)) or 0)
    redis.call("HDEL", tpmwKey, member)
  end
  if #expired > 0 then redis.call("ZREMRANGEBYSCORE", tpmKey, 0, windowStart) end
  if total < 0 then total = 0 end
  redis.call("SET", tpmtKey, total, "EX", 61)
  redis.call("ZREMRANGEBYSCORE", concKey, 0, now)
  tpmNow[i] = total
  if rpmLimit > 0 and redis.call("ZCARD", rpmKey) >= rpmLimit then return {0, i + 1, 1} end
  if tpmLimit > 0 and total + tokens > tpmLimit then return {0, i + 1, 2} end
  if dailyLimit > 0 and tonumber(redis.call("GET", dailyKey) or "0") >= dailyLimit then return {0, i + 1, 3} end
  if concLimit > 0 and redis.call("ZCARD", concKey) >= concLimit then return {0, i + 1, 4} end
end
if dryRun then return {1, 0} end
for i = 0, n - 1 do
  local k = i * 6
  local rpmKey, tpmKey, tpmwKey, tpmtKey, concKey, dailyKey = KEYS[k+1], KEYS[k+2], KEYS[k+3], KEYS[k+4], KEYS[k+5], KEYS[k+6]
  redis.call("ZADD", rpmKey, now, leaseId)
  redis.call("EXPIRE", rpmKey, 61)
  if tokens > 0 then
    redis.call("ZADD", tpmKey, now, leaseId)
    redis.call("HSET", tpmwKey, leaseId, tokens)
    redis.call("SET", tpmtKey, tpmNow[i] + tokens, "EX", 61)
    redis.call("EXPIRE", tpmKey, 61)
    redis.call("EXPIRE", tpmwKey, 61)
  end
  redis.call("INCR", dailyKey)
  redis.call("EXPIRE", dailyKey, dailyTtl)
  redis.call("ZADD", concKey, now + leaseTtl * 1000, leaseId)
  redis.call("EXPIRE", concKey, leaseTtl + 1)
end
redis.call("SET", leaseKey, tostring(tokens) .. ":" .. tostring(now), "EX", leaseTtl)
return {1, 0}
`;

// KEYS: 5 per scope (tpm, tpmw, tpmt, conc, unused daily) + lease key.
// ARGV: scopeCount, actualTokens, windowStart, leaseId
const RELEASE_SCRIPT = `
local n = tonumber(ARGV[1])
local actual = tonumber(ARGV[2])
local windowStart = tonumber(ARGV[3])
local leaseId = ARGV[4]
local leaseKey = KEYS[n * 6 + 1]
local raw = redis.call("GET", leaseKey)
if not raw then return 0 end
local reserved, startedAt = string.match(raw, "^([^:]+):([^:]+)$")
reserved = tonumber(reserved)
startedAt = tonumber(startedAt)
for i = 0, n - 1 do
  local k = i * 6
  local tpmKey, tpmwKey, tpmtKey, concKey = KEYS[k+2], KEYS[k+3], KEYS[k+4], KEYS[k+5]
  redis.call("ZREM", concKey, leaseId)
  if startedAt > windowStart then
    local total = tonumber(redis.call("GET", tpmtKey) or "0")
    local current = tonumber(redis.call("HGET", tpmwKey, leaseId) or "0")
    total = total - current + actual
    if total < 0 then total = 0 end
    if actual > 0 then
      redis.call("ZADD", tpmKey, startedAt, leaseId)
      redis.call("HSET", tpmwKey, leaseId, actual)
      redis.call("EXPIRE", tpmKey, 61)
      redis.call("EXPIRE", tpmwKey, 61)
    else
      redis.call("ZREM", tpmKey, leaseId)
      redis.call("HDEL", tpmwKey, leaseId)
    end
    redis.call("SET", tpmtKey, total, "EX", 61)
  end
end
redis.call("DEL", leaseKey)
return 1
`;

const REASONS: Record<number, ScopeReason> = { 1: "rpm", 2: "tpm", 3: "daily", 4: "concurrency" };

function buildArgs(scopes: ScopeLimit[], now: number, leaseId: string): string[] {
  const keys: string[] = [];
  for (const scope of scopes) keys.push(...scopeKeys(scope.id, now));
  keys.push(`${PREFIX}:lease:${leaseId}`);
  return keys;
}

/**
 * Atomically reserves all scopes (or none). `dryRun` only evaluates — used
 * by NF_TRAFFIC_MODE=shadow to learn what enforce would decide.
 */
export async function reserveScopes(params: {
  scopes: ScopeLimit[];
  estimatedTokens: number;
  leaseId?: string;
  dryRun?: boolean;
  now?: number;
}): Promise<TrafficReservation> {
  const redis = client();
  if (!redis) return { allowed: false, reason: "redis_unavailable", scope: null };
  const now = params.now ?? Date.now();
  const leaseId = params.leaseId || randomUUID();
  const tokens = Math.max(0, Math.ceil(params.estimatedTokens || 0));
  const keys = buildArgs(params.scopes, now, leaseId);
  const limits: number[] = [];
  for (const scope of params.scopes) {
    limits.push(
      Math.max(0, Math.floor(scope.rpm || 0)),
      Math.max(0, Math.floor(scope.tpm || 0)),
      Math.max(0, Math.floor(scope.concurrency || 0)),
      Math.max(0, Math.floor(scope.daily || 0))
    );
  }
  let result: [number, number, number?];
  try {
    result = (await redis.eval(
      RESERVE_SCRIPT,
      keys.length,
      ...keys,
      params.scopes.length,
      tokens,
      now,
      now - WINDOW_MS,
      leaseId,
      LEASE_SECONDS,
      DAILY_TTL_SECONDS,
      params.dryRun ? "1" : "0",
      ...limits
    )) as [number, number, number?];
  } catch (error) {
    console.error(`[traffic] reservation failed: ${error instanceof Error ? error.message : String(error)}`);
    return { allowed: false, reason: "redis_unavailable", scope: null };
  }
  if (Number(result[0]) === 1) {
    return { allowed: true, leaseId, scopes: params.scopes.map((scope) => scope.id), reservedTokens: tokens };
  }
  const scopeIndex = Number(result[1]) - 1;
  return {
    allowed: false,
    reason: REASONS[Number(result[2])] || "rpm",
    scope: params.scopes[scopeIndex]?.id ?? null,
  };
}

/** Idempotent: releases concurrency and reconciles TPM on every scope. */
export async function releaseScopes(params: { scopes: string[]; leaseId: string; actualTokens: number }): Promise<void> {
  const redis = client();
  if (!redis) throw new Error("Redis is required to release a traffic lease");
  const now = Date.now();
  const keys: string[] = [];
  for (const scope of params.scopes) keys.push(...scopeKeys(scope, now));
  keys.push(`${PREFIX}:lease:${params.leaseId}`);
  await redis.eval(
    RELEASE_SCRIPT,
    keys.length,
    ...keys,
    params.scopes.length,
    Math.max(0, Math.ceil(params.actualTokens || 0)),
    now - WINDOW_MS,
    params.leaseId
  );
}

// -------------------------------------------------- upstream 429 cooldown

/** Parses Retry-After (delta seconds or HTTP date); bounded to [1, 300] s. */
export function parseRetryAfter(value: string | null | undefined, fallbackS: number, now = Date.now()): number {
  const clamp = (seconds: number) => Math.min(300, Math.max(1, Math.ceil(seconds)));
  if (!value) return clamp(fallbackS);
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return clamp(Number(trimmed));
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) return clamp((date - now) / 1000);
  return clamp(fallbackS);
}

type CooldownClient = {
  set(key: string, value: string, mode: "PX", ms: number): Promise<unknown>;
  mget(...keys: string[]): Promise<Array<string | null>>;
};

function cooldownClient(): CooldownClient | null {
  if (clientOverride) return clientOverride as unknown as CooldownClient;
  if (!redisConfigured()) return null;
  return getRedis() as unknown as CooldownClient;
}

export function cooldownKey(routeId: string): string {
  return `${PREFIX}:cooldown:${routeId}`;
}

/** Marks a route as cooling down after an upstream 429 (shared by all processes). */
export async function recordUpstreamCooldown(routeId: string, seconds: number): Promise<void> {
  const redis = cooldownClient();
  if (!redis) return;
  await redis.set(cooldownKey(routeId), String(Date.now() + seconds * 1000), "PX", seconds * 1000);
}

/** Returns the subset of routes currently cooling down, with their end times (ms). */
export async function coolingRoutes(routeIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const redis = cooldownClient();
  if (!redis || routeIds.length === 0) return result;
  try {
    const values = await redis.mget(...routeIds.map(cooldownKey));
    routeIds.forEach((id, index) => {
      const until = Number(values[index]);
      if (Number.isFinite(until) && until > Date.now()) result.set(id, until);
    });
  } catch {
    // Unknown cooldown state never blocks routing: capacity is still enforced.
  }
  return result;
}
