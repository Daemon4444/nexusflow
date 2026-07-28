/**
 * Tickets API
 *
 * POST   /api/tickets             — Create a ticket
 * GET    /api/tickets             — List current user's tickets
 * GET    /api/tickets/:id         — Get ticket detail
 * POST   /api/tickets/:id/reply   — Admin reply / update status
 */

import { Router, Request, Response } from "express";
import { validateSession } from "../data/users";
import {
  createTicket,
  getUserTickets,
  getTicket,
  replyTicket,
  getAdminTicket,
  getAdminTicketsPage,
  TicketLimitError,
} from "../data/tickets";
import { requirePermission } from "../middleware/admin-access";
import { auditAdminWrite } from "../middleware/admin-audit";
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

/** POST /api/tickets — Create ticket */
router.post("/", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { type = "rate_limit", subject, description, model, requestedQpm, requestedTpm } = req.body || {};

  const cleanSubject = typeof subject === "string" ? subject.trim() : "";
  const cleanDescription = typeof description === "string" ? description.trim() : "";
  const cleanType = typeof type === "string" ? type.trim() : "";
  const cleanModel = typeof model === "string" ? model.trim() : "";
  const qpm = requestedQpm === undefined || requestedQpm === null || requestedQpm === ""
    ? undefined
    : Number(requestedQpm);
  const tpm = requestedTpm === undefined || requestedTpm === null || requestedTpm === ""
    ? undefined
    : Number(requestedTpm);

  if (!["rate_limit", "billing", "technical", "support", "other"].includes(cleanType)) {
    res.status(400).json({ success: false, message: "无效工单类型" });
    return;
  }
  if (cleanSubject.length < 5 || cleanSubject.length > 120) {
    res.status(400).json({ success: false, message: "标题必须是 5-120 个字符" });
    return;
  }
  if (cleanDescription.length < 20 || cleanDescription.length > 5000) {
    res.status(400).json({ success: false, message: "描述必须是 20-5000 个字符" });
    return;
  }
  if (cleanModel.length > 128) {
    res.status(400).json({ success: false, message: "模型 ID 不能超过 128 个字符" });
    return;
  }
  if (qpm !== undefined && (!Number.isSafeInteger(qpm) || qpm <= 0 || qpm > 2_000_000_000)) {
    res.status(400).json({ success: false, message: "requestedQpm 无效" });
    return;
  }
  if (tpm !== undefined && (!Number.isSafeInteger(tpm) || tpm <= 0 || tpm > 2_000_000_000)) {
    res.status(400).json({ success: false, message: "requestedTpm 无效" });
    return;
  }

  const admission = await reservePersistentWrite({
    kind: "ticket",
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
          ? "工单服务暂时不可用"
          : "工单提交过于频繁，请稍后再试",
      });
    return;
  }

  try {
    const ticket = await createTicket({
      userId,
      type: cleanType,
      subject: cleanSubject,
      description: cleanDescription,
      model: cleanModel || undefined,
      requestedQpm: qpm,
      requestedTpm: tpm,
    });
    res.json({ success: true, data: ticket });
  } catch (error) {
    if (error instanceof TicketLimitError) {
      const messages: Record<TicketLimitError["code"], string> = {
        open_ticket_limit: "未处理工单数量已达上限",
        ticket_history_limit: "历史工单数量已达上限，请联系管理员归档",
        user_not_found: "用户不存在",
      };
      res.status(error.code === "user_not_found" ? 404 : 409).json({
        success: false,
        code: error.code,
        message: messages[error.code],
      });
      return;
    }
    throw error;
  }
});

/** GET /api/tickets — List user's tickets */
router.get("/", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const limit = Math.max(1, Math.min(100, Math.floor(Number(req.query.limit) || 100)));
  const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
  res.json({ success: true, data: await getUserTickets(userId, limit, offset) });
});

/** GET /api/tickets/admin — Admin list tickets */
router.get("/admin/all", requirePermission("support.read"), async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status && !["open", "in_progress", "resolved", "rejected"].includes(status)) {
    res.status(400).json({ success: false, message: "无效状态" });
    return;
  }
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(req.query.pageSize) || 20)));
  const query = typeof req.query.q === "string"
    ? req.query.q.trim().slice(0, 128)
    : undefined;
  const tickets = await getAdminTicketsPage({
    status,
    query,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  res.json({
    success: true,
    data: {
      items: tickets.items,
      pagination: {
        page,
        pageSize,
        total: tickets.total,
        totalPages: Math.max(1, Math.ceil(tickets.total / pageSize)),
      },
    },
  });
});

/** GET /api/tickets/admin/:id — Admin ticket detail */
router.get("/admin/:id", requirePermission("support.read"), async (req: Request, res: Response) => {
  const ticket = await getAdminTicket(req.params.id as string);
  if (!ticket) {
    res.status(404).json({ success: false, message: "工单不存在" });
    return;
  }
  res.json({ success: true, data: ticket });
});

/** POST /api/tickets/:id/reply — Admin reply / update status */
router.post("/:id/reply", auditAdminWrite, requirePermission("support.manage"), async (req: Request, res: Response) => {
  const { reply, status } = req.body || {};
  const cleanReply = typeof reply === "string" ? reply.trim() : "";
  if (cleanReply.length < 1 || cleanReply.length > 3000) {
    res.status(400).json({ success: false, message: "回复必须是 1-3000 个字符" });
    return;
  }
  if (!["open", "in_progress", "resolved", "rejected"].includes(status)) {
    res.status(400).json({ success: false, message: "无效状态" });
    return;
  }

  const ticket = await replyTicket(req.params.id as string, cleanReply, status);
  if (!ticket) {
    res.status(404).json({ success: false, message: "工单不存在" });
    return;
  }

  res.json({ success: true, data: ticket });
});

/** GET /api/tickets/:id — Get ticket detail */
router.get("/:id", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const ticket = await getTicket(req.params.id as string, userId);
  if (!ticket) {
    res.status(404).json({ success: false, message: "工单不存在" });
    return;
  }

  res.json({ success: true, data: ticket });
});

export default router;
