import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ApiKeyLimitError,
  createApiKey,
  createSelfServiceApiKey,
  getKeysByUser,
  validateApiKey,
} from "../src/data/apikeys";
import {
  createRateLimitRequest,
  getRateLimitRequestsPage,
  RateLimitRequestLimitError,
} from "../src/data/rate-limit-requests";
import {
  createTicket,
  getAdminTicketsPage,
  getUserTickets,
  TicketLimitError,
} from "../src/data/tickets";
import { closeDb, db } from "../src/db/client";
import { closeRedis } from "../src/services/redis";
import { reservePersistentWrite } from "../src/services/control-plane-write-admission";

if (!process.env.REDIS_HOST || process.env.USE_PG_MEM !== "true") {
  throw new Error("test requires isolated Redis and USE_PG_MEM=true");
}

async function addUser(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, status, created_at, updated_at
     ) VALUES (?, ?, ?, 0, 0, 'active', ?, ?)`,
    [id, `${id}@nexusflow.test`, id, now, now]
  );
}

async function main(): Promise<void> {
  process.env.CONTROL_WRITE_WINDOW_SECONDS = "60";
  process.env.CONTROL_WRITE_RATE_LIMIT_REQUEST_USER_PER_WINDOW = "2";
  process.env.CONTROL_WRITE_RATE_LIMIT_REQUEST_IP_PER_WINDOW = "10";
  process.env.CONTROL_WRITE_RATE_LIMIT_REQUEST_GLOBAL_PER_WINDOW = "100";

  const writeUser = `write-${randomUUID()}`;
  assert.deepEqual(
    await reservePersistentWrite({
      kind: "rate_limit_request",
      userId: writeUser,
      clientIp: "203.0.113.10",
    }),
    { allowed: true }
  );
  assert.deepEqual(
    await reservePersistentWrite({
      kind: "rate_limit_request",
      userId: writeUser,
      clientIp: "203.0.113.10",
    }),
    { allowed: true }
  );
  const writeRejected = await reservePersistentWrite({
    kind: "rate_limit_request",
    userId: writeUser,
    clientIp: "203.0.113.10",
  });
  assert.equal(writeRejected.allowed, false);
  if (!writeRejected.allowed) assert.equal(writeRejected.reason, "user_rate");

  const rateUser = `rate-${randomUUID()}`;
  await addUser(rateUser);
  await createRateLimitRequest({
    userId: rateUser,
    model: "model-a",
    requestedQpm: 100,
    requestedTpm: 10_000,
    reason: "capacity planning",
  });
  await assert.rejects(
    createRateLimitRequest({
      userId: rateUser,
      model: "model-a",
      requestedQpm: 200,
      requestedTpm: 20_000,
    }),
    (error: unknown) => (
      error instanceof RateLimitRequestLimitError
      && error.code === "pending_request_exists"
    )
  );
  for (const model of ["model-b", "model-c", "model-d", "model-e"]) {
    await createRateLimitRequest({
      userId: rateUser,
      model,
      requestedQpm: 100,
      requestedTpm: 10_000,
    });
  }
  await assert.rejects(
    createRateLimitRequest({
      userId: rateUser,
      model: "model-f",
      requestedQpm: 100,
      requestedTpm: 10_000,
    }),
    (error: unknown) => (
      error instanceof RateLimitRequestLimitError
      && error.code === "pending_request_limit"
    )
  );
  const requestsPage = await getRateLimitRequestsPage({
    userId: rateUser,
    limit: 2,
    offset: 0,
  });
  assert.equal(requestsPage.items.length, 2);
  assert.equal(requestsPage.total, 5);

  await assert.rejects(
    db.execute(
      `INSERT INTO rate_limit_requests (
         id, user_id, model, requested_qpm, requested_tpm, reason
       ) VALUES (?, ?, ?, 1, 1, '')`,
      [randomUUID(), rateUser, "x".repeat(129)]
    )
  );

  const ticketUser = `ticket-${randomUUID()}`;
  await addUser(ticketUser);
  for (let index = 0; index < 5; index += 1) {
    await createTicket({
      userId: ticketUser,
      type: "support",
      subject: `Support ticket ${index}`,
      description: `This is a bounded support ticket description number ${index}.`,
    });
  }
  await assert.rejects(
    createTicket({
      userId: ticketUser,
      type: "support",
      subject: "Support ticket overflow",
      description: "This support ticket must be rejected by the open-ticket cap.",
    }),
    (error: unknown) => (
      error instanceof TicketLimitError && error.code === "open_ticket_limit"
    )
  );
  assert.equal((await getUserTickets(ticketUser, 2)).length, 2);
  const ticketPage = await getAdminTicketsPage({
    query: ticketUser,
    limit: 2,
  });
  assert.equal(ticketPage.items.length, 2);
  assert.equal(ticketPage.total, 5);

  const keyUser = `key-${randomUUID()}`;
  await addUser(keyUser);
  for (let index = 0; index < 10; index += 1) {
    await createSelfServiceApiKey(`Key ${index}`, keyUser);
  }
  await assert.rejects(
    createSelfServiceApiKey("Key overflow", keyUser),
    (error: unknown) => (
      error instanceof ApiKeyLimitError && error.code === "api_key_limit"
    )
  );
  assert.equal((await getKeysByUser(keyUser)).length, 10);

  // Repeated successful credential checks no longer create one PostgreSQL
  // UPDATE per request. The Redis sample window admits only one telemetry
  // write for the same key.
  process.env.API_KEY_USAGE_SAMPLE_SECONDS = "60";
  const sampled = await createApiKey("Sampled usage", 60, keyUser);
  await Promise.all(
    Array.from({ length: 50 }, () => validateApiKey(sampled.key))
  );
  const sampledRow = await db.queryOne<{
    usage_count: number;
    last_used: string | null;
  }>(
    "SELECT usage_count, last_used FROM api_keys WHERE id = ?",
    [sampled.id]
  );
  assert.equal(Number(sampledRow?.usage_count), 1);
  assert(sampledRow?.last_used);

  // Production never falls back to per-request PostgreSQL writes if the
  // distributed write-admission store is missing.
  const redisHost = process.env.REDIS_HOST;
  const nodeEnv = process.env.NODE_ENV;
  delete process.env.REDIS_HOST;
  process.env.NODE_ENV = "production";
  try {
    const unavailable = await reservePersistentWrite({
      kind: "ticket",
      userId: "prod-user",
      clientIp: "203.0.113.20",
    });
    assert.equal(unavailable.allowed, false);
    if (!unavailable.allowed) assert.equal(unavailable.reason, "redis_unavailable");
  } finally {
    process.env.REDIS_HOST = redisHost;
    process.env.NODE_ENV = nodeEnv;
  }

  console.log("control-plane write budgets, hard caps, pagination, and sampled API-key usage checks passed");
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
