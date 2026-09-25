/**
 * Control-plane configuration admin API (P6), mounted by
 * routes/admin-control-plane.ts at /api/admin/control-plane/config.
 *
 * Every change goes through a change request; there is deliberately no
 * endpoint that edits models, accounts, pools, routes or policies directly.
 * Reads need control_plane.read; writes need traffic.manage. All writes are
 * audited by the parent router's auditAdminWrite.
 */
import fs from "node:fs";
import path from "node:path";
import { NextFunction, Request, Response, Router } from "express";
import { AdminAuthorizedRequest, requirePermission } from "../middleware/admin-access";
import { setAdminAuditContext } from "../middleware/admin-audit";
import { featureFlagSnapshot } from "../config/feature-flags";
import { db } from "../db/client";
import { controlPlaneRuntime, indexContent } from "../control-plane/runtime";
import { getCurrentVersion, getVersion, listChangeRequests, listVersions, getChangeRequest, type ChangeRequestStatus } from "../control-plane/store";
import {
  applyOperations,
  approve,
  ChangeRequestError,
  diffContents,
  diffVersions,
  openChangeRequest,
  publish,
  reject,
  rollbackTo,
  runValidation,
} from "../control-plane/change-requests";
import { planProbes, runProbe, storeProbeResults, type ProbeResult } from "../control-plane/probe";
import { decryptProviderSecret } from "../utils/provider-secrets";
import { sanitizeError } from "../utils/sanitize-error";

const router = Router();

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const route = (handler: AsyncRoute) => (req: Request, res: Response, next: NextFunction) => {
  void handler(req, res, next).catch((error) => {
    if (error instanceof ChangeRequestError) {
      res.status(error.status).json({ success: false, message: error.message, code: error.code });
      return;
    }
    if (error?.name === "VersionConflictError") {
      res.status(409).json({ success: false, message: "another version was published meanwhile; validate again", code: "version_conflict" });
      return;
    }
    next(error);
  });
};

function actorId(req: Request): string {
  const admin = (req as AdminAuthorizedRequest).admin;
  return admin?.email || admin?.id || "unknown";
}

function reasonOf(req: Request): string {
  return String(req.body?.reason || "").trim();
}

const STATUSES: ChangeRequestStatus[] = ["draft", "validated", "approved", "published", "rejected"];

// ------------------------------------------------------------------ reads

router.get("/state", requirePermission("control_plane.read"), route(async (_req, res) => {
  const current = await getCurrentVersion();
  const loaded = controlPlaneRuntime.get();
  res.json({
    success: true,
    data: {
      flags: featureFlagSnapshot(),
      currentVersion: current ? { version: current.version, publishedAt: current.publishedAt, publishedBy: current.publishedBy, sha256: current.contentSha256 } : null,
      loadedVersion: loaded ? loaded.version : null,
      counts: current
        ? Object.fromEntries(Object.entries(current.content).filter(([key]) => key !== "schema_version").map(([key, value]) => [key, (value as unknown[]).length]))
        : null,
    },
  });
}));

router.get("/current", requirePermission("control_plane.read"), route(async (_req, res) => {
  const current = await getCurrentVersion();
  res.json({ success: true, data: current });
}));

router.get("/change-requests", requirePermission("control_plane.read"), route(async (req, res) => {
  const status = STATUSES.includes(req.query.status as ChangeRequestStatus) ? req.query.status as ChangeRequestStatus : undefined;
  res.json({ success: true, data: await listChangeRequests(status) });
}));

router.get("/change-requests/:id", requirePermission("control_plane.read"), route(async (req, res) => {
  const record = await getChangeRequest(String(req.params.id));
  if (!record) {
    res.status(404).json({ success: false, message: "change request not found", code: "change_request_not_found" });
    return;
  }
  const current = await getCurrentVersion();
  let diff: unknown = null;
  let applyError: string | null = null;
  try {
    const base = current?.content || { schema_version: 1 as const, models: [], accounts: [], pools: [], routes: [], policies: [] };
    diff = diffContents(current?.content || null, applyOperations(base, record.changes));
  } catch (error) {
    applyError = error instanceof Error ? error.message : String(error);
  }
  res.json({ success: true, data: { ...record, diff, applyError, currentVersion: current?.version ?? null } });
}));

router.get("/versions", requirePermission("control_plane.read"), route(async (_req, res) => {
  res.json({ success: true, data: await listVersions(100) });
}));

router.get("/versions/diff", requirePermission("control_plane.read"), route(async (req, res) => {
  const from = Number(req.query.from);
  const to = Number(req.query.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    res.status(400).json({ success: false, message: "from and to must be version numbers", code: "invalid_versions" });
    return;
  }
  res.json({ success: true, data: await diffVersions(from, to) });
}));

router.get("/versions/:version", requirePermission("control_plane.read"), route(async (req, res) => {
  const version = await getVersion(Number(req.params.version));
  if (!version) {
    res.status(404).json({ success: false, message: "version not found", code: "version_not_found" });
    return;
  }
  res.json({ success: true, data: version });
}));

router.get("/probe-results", requirePermission("control_plane.read"), route(async (req, res) => {
  const routeId = typeof req.query.route === "string" ? req.query.route : null;
  const rows = routeId
    ? await db.queryMany("SELECT * FROM cp_route_probe_results WHERE route_id = ? ORDER BY probed_at DESC LIMIT 200", [routeId])
    : await db.queryMany("SELECT * FROM cp_route_probe_results ORDER BY probed_at DESC LIMIT 200");
  res.json({ success: true, data: rows });
}));

/** Latest committed Bailian diff report (P1b), read-only. */
router.get("/bailian-report", requirePermission("control_plane.read"), route(async (_req, res) => {
  const dir = process.env.NF_BAILIAN_REPORT_DIR || path.resolve(__dirname, "../../../docs/upstream-sync");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((name) => /^bailian-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
  } catch {
    files = [];
  }
  if (!files.length) {
    res.json({ success: true, data: null });
    return;
  }
  const file = files[files.length - 1];
  res.json({ success: true, data: { file, report: JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) } });
}));

// ----------------------------------------------------------------- writes

router.post("/change-requests", requirePermission("traffic.manage"), route(async (req, res) => {
  setAdminAuditContext(req, { action: "cp.change_request.create", resourceType: "cp_change_request", reason: reasonOf(req) });
  const record = await openChangeRequest({
    title: String(req.body?.title || ""),
    reason: reasonOf(req) || null,
    changes: req.body?.changes,
    author: actorId(req),
    source: "admin",
  });
  setAdminAuditContext(req, { resourceId: record.id });
  res.status(201).json({ success: true, data: record });
}));

for (const [action, handler] of [
  ["validate", (id: string) => runValidation(id)],
  ["approve", (id: string, req: Request) => approve(id, actorId(req))],
] as const) {
  router.post(`/change-requests/:id/${action}`, requirePermission("traffic.manage"), route(async (req, res) => {
    const id = String(req.params.id);
    setAdminAuditContext(req, { action: `cp.change_request.${action}`, resourceType: "cp_change_request", resourceId: id, reason: reasonOf(req) });
    res.json({ success: true, data: await handler(id, req) });
  }));
}

router.post("/change-requests/:id/reject", requirePermission("traffic.manage"), route(async (req, res) => {
  const id = String(req.params.id);
  const reason = reasonOf(req);
  setAdminAuditContext(req, { action: "cp.change_request.reject", resourceType: "cp_change_request", resourceId: id, reason });
  if (reason.length < 3) {
    res.status(400).json({ success: false, message: "驳回原因至少需要 3 个字符", code: "admin_reason_required" });
    return;
  }
  res.json({ success: true, data: await reject(id, actorId(req), reason) });
}));

router.post("/change-requests/:id/publish", requirePermission("traffic.manage"), route(async (req, res) => {
  const id = String(req.params.id);
  setAdminAuditContext(req, { action: "cp.change_request.publish", resourceType: "cp_change_request", resourceId: id, reason: reasonOf(req) });
  const result = await publish(id, actorId(req));
  await controlPlaneRuntime.refresh();
  res.json({ success: true, data: result });
}));

/**
 * Runs the route probes (real minimal upstream requests) for the models a
 * change request touches, on the proposed configuration, and stores the
 * results — the evidence publish needs before preview/active.
 */
router.post("/change-requests/:id/probe", requirePermission("traffic.manage"), route(async (req, res) => {
  const id = String(req.params.id);
  setAdminAuditContext(req, { action: "cp.change_request.probe", resourceType: "cp_change_request", resourceId: id, reason: reasonOf(req) });
  const record = await getChangeRequest(id);
  if (!record) {
    res.status(404).json({ success: false, message: "change request not found", code: "change_request_not_found" });
    return;
  }
  const current = await getCurrentVersion();
  const base = current?.content || { schema_version: 1 as const, models: [], accounts: [], pools: [], routes: [], policies: [] };
  const proposed = applyOperations(base, record.changes);
  const snapshot = indexContent(0, "proposed", proposed);
  const models = new Set([...(record.affected.models || []), ...proposed.routes.filter((r) => (record.affected.routes || []).includes(r.id)).map((r) => r.model_id)]);
  const plans = [...models].flatMap((modelId) => planProbes(snapshot, { modelId }));
  const keys = new Map<string, string>();
  const results: ProbeResult[] = [];
  for (const plan of plans) {
    const providerId = plan.account.secret_ref.replace(/^legacy_provider:/, "");
    if (!keys.has(providerId)) {
      const row = await db.queryOne<{ api_key: string | null }>("SELECT api_key FROM providers WHERE id = ?", [providerId]);
      try {
        keys.set(providerId, row?.api_key ? decryptProviderSecret(row.api_key) : "");
      } catch (error) {
        res.status(500).json({ success: false, message: sanitizeError(error), code: "provider_secret_unreadable" });
        return;
      }
    }
    results.push(await runProbe(plan, keys.get(providerId) || ""));
  }
  await storeProbeResults((sql, params) => db.execute(sql, params as any[]), results);
  res.json({ success: true, data: results });
}));

router.post("/versions/:version/rollback", requirePermission("traffic.manage"), route(async (req, res) => {
  const target = Number(req.params.version);
  const reason = reasonOf(req);
  setAdminAuditContext(req, { action: "cp.version.rollback", resourceType: "cp_config_version", resourceId: String(target), reason });
  if (reason.length < 3) {
    res.status(400).json({ success: false, message: "回滚原因至少需要 3 个字符", code: "admin_reason_required" });
    return;
  }
  const version = await rollbackTo(target, actorId(req), reason);
  await controlPlaneRuntime.refresh();
  res.json({ success: true, data: { version, rolledBackTo: target } });
}));

export default router;
