import db from "../db";
import { v4 as uuid } from "uuid";
import { getAllUsers } from "./users";
import { getUsageSummary } from "./usage";
import {
  createRateLimitRequest,
  getRateLimitRequestById,
  getRateLimitRequests,
  reviewRateLimitRequest,
} from "./rate-limit-requests";

const DEFAULT_QPM = 60;
const DEFAULT_TPM = 100000;

interface UserRateLimit {
  id: string;
  user_id: string;
  model: string;
  qpm: number;
  tpm: number;
  source: string;
  created_at: string;
  updated_at: string;
}

/** Get all rate limits for a user (including default) */
export function getUserRateLimits(userId: string): UserRateLimit[] {
  return db.prepare("SELECT * FROM user_rate_limits WHERE user_id = ? ORDER BY model").all(userId) as UserRateLimit[];
}

/** Get rate limit for a specific user + model (fall back to wildcard, then global default) */
export function getEffectiveRateLimit(userId: string, model: string): { qpm: number; tpm: number; source: string } {
  // 1. Check model-specific limit
  const specific = db.prepare("SELECT * FROM user_rate_limits WHERE user_id = ? AND model = ?").get(userId, model) as UserRateLimit | undefined;
  if (specific) return { qpm: specific.qpm, tpm: specific.tpm, source: "custom" };

  // 2. Check wildcard limit
  const wildcard = db.prepare("SELECT * FROM user_rate_limits WHERE user_id = ? AND model = '*'").get(userId) as UserRateLimit | undefined;
  if (wildcard) return { qpm: wildcard.qpm, tpm: wildcard.tpm, source: "user_default" };

  // 3. Global default
  return { qpm: DEFAULT_QPM, tpm: DEFAULT_TPM, source: "default" };
}

/** Get effective limits for a user across all models (for dashboard display) */
export function getUserLimitsOverview(userId: string): {
  defaultQpm: number;
  defaultTpm: number;
  customLimits: UserRateLimit[];
  requests: any[];
  pendingRequests: any[];
  pendingRequestCount: number;
} {
  const wildcard = db.prepare("SELECT * FROM user_rate_limits WHERE user_id = ? AND model = '*'").get(userId) as UserRateLimit | undefined;
  const customs = db.prepare("SELECT * FROM user_rate_limits WHERE user_id = ? AND model != '*' ORDER BY model").all(userId) as UserRateLimit[];
  const requests = getRateLimitRequests(userId);

  return {
    defaultQpm: wildcard?.qpm ?? DEFAULT_QPM,
    defaultTpm: wildcard?.tpm ?? DEFAULT_TPM,
    customLimits: customs,
    requests,
    pendingRequests: requests.filter((item) => item.status === "pending"),
    pendingRequestCount: requests.filter((item) => item.status === "pending").length,
  };
}

export function getAdminUserLimitSummaries() {
  return getAllUsers().map((user) => {
    const wildcard = db.prepare("SELECT * FROM user_rate_limits WHERE user_id = ? AND model = '*'").get(user.id) as UserRateLimit | undefined;
    const customs = db.prepare("SELECT * FROM user_rate_limits WHERE user_id = ? AND model != '*' ORDER BY model").all(user.id) as UserRateLimit[];
    const requests = getRateLimitRequests(user.id);
    const usage = getUsageSummary(user.id);
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      nickname: user.nickname,
      balance: user.balance,
      created_at: user.created_at,
      updated_at: user.updated_at,
      defaultQpm: wildcard?.qpm ?? DEFAULT_QPM,
      defaultTpm: wildcard?.tpm ?? DEFAULT_TPM,
      customLimits: customs,
      customLimitCount: customs.length,
      pendingRequestCount: requests.filter((item) => item.status === "pending").length,
      latestRequest: requests[0] || null,
      usage,
    };
  });
}

export function getAdminRateLimitRequests(status?: string) {
  return getRateLimitRequests(undefined, status);
}

export function submitRateLimitRequest(data: {
  userId: string;
  model?: string;
  requestedQpm: number;
  requestedTpm: number;
  reason?: string;
}) {
  return createRateLimitRequest(data);
}

export function approveRateLimitRequest(
  requestId: string,
  reviewer: string,
  overrides?: { model?: string; qpm?: number; tpm?: number; reply?: string }
) {
  const request = getRateLimitRequestById(requestId);
  if (!request || request.status !== "pending") return null;
  const model = overrides?.model?.trim() || request.model || "*";
  const qpm = overrides?.qpm ?? request.requested_qpm;
  const tpm = overrides?.tpm ?? request.requested_tpm;
  reviewRateLimitRequest(requestId, "approved", {
    adminReply: overrides?.reply || "已批准",
    reviewedBy: reviewer,
  });
  setUserRateLimit(request.user_id, model, qpm, tpm, "admin");
  return getRateLimitRequestById(requestId);
}

export function rejectRateLimitRequest(
  requestId: string,
  reviewer: string,
  reply?: string
) {
  const request = getRateLimitRequestById(requestId);
  if (!request || request.status !== "pending") return null;
  reviewRateLimitRequest(requestId, "rejected", {
    adminReply: reply || "已拒绝",
    reviewedBy: reviewer,
  });
  return getRateLimitRequestById(requestId);
}

/** Admin: set rate limit for a user + model */
export function setUserRateLimit(userId: string, model: string, qpm: number, tpm: number, source: string = "admin"): void {
  const existing = db.prepare("SELECT id FROM user_rate_limits WHERE user_id = ? AND model = ?").get(userId, model) as any;
  if (existing) {
    db.prepare("UPDATE user_rate_limits SET qpm = ?, tpm = ?, source = ?, updated_at = datetime('now') WHERE id = ?")
      .run(qpm, tpm, source, existing.id);
  } else {
    db.prepare("INSERT INTO user_rate_limits (id, user_id, model, qpm, tpm, source) VALUES (?, ?, ?, ?, ?, ?)")
      .run(uuid(), userId, model, qpm, tpm, source);
  }
}

export { DEFAULT_QPM, DEFAULT_TPM };
