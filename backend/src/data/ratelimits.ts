import db from "../db";
import { v4 as uuid } from "uuid";

const DEFAULT_QPM = 1000;
const DEFAULT_TPM = 1000000;

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
export function getUserLimitsOverview(userId: string): { defaultQpm: number; defaultTpm: number; customLimits: UserRateLimit[] } {
  const wildcard = db.prepare("SELECT * FROM user_rate_limits WHERE user_id = ? AND model = '*'").get(userId) as UserRateLimit | undefined;
  const customs = db.prepare("SELECT * FROM user_rate_limits WHERE user_id = ? AND model != '*' ORDER BY model").all(userId) as UserRateLimit[];

  return {
    defaultQpm: wildcard?.qpm ?? DEFAULT_QPM,
    defaultTpm: wildcard?.tpm ?? DEFAULT_TPM,
    customLimits: customs,
  };
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
