import { v4 as uuidv4 } from "uuid";
import db from "../db";

export type PaymentMethod = "mock" | "page" | "qr";
export type PaymentStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "closed"
  | "expired";

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
  processed: number;
  created_at: string;
  updated_at: string;
}

const stmts = {
  insert: db.prepare(
    `INSERT INTO payment_orders (
      id, order_no, user_id, amount, method, channel, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  getByOrderNo: db.prepare(`SELECT * FROM payment_orders WHERE order_no = ?`),
  getByOrderNoUserId: db.prepare(
    `SELECT * FROM payment_orders WHERE order_no = ? AND user_id = ?`
  ),
  markPending: db.prepare(
    `UPDATE payment_orders
       SET status = 'pending', updated_at = ?
     WHERE order_no = ? AND status = 'created'`
  ),
  markPaid: db.prepare(
    `UPDATE payment_orders
       SET status = 'paid',
           provider_trade_no = ?,
           paid_at = ?,
           notify_payload = ?,
           processed = ?,
           updated_at = ?
     WHERE order_no = ?`
  ),
  updateStatus: db.prepare(
    `UPDATE payment_orders
       SET status = ?, updated_at = ?
     WHERE order_no = ?`
  ),
  getLatestByUser: db.prepare(
    `SELECT * FROM payment_orders
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`
  ),
};

export function createPaymentOrder(args: {
  orderNo: string;
  userId: string;
  amount: number;
  method: PaymentMethod;
  channel?: string;
}): PaymentOrder {
  const now = new Date().toISOString();
  const row: PaymentOrder = {
    id: uuidv4(),
    order_no: args.orderNo,
    user_id: args.userId,
    amount: args.amount,
    method: args.method,
    channel: args.channel || "alipay",
    status: "created",
    provider_trade_no: null,
    paid_at: null,
    notify_payload: null,
    processed: 0,
    created_at: now,
    updated_at: now,
  };

  stmts.insert.run(
    row.id,
    row.order_no,
    row.user_id,
    row.amount,
    row.method,
    row.channel,
    row.status,
    row.created_at,
    row.updated_at
  );
  return row;
}

export function markOrderPending(orderNo: string): void {
  stmts.markPending.run(new Date().toISOString(), orderNo);
}

export function getPaymentOrder(orderNo: string): PaymentOrder | null {
  const row = stmts.getByOrderNo.get(orderNo) as PaymentOrder | undefined;
  return row || null;
}

export function getPaymentOrderForUser(
  orderNo: string,
  userId: string
): PaymentOrder | null {
  const row = stmts.getByOrderNoUserId.get(orderNo, userId) as
    | PaymentOrder
    | undefined;
  return row || null;
}

export function markOrderPaid(args: {
  orderNo: string;
  providerTradeNo?: string;
  notifyPayload?: string;
  processed?: boolean;
}): void {
  const now = new Date().toISOString();
  stmts.markPaid.run(
    args.providerTradeNo || null,
    now,
    args.notifyPayload || null,
    args.processed ? 1 : 0,
    now,
    args.orderNo
  );
}

export function setOrderStatus(orderNo: string, status: PaymentStatus): void {
  stmts.updateStatus.run(status, new Date().toISOString(), orderNo);
}

export function listUserPaymentOrders(userId: string, limit = 20, offset = 0) {
  return stmts.getLatestByUser.all(userId, limit, offset) as PaymentOrder[];
}

