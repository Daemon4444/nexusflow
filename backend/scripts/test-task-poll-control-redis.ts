import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  completeTask,
  createTask,
  failTask,
  getTaskById,
  setUpstreamTaskId,
  updateTaskStatus,
  type AsyncTask,
} from "../src/data/tasks";
import { closeDb } from "../src/db/client";
import { closeRedis } from "../src/services/redis";
import { pollTaskWithControl } from "../src/services/task-poll-control";

if (!process.env.REDIS_HOST || process.env.USE_PG_MEM !== "true") {
  throw new Error("test requires isolated Redis and USE_PG_MEM=true");
}

function fakeTask(overrides: Partial<AsyncTask> = {}): AsyncTask {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    user_id: "poll-user",
    api_key_id: "poll-api-key",
    type: "image",
    model: `poll-model-${randomUUID()}`,
    provider: `poll-provider-${randomUUID()}`,
    status: "running",
    input: {},
    output: null,
    upstream_task_id: randomUUID(),
    error_message: null,
    progress: 10,
    cost: 0,
    billing_reservation_id: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    ...overrides,
  };
}

const unmanaged = (providerId: string) => ({
  providerId,
  managed: false,
});

async function main(): Promise<void> {
  process.env.TASK_POLL_ACTOR_PER_MINUTE = "1000";
  process.env.TASK_POLL_USER_PER_MINUTE = "1000";
  process.env.TASK_POLL_TASK_PER_MINUTE = "1000";
  process.env.TASK_POLL_CACHE_SECONDS = "1";
  process.env.TASK_POLL_LOCK_SECONDS = "5";

  const task = fakeTask();
  let upstreamCalls = 0;
  const concurrent = await Promise.all(
    Array.from({ length: 20 }, () => pollTaskWithControl({
      task,
      actorId: "api-key:singleflight",
      userId: task.user_id,
      capacityRoute: unmanaged(task.provider),
      poll: async () => {
        upstreamCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 75));
        return { status: "running" as const, progress: 50 };
      },
    }))
  );
  assert.equal(upstreamCalls, 1, "concurrent requests must share one upstream poll");
  assert.equal(
    concurrent.filter((result) => result.ok && result.state === "result").length,
    1
  );
  assert.equal(
    concurrent.filter((result) => result.ok && result.state === "in_flight").length,
    19
  );

  const cached = await pollTaskWithControl({
    task,
    actorId: "api-key:singleflight",
    userId: task.user_id,
    capacityRoute: unmanaged(task.provider),
    poll: async () => {
      upstreamCalls += 1;
      return { status: "failed" as const };
    },
  });
  assert.equal(cached.ok && cached.state === "result" && cached.source, "cache");
  assert.equal(upstreamCalls, 1);

  await new Promise((resolve) => setTimeout(resolve, 1_100));
  const afterCache = await pollTaskWithControl({
    task,
    actorId: "api-key:singleflight",
    userId: task.user_id,
    capacityRoute: unmanaged(task.provider),
    poll: async () => {
      upstreamCalls += 1;
      return { status: "running" as const, progress: 60 };
    },
  });
  assert.equal(afterCache.ok && afterCache.state === "result", true);
  assert.equal(upstreamCalls, 2);

  // Cached reads still consume the public task budget, so cache cannot be
  // abused as an unlimited hot-key endpoint.
  process.env.TASK_POLL_TASK_PER_MINUTE = "2";
  const limitedTask = fakeTask();
  const firstLimited = await pollTaskWithControl({
    task: limitedTask,
    actorId: "api-key:task-limit",
    userId: limitedTask.user_id,
    capacityRoute: unmanaged(limitedTask.provider),
    poll: async () => ({ status: "pending" }),
  });
  const secondLimited = await pollTaskWithControl({
    task: limitedTask,
    actorId: "api-key:task-limit",
    userId: limitedTask.user_id,
    capacityRoute: unmanaged(limitedTask.provider),
    poll: async () => ({ status: "pending" }),
  });
  const thirdLimited = await pollTaskWithControl({
    task: limitedTask,
    actorId: "api-key:task-limit",
    userId: limitedTask.user_id,
    capacityRoute: unmanaged(limitedTask.provider),
    poll: async () => ({ status: "pending" }),
  });
  assert.equal(firstLimited.ok, true);
  assert.equal(secondLimited.ok, true);
  assert.deepEqual(thirdLimited, { ok: false, reason: "task_rate" });

  // A provider's managed RPM also applies to status requests. The first task
  // releases concurrency, but its upstream attempt remains in the RPM budget.
  process.env.TASK_POLL_TASK_PER_MINUTE = "1000";
  const managedProvider = `managed-poll-${randomUUID()}`;
  const managedModel = `managed-model-${randomUUID()}`;
  const managedRoute = {
    providerId: managedProvider,
    managed: true,
    rpm: 1,
    tpm: 0,
    dailyLimit: 0,
    concurrentLimit: 1,
  };
  const managedOne = fakeTask({ provider: managedProvider, model: managedModel });
  const managedTwo = fakeTask({ provider: managedProvider, model: managedModel });
  const firstManaged = await pollTaskWithControl({
    task: managedOne,
    actorId: "api-key:managed",
    userId: managedOne.user_id,
    capacityRoute: managedRoute,
    poll: async () => ({ status: "running" }),
  });
  assert.equal(firstManaged.ok, true);
  const secondManaged = await pollTaskWithControl({
    task: managedTwo,
    actorId: "api-key:managed",
    userId: managedTwo.user_id,
    capacityRoute: managedRoute,
    poll: async () => ({ status: "running" }),
  });
  assert.deepEqual(secondManaged, {
    ok: false,
    reason: "provider_capacity_exhausted",
  });

  // Task persistence is monotonic even when stale poll results race a terminal
  // completion.
  const stored = await createTask({
    type: "image",
    model: "monotonic-model",
    provider: "monotonic-provider",
    input: {},
  });
  await setUpstreamTaskId(stored.id, "upstream-monotonic");
  await updateTaskStatus(stored.id, "running", 60);
  await updateTaskStatus(stored.id, "pending", 10);
  const stillRunning = await getTaskById(stored.id);
  assert.equal(stillRunning?.status, "running");
  assert.equal(stillRunning?.progress, 60);

  await Promise.all([
    completeTask(stored.id, { results: [{ url: "https://example.test/result" }] }),
    updateTaskStatus(stored.id, "running", 70),
  ]);
  const terminal = await getTaskById(stored.id);
  assert.equal(terminal?.status, "succeeded");
  assert.equal(terminal?.progress, 100);
  assert.equal(await failTask(stored.id, "stale failure"), false);
  assert.equal(await updateTaskStatus(stored.id, "running", 90), false);

  // Production refuses to poll if the distributed control store is absent.
  const redisHost = process.env.REDIS_HOST;
  const nodeEnv = process.env.NODE_ENV;
  delete process.env.REDIS_HOST;
  process.env.NODE_ENV = "production";
  try {
    const unavailable = await pollTaskWithControl({
      task: fakeTask(),
      actorId: "api-key:no-store",
      userId: "poll-user",
      capacityRoute: unmanaged("no-store-provider"),
      poll: async () => ({ status: "running" }),
    });
    assert.deepEqual(unavailable, {
      ok: false,
      reason: "control_store_unavailable",
    });
  } finally {
    process.env.REDIS_HOST = redisHost;
    process.env.NODE_ENV = nodeEnv;
  }

  console.log("task poll rate, singleflight, capacity, and monotonic-state checks passed");
}

main()
  .then(async () => {
    await closeRedis();
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeRedis().catch(() => undefined);
    await closeDb();
    process.exit(1);
  });
