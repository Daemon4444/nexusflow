import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createRuntimeLifecycle } from "../src/services/runtime-lifecycle";

async function main(): Promise<void> {
  const events: string[] = [];
  let closeCalls = 0;
  let closeIdleCalls = 0;
  let dependencyCloseCalls = 0;
  let telemetryFlushCalls = 0;
  const fakeServer = {
    close(callback: (error?: Error) => void) {
      closeCalls += 1;
      callback();
      return this;
    },
    closeIdleConnections() {
      closeIdleCalls += 1;
    },
  } as unknown as Server;

  const lifecycle = createRuntimeLifecycle({
    shutdownTimeoutMs: 10_000,
    closeDependencies: async () => { dependencyCloseCalls += 1; },
    flushTelemetry: async () => { telemetryFlushCalls += 1; },
    log: (message) => events.push(message),
  });

  assert.equal(lifecycle.phase(), "starting");
  assert.equal(lifecycle.isReady(), false);
  lifecycle.attachServer(fakeServer);
  lifecycle.markReady();
  assert.equal(lifecycle.phase(), "ready");
  assert.equal(lifecycle.isReady(), true);

  lifecycle.beginDrain("test-prestop");
  assert.equal(lifecycle.phase(), "draining");
  assert.equal(lifecycle.isReady(), false);

  const firstShutdown = lifecycle.shutdown("SIGTERM");
  const secondShutdown = lifecycle.shutdown("duplicate");
  assert.equal(firstShutdown, secondShutdown, "shutdown must be idempotent");
  await firstShutdown;

  assert.equal(lifecycle.phase(), "stopped");
  assert.equal(closeCalls, 1);
  assert.equal(closeIdleCalls, 1);
  assert.equal(dependencyCloseCalls, 1);
  assert.equal(telemetryFlushCalls, 1);
  assert(events.some((event) => event.includes("active connections drained")));
  console.log("runtime lifecycle drain checks passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
