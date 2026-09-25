/**
 * P5: NF_PARAM_MODE (pass-through, billing_guarded 400, data-driven
 * rewrite/fixed, shadow records names only), structured capabilities in
 * /v1/models, NF_PROTOCOL_MODE=enforce (native protocols only, bridge
 * disabled), route probes against a mock upstream, and the
 * analyze-dropped-params report. Run via test-params-protocols-isolated.ts.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

process.env.USE_PG_MEM = "true";
process.env.NODE_ENV = "test";
for (const name of ["NF_CP_MODE", "NF_TRAFFIC_MODE", "NF_PARAM_MODE", "NF_PROTOCOL_MODE", "PROVIDER_SECRET_KEY", "SLS_ACCESS_KEY_ID", "SLS_ACCESS_KEY_SECRET"]) {
  delete process.env[name];
}
process.env.DASHSCOPE_API_KEY = "sk-upstream-dashscope-test";

/* eslint-disable @typescript-eslint/no-var-requires */
const params = require("../src/control-plane/params") as typeof import("../src/control-plane/params");
const capabilities = require("../src/control-plane/capabilities") as typeof import("../src/control-plane/capabilities");
const probe = require("../src/control-plane/probe") as typeof import("../src/control-plane/probe");
const runtime = require("../src/control-plane/runtime") as typeof import("../src/control-plane/runtime");
const cli = require("../src/cli/control-plane-backfill") as typeof import("../src/cli/control-plane-backfill");
const shadow = require("../src/services/shadow") as typeof import("../src/services/shadow");
const { ensureRoutingDefaults } = require("../src/services/providers") as typeof import("../src/services/providers");
const { setOutboundTestTransport } = require("../src/services/outbound-url-policy") as typeof import("../src/services/outbound-url-policy");
const { createApp } = require("../src/app") as typeof import("../src/app");
const { db, closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const { closeRedis } = require("../src/services/redis") as typeof import("../src/services/redis");
/* eslint-enable @typescript-eslint/no-var-requires */

type Reply = { status: number; json: unknown };
let replies: Reply[] = [];
const calls: Array<{ url: string; body: any }> = [];
setOutboundTestTransport(async (url, init) => {
  calls.push({ url: url.href, body: typeof init.body === "string" ? JSON.parse(init.body) : null });
  const reply = replies.shift() || { status: 599, json: { error: { message: "no reply queued" } } };
  return new Response(JSON.stringify(reply.json), { status: reply.status, headers: { "content-type": "application/json" } });
});

const completion = {
  id: "c1", object: "chat.completion", created: 1, model: "qwen-plus",
  choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
};

let baseUrl = "";
let apiKey = "";
async function call(method: string, pathName: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function main(): Promise<void> {
  // ------------------------------------------------------------ unit
  assert.deepEqual(params.guardedParamsRequested({ n: 2, enable_search: true, temperature: 1 }), ["enable_search", "n"]);
  assert.deepEqual(params.guardedParamsRequested({ n: 2 }, ["n"]), []);
  assert.deepEqual(params.droppedParamNames({ model: "m", messages: [], foo: 1, temperature: 1, bar: undefined }, { temperature: 1 }), ["foo"]);
  assert.deepEqual(
    params.applyParamOverrides({ max_tokens: 10, stream_options: { a: 1 } }, { rewrite: { max_tokens: "max_completion_tokens" }, fixed: { stream_options: { include_usage: true } } }),
    { max_completion_tokens: 10, stream_options: { a: 1, include_usage: true } }
  );
  const passthrough = params.passthroughChatRequest(
    { model: "gpt-6-astra", messages: [], max_tokens: 5, reasoning_effort: "high", stream: true, stream_options: { include_usage: false } },
    { model: "astra-upstream", messages: [], stream: true, max_completion_tokens: 5, stream_options: { include_usage: true } },
    { rewrite: { max_tokens: "max_completion_tokens" } }
  );
  assert.deepEqual(passthrough, {
    model: "astra-upstream", messages: [], stream: true, max_completion_tokens: 5, reasoning_effort: "high",
    stream_options: { include_usage: true },
  }, "pass-through keeps platform decisions, forwards unknown params, rewrites, fixes include_usage");

  // capabilities → display labels
  await ensureRoutingDefaults();
  const content = clone(cli.runBackfill(await cli.loadOnlineSources()).content) as any;
  const qwen = content.models.find((model: any) => model.id === "qwen-plus");
  const labels = capabilities.displaySupportedFor(qwen);
  assert.equal(labels[0], "文本");
  assert.ok(labels.includes("函数调用"));
  const noTools = clone(qwen);
  noTools.capabilities.tools.supported = false;
  assert.ok(!capabilities.displaySupportedFor(noTools).includes("函数调用"), "labels follow structured capabilities");
  noTools.display.supported = ["文本", "函数调用"];
  assert.ok(capabilities.displayCapabilityMismatches(noTools).some((issue) => issue.includes("函数调用")));
  const video = content.models.find((model: any) => model.id === "wan2.7-t2v");
  assert.deepEqual(capabilities.displaySupportedFor(video), video.display.supported, "media labels are editorial");

  // -------------------------------------------------------------- HTTP
  runtime.controlPlaneRuntime.install(runtime.indexContent(1, "test", content));
  process.env.NF_CP_MODE = "enforce";
  const userId = "params-user";
  apiKey = `sk-air-prm-0001-${"0".repeat(29)}`;
  await db.execute("INSERT INTO users (id, email, nickname, balance, created_at, updated_at) VALUES (?, ?, ?, 100, NOW(), NOW())", [userId, "p@test", "p"]);
  await db.execute("INSERT INTO api_keys (id, user_id, name, key, key_hash, created_at) VALUES ('prm-key', ?, 'p', 'sk-air-prm...masked', ?, NOW())",
    [userId, crypto.createHash("sha256").update(apiKey).digest("hex")]);
  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  const chat = { model: "qwen-plus", messages: [{ role: "user", content: "hi" }], custom_flag: "x", temperature: 0.5 };

  // legacy: unknown parameters are dropped
  replies = [{ status: 200, json: completion }];
  calls.length = 0;
  assert.equal((await call("POST", "/v1/chat/completions", chat)).status, 200);
  assert.equal(calls[0].body.custom_flag, undefined);
  assert.equal(calls[0].body.temperature, 0.5);

  // shadow: still dropped; names (never values) recorded
  process.env.NF_PARAM_MODE = "shadow";
  const recorded: Array<Record<string, unknown>> = [];
  const original = shadow.recordShadowDiff;
  (shadow as any).recordShadowDiff = (area: string, details: Record<string, unknown>) => {
    recorded.push({ area, ...details });
  };
  replies = [{ status: 200, json: completion }];
  calls.length = 0;
  assert.equal((await call("POST", "/v1/chat/completions", { ...chat, n: 3 })).status, 200);
  assert.equal(calls[0].body.custom_flag, undefined, "shadow never changes the request");
  const paramDiff = recorded.find((item) => item.area === "params")!;
  assert.deepEqual(paramDiff.dropped, ["custom_flag", "n"]);
  assert.deepEqual(paramDiff.wouldReject, ["n"]);
  assert.equal(JSON.stringify(paramDiff).includes("\"x\""), false, "parameter values are never logged");
  (shadow as any).recordShadowDiff = original;

  // enforce: pass-through; billing_guarded → 400 unsupported_parameter before any reservation
  process.env.NF_PARAM_MODE = "enforce";
  replies = [{ status: 200, json: completion }];
  calls.length = 0;
  assert.equal((await call("POST", "/v1/chat/completions", chat)).status, 200);
  assert.equal(calls[0].body.custom_flag, "x", "unknown parameters reach the upstream");
  assert.equal(calls[0].body.model, content.routes.find((route: any) => route.model_id === "qwen-plus").upstream_model_id);
  calls.length = 0;
  for (const guarded of [{ n: 2 }, { enable_search: true }]) {
    const rejected = await call("POST", "/v1/chat/completions", { ...chat, ...guarded });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error.code, "unsupported_parameter");
    assert.equal(rejected.body.error.param, Object.keys(guarded)[0]);
  }
  assert.equal(calls.length, 0);
  const holds = await db.queryOne<{ count: number }>("SELECT COUNT(*)::int AS count FROM billing_reservations WHERE status = 'active'");
  assert.equal(Number(holds?.count), 0, "rejected requests reserve nothing");

  // /v1/models: structured capabilities under NF_CP_MODE=enforce
  const listed = await call("GET", "/v1/models");
  const qwenListed = listed.body.data.find((model: any) => model.id === "qwen-plus");
  assert.equal(qwenListed.capabilities.input.text, true);
  assert.equal(typeof qwenListed.capabilities.tools.supported, "boolean");
  assert.ok(Array.isArray(qwenListed.capability_labels));
  assert.equal(qwenListed.capability_flags.model_type, "chat", "legacy flags kept for compatibility");
  assert.deepEqual(qwenListed.parameter_policy.billing_guarded, params.BILLING_GUARDED_PARAMS.map((p) => p.name).sort());
  delete process.env.NF_PARAM_MODE;

  // ---------------------------------------------- protocols (D6)
  process.env.NF_PROTOCOL_MODE = "enforce";
  const anthropicBody = { model: "MiniMax/MiniMax-M3", max_tokens: 8, messages: [{ role: "user", content: "hi" }] };
  const bridged = await call("POST", "/v1/messages", anthropicBody, { "anthropic-version": "2023-06-01" });
  assert.equal(bridged.status, 400);
  assert.equal(bridged.body.type, "error");
  assert.equal(bridged.body.error.code, "unsupported_protocol");
  assert.match(bridged.body.error.message, /openai\.chat/, "the error lists the available protocols");
  const responsesOnly = content.models.find((model: any) => model.protocols.includes("openai.chat") && !model.protocols.includes("openai.responses") && model.id.startsWith("qwen"));
  const noResponses = await call("POST", "/v1/responses", { model: responsesOnly.id, input: "hi" });
  assert.equal(noResponses.status, 400);
  // A model that claims anthropic.messages but whose route cannot pass through
  // never enters the conversion bridge.
  const noPass = clone(content);
  const qwenNoPass = noPass.models.find((model: any) => model.id === "qwen-plus");
  qwenNoPass.legacy_flags = { anthropic_pass_through: false };
  runtime.controlPlaneRuntime.install(runtime.indexContent(2, "test", noPass));
  calls.length = 0;
  const bridge = await call("POST", "/v1/messages", { ...anthropicBody, model: "qwen-plus" }, { "anthropic-version": "2023-06-01" });
  assert.equal(bridge.status, 400);
  assert.equal(bridge.body.error.code, "unsupported_protocol");
  assert.equal(calls.length, 0);
  delete process.env.NF_PROTOCOL_MODE;
  // legacy keeps the bridge
  replies = [{ status: 200, json: completion }];
  assert.equal((await call("POST", "/v1/messages", anthropicBody, { "anthropic-version": "2023-06-01" })).status, 200);
  delete process.env.NF_CP_MODE;
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // ------------------------------------------------------ route probes
  const snapshot = runtime.indexContent(3, "test", content);
  const plans = probe.planProbes(snapshot, { modelId: "qwen-plus" });
  const kinds = plans.map((plan) => `${plan.protocol}/${plan.capability}`);
  assert.ok(kinds.includes("openai.chat/text"));
  assert.ok(kinds.includes("openai.chat/tools"));
  const results = [];
  for (const plan of plans) {
    const isTools = plan.capability === "tools";
    const toolReply = plan.protocol === "anthropic.messages"
      ? { content: [{ type: "tool_use", name: "get_weather", input: { city: "Beijing" } }] }
      : plan.protocol === "openai.responses"
        ? { output: [{ type: "function_call", name: "get_weather" }] }
        : { choices: [{ message: { tool_calls: [{ id: "t", type: "function", function: { name: "get_weather", arguments: "{}" } }] } }] };
    // The anthropic tools probe answers without a tool call: a mismatch.
    const broken = isTools && plan.protocol === "anthropic.messages";
    replies = [{ status: 200, json: isTools && !broken ? toolReply : { choices: [{ message: { content: "ok" } }], usage: { total_tokens: 3 } } }];
    calls.length = 0;
    results.push(await probe.runProbe(plan, "sk-probe-test"));
    assert.equal(calls.length, 1);
    if (plan.capability === "image_input") assert.match(JSON.stringify(calls[0].body), /base64/);
  }
  const mismatches = probe.probeMismatches(results);
  if (kinds.includes("anthropic.messages/tools")) {
    assert.deepEqual(mismatches.map((item) => `${item.protocol}/${item.capability}`), ["anthropic.messages/tools"]);
  }
  await probe.storeProbeResults((sql, values) => db.execute(sql, values as any[]), results);
  const stored = await db.queryOne<{ count: number }>("SELECT COUNT(*)::int AS count FROM cp_route_probe_results");
  assert.equal(Number(stored?.count), results.length);

  // ------------------------------------------------ analyze-dropped-params
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nf-params-"));
  const file = path.join(dir, "sls.ndjson");
  fs.writeFileSync(file, [
    { status: "shadow_diff", shadowArea: "params", userId: "u1", model: "qwen-plus", dropped: ["custom_flag", "n"], wouldReject: ["n"] },
    { status: "shadow_diff", shadowArea: "params", userId: "u1", model: "qwen-plus", dropped: ["custom_flag"], wouldReject: [] },
    { status: "shadow_diff", shadowArea: "traffic", userId: "u2" },
    { status: "shadow_diff", shadowArea: "params", userId: "u2", model: "glm-5", dropped: "[\"logit_bias\"]" },
  ].map((row) => JSON.stringify(row)).join("\n"));
  const report = JSON.parse(execFileSync(process.execPath, [path.resolve(__dirname, "../../scripts/analyze-dropped-params.mjs"), file, "--json"], { encoding: "utf8" }));
  assert.deepEqual(report.map((row: any) => [row.userId, row.requests]), [["u1", 2], ["u2", 1]]);
  assert.deepEqual(report[0].dropped, { custom_flag: 2, n: 1 });
  assert.deepEqual(report[0].wouldReject, { n: 1 });
  assert.deepEqual(report[1].dropped, { logit_bias: 1 });
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(`params/protocol tests passed (${results.length} probes)`);
}

main()
  .then(async () => {
    await closeRedis().catch(() => undefined);
    await closeDb().catch(() => undefined);
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeRedis().catch(() => undefined);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
