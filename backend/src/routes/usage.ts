import { Router, Request, Response } from "express";
import { getOverview, getDaily, getByModel, getRecent, getUsageLogs, getPerformanceOverview, getPerformanceHourly, getPerformanceByModel, getRecentPerformance } from "../data/usage";
import { validateSession } from "../data/users";
import { isAdminSession } from "../middleware/admin";

const router = Router();

/** Extract session user ID from Authorization header */
function getSessionUserId(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  const session = validateSession(token);
  return session?.id || null;
}

function getSession(req: Request) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return validateSession(auth.slice(7).trim());
}

function shouldUseGlobalScope(req: Request) {
  const session = getSession(req);
  if (!session) return false;
  return req.query.scope === "all" && isAdminSession(session);
}

router.get("/", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const limit = Number(req.query.limit) || 100;
  const globalScope = shouldUseGlobalScope(req);
  res.json({
    success: true,
    data: getUsageLogs(limit, globalScope ? undefined : userId),
  });
});

router.get("/overview", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: getOverview(shouldUseGlobalScope(req) ? undefined : userId) });
});

router.get("/daily", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: getDaily(shouldUseGlobalScope(req) ? undefined : userId) });
});

router.get("/by-model", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: getByModel(shouldUseGlobalScope(req) ? undefined : userId) });
});

router.get("/recent", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: getRecent(shouldUseGlobalScope(req) ? undefined : userId) });
});

// ========== 性能监控端点 ==========

router.get("/monitor/overview", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: getPerformanceOverview(shouldUseGlobalScope(req) ? undefined : userId) });
});

router.get("/monitor/hourly", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: getPerformanceHourly(shouldUseGlobalScope(req) ? undefined : userId) });
});

router.get("/monitor/by-model", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: getPerformanceByModel(shouldUseGlobalScope(req) ? undefined : userId) });
});

router.get("/monitor/recent", (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const limit = Number(req.query.limit) || 50;
  res.json({ success: true, data: getRecentPerformance(limit, shouldUseGlobalScope(req) ? undefined : userId) });
});

export default router;
