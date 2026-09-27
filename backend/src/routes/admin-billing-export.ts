import { Request, Response } from "express";
import { getBillingUsageExport } from "../data/billing";
import { getUserById } from "../data/users";
import { sanitizeError } from "../utils/sanitize-error";

/**
 * Per-customer billing CSV (one row per usage record with the price
 * breakdown). Shared by the legacy admin router and the least-privilege
 * control-plane route (billing.read), so finance operators can export
 * without the broad legacy.admin permission.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const formulaSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

export function usageRowsToCsv(rows: Record<string, unknown>[]): string {
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

export async function sendAdminBillingExport(req: Request, res: Response): Promise<void> {
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
}
