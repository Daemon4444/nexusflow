import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import type { Transaction } from "./billing";

export type PaymentMethod = "mock" | "page" | "qr";
export type PaymentStatus = "created" | "pending" | "paid" | "failed" | "closed" | "expired";

export interface PaymentOrder {
  id: string;
  order_no: string;
  user_id: string;
  amount: number;
  method: PaymentMethod;
  channel: string;
  status: PaymentStatus;
  provider_trade_no: string | null;
  paid_at: string | null;
  notify_payload: string | null;
  processed: boolean;
  created_at: string;
  updated_at: string;
}

export async function createPaymentOrder(args: {
  orderNo: string;
  userId: string;
  amount: number;
  method: PaymentMethod;
  channel?: string;
}): Promise<PaymentOrder> {
  const now = new Date().toISOString();
  const row = await db.queryOne<PaymentOrder>(
    `INSERT INTO payment_orders (id, order_no, user_id, amount, method, channel, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [uuidv4(), args.orderNo, args.userId, args.amount, args.method, args.channel || "alipay", "created", now, now]
  );
  return row!;
}

export async function markOrderPending(orderNo: string): Promise<void> {
  await db.execute("UPDATE payment_orders SET status = 'pending', updated_at = ? WHERE order_no = ? AND status = 'created'", [
    new Date().toISOString(),
    orderNo,
  ]);
}

export async function getPaymentOrder(orderNo: string): Promise<PaymentOrder | null> {
  return db.queryOne<PaymentOrder>("SELECT * FROM payment_orders WHERE order_no = ?", [orderNo]);
}

export async function getPaymentOrderForUser(orderNo: string, userId: string): Promise<PaymentOrder | null> {
  return db.queryOne<PaymentOrder>("SELECT * FROM payment_orders WHERE order_no = ? AND user_id = ?", [orderNo, userId]);
}

export async function markOrderPaid(args: {
  orderNo: string;
  providerTradeNo?: string;
  notifyPayload?: string;
  processed?: boolean;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const affected = await db.execute(
    `UPDATE payment_orders
       SET status = 'paid', provider_trade_no = ?, paid_at = ?, notify_payload = ?, processed = ?, updated_at = ?
     WHERE order_no = ? AND status NOT IN ('paid', 'failed', 'closed')`,
    [args.providerTradeNo || null, now, args.notifyPayload || null, !!args.processed, now, args.orderNo]
  );
  return affected > 0;
}

export type PaymentSettlementResult =
  | { status: "settled"; transaction: Transaction; replayed: boolean }
  | { status: "order_not_found" }
  | { status: "amount_mismatch"; orderAmount: number }
  | { status: "order_not_settleable" }
  | { status: "user_not_settleable" };

/**
 * Convert a provider amount to exact minor units. Values with sub-cent
 * precision are rejected instead of rounded up into a fully paid order.
 */
export function paymentAmountToCents(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const scaled = numeric * 100;
  const cents = Math.round(scaled);
  if (!Number.isSafeInteger(cents) || Math.abs(scaled - cents) > 1e-7) return null;
  return cents;
}

/**
 * Commits payment status, customer balance and the recharge ledger row as one
 * transaction. `processed = TRUE` is never visible before the money exists.
 */
export async function settlePaidPaymentOrder(args: {
  orderNo: string;
  paidAmount: number;
  providerTradeNo?: string;
  notifyPayload?: string;
}, testHooks?: {
  afterLedgerInsert?: () => Promise<void>;
}): Promise<PaymentSettlementResult> {
  const paidCents = paymentAmountToCents(args.paidAmount);
  const paymentRef = `alipay:${args.orderNo}`;
  try {
    return await db.transaction(async (client) => {
    const order = await client.queryOne<PaymentOrder>(
      "SELECT * FROM payment_orders WHERE order_no = ? FOR UPDATE",
      [args.orderNo]
    );
    if (!order) return { status: "order_not_found" };
    const orderCents = paymentAmountToCents(order.amount);
    if (paidCents === null || orderCents === null || paidCents !== orderCents) {
      return { status: "amount_mismatch", orderAmount: Number(order.amount) };
    }
    const paidAmount = paidCents / 100;
    if (["failed", "closed", "expired"].includes(order.status)) {
      return { status: "order_not_settleable" };
    }

    const existing = await client.queryOne<Transaction>(
      "SELECT * FROM transactions WHERE type = 'recharge' AND COALESCE(ref_id, '') = ? LIMIT 1",
      [paymentRef]
    );
    const now = new Date().toISOString();
    if (existing) {
      await client.execute(
        `UPDATE payment_orders
            SET status = 'paid',
                provider_trade_no = COALESCE(?, provider_trade_no),
                paid_at = COALESCE(paid_at, ?),
                notify_payload = COALESCE(?, notify_payload),
                processed = TRUE,
                updated_at = ?
          WHERE order_no = ?`,
        [
          args.providerTradeNo || null,
          now,
          args.notifyPayload || null,
          now,
          args.orderNo,
        ]
      );
      return { status: "settled", transaction: existing, replayed: true };
    }

    const user = await client.queryOne<{
      balance: number | string;
      credit_balance: number | string;
      parent_user_id: string | null;
    }>(
      "SELECT balance, credit_balance, parent_user_id FROM users WHERE id = ? FOR UPDATE",
      [order.user_id]
    );
    if (!user || user.parent_user_id) return { status: "user_not_settleable" };

    const newBalance = Math.round((Number(user.balance || 0) + paidAmount) * 1_000_000) / 1_000_000;
    // Insert the unique order ledger marker before mutating balance. The order
    // row lock is the primary serializer; the partial unique index is the
    // final cross-path guard.
    const transaction = await client.queryOne<Transaction>(
      `INSERT INTO transactions (
         id, user_id, type, amount, balance_after, credit_amount, credit_after,
         description, ref_id, created_at
       ) VALUES (?, ?, 'recharge', ?, ?, 0, ?, ?, ?, ?)
       RETURNING *`,
      [
        uuidv4(),
        order.user_id,
        paidAmount,
        newBalance,
        Number(user.credit_balance || 0),
        `支付宝充值 ¥${paidAmount.toFixed(2)} (${args.orderNo})`,
        paymentRef,
        now,
      ]
    );
    if (!transaction) throw new Error("payment settlement ledger insert returned no row");
    if (testHooks?.afterLedgerInsert) await testHooks.afterLedgerInsert();

    await client.execute(
      "UPDATE users SET balance = ?, updated_at = ? WHERE id = ?",
      [newBalance, now, order.user_id]
    );
    await client.execute(
      `UPDATE payment_orders
          SET status = 'paid',
              provider_trade_no = ?,
              paid_at = ?,
              notify_payload = ?,
              processed = TRUE,
              updated_at = ?
        WHERE order_no = ?`,
      [
        args.providerTradeNo || null,
        now,
        args.notifyPayload || null,
        now,
        args.orderNo,
      ]
    );
    return { status: "settled", transaction, replayed: false };
    });
  } catch (error: any) {
    if (error?.code === "23505") {
      const existing = await db.queryOne<Transaction>(
        "SELECT * FROM transactions WHERE type = 'recharge' AND COALESCE(ref_id, '') = ? LIMIT 1",
        [paymentRef]
      );
      if (existing) return { status: "settled", transaction: existing, replayed: true };
    }
    throw error;
  }
}

export type QueriedPaymentSettlementResult =
  | PaymentSettlementResult
  | { status: "invalid_provider_amount" };

/**
 * Payment polling must settle from the amount returned by the provider. This
 * wrapper makes it impossible for the route to substitute the local order
 * amount when the upstream result is missing or malformed.
 */
export async function settleQueriedPaymentOrder(args: {
  orderNo: string;
  providerAmount: unknown;
  providerTradeNo?: string;
  notifyPayload?: string;
}): Promise<QueriedPaymentSettlementResult> {
  const providerCents = paymentAmountToCents(args.providerAmount);
  if (providerCents === null) return { status: "invalid_provider_amount" };
  return settlePaidPaymentOrder({
    orderNo: args.orderNo,
    paidAmount: providerCents / 100,
    providerTradeNo: args.providerTradeNo,
    notifyPayload: args.notifyPayload,
  });
}

export async function setOrderStatus(orderNo: string, status: PaymentStatus): Promise<void> {
  await db.execute("UPDATE payment_orders SET status = ?, updated_at = ? WHERE order_no = ?", [
    status,
    new Date().toISOString(),
    orderNo,
  ]);
}

export async function listUserPaymentOrders(userId: string, limit = 20, offset = 0): Promise<PaymentOrder[]> {
  return db.queryMany<PaymentOrder>(
    "SELECT * FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [userId, limit, offset]
  );
}
