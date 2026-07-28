#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  buildConnectionConfig,
  deterministicEventId,
  formatErrorForLog,
  parseCli,
  parseMetadata,
  recordDeploymentEvent,
  upsertRuntimeNode,
} from "./release-telemetry.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const NOW = new Date("2026-07-28T10:00:00.000Z");

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

function deploymentArgs(extra = []) {
  return [
    "deployment-event",
    "--release-id",
    "prod-20260728-001",
    "--sha",
    SHA,
    "--event-type",
    "started",
    ...extra,
  ];
}

function healthyNodeArgs(extra = []) {
  return [
    "runtime-node",
    "--node-id",
    "nexusflow-app-j",
    "--hostname",
    "nexusflow-app-j.internal",
    "--status",
    "healthy",
    "--backend-sha",
    SHA,
    "--frontend-build-id",
    SHA,
    "--postgres-status",
    "ok",
    "--redis-status",
    "ok",
    "--observed-at",
    NOW.toISOString(),
    ...extra,
  ];
}

test("parses a deployment event and derives a stable ID", () => {
  const first = parseCli(deploymentArgs(), NOW);
  const second = parseCli(deploymentArgs(), NOW);
  assert.equal(first.command, "deployment-event");
  assert.equal(first.value.eventId, second.value.eventId);
  assert.match(first.value.eventId, /^dep_[0-9a-f]{40}$/);
});

test("event identity changes only when its idempotency identity changes", () => {
  const base = {
    releaseId: "prod-20260728-001",
    environment: "production",
    eventType: "node_succeeded",
    nodeId: "nexusflow-app-j",
    idempotencyKey: "default",
  };
  assert.equal(deterministicEventId(base), deterministicEventId({ ...base }));
  assert.notEqual(
    deterministicEventId(base),
    deterministicEventId({ ...base, idempotencyKey: "retry-2" })
  );
});

test("requires node IDs only for node-scoped events", () => {
  assert.throws(
    () =>
      parseCli(
        deploymentArgs(["--event-type", "node_started"]),
        NOW
      ),
    /duplicate option/
  );
  const args = deploymentArgs();
  args[args.indexOf("started")] = "node_started";
  assert.throws(() => parseCli(args, NOW), /--node-id is required/);
  assert.throws(
    () => parseCli(deploymentArgs(["--node-id", "node-a"]), NOW),
    /only valid for node-scoped/
  );
});

test("rejects unknown and duplicate options", () => {
  assert.throws(() => parseCli(deploymentArgs(["--wat", "1"]), NOW), /unknown option/);
  assert.throws(
    () => parseCli(deploymentArgs(["--sha", SHA]), NOW),
    /duplicate option/
  );
});

test("rejects sensitive metadata keys without echoing values", () => {
  const secret = "do-not-log-this-value";
  for (const key of ["api_key", "db_password", "clientSecret", "session_token", "dsn"]) {
    assert.throws(
      () => parseMetadata(JSON.stringify({ nested: { [key]: secret } })),
      (error) =>
        !error.message.includes(secret) && /reserved for sensitive data/.test(error.message)
    );
  }
  assert.deepEqual(parseMetadata('{"artifact":"verified","checks":["postgres","redis"]}'), {
    artifact: "verified",
    checks: ["postgres", "redis"],
  });
});

test("healthy node facts require matching builds and healthy dependencies", () => {
  const parsed = parseCli(healthyNodeArgs(), NOW);
  assert.equal(parsed.value.status, "healthy");
  assert.equal(parsed.value.backendSha, SHA);

  const mismatched = healthyNodeArgs();
  mismatched[mismatched.indexOf(SHA, mismatched.indexOf(SHA) + 1)] =
    "89abcdef0123456789abcdef0123456789abcdef";
  assert.throws(() => parseCli(mismatched, NOW), /must equal/);

  const missingRedis = healthyNodeArgs();
  missingRedis.splice(missingRedis.indexOf("--redis-status"), 2);
  assert.throws(() => parseCli(missingRedis, NOW), /healthy nodes require/);
});

test("non-healthy nodes replace stale dependency health with unknown", () => {
  const parsed = parseCli(
    [
      "runtime-node",
      "--node-id",
      "node-a",
      "--hostname",
      "node-a.internal",
      "--status",
      "offline",
      "--observed-at",
      NOW.toISOString(),
    ],
    NOW
  );
  assert.equal(parsed.value.postgresStatus, "unknown");
  assert.equal(parsed.value.redisStatus, "unknown");
});

test("rejects stale-guard poisoning with a far-future observation", () => {
  const args = healthyNodeArgs();
  args[args.indexOf(NOW.toISOString())] = "2026-07-28T10:06:00.000Z";
  assert.throws(() => parseCli(args, NOW), /five minutes in the future/);
});

test("builds database config from URL or explicit PG fields", () => {
  const urlConfig = buildConnectionConfig({
    DATABASE_URL: "postgresql://user:password@db.internal:5432/nexusflow",
  });
  assert.equal(urlConfig.application_name, "nexusflow_release_telemetry");
  assert.equal(urlConfig.connectionTimeoutMillis, 10_000);

  const pgConfig = buildConnectionConfig({
    PG_HOST: "db.internal",
    PG_PORT: "5433",
    PG_USER: "nexusflow",
    PG_PASSWORD: "password",
    PG_DATABASE: "nexusflow",
  });
  assert.equal(pgConfig.host, "db.internal");
  assert.equal(pgConfig.port, 5433);
  assert.throws(() => buildConnectionConfig({}), /database configuration is missing/);
});

test("inserts a deployment event once", async () => {
  const parsed = parseCli(deploymentArgs(["--metadata-json", '{"artifact":"verified"}']), NOW);
  const calls = [];
  const client = {
    async query(text, params) {
      calls.push({ text, params });
      return { rows: [{ id: parsed.value.eventId }] };
    },
  };
  const result = await recordDeploymentEvent(client, parsed.value);
  assert.equal(result.outcome, "inserted");
  assert.match(calls[0].text, /ON CONFLICT \(id\) DO NOTHING/);
  assert.equal(calls[0].params[0], parsed.value.eventId);
});

test("accepts an exact deployment event retry and rejects conflicting facts", async () => {
  const parsed = parseCli(deploymentArgs(), NOW);
  let call = 0;
  const matchingClient = {
    async query() {
      call += 1;
      return call === 1 ? { rows: [] } : { rows: [{ matches: true }] };
    },
  };
  const result = await recordDeploymentEvent(matchingClient, parsed.value);
  assert.equal(result.outcome, "already-recorded");

  call = 0;
  const conflictingClient = {
    async query() {
      call += 1;
      return call === 1 ? { rows: [] } : { rows: [{ matches: false }] };
    },
  };
  await assert.rejects(
    () => recordDeploymentEvent(conflictingClient, parsed.value),
    /idempotency conflict/
  );
});

test("upserts node state, accepts exact retries, and ignores older observations", async () => {
  const parsed = parseCli(healthyNodeArgs(), NOW);
  let call = 0;
  const upsertClient = {
    async query(text) {
      call += 1;
      assert.match(text, /ON CONFLICT \(node_id\) DO UPDATE/);
      return { rows: [{ node_id: parsed.value.nodeId }] };
    },
  };
  const upserted = await upsertRuntimeNode(upsertClient, parsed.value);
  assert.equal(upserted.outcome, "upserted");
  assert.equal(call, 1);

  call = 0;
  const retryClient = {
    async query() {
      call += 1;
      return call === 1
        ? { rows: [] }
        : {
            rows: [
              {
                environment: "production",
                last_seen_at: parsed.value.observedAt,
                matches: true,
              },
            ],
          };
    },
  };
  const retry = await upsertRuntimeNode(retryClient, parsed.value);
  assert.equal(retry.outcome, "already-current");

  call = 0;
  const staleClient = {
    async query() {
      call += 1;
      return call === 1
        ? { rows: [] }
        : {
            rows: [
              {
                environment: "production",
                last_seen_at: "2026-07-28T10:01:00.000Z",
              },
            ],
          };
    },
  };
  const stale = await upsertRuntimeNode(staleClient, parsed.value);
  assert.equal(stale.outcome, "ignored-stale");
});

test("rejects different node facts at an existing observation timestamp", async () => {
  const parsed = parseCli(healthyNodeArgs(), NOW);
  let call = 0;
  const client = {
    async query() {
      call += 1;
      return call === 1
        ? { rows: [] }
        : {
            rows: [
              {
                environment: "production",
                last_seen_at: parsed.value.observedAt,
                matches: false,
              },
            ],
          };
    },
  };
  await assert.rejects(() => upsertRuntimeNode(client, parsed.value), /observation conflict/);
});

test("unexpected database errors never echo their messages", () => {
  const secret = "postgresql://user:password@private-host/database";
  const formatted = formatErrorForLog(Object.assign(new Error(secret), { code: "28P01" }));
  assert.equal(formatted, "database operation failed (code 28P01)");
  assert.ok(!formatted.includes(secret));
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}
console.log(`release telemetry tests passed (${passed}/${tests.length})`);
