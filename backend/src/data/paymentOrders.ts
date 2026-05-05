import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";

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
}): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE payment_orders
       SET status = 'paid', provider_trade_no = ?, paid_at = ?, notify_payload = ?, processed = ?, updated_at = ?
     WHERE order_no = ?`,
    [args.providerTradeNo || null, now, args.notifyPayload || null, !!args.processed, now, args.orderNo]
  );
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
