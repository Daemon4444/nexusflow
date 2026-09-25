/**
 * Control-plane repository. The only writer of cp_* tables.
 *
 * - cp_config_versions: immutable published snapshots; the runtime reads the
 *   highest version only.
 * - cp_models / cp_upstream_accounts / cp_quota_pools / cp_routes /
 *   cp_traffic_policies: a materialized copy of the current version for
 *   admin listing and SQL inspection; rewritten in the same transaction as
 *   the version insert.
 */
import { createHash, randomUUID } from "crypto";
import { db } from "../db/client";
import {
  canonicalJson,
  controlPlaneContentSchema,
  normalizeContent,
  type ControlPlaneContent,
  type ControlPlaneVersion,
} from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function contentSha256(content: ControlPlaneContent): string {
  return createHash("sha256").update(canonicalJson(normalizeContent(content))).digest("hex");
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function parseJson<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function rowToVersion(row: any): ControlPlaneVersion {
  return {
    version: Number(row.version),
    content: controlPlaneContentSchema.parse(parseJson(row.content)),
    contentSha256: row.content_sha256,
    publishedAt: toIso(row.published_at),
    publishedBy: row.published_by,
    parentVersion: row.parent_version === null || row.parent_version === undefined ? null : Number(row.parent_version),
  };
}

export async function getCurrentVersionNumber(): Promise<number | null> {
  const row = await db.queryOne<{ version: number | null }>("SELECT MAX(version) AS version FROM cp_config_versions");
  return row?.version === null || row?.version === undefined ? null : Number(row.version);
}

export async function getCurrentVersion(): Promise<ControlPlaneVersion | null> {
  const row = await db.queryOne("SELECT * FROM cp_config_versions ORDER BY version DESC LIMIT 1");
  return row ? rowToVersion(row) : null;
}

export async function getVersion(version: number): Promise<ControlPlaneVersion | null> {
  const row = await db.queryOne("SELECT * FROM cp_config_versions WHERE version = ?", [version]);
  return row ? rowToVersion(row) : null;
}

export interface VersionSummary {
  version: number;
  contentSha256: string;
  parentVersion: number | null;
  changeRequestId: string | null;
  kind: string;
  note: string | null;
  publishedBy: string;
  publishedAt: string;
}

export async function listVersions(limit = 50): Promise<VersionSummary[]> {
  const rows = await db.queryMany<any>(
    `SELECT version, content_sha256, parent_version, change_request_id, kind, note, published_by, published_at
       FROM cp_config_versions ORDER BY version DESC LIMIT ?`,
    [Math.max(1, Math.min(500, limit))]
  );
  return rows.map((row) => ({
    version: Number(row.version),
    contentSha256: row.content_sha256,
    parentVersion: row.parent_version === null ? null : Number(row.parent_version),
    changeRequestId: row.change_request_id ?? null,
    kind: row.kind,
    note: row.note ?? null,
    publishedBy: row.published_by,
    publishedAt: toIso(row.published_at),
  }));
}

export class VersionConflictError extends Error {
  constructor(readonly expected: number | null, readonly actual: number | null) {
    super(`control-plane version moved from ${expected ?? "none"} to ${actual ?? "none"}; re-validate and retry`);
    this.name = "VersionConflictError";
  }
}

async function materialize(tx: Tx, content: ControlPlaneContent, actor: string): Promise<void> {
  // Children first so foreign keys never dangle.
  const keep = (items: Array<{ id: string }>) => items.map((item) => item.id);
  // The entity tables are a projection of the version; rows absent from it
  // are removed one by one (portable across PostgreSQL and pg-mem).
  const deleteMissing = async (table: string, ids: string[]) => {
    const wanted = new Set(ids);
    const existing = await tx.query<{ id: string }>(`SELECT id FROM ${table}`);
    for (const row of existing.rows) {
      if (!wanted.has(row.id)) await tx.execute(`DELETE FROM ${table} WHERE id = ?`, [row.id]);
    }
  };
  await deleteMissing("cp_routes", keep(content.routes));
  await deleteMissing("cp_quota_pools", keep(content.pools));
  await deleteMissing("cp_upstream_accounts", keep(content.accounts));
  await deleteMissing("cp_models", keep(content.models));
  await deleteMissing("cp_traffic_policies", keep(content.policies));

  for (const model of content.models) {
    await tx.execute(
      `INSERT INTO cp_models (id, lifecycle, display, limits, pricing, protocols, capabilities, param_overrides,
                              preview_user_ids, replacement_model_id, deprecation_date, updated_at, updated_by)
       VALUES (?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, NOW(), ?)
       ON CONFLICT (id) DO UPDATE SET lifecycle = EXCLUDED.lifecycle, display = EXCLUDED.display,
         limits = EXCLUDED.limits, pricing = EXCLUDED.pricing, protocols = EXCLUDED.protocols,
         capabilities = EXCLUDED.capabilities, param_overrides = EXCLUDED.param_overrides,
         preview_user_ids = EXCLUDED.preview_user_ids, replacement_model_id = EXCLUDED.replacement_model_id,
         deprecation_date = EXCLUDED.deprecation_date, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [
        model.id, model.lifecycle, JSON.stringify(model.display), JSON.stringify(model.limits),
        JSON.stringify(model.pricing),
        JSON.stringify({ exposed: model.protocols, legacy_bridged: model.legacy_bridged_protocols || [] }),
        JSON.stringify(model.capabilities),
        model.param_overrides ? JSON.stringify(model.param_overrides) : null,
        JSON.stringify(model.preview_user_ids), model.replacement_model_id ?? null, model.deprecation_date ?? null, actor,
      ]
    );
  }
  for (const account of content.accounts) {
    await tx.execute(
      `INSERT INTO cp_upstream_accounts (id, vendor, adapter, base_url, native_base_url, anthropic_base_url, auth_scheme,
         secret_ref, region, is_relay, relay_operator, data_path, quota, quota_source, quota_verified_at, status, owner,
         contract_ref, contact, legacy_provider_id, legacy_channel_id, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
       ON CONFLICT (id) DO UPDATE SET vendor = EXCLUDED.vendor, adapter = EXCLUDED.adapter, base_url = EXCLUDED.base_url,
         native_base_url = EXCLUDED.native_base_url, anthropic_base_url = EXCLUDED.anthropic_base_url,
         auth_scheme = EXCLUDED.auth_scheme, secret_ref = EXCLUDED.secret_ref, region = EXCLUDED.region,
         is_relay = EXCLUDED.is_relay, relay_operator = EXCLUDED.relay_operator, data_path = EXCLUDED.data_path,
         quota = EXCLUDED.quota, quota_source = EXCLUDED.quota_source, quota_verified_at = EXCLUDED.quota_verified_at,
         status = EXCLUDED.status, owner = EXCLUDED.owner, contract_ref = EXCLUDED.contract_ref, contact = EXCLUDED.contact,
         legacy_provider_id = EXCLUDED.legacy_provider_id, legacy_channel_id = EXCLUDED.legacy_channel_id,
         updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [
        account.id, account.vendor, account.adapter, account.base_url, account.native_base_url, account.anthropic_base_url,
        account.auth_scheme, account.secret_ref, account.region, account.is_relay, account.relay_operator, account.data_path,
        JSON.stringify(account.quota), account.quota_source, account.quota_verified_at, account.status, account.owner,
        account.contract_ref, account.contact, account.legacy_provider_id, account.legacy_channel_id, actor,
      ]
    );
  }
  for (const pool of content.pools) {
    await tx.execute(
      `INSERT INTO cp_quota_pools (id, account_id, name, rpm, tpm, concurrency, daily, source, verified_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON CONFLICT (id) DO UPDATE SET account_id = EXCLUDED.account_id, name = EXCLUDED.name, rpm = EXCLUDED.rpm,
         tpm = EXCLUDED.tpm, concurrency = EXCLUDED.concurrency, daily = EXCLUDED.daily, source = EXCLUDED.source,
         verified_at = EXCLUDED.verified_at, updated_at = NOW()`,
      [pool.id, pool.account_id, pool.name, pool.rpm, pool.tpm, pool.concurrency, pool.daily, pool.source, pool.verified_at]
    );
  }
  for (const route of content.routes) {
    await tx.execute(
      `INSERT INTO cp_routes (id, model_id, account_id, upstream_model_id, native_protocols, priority, weight,
         quota_pool_id, rpm, tpm, concurrency, daily, status, updated_at)
       VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON CONFLICT (id) DO UPDATE SET model_id = EXCLUDED.model_id, account_id = EXCLUDED.account_id,
         upstream_model_id = EXCLUDED.upstream_model_id, native_protocols = EXCLUDED.native_protocols,
         priority = EXCLUDED.priority, weight = EXCLUDED.weight, quota_pool_id = EXCLUDED.quota_pool_id,
         rpm = EXCLUDED.rpm, tpm = EXCLUDED.tpm, concurrency = EXCLUDED.concurrency, daily = EXCLUDED.daily,
         status = EXCLUDED.status, updated_at = NOW()`,
      [
        route.id, route.model_id, route.account_id, route.upstream_model_id, JSON.stringify(route.native_protocols),
        route.priority, route.weight, route.quota_pool_id, route.rpm, route.tpm, route.concurrency, route.daily, route.status,
      ]
    );
  }
  for (const policy of content.policies) {
    await tx.execute(
      `INSERT INTO cp_traffic_policies (id, scope, user_default, fair_share, overflow, circuit, updated_at)
       VALUES (?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET scope = EXCLUDED.scope, user_default = EXCLUDED.user_default,
         fair_share = EXCLUDED.fair_share, overflow = EXCLUDED.overflow, circuit = EXCLUDED.circuit, updated_at = NOW()`,
      [
        policy.id, policy.scope,
        policy.user_default ? JSON.stringify(policy.user_default) : null,
        policy.fair_share ? JSON.stringify(policy.fair_share) : null,
        policy.overflow ? JSON.stringify(policy.overflow) : null,
        policy.circuit ? JSON.stringify(policy.circuit) : null,
      ]
    );
  }
}

/**
 * Inserts a new immutable version (current + 1) and materializes it.
 * `expectedParent` guards against concurrent publishes: when another
 * version was published meanwhile, VersionConflictError is thrown and
 * nothing is written.
 */
export async function insertVersion(params: {
  content: ControlPlaneContent;
  expectedParent: number | null;
  kind: "backfill" | "publish" | "rollback";
  publishedBy: string;
  changeRequestId?: string | null;
  note?: string | null;
  onInserted?: (tx: Tx, version: number) => Promise<void>;
}): Promise<ControlPlaneVersion> {
  const content = normalizeContent(controlPlaneContentSchema.parse(params.content));
  const sha = contentSha256(content);
  return db.transaction(async (tx) => {
    const row = await tx.queryOne<{ version: number | null }>("SELECT MAX(version) AS version FROM cp_config_versions");
    const current = row?.version === null || row?.version === undefined ? null : Number(row.version);
    if (current !== params.expectedParent) throw new VersionConflictError(params.expectedParent, current);
    const version = (current ?? 0) + 1;
    // A concurrent insert of the same version number fails on the primary key.
    await tx.execute(
      `INSERT INTO cp_config_versions (version, content, content_sha256, parent_version, change_request_id, kind, note, published_by, published_at)
       VALUES (?, ?::jsonb, ?, ?, ?, ?, ?, ?, NOW())`,
      [version, JSON.stringify(content), sha, current, params.changeRequestId ?? null, params.kind, params.note ?? null, params.publishedBy]
    );
    await materialize(tx, content, params.publishedBy);
    if (params.onInserted) await params.onInserted(tx, version);
    return {
      version,
      content,
      contentSha256: sha,
      publishedAt: new Date().toISOString(),
      publishedBy: params.publishedBy,
      parentVersion: current,
    };
  });
}

// ------------------------------------------------------- change requests

export type ChangeRequestStatus = "draft" | "validated" | "approved" | "published" | "rejected";

export interface ChangeOperation {
  op: "upsert" | "delete";
  entity: "model" | "account" | "pool" | "route" | "policy";
  id: string;
  /** Full entity for upsert (validated against the entity schema). */
  value?: unknown;
}

export interface ChangeRequestRecord {
  id: string;
  status: ChangeRequestStatus;
  title: string;
  reason: string | null;
  changes: ChangeOperation[];
  baseVersion: number | null;
  validation: unknown;
  affected: { models?: string[]; routes?: string[]; accounts?: string[] };
  author: string;
  approver: string | null;
  rejectedBy: string | null;
  rejectReason: string | null;
  publishedVersion: number | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

function rowToChangeRequest(row: any): ChangeRequestRecord {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    reason: row.reason ?? null,
    changes: parseJson<ChangeOperation[]>(row.changes) || [],
    baseVersion: row.base_version === null || row.base_version === undefined ? null : Number(row.base_version),
    validation: row.validation ? parseJson(row.validation) : null,
    affected: parseJson(row.affected) || {},
    author: row.author,
    approver: row.approver ?? null,
    rejectedBy: row.rejected_by ?? null,
    rejectReason: row.reject_reason ?? null,
    publishedVersion: row.published_version === null || row.published_version === undefined ? null : Number(row.published_version),
    source: row.source,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function createChangeRequest(params: {
  title: string;
  reason?: string | null;
  changes: ChangeOperation[];
  baseVersion: number | null;
  affected: ChangeRequestRecord["affected"];
  author: string;
  source?: string;
}): Promise<ChangeRequestRecord> {
  const id = `cr_${randomUUID()}`;
  await db.execute(
    `INSERT INTO cp_change_requests (id, status, title, reason, changes, base_version, affected, author, source, created_at, updated_at)
     VALUES (?, 'draft', ?, ?, ?::jsonb, ?, ?::jsonb, ?, ?, NOW(), NOW())`,
    [id, params.title, params.reason ?? null, JSON.stringify(params.changes), params.baseVersion, JSON.stringify(params.affected), params.author, params.source || "admin"]
  );
  return (await getChangeRequest(id))!;
}

export async function getChangeRequest(id: string): Promise<ChangeRequestRecord | null> {
  const row = await db.queryOne("SELECT * FROM cp_change_requests WHERE id = ?", [id]);
  return row ? rowToChangeRequest(row) : null;
}

export async function listChangeRequests(status?: ChangeRequestStatus, limit = 100): Promise<ChangeRequestRecord[]> {
  const rows = status
    ? await db.queryMany("SELECT * FROM cp_change_requests WHERE status = ? ORDER BY created_at DESC LIMIT ?", [status, limit])
    : await db.queryMany("SELECT * FROM cp_change_requests ORDER BY created_at DESC LIMIT ?", [limit]);
  return rows.map(rowToChangeRequest);
}

/** Compare-and-set status transition; returns false when the row moved. */
export async function transitionChangeRequest(
  id: string,
  from: ChangeRequestStatus[],
  to: ChangeRequestStatus,
  fields: Partial<{ validation: unknown; approver: string; rejectedBy: string; rejectReason: string; publishedVersion: number; baseVersion: number | null }> = {},
  tx?: Tx
): Promise<boolean> {
  const sets = ["status = ?", "updated_at = NOW()"];
  const params: unknown[] = [to];
  if (fields.validation !== undefined) { sets.push("validation = ?::jsonb"); params.push(JSON.stringify(fields.validation)); }
  if (fields.approver !== undefined) { sets.push("approver = ?"); params.push(fields.approver); }
  if (fields.rejectedBy !== undefined) { sets.push("rejected_by = ?"); params.push(fields.rejectedBy); }
  if (fields.rejectReason !== undefined) { sets.push("reject_reason = ?"); params.push(fields.rejectReason); }
  if (fields.publishedVersion !== undefined) { sets.push("published_version = ?"); params.push(fields.publishedVersion); }
  if (fields.baseVersion !== undefined) { sets.push("base_version = ?"); params.push(fields.baseVersion); }
  const sql = `UPDATE cp_change_requests SET ${sets.join(", ")} WHERE id = ? AND status IN (${from.map(() => "?").join(", ")})`;
  const values = [...params, id, ...from];
  const changed = tx ? await tx.execute(sql, values) : await db.execute(sql, values);
  return changed > 0;
}
