/**
 * P2: unit tests for src/pipeline (adapter mapping and individual stages).
 * The end-to-end behaviour of the migrated routes is covered by
 * test:inference-characterization.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.USE_PG_MEM = "true";
process.env.NODE_ENV = "test";
delete process.env.REDIS_HOST;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adapters = require("../src/pipeline/adapters") as typeof import("../src/pipeline/adapters");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const stages = require("../src/pipeline/stages") as typeof import("../src/pipeline/stages");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { InferenceContext } = require("../src/pipeline/context") as typeof import("../src/pipeline/context");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const estimates = require("../src/pipeline/estimates") as typeof import("../src/pipeline/estimates");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setOutboundTestTransport } = require("../src/services/outbound-url-policy") as typeof import("../src/services/outbound-url-policy");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");

function fakeReq(headers: Record<string, string> = {}): any {
  return { headers, path: "/test" };
}

async function main(): Promise<void> {
  // ---------------------------------------------------------- adapter table
  const {
    PROVIDER_ADAPTERS,
    UPSTREAM_ADAPTERS,
    legacyAdapterFromBaseUrl,
    resolveUpstreamAdapter,
    taskProtocolFor,
  } = adapters;
  assert.deepEqual([...UPSTREAM_ADAPTERS].sort(), [
    "anthropic", "ark-video", "azure-openai", "dashscope-native", "openai-compat", "pixverse",
  ]);
  // Every provider in the 2026-09-25 production capacity export has an adapter.
  const capacity = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "fixtures/bailian-2026-09-25/production-provider-capacity.json"), "utf8"
  )).rows as Array<{ provider_id: string }>;
  for (const providerId of new Set(capacity.map((row) => row.provider_id))) {
    assert.ok(PROVIDER_ADAPTERS[providerId], `production provider ${providerId} needs an adapter mapping`);
  }
  // The mapping agrees with the historic URL rule for each provider's real endpoint.
  const canonicalEndpoints: Record<string, string> = {
    dashscope: "https://dashscope.aliyuncs.com",
    "volcengine-ark": "https://ark.cn-beijing.volces.com/api/v3",
    "volcengine-uaep1": "https://token.genvia.ai/api/v3",
    pixverse: "https://app-api.pixverse.ai/openapi/v2",
  };
  for (const [providerId, url] of Object.entries(canonicalEndpoints)) {
    const resolved = resolveUpstreamAdapter({ providerId, baseUrl: url });
    assert.equal(resolved.mismatch, undefined, `${providerId} agrees with the legacy URL rule`);
    assert.equal(taskProtocolFor(resolved.adapter), taskProtocolFor(legacyAdapterFromBaseUrl(url)));
  }
  assert.equal(taskProtocolFor("ark-video"), "volcengine");
  assert.equal(taskProtocolFor("pixverse"), "pixverse");
  assert.equal(taskProtocolFor("dashscope-native"), "dashscope");
  assert.equal(taskProtocolFor("openai-compat"), "dashscope");
  // Channel adapters win over the provider table: pixverse through DashScope.
  assert.equal(resolveUpstreamAdapter({ providerId: "pixverse", channelAdapter: "dashscope", baseUrl: "https://dashscope.aliyuncs.com" }).adapter, "dashscope-native");
  assert.equal(resolveUpstreamAdapter({ providerId: "pixverse", channelAdapter: "pixverse" }).source, "channel");
  // Unknown runtime providers fall back to the legacy URL rule.
  assert.deepEqual(resolveUpstreamAdapter({ providerId: "admin-created", baseUrl: "https://token.genvia.ai/v3" }), { adapter: "ark-video", source: "legacy_url" });
  assert.equal(resolveUpstreamAdapter({ providerId: "admin-created", baseUrl: "https://example.com" }).adapter, "dashscope-native");
  // Data/URL disagreement is reported; data wins.
  const mismatch = resolveUpstreamAdapter({ providerId: "dashscope", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" });
  assert.equal(mismatch.adapter, "dashscope-native");
  assert.deepEqual(mismatch.mismatch, { legacy: "ark-video" });
  // No route or service infers a protocol from URL substrings any more.
  const srcRoot = path.resolve(__dirname, "../src");
  for (const dir of ["routes", "services"]) {
    for (const file of fs.readdirSync(path.join(srcRoot, dir)).filter((name) => name.endsWith(".ts"))) {
      const text = fs.readFileSync(path.join(srcRoot, dir, file), "utf8");
      assert.doesNotMatch(text, /\.includes\("(pixverse\.ai|volces\.com|genvia\.ai)"\)/, `${dir}/${file} sniffs a protocol from a URL`);
    }
  }

  // ------------------------------------------------------------- estimates
  assert.equal(estimates.roughTokenCount("abcd"), 2);
  assert.equal(estimates.roughTokenCount([{ a: 1 }]), Math.ceil(JSON.stringify({ a: 1 }).length / 2));
  assert.equal(estimates.roughTokenCount(null), 0);

  // --------------------------------------------------------- authenticate
  const seededKey = "sk-air-local-test-000000000000000000000000";
  assert.equal(stages.bearerToken(fakeReq({ authorization: `Bearer ${seededKey}` })), seededKey);
  assert.equal(stages.bearerToken(fakeReq({ authorization: "Basic x" })), null);
  assert.equal(stages.anthropicToken(fakeReq({ "x-api-key": " k " })), "k");
  assert.equal(stages.anthropicToken(fakeReq({ authorization: "Bearer b" })), "b");

  const ctx = new InferenceContext("unit", fakeReq(), {} as any);
  assert.equal(await stages.authenticateApiKey(ctx, "sk-air-wrong"), false);
  assert.equal(ctx.caller, null);
  assert.equal(await stages.authenticateApiKey(ctx, seededKey), true);
  assert.equal(ctx.requireCaller().kind, "api_key");
  assert.equal(ctx.requireCaller().userId, "local-user-1");

  const sessionCtx = new InferenceContext("unit", fakeReq(), {} as any);
  assert.equal(await stages.authenticateApiKeyOrSession(sessionCtx, "sess-local-test"), true);
  assert.equal(sessionCtx.requireCaller().kind, "session");
  assert.equal(sessionCtx.requireCaller().apiKeyId, null);

  // ------------------------------------------------- model / access / route
  assert.equal(stages.resolveModel(ctx, "no-such-model"), false);
  assert.equal(stages.resolveModel(ctx, "qwen3.8-flash"), true);
  assert.equal(stages.checkModelAccess(ctx), true);
  process.env.DASHSCOPE_API_KEY = "sk-unit-upstream";
  assert.equal(await stages.selectRoute(ctx), null);
  assert.equal(ctx.requireUpstream().providerId, "dashscope");
  assert.equal(ctx.adapter, "dashscope-native");

  // --------------------------------------------------------- invokeUpstream
  const calls: Array<{ url: string; headers: Headers; body: unknown }> = [];
  setOutboundTestTransport(async (url, init) => {
    calls.push({ url: url.href, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return new Response("{}", { status: 200 });
  });
  await stages.invokeUpstream(ctx, { path: "/chat/completions", body: { a: 1 } });
  await stages.invokeUpstream(ctx, { url: "https://dashscope.aliyuncs.com/api/v1/x", auth: false, headers: { "content-type": "text/plain" }, body: { b: 2 } });
  setOutboundTestTransport(null);
  assert.equal(calls[0].url, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  assert.equal(calls[0].headers.get("authorization"), "Bearer sk-unit-upstream");
  assert.equal(calls[0].headers.get("content-type"), "application/json");
  assert.equal(calls[1].headers.get("authorization"), null, "auth: false sends no provider credential");
  assert.equal(calls[1].headers.get("content-type"), "text/plain", "caller Content-Type is never duplicated");

  // ------------------------------------------------------------------ release
  const releaseCtx = new InferenceContext("unit", fakeReq(), {} as any);
  await stages.release(releaseCtx); // nothing reserved: no-op
  assert.equal(releaseCtx.providerLease, null);

  console.log("pipeline stage tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb().catch(() => undefined));
