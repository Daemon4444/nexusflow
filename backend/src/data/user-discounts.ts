import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { AIModel, calculateTokenCost } from "./models";

export interface UserModelDiscount {
  id: string;
  user_id: string;
  model_id: string;
  discount_rate: number;
  is_enabled: boolean;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscountedAmount {
  listAmount: number;
  discountRate: number;
  discountAmount: number;
  finalAmount: number;
}

function money(value: number): number {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function normalizeRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, Math.round(value * 1_000_000) / 1_000_000));
}

function normalizeDiscount(row: UserModelDiscount): UserModelDiscount {
  return {
    ...row,
    discount_rate: Number(row.discount_rate ?? 1),
    is_enabled: Boolean(row.is_enabled),
  };
}

export async function getUserModelDiscount(userId: string | null | undefined, modelId: string): Promise<UserModelDiscount | null> {
  if (!userId || !modelId) return null;

  // 1. Exact match (highest priority)
  const exact = await db.queryOne<UserModelDiscount>(
    `SELECT * FROM user_model_discounts
     WHERE user_id = ? AND is_enabled = TRUE
       AND (model_id = ? OR model_id = '*' OR (model_id LIKE '%*' AND ? LIKE REPLACE(model_id, '*', '%')))
     ORDER BY
       CASE WHEN model_id = ? THEN 0
            WHEN model_id != '*' THEN 1
            ELSE 2 END,
       LENGTH(model_id) DESC
     LIMIT 1`,
    [userId, modelId, modelId, modelId]
  );
  if (exact) return normalizeDiscount(exact);

  // 2. Prefix wildcard match (longest prefix wins)
  const wildcards = await db.queryMany<UserModelDiscount>(
    `SELECT * FROM user_model_discounts
     WHERE user_id = ? AND model_id LIKE '%*' AND model_id != '*' AND is_enabled = TRUE`,
    [userId]
  );
  if (wildcards.length > 0) {
    const matched = wildcards
      .filter((r) => modelId.startsWith(r.model_id.slice(0, -1)))
      .sort((a, b) => b.model_id.length - a.model_id.length);
    if (matched.length > 0) return normalizeDiscount(matched[0]);
  }

  // 3. Global wildcard '*' (lowest priority)
  const global = await db.queryOne<UserModelDiscount>(
    `SELECT * FROM user_model_discounts
     WHERE user_id = ? AND model_id = '*' AND is_enabled = TRUE`,
    [userId]
  );
  return global ? normalizeDiscount(global) : null;
}

export async function listUserModelDiscounts(userId?: string): Promise<UserModelDiscount[]> {
  const rows = await db.queryMany<UserModelDiscount>(
    `SELECT * FROM user_model_discounts
     ${userId ? "WHERE user_id = ?" : ""}
     ORDER BY updated_at DESC, created_at DESC`,
    userId ? [userId] : []
  );
  return rows.map(normalizeDiscount);
}

export async function upsertUserModelDiscount(params: {
  userId: string;
  modelId: string;
  discountRate: number;
  enabled?: boolean;
  notes?: string;
  createdBy?: string | null;
}): Promise<UserModelDiscount> {
  const now = new Date().toISOString();
  const rate = normalizeRate(params.discountRate);
  const row = await db.queryOne<UserModelDiscount>(
    `INSERT INTO user_model_discounts (
       id, user_id, model_id, discount_rate, is_enabled, notes, created_by, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, model_id)
     DO UPDATE SET
       discount_rate = excluded.discount_rate,
       is_enabled = excluded.is_enabled,
       notes = excluded.notes,
       created_by = excluded.created_by,
       updated_at = excluded.updated_at
     RETURNING *`,
    [
      uuidv4(),
      params.userId,
      params.modelId,
      rate,
      params.enabled ?? true,
      params.notes || "",
      params.createdBy || null,
      now,
      now,
    ]
  );
  return normalizeDiscount(row!);
}

export async function deleteUserModelDiscount(id: string): Promise<boolean> {
  return (await db.execute("DELETE FROM user_model_discounts WHERE id = ?", [id])) > 0;
}

export async function applyUserModelDiscount(userId: string | null | undefined, modelId: string, listAmount: number): Promise<DiscountedAmount> {
  const amount = money(Math.max(0, listAmount || 0));
  const discount = await getUserModelDiscount(userId, modelId);
  const rate = normalizeRate(discount?.discount_rate ?? 1);
  const finalAmount = money(amount * rate);
  return {
    listAmount: amount,
    discountRate: rate,
    discountAmount: money(amount - finalAmount),
    finalAmount,
  };
}

export async function calculateDiscountedTokenCost(
  userId: string | null | undefined,
  model: AIModel,
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number = 0,
  cacheCreationTokens: number = 0
): Promise<DiscountedAmount> {
  return applyUserModelDiscount(userId, model.id, calculateTokenCost(model, promptTokens, completionTokens, cachedTokens, cacheCreationTokens));
}
