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

async function requireAuth(req: Request, res: Response): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Not logged in" });
    return null;
  }
  const session = await validateSession(auth.slice(7).trim());
  if (!session) {
    res.status(401).json({ success: false, message: "Session expired" });
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

  if (!cleanSubject) {
    res.status(400).json({ success: false, message: "Title cannot be empty" });
    return;
  }
  if (cleanSubject.length < 5) {
    res.status(400).json({ success: false, message: "Title must be at least 5 characters" });
    return;
  }
  if (!cleanDescription) {
    res.status(400).json({ success: false, message: "Description cannot be empty" });
    return;
  }
  if (cleanDescription.length < 20) {
    res.status(400).json({ success: false, message: "Please provide a more complete description, at least 20 characters" });
    return;
  }

  const ticket = await createTicket({
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
router.get("/", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  res.json({ success: true, data: await getUserTickets(userId) });
});

/** GET /api/tickets/:id — Get ticket detail */
router.get("/:id", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const ticket = await getTicket(req.params.id as string, userId);
  if (!ticket) {
    res.status(404).json({ success: false, message: "Ticket not found" });
    return;
  }

  res.json({ success: true, data: ticket });
});

/** GET /api/tickets/admin — Admin list tickets */
router.get("/admin/all", requireAdmin, async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json({ success: true, data: await getAllTickets(status) });
});

/** GET /api/tickets/admin/:id — Admin ticket detail */
router.get("/admin/:id", requireAdmin, async (req: Request, res: Response) => {
  const tickets = await getAllTickets();
  const ticket = tickets.find((item) => item.id === req.params.id);
  if (!ticket) {
    res.status(404).json({ success: false, message: "Ticket not found" });
    return;
  }
  res.json({ success: true, data: ticket });
});

/** POST /api/tickets/:id/reply — Admin reply / update status */
router.post("/:id/reply", requireAdmin, async (req: Request, res: Response) => {
  const { reply, status } = req.body || {};
  if (!reply?.trim()) {
    res.status(400).json({ success: false, message: "Reply cannot be empty" });
    return;
  }
  if (!["open", "in_progress", "resolved", "rejected"].includes(status)) {
    res.status(400).json({ success: false, message: "Invalid status" });
    return;
  }

  const ticket = await replyTicket(req.params.id as string, reply.trim(), status);
  if (!ticket) {
    res.status(404).json({ success: false, message: "Ticket not found" });
    return;
  }

  res.json({ success: true, data: ticket });
});

export default router;
