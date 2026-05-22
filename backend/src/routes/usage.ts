import { Router, Request, Response } from "express";
import { getOverview, getDaily, getByModel, getRecent, getUsageLogs, getPerformanceOverview, getPerformanceHourly, getPerformanceByModel, getRecentPerformance } from "../data/usage";
import { validateSession } from "../data/users";
import { isAdminSession } from "../middleware/admin";

const router = Router();

/** Extract session user ID from Authorization header */
async function getSessionUserId(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  const session = await validateSession(token);
  return session?.id || null;
}

async function getSession(req: Request) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return await validateSession(auth.slice(7).trim());
}

async function shouldUseGlobalScope(req: Request) {
  const session = await getSession(req);
  if (!session) return false;
  return req.query.scope === "all" && isAdminSession(session);
}

router.get("/", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const globalScope = await shouldUseGlobalScope(req);
  res.json({
    success: true,
    data: await getUsageLogs(limit, globalScope ? undefined : userId),
  });
});

router.get("/overview", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: await getOverview((await shouldUseGlobalScope(req)) ? undefined : userId) });
});

router.get("/daily", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: await getDaily((await shouldUseGlobalScope(req)) ? undefined : userId) });
});

router.get("/by-model", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: await getByModel((await shouldUseGlobalScope(req)) ? undefined : userId) });
});

router.get("/recent", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ success: true, data: await getRecent((await shouldUseGlobalScope(req)) ? undefined : userId, limit) });
});

// ========== 性能监控端点 ==========

router.get("/monitor/overview", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: await getPerformanceOverview((await shouldUseGlobalScope(req)) ? undefined : userId) });
});

router.get("/monitor/hourly", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: await getPerformanceHourly((await shouldUseGlobalScope(req)) ? undefined : userId) });
});

router.get("/monitor/by-model", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: await getPerformanceByModel((await shouldUseGlobalScope(req)) ? undefined : userId) });
});

router.get("/monitor/recent", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ success: true, data: await getRecentPerformance(limit, (await shouldUseGlobalScope(req)) ? undefined : userId) });
});

export default router;
