import { v4 as uuidv4 } from "uuid";
import db from "../db";
import { getUserById, updateUserBalance } from "./users";

export interface Transaction {
  id: string;
  user_id: string;
  type: string; // 'recharge' | 'consumption' | 'refund'
  amount: number;
  balance_after: number;
  description: string;
  ref_id: string | null;
  created_at: string;
}

const stmts = {
  insert: db.prepare(
    `INSERT INTO transactions (id, user_id, type, amount, balance_after, description, ref_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  getByUser: db.prepare(
    `SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ),
  getCountByUser: db.prepare(
    `SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?`
  ),
  getSummaryByUser: db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END), 0) as totalRecharge,
       COALESCE(SUM(CASE WHEN type = 'consumption' THEN amount ELSE 0 END), 0) as totalConsumption,
       COUNT(CASE WHEN type = 'consumption' THEN 1 END) as totalCalls
     FROM transactions WHERE user_id = ?`
  ),
  getMonthlyByUser: db.prepare(
    `SELECT
       strftime('%Y-%m', created_at) as month,
       COALESCE(SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END), 0) as recharge,
       COALESCE(SUM(CASE WHEN type = 'consumption' THEN amount ELSE 0 END), 0) as consumption
     FROM transactions
     WHERE user_id = ? AND created_at >= datetime('now', '-6 months')
     GROUP BY strftime('%Y-%m', created_at)
     ORDER BY month`
  ),
};

function roundBalance(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** 充值 */
export function recharge(userId: string, amount: number, description?: string): Transaction | null {
  if (amount <= 0) return null;
  const user = getUserById(userId);
  if (!user) return null;

  const normalizedAmount = roundBalance(amount);
  const newBalance = roundBalance(user.balance + normalizedAmount);
  const txId = uuidv4();
  const now = new Date().toISOString();

  const doRecharge = db.transaction(() => {
    updateUserBalance(userId, newBalance);
    stmts.insert.run(
      txId, userId, "recharge", normalizedAmount, newBalance,
      description || `充值 ¥${amount.toFixed(2)}`, null, now
    );
  });
  doRecharge();

  return {
    id: txId, user_id: userId, type: "recharge",
    amount: normalizedAmount, balance_after: newBalance,
    description: description || `充值 ¥${amount.toFixed(2)}`,
    ref_id: null, created_at: now,
  };
}

/** 消费扣费（返回 null 表示余额不足） */
export function consume(
  userId: string, amount: number, description: string, refId?: string
): Transaction | null {
  if (amount <= 0) return null;
  const user = getUserById(userId);
  if (!user) return null;
  const normalizedAmount = roundBalance(amount);
  if (user.balance < normalizedAmount) return null; // 余额不足

  const newBalance = roundBalance(user.balance - normalizedAmount);
  const txId = uuidv4();
  const now = new Date().toISOString();

  const doConsume = db.transaction(() => {
    updateUserBalance(userId, newBalance);
    stmts.insert.run(
      txId, userId, "consumption", normalizedAmount, newBalance,
      description, refId || null, now
    );
  });
  doConsume();

  return {
    id: txId, user_id: userId, type: "consumption",
    amount: normalizedAmount, balance_after: newBalance,
    description, ref_id: refId || null, created_at: now,
  };
}

/** 获取用户交易记录（分页） */
export function getTransactions(userId: string, limit = 20, offset = 0) {
  const rows = stmts.getByUser.all(userId, limit, offset) as Transaction[];
  const total = (stmts.getCountByUser.get(userId) as any).cnt;
  return { rows, total };
}

/** 获取用户账单概览 */
export function getBillingSummary(userId: string) {
  const row: any = stmts.getSummaryByUser.get(userId);
  const user = getUserById(userId);
  return {
    balance: user?.balance || 0,
    totalRecharge: roundBalance(row.totalRecharge),
    totalConsumption: roundBalance(row.totalConsumption),
    totalCalls: row.totalCalls,
  };
}

/** 获取月度统计 */
export function getMonthlyStats(userId: string) {
  return stmts.getMonthlyByUser.all(userId);
}
