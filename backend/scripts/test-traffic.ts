/**
 * P4: NF_TRAFFIC_MODE — multi-scope reservation shared by several Redis
 * clients (processes), quota pools and fair share, chat failover and the
 * 429 capacity_exhausted formats (OpenAI + Anthropic) with Retry-After,
 * upstream 429 cooldown, async queue (FIFO, caps, timeout releasing the
 * hold, queue position), shadow logging, Redis-unavailable fail-closed,
 * policy-driven circuit and user defaults. Run via test-traffic-isolated.ts.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import Redis from "ioredis";

process.env.USE_PG_MEM = "true";
process.env.NODE_ENV = "test";
delete process.env.NF_CP_MODE;
delete process.env.NF_TRAFFIC_MODE;
delete process.env.PROVIDER_SECRET_KEY;
delete process.env.SLS_ACCESS_KEY_ID;
delete process.env.SLS_ACCESS_KEY_SECRET;
process.env.DASHSCOPE_API_KEY = "sk-upstream-dashscope-test";
process.env.ARK_API_KEY = "sk-upstream-ark-test";
process.env.PIXVERSE_API_KEY = "sk-upstream-pixverse-test";
process.env.UPLOAD_STORAGE = process.env.UPLOAD_STORAGE || "local";

/* eslint-disable @typescript-eslint/no-var-requires */
const reservation = require("../src/traffic/reservation") as typeof import("../src/traffic/reservation");
const policyModule = require("../src/traffic/policy") as typeof import("../src/traffic/policy");
const engine = require("../src/traffic/engine") as typeof import("../src/traffic/engine");
const queue = require("../src/traffic/queue") as typeof import("../src/traffic/queue");
const runtime = require("../src/control-plane/runtime") as typeof import("../src/control-plane/runtime");
const cli = require("../src/cli/control-plane-backfill") as typeof import("../src/cli/control-plane-backfill");
const shadow = require("../src/services/shadow") as typeof import("../src/services/shadow");
const scheduler = require("../src/services/scheduler") as typeof import("../src/services/scheduler");
const ratelimits = require("../src/data/ratelimits") as typeof import("../src/data/ratelimits");
const { ensureRoutingDefaults } = require("../src/services/providers") as typeof import("../src/services/providers");
const { ensureProvider } = require("../src/data/providers") as typeof import("../src/data/providers");
const { setOutboundTestTransport } = require("../src/services/outbound-url-policy") as typeof import("../src/services/outbound-url-policy");
const { createApp } = require("../src/app") as typeof import("../src/app");
const { db, closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const { closeRedis } = require("../src/services/redis") as typeof import("../src/services/redis");
/* eslint-enable @typescript-eslint/no-var-requires */

const redisA = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT), lazyConnect: false });
const redisB = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT), lazyConnect: false });

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// ------------------------------------------------------------ fake upstream

type Reply = { status: number; json: unknown; headers?: Record<string, string> };
let replies: Reply[] = [];
const calls: Array<{ url: string; auth: string }> = [];
setOutboundTestTransport(async (url, init) => {
  const headers = new Headers(init.headers || {});
  calls.push({ url: url.href, auth: headers.get("authorization") || headers.get("x-api-key") || "" });
  const reply = replies.shift() || { status: 599, json: { error: { message: "no reply queued" } } };
  return new Response(JSON.stringify(reply.json), {
    status: reply.status,
    headers: { "content-type": "application/json", ...(reply.headers || {}) },
  });
});

function chatCompletion() {
  return {
    id: "chatcmpl-1", object: "chat.completion", created: 1, model: "qwen-plus",
    choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
  };
}

let userSeq = 0;
async function createCaller(balance = 100) {
  userSeq += 1;
  const userId = `traffic-user-${userSeq}`;
  const apiKey = `sk-air-trf-${String(userSeq).padStart(4, "0")}-${"0".repeat(29)}`;
  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  await db.execute(
    "INSERT INTO users (id, email, nickname, balance, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
    [userId, `${userId}@traffic.test`, userId, balance]
  );
  await db.execute(
    "INSERT INTO api_keys (id, user_id, name, key, key_hash, created_at) VALUES (?, ?, 'traffic', ?, ?, NOW())",
    [`traffic-key-${userSeq}`, userId, `sk-air-trf-${userSeq}...masked`, keyHash]
  );
  return { userId, apiKey };
}

let baseUrl = "";
async function post(path: string, apiKey: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...extraHeaders },
    body: JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) as any };
}
async function get(path: string, apiKey: string) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${apiKey}` } });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

async function main(): Promise<void> {
  // ================================================ reservation primitives
  await redisA.flushall();
  const pool = { id: "pool:shared", rpm: 6, tpm: 0, concurrency: 0, daily: 0 };
  const routeA = { id: "route:a", rpm: 5, tpm: 0, concurrency: 0, daily: 0 };
  const routeB = { id: "route:b", rpm: 5, tpm: 0, concurrency: 0, daily: 0 };
  let admitted = 0;
  for (let index = 0; index < 10; index += 1) {
    // Alternate "processes" (Redis connections) and routes sharing one pool.
    reservation.setTrafficRedisClient(index % 2 ? redisB : redisA);
    const result = await reservation.reserveScopes({ scopes: [index % 2 ? routeB : routeA, pool], estimatedTokens: 0 });
    if (result.allowed) admitted += 1;
    else assert.equal(result.scope, "pool:shared", "the shared pool is the binding limit");
  }
  assert.equal(admitted, 6, "two processes together never exceed the shared pool");
  assert.equal(await redisA.zcard("nf:traffic:v1:route:a:rpm"), 3, "a denied reservation consumes nothing (atomic)");
  assert.equal(await redisA.zcard("nf:traffic:v1:route:b:rpm"), 3);

  // dry run evaluates without consuming
  await redisA.flushall();
  reservation.setTrafficRedisClient(redisA);
  const one = { id: "route:dry", rpm: 1, tpm: 0, concurrency: 0, daily: 0 };
  assert.equal((await reservation.reserveScopes({ scopes: [one], estimatedTokens: 0, dryRun: true })).allowed, true);
  assert.equal((await reservation.reserveScopes({ scopes: [one], estimatedTokens: 0, dryRun: true })).allowed, true);
  assert.equal((await reservation.reserveScopes({ scopes: [one], estimatedTokens: 0 })).allowed, true);
  const second = await reservation.reserveScopes({ scopes: [one], estimatedTokens: 0 });
  assert.deepEqual(second, { allowed: false, reason: "rpm", scope: "route:dry" });

  // concurrency is returned on release; TPM reconciles to actual usage
  const conc = { id: "route:conc", rpm: 0, tpm: 100, concurrency: 2, daily: 0 };
  const l1 = await reservation.reserveScopes({ scopes: [conc], estimatedTokens: 80 });
  assert.ok(l1.allowed);
  const denyTpm = await reservation.reserveScopes({ scopes: [conc], estimatedTokens: 30 });
  assert.equal(!denyTpm.allowed && denyTpm.reason, "tpm");
  await reservation.releaseScopes({ scopes: l1.scopes, leaseId: l1.leaseId, actualTokens: 10 });
  await reservation.releaseScopes({ scopes: l1.scopes, leaseId: l1.leaseId, actualTokens: 10 }); // idempotent
  const l2 = await reservation.reserveScopes({ scopes: [conc], estimatedTokens: 30 });
  const l3 = await reservation.reserveScopes({ scopes: [conc], estimatedTokens: 30 });
  assert.ok(l2.allowed && l3.allowed, "reconciled TPM frees the window");
  const l4 = await reservation.reserveScopes({ scopes: [conc], estimatedTokens: 1 });
  assert.equal(!l4.allowed && l4.reason, "concurrency");
  if (l2.allowed) await reservation.releaseScopes({ scopes: l2.scopes, leaseId: l2.leaseId, actualTokens: 30 });
  assert.equal((await reservation.reserveScopes({ scopes: [conc], estimatedTokens: 1 })).allowed, true);

  // Redis unavailable → fail closed
  reservation.setTrafficRedisClient({ eval: async () => { throw new Error("connection refused"); } });
  assert.deepEqual(
    await reservation.reserveScopes({ scopes: [one], estimatedTokens: 0 }),
    { allowed: false, reason: "redis_unavailable", scope: null }
  );
  reservation.setTrafficRedisClient(redisA);

  // Retry-After parsing and the shared cooldown
  assert.equal(reservation.parseRetryAfter("7", 5), 7);
  assert.equal(reservation.parseRetryAfter("0", 5), 1);
  assert.equal(reservation.parseRetryAfter("9999", 5), 300);
  assert.equal(reservation.parseRetryAfter(null, 5), 5);
  assert.equal(reservation.parseRetryAfter("soon", 5), 5);
  assert.equal(reservation.parseRetryAfter(new Date(Date.now() + 30_000).toUTCString(), 5) >= 29, true);
  await reservation.recordUpstreamCooldown("route:cool", 30);
  reservation.setTrafficRedisClient(redisB);
  assert.ok((await reservation.coolingRoutes(["route:cool", "route:warm"])).has("route:cool"), "cooldown is visible to other processes");
  assert.equal((await reservation.coolingRoutes(["route:warm"])).size, 0);
  reservation.setTrafficRedisClient(redisA);

  // ================================================== policies / fair share
  const pg = await ensureRoutingDefaults().then(() => cli.loadOnlineSources());
  const content = clone(cli.runBackfill(pg).content) as any;
  const global = content.policies.find((policy: any) => policy.scope === "global");
  content.policies.push(
    { id: "policy-qwen", scope: "model:qwen-plus", overflow: { chat: { behavior: "failover_then_reject", retry_after_s: 7 } } },
    { id: "policy-async", scope: "model_type:async", overflow: { async: { behavior: "queue", max_queue_depth: 5, max_wait_s: 1800, max_queued_per_user: 1 } } },
    { id: "policy-user", scope: "user:vip", user_default: { qpm: 123, tpm: 456 } }
  );
  global.circuit.threshold = 3;
  let snapshot = runtime.indexContent(1, "test", content);
  const qwenPolicy = policyModule.effectivePolicy(snapshot, { modelId: "qwen-plus", kind: "chat" });
  assert.equal(qwenPolicy.chat.retryAfterS, 7, "model policy overrides global");
  assert.equal(qwenPolicy.fairShare, 0.3);
  assert.equal(policyModule.effectivePolicy(snapshot, { userId: "vip" }).userDefault.qpm, 123);
  assert.equal(policyModule.effectivePolicy(null).userDefault.qpm, 30000, "built-in = production code default");
  assert.equal(policyModule.circuitCounts(qwenPolicy, 503), true);
  assert.equal(policyModule.circuitCounts(qwenPolicy, 429), true);
  assert.equal(policyModule.circuitCounts(qwenPolicy, 400), false);

  const fair = { ...clone(content.routes.find((route: any) => route.model_id === "qwen-plus")), quota_pool_id: null, rpm: 10 };
  const fairScopes = engine.scopesFor(snapshot, fair, "user-x", { ...qwenPolicy, fairShare: 0.5 });
  assert.deepEqual(fairScopes.map((scope) => scope.id), [`route:${fair.id}`, `share:route:${fair.id}:user-x`]);
  assert.equal(fairScopes[1].rpm, 5);
  await redisA.flushall();
  let heavy = 0;
  for (let index = 0; index < 8; index += 1) {
    if ((await reservation.reserveScopes({ scopes: fairScopes, estimatedTokens: 0 })).allowed) heavy += 1;
  }
  assert.equal(heavy, 5, "one user gets at most its fair share");
  const other = engine.scopesFor(snapshot, fair, "user-y", { ...qwenPolicy, fairShare: 0.5 });
  assert.equal((await reservation.reserveScopes({ scopes: other, estimatedTokens: 0 })).allowed, true, "others still get capacity");

  // circuit and user defaults read the policy only under enforce
  runtime.controlPlaneRuntime.install(snapshot);
  assert.equal(scheduler.circuitParams().threshold, 10);
  process.env.NF_TRAFFIC_MODE = "enforce";
  assert.equal(scheduler.circuitParams().threshold, 3);
  assert.equal(scheduler.classifyHealthOutcome({ status: "error", httpStatus: 400 }), "ignore");
  assert.equal((await ratelimits.getEffectiveRateLimit("vip", "qwen-plus")).qpm, 123);
  delete process.env.NF_TRAFFIC_MODE;
  assert.equal((await ratelimits.getEffectiveRateLimit("vip", "qwen-plus")).qpm, 30000);

  // ============================================== pipeline over real HTTP
  await ensureProvider({
    id: "dashscope-backup", name: "DashScope backup", slug: "dashscope-backup",
    api_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", api_key: "sk-upstream-backup-test", status: "enabled",
  });
  const primary = content.accounts.find((account: any) => account.id === "dashscope");
  content.accounts.push({ ...clone(primary), id: "dashscope-backup", legacy_provider_id: "dashscope-backup", secret_ref: "legacy_provider:dashscope-backup" });
  const qwenRoute = content.routes.find((route: any) => route.model_id === "qwen-plus");
  qwenRoute.rpm = 1;
  qwenRoute.quota_pool_id = null;
  content.routes.push({ ...clone(qwenRoute), id: "dashscope-backup:qwen-plus", account_id: "dashscope-backup", priority: qwenRoute.priority - 1 });
  const videoRoute = content.routes.find((route: any) => route.model_id === "wan2.7-t2v");
  videoRoute.rpm = 1;
  videoRoute.quota_pool_id = null;
  global.fair_share = { max_share_per_user: 1 };
  snapshot = runtime.indexContent(2, "test", content);
  runtime.controlPlaneRuntime.install(snapshot);
  process.env.NF_CP_MODE = "enforce";
  process.env.NF_TRAFFIC_MODE = "enforce";

  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  const chat = { model: "qwen-plus", messages: [{ role: "user", content: "hi" }] };
  const alice = await createCaller();

  // upstream 429 → the route cools down for Retry-After, shared in Redis
  await redisA.flushall();
  replies = [{ status: 429, json: { error: { message: "Throttling" } }, headers: { "retry-after": "30" } }];
  await post("/v1/chat/completions", alice.apiKey, chat);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok((await reservation.coolingRoutes([qwenRoute.id])).has(qwenRoute.id), "upstream 429 starts a cooldown");
  calls.length = 0;
  replies = [{ status: 200, json: chatCompletion() }];
  const cooled = await post("/v1/chat/completions", alice.apiKey, chat);
  assert.equal(cooled.status, 200);
  assert.equal(calls[0].auth, "Bearer sk-upstream-backup-test", "cooling route is skipped");

  // capacity failover, then 429 capacity_exhausted in the OpenAI format
  await redisA.flushall();
  calls.length = 0;
  replies = [{ status: 200, json: chatCompletion() }, { status: 200, json: chatCompletion() }];
  assert.equal((await post("/v1/chat/completions", alice.apiKey, chat)).status, 200);
  assert.equal((await post("/v1/chat/completions", alice.apiKey, chat)).status, 200);
  // The first pick depends on health scoring (the 429 above degraded the
  // primary); the second request must land on the other route.
  assert.deepEqual(calls.map((call) => call.auth).sort(), ["Bearer sk-upstream-backup-test", "Bearer sk-upstream-dashscope-test"], "full route fails over");
  const rejected = await post("/v1/chat/completions", alice.apiKey, chat);
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get("retry-after"), "7");
  assert.equal(rejected.body.error.type, "rate_limit_error");
  assert.equal(rejected.body.error.code, "capacity_exhausted");
  const anthropic = await post("/v1/messages", alice.apiKey, { model: "qwen-plus", max_tokens: 16, messages: [{ role: "user", content: "hi" }] }, { "anthropic-version": "2023-06-01" });
  assert.equal(anthropic.status, 429);
  assert.equal(anthropic.headers.get("retry-after"), "7");
  assert.deepEqual(Object.keys(anthropic.body).sort(), ["error", "type"]);
  assert.equal(anthropic.body.type, "error");
  assert.equal(anthropic.body.error.type, "rate_limit_error");
  assert.equal(calls.length, 2, "rejected requests never reach an upstream");

  // Redis unavailable → fail closed (503), no upstream call
  reservation.setTrafficRedisClient({ eval: async () => { throw new Error("down"); } } as any);
  const closed = await post("/v1/chat/completions", alice.apiKey, chat);
  assert.equal(closed.status, 503);
  assert.equal(closed.body.error.code, "provider_capacity_store_unavailable");
  reservation.setTrafficRedisClient(redisA);

  // ======================================================= async queue
  await redisA.flushall();
  const bob = await createCaller();
  const carol = await createCaller();
  const task = { model: "wan2.7-t2v", input: { prompt: "a cat" }, parameters: { duration: 5, size: "1280*720" } };
  replies = [{ status: 200, json: { output: { task_id: "up-1", task_status: "PENDING" } } }];
  const first = await post("/v1/tasks", alice.apiKey, task);
  assert.equal(first.status, 202);
  assert.equal(first.body.status, "running");
  const queuedBob = await post("/v1/tasks", bob.apiKey, task);
  assert.equal(queuedBob.status, 202);
  assert.equal(queuedBob.body.status, "queued");
  assert.equal(queuedBob.body.queue_position, 1);
  const queuedCarol = await post("/v1/tasks", carol.apiKey, task);
  assert.equal(queuedCarol.body.queue_position, 2);
  const capped = await post("/v1/tasks", bob.apiKey, task);
  assert.equal(capped.status, 429, "per-user queue cap");
  assert.equal(capped.body.error.code, "user_queue_full");
  const polled = await get(`/v1/tasks/${queuedCarol.body.id}`, carol.apiKey);
  assert.equal(polled.body.status, "queued");
  assert.equal(polled.body.queue_position, 2);
  const bobHold = await db.queryOne<any>(
    "SELECT r.status FROM async_tasks t JOIN billing_reservations r ON r.id = t.billing_reservation_id WHERE t.id = ?",
    [queuedBob.body.id]
  );
  assert.equal(bobHold.status, "active", "a queued task keeps its billing hold");

  const lock = async () => true;
  let pass = await queue.processQueueOnce({ leaderLock: lock });
  assert.deepEqual(pass.dispatched, [], "no capacity yet");
  assert.equal(pass.waiting, 2);
  await redisA.flushall();
  replies = [{ status: 200, json: { output: { task_id: "up-bob", task_status: "PENDING" } } }];
  pass = await queue.processQueueOnce({ leaderLock: lock });
  assert.deepEqual(pass.dispatched, [queuedBob.body.id], "FIFO: the head is dispatched, the next waits for capacity");
  assert.equal(pass.waiting, 1);
  const bobRow = await db.queryOne<any>("SELECT status, upstream_task_id FROM async_tasks WHERE id = ?", [queuedBob.body.id]);
  assert.deepEqual({ ...bobRow }, { status: "running", upstream_task_id: "up-bob" });
  assert.equal((await get(`/v1/tasks/${queuedCarol.body.id}`, carol.apiKey)).body.queue_position, 1);

  // timeout: the task fails and the hold is released
  pass = await queue.processQueueOnce({ leaderLock: lock, now: new Date(Date.now() + 1801_000) });
  assert.deepEqual(pass.timedOut, [queuedCarol.body.id]);
  const carolRow = await db.queryOne<any>(
    "SELECT t.status, t.error_message, r.status AS hold FROM async_tasks t JOIN billing_reservations r ON r.id = t.billing_reservation_id WHERE t.id = ?",
    [queuedCarol.body.id]
  );
  assert.equal(carolRow.status, "failed");
  assert.match(carolRow.error_message, /queue_timeout/);
  assert.equal(carolRow.hold, "released");
  assert.equal((await queue.processQueueOnce({ leaderLock: async () => false })).dispatched.length, 0, "only the lease holder dispatches");

  // =============================================================== shadow
  await redisA.flushall();
  process.env.NF_TRAFFIC_MODE = "shadow";
  const counts = new Map<string, number>();
  shadow.setShadowCounterClient({ incr: async (key: string) => { counts.set(key, (counts.get(key) || 0) + 1); return counts.get(key)!; }, expire: async () => 1 });
  // Saturate both qwen-plus routes in the new scopes; legacy still admits.
  await reservation.reserveScopes({ scopes: engine.scopesFor(snapshot, snapshot.routesByModel.get("qwen-plus")![0], null, policyModule.effectivePolicy(snapshot)), estimatedTokens: 0 });
  await reservation.reserveScopes({ scopes: engine.scopesFor(snapshot, snapshot.routesByModel.get("qwen-plus")![1], null, policyModule.effectivePolicy(snapshot)), estimatedTokens: 0 });
  const dave = await createCaller();
  await reservation.reserveScopes({ scopes: [{ id: `share:route:${qwenRoute.id}:${dave.userId}`, rpm: 1, tpm: 0, concurrency: 0, daily: 0 }], estimatedTokens: 0 });
  replies = [{ status: 200, json: chatCompletion() }];
  const shadowed = await post("/v1/chat/completions", dave.apiKey, chat);
  assert.equal(shadowed.status, 200, "shadow never changes the decision");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(counts.get(shadow.shadowCounterKey("traffic")), 1, "the would-be 429 is counted");
  shadow.setShadowCounterClient(undefined);

  delete process.env.NF_TRAFFIC_MODE;
  delete process.env.NF_CP_MODE;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log("traffic tests passed");
}

main()
  .then(async () => {
    redisA.disconnect();
    redisB.disconnect();
    await closeRedis().catch(() => undefined);
    await closeDb().catch(() => undefined);
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    redisA.disconnect();
    redisB.disconnect();
    await closeRedis().catch(() => undefined);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
