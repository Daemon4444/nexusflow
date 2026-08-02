import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import {
  createHealthCheckHandler,
  createLivenessHandler,
  createReadinessHandler,
  HEALTH_PATHS,
  LIVENESS_PATH,
  READINESS_PATH,
  type HealthCheckDependencies,
} from "../src/services/health-check";

type DependencyState = "ok" | "postgres_down" | "redis_down";

async function withHealthServer(
  state: DependencyState,
  run: (base: string) => Promise<void>
): Promise<void> {
  const dependencies: HealthCheckDependencies = {
    checkPostgres: async () => {
      if (state === "postgres_down") throw new Error("private postgres endpoint details");
      return 1;
    },
    checkRedis: async () => {
      if (state === "redis_down") throw new Error("private redis endpoint details");
      return "PONG";
    },
  };
  const failures: string[] = [];
  const app = express();
  app.get(
    [...HEALTH_PATHS],
    createHealthCheckHandler(dependencies, (message) => failures.push(message))
  );
  let ready = true;
  app.get(LIVENESS_PATH, createLivenessHandler());
  app.get(
    READINESS_PATH,
    createReadinessHandler(
      () => ready,
      dependencies,
      (message) => failures.push(message)
    )
  );
  app.post("/__test/drain", (_req, res) => {
    ready = false;
    res.status(204).end();
  });
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
    assert.equal(failures.length, state === "ok" ? 0 : HEALTH_PATHS.length + 2);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function assertState(state: DependencyState): Promise<void> {
  await withHealthServer(state, async (base) => {
    const responses = await Promise.all(
      HEALTH_PATHS.map(async (path) => {
        const response = await fetch(`${base}${path}`);
        return {
          path,
          status: response.status,
          body: await response.json() as Record<string, any>,
        };
      })
    );
    const expectedStatus = state === "ok" ? 200 : 503;
    for (const result of responses) {
      assert.equal(result.status, expectedStatus, `${result.path} status drifted`);
      assert.equal(result.body.status, state === "ok" ? "ok" : "degraded");
      assert.equal(typeof result.body.timestamp, "string");
      if (state === "ok") {
        assert.deepEqual(result.body.dependencies, { postgres: "ok", redis: "ok" });
      } else {
        assert(!("dependencies" in result.body));
        assert(!JSON.stringify(result.body).includes("private"));
      }
    }
    assert.deepEqual(
      { ...responses[0].body, timestamp: "<timestamp>" },
      { ...responses[1].body, timestamp: "<timestamp>" },
      "health compatibility paths must have identical semantics"
    );

    // The load-balancer drain contract remains a strict HEAD on /api/health.
    // Express reuses the GET handler while suppressing the response body.
    const head = await fetch(`${base}/api/health`, { method: "HEAD" });
    assert.equal(head.status, expectedStatus);
    assert.equal(await head.text(), "");

    const live = await fetch(`${base}${LIVENESS_PATH}`);
    assert.equal(live.status, 200, "liveness must not depend on PostgreSQL or Redis");

    const readyBeforeDrain = await fetch(`${base}${READINESS_PATH}`);
    assert.equal(readyBeforeDrain.status, expectedStatus);
    await fetch(`${base}/__test/drain`, { method: "POST" });
    const readyAfterDrain = await fetch(`${base}${READINESS_PATH}`);
    assert.equal(readyAfterDrain.status, 503);
    assert.equal((await readyAfterDrain.json() as any).status, "draining");
  });
}

async function main(): Promise<void> {
  await assertState("ok");
  await assertState("postgres_down");
  await assertState("redis_down");
  console.log("health compatibility dependency checks passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
