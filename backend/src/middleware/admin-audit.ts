import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import {
  completeAdminAuditIntent,
  createAdminAuditIntent,
  writeAdminAuditEvent,
} from "../data/admin-audit";
import { AdminAuthorizedRequest, authorizeAdminRequest } from "./admin-access";
import { getTrustedClientIp } from "../utils/client-ip";

export type AdminAuditContext = {
  action?: string;
  resourceType?: string;
  resourceId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  reason?: string;
  metadata?: unknown;
  skipAutomatic?: boolean;
};

type AuditedRequest = AdminAuthorizedRequest & {
  adminAuditContext?: AdminAuditContext;
  adminRequestId?: string;
};

export function getAdminRequestId(req: Request, res?: Response): string {
  const audited = req as AuditedRequest;
  if (audited.adminRequestId) return audited.adminRequestId;
  const supplied = req.headers["x-request-id"];
  const requestId =
    typeof supplied === "string" && supplied.trim()
      ? supplied.trim().slice(0, 200)
      : randomUUID();
  audited.adminRequestId = requestId;
  res?.setHeader("X-Request-Id", requestId);
  return requestId;
}

export function getAdminClientIp(req: Request): string | null {
  const ip = getTrustedClientIp(req);
  return ip === "unknown" ? null : ip.slice(0, 200);
}

export function setAdminAuditContext(req: Request, context: AdminAuditContext): void {
  const audited = req as AuditedRequest;
  audited.adminAuditContext = { ...(audited.adminAuditContext || {}), ...context };
}

function inferReason(req: Request): string {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  for (const key of ["reason", "description", "notes", "reply"]) {
    if (typeof body[key] === "string" && body[key].trim()) return body[key].trim().slice(0, 2000);
  }
  return "";
}

type AdminAuditTestHooks = {
  beforeIntentInsert?: () => Promise<void> | void;
  beforeIntentComplete?: () => Promise<void> | void;
};

let adminAuditTestHooks: AdminAuditTestHooks = {};

export function setAdminAuditTestHooks(hooks: AdminAuditTestHooks): void {
  adminAuditTestHooks = hooks;
}

export async function auditAdminWrite(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) {
    next();
    return;
  }

  const authorized = await authorizeAdminRequest(req, res);
  if (!authorized) return;
  const requestId = getAdminRequestId(req, res);
  const genericAction = `${req.method.toLowerCase()} ${req.baseUrl}${req.path}`;
  let intentId: string;
  try {
    await adminAuditTestHooks.beforeIntentInsert?.();
    const intent = await createAdminAuditIntent({
      actorUserId: authorized.user.id,
      actorRole: authorized.access.role,
      actorEmail: authorized.user.email,
      requestId,
      action: genericAction,
      resourceType: "admin_route",
      resourceId: null,
      ipAddress: getAdminClientIp(req),
      userAgent: typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"]
        : null,
      method: req.method,
      path: `${req.baseUrl}${req.path}`,
    });
    intentId = intent.id;
  } catch (error) {
    console.error(
      "[AdminAudit] intent insert failed:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(503).json({
      success: false,
      message: "管理操作审计暂不可用，请稍后重试",
      code: "admin_audit_unavailable",
    });
    return;
  }

  let responseBody: any;
  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    responseBody = body;
    return originalJson(body);
  }) as Response["json"];

  res.once("finish", () => {
    const audited = req as AuditedRequest;
    const context = audited.adminAuditContext || {};
    const access = audited.adminAccess;
    const actor = audited.admin;
    if (!access || !actor) return;

    const success = res.statusCode < 400 && responseBody?.success !== false;
    const routePath = req.route?.path ? String(req.route.path) : req.path;
    const action = context.action || `${req.method.toLowerCase()} ${req.baseUrl}${routePath}`;
    const resourceType = context.resourceType || "admin_route";
    const resourceId =
      context.resourceId !== undefined
        ? context.resourceId
        // req.params can be undefined here once a mounted sub-router has
        // finished (Express 5 restores the parent's params).
        : typeof req.params?.id === "string"
          ? req.params.id
          : typeof req.params?.providerId === "string"
            ? req.params.providerId
            : null;

    const completion = (async () => {
      await adminAuditTestHooks.beforeIntentComplete?.();
      await completeAdminAuditIntent({
        id: intentId,
        status: success ? "success" : "failure",
        action,
        resourceType,
        resourceId,
        reason: context.reason ?? inferReason(req),
        responseStatus: res.statusCode,
        metadata: {
          method: req.method,
          path: `${req.baseUrl}${req.path}`,
          semanticAuditEvent: context.skipAutomatic ? "transactional" : "automatic",
        },
      });
    })().catch((error) => {
      // The pending row is itself the durable signal that completion is
      // unknown and needs review.
      console.error(
        "[AdminAudit] intent completion failed:",
        error instanceof Error ? error.message : String(error)
      );
    });

    if (context.skipAutomatic) {
      void completion;
      return;
    }

    void completion.then(() => writeAdminAuditEvent({
      actorUserId: actor.id,
      actorRole: access.role,
      actorEmail: actor.email,
      requestId,
      // A caller-provided header is not proof that the underlying mutation is
      // idempotent. Generic writes always get independent audit events; only
      // endpoints that atomically bind a key to a payload fingerprint (for
      // example finance adjustments) may persist an idempotency key.
      idempotencyKey: null,
      action,
      resourceType,
      resourceId,
      outcome: success ? "success" : "failure",
      reason: context.reason ?? inferReason(req),
      ipAddress: getAdminClientIp(req),
      userAgent: req.headers["user-agent"] || null,
      beforeData: context.beforeData,
      afterData:
        context.afterData !== undefined
          ? context.afterData
          : responseBody?.data !== undefined
            ? responseBody.data
            : responseBody,
      metadata: {
        method: req.method,
        path: `${req.baseUrl}${req.path}`,
        statusCode: res.statusCode,
        ...(context.metadata && typeof context.metadata === "object" ? context.metadata : {}),
      },
    })).catch((error) => {
      console.error("[AdminAudit] write failed:", error instanceof Error ? error.message : String(error));
    });
  });

  next();
}
