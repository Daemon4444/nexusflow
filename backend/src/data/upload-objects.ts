import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";

export type UploadObjectRow = {
  id: string;
  object_key: string;
  owner_identity: string;
  user_id: string | null;
  api_key_id: string | null;
  storage: "oss" | "local";
  size_bytes: number | string;
  content_type: string;
  status: "active" | "delete_pending" | "delete_failed" | "deleted";
  expires_at: string;
  delete_attempts: number;
  next_cleanup_at: string | null;
  cleanup_lease_until: string | null;
  last_error: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type UploadObjectTestHooks = {
  beforeInsert?: () => Promise<void> | void;
};
let testHooks: UploadObjectTestHooks = {};

export function setUploadObjectTestHooks(hooks: UploadObjectTestHooks): void {
  testHooks = hooks;
}

export function getUploadRetentionDays(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.UPLOAD_RETENTION_DAYS || 7);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 365 ? parsed : 7;
}

export async function registerUploadObject(params: {
  objectKey: string;
  ownerIdentity: string;
  userId?: string | null;
  apiKeyId?: string | null;
  storage: "oss" | "local";
  sizeBytes: number;
  contentType: string;
}): Promise<UploadObjectRow> {
  await testHooks.beforeInsert?.();
  const expiresAt = new Date(
    Date.now() + getUploadRetentionDays() * 24 * 60 * 60 * 1000
  ).toISOString();
  const row = await db.queryOne<UploadObjectRow>(
    `INSERT INTO upload_objects (
       id, object_key, owner_identity, user_id, api_key_id, storage,
       size_bytes, content_type, status, expires_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())
     RETURNING *`,
    [
      uuidv4(),
      params.objectKey,
      params.ownerIdentity,
      params.userId || null,
      params.apiKeyId || null,
      params.storage,
      params.sizeBytes,
      params.contentType,
      expiresAt,
    ]
  );
  return row!;
}

export async function claimExpiredUploadObjects(
  limit = 25
): Promise<UploadObjectRow[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const lockClause = process.env.USE_PG_MEM === "true"
    ? ""
    : "FOR UPDATE SKIP LOCKED";
  return db.transaction(async (tx) => {
    const candidates = await tx.query<UploadObjectRow>(
      `SELECT *
         FROM upload_objects
        WHERE status IN ('active', 'delete_failed')
          AND expires_at <= NOW()
          AND (next_cleanup_at IS NULL OR next_cleanup_at <= NOW())
          AND (cleanup_lease_until IS NULL OR cleanup_lease_until < NOW())
        ORDER BY expires_at ASC
        LIMIT ?
        ${lockClause}`,
      [safeLimit]
    );
    if (candidates.rows.length === 0) return [];
    const leaseUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const claimed: UploadObjectRow[] = [];
    for (const candidate of candidates.rows) {
      const row = await tx.queryOne<UploadObjectRow>(
        `UPDATE upload_objects
            SET status = 'delete_pending', cleanup_lease_until = ?,
                updated_at = NOW()
          WHERE id = ?
            AND status IN ('active', 'delete_failed')
            AND (cleanup_lease_until IS NULL OR cleanup_lease_until < NOW())
          RETURNING *`,
        [leaseUntil, candidate.id]
      );
      if (row) claimed.push(row);
    }
    return claimed;
  });
}

export async function markUploadObjectDeleted(id: string): Promise<void> {
  await db.execute(
    `UPDATE upload_objects
        SET status = 'deleted', deleted_at = NOW(), cleanup_lease_until = NULL,
            last_error = NULL, updated_at = NOW()
      WHERE id = ? AND status = 'delete_pending'`,
    [id]
  );
}

export async function markUploadObjectCleanupFailed(
  row: UploadObjectRow,
  error: unknown
): Promise<void> {
  const attempts = Number(row.delete_attempts || 0) + 1;
  const retrySeconds = Math.min(24 * 60 * 60, 30 * 2 ** Math.min(attempts, 10));
  await db.execute(
    `UPDATE upload_objects
        SET status = 'delete_failed', delete_attempts = ?,
            next_cleanup_at = ?, cleanup_lease_until = NULL,
            last_error = ?, updated_at = NOW()
      WHERE id = ? AND status = 'delete_pending'`,
    [
      attempts,
      new Date(Date.now() + retrySeconds * 1000).toISOString(),
      (error instanceof Error ? error.message : String(error)).slice(0, 1000),
      row.id,
    ]
  );
}

