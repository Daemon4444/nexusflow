import assert from "assert";
import express from "express";
import { Server } from "http";
import adminControlPlaneRouter from "../src/routes/admin-control-plane";
import adminRouter from "../src/routes/admin";
import providerRouter from "../src/routes/provider";
import usageRouter from "../src/routes/usage";
import { redactAuditData } from "../src/data/admin-audit";
import { closeDb, db } from "../src/db/client";
import { logUsage } from "../src/data/usage";
import { assignAdminRoleWithAudit } from "../src/data/admin-access";
import {
  createCostVersion,
  getActiveCostVersion,
  getActiveCostVersions,
} from "../src/data/provider-operations";
import {
  approveRateLimitRequest,
  RateLimitApprovalError,
} from "../src/data/ratelimits";
import { upsertUserModelDiscount } from "../src/data/user-discounts";

process.env.ADMIN_EMAILS = "local-test@nexusflow.test,demo-real-admin@nexusflow.test";
process.env.DEMO_ADMIN_EMAILS = "demo-real-admin@nexusflow.test";

function assertNoPasswordHash(payload: unknown, label: string): void {
  const serialized = JSON.stringify(payload);
  assert(!serialized.includes("password_hash"), `${label} leaked password_hash`);
  assert(!serialized.includes("passwordHash"), `${label} leaked passwordHash`);
  assert(
    !serialized.includes("red-team-sensitive-hash-value"),
    `${label} leaked stored authentication material`
  );
}

function assertFieldsAbsent(
  value: Record<string, unknown>,
  fields: string[],
  label: string
): void {
  for (const field of fields) {
    assert(!(field in value), `${label} exposed forbidden field ${field}`);
  }
}

async function main() {
  const now = new Date();
  await db.execute(
    "UPDATE users SET password_hash = ? WHERE id = ?",
    ["red-team-sensitive-hash-value", "local-user-1"]
  );
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, status, created_at, updated_at
     ) VALUES (?, ?, ?, 0, 0, 'active', ?, ?)`,
    ["viewer-user", "viewer@nexusflow.test", "Viewer", now.toISOString(), now.toISOString()]
  );
  await db.execute(
    "INSERT INTO sessions (id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    [
      "viewer-session",
      "viewer-user",
      "sess-viewer-test",
      now.toISOString(),
      new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    ]
  );
  await db.execute(
    `INSERT INTO admin_role_assignments (
       id, user_id, role, is_active, granted_by, reason, created_at, updated_at
     ) VALUES (?, ?, 'viewer', TRUE, ?, ?, ?, ?)`,
    [
      "viewer-assignment",
      "viewer-user",
      "local-user-1",
      "control-plane integration test",
      now.toISOString(),
      now.toISOString(),
    ]
  );
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, status, created_at, updated_at
     ) VALUES (?, ?, ?, 321, 45, 'active', ?, ?)`,
    ["support-user", "support@nexusflow.test", "Support", now.toISOString(), now.toISOString()]
  );
  await db.execute(
    "INSERT INTO sessions (id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    [
      "support-session",
      "support-user",
      "sess-support-test",
      now.toISOString(),
      new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    ]
  );
  await db.execute(
    `INSERT INTO admin_role_assignments (
       id, user_id, role, is_active, granted_by, reason, created_at, updated_at
     ) VALUES (?, ?, 'support', TRUE, ?, ?, ?, ?)`,
    [
      "support-assignment",
      "support-user",
      "local-user-1",
      "field-level RBAC integration test",
      now.toISOString(),
      now.toISOString(),
    ]
  );
  await upsertUserModelDiscount({
    userId: "local-user-1",
    modelId: "*",
    discountRate: 0.5,
    notes: "local tenant discount isolation fixture",
    createdBy: "local-user-1",
  });
  await upsertUserModelDiscount({
    userId: "viewer-user",
    modelId: "*",
    discountRate: 0.2,
    notes: "foreign tenant discount isolation fixture",
    createdBy: "local-user-1",
  });
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, status, created_at, updated_at
     ) VALUES (?, ?, ?, 0, 0, 'active', ?, ?)`,
    [
      "demo-real-admin",
      "demo-real-admin@nexusflow.test",
      "Demo must stay isolated",
      now.toISOString(),
      now.toISOString(),
    ]
  );
  await db.execute(
    "INSERT INTO sessions (id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    [
      "demo-real-admin-session",
      "demo-real-admin",
      "sess-demo-real-admin",
      now.toISOString(),
      new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    ]
  );
  await db.execute(
    `INSERT INTO admin_role_assignments (
       id, user_id, role, is_active, granted_by, reason, created_at, updated_at
     ) VALUES (?, ?, 'admin', TRUE, ?, ?, ?, ?)`,
    [
      "demo-stale-real-role",
      "demo-real-admin",
      "local-user-1",
      "stale role must never cross demo boundary",
      now.toISOString(),
      now.toISOString(),
    ]
  );

  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminControlPlaneRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/provider", providerRouter);
  app.use("/api/usage", usageRouter);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, message: error?.message || String(error) });
  });
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const call = async (
    path: string,
    token: string,
    init: RequestInit = {}
  ): Promise<{ status: number; body: any }> => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    const superSession = await call("/api/admin/session", "sess-local-test");
    assert.equal(superSession.status, 200);
    assertNoPasswordHash(superSession.body, "admin session");
    assert.equal(superSession.body.data.role, "super_admin");
    assert(superSession.body.data.permissions.includes("billing.manage"));
    assert(superSession.body.data.permissions.includes("security.manage"));

    const viewerSession = await call("/api/admin/session", "sess-viewer-test");
    assert.equal(viewerSession.status, 200);
    assertNoPasswordHash(viewerSession.body, "viewer admin session");
    assert.equal(viewerSession.body.data.role, "viewer");
    assert(!viewerSession.body.data.permissions.includes("billing.manage"));

    const supportSession = await call("/api/admin/session", "sess-support-test");
    assert.equal(supportSession.status, 200);
    assert.equal(supportSession.body.data.role, "support");
    assert(!supportSession.body.data.permissions.includes("billing.read"));
    assert(!supportSession.body.data.permissions.includes("finance.read"));
    assert(!supportSession.body.data.permissions.includes("providers.read"));

    // Demo and real administration are a hard server-side partition. Even an
    // address present in both ADMIN_EMAILS and an active DB role stays out.
    const isolatedDemoSession = await call("/api/admin/session", "sess-demo-real-admin");
    assert.equal(isolatedDemoSession.status, 403);
    assert.equal(isolatedDemoSession.body.code, "admin_forbidden");
    const isolatedDemoGlobalUsage = await call(
      "/api/usage/overview?scope=all",
      "sess-demo-real-admin"
    );
    assert.equal(isolatedDemoGlobalUsage.status, 403);
    assert.equal(isolatedDemoGlobalUsage.body.code, "global_usage_forbidden");
    const realAdminGlobalUsage = await call(
      "/api/usage/overview?scope=all",
      "sess-local-test"
    );
    assert.equal(realAdminGlobalUsage.status, 200);
    const demoRoleAttempt = await call(
      "/api/admin/control-plane/access/assignments",
      "sess-local-test",
      {
        method: "POST",
        body: JSON.stringify({
          userId: "demo-real-admin",
          role: "finance",
          reason: "demo account must be rejected",
        }),
      }
    );
    assert.equal(demoRoleAttempt.status, 409);
    assert.equal(demoRoleAttempt.body.code, "demo_admin_isolated");
    const demoFinanceRole = await db.queryOne<any>(
      "SELECT id FROM admin_role_assignments WHERE user_id = ? AND role = 'finance'",
      ["demo-real-admin"]
    );
    assert.equal(demoFinanceRole, null);

    // Assignment + success audit are committed together. Revocation preserves
    // the original grant actor and records the distinct revoke actor.
    const roleGrant = await call(
      "/api/admin/control-plane/access/assignments",
      "sess-local-test",
      {
        method: "POST",
        body: JSON.stringify({
          userId: "viewer-user",
          role: "admin",
          reason: "transactional role grant regression",
        }),
      }
    );
    assert.equal(roleGrant.status, 200);
    assert.equal(roleGrant.body.data.granted_by, "local-user-1");
    assert.equal(roleGrant.body.data.revoked_by, null);
    const roleAssignmentId = roleGrant.body.data.id;

    const elevatedViewer = await call("/api/admin/session", "sess-viewer-test");
    assert.equal(elevatedViewer.status, 200);
    assert.equal(elevatedViewer.body.data.role, "admin");
    const roleRevoke = await call(
      `/api/admin/control-plane/access/assignments/${roleAssignmentId}`,
      "sess-viewer-test",
      {
        method: "DELETE",
        body: JSON.stringify({ reason: "transactional role revoke regression" }),
      }
    );
    assert.equal(roleRevoke.status, 200);
    assert.equal(roleRevoke.body.data.granted_by, "local-user-1");
    assert.equal(roleRevoke.body.data.revoked_by, "viewer-user");
    const persistedRole = await db.queryOne<any>(
      "SELECT granted_by, revoked_by, is_active FROM admin_role_assignments WHERE id = ?",
      [roleAssignmentId]
    );
    assert.equal(persistedRole?.granted_by, "local-user-1");
    assert.equal(persistedRole?.revoked_by, "viewer-user");
    assert.equal(!!persistedRole?.is_active, false);
    const roleSuccessAudits = await db.queryOne<{ count: number | string }>(
      `SELECT COUNT(*) AS count
         FROM admin_audit_events
        WHERE resource_id = ?
          AND action IN ('access.role.assign', 'access.role.revoke')
          AND outcome = 'success'`,
      [roleAssignmentId]
    );
    assert.equal(Number(roleSuccessAudits?.count), 2);

    // Force the audit insert to violate its NOT NULL request_id constraint.
    // The role row must roll back with it.
    await assert.rejects(
      assignAdminRoleWithAudit({
        userId: "viewer-user",
        role: "support",
        grantedBy: "local-user-1",
        reason: "audit failure rollback regression",
        audit: {
          actorUserId: "local-user-1",
          actorRole: "super_admin",
          actorEmail: "local-test@nexusflow.test",
          requestId: null as unknown as string,
          method: "POST",
          path: "/test/atomic-role-audit",
        },
      })
    );
    const rolledBackRole = await db.queryOne<any>(
      "SELECT id FROM admin_role_assignments WHERE user_id = ? AND role = 'support'",
      ["viewer-user"]
    );
    assert.equal(rolledBackRole, null, "audit failure must roll back role mutation");

    const catalog = await call("/api/admin/model-catalog", "sess-viewer-test");
    assert.equal(catalog.status, 200);
    assert(Array.isArray(catalog.body.data.models));
    assert.equal(typeof catalog.body.data.staticCount, "number");
    assert.equal(catalog.body.data.truth.sources.includes("model_overrides"), true);

    const legacyUsers = await call("/api/admin/users", "sess-local-test");
    assert.equal(legacyUsers.status, 200);
    assertNoPasswordHash(legacyUsers.body, "legacy admin users");

    const legacyUserDetail = await call(
      "/api/admin/users/local-user-1/detail",
      "sess-local-test"
    );
    assert.equal(
      legacyUserDetail.status,
      200,
      `legacy user detail failed: ${JSON.stringify(legacyUserDetail.body)}`
    );
    assertNoPasswordHash(legacyUserDetail.body, "legacy admin user detail");
    assert.equal(legacyUserDetail.body.data.user.has_password, true);

    const customers = await call("/api/admin/customers?range=30d", "sess-local-test");
    assert.equal(customers.status, 200);
    assertNoPasswordHash(customers.body, "admin customers");

    const providerCountBefore = await db.queryOne<{ count: string | number }>(
      "SELECT COUNT(*) AS count FROM providers"
    );
    const providerRead = await call("/api/provider/admin/providers", "sess-local-test");
    assert.equal(providerRead.status, 200);
    const providerCountAfter = await db.queryOne<{ count: string | number }>(
      "SELECT COUNT(*) AS count FROM providers"
    );
    assert.equal(
      Number(providerCountAfter?.count),
      Number(providerCountBefore?.count),
      "provider GET must not bootstrap or mutate provider rows"
    );

    // Reusing a client Idempotency-Key on ordinary (non-idempotent) writes must
    // never suppress the second audit event.
    const reusedAuditHeader = { "Idempotency-Key": "generic-audit-reused-key" };
    for (const suffix of ["one", "two"]) {
      const providerWrite = await call(
        "/api/provider/admin/providers",
        "sess-local-test",
        {
          method: "POST",
          headers: reusedAuditHeader,
          body: JSON.stringify({
            name: `Generic audit ${suffix}`,
            api_base_url: `https://dashscope.aliyuncs.com/generic-audit-${suffix}/v1`,
            api_key: `generic-audit-key-${suffix}`,
            contact_email: `generic-audit-${suffix}@example.invalid`,
          }),
        }
      );
      assert.equal(providerWrite.status, 200);
    }
    let genericAuditCount = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      const row = await db.queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count
           FROM admin_audit_events
          WHERE action = 'post /api/provider/admin/providers'
            AND outcome = 'success'`
      );
      genericAuditCount = Number(row?.count || 0);
      if (genericAuditCount >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert(genericAuditCount >= 2, "each generic mutation must retain its own audit event");
    const genericAuditIdempotencyKeys = await db.queryMany<{ idempotency_key: string | null }>(
      `SELECT idempotency_key
         FROM admin_audit_events
        WHERE action = 'post /api/provider/admin/providers'`
    );
    assert(
      genericAuditIdempotencyKeys.every((row) => row.idempotency_key === null),
      "generic audit events must not trust a caller-provided idempotency key"
    );

    const overview = await call("/api/admin/control-plane/overview?range=24h", "sess-viewer-test");
    assert.equal(overview.status, 200);
    assert.equal(overview.body.success, true);
    const metric = (key: string) => overview.body.data.metrics.find((item: any) => item.key === key)?.value;
    assert.equal(metric("upstreamCost"), null, "unknown upstream cost must stay null");
    assert.equal(metric("grossProfit"), null, "gross profit must not be inferred without complete costs");
    assert.equal(overview.body.data.truth.timezone, "Asia/Shanghai");

    // Support can diagnose customer and traffic health, but field-level RBAC
    // keeps customer balances, pricing, ledger identifiers and provider cost
    // attribution out of every operational response.
    const supportOverview = await call(
      "/api/admin/control-plane/overview?range=24h",
      "sess-support-test"
    );
    assert.equal(supportOverview.status, 200);
    const supportMetricKeys = supportOverview.body.data.metrics.map((item: any) => item.key);
    for (const key of [
      "revenue",
      "upstreamCost",
      "grossProfit",
      "grossMargin",
      "reservedBalance",
      "creditExposure",
    ]) {
      assert(!supportMetricKeys.includes(key), `support overview exposed ${key}`);
    }
    assert(
      supportOverview.body.data.topCustomers.every((item: any) => !("cost" in item)),
      "support overview exposed customer cost"
    );
    assert(!("upstreamCost" in supportOverview.body.data.truth.coverage));

    const supportCustomers = await call(
      "/api/admin/customers?range=30d",
      "sess-support-test"
    );
    assert.equal(supportCustomers.status, 200);
    assert(supportCustomers.body.data.items.length > 0);
    for (const item of supportCustomers.body.data.items) {
      assertFieldsAbsent(
        item,
        ["balance", "creditBalance", "availableBalance", "totalCost"],
        "support customer list"
      );
    }

    const supportCustomerDetail = await call(
      "/api/admin/customers/local-user-1/control-plane?range=30d",
      "sess-support-test"
    );
    assert.equal(supportCustomerDetail.status, 200);
    assertFieldsAbsent(
      supportCustomerDetail.body.data.customer,
      ["balance", "creditBalance", "availableBalance", "totalCost"],
      "support customer detail"
    );
    assertFieldsAbsent(
      supportCustomerDetail.body.data.usage,
      ["totalCost"],
      "support customer usage"
    );
    assert(
      supportCustomerDetail.body.data.byModel.every((item: any) => !("cost" in item))
    );
    assert(!("transactions" in supportCustomerDetail.body.data));
    assert(!("discounts" in supportCustomerDetail.body.data));
    for (const item of supportCustomerDetail.body.data.recentRequests) {
      assertFieldsAbsent(
        item,
        ["cost", "providerCost", "costVersionId", "reservationId", "transactionId"],
        "support recent request"
      );
    }

    const supportTraffic = await call(
      "/api/admin/traffic?range=24h",
      "sess-support-test"
    );
    assert.equal(supportTraffic.status, 200);
    assert(supportTraffic.body.data.items.length > 0);
    for (const item of supportTraffic.body.data.items) {
      assertFieldsAbsent(
        item,
        ["cost", "providerCost", "costVersionId", "reservationId", "transactionId"],
        "support traffic list"
      );
    }
    const supportTrafficIdentifier =
      supportTraffic.body.data.items[0].requestId || supportTraffic.body.data.items[0].id;
    const supportTrafficDetail = await call(
      `/api/admin/logs/${encodeURIComponent(supportTrafficIdentifier)}/detail`,
      "sess-support-test"
    );
    assert.equal(supportTrafficDetail.status, 200);
    assertFieldsAbsent(
      supportTrafficDetail.body.data.structural,
      ["cost", "providerCost", "costVersionId", "reservationId", "transactionId"],
      "support traffic detail"
    );

    const supportGlobalOverview = await call(
      "/api/usage/overview?scope=all",
      "sess-support-test"
    );
    assert.equal(supportGlobalOverview.status, 200);
    assertFieldsAbsent(supportGlobalOverview.body.data, ["totalCost"], "support global overview");
    for (const path of [
      "/api/usage?scope=all",
      "/api/usage/daily?scope=all",
      "/api/usage/by-model?scope=all",
      "/api/usage/recent?scope=all",
      "/api/usage/monitor/recent?scope=all",
    ]) {
      const response = await call(path, "sess-support-test");
      assert.equal(response.status, 200, `${path} failed`);
      assert(Array.isArray(response.body.data), `${path} did not return an array`);
      for (const item of response.body.data) {
        assertFieldsAbsent(item, ["cost", "totalCost"], `support ${path}`);
        if (path.includes("/recent?")) {
          assertFieldsAbsent(item, ["discount_rate", "list_cost"], `support ${path}`);
        }
      }
    }

    const globalRecent = await call(
      "/api/usage/recent?scope=all",
      "sess-local-test"
    );
    assert.equal(globalRecent.status, 200);
    assert(globalRecent.body.data.length > 0);
    assert("cost" in globalRecent.body.data[0], "finance-capable global usage lost realized cost");
    for (const item of globalRecent.body.data) {
      assertFieldsAbsent(
        item,
        ["discount_rate", "list_cost"],
        "cross-tenant recent usage"
      );
    }
    const ownRecent = await call("/api/usage/recent", "sess-local-test");
    assert.equal(ownRecent.status, 200);
    assert(ownRecent.body.data.length > 0);
    assert.equal(ownRecent.body.data[0].discount_rate, 0.5);

    await db.execute(
      "UPDATE usage_logs SET provider_cost = 1, estimated = FALSE WHERE status = 'success'"
    );
    const fullyCosted = await call("/api/admin/finance/overview?range=30d", "sess-local-test");
    assert.equal(fullyCosted.status, 200);
    assert.equal(fullyCosted.body.data.summary.upstreamCost, 2);
    assert.equal(typeof fullyCosted.body.data.transactions.items[0].userId, "string");
    assert("userEmail" in fullyCosted.body.data.transactions.items[0]);
    assert("userNickname" in fullyCosted.body.data.transactions.items[0]);
    await db.execute(
      "UPDATE usage_logs SET provider_cost = 999, estimated = TRUE WHERE id = (SELECT MIN(id) FROM usage_logs WHERE status = 'success')"
    );
    const estimatedCost = await call("/api/admin/finance/overview?range=30d", "sess-local-test");
    assert.equal(estimatedCost.status, 200);
    assert.equal(
      estimatedCost.body.data.summary.upstreamCost,
      null,
      "estimated usage must make verified upstream cost incomplete, not inflate the total"
    );
    assert.equal(estimatedCost.body.data.truth.coverage.upstreamCost.excludesEstimatedUsage, true);

    const forbidden = await call(
      "/api/admin/control-plane/finance/adjustments/local-user-1/balance",
      "sess-viewer-test",
      {
        method: "POST",
        headers: { "Idempotency-Key": "viewer-forbidden" },
        body: JSON.stringify({ amountDelta: 7, reason: "viewer must be denied" }),
      }
    );
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.code, "admin_permission_denied");

    await db.execute(
      `INSERT INTO admin_role_assignments (
         id, user_id, role, is_active, granted_by, reason, created_at, updated_at
       ) VALUES (?, ?, 'finance', TRUE, ?, ?, ?, ?)`,
      [
        "finance-assignment",
        "viewer-user",
        "local-user-1",
        "finance compatibility path test",
        now.toISOString(),
        now.toISOString(),
      ]
    );
    const financeCompatibility = await call(
      "/api/admin/users/local-user-1/credit-adjust",
      "sess-viewer-test",
      {
        method: "POST",
        headers: { "Idempotency-Key": "finance-compatibility-1" },
        body: JSON.stringify({ amountDelta: 1, description: "finance compatibility path" }),
      }
    );
    assert.equal(financeCompatibility.status, 200);
    assert.equal(financeCompatibility.body.data.kind, "credit");

    const before = await db.queryOne<{ balance: string | number }>(
      "SELECT balance FROM users WHERE id = ?",
      ["local-user-1"]
    );
    const adjustmentInit: RequestInit = {
      method: "POST",
      headers: { "Idempotency-Key": "admin-control-plane-retry-1" },
      body: JSON.stringify({ amountDelta: 7, reason: "integration idempotency check" }),
    };
    const first = await call(
      "/api/admin/control-plane/finance/adjustments/local-user-1/balance",
      "sess-local-test",
      adjustmentInit
    );
    const replay = await call(
      "/api/admin/control-plane/finance/adjustments/local-user-1/balance",
      "sess-local-test",
      adjustmentInit
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.data.replayed, false);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.replayed, true);
    assert.equal(first.body.data.transaction.id, replay.body.data.transaction.id);

    const idempotencyAmountConflict = await call(
      "/api/admin/control-plane/finance/adjustments/local-user-1/balance",
      "sess-local-test",
      {
        method: "POST",
        headers: { "Idempotency-Key": "admin-control-plane-retry-1" },
        body: JSON.stringify({ amountDelta: 8, reason: "integration idempotency check" }),
      }
    );
    assert.equal(idempotencyAmountConflict.status, 409);
    assert.equal(idempotencyAmountConflict.body.code, "idempotency_conflict");
    const idempotencyTargetConflict = await call(
      "/api/admin/control-plane/finance/adjustments/viewer-user/balance",
      "sess-local-test",
      {
        method: "POST",
        headers: { "Idempotency-Key": "admin-control-plane-retry-1" },
        body: JSON.stringify({ amountDelta: 7, reason: "integration idempotency check" }),
      }
    );
    assert.equal(idempotencyTargetConflict.status, 409);
    assert.equal(idempotencyTargetConflict.body.code, "idempotency_conflict");
    const idempotencyReasonConflict = await call(
      "/api/admin/control-plane/finance/adjustments/local-user-1/balance",
      "sess-local-test",
      {
        method: "POST",
        headers: { "Idempotency-Key": "admin-control-plane-retry-1" },
        body: JSON.stringify({ amountDelta: 7, reason: "different reason must conflict" }),
      }
    );
    assert.equal(idempotencyReasonConflict.status, 409);
    assert.equal(idempotencyReasonConflict.body.code, "idempotency_conflict");

    const after = await db.queryOne<{ balance: string | number }>(
      "SELECT balance FROM users WHERE id = ?",
      ["local-user-1"]
    );
    assert.equal(Number(after?.balance), Number(before?.balance) + 7);
    const ledgerCount = await db.queryOne<{ count: string | number }>(
      "SELECT COUNT(*) AS count FROM transactions WHERE type = 'admin_adjustment' AND description = ?",
      ["integration idempotency check"]
    );
    assert.equal(Number(ledgerCount?.count), 1, "idempotent retry must create one ledger row");
    const auditCount = await db.queryOne<{ count: string | number }>(
      "SELECT COUNT(*) AS count FROM admin_audit_events WHERE action = ? AND idempotency_key = ? AND outcome = 'success'",
      ["finance.balance.adjust", "admin-control-plane-retry-1"]
    );
    assert.equal(Number(auditCount?.count), 1, "idempotent retry must have one successful audit");
    const idempotentAudit = await db.queryOne<any>(
      `SELECT metadata
         FROM admin_audit_events
        WHERE action = ? AND idempotency_key = ? AND outcome = 'success'`,
      ["finance.balance.adjust", "admin-control-plane-retry-1"]
    );
    const idempotentMetadata = typeof idempotentAudit?.metadata === "string"
      ? JSON.parse(idempotentAudit.metadata)
      : idempotentAudit?.metadata;
    assert.equal(typeof idempotentMetadata?.payloadFingerprint, "string");
    assert.equal(idempotentMetadata.payloadFingerprint.length, 64);

    await db.execute(
      `INSERT INTO rate_limit_requests (
         id, user_id, model, requested_qpm, requested_tpm, reason
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      ["atomic-limit-invalid", "local-user-1", "atomic-limit-model-invalid", 100, 2000, "rollback validation"]
    );
    await assert.rejects(
      approveRateLimitRequest("atomic-limit-invalid", "local-user-1", { qpm: 0, tpm: 3000 }),
      RateLimitApprovalError
    );
    const invalidApproval = await db.queryOne<any>(
      "SELECT status FROM rate_limit_requests WHERE id = ?",
      ["atomic-limit-invalid"]
    );
    const invalidLimit = await db.queryOne<any>(
      "SELECT id FROM user_rate_limits WHERE user_id = ? AND model = ?",
      ["local-user-1", "atomic-limit-model-invalid"]
    );
    assert.equal(invalidApproval?.status, "pending");
    assert.equal(invalidLimit, null, "invalid approval must not partially apply a limit");

    await db.execute(
      `INSERT INTO rate_limit_requests (
         id, user_id, model, requested_qpm, requested_tpm, reason
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      ["atomic-limit-valid", "local-user-1", "atomic-limit-model-valid", 100, 2000, "atomic approval"]
    );
    const approvedLimit = await approveRateLimitRequest(
      "atomic-limit-valid",
      "local-user-1",
      { qpm: 150, tpm: 3000 }
    );
    assert.equal(approvedLimit?.status, "approved");
    const appliedLimit = await db.queryOne<any>(
      "SELECT qpm, tpm, source FROM user_rate_limits WHERE user_id = ? AND model = ?",
      ["local-user-1", "atomic-limit-model-valid"]
    );
    assert.deepEqual(
      { qpm: Number(appliedLimit?.qpm), tpm: Number(appliedLimit?.tpm), source: appliedLimit?.source },
      { qpm: 150, tpm: 3000, source: "admin" }
    );

    const traffic = await call("/api/admin/traffic?range=24h", "sess-viewer-test");
    assert.equal(traffic.status, 200);
    assert(traffic.body.data.items.length > 0);
    assert.equal(traffic.body.data.items[0].provider, null);
    assert.equal(traffic.body.data.truth.coverage.structuralFields.includes("null"), true);

    const redacted = redactAuditData({
      password: "secret",
      nested: {
        api_key: "sk-raw",
        Authorization: "Bearer raw",
        safe: "visible",
      },
    }) as any;
    assert.equal(redacted.password, "[redacted]");
    assert.equal(redacted.nested.api_key, "[redacted]");
    assert.equal(redacted.nested.Authorization, "[redacted]");
    assert.equal(redacted.nested.safe, "visible");

    const costProvider = await call(
      "/api/provider/admin/providers",
      "sess-local-test",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Cost Truth Test Provider",
          api_base_url: "https://dashscope.aliyuncs.com/cost-truth/v1",
          api_key: "test-cost-truth-key",
          contact_email: "cost-truth@example.invalid",
        }),
      }
    );
    assert.equal(costProvider.status, 200);
    const costProviderId = costProvider.body.data.id;
    const foreignCurrency = await call(
      `/api/provider/admin/providers/${costProviderId}/costs/cost-truth-model`,
      "sess-local-test",
      {
        method: "POST",
        body: JSON.stringify({
          pricing_type: "token",
          prompt_cost: 12,
          completion_cost: 24,
          currency: "USD",
          source: "contract",
          notes: "foreign currency must remain unknown without an FX ledger",
        }),
      }
    );
    assert.equal(foreignCurrency.status, 400);

    const cnyCost = await call(
      `/api/provider/admin/providers/${costProviderId}/costs/cost-truth-model`,
      "sess-local-test",
      {
        method: "POST",
        body: JSON.stringify({
          pricing_type: "token",
          prompt_cost: 12,
          completion_cost: 24,
          currency: "CNY",
          source: "contract",
          notes: "verified CNY contract test fixture",
        }),
      }
    );
    assert.equal(cnyCost.status, 200);

    const sharedEffectiveFrom = String(cnyCost.body.data.effective_from);
    await createCostVersion({
      providerId: costProviderId,
      modelId: "cost-truth-model",
      versionLabel: "same-time-estimate-must-not-win",
      pricingType: "token",
      promptCost: 999,
      completionCost: 999,
      currency: "CNY",
      effectiveFrom: sharedEffectiveFrom,
      source: "estimate",
      notes: "same timestamp estimate regression",
    });
    await createCostVersion({
      providerId: costProviderId,
      modelId: "cost-truth-model",
      versionLabel: "same-time-manual-lower-priority",
      pricingType: "token",
      promptCost: 777,
      completionCost: 777,
      currency: "CNY",
      effectiveFrom: sharedEffectiveFrom,
      source: "manual",
      notes: "same timestamp recognized-source deterministic priority regression",
    });
    const activeCostRows = (await getActiveCostVersions()).filter(
      (item) => item.provider_id === costProviderId && item.model_id === "cost-truth-model"
    );
    assert.equal(activeCostRows.length, 1);
    assert.equal(activeCostRows[0].id, cnyCost.body.data.id);
    assert.equal(activeCostRows[0].source, "contract");
    const activeCost = await getActiveCostVersion(costProviderId, "cost-truth-model");
    assert.equal(activeCost?.id, cnyCost.body.data.id);
    assert.equal(activeCost?.source, "contract");

    await logUsage({
      logId: "estimated-provider-cost-must-stay-null",
      apiKeyId: "local-key-1",
      userId: "local-user-1",
      model: "cost-truth-model",
      providerId: costProviderId,
      promptTokens: 1_000,
      completionTokens: 0,
      totalTokens: 1_000,
      cost: 0.02,
      status: "success",
      latencyMs: 100,
      estimated: true,
    });
    const estimatedProviderCost = await db.queryOne<any>(
      "SELECT provider_cost, cost_version_id FROM usage_logs WHERE log_id = ?",
      ["estimated-provider-cost-must-stay-null"]
    );
    assert.equal(estimatedProviderCost?.provider_cost, null);
    assert.equal(estimatedProviderCost?.cost_version_id, null);

    await logUsage({
      logId: "verified-cny-provider-cost",
      apiKeyId: "local-key-1",
      userId: "local-user-1",
      model: "cost-truth-model",
      providerId: costProviderId,
      promptTokens: 1_000,
      completionTokens: 0,
      totalTokens: 1_000,
      cost: 0.02,
      status: "success",
      latencyMs: 100,
    });
    const verifiedProviderCost = await db.queryOne<any>(
      "SELECT provider_cost, cost_version_id FROM usage_logs WHERE log_id = ?",
      ["verified-cny-provider-cost"]
    );
    assert.equal(Number(verifiedProviderCost?.provider_cost), 0.012);
    assert.equal(verifiedProviderCost?.cost_version_id, cnyCost.body.data.id);

    const auditEvents = await call("/api/admin/audit-events", "sess-local-test");
    assert.equal(auditEvents.status, 200);
    assert(auditEvents.body.data.items.some((event: any) => event.action === "finance.balance.adjust"));

    console.log("admin control-plane integration checks passed");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await closeDb();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
