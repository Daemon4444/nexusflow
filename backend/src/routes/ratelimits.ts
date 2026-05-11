import { Router, Request, Response } from "express";
import { validateSession } from "../data/users";
import {
  approveRateLimitRequest,
  deleteUserRateLimit,
  getAdminRateLimitRequests,
  getEffectiveRateLimit,
  getUserLimitsOverview,
  rejectRateLimitRequest,
  setUserRateLimit,
  submitRateLimitRequest,
} from "../data/ratelimits";
import { requireAdmin, getSessionUser } from "../middleware/admin";

const router = Router();

async function requireAuth(req: Request, res: Response): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "未登录" });
    return null;
  }
  const session = await validateSession(auth.slice(7).trim());
  if (!session) {
    res.status(401).json({ success: false, message: "登录已过期" });
    return null;
  }
  return (session as any).user_id || session.id;
}

/** GET /api/rate-limits — Get current user's limits overview */
router.get("/", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  res.json({
    success: true,
    data: await getUserLimitsOverview(userId),
  });
});

/** GET /api/rate-limits/requests — Get current user's request history */
router.get("/requests", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  res.json({
    success: true,
    data: (await getUserLimitsOverview(userId)).requests || [],
  });
});

/** POST /api/rate-limits/request — Submit a direct rate limit request */
router.post("/request", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
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

  const request = await submitRateLimitRequest({
    userId,
    model: String(model || "*"),
    requestedQpm: Math.round(qpm),
    requestedTpm: Math.round(tpm),
    reason: String(reason || ""),
  });

  res.json({ success: true, data: request, message: "申请已提交" });
});

/** GET /api/rate-limits/:model — Get effective limit for a specific model */
router.get("/:model", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  res.json({
    success: true,
    data: await getEffectiveRateLimit(userId, req.params.model as string),
  });
});

/** GET /api/rate-limits/admin/requests — Admin list rate-limit requests */
router.get("/admin/requests", requireAdmin, async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const requests = await getAdminRateLimitRequests(status);
  res.json({ success: true, data: requests });
});

/** PUT /api/rate-limits/admin/users/:userId/models/:model — Directly set a user's model limits */
router.put("/admin/users/:userId/models/:model", requireAdmin, async (req: Request, res: Response) => {
  const userId = String(req.params.userId);
  const model = String(req.params.model || "*");
  const qpm = Number(req.body?.qpm);
  const tpm = Number(req.body?.tpm);
  if (!Number.isFinite(qpm) || qpm <= 0) {
    res.status(400).json({ success: false, message: "qpm 必须是大于 0 的数字" });
    return;
  }
  if (!Number.isFinite(tpm) || tpm <= 0) {
    res.status(400).json({ success: false, message: "tpm 必须是大于 0 的数字" });
    return;
  }
  await setUserRateLimit(userId, model, Math.round(qpm), Math.round(tpm), "admin");
  res.json({
    success: true,
    data: await getEffectiveRateLimit(userId, model),
    message: "用户模型限流已更新",
  });
});

/** DELETE /api/rate-limits/admin/users/:userId/models/:model — Remove a direct user/model limit */
router.delete("/admin/users/:userId/models/:model", requireAdmin, async (req: Request, res: Response) => {
  const ok = await deleteUserRateLimit(String(req.params.userId), String(req.params.model || "*"));
  res.json({ success: ok, message: ok ? "用户模型限流已删除" : "限流规则不存在" });
});

/** POST /api/rate-limits/admin/requests/:id/approve — Approve request */
router.post("/admin/requests/:id/approve", requireAdmin, async (req: Request, res: Response) => {
  const admin = await getSessionUser(req, res);
  if (!admin) return;
  const { model, qpm, tpm, reply } = req.body || {};
  const request = await approveRateLimitRequest(req.params.id as string, admin.id, {
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
router.post("/admin/requests/:id/reject", requireAdmin, async (req: Request, res: Response) => {
  const admin = await getSessionUser(req, res);
  if (!admin) return;
  const { reply } = req.body || {};
  const request = await rejectRateLimitRequest(req.params.id as string, admin.id, typeof reply === "string" ? reply : undefined);
  if (!request) {
    res.status(404).json({ success: false, message: "申请不存在或已处理" });
    return;
  }
  res.json({ success: true, data: request, message: "申请已拒绝" });
});

export default router;
