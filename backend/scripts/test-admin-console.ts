// Admin console fixes (2026-09-27): least-privilege billing CSV export, real
// model availability in the catalog, and correct status codes / validation on
// the limit and discount editors used by the customer screen.
import assert from "assert";
import express from "express";
import { Server } from "http";
import adminControlPlaneRouter from "../src/routes/admin-control-plane";
import adminRouter from "../src/routes/admin";
import rateLimitsRouter from "../src/routes/ratelimits";
import discountsRouter from "../src/routes/discounts";
import { closeDb, db } from "../src/db/client";
import { summarizeModelRoutes, routeSummaryFor } from "../src/data/model-availability";
import { changesBetween, loadReleaseHistory, type ReleaseCommit } from "../src/data/release-history";

process.env.ADMIN_EMAILS = "local-test@nexusflow.test";

async function addUser(id: string, email: string, role: string | null, parent: string | null = null): Promise<string> {
  const now = new Date();
  await db.execute(
    `INSERT INTO users (id, email, nickname, balance, credit_balance, status, parent_user_id, created_at, updated_at)
     VALUES (?, ?, ?, 10, 0, 'active', ?, ?, ?)`,
    [id, email, id, parent, now.toISOString(), now.toISOString()]
  );
  const token = `sess-${id}`;
  await db.execute(
    "INSERT INTO sessions (id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    [`session-${id}`, id, token, now.toISOString(), new Date(now.getTime() + 3_600_000).toISOString()]
  );
  if (role) {
    await db.execute(
      `INSERT INTO admin_role_assignments (id, user_id, role, is_active, granted_by, reason, created_at, updated_at)
       VALUES (?, ?, ?, TRUE, 'local-user-1', 'admin console test', ?, ?)`,
      [`assignment-${id}`, id, role, now.toISOString(), now.toISOString()]
    );
  }
  return token;
}

async function main() {
  // Pure availability rule: a route counts only if both the route and its
  // provider are enabled.
  const summaries = summarizeModelRoutes(
    [
      { provider_id: "dashscope", model_id: "m-live", is_enabled: true },
      { provider_id: "off", model_id: "m-live", is_enabled: true },
      { provider_id: "dashscope", model_id: "m-disabled", is_enabled: false },
      { provider_id: "off", model_id: "m-provider-off", is_enabled: true },
    ],
    [{ id: "dashscope", status: "enabled" }, { id: "off", status: "disabled" }]
  );
  assert.equal(routeSummaryFor(summaries, "m-live").availability, "available");
  assert.equal(routeSummaryFor(summaries, "m-live").enabledRoutes, 1);
  assert.equal(routeSummaryFor(summaries, "m-live").totalRoutes, 2);
  assert.equal(routeSummaryFor(summaries, "m-disabled").availability, "no_active_route");
  assert.equal(routeSummaryFor(summaries, "m-provider-off").availability, "no_active_route");
  assert.equal(routeSummaryFor(summaries, "m-none").availability, "no_route");

  // Release changes: commits since the previous successful release.
  const sha = (n: number) => String(n).padStart(40, "0").replace(/0/g, "a").slice(0, 39) + n;
  const history: ReleaseCommit[] = [5, 4, 3, 2, 1].map((n) => ({ sha: sha(n), author: "t", date: "2026-09-27", subject: `c${n}`, body: "" }));
  assert.deepEqual(changesBetween(history, sha(5), sha(3)).commits.map((c) => c.subject), ["c5", "c4"]);
  assert.equal(changesBetween(history, sha(5), sha(3)).truncated, false);
  assert.equal(changesBetween(history, sha(9), sha(3)).available, false, "release not in history");
  const noBase = changesBetween(history, sha(4), null);
  assert.equal(noBase.truncated, true);
  assert.deepEqual(noBase.commits.map((c) => c.subject), ["c4", "c3", "c2", "c1"]);
  assert.equal(changesBetween(history, sha(4), sha(4)).commits.length, 0, "redeploy of the same SHA");
  assert.deepEqual(loadReleaseHistory("/nonexistent/release-history.json"), []);

  const financeToken = await addUser("finance-user", "finance@nexusflow.test", "finance");
  const viewerToken = await addUser("viewer-user", "viewer@nexusflow.test", "viewer");
  const supportToken = await addUser("support-user", "support@nexusflow.test", "support");
  await addUser("sub-user", "sub@nexusflow.test", null, "local-user-1");

  const app = express();
  app.use(express.json());
  app.use("/api/billing", discountsRouter);
  app.use("/api/rate-limits", rateLimitsRouter);
  app.use("/api/admin", adminControlPlaneRouter);
  app.use("/api/admin", adminRouter);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, message: error?.message || String(error) });
  });
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (path: string, token: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const text = await response.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* CSV */ }
    return { status: response.status, body, contentType: response.headers.get("content-type") || "" };
  };

  try {
    // Billing CSV: finance (billing.read, no legacy.admin) can export on both
    // paths; a support operator (no billing.read) cannot.
    for (const path of ["/api/admin/customers/local-user-1/billing-export.csv", "/api/admin/users/local-user-1/billing-export.csv"]) {
      const csv = await call(path, financeToken);
      assert.equal(csv.status, 200, `${path} ${JSON.stringify(csv.body).slice(0, 200)}`);
      assert.match(csv.contentType, /text\/csv/);
      assert.match(String(csv.body), /usage_id/);
    }
    assert.equal((await call("/api/admin/customers/local-user-1/billing-export.csv", supportToken)).status, 403);
    assert.equal((await call("/api/admin/customers/missing-user/billing-export.csv", financeToken)).status, 404);

    // Model catalog carries real availability instead of "unknown".
    const catalog = await call("/api/admin/model-catalog", viewerToken);
    assert.equal(catalog.status, 200);
    for (const model of catalog.body.data.models) {
      assert(["available", "no_active_route", "no_route"].includes(model.availability), `${model.id} availability ${model.availability}`);
      assert.equal(typeof model.enabledRoutes, "number");
    }
    assert.equal(
      catalog.body.data.unroutedCount,
      catalog.body.data.models.filter((m: any) => m.availability !== "available").length
    );
    assert(catalog.body.data.truth.sources.includes("provider_capacity"));

    // Rate-limit editor: unknown model 400, unknown user 404, delete of a
    // missing rule 404 (was HTTP 200 + success:false).
    const put = (userId: string, model: string, token = supportToken) =>
      call(`/api/rate-limits/admin/users/${encodeURIComponent(userId)}/models/${encodeURIComponent(model)}`, token, {
        method: "PUT",
        body: JSON.stringify({ qpm: 100, tpm: 100000 }),
      });
    assert.equal((await put("local-user-1", "not-a-model")).status, 400);
    assert.equal((await put("missing-user", "*")).status, 404);
    assert.equal((await put("local-user-1", "*", viewerToken)).status, 403);
    const setDefault = await put("local-user-1", "*");
    assert.equal(setDefault.status, 200, JSON.stringify(setDefault.body));
    const del = (model: string) => call(`/api/rate-limits/admin/users/local-user-1/models/${encodeURIComponent(model)}`, supportToken, { method: "DELETE" });
    assert.equal((await del("*")).status, 200);
    assert.equal((await del("*")).status, 404);

    // Discount editor: finance may write; unknown model 400 (prefix patterns
    // allowed), unknown user 404, sub-account 400, missing delete 404.
    const discount = (body: Record<string, unknown>, token = financeToken) =>
      call("/api/billing/admin/user-model-discounts", token, { method: "POST", body: JSON.stringify(body) });
    assert.equal((await discount({ userId: "local-user-1", modelId: "not-a-model", discountRate: 0.9 })).status, 400);
    assert.equal((await discount({ userId: "missing-user", modelId: "*", discountRate: 0.9 })).status, 404);
    assert.equal((await discount({ userId: "sub-user", modelId: "*", discountRate: 0.9 })).status, 400);
    assert.equal((await discount({ userId: "local-user-1", modelId: "*", discountRate: 0.9 }, viewerToken)).status, 403);
    const prefix = await discount({ userId: "local-user-1", modelId: "qwen*", discountRate: 0.8, notes: "prefix" });
    assert.equal(prefix.status, 200, JSON.stringify(prefix.body));
    const removed = await call(`/api/billing/admin/user-model-discounts/${encodeURIComponent(prefix.body.data.id)}`, financeToken, { method: "DELETE" });
    assert.equal(removed.status, 200);
    const missing = await call(`/api/billing/admin/user-model-discounts/${encodeURIComponent(prefix.body.data.id)}`, financeToken, { method: "DELETE" });
    assert.equal(missing.status, 404);

    console.log("admin console tests passed");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
