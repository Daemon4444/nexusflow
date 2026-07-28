import { v4 as uuid } from "uuid";
import { db } from "../db/client";

export interface RateLimitRequest {
  id: string;
  user_id: string;
  model: string;
  requested_qpm: number;
  requested_tpm: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  admin_reply: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  user_email?: string | null;
  user_nickname?: string | null;
}

export const MAX_PENDING_RATE_LIMIT_REQUESTS_PER_USER = 5;
export const MAX_RATE_LIMIT_REQUEST_HISTORY_PER_USER = 500;

export class RateLimitRequestLimitError extends Error {
  constructor(
    public readonly code:
      | "pending_request_exists"
      | "pending_request_limit"
      | "request_history_limit"
      | "user_not_found"
  ) {
    super(code);
    this.name = "RateLimitRequestLimitError";
  }
}

export async function createRateLimitRequest(data: {
  userId: string;
  model?: string;
  requestedQpm: number;
  requestedTpm: number;
  reason?: string;
}): Promise<RateLimitRequest> {
  const model = data.model?.trim() || "*";
  const reason = data.reason?.trim() || "";
  return db.transaction(async (client) => {
    const user = await client.queryOne<{ id: string }>(
      "SELECT id FROM users WHERE id = ? FOR UPDATE",
      [data.userId]
    );
    if (!user) throw new RateLimitRequestLimitError("user_not_found");

    const counts = await client.queryOne<{
      total_count: number | string;
      pending_count: number | string;
      same_model_pending: number | string;
    }>(
      `SELECT
         COUNT(*)::int AS total_count,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0)::int
           AS pending_count,
         COALESCE(SUM(CASE WHEN status = 'pending' AND model = ? THEN 1 ELSE 0 END), 0)::int
           AS same_model_pending
       FROM rate_limit_requests
       WHERE user_id = ?`,
      [model, data.userId]
    );
    if (Number(counts?.same_model_pending || 0) > 0) {
      throw new RateLimitRequestLimitError("pending_request_exists");
    }
    if (
      Number(counts?.pending_count || 0)
      >= MAX_PENDING_RATE_LIMIT_REQUESTS_PER_USER
    ) {
      throw new RateLimitRequestLimitError("pending_request_limit");
    }
    if (
      Number(counts?.total_count || 0)
      >= MAX_RATE_LIMIT_REQUEST_HISTORY_PER_USER
    ) {
      throw new RateLimitRequestLimitError("request_history_limit");
    }

    const row = await client.queryOne<RateLimitRequest>(
      `INSERT INTO rate_limit_requests (
         id, user_id, model, requested_qpm, requested_tpm, reason
       ) VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        uuid(),
        data.userId,
        model,
        data.requestedQpm,
        data.requestedTpm,
        reason,
      ]
    );
    return row!;
  });
}

export async function getRateLimitRequestById(id: string): Promise<RateLimitRequest | null> {
  return db.queryOne<RateLimitRequest>("SELECT * FROM rate_limit_requests WHERE id = ?", [id]);
}

export async function getRateLimitRequestsPage(params: {
  userId?: string;
  status?: string;
  query?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: RateLimitRequest[]; total: number }> {
  const clauses: string[] = [];
  const values: any[] = [];
  if (params.userId) {
    clauses.push("r.user_id = ?");
    values.push(params.userId);
  }
  if (params.status) {
    clauses.push("r.status = ?");
    values.push(params.status);
  }
  if (params.query?.trim()) {
    clauses.push(
      "(r.id LIKE ? OR r.user_id LIKE ? OR r.model LIKE ? OR r.reason LIKE ? OR u.email LIKE ? OR u.nickname LIKE ?)"
    );
    const pattern = `%${params.query.trim()}%`;
    values.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }
  const limit = Math.max(1, Math.min(100, Math.floor(params.limit || 50)));
  const offset = Math.max(0, Math.floor(params.offset || 0));
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const count = await db.queryOne<{ count: number | string }>(
    `SELECT COUNT(*)::int AS count
       FROM rate_limit_requests r
       LEFT JOIN users u ON u.id = r.user_id
       ${where}`,
    values
  );
  const items = await db.queryMany<RateLimitRequest>(
    `SELECT r.*, u.email AS user_email, u.nickname AS user_nickname
       FROM rate_limit_requests r
       LEFT JOIN users u ON u.id = r.user_id
       ${where}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return { items, total: Number(count?.count || 0) };
}

export async function getRateLimitRequests(
  userId?: string,
  status?: string,
  options: { limit?: number; offset?: number } = {}
): Promise<RateLimitRequest[]> {
  return (
    await getRateLimitRequestsPage({
      userId,
      status,
      limit: options.limit,
      offset: options.offset,
    })
  ).items;
}

export async function getRateLimitRequestCounts(userId: string): Promise<{
  total: number;
  pending: number;
}> {
  const row = await db.queryOne<{
    total_count: number | string;
    pending_count: number | string;
  }>(
    `SELECT
       COUNT(*)::int AS total_count,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0)::int
         AS pending_count
     FROM rate_limit_requests
     WHERE user_id = ?`,
    [userId]
  );
  return {
    total: Number(row?.total_count || 0),
    pending: Number(row?.pending_count || 0),
  };
}

export async function reviewRateLimitRequest(
  requestId: string,
  status: "approved" | "rejected",
  data: {
    adminReply?: string;
    reviewedBy?: string;
    approvedModel?: string;
    approvedQpm?: number;
    approvedTpm?: number;
  } = {}
): Promise<RateLimitRequest | null> {
  return db.queryOne<RateLimitRequest>(
    `UPDATE rate_limit_requests
     SET status = ?, admin_reply = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'
     RETURNING *`,
    [status, data.adminReply || null, data.reviewedBy || null, new Date().toISOString(), new Date().toISOString(), requestId]
  );
}
