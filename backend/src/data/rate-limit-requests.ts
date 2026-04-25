import { v4 as uuid } from "uuid";
import db from "../db";

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

export function createRateLimitRequest(data: {
  userId: string;
  model?: string;
  requestedQpm: number;
  requestedTpm: number;
  reason?: string;
}): RateLimitRequest {
  const id = uuid();
  db.prepare(`
    INSERT INTO rate_limit_requests (
      id, user_id, model, requested_qpm, requested_tpm, reason
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.userId,
    data.model?.trim() || "*",
    data.requestedQpm,
    data.requestedTpm,
    data.reason?.trim() || ""
  );
  return getRateLimitRequestById(id)!;
}

export function getRateLimitRequestById(id: string): RateLimitRequest | null {
  const row = db.prepare("SELECT * FROM rate_limit_requests WHERE id = ?").get(id) as RateLimitRequest | undefined;
  return row || null;
}

export function getRateLimitRequests(userId?: string, status?: string): RateLimitRequest[] {
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
  return db.prepare(`
    SELECT * FROM rate_limit_requests
    ${where}
    ORDER BY created_at DESC
  `).all(...params) as RateLimitRequest[];
}

export function reviewRateLimitRequest(
  requestId: string,
  status: "approved" | "rejected",
  data: {
    adminReply?: string;
    reviewedBy?: string;
    approvedModel?: string;
    approvedQpm?: number;
    approvedTpm?: number;
  } = {}
): RateLimitRequest | null {
  const existing = getRateLimitRequestById(requestId);
  if (!existing || existing.status !== "pending") return null;

  db.prepare(`
    UPDATE rate_limit_requests
    SET status = ?, admin_reply = ?, reviewed_by = ?, reviewed_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    status,
    data.adminReply || null,
    data.reviewedBy || null,
    new Date().toISOString(),
    requestId
  );

  return getRateLimitRequestById(requestId);
}
