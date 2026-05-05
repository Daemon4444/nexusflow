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
import { createTicket, getUserTickets, getTicket, replyTicket, getAllTickets } from "../data/tickets";
import { requireAdmin } from "../middleware/admin";

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

/** POST /api/tickets — Create ticket */
router.post("/", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { type = "rate_limit", subject, description, model, requestedQpm, requestedTpm } = req.body || {};

  const cleanSubject = typeof subject === "string" ? subject.trim() : "";
  const cleanDescription = typeof description === "string" ? description.trim() : "";

  if (!cleanSubject) {
    res.status(400).json({ success: false, message: "标题不能为空" });
    return;
  }
  if (cleanSubject.length < 5) {
    res.status(400).json({ success: false, message: "标题至少 5 个字符" });
    return;
  }
  if (!cleanDescription) {
    res.status(400).json({ success: false, message: "描述不能为空" });
    return;
  }
  if (cleanDescription.length < 20) {
    res.status(400).json({ success: false, message: "请补充更完整的问题描述，至少 20 个字符" });
    return;
  }

  const ticket = createTicket({
    userId,
    type,
    subject: cleanSubject.slice(0, 120),
    description: cleanDescription.slice(0, 5000),
    model: model?.trim() || undefined,
    requestedQpm: requestedQpm ? Number(requestedQpm) : undefined,
    requestedTpm: requestedTpm ? Number(requestedTpm) : undefined,
  });

  res.json({ success: true, data: ticket });
});

/** GET /api/tickets — List user's tickets */
router.get("/", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.json({ success: true, data: getUserTickets(userId) });
});

/** GET /api/tickets/:id — Get ticket detail */
router.get("/:id", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const ticket = getTicket(req.params.id as string, userId);
  if (!ticket) {
    res.status(404).json({ success: false, message: "工单不存在" });
    return;
  }

  res.json({ success: true, data: ticket });
});

/** GET /api/tickets/admin — Admin list tickets */
router.get("/admin/all", requireAdmin, (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json({ success: true, data: getAllTickets(status) });
});

/** GET /api/tickets/admin/:id — Admin ticket detail */
router.get("/admin/:id", requireAdmin, (req: Request, res: Response) => {
  const tickets = getAllTickets();
  const ticket = tickets.find((item) => item.id === req.params.id);
  if (!ticket) {
    res.status(404).json({ success: false, message: "工单不存在" });
    return;
  }
  res.json({ success: true, data: ticket });
});

/** POST /api/tickets/:id/reply — Admin reply / update status */
router.post("/:id/reply", requireAdmin, (req: Request, res: Response) => {
  const { reply, status } = req.body || {};
  if (!reply?.trim()) {
    res.status(400).json({ success: false, message: "回复不能为空" });
    return;
  }
  if (!["open", "in_progress", "resolved", "rejected"].includes(status)) {
    res.status(400).json({ success: false, message: "无效状态" });
    return;
  }

  const ticket = replyTicket(req.params.id as string, reply.trim(), status);
  if (!ticket) {
    res.status(404).json({ success: false, message: "工单不存在" });
    return;
  }

  res.json({ success: true, data: ticket });
});

export default router;
