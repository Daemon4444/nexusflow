import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";

export type AdminAuditOutcome = "success" | "failure";

export interface AdminAuditEvent {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  actor_email: string | null;
  request_id: string;
  idempotency_key: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  outcome: AdminAuditOutcome;
  reason: string;
  ip_address: string | null;
  user_agent: string | null;
  before_data: unknown;
  after_data: unknown;
  metadata: unknown;
  created_at: string;
}

export interface AuditWriteClient {
  queryOne: <T = any>(sql: string, params?: any[]) => Promise<T | null>;
}

export interface AdminAuditIntent {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  actor_email: string | null;
  request_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  status: "pending" | "success" | "failure";
  reason: string;
  ip_address: string | null;
  user_agent: string | null;
  method: string;
  path: string;
  response_status: number | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const SENSITIVE_KEY =
  /(^|[_-])(authorization|cookie|password|passwd|secret|session|token|api[_-]?key|key[_-]?hash|private[_-]?key)([_-]|$)/i;
const MAX_DEPTH = 8;
const MAX_KEYS = 100;
const MAX_ARRAY = 100;
const MAX_STRING = 4096;

export function redactAuditData(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}…[truncated ${value.length - MAX_STRING} chars]`
      : value;
  }
  if (depth >= MAX_DEPTH) return "[max-depth]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((entry) => redactAuditData(entry, depth + 1));
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, MAX_KEYS)) {
      output[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactAuditData(entry, depth + 1);
    }
    return output;
  }
  return String(value);
}

export async function writeAdminAuditEvent(
  params: {
    actorUserId: string | null;
    actorRole: string | null;
    actorEmail: string | null;
    requestId: string;
    idempotencyKey?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    outcome: AdminAuditOutcome;
    reason?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    beforeData?: unknown;
    afterData?: unknown;
    metadata?: unknown;
  },
  client: AuditWriteClient = db
): Promise<AdminAuditEvent> {
  const row = await client.queryOne<AdminAuditEvent>(
    `INSERT INTO admin_audit_events (
       id, actor_user_id, actor_role, actor_email, request_id, idempotency_key,
       action, resource_type, resource_id, outcome, reason, ip_address,
       user_agent, before_data, after_data, metadata, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, NOW())
     RETURNING *`,
    [
      uuidv4(),
      params.actorUserId,
      params.actorRole,
      params.actorEmail,
      params.requestId,
      params.idempotencyKey || null,
      params.action,
      params.resourceType,
      params.resourceId || null,
      params.outcome,
      params.reason || "",
      params.ipAddress || null,
      params.userAgent || null,
      params.beforeData === undefined ? null : JSON.stringify(redactAuditData(params.beforeData)),
      params.afterData === undefined ? null : JSON.stringify(redactAuditData(params.afterData)),
      params.metadata === undefined ? null : JSON.stringify(redactAuditData(params.metadata)),
    ]
  );
  return row!;
}

export async function createAdminAuditIntent(params: {
  actorUserId: string | null;
  actorRole: string | null;
  actorEmail: string | null;
  requestId: string;
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  reason?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  method: string;
  path: string;
  metadata?: unknown;
}): Promise<AdminAuditIntent> {
  const row = await db.queryOne<AdminAuditIntent>(
    `INSERT INTO admin_audit_intents (
       id, actor_user_id, actor_role, actor_email, request_id, action,
       resource_type, resource_id, status, reason, ip_address, user_agent,
       method, path, metadata, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?::jsonb, NOW(), NOW())
     RETURNING *`,
    [
      uuidv4(),
      params.actorUserId,
      params.actorRole,
      params.actorEmail,
      params.requestId,
      params.action,
      params.resourceType || "admin_route",
      params.resourceId || null,
      params.reason || "",
      params.ipAddress || null,
      params.userAgent || null,
      params.method,
      params.path,
      params.metadata === undefined ? null : JSON.stringify(redactAuditData(params.metadata)),
    ]
  );
  return row!;
}

export async function completeAdminAuditIntent(params: {
  id: string;
  status: "success" | "failure";
  action: string;
  resourceType: string;
  resourceId?: string | null;
  reason?: string;
  responseStatus: number;
  metadata?: unknown;
}): Promise<void> {
  await db.execute(
    `UPDATE admin_audit_intents
        SET status = ?, action = ?, resource_type = ?, resource_id = ?,
            reason = ?, response_status = ?, metadata = ?::jsonb,
            updated_at = NOW(), completed_at = NOW()
      WHERE id = ? AND status = 'pending'`,
    [
      params.status,
      params.action,
      params.resourceType,
      params.resourceId || null,
      params.reason || "",
      params.responseStatus,
      params.metadata === undefined ? null : JSON.stringify(redactAuditData(params.metadata)),
      params.id,
    ]
  );
}

export async function getSuccessfulIdempotentAudit(params: {
  actorUserId: string;
  action: string;
  idempotencyKey: string;
}): Promise<AdminAuditEvent | null> {
  return db.queryOne<AdminAuditEvent>(
    `SELECT *
       FROM admin_audit_events
      WHERE actor_user_id = ? AND action = ? AND idempotency_key = ? AND outcome = 'success'
      ORDER BY created_at DESC
      LIMIT 1`,
    [params.actorUserId, params.action, params.idempotencyKey]
  );
}
