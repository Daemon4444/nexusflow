import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { logToSLS } from "../services/sls";
import { getUserById } from "./users";
import { AIModel, calculateTokenCost, getTokenPricingTier, models } from "./models";

export interface Transaction {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  type: string;
  amount: number;
  balance_after: number;
  credit_amount: number;
  credit_after: number;
  description: string;
  ref_id: string | null;
  created_at: string;
  discount_rate: number | null;
  discount_amount_cny: number | null;
}

export interface BillingReservation {
  id: string;
  user_id: string;
  billing_owner_id: string;
  ref_id: string;
  reserved_amount: number;
  actual_amount: number | null;
  status: "active" | "settled" | "released";
  description: string | null;
  created_at: string;
  expires_at: string;
  settled_at: string | null;
}

export type BillingReservationFailureReason =
  | "invalid_request"
  | "account_not_found"
  | "account_inactive"
  | "sub_account_suspended"
  | "insufficient_balance"
  | "sub_account_quota_exceeded"
  | "duplicate_reservation";

export type BillingReservationResult =
  | { reservation: BillingReservation; reason: null }
  | { reservation: null; reason: BillingReservationFailureReason };

export interface BillingUsageExportRow {
  usage_id: number;
  account_id: string;
  account_name: string;
  api_key_id: string | null;
  api_key_name: string | null;
  model: string;
  model_name: string;
  provider: string;
  pricing_type: "token" | "per-image" | "per-second" | "per-10k-characters";
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

function allocateCharge(balance: number, creditBalance: number, amount: number) {
  const cashCharge = roundBalance(Math.min(Math.max(balance, 0), amount));
  const remaining = roundBalance(amount - cashCharge);
  const creditCharge = roundBalance(Math.min(Math.max(creditBalance, 0), remaining));
  const uncovered = roundBalance(remaining - creditCharge);
  return {
    cashCharge,
    creditCharge,
    // Preserve the legacy shortfall behavior after delivery: any estimate miss
    // is recorded as negative cash instead of silently dropping the charge.
    balanceAfter: roundBalance(balance - cashCharge - uncovered),
    creditAfter: roundBalance(creditBalance - creditCharge),
  };
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
  // 与下方展示用的 completionUnit 保持同一口径（非思考价）。
  // 不传 isThinking 会走预占语义取较大值，让思考定价模型的账单出现虚高的
  // list_amount_cny 与虚假折扣率；usage_logs 未存思维链 token，无法还原真实模式。
  const recalculatedAmount = model
    ? calculateTokenCost(model, prompt, completion, cached, cacheCreation, { isThinking: false })
    : Number(billedAmount || 0);
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

/** monthly 限额是否到了 lazy 重置时点（quota_reset_at 早于本月 1 号） */
function isMonthlyQuotaResetDue(quotaResetAt: string | Date | null): boolean {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  if (!quotaResetAt) return true;
  const resetAt = new Date(quotaResetAt);
  return Number.isNaN(resetAt.getTime()) || resetAt < monthStart;
}

export async function recharge(userId: string, amount: number, description?: string): Promise<Transaction | null> {
  if (amount <= 0) return null;
  const normalizedAmount = roundBalance(amount);
  const txId = uuidv4();
  const now = new Date().toISOString();
  const text = description || `充值 ¥${amount.toFixed(2)}`;

  return db.transaction(async (client) => {
    const user = await client.queryOne<{ balance: number; credit_balance: number; parent_user_id: string | null }>(
      "SELECT balance, credit_balance, parent_user_id FROM users WHERE id = ? FOR UPDATE",
      [userId]
    );
    if (!user) return null;
    if (user.parent_user_id) return null; // 子账号不可充值（钱只存在于主账号）
    const newBalance = roundBalance(Number(user.balance || 0) + normalizedAmount);
    await client.execute("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?", [newBalance, now, userId]);
    const tx = await client.queryOne<Transaction>(
      `INSERT INTO transactions (id, user_id, type, amount, balance_after, credit_amount, credit_after, description, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
       RETURNING *`,
      [txId, userId, "recharge", normalizedAmount, newBalance, Number(user.credit_balance || 0), text, null, now]
    );
    return tx!;
  });
}

type BillingActor = {
  id: string;
  parent_user_id: string | null;
  status: string;
  quota_limit: number | null;
  quota_used: number;
  quota_period: string | null;
  quota_reset_at: string | null;
};

/**
 * Atomically reserves estimated spend without changing the displayed balance.
 * All reservations for an owner are serialized by the owner's users row lock.
 */
export async function reserveBalanceWithReason(
  userId: string,
  estimatedAmount: number,
  refId: string,
  ttlSeconds = 20 * 60
): Promise<BillingReservationResult> {
  const normalizedAmount = roundBalance(Math.max(0, estimatedAmount));
  if (!userId || !refId || !Number.isFinite(normalizedAmount)) {
    return { reservation: null, reason: "invalid_request" };
  }
  const reservationId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(60, ttlSeconds) * 1000);

  return db.transaction(async (client) => {
    const actor = await client.queryOne<BillingActor>(
      `SELECT id, parent_user_id, status, quota_limit, quota_used, quota_period, quota_reset_at
         FROM users WHERE id = ?`,
      [userId]
    );
    if (!actor) return { reservation: null, reason: "account_not_found" } as const;
    if (actor.status !== "active") {
      return {
        reservation: null,
        reason: actor.parent_user_id ? "sub_account_suspended" : "account_inactive",
      } as const;
    }

    const billingOwnerId = actor.parent_user_id || actor.id;
    const owner = await client.queryOne<{ balance: number; credit_balance: number; status: string }>(
      "SELECT balance, credit_balance, status FROM users WHERE id = ? FOR UPDATE",
      [billingOwnerId]
    );
    if (!owner || owner.status !== "active") {
      return { reservation: null, reason: "account_inactive" } as const;
    }

    // Expired holds never consume money and can be released while the owner row
    // lock serializes this cleanup with all new reservations for that owner.
    await client.execute(
      `UPDATE billing_reservations
          SET status = 'released', settled_at = NOW(), description = COALESCE(description, 'expired')
        WHERE billing_owner_id = ? AND status = 'active' AND expires_at <= NOW()`,
      [billingOwnerId]
    );

    const held = await client.queryOne<{ amount: string | number }>(
      `SELECT COALESCE(SUM(reserved_amount), 0) AS amount
         FROM billing_reservations
        WHERE billing_owner_id = ? AND status = 'active'`,
      [billingOwnerId]
    );
    const available = roundBalance(Number(owner.balance || 0) + Number(owner.credit_balance || 0) - Number(held?.amount || 0));
    if (available < normalizedAmount) {
      return { reservation: null, reason: "insufficient_balance" } as const;
    }

    if (actor.parent_user_id) {
      const lockedActor = await client.queryOne<BillingActor>(
        `SELECT id, parent_user_id, status, quota_limit, quota_used, quota_period, quota_reset_at
           FROM users WHERE id = ? FOR UPDATE`,
        [userId]
      );
      if (!lockedActor || lockedActor.status !== "active") {
        return { reservation: null, reason: "sub_account_suspended" } as const;
      }

      let quotaUsed = Number(lockedActor.quota_used || 0);
      if (lockedActor.quota_period === "monthly" && isMonthlyQuotaResetDue(lockedActor.quota_reset_at)) {
        quotaUsed = 0;
        await client.execute(
          "UPDATE users SET quota_used = 0, quota_reset_at = ?, updated_at = ? WHERE id = ?",
          [now.toISOString(), now.toISOString(), userId]
        );
      }
      if (lockedActor.quota_limit != null) {
        const actorHeld = await client.queryOne<{ amount: string | number }>(
          `SELECT COALESCE(SUM(reserved_amount), 0) AS amount
             FROM billing_reservations
            WHERE user_id = ? AND status = 'active'`,
          [userId]
        );
        if (quotaUsed + Number(actorHeld?.amount || 0) + normalizedAmount > Number(lockedActor.quota_limit)) {
          return { reservation: null, reason: "sub_account_quota_exceeded" } as const;
        }
      }
    }

    const row = await client.queryOne<BillingReservation>(
      `INSERT INTO billing_reservations
        (id, user_id, billing_owner_id, ref_id, reserved_amount, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
       ON CONFLICT (ref_id) DO NOTHING
      RETURNING *`,
      [reservationId, userId, billingOwnerId, refId, normalizedAmount, now.toISOString(), expiresAt.toISOString()]
    );
    return row
      ? { reservation: row, reason: null } as const
      : { reservation: null, reason: "duplicate_reservation" } as const;
  });
}

/**
 * Backwards-compatible nullable reservation helper used by internal scripts.
 * HTTP routes should use reserveBalanceWithReason so quota and account failures
 * keep their distinct public error codes.
 */
export async function reserveBalance(
  userId: string,
  estimatedAmount: number,
  refId: string,
  ttlSeconds = 20 * 60
): Promise<BillingReservation | null> {
  return (await reserveBalanceWithReason(userId, estimatedAmount, refId, ttlSeconds)).reservation;
}

/**
 * Settles a hold exactly once. The actual amount is authoritative; an estimate
 * miss is recorded and charged, but normal requests cannot overspend through
 * concurrent stale pre-checks because their estimates are held up front.
 */
export async function settleReservation(
  reservationId: string,
  actualAmount: number,
  description: string,
  discountRate?: number,
  discountAmountCny?: number
): Promise<Transaction | null> {
  const normalizedAmount = roundBalance(Math.max(0, actualAmount));
  const now = new Date().toISOString();
  const transactionRef = `reservation:${reservationId}`;
  const savedDiscountRate = discountRate !== undefined && discountRate < 1 ? discountRate : null;
  const savedDiscountAmount = discountAmountCny && discountAmountCny > 0 ? roundBalance(discountAmountCny) : null;

  return db.transaction(async (client) => {
    // Discover the owner first, then follow the global owner -> reservation ->
    // actor lock order used by reserveBalance. This avoids a deadlock with
    // expired-hold cleanup, which runs while holding the owner lock.
    const reservationOwner = await client.queryOne<{ billing_owner_id: string }>(
      "SELECT billing_owner_id FROM billing_reservations WHERE id = ?",
      [reservationId]
    );
    if (!reservationOwner) return null;

    const owner = await client.queryOne<{ balance: number; credit_balance: number }>(
      "SELECT balance, credit_balance FROM users WHERE id = ? FOR UPDATE",
      [reservationOwner.billing_owner_id]
    );
    if (!owner) return null;

    const reservation = await client.queryOne<BillingReservation>(
      "SELECT * FROM billing_reservations WHERE id = ? FOR UPDATE",
      [reservationId]
    );
    if (!reservation) return null;
    if (reservation.status === "settled") {
      return client.queryOne<Transaction>(
        "SELECT * FROM transactions WHERE ref_id = ? AND type = 'consumption'",
        [transactionRef]
      );
    }
    if (reservation.status !== "active") return null;

    if (normalizedAmount <= 0) {
      await client.execute(
        "UPDATE billing_reservations SET status = 'released', actual_amount = 0, description = ?, settled_at = ? WHERE id = ?",
        [description, now, reservationId]
      );
      return null;
    }

    const actor = await client.queryOne<BillingActor>(
      `SELECT id, parent_user_id, status, quota_limit, quota_used, quota_period, quota_reset_at
         FROM users WHERE id = ? FOR UPDATE`,
      [reservation.user_id]
    );
    if (!actor) return null;

    const currentBalance = Number(owner.balance || 0);
    const currentCredit = Number(owner.credit_balance || 0);
    if (normalizedAmount > Number(reservation.reserved_amount || 0) || currentBalance + currentCredit < normalizedAmount) {
      logToSLS({
        event: "billing_reservation_estimate_miss",
        reservationId,
        userId: reservation.user_id,
        billingOwnerId: reservation.billing_owner_id,
        reservedAmount: reservation.reserved_amount,
        actualAmount: normalizedAmount,
        balance: currentBalance,
        creditBalance: currentCredit,
      });
    }

    if (actor.parent_user_id) {
      if (actor.quota_period === "monthly" && isMonthlyQuotaResetDue(actor.quota_reset_at)) {
        await client.execute(
          "UPDATE users SET quota_used = 0, quota_reset_at = ?, updated_at = ? WHERE id = ?",
          [now, now, actor.id]
        );
      }
      // Delivery already happened. Record the actual spend even if it exceeds a
      // stale quota estimate; the next reservation will be rejected.
      await client.execute(
        "UPDATE users SET quota_used = quota_used + ?, updated_at = ? WHERE id = ?",
        [normalizedAmount, now, actor.id]
      );
    }

    const allocation = allocateCharge(currentBalance, currentCredit, normalizedAmount);
    await client.execute(
      "UPDATE users SET balance = ?, credit_balance = ?, updated_at = ? WHERE id = ?",
      [allocation.balanceAfter, allocation.creditAfter, now, reservation.billing_owner_id]
    );

    const txId = uuidv4();
    const tx = await client.queryOne<Transaction>(
      `INSERT INTO transactions
        (id, user_id, actor_user_id, type, amount, balance_after, credit_amount, credit_after, description, ref_id, created_at, discount_rate, discount_amount_cny)
       VALUES (?, ?, ?, 'consumption', ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        txId,
        reservation.billing_owner_id,
        reservation.user_id,
        normalizedAmount,
        allocation.balanceAfter,
        allocation.creditCharge,
        allocation.creditAfter,
        description,
        transactionRef,
        now,
        savedDiscountRate,
        savedDiscountAmount,
      ]
    );
    if (!tx) {
      throw new Error(`Duplicate billing settlement for reservation ${reservationId}`);
    }

    await client.execute(
      `UPDATE billing_reservations
          SET status = 'settled', actual_amount = ?, description = ?, settled_at = ?
        WHERE id = ?`,
      [normalizedAmount, description, now, reservationId]
    );
    return tx;
  });
}

export async function releaseReservation(reservationId: string, reason = "request_failed"): Promise<boolean> {
  if (!reservationId) return false;
  const changed = await db.execute(
    `UPDATE billing_reservations
        SET status = 'released', description = COALESCE(description, ?), settled_at = NOW()
      WHERE id = ? AND status = 'active'`,
    [reason, reservationId]
  );
  return changed > 0;
}

export async function getBillingReservation(reservationId: string): Promise<BillingReservation | null> {
  if (!reservationId) return null;
  return db.queryOne<BillingReservation>(
    "SELECT * FROM billing_reservations WHERE id = ?",
    [reservationId]
  );
}

/**
 * 扣费（唯一入口，docs/sub-accounts-spec.md §3.2）。
 * userId 是实际发起消费的账号（actor）；若为子账号，钱从主账号余额扣，
 * 同事务内对子账号 quota 做原子条件更新（超限/停用则整体回滚）。
 * 锁序固定：先主账号行 FOR UPDATE，再子账号条件 UPDATE，全局一致无死锁。
 */
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
    const actor = await client.queryOne<{
      id: string;
      parent_user_id: string | null;
      status: string;
      quota_limit: number | null;
      quota_period: string | null;
      quota_reset_at: string | null;
    }>(
      "SELECT id, parent_user_id, status, quota_limit, quota_period, quota_reset_at FROM users WHERE id = ?",
      [userId]
    );
    if (!actor) return null;
    const isSubAccount = !!actor.parent_user_id;
    const billingOwnerId = actor.parent_user_id || userId;

    // 锁计费主体（主账号）行
    const owner = await client.queryOne<{ balance: number; credit_balance: number }>(
      "SELECT balance, credit_balance FROM users WHERE id = ? FOR UPDATE",
      [billingOwnerId]
    );
    if (!owner) return null;
    const currentBalance = Number(owner.balance || 0);
    const currentCredit = Number(owner.credit_balance || 0);
    if (currentBalance + currentCredit < normalizedAmount) {
      // Legacy callers may still settle after delivery without a reservation.
      // Charge and alert rather than silently making the platform pay.
      console.error(`[billing] legacy consume shortfall: user=${userId} owner=${billingOwnerId} amount=${normalizedAmount} balance=${currentBalance} credit=${currentCredit} desc="${description}"`);
      logToSLS({ event: "consume_shortfall", userId, billingOwnerId, amount: normalizedAmount, balance: currentBalance, creditBalance: currentCredit, description, refId });
    }

    // 子账号：状态 + 限额（原子条件更新，0 行 = 停用或超限）
    if (isSubAccount) {
      if ((actor.status || "active") !== "active") return null;
      if (actor.quota_period === "monthly" && isMonthlyQuotaResetDue(actor.quota_reset_at)) {
        await client.execute("UPDATE users SET quota_used = 0, quota_reset_at = ? WHERE id = ?", [now, userId]);
      }
      const quotaOk = await client.execute(
        `UPDATE users SET quota_used = quota_used + ?, updated_at = ?
          WHERE id = ? AND status = 'active'
            AND (quota_limit IS NULL OR quota_used + ? <= quota_limit)`,
        [normalizedAmount, now, userId, normalizedAmount]
      );
      if (!quotaOk) return null;
    }

    const allocation = allocateCharge(currentBalance, currentCredit, normalizedAmount);
    await client.execute("UPDATE users SET balance = ?, credit_balance = ?, updated_at = ? WHERE id = ?", [allocation.balanceAfter, allocation.creditAfter, now, billingOwnerId]);
    const tx = await client.queryOne<Transaction>(
      `INSERT INTO transactions (id, user_id, actor_user_id, type, amount, balance_after, credit_amount, credit_after, description, ref_id, created_at, discount_rate, discount_amount_cny)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [txId, billingOwnerId, userId, "consumption", normalizedAmount, allocation.balanceAfter, allocation.creditCharge, allocation.creditAfter, description, refId || null, now, savedDiscountRate, savedDiscountAmount]
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
    const user = await client.queryOne<{ balance: number; credit_balance: number; parent_user_id: string | null }>(
      "SELECT balance, credit_balance, parent_user_id FROM users WHERE id = ? FOR UPDATE",
      [params.userId]
    );
    if (!user) return null;
    if (user.parent_user_id) return null; // 子账号无余额，调账只对主账号
    const newBalance = roundBalance(Number(user.balance || 0) + delta);
    if (newBalance < 0) return null;
    await client.execute("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?", [newBalance, now, params.userId]);
    const tx = await client.queryOne<Transaction>(
      `INSERT INTO transactions (id, user_id, type, amount, balance_after, credit_amount, credit_after, description, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
       RETURNING *`,
      [
        txId,
        params.userId,
        "admin_adjustment",
        delta,
        newBalance,
        Number(user.credit_balance || 0),
        description,
        params.actorId ? `admin:${params.actorId}` : "admin",
        now,
      ]
    );
    return tx!;
  });
}

export async function adminAdjustCredit(params: {
  userId: string;
  amountDelta: number;
  description: string;
  actorId?: string | null;
}): Promise<Transaction | null> {
  if (!Number.isFinite(params.amountDelta) || params.amountDelta === 0) return null;
  const delta = roundBalance(params.amountDelta);
  const txId = uuidv4();
  const now = new Date().toISOString();
  const description = params.description.trim() || `管理员调整信控 ${delta > 0 ? "+" : ""}${delta.toFixed(6)}`;

  return db.transaction(async (client) => {
    const user = await client.queryOne<{ balance: number; credit_balance: number; parent_user_id: string | null }>(
      "SELECT balance, credit_balance, parent_user_id FROM users WHERE id = ? FOR UPDATE",
      [params.userId]
    );
    if (!user || user.parent_user_id) return null;
    const newCredit = roundBalance(Number(user.credit_balance || 0) + delta);
    if (newCredit < 0) return null;
    await client.execute("UPDATE users SET credit_balance = ?, updated_at = ? WHERE id = ?", [newCredit, now, params.userId]);
    return client.queryOne<Transaction>(
      `INSERT INTO transactions (id, user_id, type, amount, balance_after, credit_amount, credit_after, description, ref_id, created_at)
       VALUES (?, ?, 'credit_adjustment', ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        txId,
        params.userId,
        delta,
        Number(user.balance || 0),
        delta,
        newCredit,
        description,
        params.actorId ? `admin:${params.actorId}` : "admin",
        now,
      ]
    );
  });
}

export async function hasSufficientBalance(userId: string | null | undefined, estimatedAmount: number): Promise<boolean> {
  if (!userId) return false;
  const normalizedAmount = roundBalance(Math.max(0, estimatedAmount));
  const user = await getUserById(userId);
  if (!user) return false;
  if (user.status !== "active") return false;

  let available = Number(user.balance || 0) + Number(user.credit_balance || 0);
  if (user.parent_user_id) {
    // 子账号：看主账号余额 + 自身限额余量（预检；最终由 consume 事务内强校验）
    const owner = await getUserById(user.parent_user_id);
    if (!owner || owner.status !== "active") return false;
    available = Number(owner.balance || 0) + Number(owner.credit_balance || 0);
    if (user.quota_limit != null) {
      const used = user.quota_period === "monthly" && isMonthlyQuotaResetDue(user.quota_reset_at) ? 0 : user.quota_used;
      if (used + normalizedAmount > user.quota_limit) return false;
    }
  }
  if (normalizedAmount <= 0) return true;
  return available >= normalizedAmount;
}

export async function getTransactions(
  userId: string,
  limit = 20,
  offset = 0
): Promise<{ rows: (Transaction & { actor_username: string | null; actor_nickname: string | null })[]; total: number }> {
  const rows = await db.queryMany<Transaction & { actor_username: string | null; actor_nickname: string | null }>(
    `SELECT t.*, a.username as actor_username, a.nickname as actor_nickname
       FROM transactions t
       LEFT JOIN users a ON a.id = t.actor_user_id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
  const count = await db.queryOne<{ cnt: string | number }>("SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?", [userId]);
  return { rows, total: Number(count?.cnt || 0) };
}

export interface SubAccountBreakdownRow {
  account_id: string;
  username: string | null;
  nickname: string;
  is_owner: boolean;
  amount_cny: number;
  call_count: number;
  total_tokens: number;
  quota_limit: number | null;
  quota_used: number;
  quota_period: string | null;
  status: string;
}

/** 分账报表（spec §4.2）：金额以 transactions 为准，调用/token 以 usage_logs 为准 */
export async function getSubAccountBreakdown(
  ownerId: string,
  startDate: Date,
  endDate: Date
): Promise<SubAccountBreakdownRow[]> {
  // 家庭成员：主账号 + 全部子账号（含已删，历史要能看）
  const members = await db.queryMany<any>(
    `SELECT id, username, nickname, parent_user_id, status, quota_limit, quota_used, quota_period
       FROM users WHERE id = ? OR parent_user_id = ?`,
    [ownerId, ownerId]
  );
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  // 金额：钱都记在主账号 transactions，按 actor 分组（历史数据 actor 为 NULL = 主账号自己）
  const amounts = await db.queryMany<{ actor: string | null; amount: string | number }>(
    `SELECT COALESCE(actor_user_id, user_id) as actor, COALESCE(SUM(amount), 0) as amount
       FROM transactions
      WHERE user_id = ? AND type = 'consumption' AND created_at >= ? AND created_at <= ?
      GROUP BY COALESCE(actor_user_id, user_id)`,
    [ownerId, start, end]
  );
  const amountByActor = new Map(amounts.map((r) => [r.actor, roundBalance(Number(r.amount || 0))]));

  // 用量：usage_logs.user_id 即调用者
  const usages = await db.queryMany<{ uid: string; calls: string | number; tokens: string | number }>(
    `SELECT ul.user_id as uid, COUNT(*) as calls, COALESCE(SUM(ul.total_tokens), 0) as tokens
       FROM usage_logs ul
       JOIN users u ON u.id = ul.user_id
      WHERE (u.id = ? OR u.parent_user_id = ?) AND ul.created_at >= ? AND ul.created_at <= ?
      GROUP BY ul.user_id`,
    [ownerId, ownerId, start, end]
  );
  const usageByUser = new Map(usages.map((r) => [r.uid, { calls: Number(r.calls || 0), tokens: Number(r.tokens || 0) }]));

  return members
    .map((m): SubAccountBreakdownRow => ({
      account_id: m.id,
      username: m.username || null,
      nickname: m.nickname,
      is_owner: !m.parent_user_id,
      amount_cny: amountByActor.get(m.id) || 0,
      call_count: usageByUser.get(m.id)?.calls || 0,
      total_tokens: usageByUser.get(m.id)?.tokens || 0,
      quota_limit: m.parent_user_id && m.quota_limit != null ? Number(m.quota_limit) : null,
      quota_used: m.parent_user_id ? Number(m.quota_used || 0) : 0,
      quota_period: m.parent_user_id ? m.quota_period || null : null,
      status: m.status || "active",
    }))
    .sort((a, b) => (a.is_owner ? -1 : b.is_owner ? 1 : b.amount_cny - a.amount_cny));
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
    creditBalance: Number(user?.credit_balance || 0),
    availableBalance: roundBalance(Number(user?.balance || 0) + Number(user?.credit_balance || 0)),
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

export async function getBillingUsageExport(
  userId: string,
  params: { startDate?: string; endDate?: string; subAccountId?: string } = {}
): Promise<{
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

  // 导出范围（spec §4.2）：主账号默认=自己+全部子账号，可用 subAccountId 过滤到某个子账号；子账号只能导出自己
  const caller = await getUserById(userId);
  let scopeCondition = "ul.user_id = ?";
  let scopeParams: any[] = [userId];
  if (caller && !caller.parent_user_id) {
    if (params.subAccountId) {
      const sub = await db.queryOne<{ id: string }>(
        "SELECT id FROM users WHERE id = ? AND (id = ? OR parent_user_id = ?)",
        [params.subAccountId, userId, userId]
      );
      if (!sub) throw new Error("subAccountId not found under this account");
      scopeCondition = "ul.user_id = ?";
      scopeParams = [params.subAccountId];
    } else {
      scopeCondition = "(u.id = ? OR u.parent_user_id = ?)";
      scopeParams = [userId, userId];
    }
  }

  const rawRows = await db.queryMany<any>(
    `SELECT
       ul.id as usage_id,
       ul.user_id as account_id,
       COALESCE(u.username, u.nickname) as account_name,
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
     LEFT JOIN users u ON u.id = ul.user_id
     LEFT JOIN api_keys ak ON ak.id = ul.api_key_id
     WHERE ${scopeCondition}
       AND ul.created_at >= ?
       AND ul.created_at <= ?
     ORDER BY ul.created_at ASC, ul.id ASC`,
    [...scopeParams, startDate.toISOString(), endDate.toISOString()]
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
      account_id: row.account_id || "",
      account_name: row.account_name || "",
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
