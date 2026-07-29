import assert from "node:assert/strict";
import { closeDb, db } from "../src/db/client";
import { recordFailure } from "../src/services/scheduler";
import { logUsage } from "../src/data/usage";

async function main(): Promise<void> {
  await db.execute(
    `INSERT INTO providers (
       id, name, slug, api_base_url, api_key, contact_name, contact_email, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "provider-health-schema-test",
      "Provider Health Schema Test",
      "provider-health-schema-test",
      "https://example.invalid",
      "test-key",
      "Test",
      "test@example.invalid",
      "enabled",
    ]
  );

  await db.execute(
    `INSERT INTO provider_health (id, provider_id, model_id)
     VALUES (?, ?, ?)`,
    ["health-default-test", "provider-health-schema-test", "model-default"]
  );
  const defaultHealth = await db.queryOne<{ status: string }>(
    "SELECT status FROM provider_health WHERE id = ?",
    ["health-default-test"]
  );
  assert.equal(defaultHealth?.status, "unknown");

  await assert.rejects(() => db.execute(
    `INSERT INTO provider_health (id, provider_id, model_id, status)
     VALUES (?, ?, ?, ?)`,
    ["health-invalid-test", "provider-health-schema-test", "model-invalid", "invented"]
  ));

  await recordFailure("provider-health-schema-test", "model-failure", "first observed failure");
  let failureHealth = await db.queryOne<{ status: string; consecutive_failures: number }>(
    "SELECT status, consecutive_failures FROM provider_health WHERE provider_id = ? AND model_id = ?",
    ["provider-health-schema-test", "model-failure"]
  );
  assert.equal(failureHealth?.status, "degraded");
  assert.equal(Number(failureHealth?.consecutive_failures), 1);

  await recordFailure("provider-health-schema-test", "model-failure", "second observed failure");
  failureHealth = await db.queryOne<{ status: string; consecutive_failures: number }>(
    "SELECT status, consecutive_failures FROM provider_health WHERE provider_id = ? AND model_id = ?",
    ["provider-health-schema-test", "model-failure"]
  );
  assert.equal(failureHealth?.status, "degraded");
  assert.equal(Number(failureHealth?.consecutive_failures), 2);

  await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      recordFailure(
        "provider-health-schema-test",
        "model-concurrent-failure",
        `concurrent failure ${index + 1}`
      )
    )
  );
  const concurrentFailureHealth = await db.queryOne<{ status: string; consecutive_failures: number }>(
    "SELECT status, consecutive_failures FROM provider_health WHERE provider_id = ? AND model_id = ?",
    ["provider-health-schema-test", "model-concurrent-failure"]
  );
  assert.equal(Number(concurrentFailureHealth?.consecutive_failures), 10);
  assert.equal(concurrentFailureHealth?.status, "down");

  await logUsage({
    logId: "interrupted-stream-health-test",
    apiKeyId: null,
    model: "model-interrupted-stream",
    providerId: "provider-health-schema-test",
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    cost: 0,
    status: "error",
    latencyMs: 100,
    estimated: true,
    errorCode: "upstream_stream_interrupted",
    errorReason: "upstream_stream_interrupted",
  });
  const interruptedUsage = await db.queryOne<{ status: string; error_code: string }>(
    "SELECT status, error_code FROM usage_logs WHERE log_id = ?",
    ["interrupted-stream-health-test"]
  );
  assert.equal(interruptedUsage?.status, "error");
  assert.equal(interruptedUsage?.error_code, "upstream_stream_interrupted");
  const interruptedHealth = await db.queryOne<{ status: string; consecutive_failures: number }>(
    "SELECT status, consecutive_failures FROM provider_health WHERE provider_id = ? AND model_id = ?",
    ["provider-health-schema-test", "model-interrupted-stream"]
  );
  assert.equal(interruptedHealth?.status, "degraded");
  assert.equal(Number(interruptedHealth?.consecutive_failures), 1);

  await assert.rejects(() => db.execute(
    `INSERT INTO provider_sla_snapshots (
       id, provider_id, model_id, window_start, window_end,
       total_requests, success_requests, error_requests
     ) VALUES (?, ?, ?, NOW(), NOW(), ?, ?, ?)`,
    ["sla-missing-availability", "provider-health-schema-test", "model-default", 10, 9, 1]
  ));

  await assert.rejects(() => db.execute(
    `INSERT INTO provider_sla_snapshots (
       id, provider_id, model_id, window_start, window_end,
       total_requests, success_requests, error_requests, availability
     ) VALUES (?, ?, ?, NOW(), NOW(), ?, ?, ?, ?)`,
    ["sla-no-evidence", "provider-health-schema-test", "model-default", 0, 0, 0, 0]
  ));

  await db.execute(
    `INSERT INTO provider_sla_snapshots (
       id, provider_id, model_id, window_start, window_end,
       total_requests, success_requests, error_requests, availability
     ) VALUES (?, ?, ?, NOW(), NOW(), ?, ?, ?, ?)`,
    ["sla-valid", "provider-health-schema-test", "model-default", 10, 9, 1, 90]
  );

  console.log("provider health and SLA schema tests passed");
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
