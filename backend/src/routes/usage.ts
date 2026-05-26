import { Router, Request, Response } from "express";
import { getOverview, getDaily, getByModel, getRecent, getUsageLogs, getPerformanceOverview, getPerformanceHourly, getPerformanceByModel, getRecentPerformance } from "../data/usage";
import { validateSession } from "../data/users";
import { isAdminSession } from "../middleware/admin";
import { listUserModelDiscounts, UserModelDiscount } from "../data/user-discounts";

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

function findMatchingDiscount(modelId: string, discounts: UserModelDiscount[]): UserModelDiscount | null {
  const exact = discounts.find((d) => d.model_id === modelId && d.is_enabled);
  if (exact) return exact;
  const prefixMatches = discounts
    .filter((d) => d.is_enabled && d.model_id.endsWith("*") && d.model_id !== "*" && modelId.startsWith(d.model_id.slice(0, -1)))
    .sort((a, b) => b.model_id.length - a.model_id.length);
  if (prefixMatches.length > 0) return prefixMatches[0];
  const global = discounts.find((d) => d.model_id === "*" && d.is_enabled);
  return global || null;
}

router.get("/recent", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const globalScope = await shouldUseGlobalScope(req);
  const records = await getRecent(globalScope ? undefined : userId, limit);
  const discounts = await listUserModelDiscounts(globalScope ? undefined : userId);
  const enriched = records.map((r: any) => {
    const d = findMatchingDiscount(r.model, discounts);
    const rate = d ? d.discount_rate : 1;
    return {
      ...r,
      discount_rate: rate < 1 ? rate : undefined,
      list_cost: rate < 1 && r.cost > 0 ? Math.round((r.cost / rate) * 1000000) / 1000000 : undefined,
    };
  });
  res.json({ success: true, data: enriched });
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
