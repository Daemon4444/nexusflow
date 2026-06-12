import { Router, Request, Response } from "express";
import { requireAdmin } from "../middleware/admin";
import { sanitizeError } from "../utils/sanitize-error";
import { getAdminUserLimitSummaries, getUserLimitsOverview } from "../data/ratelimits";
import { adminAdjustBalance, getBillingUsageExport, getTransactions } from "../data/billing";
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
import { getUserById } from "../data/users";
import { db } from "../db/client";
import { getSlsClient } from "../services/sls";

const router = Router();

router.use(requireAdmin);

// ========== Monitoring dashboard ==========

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
    res.status(404).json({ success: false, message: "User not found" });
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
      user,
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
    res.status(404).json({ success: false, message: "User not found" });
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

router.post("/users/:id/balance-adjust", async (req: Request, res: Response) => {
  const session = (req as any).admin;

  const amountDelta = Number(req.body?.amountDelta ?? req.body?.amount_delta);
  const description = String(req.body?.description || "").trim();
  if (!Number.isFinite(amountDelta) || amountDelta === 0) {
    res.status(400).json({ success: false, message: "amountDelta must be a non-zero number" });
    return;
  }
  if (Math.abs(amountDelta) > 100000) {
    res.status(400).json({ success: false, message: "A single adjustment cannot exceed $100000" });
    return;
  }

  const tx = await adminAdjustBalance({
    userId: String(req.params.id),
    amountDelta,
    description,
    actorId: session?.id || null,
  });
  if (!tx) {
    res.status(400).json({ success: false, message: "Adjustment failed. Please confirm the user exists and the resulting balance is not negative." });
    return;
  }
  res.json({ success: true, data: tx, message: "Balance adjusted" });
});

// ========== Log query endpoints (admin can see all) ==========

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

    // Admin can view any log; do not check user_id
    const row = await db.queryOne<{ user_id: string; created_at: string; user_email: string; user_nickname: string }>(
      `SELECT ul.user_id, ul.created_at, u.email as user_email, u.nickname as user_nickname
       FROM usage_logs ul
       LEFT JOIN users u ON ul.user_id = u.id
       WHERE ul.log_id = $1`,
      [logId]
    );
    if (!row) {
      res.json({ success: false, message: "Log not found" });
      return;
    }

    const slsClient = getSlsClient();
    if (!slsClient) {
      res.json({ success: false, message: "SLS is not configured" });
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
      note: entry ? undefined : "The log may still be indexing (SLS delay 1-2 minutes), please retry shortly",
    });
  } catch (err: any) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

export default router;
