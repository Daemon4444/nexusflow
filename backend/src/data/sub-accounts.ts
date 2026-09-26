import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { User, hashPasswordAsync, deleteSessionsByUserId } from "./users";
import { models } from "./models";
import { normalizeAllowedModels } from "./model-access";
import { validateNewPassword } from "../utils/password-policy";

// docs/specs/sub-accounts-spec.md §2

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;
const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "system", "api", "support", "billing",
  "nexusflow", "quadrant", "official", "help", "service", "test",
]);

/** 规整并校验 allowedModels：仅保留存在于目录中的模型 id。null 表示"不设置/不限"。 */
function sanitizeAllowedModels(input: unknown): string[] | null {
  const normalized = normalizeAllowedModels(input);
  if (normalized == null) return null;
  const valid = new Set(models.map((m) => m.id));
  return normalized.filter((id) => valid.has(id));
}

export function getSubAccountLimit(): number {
  const parsed = Number(process.env.SUB_ACCOUNT_LIMIT || 20);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 20;
}

export function validateUsername(username: string): string | null {
  if (!USERNAME_PATTERN.test(username)) return "用户名须为 3-32 位字母、数字、下划线或连字符";
  if (RESERVED_USERNAMES.has(username.toLowerCase())) return "该用户名不可用";
  return null;
}

export interface SubAccountSummary {
  id: string;
  username: string | null;
  nickname: string;
  email: string | null;
  status: string;
  quota_limit: number | null;
  quota_used: number;
  quota_period: string | null;
  created_at: string;
  key_count: number;
  last_active: string | null;
  allowed_models: string | null; // JSON 数组；NULL=不限
}

function normalizeQuota(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 1_000_000) / 1_000_000;
}

export async function countSubAccounts(ownerId: string): Promise<number> {
  const row = await db.queryOne<{ cnt: string | number }>(
    "SELECT COUNT(*) as cnt FROM users WHERE parent_user_id = ? AND status != 'deleted'",
    [ownerId]
  );
  return Number(row?.cnt || 0);
}

export async function createSubAccount(params: {
  ownerId: string;
  username: string;
  password: string;
  nickname?: string;
  quotaLimit?: number | null;
  quotaPeriod?: string | null;
  allowedModels?: string[] | null;
}): Promise<{ user: User } | { error: string; status: number }> {
  const username = params.username.toLowerCase();
  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError, status: 400 };
  const passwordError = validateNewPassword(params.password || "");
  if (passwordError) return { error: passwordError, status: 400 };

  const quotaLimit = normalizeQuota(params.quotaLimit);
  const quotaPeriod = params.quotaPeriod === "monthly" ? "monthly" : params.quotaPeriod === "total" ? "total" : null;
  if (quotaPeriod && quotaLimit == null) return { error: "设置限额周期时必须提供限额金额", status: 400 };

  // 新建子账号默认无任何模型权限（[]），须主账号显式授权
  const allowed = sanitizeAllowedModels(params.allowedModels) ?? [];
  const preflightOwner = await db.queryOne<{
    status: string | null;
    parent_user_id: string | null;
  }>("SELECT status, parent_user_id FROM users WHERE id = ?", [params.ownerId]);
  if (!preflightOwner) return { error: "主账号不存在", status: 404 };
  if (preflightOwner.parent_user_id) return { error: "子账号不能创建下级账号", status: 403 };
  if ((preflightOwner.status || "active") !== "active") {
    return { error: "主账号当前不可用", status: 403 };
  }
  if (await countSubAccounts(params.ownerId) >= getSubAccountLimit()) {
    return { error: `子账号数量已达上限（${getSubAccountLimit()}）`, status: 400 };
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const nickname = (params.nickname || username).slice(0, 20);
  const passwordHash = await hashPasswordAsync(params.password);

  return db.transaction(async (tx) => {
    // Every creator for this owner serializes on the same authoritative row.
    // The count and INSERT therefore form one capacity decision across all
    // backend nodes; a process-local mutex would not protect production.
    const owner = await tx.queryOne<{
      id: string;
      status: string | null;
      parent_user_id: string | null;
    }>(
      "SELECT id, status, parent_user_id FROM users WHERE id = ? FOR UPDATE",
      [params.ownerId]
    );
    if (!owner) return { error: "主账号不存在", status: 404 };
    if (owner.parent_user_id) return { error: "子账号不能创建下级账号", status: 403 };
    if ((owner.status || "active") !== "active") {
      return { error: "主账号当前不可用", status: 403 };
    }

    const existing = await tx.queryOne<{ id: string }>(
      "SELECT id FROM users WHERE username = ?",
      [username]
    );
    if (existing) return { error: "用户名已被占用", status: 409 };

    const countRow = await tx.queryOne<{ cnt: string | number }>(
      "SELECT COUNT(*) as cnt FROM users WHERE parent_user_id = ? AND status != 'deleted'",
      [params.ownerId]
    );
    const limit = getSubAccountLimit();
    if (Number(countRow?.cnt || 0) >= limit) {
      return { error: `子账号数量已达上限（${limit}）`, status: 400 };
    }

    const user = await tx.queryOne<User>(
      `INSERT INTO users (id, phone, email, nickname, balance, password_hash, parent_user_id, username, status,
                          quota_limit, quota_used, quota_period, quota_reset_at, allowed_models, created_at, updated_at)
       VALUES (?, NULL, NULL, ?, 0, ?, ?, ?, 'active', ?, 0, ?, ?, ?, ?, ?)
       RETURNING *`,
      [id, nickname, passwordHash, params.ownerId, username,
       quotaLimit, quotaLimit != null ? (quotaPeriod || "total") : null, quotaPeriod === "monthly" ? now : null,
       JSON.stringify(allowed), now, now]
    );
    return { user: user! };
  });
}

export async function listSubAccounts(ownerId: string): Promise<SubAccountSummary[]> {
  const rows = await db.queryMany<any>(
    `SELECT u.id, u.username, u.nickname, u.email, u.status,
            u.quota_limit, u.quota_used, u.quota_period, u.created_at, u.allowed_models,
            COUNT(k.id)::int as key_count,
            MAX(k.last_used) as last_active
       FROM users u
       LEFT JOIN api_keys k ON k.user_id = u.id
      WHERE u.parent_user_id = ? AND u.status != 'deleted'
      GROUP BY u.id, u.username, u.nickname, u.email, u.status,
               u.quota_limit, u.quota_used, u.quota_period, u.created_at, u.allowed_models
      ORDER BY u.created_at ASC`,
    [ownerId]
  );
  return rows.map((row) => ({
    id: row.id,
    username: row.username || null,
    nickname: row.nickname,
    email: row.email || null,
    status: row.status || "active",
    quota_limit: row.quota_limit == null ? null : Number(row.quota_limit),
    quota_used: Number(row.quota_used || 0),
    quota_period: row.quota_period || null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    key_count: Number(row.key_count || 0),
    last_active: row.last_active
      ? (row.last_active instanceof Date ? row.last_active.toISOString() : String(row.last_active))
      : null,
    allowed_models: row.allowed_models ?? null,
  }));
}

export async function getSubAccountForOwner(ownerId: string, subId: string): Promise<User | null> {
  return db.queryOne<User>(
    "SELECT * FROM users WHERE id = ? AND parent_user_id = ? AND status != 'deleted'",
    [subId, ownerId]
  );
}

export async function updateSubAccount(
  ownerId: string,
  subId: string,
  patch: { nickname?: string; quotaLimit?: number | null; quotaPeriod?: string | null; status?: string; allowedModels?: string[] | null }
): Promise<{ user: User } | { error: string; status: number }> {
  const sub = await getSubAccountForOwner(ownerId, subId);
  if (!sub) return { error: "子账号不存在", status: 404 };

  const sets: string[] = [];
  const values: any[] = [];

  if (patch.nickname !== undefined) {
    const nickname = String(patch.nickname).trim().slice(0, 20);
    if (!nickname) return { error: "昵称不能为空", status: 400 };
    sets.push("nickname = ?");
    values.push(nickname);
  }
  if (patch.quotaLimit !== undefined) {
    const quotaLimit = normalizeQuota(patch.quotaLimit);
    if (patch.quotaLimit != null && (patch.quotaLimit as unknown) !== "" && quotaLimit == null) {
      return { error: "限额必须是非负数字", status: 400 };
    }
    sets.push("quota_limit = ?");
    values.push(quotaLimit);
    if (quotaLimit == null) {
      sets.push("quota_period = ?");
      values.push(null);
    }
  }
  if (patch.quotaPeriod !== undefined && patch.quotaPeriod !== null) {
    if (!["total", "monthly"].includes(patch.quotaPeriod)) return { error: "限额周期须为 total 或 monthly", status: 400 };
    sets.push("quota_period = ?");
    values.push(patch.quotaPeriod);
    if (patch.quotaPeriod === "monthly") {
      sets.push("quota_reset_at = ?");
      values.push(new Date().toISOString());
    }
  }
  if (patch.status !== undefined) {
    if (!["active", "suspended"].includes(patch.status)) return { error: "状态须为 active 或 suspended", status: 400 };
    sets.push("status = ?");
    values.push(patch.status);
  }
  if (patch.allowedModels !== undefined) {
    const allowed = sanitizeAllowedModels(patch.allowedModels) ?? [];
    sets.push("allowed_models = ?");
    values.push(JSON.stringify(allowed));
  }

  if (!sets.length) return { error: "没有可更新的字段", status: 400 };
  sets.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(subId);

  await db.execute(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, values);

  // 停用即踢下线（spec §5）
  if (patch.status === "suspended") {
    await deleteSessionsByUserId(subId);
  }

  const updated = await db.queryOne<User>("SELECT * FROM users WHERE id = ?", [subId]);
  return { user: updated! };
}

export async function resetSubAccountPassword(
  ownerId: string,
  subId: string,
  password: string,
  testHooks?: {
    afterPasswordUpdate?: () => Promise<void> | void;
  }
): Promise<{ error: string; status: number } | { ok: true }> {
  const passwordError = validateNewPassword(password || "");
  if (passwordError) return { error: passwordError, status: 400 };
  const preflight = await getSubAccountForOwner(ownerId, subId);
  if (!preflight) return { error: "子账号不存在", status: 404 };
  const passwordHash = await hashPasswordAsync(password);
  return db.transaction(async (tx) => {
    // The ownership check and user-row lock share the transaction with the
    // credential update and session revocation. Password logins take a shared
    // lock on this same row, so an old password cannot mint a session in the
    // update/delete gap.
    const sub = await tx.queryOne<{ id: string }>(
      `SELECT id
         FROM users
        WHERE id = ? AND parent_user_id = ? AND status != 'deleted'
        FOR UPDATE`,
      [subId, ownerId]
    );
    if (!sub) return { error: "子账号不存在", status: 404 };
    await tx.execute(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
      [passwordHash, new Date().toISOString(), subId]
    );
    if (testHooks?.afterPasswordUpdate) {
      await testHooks.afterPasswordUpdate();
    }
    await tx.execute("DELETE FROM sessions WHERE user_id = ?", [subId]);
    return { ok: true };
  });
}

/** 软删除（spec §5）：保留 usage_logs/transactions 历史；删 keys（key 无历史价值）与 sessions；释放 username */
export async function softDeleteSubAccount(
  ownerId: string,
  subId: string
): Promise<{ error: string; status: number } | { ok: true }> {
  const sub = await getSubAccountForOwner(ownerId, subId);
  if (!sub) return { error: "子账号不存在", status: 404 };
  if (sub.status !== "suspended") return { error: "请先停用子账号再删除", status: 400 };

  const now = new Date().toISOString();
  const releasedUsername = sub.username ? `${sub.username}#deleted#${Date.now()}` : null;
  await db.execute("UPDATE users SET status = 'deleted', username = ?, updated_at = ? WHERE id = ?", [
    releasedUsername,
    now,
    subId,
  ]);
  await db.execute("DELETE FROM api_keys WHERE user_id = ?", [subId]);
  await deleteSessionsByUserId(subId);
  return { ok: true };
}
