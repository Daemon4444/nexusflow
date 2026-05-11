import { Router, Request, Response } from "express";
import { requireAdmin } from "../middleware/admin";
import { getAdminUserLimitSummaries } from "../data/ratelimits";
import { adminAdjustBalance, getBillingUsageExport, getTransactions } from "../data/billing";
import { getByModel, getRecent, getUsageSummary } from "../data/usage";
import { listUserModelDiscounts } from "../data/user-discounts";
import { getUserById } from "../data/users";

const router = Router();

router.use(requireAdmin);

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

  const [usage, byModel, recent, transactions, discounts] = await Promise.all([
    getUsageSummary(userId),
    getByModel(userId),
    getRecent(userId),
    getTransactions(userId, 20, 0),
    listUserModelDiscounts(userId),
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
    const message = error instanceof Error ? error.message : "账单导出失败";
    res.status(400).json({ success: false, message });
  }
});

router.post("/users/:id/balance-adjust", async (req: Request, res: Response) => {
  const session = (req as any).admin;

  const amountDelta = Number(req.body?.amountDelta ?? req.body?.amount_delta);
  const description = String(req.body?.description || "").trim();
  if (!Number.isFinite(amountDelta) || amountDelta === 0) {
    res.status(400).json({ success: false, message: "amountDelta 必须是非 0 数字" });
    return;
  }
  if (Math.abs(amountDelta) > 100000) {
    res.status(400).json({ success: false, message: "单次调账金额不能超过 100000 元" });
    return;
  }

  const tx = await adminAdjustBalance({
    userId: String(req.params.id),
    amountDelta,
    description,
    actorId: session?.id || null,
  });
  if (!tx) {
    res.status(400).json({ success: false, message: "调账失败，请确认用户存在且扣减后余额不为负" });
    return;
  }
  res.json({ success: true, data: tx, message: "余额已调整" });
});

export default router;
