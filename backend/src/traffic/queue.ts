/**
 * Async task queue (P4, D1). When NF_TRAFFIC_MODE=enforce finds no
 * capacity for a video task, the task is stored as `queued` instead of
 * failing. One process at a time (Redis leader lease) dispatches:
 *
 *   - strict FIFO per model: a head task that cannot get capacity blocks
 *     later tasks of the same model (no overtaking);
 *   - bounded: policy max_queue_depth per model, max_queued_per_user;
 *   - max_wait_s (default 1800): past the deadline the task fails and its
 *     billing hold is released.
 *
 * The worker also runs in legacy/shadow mode, but then only expires
 * deadlines, so rolling the flag back never strands a billing hold.
 */
import { db } from "../db/client";
import { createTask, failTask, getTaskById, setUpstreamTaskId, type AsyncTask } from "../data/tasks";
import { releaseReservation } from "../data/billing";
import { trafficMode } from "../config/feature-flags";
import { controlPlaneRuntime } from "../control-plane/runtime";
import { resolveUpstreamFromControlPlane } from "../services/upstream";
import { recordFailure, recordSuccess } from "../services/scheduler";
import { billAsyncError } from "../services/async-billing";
import { safeProviderFetch } from "../services/outbound-url-policy";
import { logToSLS } from "../services/sls";
import { getRedis } from "../services/redis";
import { resolveUpstreamAdapter, taskProtocolFor } from "../pipeline/adapters";
import { getProviderChannel } from "../data/provider-channels";
import { effectivePolicy, type EffectivePolicy } from "./policy";
import { controlPlaneRouteFor, scopesFor } from "./engine";
import { parseRetryAfter, recordUpstreamCooldown, releaseScopes, reserveScopes } from "./reservation";
import { adaptAsync, parseAsyncSubmit, type AsyncAdapterCall } from "./async-submit";

export type EnqueueResult =
  | { ok: true; task: AsyncTask; position: number }
  | { ok: false; reason: "queue_full" | "user_queue_full"; message: string };

export async function enqueueAsyncTask(params: {
  userId: string;
  apiKeyId: string | null;
  modelId: string;
  providerId: string;
  input: Record<string, unknown>;
  call: AsyncAdapterCall;
  billingReservationId: string | null;
  policy: EffectivePolicy;
  now?: Date;
}): Promise<EnqueueResult> {
  const depth = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM async_tasks WHERE status = 'queued' AND model = ?",
    [params.modelId]
  );
  if (Number(depth?.count || 0) >= params.policy.async.maxQueueDepth) {
    return { ok: false, reason: "queue_full", message: `The queue for model '${params.modelId}' is full.` };
  }
  const mine = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM async_tasks WHERE status = 'queued' AND user_id = ?",
    [params.userId]
  );
  if (Number(mine?.count || 0) >= params.policy.async.maxQueuedPerUser) {
    return {
      ok: false,
      reason: "user_queue_full",
      message: `At most ${params.policy.async.maxQueuedPerUser} tasks per account can wait in the queue.`,
    };
  }
  const task = await createTask({
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    type: "video",
    model: params.modelId,
    provider: params.providerId,
    input: params.input,
    billingReservationId: params.billingReservationId,
  });
  const now = params.now ?? new Date();
  const deadline = new Date(now.getTime() + params.policy.async.maxWaitS * 1000);
  await db.execute(
    `UPDATE async_tasks SET status = 'queued', queued_at = ?, queue_deadline_at = ?, queue_request = ?::jsonb, updated_at = ?
     WHERE id = ? AND status = 'pending'`,
    [now.toISOString(), deadline.toISOString(), JSON.stringify(params.call), now.toISOString(), task.id]
  );
  const queued = (await getTaskById(task.id))!;
  return { ok: true, task: queued, position: (await queuePosition(queued)) ?? 1 };
}

/** 1-based position among queued tasks of the same model, or null. */
export async function queuePosition(task: Pick<AsyncTask, "id" | "model" | "status"> & { queued_at?: unknown }): Promise<number | null> {
  if (task.status !== "queued" || !task.queued_at) return null;
  const queuedAt = new Date(task.queued_at as string).toISOString();
  const ahead = await db.queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM async_tasks
      WHERE status = 'queued' AND model = ? AND (queued_at < ? OR (queued_at = ? AND id < ?))`,
    [task.model, queuedAt, queuedAt, task.id]
  );
  return Number(ahead?.count || 0) + 1;
}

type LeaderLock = () => Promise<boolean>;

const LEADER_KEY = "nf:traffic:v1:queue-leader";

async function redisLeaderLock(): Promise<boolean> {
  if (!process.env.REDIS_HOST) return false;
  try {
    const result = await getRedis().set(LEADER_KEY, String(process.pid), "PX", 10_000, "NX");
    return result === "OK";
  } catch {
    return false;
  }
}

export interface QueueRunSummary {
  dispatched: string[];
  timedOut: string[];
  failed: string[];
  waiting: number;
}

/** One dispatch pass. Returns immediately when another process holds the lease. */
export async function processQueueOnce(options: { now?: Date; leaderLock?: LeaderLock } = {}): Promise<QueueRunSummary> {
  const summary: QueueRunSummary = { dispatched: [], timedOut: [], failed: [], waiting: 0 };
  const lock = options.leaderLock ?? redisLeaderLock;
  if (!(await lock())) return summary;
  const now = options.now ?? new Date();
  const rows = await db.queryMany<any>(
    "SELECT * FROM async_tasks WHERE status = 'queued' ORDER BY queued_at ASC, id ASC LIMIT 500"
  );
  const dispatch = trafficMode() === "enforce";
  const snapshot = dispatch ? controlPlaneRuntime.get() : null;
  const blocked = new Set<string>();
  for (const row of rows) {
    const deadline = row.queue_deadline_at ? new Date(row.queue_deadline_at).getTime() : 0;
    if (deadline && deadline <= now.getTime()) {
      const won = await failTask(row.id, "queue_timeout: no upstream capacity became available within the maximum wait");
      if (won) {
        if (row.billing_reservation_id) await releaseReservation(row.billing_reservation_id, "queue_timeout");
        summary.timedOut.push(row.id);
        logToSLS({ status: "rejected", model: row.model, errorCode: "queue_timeout", taskId: row.id });
      }
      continue;
    }
    if (!snapshot || blocked.has(row.model)) {
      summary.waiting += 1;
      continue;
    }
    const outcome = await dispatchQueued(row, snapshot);
    if (outcome === "dispatched") summary.dispatched.push(row.id);
    else if (outcome === "failed") summary.failed.push(row.id);
    else {
      blocked.add(row.model); // FIFO: nothing behind the head may overtake it
      summary.waiting += 1;
    }
  }
  return summary;
}

async function dispatchQueued(row: any, snapshot: NonNullable<ReturnType<typeof controlPlaneRuntime.get>>): Promise<"dispatched" | "failed" | "waiting"> {
  const userId: string | null = row.user_id;
  const resolved = await resolveUpstreamFromControlPlane(row.model, snapshot, { userId });
  if (!resolved.ok) return "waiting";
  const upstream = resolved.upstream;
  const route = controlPlaneRouteFor(snapshot, row.model, upstream.providerId);
  if (!route) return "waiting";
  const policy = effectivePolicy(snapshot, { modelId: row.model, kind: "async", userId });
  const lease = await reserveScopes({ scopes: scopesFor(snapshot, route, userId, policy), estimatedTokens: 0 });
  if (!lease.allowed) return "waiting";
  try {
    const input = typeof row.input === "string" ? JSON.parse(row.input || "{}") : row.input || {};
    input._route = {
      channelId: upstream.channelId,
      region: upstream.region,
      nativeBaseUrl: upstream.nativeBaseUrl,
      managed: upstream.managed,
      rpm: upstream.rpm,
      tpm: upstream.tpm,
      dailyLimit: upstream.dailyLimit,
      concurrentLimit: upstream.concurrentLimit,
    };
    const claimed = await db.execute(
      "UPDATE async_tasks SET status = 'pending', provider = ?, input = ?, updated_at = ? WHERE id = ? AND status = 'queued'",
      [upstream.providerId, JSON.stringify(input), new Date().toISOString(), row.id]
    );
    if (claimed === 0) return "dispatched"; // another worker or a cancel won
    const call: AsyncAdapterCall = typeof row.queue_request === "string" ? JSON.parse(row.queue_request) : row.queue_request;
    const channelAdapter = upstream.channelId
      ? (await getProviderChannel(upstream.providerId, upstream.channelId).catch(() => null))?.adapter ?? null
      : null;
    const protocol = taskProtocolFor(
      resolveUpstreamAdapter({ providerId: upstream.providerId, channelAdapter, baseUrl: upstream.nativeBaseUrl }).adapter
    );
    const started = Date.now();
    let outcome;
    try {
      const adapted = adaptAsync(call, upstream.apiKey, upstream.nativeBaseUrl);
      const response = await safeProviderFetch(adapted.url, {
        method: adapted.method,
        headers: adapted.headers,
        body: typeof adapted.body === "string" ? adapted.body : JSON.stringify(adapted.body),
      });
      if (response.status === 429) {
        await recordUpstreamCooldown(route.id, parseRetryAfter(response.headers.get("retry-after"), policy.chat.retryAfterS));
      }
      const data: any = await response.json().catch(() => ({}));
      outcome = parseAsyncSubmit(protocol, response.status, response.ok, data);
    } catch (error) {
      outcome = { ok: false as const, status: 500, message: error instanceof Error ? error.message : String(error) };
    }
    if (outcome.ok) {
      await setUpstreamTaskId(row.id, outcome.upstreamTaskId);
      void recordSuccess(upstream.providerId, row.model, Date.now() - started).catch(() => undefined);
      return "dispatched";
    }
    void recordFailure(upstream.providerId, row.model, outcome.message).catch(() => undefined);
    const won = await failTask(row.id, outcome.message);
    if (won) {
      await billAsyncError({ id: row.api_key_id, user_id: row.user_id }, row.model, Date.now() - started, row.billing_reservation_id);
    }
    return "failed";
  } finally {
    await releaseScopes({ scopes: lease.scopes, leaseId: lease.leaseId, actualTokens: 0 }).catch(() => undefined);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startQueueWorker(intervalMs = 3_000): void {
  if (timer) return;
  timer = setInterval(() => {
    void processQueueOnce().catch((error) => {
      console.error(`[queue] pass failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
}

export function stopQueueWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
