/**
 * P6: change requests (create → diff → validate → approve (D5) → publish →
 * rollback), rebasing onto newer versions, "new errors only" validation,
 * lifecycle gates (draft → preview → active, deprecated → retired, probe
 * evidence), Bailian price check, retired-model 404 hint, traffic.manage
 * permission, no direct-edit endpoints, audited writes, deterministic YAML
 * export and the CLI change-request helper.
 */
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

process.env.USE_PG_MEM = "true";
process.env.NODE_ENV = "test";
process.env.ADMIN_EMAILS = "local-test@nexusflow.test";
delete process.env.NF_CP_MODE;
delete process.env.NF_CP_REQUIRE_SECOND_APPROVER;
delete process.env.REDIS_HOST;

/* eslint-disable @typescript-eslint/no-var-requires */
const adminControlPlaneRouter = require("../src/routes/admin-control-plane").default;
const cli = require("../src/cli/control-plane-backfill") as typeof import("../src/cli/control-plane-backfill");
const store = require("../src/control-plane/store") as typeof import("../src/control-plane/store");
const cr = require("../src/control-plane/change-requests") as typeof import("../src/control-plane/change-requests");
const runtime = require("../src/control-plane/runtime") as typeof import("../src/control-plane/runtime");
const exporter = require("../src/cli/control-plane-export") as typeof import("../src/cli/control-plane-export");
const cliChange = require("../src/control-plane/cli-change") as typeof import("../src/control-plane/cli-change");
const stages = require("../src/pipeline/stages") as typeof import("../src/pipeline/stages");
const { InferenceContext } = require("../src/pipeline/context") as typeof import("../src/pipeline/context");
const { ensureRoutingDefaults } = require("../src/services/providers") as typeof import("../src/services/providers");
const { db, closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const yaml = require("js-yaml");
/* eslint-enable @typescript-eslint/no-var-requires */

let base = "";
async function call(method: string, path: string, token: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

const ADMIN = "sess-local-test";
const VIEWER = "sess-cp-viewer";
const OTHER = "sess-cp-other-admin";
const P = "/api/admin/control-plane/config";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function addUser(id: string, email: string, session: string, role: string) {
  const now = new Date().toISOString();
  await db.execute("INSERT INTO users (id, email, nickname, balance, credit_balance, status, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 'active', ?, ?)", [id, email, id, now, now]);
  await db.execute("INSERT INTO sessions (id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", [`${id}-s`, id, session, now, new Date(Date.now() + 3600_000).toISOString()]);
  await db.execute(
    "INSERT INTO admin_role_assignments (id, user_id, role, is_active, granted_by, reason, created_at, updated_at) VALUES (?, ?, ?, TRUE, 'local-user-1', 'cp test', ?, ?)",
    [`${id}-r`, id, role, now, now]
  );
}

async function flow(changes: unknown[], title = "test change", token = ADMIN) {
  const created = await call("POST", `${P}/change-requests`, token, { title, reason: "test", changes });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.data.id as string;
}

async function main(): Promise<void> {
  await ensureRoutingDefaults();
  await addUser("cp-viewer", "cp-viewer@nexusflow.test", VIEWER, "viewer");
  await addUser("cp-other", "cp-other@nexusflow.test", OTHER, "admin");
  const backfill = cli.runBackfill(await cli.loadOnlineSources());
  await store.insertVersion({ content: backfill.content, expectedParent: null, kind: "backfill", publishedBy: "test" });
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminControlPlaneRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as any).port}`;

  try {
    // ------------------------------------------------ permissions / reads
    const state = await call("GET", `${P}/state`, VIEWER);
    assert.equal(state.status, 200);
    assert.equal(state.body.data.currentVersion.version, 1);
    assert.equal(state.body.data.flags.controlPlaneMode ?? state.body.data.flags.NF_CP_MODE ?? "legacy", "legacy");
    const qwenRoute = backfill.content.routes.find((route) => route.model_id === "qwen-plus")!;
    const change = [{ op: "upsert", entity: "route", id: qwenRoute.id, value: { ...qwenRoute, rpm: qwenRoute.rpm + 1 } }];
    const forbidden = await call("POST", `${P}/change-requests`, VIEWER, { title: "x", changes: change });
    assert.equal(forbidden.status, 403, "viewers lack traffic.manage");
    for (const [method, path] of [["PUT", `${P}/models/qwen-plus`], ["POST", `${P}/routes`], ["DELETE", `${P}/routes/${qwenRoute.id}`], ["PATCH", `${P}/current`]]) {
      const direct = await call(method, path, ADMIN, {});
      assert.equal(direct.status, 404, `${method} ${path} must not exist (change requests only)`);
    }

    // --------------------------------------- create → validate → publish
    const id = await flow(change, "raise qwen-plus rpm");
    const detail = await call("GET", `${P}/change-requests/${id}`, VIEWER);
    assert.deepEqual(detail.body.data.diff.map((item: any) => [item.entity, item.id, item.change, item.fields.map((f: any) => f.field)]), [["route", qwenRoute.id, "changed", ["rpm"]]]);
    assert.equal((await call("POST", `${P}/change-requests/${id}/publish`, ADMIN)).status, 409, "must be approved first");
    assert.equal((await call("POST", `${P}/change-requests/${id}/approve`, ADMIN)).status, 409, "must be validated first");
    const validated = await call("POST", `${P}/change-requests/${id}/validate`, ADMIN);
    assert.equal(validated.body.data.status, "validated");
    assert.ok(validated.body.data.validation.warnings.some((issue: any) => /already in version 1/.test(issue.message)), "pre-existing errors are warnings");
    // D5: self-approval allowed by default; the flag requires someone else.
    process.env.NF_CP_REQUIRE_SECOND_APPROVER = "true";
    const self = await call("POST", `${P}/change-requests/${id}/approve`, ADMIN);
    assert.equal(self.status, 403);
    assert.equal(self.body.code, "second_approver_required");
    assert.equal((await call("POST", `${P}/change-requests/${id}/approve`, OTHER)).body.data.status, "approved");
    delete process.env.NF_CP_REQUIRE_SECOND_APPROVER;
    const published = await call("POST", `${P}/change-requests/${id}/publish`, ADMIN);
    assert.equal(published.status, 200);
    assert.equal(published.body.data.version, 2);
    assert.equal(published.body.data.record.status, "published");
    assert.equal(runtime.controlPlaneRuntime.get()?.version, 2, "publishing reloads the runtime");
    const routeRow = await db.queryOne<any>("SELECT rpm FROM cp_routes WHERE id = ?", [qwenRoute.id]);
    assert.equal(Number(routeRow.rpm), qwenRoute.rpm + 1, "entity tables follow the published version");
    const audit = await db.queryMany<any>("SELECT action, outcome FROM admin_audit_events WHERE action LIKE 'cp.%' ORDER BY created_at");
    assert.ok(audit.some((row) => row.action === "cp.change_request.publish" && row.outcome === "success"), "writes are audited");

    // ------------------------------------------ rebase onto a newer version
    const flash = backfill.content.routes.find((route) => route.model_id === "qwen-flash")!;
    const turbo = backfill.content.routes.find((route) => route.model_id === "qwen-turbo")!;
    const a = await flow([{ op: "upsert", entity: "route", id: flash.id, value: { ...flash, weight: 7 } }]);
    const b = await flow([{ op: "upsert", entity: "route", id: turbo.id, value: { ...turbo, weight: 9 } }]);
    for (const item of [a, b]) {
      await call("POST", `${P}/change-requests/${item}/validate`, ADMIN);
      await call("POST", `${P}/change-requests/${item}/approve`, ADMIN);
    }
    assert.equal((await call("POST", `${P}/change-requests/${a}/publish`, ADMIN)).body.data.version, 3);
    assert.equal((await call("POST", `${P}/change-requests/${b}/publish`, ADMIN)).body.data.version, 4, "b is rebased and re-validated on v3");
    const v4 = await store.getVersion(4);
    assert.equal(v4!.content.routes.find((route) => route.id === flash.id)!.weight, 7, "a's change survives");

    // ------------------------------------------------- validation failures
    const broken = await flow([{ op: "upsert", entity: "route", id: "dashscope:ghost", value: { ...qwenRoute, id: "dashscope:ghost", model_id: "ghost-model" } }]);
    const brokenResult = await call("POST", `${P}/change-requests/${broken}/validate`, ADMIN);
    assert.equal(brokenResult.body.data.status, "draft");
    assert.ok(brokenResult.body.data.validation.errors.some((issue: any) => issue.check === "route_references"));
    assert.equal((await call("POST", `${P}/change-requests/${broken}/reject`, ADMIN, { reason: "no" })).status, 400, "reject needs a reason");
    assert.equal((await call("POST", `${P}/change-requests/${broken}/reject`, ADMIN, { reason: "invalid route" })).body.data.status, "rejected");

    // -------------------------------------------------------- lifecycle
    const qwen = clone(backfill.content.models.find((model) => model.id === "qwen-plus")!);
    const newModel = { ...clone(qwen), id: "qwen-plus-next", lifecycle: "active", preview_user_ids: [] };
    const newRoute = { ...clone(qwenRoute), id: "dashscope:qwen-plus-next", model_id: "qwen-plus-next" };
    const tooFast = await flow([
      { op: "upsert", entity: "model", id: newModel.id, value: newModel },
      { op: "upsert", entity: "route", id: newRoute.id, value: newRoute },
    ]);
    const tooFastResult = await call("POST", `${P}/change-requests/${tooFast}/validate`, ADMIN);
    assert.ok(tooFastResult.body.data.validation.errors.some((issue: any) => issue.check === "lifecycle"), "new models start as draft");

    const draft = await flow([
      { op: "upsert", entity: "model", id: newModel.id, value: { ...newModel, lifecycle: "draft" } },
      { op: "upsert", entity: "route", id: newRoute.id, value: newRoute },
    ]);
    await call("POST", `${P}/change-requests/${draft}/validate`, ADMIN);
    await call("POST", `${P}/change-requests/${draft}/approve`, ADMIN);
    assert.equal((await call("POST", `${P}/change-requests/${draft}/publish`, ADMIN)).status, 200);

    const preview = await flow([{ op: "upsert", entity: "model", id: newModel.id, value: { ...newModel, lifecycle: "preview", preview_user_ids: ["user-a"] } }]);
    const noProbe = await call("POST", `${P}/change-requests/${preview}/validate`, ADMIN);
    assert.ok(noProbe.body.data.validation.errors.some((issue: any) => issue.check === "probe"), "preview needs probe evidence");
    await db.execute(
      "INSERT INTO cp_route_probe_results (id, route_id, model_id, account_id, protocol, capability, ok, expected, probed_at) VALUES ('p1', ?, ?, 'dashscope', 'openai.chat', 'text', TRUE, TRUE, NOW())",
      [newRoute.id, newModel.id]
    );
    const withProbe = await call("POST", `${P}/change-requests/${preview}/validate`, ADMIN);
    assert.equal(withProbe.body.data.status, "validated", JSON.stringify(withProbe.body.data.validation.errors));
    await call("POST", `${P}/change-requests/${preview}/approve`, ADMIN);
    await call("POST", `${P}/change-requests/${preview}/publish`, ADMIN);
    const previewSnapshot = runtime.controlPlaneRuntime.get()!;
    assert.equal(runtime.isModelServable(previewSnapshot.models.get(newModel.id)!, "user-a"), true);
    assert.equal(runtime.isModelServable(previewSnapshot.models.get(newModel.id)!, "user-b"), false);
    assert.equal(runtime.listedCatalog(previewSnapshot).some((model) => model.id === newModel.id), false);

    // active → retired directly is refused; deprecated (with date) → retired works
    const skip = await flow([{ op: "upsert", entity: "model", id: "qwen-turbo", value: { ...clone(backfill.content.models.find((m) => m.id === "qwen-turbo")!), lifecycle: "retired" } }]);
    assert.ok((await call("POST", `${P}/change-requests/${skip}/validate`, ADMIN)).body.data.validation.errors.some((issue: any) => issue.check === "lifecycle"));
    const turboModel = clone(backfill.content.models.find((m) => m.id === "qwen-turbo")!);
    const deprecate = await flow([{ op: "upsert", entity: "model", id: "qwen-turbo", value: { ...turboModel, lifecycle: "deprecated", deprecation_date: "2026-12-31", replacement_model_id: "qwen-flash" } }]);
    for (const step of ["validate", "approve", "publish"]) assert.equal((await call("POST", `${P}/change-requests/${deprecate}/${step}`, ADMIN)).status, 200, step);
    const retire = await flow([{ op: "upsert", entity: "model", id: "qwen-turbo", value: { ...turboModel, lifecycle: "retired", deprecation_date: "2026-12-31", replacement_model_id: "qwen-flash" } }]);
    for (const step of ["validate", "approve", "publish"]) assert.equal((await call("POST", `${P}/change-requests/${retire}/${step}`, ADMIN)).status, 200, step);
    process.env.NF_CP_MODE = "enforce";
    const ctx = new InferenceContext("unit", { headers: {}, path: "/" } as any, {} as any);
    assert.equal(stages.resolveModel(ctx, "qwen-turbo"), false);
    assert.equal(stages.modelNotFoundMessage(ctx, "qwen-turbo"), "Model 'qwen-turbo' has been retired. Use 'qwen-flash' instead.");
    delete process.env.NF_CP_MODE;

    // --------------------------------------------------------- versions
    const versions = await call("GET", `${P}/versions`, VIEWER);
    const latest = versions.body.data[0].version;
    const diff = await call("GET", `${P}/versions/diff?from=1&to=2`, VIEWER);
    assert.deepEqual(diff.body.data.map((item: any) => item.id), [qwenRoute.id]);
    assert.equal((await call("POST", `${P}/versions/1/rollback`, ADMIN, { reason: "x" })).status, 400, "rollback needs a reason");
    const rolled = await call("POST", `${P}/versions/1/rollback`, ADMIN, { reason: "restore backfill" });
    assert.equal(rolled.body.data.version, latest + 1, "a rollback is a new version");
    const restored = await store.getCurrentVersion();
    assert.equal(restored!.contentSha256, backfill.contentSha256);
    assert.equal(runtime.controlPlaneRuntime.get()?.version, latest + 1);

    // ---------------------------------------------------- price check
    const cheap = clone(backfill.content);
    const cheapModel = cheap.models.find((model) => model.id === "qwen-plus")!;
    (cheapModel.pricing as any).promptPrice = 0.0001;
    const priceWarnings = cr.priceIssues(backfill.content, cheap);
    assert.ok(priceWarnings.some((issue) => issue.id === "qwen-plus" && /below the official/.test(issue.message)), "prices below the official snapshot warn");
    assert.deepEqual(cr.priceIssues(backfill.content, clone(backfill.content)), [], "unchanged prices are not re-checked");

    // ------------------------------------------------------ YAML export
    const files = exporter.renderSnapshot(backfill.content, { version: 1, sha256: backfill.contentSha256, publishedAt: null, publishedBy: "test" });
    const again = exporter.renderSnapshot(clone(backfill.content), { version: 1, sha256: backfill.contentSha256, publishedAt: null, publishedBy: "test" });
    assert.deepEqual(files, again, "export is deterministic");
    assert.deepEqual(yaml.load(files["routes.yaml"]), JSON.parse(JSON.stringify(backfill.content.routes)), "YAML round-trips");
    assert.deepEqual(yaml.load(files["models.yaml"]).map((model: any) => model.id), [...backfill.content.models.map((model) => model.id)].sort((x, y) => x.localeCompare(y)));
    assert.equal(/api_key|sk-/.test(files["accounts.yaml"]), false, "no secrets in snapshots");

    // ----------------------------------------------- CLI change requests
    const current = (await store.getCurrentVersion())!;
    const ops = cliChange.accountRouteOperations(current.content, "himodels", "active", [{
      modelId: "claude-sonnet-4-6", upstreamModelId: "claude-sonnet-4-6", nativeProtocols: ["anthropic.messages"],
      limits: { rpm: 1000, tpm: 1_000_000, daily: 100_000, concurrency: 0, priority: 10, weight: 100 },
    }], "active");
    assert.deepEqual(ops.map((op) => `${op.entity}:${op.id}`), ["account:himodels", "route:himodels:claude-sonnet-4-6"]);
    const proposed = await cliChange.proposeChange({ title: "cli", reason: "cli test", author: "cli:test", source: "cli:test", build: () => ops });
    assert.equal(proposed!.source, "cli:test");
    assert.equal((await store.getCurrentVersion())!.version, current.version, "the CLI never publishes by itself");
    assert.equal(await cliChange.proposeChange({ title: "noop", reason: "", author: "cli", source: "cli", build: () => [] }), null);

    console.log("control-plane change request tests passed");
  } finally {
    runtime.controlPlaneRuntime.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main()
  .then(async () => {
    await closeDb().catch(() => undefined);
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
