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
}

export async function createRateLimitRequest(data: {
  userId: string;
  model?: string;
  requestedQpm: number;
  requestedTpm: number;
  reason?: string;
}): Promise<RateLimitRequest> {
  const row = await db.queryOne<RateLimitRequest>(
    `INSERT INTO rate_limit_requests (id, user_id, model, requested_qpm, requested_tpm, reason)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [uuid(), data.userId, data.model?.trim() || "*", data.requestedQpm, data.requestedTpm, data.reason?.trim() || ""]
  );
  return row!;
}

export async function getRateLimitRequestById(id: string): Promise<RateLimitRequest | null> {
  return db.queryOne<RateLimitRequest>("SELECT * FROM rate_limit_requests WHERE id = ?", [id]);
}

export async function getRateLimitRequests(userId?: string, status?: string): Promise<RateLimitRequest[]> {
  const clauses: string[] = [];
  const params: any[] = [];
  if (userId) {
    clauses.push("user_id = ?");
    params.push(userId);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.queryMany<RateLimitRequest>(`SELECT * FROM rate_limit_requests ${where} ORDER BY created_at DESC`, params);
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
  const existing = await getRateLimitRequestById(requestId);
  if (!existing || existing.status !== "pending") return null;

  return db.queryOne<RateLimitRequest>(
    `UPDATE rate_limit_requests
     SET status = ?, admin_reply = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
     WHERE id = ?
     RETURNING *`,
    [status, data.adminReply || null, data.reviewedBy || null, new Date().toISOString(), new Date().toISOString(), requestId]
  );
}
