// Offline tests for scripts/load-test.mjs: argument guards, cost ceiling,
// stop rules, and a real run against a local mock of /v1/chat/completions.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  errorKey,
  estimateMaxCost,
  isLocalHost,
  parseArgs,
  parseStages,
  readKeyFile,
  runStage,
  shouldStop,
  summarizeStage,
} from "./load-test.mjs";

assert.deepEqual(parseStages("5x100, 20x500"), [{ concurrency: 5, requests: 100 }, { concurrency: 20, requests: 500 }]);
assert.throws(() => parseStages("5*100"), /bad stage/);
assert.throws(() => parseStages("10x5"), /requests must be/);
assert.throws(() => parseStages("501x1000"), /concurrency/);
assert.throws(() => parseArgs(["--model", "m", "--stages", "1x1"]), /required/);
assert.throws(() => parseArgs(["--model", "m", "--key-file", "k", "--stages", "1x1", "--max-tokens", "1000"]), /max-tokens/);
assert.throws(() => parseArgs(["--bogus"]), /unknown argument/);
assert.equal(isLocalHost("http://127.0.0.1:3001"), true);
assert.equal(isLocalHost("https://nexusflow.hk"), false);

// 1100 requests x (80 x ¥1 + 8 x ¥4) per million tokens.
const cost = estimateMaxCost({ promptPrice: 1, completionPrice: 4 }, parseStages("5x100,50x1000"), 8);
assert.equal(Number(cost.toFixed(6)), 0.1232);
assert.equal(estimateMaxCost({ promptPrice: null, completionPrice: null }, parseStages("1x1"), 8), null);

assert.equal(errorKey(503, JSON.stringify({ error: { code: "provider_capacity_exhausted" } })), "503:provider_capacity_exhausted");
assert.equal(errorKey(500, "upstream exploded"), "500:upstream exploded");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nf-load-test-"));
const keyFile = path.join(dir, "key");
const key = `sk-air-${"a".repeat(48)}`;
fs.writeFileSync(keyFile, key, { mode: 0o644 });
assert.throws(() => readKeyFile(keyFile), /chmod 600/);
fs.chmodSync(keyFile, 0o600);
assert.equal(readKeyFile(keyFile), key);

const stage = { concurrency: 2, requests: 10 };
const ok = (extra = {}) => ({ status: "200", ok: true, stream: false, done: false, error: null, ms: 10, ...extra });
const capacity = { status: "503", ok: false, stream: false, done: false, error: "503:provider_capacity_exhausted", ms: 2 };
const s1 = summarizeStage(stage, [...Array(8).fill(ok()), capacity, capacity], 1000);
assert.equal(s1.capacityRejects, 2);
assert.equal(s1.unexpectedErrors, 0);
assert.equal(s1.rps, 10);
assert.equal(shouldStop(s1, { expectCapacityRejects: true, stopErrorRate: 0.02 }), null);
assert.match(shouldStop(s1, { expectCapacityRejects: false, stopErrorRate: 0.02 }), /error rate/);
const s2 = summarizeStage(stage, [ok({ stream: true, done: false }), ...Array(9).fill(ok())], 1000);
assert.equal(shouldStop(s2, { expectCapacityRejects: false, stopErrorRate: 0.5 }), "stream ended without [DONE]");

// End to end against a local mock: every 5th request is a capacity reject,
// streams end with [DONE], and the key is sent as a bearer token.
let seen = 0;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    assert.equal(req.headers.authorization, `Bearer ${key}`);
    seen += 1;
    if (seen % 5 === 0) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "provider_capacity_exhausted" } }));
      return;
    }
    if (JSON.parse(body).stream) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end('data: {"choices":[]}\n\ndata: [DONE]\n\n');
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 5, completion_tokens: 1 } }));
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const summary = await runStage({ model: "mock", maxTokens: 8, streamRatio: 0.5, baseUrl }, key, { concurrency: 4, requests: 20 });
assert.equal(summary.codes["200"], 16);
assert.equal(summary.capacityRejects, 4);
assert.equal(summary.unexpectedErrors, 0);
assert.equal(summary.streamIntegrityOk, true);

// The CLI refuses a non-local host without --confirm-production before reading anything.
const refused = spawnSync(process.execPath, [path.join(import.meta.dirname, "load-test.mjs"), "--model", "m", "--key-file", keyFile, "--stages", "1x1", "--base-url", "https://nexusflow.hk"], { encoding: "utf8" });
assert.equal(refused.status, 1);
assert.match(refused.stderr, /confirm-production/);

server.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log("load-test script tests passed");
