import { Router, Request, Response } from "express";
import { requireAdmin } from "../middleware/admin";
import { AdminAuthorizedRequest, requirePermission } from "../middleware/admin-access";
import {
  auditAdminWrite,
  getAdminClientIp,
  getAdminRequestId,
  setAdminAuditContext,
} from "../middleware/admin-audit";
import { sanitizeError } from "../utils/sanitize-error";
import { getAdminUserLimitSummaries, getUserLimitsOverview } from "../data/ratelimits";
import { getBillingUsageExport, getTransactions, getBillingSummary, getSubAccountBreakdown } from "../data/billing";
import { AdminAdjustmentError, applyAdminAdjustment } from "../data/admin-finance";
import { getByModel, getOverview, getRecent, getUsageSummary } from "../data/usage";
import {
  getDashboardDailyStats,
  getDashboardHourlyStats,
  getUserGrowth,
  getActiveUserCounts,
  getTopUsersByUsage,
  getRevenueOverview,
  getModelDistribution,
} from "../data/dashboard";
import { listUserModelDiscounts } from "../data/user-discounts";
import { getUserById, getAllUsers, toSafeUser } from "../data/users";
import { db } from "../db/client";
import { getSlsClient } from "../services/sls";
import { models, getStaticModels } from "../data/models";
import {
  sanitizeModelDoc,
  listOverrides,
  upsertOverride,
  disableStaticModel,
  deleteOverride,
  refreshModels,
} from "../data/model-overrides";

const router = Router();

router.use(auditAdminWrite);
router.use(requireAdmin);

// ========== 监控大盘 ==========

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const range = String(req.query.range || "7d");
    const isHourly = range.endsWith("h");
    const rangeValue = parseInt(range, 10) || (isHourly ? 1 : 7);

    // Parse range into hours/days
    let hours: number;
    let days: number;
    let granularity: "hourly" | "daily";

    if (isHourly) {
      hours = Math.min(Math.max(rangeValue, 1), 24);
      days = Math.ceil(hours / 24) || 1;
      granularity = "hourly";
    } else {
      days = Math.min(Math.max(rangeValue, 1), 90);
      hours = days * 24;
      granularity = "daily";
    }

    const growthDays = Math.min(days * 4, 30); // user growth always shows up to 30 days

    // Get time series data based on granularity
    const timeSeriesPromise = granularity === "hourly"
      ? getDashboardHourlyStats(hours)
      : getDashboardDailyStats(days);

    const [timeSeries, userGrowth, activeUsers, topUsers, revenue, modelDist, overview] =
      await Promise.all([
        timeSeriesPromise,
        getUserGrowth(growthDays),
        getActiveUserCounts(),
        getTopUsersByUsage(10, days),
        getRevenueOverview(days),
        getModelDistribution(),
        getOverview(), // global scope (no userId)
      ]);

    // Compute period totals from time series
    const periodTotals = timeSeries.reduce(
      (acc, item) => ({
        requests: acc.requests + item.requests,
        success: acc.success + item.success,
        errors: acc.errors + item.errors,
        cost: acc.cost + item.cost,
      }),
      { requests: 0, success: 0, errors: 0, cost: 0 }
    );
    const periodSuccessRate = periodTotals.requests > 0
      ? Math.round((periodTotals.success / periodTotals.requests) * 1000) / 10
      : 0;

    res.json({
      success: true,
      data: {
        timeSeries,
        userGrowth,
        activeUsers,
        topUsers,
        revenue,
        modelDist,
        overview,
        granularity,
        period: {
          requests: periodTotals.requests,
          successRate: periodSuccessRate,
          cost: Number(periodTotals.cost.toFixed(2)),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: sanitizeError(err) });
  }
});

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const formulaSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

function usageRowsToCsv(rows: Record<string, unknown>[]): string {
  const headers = [
    "invoice_period_start",
    "invoice_period_end",
    "usage_id",
    "occurred_at",
    "api_key_id",
    "api_key_name",
    "model_id",
    "model_name",
    "provider",
    "pricing_type",
    "status",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "cached_tokens",
    "cache_creation_tokens",
    "tier_label",
    "tier_max_tokens",
    "prompt_unit_price_cny_per_1m_tokens",
    "completion_unit_price_cny_per_1m_tokens",
    "prompt_amount_cny",
    "completion_amount_cny",
    "list_amount_cny",
    "discount_rate",
    "discount_amount_cny",
    "billed_amount_cny",
    "recalculated_amount_cny",
    "rounding_delta_cny",
    "pricing_note",
  ];
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

router.get("/users", async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: await getAdminUserLimitSummaries(),
  });
});

router.get("/users/:id/detail", async (req: Request, res: Response) => {
  const userId = String(req.params.id);
  const user = await getUserById(userId);
  if (!user) {
    res.status(404).json({ success: false, message: "用户不存在" });
    return;
  }

  const [usage, byModel, recent, transactions, discounts, limitsOverview] = await Promise.all([
    getUsageSummary(userId),
    getByModel(userId),
    getRecent(userId),
    getTransactions(userId, 20, 0),
    listUserModelDiscounts(userId),
    getUserLimitsOverview(userId),
  ]);

  res.json({
    success: true,
    data: {
      user: toSafeUser(user),
      usage,
      byModel,
      recent,
      transactions,
      discounts,
      requests: limitsOverview.requests,
      defaultQpm: limitsOverview.defaultQpm,
      defaultTpm: limitsOverview.defaultTpm,
      customLimits: limitsOverview.customLimits,
    },
  });
});

router.get("/users/:id/billing-export.csv", async (req: Request, res: Response) => {
  const userId = String(req.params.id);
  const user = await getUserById(userId);
  if (!user) {
    res.status(404).json({ success: false, message: "用户不存在" });
    return;
  }

  try {
    const exportData = await getBillingUsageExport(userId, {
      startDate: typeof req.query.startDate === "string" ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === "string" ? req.query.endDate : undefined,
    });

    const rows = exportData.rows.map((row) => ({
      invoice_period_start: exportData.startDate,
      invoice_period_end: exportData.endDate,
      usage_id: row.usage_id,
      occurred_at: row.created_at,
      api_key_id: row.api_key_id,
      api_key_name: row.api_key_name,
      model_id: row.model,
      model_name: row.model_name,
      provider: row.provider,
      pricing_type: row.pricing_type,
      status: row.status,
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      total_tokens: row.total_tokens,
      cached_tokens: row.cached_tokens,
      cache_creation_tokens: row.cache_creation_tokens,
      tier_label: row.tier_label,
      tier_max_tokens: row.tier_max_tokens,
      prompt_unit_price_cny_per_1m_tokens: row.prompt_unit_price_cny_per_1m,
      completion_unit_price_cny_per_1m_tokens: row.completion_unit_price_cny_per_1m,
      prompt_amount_cny: row.prompt_amount_cny,
      completion_amount_cny: row.completion_amount_cny,
      list_amount_cny: row.list_amount_cny,
      discount_rate: row.discount_rate,
      discount_amount_cny: row.discount_amount_cny,
      billed_amount_cny: row.billed_amount_cny,
      recalculated_amount_cny: row.recalculated_amount_cny,
      rounding_delta_cny: row.rounding_delta_cny,
      pricing_note: row.pricing_note,
    }));

    const csv = "\uFEFF" + usageRowsToCsv(rows);
    const filename = `nexusflow-admin-user-${userId}-billing-${exportData.startDate.slice(0, 10)}-to-${exportData.endDate.slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.post("/users/:id/balance-adjust", requirePermission("billing.manage"), async (req: Request, res: Response) => {
  const authorized = req as AdminAuthorizedRequest;
  try {
    const result = await applyAdminAdjustment({
      kind: "balance",
      userId: String(req.params.id),
      amountDelta: Number(req.body?.amountDelta ?? req.body?.amount_delta),
      reason: String(req.body?.reason || req.body?.description || ""),
      idempotencyKey: typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : "",
      actorUserId: authorized.admin!.id,
      actorRole: authorized.adminAccess!.role,
      actorEmail: authorized.admin!.email,
      requestId: getAdminRequestId(req, res),
      ipAddress: getAdminClientIp(req),
      userAgent: req.headers["user-agent"] || null,
    });
    setAdminAuditContext(req, { skipAutomatic: true });
    res.json({
      success: true,
      data: { ...result.transaction, replayed: result.replayed },
      message: result.replayed ? "已返回原调账结果" : "余额已调整",
    });
  } catch (error) {
    if (error instanceof AdminAdjustmentError) {
      res.status(error.status).json({ success: false, message: error.message, code: error.code });
      return;
    }
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.post("/users/:id/credit-adjust", requirePermission("billing.manage"), async (req: Request, res: Response) => {
  const authorized = req as AdminAuthorizedRequest;
  try {
    const result = await applyAdminAdjustment({
      kind: "credit",
      userId: String(req.params.id),
      amountDelta: Number(req.body?.amountDelta ?? req.body?.amount_delta),
      reason: String(req.body?.reason || req.body?.description || ""),
      idempotencyKey: typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : "",
      actorUserId: authorized.admin!.id,
      actorRole: authorized.adminAccess!.role,
      actorEmail: authorized.admin!.email,
      requestId: getAdminRequestId(req, res),
      ipAddress: getAdminClientIp(req),
      userAgent: req.headers["user-agent"] || null,
    });
    setAdminAuditContext(req, { skipAutomatic: true });
    res.json({
      success: true,
      data: { ...result.transaction, replayed: result.replayed },
      message: result.replayed ? "已返回原调账结果" : "信控已调整",
    });
  } catch (error) {
    if (error instanceof AdminAdjustmentError) {
      res.status(error.status).json({ success: false, message: error.message, code: error.code });
      return;
    }
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

// ========== 账单（全局总览 + 单用户下钻，只读） ==========

router.get("/billing/overview", async (_req: Request, res: Response) => {
  try {
    const users = await getAllUsers();
    const rows = await Promise.all(
      users.map(async (user) => {
        const summary = await getBillingSummary(user.id);
        const isSub = !!user.parent_user_id;
        return {
          id: user.id,
          nickname: user.nickname,
          email: user.email,
          username: user.username,
          accountType: isSub ? "sub" : "main",
          status: user.status || "active",
          balance: summary.balance,
          creditBalance: summary.creditBalance,
          availableBalance: summary.availableBalance,
          totalRecharge: summary.totalRecharge,
          totalConsumption: summary.totalConsumption,
          totalCalls: summary.totalCalls,
        };
      })
    );

    const totals = rows.reduce(
      (acc, r) => {
        acc.balance += r.balance;
        acc.creditBalance += r.creditBalance;
        acc.availableBalance += r.availableBalance;
        acc.totalRecharge += r.totalRecharge;
        acc.totalConsumption += r.totalConsumption;
        acc.totalCalls += r.totalCalls;
        return acc;
      },
      { balance: 0, creditBalance: 0, availableBalance: 0, totalRecharge: 0, totalConsumption: 0, totalCalls: 0 }
    );

    res.json({
      success: true,
      data: {
        totals: {
          balance: Math.round(totals.balance * 1_000_000) / 1_000_000,
          creditBalance: Math.round(totals.creditBalance * 1_000_000) / 1_000_000,
          availableBalance: Math.round(totals.availableBalance * 1_000_000) / 1_000_000,
          totalRecharge: Math.round(totals.totalRecharge * 1_000_000) / 1_000_000,
          totalConsumption: Math.round(totals.totalConsumption * 1_000_000) / 1_000_000,
          totalCalls: totals.totalCalls,
          userCount: rows.length,
        },
        users: rows,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

router.get("/billing/users/:id", async (req: Request, res: Response) => {
  const userId = String(req.params.id);
  const user = await getUserById(userId);
  if (!user) {
    res.status(404).json({ success: false, message: "用户不存在" });
    return;
  }

  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const now = new Date();
    const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startDate =
      typeof req.query.startDate === "string" && !Number.isNaN(new Date(req.query.startDate).getTime())
        ? new Date(req.query.startDate)
        : defaultStart;
    const endDate =
      typeof req.query.endDate === "string" && !Number.isNaN(new Date(req.query.endDate).getTime())
        ? new Date(new Date(req.query.endDate).setHours(23, 59, 59, 999))
        : now;

    const [summary, transactions] = await Promise.all([
      getBillingSummary(userId),
      getTransactions(userId, limit, offset),
    ]);
    const subBreakdown = user.parent_user_id ? [] : await getSubAccountBreakdown(userId, startDate, endDate);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          nickname: user.nickname,
          email: user.email,
          username: user.username,
          accountType: user.parent_user_id ? "sub" : "main",
          status: user.status || "active",
        },
        summary,
        transactions,
        subBreakdown,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

// ========== 日志查询端点（Admin 全局可见） ==========

router.get("/logs/search", async (req: Request, res: Response) => {
  try {
    const { log_id, model, user_id, from, to } = req.query;
    const maxLimit = Math.min(Number(req.query.limit) || 50, 200);

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (log_id) { conditions.push(`ul.log_id = $${idx++}`); params.push(log_id); }
    if (model) { conditions.push(`ul.model = $${idx++}`); params.push(model); }
    if (user_id) { conditions.push(`ul.user_id = $${idx++}`); params.push(user_id); }
    if (from) { conditions.push(`ul.created_at >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`ul.created_at <= $${idx++}`); params.push(to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.queryMany(
      `SELECT ul.log_id, ul.user_id, ul.model, ul.status,
              ul.prompt_tokens, ul.completion_tokens, ul.total_tokens,
              ROUND(ul.cost::numeric, 6)::float as cost, ul.latency_ms,
              COALESCE(ul.cached_tokens, 0)::int as cached_tokens,
              COALESCE(ul.cache_creation_tokens, 0)::int as cache_creation_tokens,
              u.email as user_email, u.nickname as user_nickname,
              to_char(ul.created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as time
       FROM usage_logs ul
       LEFT JOIN users u ON ul.user_id = u.id
       ${where}
       ORDER BY ul.created_at DESC
       LIMIT $${idx}`,
      [...params, maxLimit]
    );
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: sanitizeError(err) });
  }
});

router.get("/logs/:logId/detail", async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;

    // Admin 可查任意日志，不检查 user_id
    const row = await db.queryOne<{ user_id: string; created_at: string; user_email: string; user_nickname: string }>(
      `SELECT ul.user_id, ul.created_at, u.email as user_email, u.nickname as user_nickname
       FROM usage_logs ul
       LEFT JOIN users u ON ul.user_id = u.id
       WHERE ul.log_id = $1`,
      [logId]
    );
    if (!row) {
      res.json({ success: false, message: "日志不存在" });
      return;
    }

    const slsClient = getSlsClient();
    if (!slsClient) {
      res.json({ success: false, message: "SLS 未配置" });
      return;
    }

    const created = new Date(row.created_at);
    const from = new Date(created.getTime() - 60000);
    const to = new Date(created.getTime() + 120000);

    const logs = await slsClient.getLogs("nexusflow", "nexusflow", from, to,
      { query: `"${logId}"`, line: 1 },
      { readTimeout: 10000, connectTimeout: 5000 }
    );
    const entry = Array.isArray(logs) && logs.length > 0 ? logs[0] : null;

    res.json({
      success: true,
      data: entry ? {
        request: entry.request || null,
        response: entry.response || null,
        user_email: row.user_email,
        user_nickname: row.user_nickname,
      } : null,
      user: { email: row.user_email, nickname: row.user_nickname },
      note: entry ? undefined : "日志可能仍在索引中（SLS 延迟 1-2 分钟），请稍后重试",
    });
  } catch (err: any) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

// ========== 模型目录管理（叠加在静态目录之上，空表=零差异） ==========

// GET /api/admin/models — 有效目录 + 覆盖行 + 静态 id 集合
router.get("/models", async (_req: Request, res: Response) => {
  try {
    await refreshModels(); // always reflect current DB truth regardless of which instance serves
    const overrides = await listOverrides();
    const overrideMap = new Map(overrides.map((o) => [o.id, o]));
    const staticIds = new Set(getStaticModels().map((m) => m.id));
    const effective = models.map((m) => {
      const ov = overrideMap.get(m.id);
      const source = ov
        ? (ov.action === "upsert" ? (staticIds.has(m.id) ? "overridden" : "added") : "static")
        : "static";
      return { ...m, _source: source };
    });
    res.json({
      success: true,
      data: {
        models: effective,
        overrides,
        staticCount: staticIds.size,
        disabledIds: overrides.filter((o) => o.action === "disable" && o.enabled).map((o) => o.id),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: sanitizeError(err) });
  }
});

// POST /api/admin/models — 新增或覆盖一个模型（全量 doc，严格校验）
router.post("/models", requirePermission("catalog.manage"), async (req: Request, res: Response) => {
  const session = (req as any).admin;
  const result = sanitizeModelDoc(req.body);
  if (!result.ok) {
    res.status(400).json({ success: false, message: result.error });
    return;
  }
  try {
    await upsertOverride(result.model, session?.id || null);
    await refreshModels();
    res.json({ success: true, data: result.model, message: "模型已保存并生效" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: sanitizeError(err) });
  }
});

// POST /api/admin/models/:id/disable — 从目录中隐藏某个模型
router.post("/models/:id/disable", requirePermission("catalog.manage"), async (req: Request, res: Response) => {
  const session = (req as any).admin;
  const id = String(req.params.id);
  try {
    await disableStaticModel(id, session?.id || null);
    await refreshModels();
    res.json({ success: true, message: `模型 ${id} 已下架` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: sanitizeError(err) });
  }
});

// DELETE /api/admin/models/:id — 删除覆盖行（恢复静态默认；新增的模型则被移除）
router.delete("/models/:id", requirePermission("catalog.manage"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const removed = await deleteOverride(id);
    await refreshModels();
    res.json({ success: true, message: removed ? `已移除覆盖：${id}（恢复默认）` : `无覆盖可移除：${id}` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: sanitizeError(err) });
  }
});

export default router;
