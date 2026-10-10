import { Router, Request, Response } from "express";
import { getOverview, getDaily, getByModel, getRecent, getUsageLogs, getPerformanceOverview, getPerformanceHourly, getPerformanceByModel, getRecentPerformance } from "../data/usage";
import { validateSession } from "../data/users";
import { getAdminAccessForUser } from "../data/admin-access";
import { parseUsageDate } from "../utils/usage-dates";

const router = Router();

function readLimit(req: Request, res: Response, fallback: number, maximum: number): number | null {
  if (req.query.limit === undefined) return fallback;
  const raw = req.query.limit;
  const limit = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    res.status(400).json({ success: false, code: "invalid_limit", message: "limit 必须为正整数" });
    return null;
  }
  return Math.min(limit, maximum);
}

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
  const limit = readLimit(req, res, 100, 1000);
  if (limit === null) return;
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

router.get("/recent", async (req: Request, res: Response) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "未登录" });
    return;
  }
  const limit = readLimit(req, res, 50, 200);
  if (limit === null) return;
  const globalScope = shouldUseGlobalScope(req);
  const records = await getRecent(globalScope ? undefined : userId, limit, !globalScope);
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
  // Only settlement-time snapshots may describe historical prices and discounts.
  res.json({ success: true, data: records.map((record: any) => ({
    ...record,
    discount_rate: record.discount_rate ?? undefined,
    list_cost: record.list_cost ?? undefined,
  })) });
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
  const limit = readLimit(req, res, 50, 200);
  if (limit === null) return;
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
  const maxLimit = readLimit(req, res, 50, 200);
  if (maxLimit === null) return;
  const fromDate = from === undefined ? undefined : parseUsageDate(from);
  const toDate = to === undefined ? undefined : parseUsageDate(to, true);
  if (fromDate === null || toDate === null || (fromDate && toDate && fromDate > toDate)
    || (log_id !== undefined && typeof log_id !== "string")
    || (model !== undefined && typeof model !== "string")) {
    res.status(400).json({ success: false, code: "invalid_usage_filter", message: "请使用有效日期范围；时间戳必须包含时区" });
    return;
  }

  const conditions: string[] = ["user_id = $1"];
  const params: any[] = [userId];
  let idx = 2;

  if (log_id) { conditions.push(`log_id = $${idx++}`); params.push(log_id); }
  if (model) { conditions.push(`model = $${idx++}`); params.push(model); }
  if (fromDate) { conditions.push(`created_at >= $${idx++}`); params.push(fromDate.toISOString()); }
  if (toDate) {
    const dateOnly = typeof to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(to);
    conditions.push(`created_at ${dateOnly ? "<" : "<="} $${idx++}`);
    // PostgreSQL retains microseconds; include the complete final calendar day.
    params.push(new Date(toDate.getTime() + (dateOnly ? 1 : 0)).toISOString());
  }

  const { db } = await import("../db/client");
  const rows = await db.queryMany(
    `SELECT log_id, model, status, prompt_tokens, completion_tokens, total_tokens,
            ROUND(cost::numeric, 6)::float as cost, latency_ms,
            COALESCE(cached_tokens, 0)::int as cached_tokens,
            COALESCE(cache_creation_tokens, 0)::int as cache_creation_tokens,
            to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || '+08:00' as time
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

  const logId = String(req.params.logId);
  const { db } = await import("../db/client");

  const row = await db.queryOne<{ user_id: string; parent_user_id: string | null; created_at: string }>(
    `SELECT ul.user_id, u.parent_user_id, ul.created_at
       FROM usage_logs ul LEFT JOIN users u ON u.id = ul.user_id
      WHERE ul.log_id = $1 AND ul.user_id = $2`,
    [logId, userId]
  );
  if (!row) {
    res.status(404).json({ success: false, code: "log_not_found", message: "日志不存在或无权限查看" });
    return;
  }

  // Full capture first: untruncated and kept permanently. SLS below only
  // covers calls from before capture, truncated and for 7 days.
  try {
    const { findCapturedPayload } = await import("../services/payload-capture");
    const captured = await findCapturedPayload({
      logId,
      owner: row.parent_user_id || row.user_id,
      completedAt: new Date(row.created_at),
    });
    // The archive path is not an authorization boundary: re-check identity.
    if (captured && captured.log_id === logId && captured.user_id === userId) {
      res.json({
        success: true,
        data: {
          request: typeof captured.request === "string" ? captured.request : JSON.stringify(captured.request),
          response: captured.response,
        },
      });
      return;
    }
  } catch {
    console.error("[usage] captured payload lookup failed", { logId, code: "capture_lookup_failed" });
  }
  // A call from the current hour served by the other node is only in its
  // local spool until the hourly upload (:05); say so instead of failing.
  if (Date.now() - new Date(row.created_at).getTime() < 75 * 60_000) {
    res.json({ success: true, data: null, note: "该请求由另一台服务器处理，详情每小时整点后约 5 分钟上传，届时可查看。" });
    return;
  }

  const { getSlsClient } = await import("../services/sls");
  const slsClient = getSlsClient();
  if (!slsClient) {
    res.status(503).json({ success: false, code: "log_detail_unavailable", message: "日志详情服务暂不可用，请联系支持并提供 Request ID" });
    return;
  }

  const created = new Date(row.created_at);
  const from = new Date(created.getTime() - 60000);
  const to = new Date(created.getTime() + 120000);

  try {
    const logs = await slsClient.getLogs("nexusflow", "nexusflow", from, to, {
      // The production logstore has no field index on logId/userId (a field
      // query fails), so search the full text and filter exactly below.
      query: JSON.stringify(logId), line: 10,
    }, { readTimeout: 10000, connectTimeout: 5000 });
    // Search results are not an authorization boundary. Verify persisted identity
    // fields again before exposing any content, even after an indexed search.
    const entry = Array.isArray(logs)
      ? logs.find(item => item?.logId === logId && item?.userId === userId) : null;
    res.json({
      success: true,
      data: entry ? {
        request: entry.request || null,
        response: entry.response || null,
      } : null,
      note: entry ? undefined : "未找到详情：日志可能仍在索引中（约 1–2 分钟），或已超出保留期。",
    });
  } catch {
    console.error("[usage] log detail query failed", { logId, code: "sls_query_failed" });
    res.status(503).json({ success: false, code: "log_detail_unavailable", message: "日志详情暂时无法读取，请重试；若持续失败，请联系支持并提供 Request ID" });
  }
});

export default router;
