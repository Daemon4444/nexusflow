import { Router, Request, Response } from "express";
import { validateSession } from "../data/users";
import {
  approveRateLimitRequest,
  deleteUserRateLimit,
  getAdminRateLimitRequests,
  getEffectiveRateLimit,
  getUserLimitsOverview,
  RateLimitApprovalError,
  rejectRateLimitRequest,
  setUserRateLimit,
  submitRateLimitRequest,
} from "../data/ratelimits";
import { getSessionUser } from "../middleware/admin";
import { requirePermission } from "../middleware/admin-access";
import { auditAdminWrite } from "../middleware/admin-audit";
import {
  RateLimitRequestLimitError,
} from "../data/rate-limit-requests";
import { reservePersistentWrite } from "../services/control-plane-write-admission";
import { getTrustedClientIp } from "../utils/client-ip";

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
  const cleanModel = typeof model === "string" ? model.trim() : "";
  const cleanReason = typeof reason === "string" ? reason.trim() : "";
  if (!cleanModel || cleanModel.length > 128) {
    res.status(400).json({ success: false, message: "模型 ID 必须是 1-128 个字符" });
    return;
  }
  if (cleanReason.length > 4096) {
    res.status(400).json({ success: false, message: "申请原因不能超过 4096 个字符" });
    return;
  }
  if (!Number.isSafeInteger(qpm) || qpm <= 0 || qpm > 2_000_000_000) {
    res.status(400).json({ success: false, message: "请填写有效的 QPM" });
    return;
  }
  if (!Number.isSafeInteger(tpm) || tpm <= 0 || tpm > 2_000_000_000) {
    res.status(400).json({ success: false, message: "请填写有效的 TPM" });
    return;
  }

  const admission = await reservePersistentWrite({
    kind: "rate_limit_request",
    userId,
    clientIp: getTrustedClientIp(req),
  });
  if (!admission.allowed) {
    res
      .status(admission.reason === "redis_unavailable" ? 503 : 429)
      .set("Retry-After", String(admission.retryAfterSeconds))
      .json({
        success: false,
        code: admission.reason,
        message: admission.reason === "redis_unavailable"
          ? "申请服务暂时不可用"
          : "申请提交过于频繁，请稍后再试",
      });
    return;
  }

  try {
    const request = await submitRateLimitRequest({
      userId,
      model: cleanModel,
      requestedQpm: qpm,
      requestedTpm: tpm,
      reason: cleanReason,
    });
    res.json({ success: true, data: request, message: "申请已提交" });
  } catch (error) {
    if (error instanceof RateLimitRequestLimitError) {
      const messageByCode: Record<RateLimitRequestLimitError["code"], string> = {
        pending_request_exists: "该模型已有待审批申请",
        pending_request_limit: "待审批申请数量已达上限",
        request_history_limit: "历史申请数量已达上限，请联系管理员归档",
        user_not_found: "用户不存在",
      };
      res.status(error.code === "user_not_found" ? 404 : 409).json({
        success: false,
        code: error.code,
        message: messageByCode[error.code],
      });
      return;
    }
    throw error;
  }
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
router.get("/admin/requests", requirePermission("support.read"), async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status && !["pending", "approved", "rejected"].includes(status)) {
    res.status(400).json({ success: false, message: "无效状态" });
    return;
  }
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(req.query.pageSize) || 20)));
  const query = typeof req.query.q === "string"
    ? req.query.q.trim().slice(0, 128)
    : undefined;
  const requests = await getAdminRateLimitRequests(status, {
    query,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  res.json({
    success: true,
    data: {
      items: requests.items,
      pagination: {
        page,
        pageSize,
        total: requests.total,
        totalPages: Math.max(1, Math.ceil(requests.total / pageSize)),
      },
    },
  });
});

/** PUT /api/rate-limits/admin/users/:userId/models/:model — Directly set a user's model limits */
router.put("/admin/users/:userId/models/:model", auditAdminWrite, requirePermission("support.manage"), async (req: Request, res: Response) => {
  const userId = String(req.params.userId);
  const model = String(req.params.model || "*");
  const qpm = Number(req.body?.qpm);
  const tpm = Number(req.body?.tpm);
  if (!model.trim() || model.length > 128) {
    res.status(400).json({ success: false, message: "model 必须是 1-128 个字符" });
    return;
  }
  if (!Number.isSafeInteger(qpm) || qpm <= 0 || qpm > 2_000_000_000) {
    res.status(400).json({ success: false, message: "qpm 必须是大于 0 的数字" });
    return;
  }
  if (!Number.isSafeInteger(tpm) || tpm <= 0 || tpm > 2_000_000_000) {
    res.status(400).json({ success: false, message: "tpm 必须是大于 0 的数字" });
    return;
  }
  await setUserRateLimit(userId, model, qpm, tpm, "admin");
  res.json({
    success: true,
    data: await getEffectiveRateLimit(userId, model),
    message: "用户模型限流已更新",
  });
});

/** DELETE /api/rate-limits/admin/users/:userId/models/:model — Remove a direct user/model limit */
router.delete("/admin/users/:userId/models/:model", auditAdminWrite, requirePermission("support.manage"), async (req: Request, res: Response) => {
  const ok = await deleteUserRateLimit(String(req.params.userId), String(req.params.model || "*"));
  res.json({ success: ok, message: ok ? "用户模型限流已删除" : "限流规则不存在" });
});

/** POST /api/rate-limits/admin/requests/:id/approve — Approve request */
router.post("/admin/requests/:id/approve", auditAdminWrite, requirePermission("support.manage"), async (req: Request, res: Response) => {
  const admin = (req as any).admin || await getSessionUser(req, res);
  if (!admin) return;
  const { model, qpm, tpm, reply } = req.body || {};
  if (typeof reply === "string" && reply.length > 3000) {
    res.status(400).json({ success: false, message: "回复不能超过 3000 个字符" });
    return;
  }
  let request;
  try {
    request = await approveRateLimitRequest(req.params.id as string, admin.id, {
      model: typeof model === "string" ? model : undefined,
      qpm: qpm !== undefined ? Number(qpm) : undefined,
      tpm: tpm !== undefined ? Number(tpm) : undefined,
      reply: typeof reply === "string" ? reply : undefined,
    });
  } catch (error) {
    if (error instanceof RateLimitApprovalError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    throw error;
  }
  if (!request) {
    res.status(404).json({ success: false, message: "申请不存在或已处理" });
    return;
  }
  res.json({ success: true, data: request, message: "申请已批准" });
});

/** POST /api/rate-limits/admin/requests/:id/reject — Reject request */
router.post("/admin/requests/:id/reject", auditAdminWrite, requirePermission("support.manage"), async (req: Request, res: Response) => {
  const admin = (req as any).admin || await getSessionUser(req, res);
  if (!admin) return;
  const { reply } = req.body || {};
  if (typeof reply === "string" && reply.length > 3000) {
    res.status(400).json({ success: false, message: "回复不能超过 3000 个字符" });
    return;
  }
  const request = await rejectRateLimitRequest(req.params.id as string, admin.id, typeof reply === "string" ? reply : undefined);
  if (!request) {
    res.status(404).json({ success: false, message: "申请不存在或已处理" });
    return;
  }
  res.json({ success: true, data: request, message: "申请已拒绝" });
});

export default router;
