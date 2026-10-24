/**
 * WebSocket real-time ASR: real Express app + http server + pg-mem, with a
 * local WebSocket server standing in for Bailian's /api-ws/v1/inference.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";

process.env.USE_PG_MEM = "true";
process.env.NODE_ENV = "test";
process.env.DASHSCOPE_API_KEY = "sk-upstream-dashscope-test";
process.env.NF_PROVIDER_CAPACITY_WAIT_MS = "0";
delete process.env.SLS_ACCESS_KEY_ID;
delete process.env.SLS_ACCESS_KEY_SECRET;
delete process.env.PROVIDER_SECRET_KEY;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require("../src/app") as typeof import("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db, closeDb } = require("../src/db/client") as typeof import("../src/db/client");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { attachAsrStreamServer, setAsrStreamUpstreamFactory } = require("../src/routes/audio-stream") as typeof import("../src/routes/audio-stream");

const MODEL = "qwen-audio-3.1-asr-flash-streaming";

async function makeCaller(id: string, balance: number) {
  const apiKey = `sk-air-ws-${id}-${"0".repeat(28)}`;
  await db.execute(`INSERT INTO users (id, email, nickname, balance, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`, [`ws-user-${id}`, `${id}@ws.test`, id, balance]);
  await db.execute(`INSERT INTO api_keys (id, user_id, name, key, key_hash, created_at) VALUES (?, ?, 'ws', ?, ?, NOW())`,
    [`ws-key-${id}`, `ws-user-${id}`, `masked-${id}`, crypto.createHash("sha256").update(apiKey).digest("hex")]);
  return { userId: `ws-user-${id}`, apiKey };
}

type Seen = { auth?: string; runTask?: any; audioBytes: number; finish: boolean };

/** Fake Bailian: task-started, one partial result per 2 audio frames, final on finish-task. */
async function startFakeUpstream(opts: { failOnStart?: boolean; usageEvery?: { input: number; output: number } } = {}) {
  const seen: Seen = { audioBytes: 0, finish: false };
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  wss.on("connection", (ws, req) => {
    seen.auth = String(req.headers.authorization || "");
    let frames = 0;
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        seen.audioBytes += (data as Buffer).length;
        frames += 1;
        const per = opts.usageEvery || { input: 20, output: 2 };
        ws.send(JSON.stringify({
          header: { task_id: seen.runTask.header.task_id, event: "result-generated", attributes: {} },
          payload: { output: { sentence: { text: "你好".repeat(1), sentence_end: false, sentence_id: 1 } },
            usage: { duration: frames, input_tokens: per.input * frames, output_tokens: per.output * frames, total_tokens: (per.input + per.output) * frames } },
        }));
        return;
      }
      const message = JSON.parse(data.toString());
      if (message.header.action === "run-task") {
        seen.runTask = message;
        if (opts.failOnStart) {
          ws.send(JSON.stringify({ header: { task_id: message.header.task_id, event: "task-failed", error_code: "InvalidParameter", error_message: "bad format" }, payload: {} }));
          return;
        }
        ws.send(JSON.stringify({ header: { task_id: message.header.task_id, event: "task-started", attributes: {} }, payload: {} }));
      } else if (message.header.action === "finish-task") {
        seen.finish = true;
        const per = opts.usageEvery || { input: 20, output: 2 };
        ws.send(JSON.stringify({ header: { task_id: seen.runTask.header.task_id, event: "task-finished", attributes: {} },
          payload: { output: {}, usage: { duration: frames, input_tokens: per.input * frames, output_tokens: per.output * frames, total_tokens: (per.input + per.output) * frames } } }));
      }
    });
  });
  await new Promise((resolve) => wss.once("listening", resolve));
  return { wss, seen, port: (wss.address() as any).port as number };
}

function connect(port: number, apiKey: string | null, path = "/api-ws/v1/inference") {
  return new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
}

const runTask = (model = MODEL, extra: Record<string, unknown> = {}) => JSON.stringify({
  header: { action: "run-task", task_id: crypto.randomUUID(), streaming: "duplex" },
  payload: { task_group: "audio", task: "asr", function: "recognition", model, parameters: { format: "pcm", sample_rate: 16000, language_hints: ["zh"], ...extra }, input: {} },
});

async function collect(ws: WebSocket, script: (ws: WebSocket, events: any[]) => void, timeoutMs = 5000): Promise<{ events: any[]; code: number }> {
  return new Promise((resolve, reject) => {
    const events: any[] = [];
    const timer = setTimeout(() => reject(new Error("timeout; events=" + JSON.stringify(events))), timeoutMs);
    ws.on("open", () => script(ws, events));
    ws.on("message", (data, isBinary) => { if (!isBinary) events.push(JSON.parse(data.toString())); });
    ws.on("close", (code) => { clearTimeout(timer); resolve({ events, code }); });
    ws.on("unexpected-response", (_req, res) => { clearTimeout(timer); resolve({ events: [{ http: res.statusCode }], code: -1 }); });
    ws.on("error", () => undefined);
  });
}

async function main() {
  const app = createApp();
  const server: http.Server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  attachAsrStreamServer(server);
  const port = (server.address() as any).port as number;

  const fake = await startFakeUpstream();
  setAsrStreamUpstreamFactory((_url, headers) => new WebSocket(`ws://127.0.0.1:${fake.port}`, { headers }));
  await db.execute("DELETE FROM provider_health");

  try {
    // 1. auth: no key / bad key / wrong path
    assert.equal((await collect(connect(port, null), () => undefined)).events[0].http, 401);
    assert.equal((await collect(connect(port, "sk-air-nope"), () => undefined)).events[0].http, 401);
    assert.equal((await collect(connect(port, "x", "/nope"), () => undefined)).events[0].http, 404);

    // 2. happy path: audio in, partial results out, finish-task, billed from cumulative usage
    const a = await makeCaller("a", 10);
    let started = false;
    const happy = await collect(connect(port, a.apiKey), (ws, events) => {
      ws.send(runTask());
      ws.on("message", (data, isBinary) => {
        if (isBinary) return;
        const event = JSON.parse(data.toString());
        if (event.header.event === "task-started" && !started) {
          started = true;
          ws.send(Buffer.alloc(3200));
          ws.send(Buffer.alloc(3200));
          ws.send(Buffer.alloc(3200));
          setTimeout(() => ws.send(JSON.stringify({ header: { action: "finish-task", task_id: "x", streaming: "duplex" }, payload: { input: {} } })), 100);
        }
      });
    });
    const names = happy.events.map((e) => e.header.event);
    assert.equal(names[0], "task-started");
    assert.equal(names.filter((n) => n === "result-generated").length, 3);
    assert.equal(names[names.length - 1], "task-finished");
    assert.equal(fake.seen.auth, "Bearer sk-upstream-dashscope-test");
    assert.equal(fake.seen.runTask.payload.model, MODEL);
    assert.deepEqual(fake.seen.runTask.payload.parameters.language_hints, ["zh"]);
    assert.equal(fake.seen.audioBytes, 9600);
    await new Promise((r) => setTimeout(r, 300));
    const log = await db.queryOne<any>("SELECT * FROM usage_logs WHERE user_id = ? ORDER BY id DESC", [a.userId]);
    assert.equal(log.status, "success");
    assert.equal(log.protocol, "dashscope-asr-websocket");
    assert.equal(Number(log.prompt_tokens), 60);
    assert.equal(Number(log.completion_tokens), 6);
    const expected = (60 * 6 + 6 * 4.5) / 1_000_000;
    assert.ok(Math.abs(Number(log.cost) - expected) < 1e-6, `cost ${log.cost} vs ${expected}`);
    const balance = await db.queryOne<{ balance: string }>("SELECT balance FROM users WHERE id = ?", [a.userId]);
    assert.ok(Math.abs(10 - Number(balance!.balance) - expected) < 1e-6);
    const holds = await db.queryMany<any>("SELECT status FROM billing_reservations WHERE user_id = ?", [a.userId]);
    assert.deepEqual(holds.map((h) => h.status), ["settled"]);

    // 3. client drops mid-stream: what was recognised is still billed, hold released
    const b = await makeCaller("b", 10);
    await collect(connect(port, b.apiKey), (ws) => {
      ws.send(runTask());
      ws.on("message", (data, isBinary) => {
        if (isBinary) return;
        if (JSON.parse(data.toString()).header.event === "task-started") {
          ws.send(Buffer.alloc(3200));
          setTimeout(() => ws.close(), 150);
        }
      });
    });
    await new Promise((r) => setTimeout(r, 300));
    const dropped = await db.queryOne<any>("SELECT * FROM usage_logs WHERE user_id = ?", [b.userId]);
    assert.equal(dropped.status, "success");
    assert.equal(Number(dropped.prompt_tokens), 20);
    assert.deepEqual((await db.queryMany<any>("SELECT status FROM billing_reservations WHERE user_id = ?", [b.userId])).map((h) => h.status), ["settled"]);

    // 4. nothing recognised before leaving: nothing billed, reservation released
    const c = await makeCaller("c", 10);
    await collect(connect(port, c.apiKey), (ws) => {
      ws.send(runTask());
      ws.on("message", (data) => { if (JSON.parse(data.toString()).header.event === "task-started") ws.close(); });
    });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(Number((await db.queryOne<{ balance: string }>("SELECT balance FROM users WHERE id = ?", [c.userId]))!.balance), 10);
    assert.deepEqual((await db.queryMany<any>("SELECT status FROM billing_reservations WHERE user_id = ?", [c.userId])).map((h) => h.status), ["released"]);

    // 5. validation failures
    const d = await makeCaller("d", 10);
    const badModel = await collect(connect(port, d.apiKey), (ws) => ws.send(runTask("qwen-audio-3.1-asr-flash")));
    assert.equal(badModel.events[0].header.event, "task-failed");
    assert.equal(badModel.events[0].header.error_code, "ModelNotFound");
    const noParams = await collect(connect(port, d.apiKey), (ws) => ws.send(JSON.stringify({ header: { action: "run-task", task_id: crypto.randomUUID() }, payload: { model: MODEL } })));
    assert.equal(noParams.events[0].header.error_code, "InvalidParameter");
    const notJson = await collect(connect(port, d.apiKey), (ws) => ws.send("hello"));
    assert.equal(notJson.events[0].header.error_code, "InvalidParameter");

    // 6. poor account: reservation refused before any upstream contact
    const poor = await makeCaller("poor", 0);
    const before = fake.seen.audioBytes;
    const broke = await collect(connect(port, poor.apiKey), (ws) => ws.send(runTask()));
    assert.equal(broke.events[0].header.error_code, "Billing.InsufficientBalance");
    assert.equal(fake.seen.audioBytes, before);

    // 7. upstream task-failed is relayed and logged as an upstream failure, nothing billed
    const failing = await startFakeUpstream({ failOnStart: true });
    setAsrStreamUpstreamFactory((_url, headers) => new WebSocket(`ws://127.0.0.1:${failing.port}`, { headers }));
    const e = await makeCaller("e", 10);
    const failed = await collect(connect(port, e.apiKey), (ws) => ws.send(runTask()));
    assert.equal(failed.events[0].header.event, "task-failed");
    assert.equal(failed.events[0].header.error_message, "bad format");
    await new Promise((r) => setTimeout(r, 300));
    const failLog = await db.queryOne<any>("SELECT * FROM usage_logs WHERE user_id = ?", [e.userId]);
    assert.equal(failLog.status, "error");
    assert.equal(Number((await db.queryOne<{ balance: string }>("SELECT balance FROM users WHERE id = ?", [e.userId]))!.balance), 10);

    // 8. session budget: very chatty usage ends the task cleanly (finish-task sent upstream)
    const hungry = await startFakeUpstream({ usageEvery: { input: 20_000, output: 2_000 } });
    setAsrStreamUpstreamFactory((_url, headers) => new WebSocket(`ws://127.0.0.1:${hungry.port}`, { headers }));
    const f = await makeCaller("f", 10);
    const budget = await collect(connect(port, f.apiKey), (ws) => {
      ws.send(runTask());
      ws.on("message", (data) => {
        if (JSON.parse(data.toString()).header.event === "task-started") { ws.send(Buffer.alloc(3200)); ws.send(Buffer.alloc(3200)); }
      });
    });
    assert.equal(hungry.seen.finish, true, "budget reached must trigger finish-task");
    assert.equal(budget.events[budget.events.length - 1].header.event, "task-finished");

    // 9. alias path works too
    const g = await makeCaller("g", 10);
    setAsrStreamUpstreamFactory((_url, headers) => new WebSocket(`ws://127.0.0.1:${fake.port}`, { headers }));
    const alias = await collect(connect(port, g.apiKey, "/v1/audio/transcriptions/stream"), (ws) => {
      ws.send(runTask());
      ws.on("message", (data) => { if (JSON.parse(data.toString()).header.event === "task-started") ws.send(JSON.stringify({ header: { action: "finish-task" }, payload: {} })); });
    });
    assert.equal(alias.events[alias.events.length - 1].header.event, "task-finished");

    console.log("audio stream (WebSocket ASR) checks passed");
  } finally {
    setAsrStreamUpstreamFactory(null);
    fake.wss.close();
    server.close();
    await closeDb();
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
