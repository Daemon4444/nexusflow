import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { getUserById } from "./users";
import { AIModel, calculateTokenCost, getTokenPricingTier, models } from "./models";

export interface Transaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  ref_id: string | null;
  created_at: string;
  discount_rate: number | null;
  discount_amount_cny: number | null;
}

export interface BillingUsageExportRow {
  usage_id: number;
  api_key_id: string | null;
  api_key_name: string | null;
  model: string;
  model_name: string;
  provider: string;
  pricing_type: "token" | "per-image" | "per-second";
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  cache_creation_tokens: number;
  status: string;
  created_at: string;
  tier_label: string;
  tier_max_tokens: number | null;
  prompt_unit_price_cny_per_1m: number;
  completion_unit_price_cny_per_1m: number;
  prompt_amount_cny: number;
  completion_amount_cny: number;
  list_amount_cny: number;
  discount_rate: number;
  discount_amount_cny: number;
  billed_amount_cny: number;
  recalculated_amount_cny: number;
  rounding_delta_cny: number;
  pricing_note: string;
}

function roundBalance(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeExportDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function endOfDay(value: Date): Date {
  const copy = new Date(value);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function money6(value: number): number {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function getModelBillingBreakdown(
  model: AIModel | undefined,
  promptTokens: number,
  completionTokens: number,
  billedAmount: number,
  cachedTokens: number = 0,
  cacheCreationTokens: number = 0
) {
  const prompt = Math.max(0, Number(promptTokens || 0));
  const completion = Math.max(0, Number(completionTokens || 0));
  const cached = Math.max(0, Number(cachedTokens || 0));
  const cacheCreation = Math.max(0, Number(cacheCreationTokens || 0));
  const tier = model ? getTokenPricingTier(model, prompt) : null;
  const promptUnit = tier?.promptPrice ?? model?.promptPrice ?? 0;
  const completionUnit = tier?.completionPrice ?? model?.completionPrice ?? 0;
  const recalculatedAmount = model ? calculateTokenCost(model, prompt, completion, cached, cacheCreation) : Number(billedAmount || 0);
  const promptAmount = (prompt / 1_000_000) * promptUnit;
  const completionAmount = (completion / 1_000_000) * completionUnit;
  const hasCache = cached > 0 || cacheCreation > 0;

  return {
    pricingType: model?.pricingType || "token" as const,
    tierLabel: tier?.label || "standard",
    tierMaxTokens: tier?.maxTokens ?? null,
    promptUnit,
    completionUnit,
    promptAmount: money6(promptAmount),
    completionAmount: money6(completionAmount),
    recalculatedAmount: hasCache ? money6(Number(billedAmount || 0)) : money6(recalculatedAmount),
    roundingDelta: hasCache ? 0 : money6(Number(billedAmount || 0) - recalculatedAmount),
    pricingNote: hasCache
      ? "Cache-aware billed amount preserved from usage log; cached token fields show cache savings separately"
      : tier
        ? "Input-length tier selected by prompt_tokens for this request"
        : model
          ? "Standard catalog price"
          : "Model not found in current catalog; billed amount preserved",
  };
}

export async function recharge(userId: string, amount: number, description?: string): Promise<Transaction | null> {
  if (amount <= 0) return null;
  const normalizedAmount = roundBalance(amount);
  const txId = uuidv4();
  const now = new Date().toISOString();
  const text = description || `充值 ¥${amount.toFixed(2)}`;

  return db.transaction(async (client) => {
    const user = await client.queryOne<{ balance: number }>("SELECT balance FROM users WHERE id = ? FOR UPDATE", [userId]);
    if (!user) return null;
    const newBalance = roundBalance(Number(user.balance || 0) + normalizedAmount);
    await client.execute("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?", [newBalance, now, userId]);
    const tx = await client.queryOne<Transaction>(
      `INSERT INTO transactions (id, user_id, type, amount, balance_after, description, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [txId, userId, "recharge", normalizedAmount, newBalance, text, null, now]
    );
    return tx!;
  });
}

export async function consume(
  userId: string,
  amount: number,
  description: string,
  refId?: string,
  discountRate?: number,
  discountAmountCny?: number
): Promise<Transaction | null> {
  if (amount <= 0) return null;
  const normalizedAmount = roundBalance(amount);
  const txId = uuidv4();
  const now = new Date().toISOString();
  const savedDiscountRate = discountRate !== undefined && discountRate < 1 ? discountRate : null;
  const savedDiscountAmount = discountAmountCny && discountAmountCny > 0 ? roundBalance(discountAmountCny) : null;

  return db.transaction(async (client) => {
    const user = await client.queryOne<{ balance: number }>("SELECT balance FROM users WHERE id = ? FOR UPDATE", [userId]);
    if (!user) return null;
    const currentBalance = Number(user.balance || 0);
    if (currentBalance < normalizedAmount) return null;
    const newBalance = roundBalance(currentBalance - normalizedAmount);
    await client.execute("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?", [newBalance, now, userId]);
    const tx = await client.queryOne<Transaction>(
      `INSERT INTO transactions (id, user_id, type, amount, balance_after, description, ref_id, created_at, discount_rate, discount_amount_cny)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [txId, userId, "consumption", normalizedAmount, newBalance, description, refId || null, now, savedDiscountRate, savedDiscountAmount]
    );
    return tx!;
  });
}

export async function adminAdjustBalance(params: {
  userId: string;
  amountDelta: number;
  description: string;
  actorId?: string | null;
}): Promise<Transaction | null> {
  if (!Number.isFinite(params.amountDelta) || params.amountDelta === 0) return null;
  const delta = roundBalance(params.amountDelta);
  const txId = uuidv4();
  const now = new Date().toISOString();
  const description = params.description.trim() || `管理员调账 ${delta > 0 ? "+" : ""}${delta.toFixed(6)}`;

  return db.transaction(async (client) => {
    const user = await client.queryOne<{ balance: number }>("SELECT balance FROM users WHERE id = ? FOR UPDATE", [params.userId]);
    if (!user) return null;
    const newBalance = roundBalance(Number(user.balance || 0) + delta);
    if (newBalance < 0) return null;
    await client.execute("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?", [newBalance, now, params.userId]);
    const tx = await client.queryOne<Transaction>(
      `INSERT INTO transactions (id, user_id, type, amount, balance_after, description, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        txId,
        params.userId,
        "admin_adjustment",
        delta,
        newBalance,
        description,
        params.actorId ? `admin:${params.actorId}` : "admin",
        now,
      ]
    );
    return tx!;
  });
}

export async function hasSufficientBalance(userId: string | null | undefined, estimatedAmount: number): Promise<boolean> {
  if (!userId) return false;
  const normalizedAmount = roundBalance(Math.max(0, estimatedAmount));
  if (normalizedAmount <= 0) return true;
  const user = await getUserById(userId);
  if (!user) return false;
  return Number(user.balance || 0) >= normalizedAmount;
}

export async function getTransactions(userId: string, limit = 20, offset = 0): Promise<{ rows: Transaction[]; total: number }> {
  const rows = await db.queryMany<Transaction>(
    "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [userId, limit, offset]
  );
  const count = await db.queryOne<{ cnt: string | number }>("SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?", [userId]);
  return { rows, total: Number(count?.cnt || 0) };
}

export async function getBillingSummary(userId: string) {
  const row = await db.queryOne<any>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END), 0) as "totalRecharge",
       COALESCE(SUM(CASE WHEN type = 'consumption' THEN amount ELSE 0 END), 0) as "totalConsumption",
       COUNT(CASE WHEN type = 'consumption' THEN 1 END)::int as "totalCalls"
     FROM transactions WHERE user_id = ?`,
    [userId]
  );
  const user = await getUserById(userId);
  return {
    balance: Number(user?.balance || 0),
    totalRecharge: roundBalance(Number(row?.totalRecharge || 0)),
    totalConsumption: roundBalance(Number(row?.totalConsumption || 0)),
    totalCalls: Number(row?.totalCalls || 0),
  };
}

export async function getMonthlyStats(userId: string) {
  return db.queryMany(
    `SELECT
       to_char(created_at, 'YYYY-MM') as month,
       COALESCE(SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END), 0)::float as recharge,
       COALESCE(SUM(CASE WHEN type = 'consumption' THEN amount ELSE 0 END), 0)::float as consumption
     FROM transactions
     WHERE user_id = ? AND created_at >= NOW() - INTERVAL '6 months'
     GROUP BY to_char(created_at, 'YYYY-MM')
     ORDER BY month`,
    [userId]
  );
}

export async function getBillingUsageExport(userId: string, params: { startDate?: string; endDate?: string } = {}): Promise<{
  rows: BillingUsageExportRow[];
  startDate: string;
  endDate: string;
}> {
  const now = new Date();
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const startDate = normalizeExportDate(params.startDate, defaultStart);
  const endDate = endOfDay(normalizeExportDate(params.endDate, now));
  if (startDate.getTime() > endDate.getTime()) {
    throw new Error("startDate must be earlier than or equal to endDate");
  }

  const rawRows = await db.queryMany<any>(
    `SELECT
       ul.id as usage_id,
       ul.api_key_id,
       ak.name as api_key_name,
       ul.model,
       ul.prompt_tokens,
       ul.completion_tokens,
       ul.total_tokens,
       COALESCE(ul.cached_tokens, 0) as cached_tokens,
       COALESCE(ul.cache_creation_tokens, 0) as cache_creation_tokens,
       ul.cost,
       ul.status,
       ul.created_at
     FROM usage_logs ul
     LEFT JOIN api_keys ak ON ak.id = ul.api_key_id
     WHERE ul.user_id = ?
       AND ul.created_at >= ?
       AND ul.created_at <= ?
     ORDER BY ul.created_at ASC, ul.id ASC`,
    [userId, startDate.toISOString(), endDate.toISOString()]
  );

  const modelById = new Map(models.map((model) => [model.id, model]));
  const rows = rawRows.map((row): BillingUsageExportRow => {
    const model = modelById.get(row.model);
    const billedAmount = money6(Number(row.cost || 0));
    const promptTokens = Number(row.prompt_tokens || 0);
    const completionTokens = Number(row.completion_tokens || 0);
    const cachedTokens = Number(row.cached_tokens || 0);
    const cacheCreationTokens = Number(row.cache_creation_tokens || 0);
    const breakdown = getModelBillingBreakdown(model, promptTokens, completionTokens, billedAmount, cachedTokens, cacheCreationTokens);
    return {
      usage_id: Number(row.usage_id),
      api_key_id: row.api_key_id || null,
      api_key_name: row.api_key_name || null,
      model: row.model,
      model_name: model?.name || row.model,
      provider: model?.provider || "",
      pricing_type: breakdown.pricingType,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: Number(row.total_tokens || 0),
      cached_tokens: cachedTokens,
      cache_creation_tokens: cacheCreationTokens,
      status: row.status,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      tier_label: breakdown.tierLabel,
      tier_max_tokens: breakdown.tierMaxTokens,
      prompt_unit_price_cny_per_1m: breakdown.promptUnit,
      completion_unit_price_cny_per_1m: breakdown.completionUnit,
      prompt_amount_cny: breakdown.promptAmount,
      completion_amount_cny: breakdown.completionAmount,
      list_amount_cny: breakdown.recalculatedAmount,
      discount_rate: breakdown.recalculatedAmount > 0 ? money6(billedAmount / breakdown.recalculatedAmount) : 1,
      discount_amount_cny: money6(Math.max(0, breakdown.recalculatedAmount - billedAmount)),
      billed_amount_cny: billedAmount,
      recalculated_amount_cny: breakdown.recalculatedAmount,
      rounding_delta_cny: breakdown.roundingDelta,
      pricing_note: breakdown.pricingNote,
    };
  });

  return { rows, startDate: startDate.toISOString(), endDate: endDate.toISOString() };
}
