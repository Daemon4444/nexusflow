/**
 * P3: control-plane configuration — validation checks, backfill
 * determinism, offline shadow zero-diff, loader keep-last-good, versioned
 * store (conflicts, materialization) and NF_CP_MODE=enforce routing
 * equivalence with the legacy resolver. Needs Redis (run through
 * test-control-plane-config-isolated.ts).
 */
import assert from "node:assert/strict";
import path from "node:path";

process.env.USE_PG_MEM = "true";
process.env.NODE_ENV = "test";
delete process.env.NF_CP_MODE;
delete process.env.PROVIDER_SECRET_KEY;
process.env.DASHSCOPE_API_KEY = "sk-upstream-dashscope-test";
process.env.ARK_API_KEY = "sk-upstream-ark-test";
process.env.PIXVERSE_API_KEY = "sk-upstream-pixverse-test";

/* eslint-disable @typescript-eslint/no-var-requires */
const { validateContent } = require("../src/control-plane/validation") as typeof import("../src/control-plane/validation");
const { buildBackfill } = require("../src/control-plane/backfill") as typeof import("../src/control-plane/backfill");
const cli = require("../src/cli/control-plane-backfill") as typeof import("../src/cli/control-plane-backfill");
const runtime = require("../src/control-plane/runtime") as typeof import("../src/control-plane/runtime");
const store = require("../src/control-plane/store") as typeof import("../src/control-plane/store");
const compare = require("../src/control-plane/shadow-compare") as typeof import("../src/control-plane/shadow-compare");
const { ensureRoutingDefaults } = require("../src/services/providers") as typeof import("../src/services/providers");
const { resolveUpstream } = require("../src/services/upstream") as typeof import("../src/services/upstream");
const { models } = require("../src/data/models") as typeof import("../src/data/models");
const { refreshModels } = require("../src/data/model-overrides") as typeof import("../src/data/model-overrides");
const stages = require("../src/pipeline/stages") as typeof import("../src/pipeline/stages");
const { InferenceContext } = require("../src/pipeline/context") as typeof import("../src/pipeline/context");
const shadow = require("../src/services/shadow") as typeof import("../src/services/shadow");
const { db, closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const { closeRedis } = require("../src/services/redis") as typeof import("../src/services/redis");
/* eslint-enable @typescript-eslint/no-var-requires */

const FIXTURES = path.resolve(__dirname, "fixtures/bailian-2026-09-25");
const SNAPSHOT = path.resolve(__dirname, "../../docs/upstream-sync/snapshots/bailian-2026-09-25.snapshot.json");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function checksOf(content: unknown): string[] {
  return [...new Set(validateContent(content).errors.map((issue) => issue.check))].sort();
}

async function main(): Promise<void> {
  const sources = cli.loadOfflineSources(FIXTURES, SNAPSHOT);
  const run = cli.runBackfill(sources);
  const base = run.content;

  // ------------------------------------------------ backfill + shadow diff
  assert.equal(base.models.length, 94);
  assert.equal(base.accounts.length, 8);
  assert.equal(base.routes.length, 100);
  assert.deepEqual(run.comparison.modelDiffs, [], "legacy catalog and backfill agree on every model and price");
  assert.deepEqual(run.comparison.routeDiffs, [], "legacy enabled routes and backfill agree (orphans explained)");
  assert.equal(run.report.skippedOrphanRoutes.length, 5);
  assert.deepEqual(
    run.report.bridgedModels.map((row) => row.model_id).sort(),
    ["MiniMax/MiniMax-M2.7", "MiniMax/MiniMax-M3"]
  );
  // Known legacy finding: Seedance models have no enabled route.
  assert.deepEqual(checksOf(base), ["model_has_active_route"]);
  assert.deepEqual(cli.blockingErrors(run.validation, ["model_has_active_route"]), []);
  // Route limits are the legacy values, never invented.
  for (const route of base.routes) {
    const legacy = sources.capacity.find((row) => row.provider_id === route.account_id && row.model_id === route.model_id);
    if (!legacy) continue;
    assert.equal(route.rpm, legacy.rpm_limit, `${route.id} rpm`);
    assert.equal(route.tpm, legacy.tpm_limit, `${route.id} tpm`);
    assert.equal(route.status === "active", legacy.is_enabled, `${route.id} status`);
  }

  // Determinism: same input → byte-identical content; input order is irrelevant.
  const again = cli.runBackfill(cli.loadOfflineSources(FIXTURES, SNAPSHOT));
  assert.equal(again.contentSha256, run.contentSha256);
  const shuffled = buildBackfill({
    ...sources,
    capacity: [...sources.capacity].reverse(),
    overrides: [...sources.overrides].reverse(),
  });
  assert.equal(store.contentSha256(shuffled.content), run.contentSha256);

  // ---------------------------------------------------- validation checks
  const fixed = clone(base);
  fixed.models = fixed.models.filter((model: any) => !model.id.startsWith("seedance"));
  fixed.routes = fixed.routes.filter((route: any) => !route.model_id.startsWith("seedance"));
  assert.deepEqual(checksOf(fixed), [], "baseline without the Seedance finding is clean");

  {
    const content: any = clone(fixed);
    delete content.models[0].id;
    assert.deepEqual(checksOf(content), ["schema"]);
  }
  {
    const content: any = clone(fixed);
    content.models.push(clone(content.models[0]));
    assert.deepEqual(checksOf(content), ["unique_ids"]);
  }
  {
    const content: any = clone(fixed);
    content.routes[0].model_id = "no-such-model";
    assert.ok(checksOf(content).includes("route_references"));
  }
  {
    const content: any = clone(fixed);
    const route = content.routes.find((item: any) => item.quota_pool_id);
    const otherAccount = content.accounts.find((account: any) => account.id !== route.account_id);
    content.pools.push({ ...clone(content.pools[0]), id: "pool-other-account", account_id: otherAccount.id });
    route.quota_pool_id = "pool-other-account";
    assert.deepEqual(checksOf(content), ["route_references"], "pool must belong to the route's account");
  }
  {
    const content: any = clone(fixed);
    const model = content.models.find((item: any) => item.id === "qwen-plus");
    for (const route of content.routes) if (route.model_id === "qwen-plus") route.status = "disabled";
    assert.equal(model.lifecycle, "active");
    assert.deepEqual(checksOf(content), ["model_has_active_route"]);
    model.lifecycle = "deprecated";
    assert.deepEqual(checksOf(content), [], "deprecated models may lose their routes");
  }
  {
    // D6: bridged protocols cannot be exposed.
    const content: any = clone(fixed);
    const model = content.models.find((item: any) => item.id === "MiniMax/MiniMax-M3");
    assert.ok(!model.protocols.includes("anthropic.messages"));
    model.protocols.push("anthropic.messages");
    assert.deepEqual(checksOf(content), ["protocols_native"]);
  }
  {
    const content: any = clone(fixed);
    const model = content.models.find((item: any) => (item.pricing.tokenPricingTiers || []).length >= 2);
    assert.ok(model, "fixture has a tiered model");
    model.pricing.tokenPricingTiers = [...model.pricing.tokenPricingTiers].reverse();
    assert.deepEqual(checksOf(content), ["pricing_sane"]);
  }
  {
    const content: any = clone(fixed);
    content.models[0].pricing.promptPrice = -1;
    assert.deepEqual(checksOf(content), ["schema"], "negative prices are rejected by the schema");
  }
  {
    const content: any = clone(fixed);
    content.models[0].param_overrides = { ...(content.models[0].param_overrides || {}), allow_guarded: ["n"] };
    assert.deepEqual(checksOf(content), ["guarded_params_billable"], "n cannot be priced yet");
  }
  {
    const content: any = clone(fixed);
    const relay = content.accounts.find((account: any) => account.is_relay);
    relay.relay_operator = null;
    assert.deepEqual(checksOf(content), ["relay_disclosure"]);
  }
  {
    const result = validateContent(fixed);
    assert.ok(result.warnings.some((issue) => issue.check === "quota_unverified"), "unverified quotas warn");
  }

  // ----------------------------------------------------- shadow comparisons
  const snapshot = runtime.indexContent(1, run.contentSha256, base);
  const legacyQwen = snapshot.aiModels.get("qwen-plus")!;
  assert.deepEqual(compare.diffModel("qwen-plus", legacyQwen, snapshot, null), []);
  assert.deepEqual(
    compare.diffModel("qwen-plus", { ...legacyQwen, promptPrice: legacyQwen.promptPrice + 1 }, snapshot, null).map((diff) => diff.kind),
    ["pricing"]
  );
  assert.deepEqual(
    compare.diffModel("qwen-plus", { ...legacyQwen, contextLength: 1 }, snapshot, null).map((diff) => diff.kind),
    ["model_fields"]
  );
  {
    const preview = clone(base) as any;
    const model = preview.models.find((item: any) => item.id === "qwen-plus");
    model.lifecycle = "preview";
    model.preview_user_ids = ["user-allowed"];
    const previewSnapshot = runtime.indexContent(2, "x", preview);
    assert.deepEqual(compare.diffModel("qwen-plus", legacyQwen, previewSnapshot, "user-allowed"), []);
    assert.deepEqual(compare.diffModel("qwen-plus", legacyQwen, previewSnapshot, "user-other").map((diff) => diff.kind), ["model_exists"]);
    assert.equal(runtime.listedCatalog(previewSnapshot).some((item) => item.id === "qwen-plus"), false, "preview models are not listed");
  }
  const qwenRoute = snapshot.routesByModel.get("qwen-plus")![0];
  assert.deepEqual(compare.diffRoute("qwen-plus", { ok: true, providerId: "dashscope", upstreamModelId: qwenRoute.upstream_model_id }, snapshot), []);
  assert.deepEqual(compare.diffRoute("qwen-plus", { ok: true, providerId: "himodels" }, snapshot).map((diff) => diff.kind), ["route_provider"]);
  assert.deepEqual(compare.diffRoute("qwen-plus", { ok: true, providerId: "dashscope", upstreamModelId: "other" }, snapshot).map((diff) => diff.kind), ["route_upstream_model"]);
  assert.deepEqual(compare.diffRoute("qwen-plus", { ok: false, code: "provider_capacity_exhausted" }, snapshot), [], "capacity outcomes are not config diffs");
  assert.deepEqual(compare.diffRoute("qwen-plus", { ok: false, code: "provider_unavailable" }, snapshot).map((diff) => diff.kind), ["route_availability"]);

  // ------------------------------------------------ loader keep-last-good
  {
    let published = 1;
    let fail = false;
    const failures: string[] = [];
    const loaded: number[] = [];
    const loader = new runtime.ControlPlaneRuntime(
      {
        currentVersionNumber: async () => {
          if (fail) throw new Error("database unreachable");
          return published;
        },
        currentVersion: async () => ({
          version: published,
          content: base,
          contentSha256: run.contentSha256,
          publishedAt: new Date().toISOString(),
          publishedBy: "test",
          parentVersion: published - 1 || null,
        }),
      },
      (message) => { failures.push(message); }
    );
    loader.onLoaded((loadedSnapshot) => loaded.push(loadedSnapshot.version));
    assert.equal(loader.get(), null);
    await loader.refresh();
    assert.equal(loader.get()?.version, 1);
    await loader.refresh();
    assert.deepEqual(loaded, [1], "unchanged version is not reloaded");
    fail = true;
    published = 2;
    await loader.refresh();
    assert.equal(loader.get()?.version, 1, "a failed load keeps the last good version");
    assert.equal(failures.length, 1);
    assert.match(failures[0], /keeping version 1/);
    fail = false;
    await loader.refresh();
    assert.equal(loader.get()?.version, 2);
    assert.deepEqual(loaded, [1, 2]);
  }
  {
    // Invalid content is rejected by the schema and the old snapshot stays.
    const failures: string[] = [];
    const loader = new runtime.ControlPlaneRuntime(
      {
        currentVersionNumber: async () => 1,
        currentVersion: async () => { throw new Error("content failed schema validation"); },
      },
      (message) => { failures.push(message); }
    );
    await loader.refresh();
    assert.equal(loader.get(), null, "never installs content that failed validation");
    assert.equal(failures.length, 1);
  }

  // ----------------------------------------------------- versioned store
  await ensureRoutingDefaults();
  assert.equal(await store.getCurrentVersionNumber(), null);
  const onlineSources = await cli.loadOnlineSources();
  const online = cli.runBackfill(onlineSources);
  assert.deepEqual(online.comparison.modelDiffs, [], "pg-mem catalog backfills without model diffs");
  assert.deepEqual(online.comparison.routeDiffs, [], "pg-mem routes backfill without route diffs");
  const v1 = await store.insertVersion({ content: online.content, expectedParent: null, kind: "backfill", publishedBy: "test" });
  assert.equal(v1.version, 1);
  assert.equal(v1.contentSha256, online.contentSha256);
  await assert.rejects(
    store.insertVersion({ content: online.content, expectedParent: null, kind: "backfill", publishedBy: "test" }),
    store.VersionConflictError
  );
  const stored = await store.getCurrentVersion();
  assert.equal(stored?.version, 1);
  assert.equal(store.contentSha256(stored!.content), online.contentSha256, "stored content round-trips");
  const materialized = await db.queryOne<{ count: number }>("SELECT COUNT(*)::int AS count FROM cp_models");
  assert.equal(Number(materialized?.count), online.content.models.length);
  const routeCount = await db.queryOne<{ count: number }>("SELECT COUNT(*)::int AS count FROM cp_routes");
  assert.equal(Number(routeCount?.count), online.content.routes.length);

  // ---------------------------------------- enforce routing equivalence
  await runtime.controlPlaneRuntime.refresh();
  assert.equal(runtime.controlPlaneRuntime.get()?.version, 1);
  let compared = 0;
  const mismatches: string[] = [];
  for (const model of [...models]) {
    process.env.NF_CP_MODE = "legacy";
    const legacy = await resolveUpstream(model.id);
    process.env.NF_CP_MODE = "enforce";
    const enforced = await resolveUpstream(model.id);
    delete process.env.NF_CP_MODE;
    if (enforced.ok !== legacy.ok) {
      mismatches.push(`${model.id}: legacy ${legacy.ok ? legacy.upstream.providerId + (legacy.upstream.managed ? "" : " (unmanaged)") : legacy.code} / enforce ${enforced.ok ? enforced.upstream.providerId : enforced.code}`);
      continue;
    }
    if (legacy.ok && enforced.ok) {
      assert.equal(enforced.upstream.providerId, legacy.upstream.providerId, `${model.id}: provider`);
      assert.equal(enforced.upstream.upstreamModelId, legacy.upstream.upstreamModelId, `${model.id}: upstream model`);
      assert.equal(enforced.upstream.baseUrl, legacy.upstream.baseUrl, `${model.id}: base URL`);
      assert.equal(enforced.upstream.apiKey, legacy.upstream.apiKey, `${model.id}: credential`);
      compared += 1;
    } else if (!legacy.ok && !enforced.ok) {
      assert.equal(enforced.code, legacy.code, `${model.id}: failure code`);
    }
  }
  // The only difference: legacy's unmanaged env-key fallback for a model
  // without any provider_capacity row (here kimi-k3, whose jawayid-k3
  // provider does not exist in pg-mem). Enforce never falls back; the
  // backfill validation reports the model so --apply refuses it.
  assert.deepEqual(mismatches, ["kimi-k3: legacy dashscope (unmanaged) / enforce provider_unavailable"]);
  assert.ok(
    online.validation.errors.some((issue) => issue.check === "model_has_active_route" && issue.id === "kimi-k3"),
    "unrouted models are reported before publishing"
  );
  assert.ok(compared > 50, `compared ${compared} routable models`);

  // --------------------------------------------- shadow / enforce stages
  {
    const counts = new Map<string, number>();
    shadow.setShadowCounterClient({
      incr: async (key: string) => { counts.set(key, (counts.get(key) || 0) + 1); return counts.get(key)!; },
      expire: async () => 1,
    });
    const priced = clone(online.content) as any;
    priced.models.find((model: any) => model.id === "qwen-plus").pricing.promptPrice += 1;
    const saved = runtime.controlPlaneRuntime.get();
    runtime.controlPlaneRuntime.install(runtime.indexContent(99, "test", priced));
    process.env.NF_CP_MODE = "shadow";
    const legacyModel = models.find((model) => model.id === "qwen-plus")!;
    const ctx = new InferenceContext("unit", { headers: {}, path: "/test" } as any, {} as any);
    assert.equal(stages.resolveModel(ctx, "qwen-plus"), true);
    assert.equal(ctx.model, legacyModel, "shadow keeps the legacy decision");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(counts.get(shadow.shadowCounterKey("cp_pricing")), 1, "price difference counted");
    assert.equal(counts.get(shadow.shadowCounterKey("cp_resolve_model")), undefined);
    // Enforce reads the snapshot, including preview/retired lifecycle.
    process.env.NF_CP_MODE = "enforce";
    const enforceCtx = new InferenceContext("unit", { headers: {}, path: "/test" } as any, {} as any);
    assert.equal(stages.resolveModel(enforceCtx, "qwen-plus"), true);
    assert.equal(enforceCtx.model?.promptPrice, legacyModel.promptPrice + 1, "enforce prices come from the version");
    const retired = clone(online.content) as any;
    Object.assign(retired.models.find((model: any) => model.id === "qwen-plus"), { lifecycle: "retired", replacement_model_id: "qwen3.7-plus" });
    runtime.controlPlaneRuntime.install(runtime.indexContent(100, "test", retired));
    const retiredCtx = new InferenceContext("unit", { headers: {}, path: "/test" } as any, {} as any);
    assert.equal(stages.resolveModel(retiredCtx, "qwen-plus"), false);
    assert.equal(retiredCtx.retiredReplacement, "qwen3.7-plus");
    delete process.env.NF_CP_MODE;
    runtime.controlPlaneRuntime.install(saved);
    shadow.setShadowCounterClient(undefined);
  }

  // Enforce catalog comes from the published version.
  const before = models.length;
  process.env.NF_CP_MODE = "enforce";
  await refreshModels();
  assert.equal(models.length, online.content.models.filter((model) => model.lifecycle === "active" || model.lifecycle === "deprecated").length);
  delete process.env.NF_CP_MODE;
  await refreshModels();
  assert.equal(models.length, before, "legacy catalog restored");

  runtime.controlPlaneRuntime.stop();
  console.log(`control-plane config tests passed (${compared} models routed identically)`);
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
