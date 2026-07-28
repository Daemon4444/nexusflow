import { createHash } from "node:crypto";
import { getRedis } from "./redis";
import { isProductionRuntime } from "../utils/runtime-safety";

export type PersistentWriteKind = "rate_limit_request" | "ticket" | "api_key";

export type PersistentWriteAdmission =
  | { allowed: true }
  | {
      allowed: false;
      reason: "user_rate" | "ip_rate" | "global_rate" | "redis_unavailable";
      retryAfterSeconds: number;
    };

type Limits = {
  user: number;
  ip: number;
  global: number;
  windowSeconds: number;
};

const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function limits(kind: PersistentWriteKind): Limits {
  const prefix = kind.toUpperCase();
  const defaults: Record<PersistentWriteKind, Omit<Limits, "windowSeconds">> = {
    rate_limit_request: { user: 6, ip: 30, global: 2_000 },
    ticket: { user: 12, ip: 60, global: 5_000 },
    api_key: { user: 20, ip: 60, global: 5_000 },
  };
  return {
    user: positiveInteger(
      process.env[`CONTROL_WRITE_${prefix}_USER_PER_WINDOW`],
      defaults[kind].user
    ),
    ip: positiveInteger(
      process.env[`CONTROL_WRITE_${prefix}_IP_PER_WINDOW`],
      defaults[kind].ip
    ),
    global: positiveInteger(
      process.env[`CONTROL_WRITE_${prefix}_GLOBAL_PER_WINDOW`],
      defaults[kind].global
    ),
    windowSeconds: positiveInteger(
      process.env.CONTROL_WRITE_WINDOW_SECONDS,
      60 * 60
    ),
  };
}

function keys(kind: PersistentWriteKind, userId: string, clientIp: string): string[] {
  const prefix = `nexusflow:control-write:v1:${kind}`;
  return [
    `${prefix}:user:${digest(userId)}`,
    `${prefix}:ip:${digest(clientIp)}`,
    `${prefix}:global`,
  ];
}

const RESERVE_SCRIPT = `
  for i = 1, 3 do
    local keyType = redis.call("TYPE", KEYS[i])["ok"]
    if keyType ~= "none" and keyType ~= "string" then
      return redis.error_reply("invalid control write counter")
    end
    local current = tonumber(redis.call("GET", KEYS[i]) or "0")
    if current == nil then return redis.error_reply("invalid control write value") end
    if current >= tonumber(ARGV[i]) then
      local ttl = redis.call("TTL", KEYS[i])
      if ttl < 1 then ttl = tonumber(ARGV[4]) end
      return {0, i, ttl}
    end
  end
  for i = 1, 3 do
    local current = redis.call("INCR", KEYS[i])
    if current == 1 then redis.call("EXPIRE", KEYS[i], tonumber(ARGV[4])) end
  end
  return {1, 0, tonumber(ARGV[4])}
`;

function reserveMemory(
  kind: PersistentWriteKind,
  userId: string,
  clientIp: string,
  config: Limits
): PersistentWriteAdmission {
  const now = Date.now();
  const dimensions = keys(kind, userId, clientIp).map((key, index) => ({
    key,
    limit: [config.user, config.ip, config.global][index],
    reason: (["user_rate", "ip_rate", "global_rate"] as const)[index],
  }));
  for (const dimension of dimensions) {
    const current = memoryCounters.get(dimension.key);
    const count = current && current.expiresAt > now ? current.count : 0;
    if (count >= dimension.limit) {
      return {
        allowed: false,
        reason: dimension.reason,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil(((current?.expiresAt || now) - now) / 1000)
        ),
      };
    }
  }
  for (const dimension of dimensions) {
    const current = memoryCounters.get(dimension.key);
    memoryCounters.set(dimension.key, {
      count: current && current.expiresAt > now ? current.count + 1 : 1,
      expiresAt: now + config.windowSeconds * 1000,
    });
  }
  return { allowed: true };
}

/**
 * Cross-node admission for low-volume writes that create durable control-plane
 * state. Production fails closed when Redis is unavailable so a partial outage
 * cannot turn support tables or API-key rows into an unbounded write sink.
 */
export async function reservePersistentWrite(params: {
  kind: PersistentWriteKind;
  userId: string;
  clientIp: string;
}): Promise<PersistentWriteAdmission> {
  const config = limits(params.kind);
  if (!process.env.REDIS_HOST?.trim()) {
    if (isProductionRuntime()) {
      return {
        allowed: false,
        reason: "redis_unavailable",
        retryAfterSeconds: 5,
      };
    }
    return reserveMemory(
      params.kind,
      params.userId,
      params.clientIp,
      config
    );
  }

  try {
    const result = await getRedis().eval(
      RESERVE_SCRIPT,
      3,
      ...keys(params.kind, params.userId, params.clientIp),
      config.user,
      config.ip,
      config.global,
      config.windowSeconds
    ) as [number, number, number];
    if (Number(result[0]) === 1) return { allowed: true };
    return {
      allowed: false,
      reason: (["user_rate", "ip_rate", "global_rate"] as const)[
        Math.max(0, Number(result[1]) - 1)
      ] || "global_rate",
      retryAfterSeconds: Math.max(1, Number(result[2]) || config.windowSeconds),
    };
  } catch {
    return {
      allowed: false,
      reason: "redis_unavailable",
      retryAfterSeconds: 5,
    };
  }
}
