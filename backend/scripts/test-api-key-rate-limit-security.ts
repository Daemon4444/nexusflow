import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import keysRouter from "../src/routes/keys";
import {
  createApiKey,
  DEFAULT_SELF_SERVICE_API_KEY_RATE_LIMIT,
} from "../src/data/apikeys";
import { checkConsumerLimitsAsync } from "../src/services/rate-limiter";
import { closeDb, db } from "../src/db/client";

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/keys", keysRouter);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, message: error?.message || String(error) });
  });
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const create = async (body: unknown): Promise<{ status: number; body: any }> => {
    const response = await fetch(`${base}/api/keys`, {
      method: "POST",
      headers: {
        Authorization: "Bearer sess-local-test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    const before = Number((await db.queryOne<{ cnt: string | number }>(
      "SELECT COUNT(*) AS cnt FROM api_keys WHERE user_id = ?",
      ["local-user-1"]
    ))?.cnt || 0);

    // This is the exact contract emitted by the current dashboard.
    const dashboardRequest = await create({ name: "Dashboard key" });
    assert.equal(dashboardRequest.status, 200);
    assert.equal(dashboardRequest.body.data.rateLimit, null);
    assert.equal(dashboardRequest.body.data.rateLimitSource, "account_plan");
    const stored = await db.queryOne<{
      rate_limit: number | string;
      rate_limit_override: number | string | null;
    }>(
      "SELECT rate_limit, rate_limit_override FROM api_keys WHERE id = ?",
      [dashboardRequest.body.data.id]
    );
    // Legacy value remains populated only for rollback compatibility.
    assert.equal(Number(stored?.rate_limit), DEFAULT_SELF_SERVICE_API_KEY_RATE_LIMIT);
    assert.equal(stored?.rate_limit_override, null);

    const inherited = await checkConsumerLimitsAsync(dashboardRequest.body.data.id, null);
    assert.equal(inherited.allowed, true);
    assert.equal(inherited.remaining, null);

    const firstOverride = await checkConsumerLimitsAsync("explicit-override", 1);
    const secondOverride = await checkConsumerLimitsAsync("explicit-override", 1);
    assert.equal(firstOverride.allowed, true);
    assert.equal(secondOverride.allowed, false);
    assert.equal(secondOverride.scope, "api_key");

    const overrideAttempts = [
      { name: "negative", rateLimit: -1 },
      { name: "huge", rateLimit: 9_999_999 },
      { name: "string", rateLimit: "30000" },
      { name: "snake", rate_limit: 30_000 },
    ];
    for (const payload of overrideAttempts) {
      const response = await create(payload);
      assert.equal(response.status, 400);
      assert.equal(response.body.code, "rate_limit_managed_by_plan");
    }
    const concurrentOverrides = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        create({ name: `concurrent-override-${index}`, rateLimit: 30_000 })
      )
    );
    assert(concurrentOverrides.every((response) =>
      response.status === 400
      && response.body.code === "rate_limit_managed_by_plan"
    ));

    const after = Number((await db.queryOne<{ cnt: string | number }>(
      "SELECT COUNT(*) AS cnt FROM api_keys WHERE user_id = ?",
      ["local-user-1"]
    ))?.cnt || 0);
    assert.equal(after, before + 1);

    await assert.rejects(createApiKey("invalid-low", 0, "local-user-1"), RangeError);
    await assert.rejects(createApiKey("invalid-high", 30_001, "local-user-1"), RangeError);
    await assert.rejects(createApiKey("invalid-fraction", 1.5, "local-user-1"), RangeError);
    await assert.rejects(
      db.execute(
        `INSERT INTO api_keys (
           id, user_id, name, key, key_hash, rate_limit
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        ["invalid-db-rate", "local-user-1", "invalid", "invalid-db-rate", null, 0]
      )
    );

    console.log("API key rate-limit security checks passed");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
