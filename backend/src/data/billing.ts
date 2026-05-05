import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { getUserById } from "./users";

export interface Transaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  ref_id: string | null;
  created_at: string;
}

function roundBalance(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
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
  refId?: string
): Promise<Transaction | null> {
  if (amount <= 0) return null;
  const normalizedAmount = roundBalance(amount);
  const txId = uuidv4();
  const now = new Date().toISOString();

  return db.transaction(async (client) => {
    const user = await client.queryOne<{ balance: number }>("SELECT balance FROM users WHERE id = ? FOR UPDATE", [userId]);
    if (!user) return null;
    const currentBalance = Number(user.balance || 0);
    if (currentBalance < normalizedAmount) return null;
    const newBalance = roundBalance(currentBalance - normalizedAmount);
    await client.execute("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?", [newBalance, now, userId]);
    const tx = await client.queryOne<Transaction>(
      `INSERT INTO transactions (id, user_id, type, amount, balance_after, description, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [txId, userId, "consumption", normalizedAmount, newBalance, description, refId || null, now]
    );
    return tx!;
  });
}

export async function hasSufficientBalance(userId: string | null | undefined, estimatedAmount: number): Promise<boolean> {
  if (!userId) return true;
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
