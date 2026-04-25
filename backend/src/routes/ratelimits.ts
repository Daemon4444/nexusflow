import { Router, Request, Response } from "express";
import { validateSession } from "../data/users";
import {
  approveRateLimitRequest,
  getAdminRateLimitRequests,
  getEffectiveRateLimit,
  getUserLimitsOverview,
  rejectRateLimitRequest,
  submitRateLimitRequest,
} from "../data/ratelimits";
import { requireAdmin, getSessionUser } from "../middleware/admin";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "未登录" });
    return null;
  }
  const session = validateSession(auth.slice(7).trim());
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期" });
    return null;
  }
  return (session as any).user_id || session.id;
}

/** GET /api/rate-limits — Get current user's limits overview */
router.get("/", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.json({
    success: true,
    data: getUserLimitsOverview(userId),
  });
});

/** GET /api/rate-limits/requests — Get current user's request history */
router.get("/requests", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.json({
    success: true,
    data: getUserLimitsOverview(userId).requests || [],
  });
});

/** POST /api/rate-limits/request — Submit a direct rate limit request */
router.post("/request", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { model = "*", requestedQpm, requestedTpm, reason = "" } = req.body || {};
  const qpm = Number(requestedQpm);
  const tpm = Number(requestedTpm);
  if (!Number.isFinite(qpm) || qpm <= 0) {
    res.status(400).json({ success: false, message: "请填写有效的 QPM" });
    return;
  }
  if (!Number.isFinite(tpm) || tpm <= 0) {
    res.status(400).json({ success: false, message: "请填写有效的 TPM" });
    return;
  }

  const request = submitRateLimitRequest({
    userId,
    model: String(model || "*"),
    requestedQpm: Math.round(qpm),
    requestedTpm: Math.round(tpm),
    reason: String(reason || ""),
  });

  res.json({ success: true, data: request, message: "申请已提交" });
});

/** GET /api/rate-limits/:model — Get effective limit for a specific model */
router.get("/:model", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.json({
    success: true,
    data: getEffectiveRateLimit(userId, req.params.model as string),
  });
});

/** GET /api/rate-limits/admin/requests — Admin list rate-limit requests */
router.get("/admin/requests", requireAdmin, (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const requests = getAdminRateLimitRequests(status);
  res.json({ success: true, data: requests });
});

/** POST /api/rate-limits/admin/requests/:id/approve — Approve request */
router.post("/admin/requests/:id/approve", requireAdmin, (req: Request, res: Response) => {
  const admin = getSessionUser(req, res);
  if (!admin) return;
  const { model, qpm, tpm, reply } = req.body || {};
  const request = approveRateLimitRequest(req.params.id as string, admin.id, {
    model: typeof model === "string" ? model : undefined,
    qpm: qpm !== undefined ? Number(qpm) : undefined,
    tpm: tpm !== undefined ? Number(tpm) : undefined,
    reply: typeof reply === "string" ? reply : undefined,
  });
  if (!request) {
    res.status(404).json({ success: false, message: "申请不存在或已处理" });
    return;
  }
  res.json({ success: true, data: request, message: "申请已批准" });
});

/** POST /api/rate-limits/admin/requests/:id/reject — Reject request */
router.post("/admin/requests/:id/reject", requireAdmin, (req: Request, res: Response) => {
  const admin = getSessionUser(req, res);
  if (!admin) return;
  const { reply } = req.body || {};
  const request = rejectRateLimitRequest(req.params.id as string, admin.id, typeof reply === "string" ? reply : undefined);
  if (!request) {
    res.status(404).json({ success: false, message: "申请不存在或已处理" });
    return;
  }
  res.json({ success: true, data: request, message: "申请已拒绝" });
});

export default router;
