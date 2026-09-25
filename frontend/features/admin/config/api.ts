import { adminGet, adminPost, appendQuery } from "../client";

export type EntityKind = "model" | "account" | "pool" | "route" | "policy";
export type ChangeStatus = "draft" | "validated" | "approved" | "published" | "rejected";

export interface ChangeOperation {
  op: "upsert" | "delete";
  entity: EntityKind;
  id: string;
  value?: Record<string, unknown>;
}

export interface ValidationIssue {
  check: string;
  entity: string;
  id: string;
  message: string;
}

export interface EntityDiff {
  entity: EntityKind;
  id: string;
  change: "added" | "removed" | "changed";
  fields?: Array<{ field: string; before: unknown; after: unknown }>;
}

export interface ChangeRequest {
  id: string;
  status: ChangeStatus;
  title: string;
  reason: string | null;
  changes: ChangeOperation[];
  baseVersion: number | null;
  validation: { ok: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[]; diff: EntityDiff[]; baseVersion: number | null } | null;
  affected: { models?: string[]; routes?: string[]; accounts?: string[] };
  author: string;
  approver: string | null;
  rejectedBy: string | null;
  rejectReason: string | null;
  publishedVersion: number | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  diff?: EntityDiff[] | null;
  applyError?: string | null;
  currentVersion?: number | null;
}

export interface ConfigContent {
  schema_version: 1;
  models: Array<Record<string, any> & { id: string }>;
  accounts: Array<Record<string, any> & { id: string }>;
  pools: Array<Record<string, any> & { id: string }>;
  routes: Array<Record<string, any> & { id: string }>;
  policies: Array<Record<string, any> & { id: string }>;
}

export interface ConfigVersion {
  version: number;
  content: ConfigContent;
  contentSha256: string;
  publishedAt: string;
  publishedBy: string;
  parentVersion: number | null;
}

export interface VersionSummary {
  version: number;
  contentSha256?: string;
  kind?: string;
  note?: string | null;
  publishedAt?: string;
  publishedBy?: string;
  changeRequestId?: string | null;
  parentVersion?: number | null;
}

export interface ConfigState {
  flags: Record<string, unknown>;
  currentVersion: { version: number; publishedAt: string; publishedBy: string; sha256: string } | null;
  loadedVersion: number | null;
  counts: Record<string, number> | null;
}

const BASE = "/api/admin/control-plane/config";

export const configApi = {
  state: (signal?: AbortSignal) => adminGet<ConfigState>(`${BASE}/state`, signal),
  current: (signal?: AbortSignal) => adminGet<ConfigVersion | null>(`${BASE}/current`, signal),
  changeRequests: (status: ChangeStatus | undefined, signal?: AbortSignal) =>
    adminGet<ChangeRequest[]>(appendQuery(`${BASE}/change-requests`, { status }), signal),
  changeRequest: (id: string, signal?: AbortSignal) => adminGet<ChangeRequest>(`${BASE}/change-requests/${encodeURIComponent(id)}`, signal),
  create: (body: { title: string; reason: string; changes: ChangeOperation[] }) => adminPost<ChangeRequest>(`${BASE}/change-requests`, body),
  action: (id: string, action: "validate" | "approve" | "publish" | "reject" | "probe", reason?: string) =>
    adminPost<unknown>(`${BASE}/change-requests/${encodeURIComponent(id)}/${action}`, reason ? { reason } : {}),
  versions: (signal?: AbortSignal) => adminGet<VersionSummary[]>(`${BASE}/versions`, signal),
  versionDiff: (from: number, to: number, signal?: AbortSignal) =>
    adminGet<EntityDiff[]>(appendQuery(`${BASE}/versions/diff`, { from, to }), signal),
  rollback: (version: number, reason: string) => adminPost<{ version: number }>(`${BASE}/versions/${version}/rollback`, { reason }),
  probeResults: (route: string | undefined, signal?: AbortSignal) =>
    adminGet<Array<Record<string, any>>>(appendQuery(`${BASE}/probe-results`, { route }), signal),
  bailianReport: (signal?: AbortSignal) => adminGet<{ file: string; report: any } | null>(`${BASE}/bailian-report`, signal),
};
