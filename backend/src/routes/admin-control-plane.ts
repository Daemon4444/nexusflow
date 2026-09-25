import { NextFunction, Request, Response, Router } from "express";
import {
  getAdminAccessOverview,
  getAdminCustomerControlPlane,
  getAdminFinanceOverview,
  getAdminReleases,
  getAdminTrafficDetail,
  getControlPlaneOverview,
  listAdminAuditEvents,
  listAdminCustomers,
  listAdminTraffic,
  parseAdminPage,
  parseAdminWindow,
} from "../data/admin-control-plane";
import {
  AdminPermission,
  assignAdminRoleWithAudit,
  isStoredAdminRole,
  revokeAdminRoleWithAudit,
} from "../data/admin-access";
import { writeAdminAuditEvent } from "../data/admin-audit";
import {
  AdminAdjustmentError,
  AdminAdjustmentKind,
  applyAdminAdjustment,
} from "../data/admin-finance";
import {
  AdminAuthorizedRequest,
  authorizeAdminRequest,
  requirePermission,
} from "../middleware/admin-access";
import {
  auditAdminWrite,
  getAdminClientIp,
  getAdminRequestId,
  setAdminAuditContext,
} from "../middleware/admin-audit";
import { sanitizeError } from "../utils/sanitize-error";
import { getStaticModels, models } from "../data/models";
import { listOverrides, refreshModels } from "../data/model-overrides";
import cpConfigRouter from "./admin-cp-config";

const router = Router();

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const route = (handler: AsyncRoute) => (req: Request, res: Response, next: NextFunction) => {
  void handler(req, res, next).catch(next);
};

function textQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function adminPermissions(req: Request): AdminPermission[] {
  return (req as AdminAuthorizedRequest).adminAccess?.permissions || [];
}

function hasAnyPermission(req: Request, permissions: AdminPermission[]): boolean {
  const granted = adminPermissions(req);
  return permissions.some((permission) => granted.includes(permission));
}

function omitFields<T extends Record<string, any>>(value: T, fields: string[]): Partial<T> {
  const output: Record<string, any> = { ...value };
  for (const field of fields) delete output[field];
  return output as Partial<T>;
}

const CUSTOMER_FINANCIAL_FIELDS = [
  "balance",
  "creditBalance",
  "availableBalance",
  "totalCost",
];
const TRAFFIC_BILLING_FIELDS = ["cost", "reservationId", "transactionId"];
const TRAFFIC_PROVIDER_COST_FIELDS = ["providerCost", "costVersionId"];

function canReadCustomerFinancials(req: Request): boolean {
  return hasAnyPermission(req, ["billing.read", "finance.read"]);
}

function canReadProviderFinancials(req: Request): boolean {
  return hasAnyPermission(req, ["providers.read", "finance.read"]);
}

function projectTrafficRow(req: Request, row: Record<string, any>) {
  let projected: Record<string, any> = { ...row };
  if (!canReadCustomerFinancials(req)) {
    projected = omitFields(projected, TRAFFIC_BILLING_FIELDS);
  }
  if (!canReadProviderFinancials(req)) {
    projected = omitFields(projected, TRAFFIC_PROVIDER_COST_FIELDS);
  }
  return projected;
}

function projectOverview(req: Request, data: any) {
  if (canReadCustomerFinancials(req)) return data;
  const hiddenMetricKeys = new Set([
    "revenue",
    "upstreamCost",
    "grossProfit",
    "grossMargin",
    "reservedBalance",
    "creditExposure",
  ]);
  const coverage = omitFields(data.truth?.coverage || {}, ["upstreamCost"]);
  return {
    ...data,
    metrics: (data.metrics || []).filter((item: any) => !hiddenMetricKeys.has(item.key)),
    topCustomers: (data.topCustomers || []).map((item: any) => omitFields(item, ["cost"])),
    truth: {
      ...data.truth,
      sources: (data.truth?.sources || []).filter(
        (source: string) => !["transactions", "billing_reservations"].includes(source)
      ),
      coverage,
    },
  };
}

function projectCustomerList(req: Request, data: any) {
  if (canReadCustomerFinancials(req)) return data;
  return {
    ...data,
    items: (data.items || []).map((item: any) => omitFields(item, CUSTOMER_FINANCIAL_FIELDS)),
  };
}

function projectCustomerDetail(req: Request, data: any) {
  const financials = canReadCustomerFinancials(req);
  const projected: Record<string, any> = {
    ...data,
    customer: financials
      ? data.customer
      : omitFields(data.customer || {}, CUSTOMER_FINANCIAL_FIELDS),
    usage: financials
      ? data.usage
      : omitFields(data.usage || {}, ["totalCost"]),
    byModel: (data.byModel || []).map((item: any) =>
      financials ? item : omitFields(item, ["cost"])
    ),
    recentRequests: (data.recentRequests || []).map((item: any) =>
      projectTrafficRow(req, item)
    ),
  };
  if (!financials) {
    delete projected.transactions;
    delete projected.discounts;
    projected.truth = {
      ...data.truth,
      sources: (data.truth?.sources || []).filter(
        (source: string) => !["transactions", "user_model_discounts"].includes(source)
      ),
    };
  }
  return projected;
}

function projectTrafficList(req: Request, data: any) {
  return {
    ...data,
    items: (data.items || []).map((item: any) => projectTrafficRow(req, item)),
  };
}

function projectTrafficDetail(req: Request, data: any) {
  return {
    ...data,
    structural: projectTrafficRow(req, data.structural || {}),
  };
}

// All control-plane mutations live below this prefix. Mount auditing before
// permission guards so authenticated-but-forbidden attempts get a failure
// event once requirePermission resolves the actor.
router.use("/control-plane", auditAdminWrite);

// Configuration control plane (models, accounts, pools, routes, policies):
// change requests, versions, rollback. No direct edit endpoints.
router.use("/control-plane/config", cpConfigRouter);

router.get("/session", route(async (req, res) => {
  const authorized = await authorizeAdminRequest(req, res);
  if (!authorized) return;
  res.json({
    success: true,
    data: {
      user: {
        id: authorized.user.id,
        email: authorized.user.email,
        nickname: authorized.user.nickname,
      },
      role: authorized.access.role,
      roles: authorized.access.roles,
      permissions: authorized.access.permissions,
      bootstrap: authorized.access.bootstrap,
    },
  });
}));

router.get(
  "/control-plane/overview",
  requirePermission("control_plane.read"),
  route(async (req, res) => {
    const window = parseAdminWindow(req.query.range, "24h");
    const data = await getControlPlaneOverview(window);
    res.json({ success: true, data: projectOverview(req, data) });
  })
);

router.get(
  "/customers",
  requirePermission("customers.read"),
  route(async (req, res) => {
    const window = parseAdminWindow(req.query.range, "30d");
    const data = await listAdminCustomers(window, {
      ...parseAdminPage(req.query),
      q: textQuery(req.query.q),
      status: textQuery(req.query.status),
    });
    res.json({
      success: true,
      data: projectCustomerList(req, data),
    });
  })
);

router.get(
  "/model-catalog",
  requirePermission("catalog.read"),
  route(async (_req, res) => {
    await refreshModels();
    const overrides = await listOverrides();
    const overrideById = new Map(overrides.map((item) => [item.id, item]));
    const staticIds = new Set(getStaticModels().map((item) => item.id));
    const effective = models.map((model) => {
      const override = overrideById.get(model.id);
      const source = override?.action === "upsert"
        ? staticIds.has(model.id) ? "overridden" : "added"
        : "static";
      return { ...model, source };
    });
    res.json({
      success: true,
      data: {
        models: effective,
        staticCount: staticIds.size,
        overrideCount: overrides.length,
        disabledIds: overrides
          .filter((item) => item.action === "disable" && item.enabled)
          .map((item) => item.id),
        truth: {
          sources: ["static model catalog", "model_overrides"],
          generatedAt: new Date().toISOString(),
        },
      },
    });
  })
);

router.get(
  "/customers/:id/control-plane",
  requirePermission("customers.read"),
  route(async (req, res) => {
    const data = await getAdminCustomerControlPlane(
      String(req.params.id),
      parseAdminWindow(req.query.range, "30d")
    );
    if (!data) {
      res.status(404).json({ success: false, message: "用户不存在", code: "customer_not_found" });
      return;
    }
    res.json({ success: true, data: projectCustomerDetail(req, data) });
  })
);

router.get(
  "/finance/overview",
  requirePermission("billing.read"),
  route(async (req, res) => {
    res.json({
      success: true,
      data: await getAdminFinanceOverview(
        parseAdminWindow(req.query.range, "30d"),
        { ...parseAdminPage(req.query), q: textQuery(req.query.q) }
      ),
    });
  })
);

async function auditAdjustmentFailure(
  req: Request,
  kind: AdminAdjustmentKind,
  error: unknown
): Promise<void> {
  const authorized = req as AdminAuthorizedRequest;
  const actor = authorized.admin;
  const access = authorized.adminAccess;
  if (!actor || !access) return;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  await writeAdminAuditEvent({
    actorUserId: actor.id,
    actorRole: access.role,
    actorEmail: actor.email,
    requestId: getAdminRequestId(req),
    idempotencyKey:
      typeof req.headers["idempotency-key"] === "string"
        ? req.headers["idempotency-key"].trim().slice(0, 200)
        : null,
    action: kind === "balance" ? "finance.balance.adjust" : "finance.credit.adjust",
    resourceType: "customer_ledger",
    resourceId: String(req.params.id || body.userId || ""),
    outcome: "failure",
    reason: typeof body.reason === "string"
      ? body.reason
      : typeof body.description === "string"
        ? body.description
        : "",
    ipAddress: getAdminClientIp(req),
    userAgent: req.headers["user-agent"] || null,
    metadata: {
      amountDelta: body.amountDelta ?? body.amount_delta ?? body.amount,
      kind,
      error: error instanceof Error ? error.message : String(error),
    },
  });
}

function adjustmentHandler(kind: AdminAdjustmentKind): AsyncRoute {
  return async (req, res) => {
    setAdminAuditContext(req, { skipAutomatic: true });
    const authorized = req as AdminAuthorizedRequest;
    const actor = authorized.admin!;
    const access = authorized.adminAccess!;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const idempotencyKey =
      typeof req.headers["idempotency-key"] === "string"
        ? req.headers["idempotency-key"]
        : "";
    try {
      const result = await applyAdminAdjustment({
        kind,
        userId: String(req.params.id || body.userId || ""),
        amountDelta: Number(body.amountDelta ?? body.amount_delta ?? body.amount),
        reason: String(body.reason || body.description || ""),
        idempotencyKey,
        actorUserId: actor.id,
        actorRole: access.role,
        actorEmail: actor.email,
        requestId: getAdminRequestId(req, res),
        ipAddress: getAdminClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });
      res.json({ success: true, data: result, message: result.replayed ? "已返回原调账结果" : "账本已调整" });
    } catch (error) {
      try {
        await auditAdjustmentFailure(req, kind, error);
      } catch (auditError) {
        console.error("[AdminAudit] adjustment failure audit failed:", sanitizeError(auditError));
      }
      if (error instanceof AdminAdjustmentError) {
        res.status(error.status).json({ success: false, message: error.message, code: error.code });
        return;
      }
      res.status(500).json({ success: false, message: sanitizeError(error), code: "admin_adjustment_failed" });
    }
  };
}

router.post(
  "/control-plane/finance/adjustments/:id/balance",
  requirePermission("billing.manage"),
  route(adjustmentHandler("balance"))
);
router.post(
  "/control-plane/finance/adjustments/:id/credit",
  requirePermission("billing.manage"),
  route(adjustmentHandler("credit"))
);
router.post(
  "/control-plane/finance/adjustments",
  requirePermission("billing.manage"),
  route(async (req, res, next) => {
    const kind = req.body?.kind === "credit" ? "credit" : "balance";
    await adjustmentHandler(kind)(req, res, next);
  })
);

// Compatibility paths used by the existing customer screen. They are handled
// here before the legacy admin router, so finance operators get least-privilege
// access while every caller still reaches the same idempotent ledger function.
router.post(
  "/users/:id/balance-adjust",
  auditAdminWrite,
  requirePermission("billing.manage"),
  route(adjustmentHandler("balance"))
);
router.post(
  "/users/:id/credit-adjust",
  auditAdminWrite,
  requirePermission("billing.manage"),
  route(adjustmentHandler("credit"))
);

router.get(
  "/traffic",
  requirePermission("traffic.read"),
  route(async (req, res) => {
    const data = await listAdminTraffic(
      parseAdminWindow(req.query.range, "24h"),
      {
        ...parseAdminPage(req.query),
        q: textQuery(req.query.q),
        status: textQuery(req.query.status),
        provider: textQuery(req.query.provider),
        model: textQuery(req.query.model),
        userId: textQuery(req.query.userId),
      }
    );
    res.json({
      success: true,
      data: projectTrafficList(req, data),
    });
  })
);

router.get(
  "/logs/:id/detail",
  requirePermission("traffic.read"),
  route(async (req, res) => {
    const data = await getAdminTrafficDetail(String(req.params.id));
    if (!data) {
      res.status(404).json({ success: false, message: "请求日志不存在", code: "traffic_log_not_found" });
      return;
    }
    res.json({ success: true, data: projectTrafficDetail(req, data) });
  })
);

router.get(
  "/audit-events",
  requirePermission("audit.read"),
  route(async (req, res) => {
    res.json({
      success: true,
      data: await listAdminAuditEvents({
        ...parseAdminPage(req.query),
        actorId: textQuery(req.query.actorId),
        action: textQuery(req.query.action),
        outcome: textQuery(req.query.outcome),
        resourceType: textQuery(req.query.resourceType),
      }),
    });
  })
);

router.get(
  "/releases",
  requirePermission("releases.read"),
  route(async (_req, res) => {
    res.json({ success: true, data: await getAdminReleases() });
  })
);

router.get(
  "/access",
  requirePermission("security.read"),
  route(async (_req, res) => {
    res.json({ success: true, data: await getAdminAccessOverview() });
  })
);

router.post(
  "/control-plane/access/assignments",
  requirePermission("security.manage"),
  route(async (req, res) => {
    const userId = String(req.body?.userId || "").trim();
    const roleName = req.body?.role;
    const reason = String(req.body?.reason || "").trim();
    setAdminAuditContext(req, {
      action: "access.role.assign",
      resourceType: "admin_role_assignment",
      resourceId: userId || null,
      reason,
    });
    if (!userId || !isStoredAdminRole(roleName)) {
      res.status(400).json({ success: false, message: "userId 或 role 无效", code: "invalid_role_assignment" });
      return;
    }
    if (reason.length < 3) {
      res.status(400).json({ success: false, message: "授权原因至少需要 3 个字符", code: "admin_reason_required" });
      return;
    }
    const actor = (req as AdminAuthorizedRequest).admin!;
    const access = (req as AdminAuthorizedRequest).adminAccess!;
    const result = await assignAdminRoleWithAudit({
      userId,
      role: roleName,
      grantedBy: actor.id,
      reason,
      audit: {
        actorUserId: actor.id,
        actorRole: access.role,
        actorEmail: actor.email,
        requestId: getAdminRequestId(req, res),
        ipAddress: getAdminClientIp(req),
        userAgent: typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : null,
        method: "POST",
        path: `${req.baseUrl}${req.path}`,
      },
    });
    if (!result.ok && result.reason === "user_not_found") {
      res.status(404).json({ success: false, message: "用户不存在", code: "customer_not_found" });
      return;
    }
    if (!result.ok) {
      res.status(409).json({
        success: false,
        message: "演示账号不能获得真实管理员角色；请先移出演示账号白名单",
        code: "demo_admin_isolated",
      });
      return;
    }
    const assignment = result.assignment;
    setAdminAuditContext(req, {
      resourceId: assignment.id,
      skipAutomatic: true,
    });
    res.json({ success: true, data: assignment, message: "管理员角色已生效" });
  })
);

router.delete(
  "/control-plane/access/assignments/:id",
  requirePermission("security.manage"),
  route(async (req, res) => {
    const reason = String(req.body?.reason || "").trim();
    setAdminAuditContext(req, {
      action: "access.role.revoke",
      resourceType: "admin_role_assignment",
      resourceId: String(req.params.id),
      reason,
    });
    if (reason.length < 3) {
      res.status(400).json({ success: false, message: "撤权原因至少需要 3 个字符", code: "admin_reason_required" });
      return;
    }
    const actor = (req as AdminAuthorizedRequest).admin!;
    const access = (req as AdminAuthorizedRequest).adminAccess!;
    const result = await revokeAdminRoleWithAudit({
      assignmentId: String(req.params.id),
      revokedBy: actor.id,
      reason,
      audit: {
        actorUserId: actor.id,
        actorRole: access.role,
        actorEmail: actor.email,
        requestId: getAdminRequestId(req, res),
        ipAddress: getAdminClientIp(req),
        userAgent: typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : null,
        method: "DELETE",
        path: `${req.baseUrl}${req.path}`,
      },
    });
    if (!result.ok) {
      res.status(404).json({ success: false, message: "有效授权不存在", code: "assignment_not_found" });
      return;
    }
    const assignment = result.assignment;
    setAdminAuditContext(req, {
      skipAutomatic: true,
    });
    res.json({ success: true, data: assignment, message: "管理员角色已撤销" });
  })
);

export default router;
