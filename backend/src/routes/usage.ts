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

// ========== 日志查询端点 ==========

router.get("/logs/search", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) { res.status(401).json({ success: false, message: "未登录" }); return; }

  const { log_id, model, from, to } = req.query;
  const maxLimit = Math.min(Number(req.query.limit) || 50, 200);

  const conditions: string[] = ["user_id = $1"];
  const params: any[] = [userId];
  let idx = 2;

  if (log_id) { conditions.push(`log_id = $${idx++}`); params.push(log_id); }
  if (model) { conditions.push(`model = $${idx++}`); params.push(model); }
  if (from) { conditions.push(`created_at >= $${idx++}`); params.push(from); }
  if (to) { conditions.push(`created_at <= $${idx++}`); params.push(to); }

  const { db } = await import("../db/client");
  const rows = await db.queryMany(
    `SELECT log_id, model, status, prompt_tokens, completion_tokens, total_tokens,
            ROUND(cost::numeric, 6)::float as cost, latency_ms, cached_tokens,
            to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as time
     FROM usage_logs
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${idx}`,
    [...params, maxLimit]
  );
  res.json({ success: true, data: rows });
});

router.get("/logs/:logId/detail", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) { res.status(401).json({ success: false, message: "未登录" }); return; }

  const { logId } = req.params;
  const { db } = await import("../db/client");

  const row = await db.queryOne<{ user_id: string; created_at: string }>(
    "SELECT user_id, created_at FROM usage_logs WHERE log_id = $1 AND user_id = $2",
    [logId, userId]
  );
  if (!row) {
    res.json({ success: false, message: "日志不存在或无权限查看" });
    return;
  }

  const { getSlsClient } = await import("../services/sls");
  const slsClient = getSlsClient();
  if (!slsClient) {
    res.json({ success: false, message: "SLS 未配置" });
    return;
  }

  const created = new Date(row.created_at);
  const from = new Date(created.getTime() - 60000);
  const to = new Date(created.getTime() + 120000);

  try {
    const logs = await slsClient.getLogs("nexusflow", "nexusflow", from, to, { query: `"${logId}"`, line: 1 }, { readTimeout: 10000, connectTimeout: 5000 });
    const entry = Array.isArray(logs) && logs.length > 0 ? logs[0] : null;
    res.json({
      success: true,
      data: entry ? {
        request: entry.request || null,
        response: entry.response || null,
      } : null,
      note: entry ? undefined : "日志可能仍在索引中（SLS 延迟 1-2 分钟），请稍后重试",
    });
  } catch (err: any) {
    res.json({ success: false, message: "SLS 查询失败: " + err.message });
  }
});

export default router;
