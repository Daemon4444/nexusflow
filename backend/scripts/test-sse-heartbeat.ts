import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { getSseHeartbeatIntervalMs, startSseHeartbeat } from "../src/utils/sse-heartbeat";

class FakeResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  flushed = false;
  writes: string[] = [];

  flushHeaders(): void { this.flushed = true; }
  write(chunk: string): boolean { this.writes.push(chunk); return true; }
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for heartbeat condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function run(): Promise<void> {
  const previous = process.env.SSE_HEARTBEAT_INTERVAL_MS;
  process.env.SSE_HEARTBEAT_INTERVAL_MS = "100";
  assert.equal(getSseHeartbeatIntervalMs(), 5_000);
  process.env.SSE_HEARTBEAT_INTERVAL_MS = "90000";
  assert.equal(getSseHeartbeatIntervalMs(), 45_000);
  if (previous === undefined) delete process.env.SSE_HEARTBEAT_INTERVAL_MS;
  else process.env.SSE_HEARTBEAT_INTERVAL_MS = previous;

  const response = new FakeResponse();
  const heartbeat = startSseHeartbeat(response, 10);
  assert.equal(response.flushed, true);
  await waitFor(() => response.writes.length >= 2);
  assert.ok(response.writes.length >= 2);
  assert.ok(response.writes.every((chunk) => chunk.startsWith(":")));
  heartbeat.write('data: {"partial"');
  const countAtPartial = response.writes.length;
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(response.writes.length, countAtPartial, "heartbeat must not split a partial SSE event");
  heartbeat.write(':true}\n\n');
  await waitFor(() => response.writes.length > countAtPartial + 1);
  assert.ok(response.writes.length > countAtPartial + 1, "heartbeat resumes at an event boundary");
  response.emit("finish");
  const countAtFinish = response.writes.length;
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(response.writes.length, countAtFinish);
  heartbeat.stop();
  console.log("sse-heartbeat-tests-passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
