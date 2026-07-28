import { createHash, randomUUID } from "node:crypto";
import type { AsyncTask } from "../data/tasks";
import { getCapacity } from "../data/providers";
import type { TaskResult } from "./adapters";
import {
  acquireProviderCapacity,
  releaseProviderCapacity,
  type ProviderCapacityRoute,
} from "./scheduler";
import { getRedis } from "./redis";
import { isProductionRuntime } from "../utils/runtime-safety";

type PollRateReason = "actor_rate" | "user_rate" | "task_rate";

export type ControlledTaskPollResult =
  | { ok: true; state: "result"; result: TaskResult; source: "cache" | "upstream" }
  | { ok: true; state: "in_flight" }
  | {
      ok: false;
      reason:
        | PollRateReason
        | "control_store_unavailable"
        | "provider_capacity_exhausted"
        | "provider_capacity_store_unavailable";
    };

type MemoryCounter = { count: number; expiresAt: number };
type MemoryCache = { result: TaskResult; expiresAt: number };
type MemoryLock = { token: string; expiresAt: number };

const memoryCounters = new Map<string, MemoryCounter>();
const memoryCache = new Map<string, MemoryCache>();
const memoryLocks = new Map<string, MemoryLock>();

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pollConfig() {
  return {
    actorPerMinute: positiveInteger(process.env.TASK_POLL_ACTOR_PER_MINUTE, 60),
    userPerMinute: positiveInteger(process.env.TASK_POLL_USER_PER_MINUTE, 120),
    taskPerMinute: positiveInteger(process.env.TASK_POLL_TASK_PER_MINUTE, 90),
    cacheSeconds: positiveInteger(process.env.TASK_POLL_CACHE_SECONDS, 2),
    lockSeconds: positiveInteger(process.env.TASK_POLL_LOCK_SECONDS, 20),
  };
}

function rateKeys(actorId: string, userId: string | null, taskId: string): string[] {
  return [
    `nexusflow:task-poll:v1:actor:${digest(actorId)}:rate`,
    `nexusflow:task-poll:v1:user:${digest(userId || "anonymous")}:rate`,
    `nexusflow:task-poll:v1:task:${digest(taskId)}:rate`,
  ];
}

function taskKeys(taskId: string): { cache: string; lock: string } {
  const taskKey = digest(taskId);
  return {
    cache: `nexusflow:task-poll:v1:task:${taskKey}:cache`,
    lock: `nexusflow:task-poll:v1:task:${taskKey}:lock`,
  };
}

const RATE_SCRIPT = `
  for i = 1, 3 do
    local keyType = redis.call("TYPE", KEYS[i])["ok"]
    if keyType ~= "none" and keyType ~= "string" then
      return redis.error_reply("invalid task poll rate key")
    end
    local count = tonumber(redis.call("GET", KEYS[i]) or "0")
    if count == nil then return redis.error_reply("invalid task poll rate value") end
    if count >= tonumber(ARGV[i]) then return {0, i} end
  end
  for i = 1, 3 do
    local count = redis.call("INCR", KEYS[i])
    if count == 1 then redis.call("EXPIRE", KEYS[i], tonumber(ARGV[4])) end
  end
  return {1, 0}
`;

const RELEASE_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end
  return 0
`;

function reserveMemoryRate(
  actorId: string,
  userId: string | null,
  taskId: string
): PollRateReason | null {
  const now = Date.now();
  const config = pollConfig();
  const dimensions = [
    [rateKeys(actorId, userId, taskId)[0], config.actorPerMinute, "actor_rate"],
    [rateKeys(actorId, userId, taskId)[1], config.userPerMinute, "user_rate"],
    [rateKeys(actorId, userId, taskId)[2], config.taskPerMinute, "task_rate"],
  ] as const;
  for (const [key, limit, reason] of dimensions) {
    const current = memoryCounters.get(key);
    const count = current && current.expiresAt > now ? current.count : 0;
    if (count >= limit) return reason;
  }
  for (const [key] of dimensions) {
    const current = memoryCounters.get(key);
    memoryCounters.set(key, {
      count: current && current.expiresAt > now ? current.count + 1 : 1,
      expiresAt: now + 60_000,
    });
  }
  return null;
}

async function reservePollRate(
  actorId: string,
  userId: string | null,
  taskId: string
): Promise<PollRateReason | "control_store_unavailable" | null> {
  const hasRedis = !!process.env.REDIS_HOST?.trim();
  if (!hasRedis) {
    if (isProductionRuntime()) return "control_store_unavailable";
    return reserveMemoryRate(actorId, userId, taskId);
  }
  const config = pollConfig();
  try {
    const result = await getRedis().eval(
      RATE_SCRIPT,
      3,
      ...rateKeys(actorId, userId, taskId),
      config.actorPerMinute,
      config.userPerMinute,
      config.taskPerMinute,
      61
    ) as [number, number];
    if (Number(result[0]) === 1) return null;
    return (["actor_rate", "user_rate", "task_rate"] as const)[
      Math.max(0, Number(result[1]) - 1)
    ] || "control_store_unavailable";
  } catch {
    return "control_store_unavailable";
  }
}

async function readCachedResult(
  taskId: string
): Promise<TaskResult | null | "control_store_unavailable"> {
  const hasRedis = !!process.env.REDIS_HOST?.trim();
  if (!hasRedis) {
    const cached = memoryCache.get(taskId);
    if (!cached || cached.expiresAt <= Date.now()) {
      memoryCache.delete(taskId);
      return null;
    }
    return cached.result;
  }
  try {
    const raw = await getRedis().get(taskKeys(taskId).cache);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TaskResult;
    if (
      !parsed
      || !["pending", "running", "succeeded", "failed"].includes(parsed.status)
    ) {
      return "control_store_unavailable";
    }
    return parsed;
  } catch {
    return "control_store_unavailable";
  }
}

async function acquirePollLock(
  taskId: string,
  token: string
): Promise<boolean | "control_store_unavailable"> {
  const config = pollConfig();
  const hasRedis = !!process.env.REDIS_HOST?.trim();
  if (!hasRedis) {
    const current = memoryLocks.get(taskId);
    if (current && current.expiresAt > Date.now()) return false;
    memoryLocks.set(taskId, {
      token,
      expiresAt: Date.now() + config.lockSeconds * 1000,
    });
    return true;
  }
  try {
    return (await getRedis().set(
      taskKeys(taskId).lock,
      token,
      "EX",
      config.lockSeconds,
      "NX"
    )) === "OK";
  } catch {
    return "control_store_unavailable";
  }
}

async function cachePollResult(taskId: string, result: TaskResult): Promise<void> {
  const config = pollConfig();
  if (!process.env.REDIS_HOST?.trim()) {
    memoryCache.set(taskId, {
      result,
      expiresAt: Date.now() + config.cacheSeconds * 1000,
    });
    return;
  }
  await getRedis().set(
    taskKeys(taskId).cache,
    JSON.stringify(result),
    "EX",
    config.cacheSeconds
  );
}

async function releasePollLock(taskId: string, token: string): Promise<void> {
  if (!process.env.REDIS_HOST?.trim()) {
    if (memoryLocks.get(taskId)?.token === token) memoryLocks.delete(taskId);
    return;
  }
  await getRedis().eval(
    RELEASE_LOCK_SCRIPT,
    1,
    taskKeys(taskId).lock,
    token
  );
}

async function resolveCapacityRoute(task: AsyncTask): Promise<ProviderCapacityRoute> {
  const stored = task.input?._route || {};
  const current = task.provider.includes(":")
    ? null
    : await getCapacity(task.provider, task.model);
  const managed = stored.managed === true || !!current;
  return {
    providerId: task.provider,
    managed,
    rpm: Number(current?.rpm_limit ?? stored.rpm ?? 0),
    tpm: Number(current?.tpm_limit ?? stored.tpm ?? 0),
    dailyLimit: Number(current?.daily_limit ?? stored.dailyLimit ?? 0),
    concurrentLimit: Number(
      current?.concurrent_limit ?? stored.concurrentLimit ?? 0
    ),
  };
}

/**
 * Bound task-status traffic before an upstream request is made. Every caller
 * consumes an actor/user/task request budget, while the short result cache and
 * distributed lock guarantee at most one active provider poll per task.
 */
export async function pollTaskWithControl(params: {
  task: AsyncTask;
  actorId: string;
  userId: string | null;
  poll: () => Promise<TaskResult>;
  capacityRoute?: ProviderCapacityRoute;
}): Promise<ControlledTaskPollResult> {
  const rateFailure = await reservePollRate(
    params.actorId,
    params.userId,
    params.task.id
  );
  if (rateFailure) return { ok: false, reason: rateFailure };

  const cached = await readCachedResult(params.task.id);
  if (cached === "control_store_unavailable") {
    return { ok: false, reason: cached };
  }
  if (cached) return { ok: true, state: "result", result: cached, source: "cache" };

  const lockToken = randomUUID();
  const lock = await acquirePollLock(params.task.id, lockToken);
  if (lock === "control_store_unavailable") {
    return { ok: false, reason: lock };
  }
  if (!lock) {
    // Close the small race where another worker populated the cache between
    // our first cache read and lock attempt.
    const secondRead = await readCachedResult(params.task.id);
    if (secondRead === "control_store_unavailable") {
      return { ok: false, reason: secondRead };
    }
    if (secondRead) {
      return { ok: true, state: "result", result: secondRead, source: "cache" };
    }
    return { ok: true, state: "in_flight" };
  }

  let capacityLease: Awaited<ReturnType<typeof acquireProviderCapacity>> | null = null;
  try {
    const route = params.capacityRoute || await resolveCapacityRoute(params.task);
    capacityLease = await acquireProviderCapacity(route, params.task.model, 0);
    if (!capacityLease.ok) {
      return {
        ok: false,
        reason: capacityLease.code,
      };
    }

    const result = await params.poll();
    try {
      await cachePollResult(params.task.id, result);
    } catch (error) {
      console.error(
        "[task-poll] result cache write failed:",
        error instanceof Error ? error.message : String(error)
      );
    }
    return { ok: true, state: "result", result, source: "upstream" };
  } finally {
    if (capacityLease?.ok) {
      await releaseProviderCapacity(capacityLease.lease, 0);
    }
    try {
      await releasePollLock(params.task.id, lockToken);
    } catch (error) {
      console.error(
        "[task-poll] lock release failed:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
