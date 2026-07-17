import { v4 as uuid } from "uuid";
import { db } from "../db/client";
import { getAllUsers } from "./users";
import { getUsageSummary } from "./usage";
import {
  createRateLimitRequest,
  getRateLimitRequestById,
  getRateLimitRequests,
  reviewRateLimitRequest,
} from "./rate-limit-requests";

const DEFAULT_QPM = 30000;
const DEFAULT_TPM = 5000000;

export interface UserRateLimit {
  id: string;
  user_id: string;
  model: string;
  qpm: number;
  tpm: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export async function getUserRateLimits(userId: string): Promise<UserRateLimit[]> {
  return db.queryMany<UserRateLimit>("SELECT * FROM user_rate_limits WHERE user_id = ? ORDER BY model", [userId]);
}

export async function getEffectiveRateLimit(userId: string, model: string): Promise<{ qpm: number; tpm: number; source: string }> {
  const specific = await db.queryOne<UserRateLimit>("SELECT * FROM user_rate_limits WHERE user_id = ? AND model = ?", [userId, model]);
  if (specific) return { qpm: specific.qpm, tpm: specific.tpm, source: "custom" };

  const wildcard = await db.queryOne<UserRateLimit>("SELECT * FROM user_rate_limits WHERE user_id = ? AND model = '*'", [userId]);
  if (wildcard) return { qpm: wildcard.qpm, tpm: wildcard.tpm, source: "user_default" };

  return { qpm: DEFAULT_QPM, tpm: DEFAULT_TPM, source: "default" };
}

export async function getUserLimitsOverview(userId: string) {
  const wildcard = await db.queryOne<UserRateLimit>("SELECT * FROM user_rate_limits WHERE user_id = ? AND model = '*'", [userId]);
  const customs = await db.queryMany<UserRateLimit>("SELECT * FROM user_rate_limits WHERE user_id = ? AND model != '*' ORDER BY model", [userId]);
  const requests = await getRateLimitRequests(userId);
  return {
    defaultQpm: wildcard?.qpm ?? DEFAULT_QPM,
    defaultTpm: wildcard?.tpm ?? DEFAULT_TPM,
    systemDefaultQpm: DEFAULT_QPM,
    systemDefaultTpm: DEFAULT_TPM,
    hasUserDefault: !!wildcard,
    customLimits: customs,
    requests,
    pendingRequests: requests.filter((item) => item.status === "pending"),
    pendingRequestCount: requests.filter((item) => item.status === "pending").length,
  };
}

export async function getAdminUserLimitSummaries() {
  const users = await getAllUsers();
  return Promise.all(users.map(async (user) => {
    const wildcard = await db.queryOne<UserRateLimit>("SELECT * FROM user_rate_limits WHERE user_id = ? AND model = '*'", [user.id]);
    const customs = await db.queryMany<UserRateLimit>("SELECT * FROM user_rate_limits WHERE user_id = ? AND model != '*' ORDER BY model", [user.id]);
    const requests = await getRateLimitRequests(user.id);
    const usage = await getUsageSummary(user.id);
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
  }));
}

export async function getAdminRateLimitRequests(status?: string) {
  return getRateLimitRequests(undefined, status);
}

export async function submitRateLimitRequest(data: {
  userId: string;
  model?: string;
  requestedQpm: number;
  requestedTpm: number;
  reason?: string;
}) {
  return createRateLimitRequest(data);
}

export async function approveRateLimitRequest(
  requestId: string,
  reviewer: string,
  overrides?: { model?: string; qpm?: number; tpm?: number; reply?: string }
) {
  const request = await getRateLimitRequestById(requestId);
  if (!request || request.status !== "pending") return null;
  const model = overrides?.model?.trim() || request.model || "*";
  const qpm = overrides?.qpm ?? request.requested_qpm;
  const tpm = overrides?.tpm ?? request.requested_tpm;
  await reviewRateLimitRequest(requestId, "approved", {
    adminReply: overrides?.reply || "已批准",
    reviewedBy: reviewer,
  });
  await setUserRateLimit(request.user_id, model, qpm, tpm, "admin");
  return getRateLimitRequestById(requestId);
}

export async function rejectRateLimitRequest(requestId: string, reviewer: string, reply?: string) {
  const request = await getRateLimitRequestById(requestId);
  if (!request || request.status !== "pending") return null;
  await reviewRateLimitRequest(requestId, "rejected", {
    adminReply: reply || "已拒绝",
    reviewedBy: reviewer,
  });
  return getRateLimitRequestById(requestId);
}

export async function setUserRateLimit(userId: string, model: string, qpm: number, tpm: number, source: string = "admin"): Promise<void> {
  const existing = await db.queryOne<{ id: string }>("SELECT id FROM user_rate_limits WHERE user_id = ? AND model = ?", [userId, model]);
  if (existing) {
    await db.execute("UPDATE user_rate_limits SET qpm = ?, tpm = ?, source = ?, updated_at = ? WHERE id = ?", [
      qpm,
      tpm,
      source,
      new Date().toISOString(),
      existing.id,
    ]);
  } else {
    await db.execute("INSERT INTO user_rate_limits (id, user_id, model, qpm, tpm, source) VALUES (?, ?, ?, ?, ?, ?)", [
      uuid(),
      userId,
      model,
      qpm,
      tpm,
      source,
    ]);
  }
}

export async function deleteUserRateLimit(userId: string, model: string): Promise<boolean> {
  return (await db.execute("DELETE FROM user_rate_limits WHERE user_id = ? AND model = ?", [userId, model])) > 0;
}

export { DEFAULT_QPM, DEFAULT_TPM };
