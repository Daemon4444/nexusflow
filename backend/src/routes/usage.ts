import { Router, Request, Response } from "express";
import { sanitizeError } from "../utils/sanitize-error";
import { getOverview, getDaily, getByModel, getRecent, getUsageLogs, getPerformanceOverview, getPerformanceHourly, getPerformanceByModel, getRecentPerformance } from "../data/usage";
import { validateSession } from "../data/users";
import { getAdminAccessForUser } from "../data/admin-access";
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

function shouldUseGlobalScope(req: Request): boolean {
  return (req as Request & { globalUsageScope?: boolean }).globalUsageScope === true;
}

type GlobalUsageRequest = Request & {
  globalUsageScope?: boolean;
  globalUsageCanReadFinancials?: boolean;
};

function canReadGlobalFinancials(req: Request): boolean {
  return (req as GlobalUsageRequest).globalUsageCanReadFinancials === true;
}

function omitUsageFinancialFields<T extends Record<string, any>>(
  value: T,
  fields: string[] = ["cost"]
): Partial<T> {
  const output: Record<string, any> = { ...value };
  for (const field of fields) delete output[field];
  return output as Partial<T>;
}

// `scope=all` is a privileged cross-tenant read, not a presentation hint.
// Resolve it through the same role engine and demo hard-deny as the real admin
// control plane. Unauthorized requests fail explicitly instead of silently
// falling back to a user scope that can hide authorization regressions.
router.use(async (req: Request, res: Response, next) => {
  if (req.query.scope !== "all") {
    next();
    return;
  }
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const access = await getAdminAccessForUser(session);
  if (!access || !access.permissions.includes("traffic.read")) {
    res.status(403).json({
      success: false,
      message: "无权读取全局用量",
      code: "global_usage_forbidden",
    });
    return;
  }
  const scoped = req as GlobalUsageRequest;
  scoped.globalUsageScope = true;
  scoped.globalUsageCanReadFinancials =
    access.permissions.includes("billing.read") ||
    access.permissions.includes("finance.read");
  next();
});

router.get("/", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const globalScope = shouldUseGlobalScope(req);
  const records = await getUsageLogs(limit, globalScope ? undefined : userId);
  res.json({
    success: true,
    data: globalScope && !canReadGlobalFinancials(req)
      ? records.map((item) => omitUsageFinancialFields(item))
      : records,
  });
});

router.get("/overview", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const globalScope = shouldUseGlobalScope(req);
  const data = await getOverview(globalScope ? undefined : userId);
  res.json({
    success: true,
    data: globalScope && !canReadGlobalFinancials(req)
      ? omitUsageFinancialFields(data, ["totalCost"])
      : data,
  });
});

router.get("/daily", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const globalScope = shouldUseGlobalScope(req);
  const data = await getDaily(globalScope ? undefined : userId);
  res.json({
    success: true,
    data: globalScope && !canReadGlobalFinancials(req)
      ? data.map((item: any) => omitUsageFinancialFields(item))
      : data,
  });
});

router.get("/by-model", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const globalScope = shouldUseGlobalScope(req);
  const data = await getByModel(globalScope ? undefined : userId);
  res.json({
    success: true,
    data: globalScope && !canReadGlobalFinancials(req)
      ? data.map((item: any) => omitUsageFinancialFields(item))
      : data,
  });
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
  const globalScope = shouldUseGlobalScope(req);
  const records = await getRecent(globalScope ? undefined : userId, limit);
  if (globalScope) {
    res.json({
      success: true,
      // A cross-tenant row has no single discount owner. Stored realized cost
      // is authoritative; tenant-specific discounts must never be applied to
      // another tenant's records.
      data: canReadGlobalFinancials(req)
        ? records
        : records.map((item: any) => omitUsageFinancialFields(item)),
    });
    return;
  }
  const discounts = await listUserModelDiscounts(userId);
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
  res.json({ success: true, data: await getPerformanceOverview(shouldUseGlobalScope(req) ? undefined : userId) });
});

router.get("/monitor/hourly", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: await getPerformanceHourly(shouldUseGlobalScope(req) ? undefined : userId) });
});

router.get("/monitor/by-model", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  res.json({ success: true, data: await getPerformanceByModel(shouldUseGlobalScope(req) ? undefined : userId) });
});

router.get("/monitor/recent", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const globalScope = shouldUseGlobalScope(req);
  const data = await getRecentPerformance(limit, globalScope ? undefined : userId);
  res.json({
    success: true,
    data: globalScope && !canReadGlobalFinancials(req)
      ? data.map((item: any) => omitUsageFinancialFields(item))
      : data,
  });
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
            ROUND(cost::numeric, 6)::float as cost, latency_ms,
            COALESCE(cached_tokens, 0)::int as cached_tokens,
            COALESCE(cache_creation_tokens, 0)::int as cache_creation_tokens,
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
