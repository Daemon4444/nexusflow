/**
 * Rate Limits API (user-facing + admin)
 *
 * GET    /api/rate-limits          — Get current user's rate limits overview
 * POST   /api/rate-limits/request  — Request higher limits (creates a ticket)
 *
 * Admin:
 * GET    /api/rate-limits/admin       — All users' limits
 * POST   /api/rate-limits/admin/set   — Set a user's limit
 */

import { Router, Request, Response } from "express";
import { validateSession } from "../data/users";
import { getUserLimitsOverview } from "../data/ratelimits";
import { getEffectiveRateLimit } from "../data/ratelimits";

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

/** GET /api/rate-limits/:model — Get effective limit for a specific model */
router.get("/:model", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.json({
    success: true,
    data: getEffectiveRateLimit(userId, req.params.model as string),
  });
});

export default router;
