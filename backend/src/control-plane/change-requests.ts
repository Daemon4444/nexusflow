/**
 * Change requests (P6, D3/D5): the only way to change control-plane data.
 *
 *   draft → validated → approved → published      (reject from any open state)
 *
 * - Operations are entity-level upserts/deletes applied on top of the
 *   *current* version at validate and publish time (so a request prepared
 *   against an older version is rebased, then re-validated).
 * - Validation = all publish checks; only errors the change introduces
 *   block it (errors already present in the base version are reported as
 *   warnings), plus lifecycle gates, route-probe evidence for
 *   preview/active, and a price comparison with the Bailian snapshot.
 * - Approval: self-approval allowed unless NF_CP_REQUIRE_SECOND_APPROVER.
 * - Publishing inserts a new immutable version; rollback publishes an old
 *   version's content as a new version.
 */
import fs from "node:fs";
import path from "node:path";
import { db } from "../db/client";
import { requireSecondApprover } from "../config/feature-flags";
import {
  canonicalJson,
  ENTITY_COLLECTION,
  normalizeContent,
  type ControlPlaneContent,
  type CpModel,
  type EntityKind,
} from "./schema";
import { validateContent, type ValidationIssue } from "./validation";
import { displaySupportedFor } from "./capabilities";
import {
  createChangeRequest,
  getChangeRequest,
  getCurrentVersion,
  getVersion,
  insertVersion,
  transitionChangeRequest,
  type ChangeOperation,
  type ChangeRequestRecord,
} from "./store";

export class ChangeRequestError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "ChangeRequestError";
  }
}

const EMPTY_CONTENT: ControlPlaneContent = { schema_version: 1, models: [], accounts: [], pools: [], routes: [], policies: [] };

// ------------------------------------------------------------ apply / diff

export function applyOperations(base: ControlPlaneContent, operations: ChangeOperation[]): ControlPlaneContent {
  const next = JSON.parse(JSON.stringify(base)) as ControlPlaneContent;
  for (const operation of operations) {
    const collection = ENTITY_COLLECTION[operation.entity as EntityKind];
    if (!collection) throw new ChangeRequestError("invalid_operation", `unknown entity ${operation.entity}`);
    const items = next[collection] as Array<{ id: string }>;
    const index = items.findIndex((item) => item.id === operation.id);
    if (operation.op === "delete") {
      if (index < 0) throw new ChangeRequestError("invalid_operation", `${operation.entity} ${operation.id} does not exist`);
      items.splice(index, 1);
      continue;
    }
    if (operation.op !== "upsert" || !operation.value || typeof operation.value !== "object") {
      throw new ChangeRequestError("invalid_operation", `upsert of ${operation.entity} ${operation.id} needs a value`);
    }
    let value = { ...(operation.value as Record<string, unknown>), id: operation.id } as any;
    if (operation.entity === "model" && value.capabilities && value.display) {
      // Display labels are generated from the structured capabilities (P5).
      value = { ...value, display: { ...value.display, supported: displaySupportedFor(value) } };
    }
    if (index < 0) items.push(value);
    else items[index] = value;
  }
  return normalizeContent(next);
}

export interface EntityDiff {
  entity: EntityKind;
  id: string;
  change: "added" | "removed" | "changed";
  fields?: Array<{ field: string; before: unknown; after: unknown }>;
}

export function diffContents(before: ControlPlaneContent | null, after: ControlPlaneContent): EntityDiff[] {
  const out: EntityDiff[] = [];
  const left = before || EMPTY_CONTENT;
  for (const entity of Object.keys(ENTITY_COLLECTION) as EntityKind[]) {
    const key = ENTITY_COLLECTION[entity];
    const a = new Map((left[key] as Array<{ id: string }>).map((item) => [item.id, item as Record<string, unknown>]));
    const b = new Map((after[key] as Array<{ id: string }>).map((item) => [item.id, item as Record<string, unknown>]));
    for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      const x = a.get(id);
      const y = b.get(id);
      if (!x && y) out.push({ entity, id, change: "added" });
      else if (x && !y) out.push({ entity, id, change: "removed" });
      else if (x && y && canonicalJson(x) !== canonicalJson(y)) {
        const fields = [...new Set([...Object.keys(x), ...Object.keys(y)])]
          .filter((field) => canonicalJson(x[field]) !== canonicalJson(y[field]))
          .sort()
          .map((field) => ({ field, before: x[field], after: y[field] }));
        out.push({ entity, id, change: "changed", fields });
      }
    }
  }
  return out;
}

export function affectedBy(operations: ChangeOperation[]): ChangeRequestRecord["affected"] {
  const pick = (entity: string) => [...new Set(operations.filter((op) => op.entity === entity).map((op) => op.id))].sort();
  return { models: pick("model"), routes: pick("route"), accounts: pick("account") };
}

// --------------------------------------------------------------- lifecycle

const LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  draft: ["draft", "preview"],
  preview: ["preview", "draft", "active"],
  active: ["active", "deprecated"],
  deprecated: ["deprecated", "active", "retired"],
  retired: ["retired"],
};

export function lifecycleIssues(before: ControlPlaneContent | null, after: ControlPlaneContent): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const previous = new Map((before?.models || []).map((model) => [model.id, model]));
  for (const model of after.models) {
    const old = previous.get(model.id);
    if (!old) {
      // New models start as draft (or preview when promoted in the same request).
      if (!["draft", "preview"].includes(model.lifecycle)) {
        issues.push({ check: "lifecycle", entity: "model", id: model.id, message: `new models start as draft or preview, not ${model.lifecycle}` });
      }
      continue;
    }
    if (!LIFECYCLE_TRANSITIONS[old.lifecycle]?.includes(model.lifecycle)) {
      issues.push({ check: "lifecycle", entity: "model", id: model.id, message: `lifecycle ${old.lifecycle} → ${model.lifecycle} is not allowed` });
    }
    if (model.lifecycle === "deprecated" && old.lifecycle !== "deprecated" && !model.deprecation_date) {
      issues.push({ check: "lifecycle", entity: "model", id: model.id, message: "deprecation requires deprecation_date" });
    }
    if (model.lifecycle === "preview" && model.preview_user_ids.length === 0) {
      issues.push({ check: "lifecycle", entity: "model", id: model.id, message: "preview requires at least one allow-listed user" });
    }
  }
  return issues;
}

/** Models entering preview/active need a passing probe of each active route within 24h. */
export async function probeIssues(before: ControlPlaneContent | null, after: ControlPlaneContent, now = new Date()): Promise<ValidationIssue[]> {
  const previous = new Map((before?.models || []).map((model) => [model.id, model]));
  const issues: ValidationIssue[] = [];
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  for (const model of after.models) {
    const old = previous.get(model.id);
    const entering = (model.lifecycle === "preview" || model.lifecycle === "active") && old?.lifecycle !== model.lifecycle
      && !(old?.lifecycle === "deprecated" && model.lifecycle === "active");
    if (!entering) continue;
    const routes = after.routes.filter((route) => route.model_id === model.id && route.status === "active");
    for (const route of routes) {
      const rows = await db.queryMany<{ capability: string; protocol: string; ok: boolean }>(
        "SELECT capability, protocol, ok FROM cp_route_probe_results WHERE route_id = ? AND probed_at >= ? ORDER BY probed_at DESC",
        [route.id, since]
      );
      if (!rows.length) {
        issues.push({ check: "probe", entity: "route", id: route.id, message: `no probe result in the last 24h (run the route probe before ${model.lifecycle})` });
        continue;
      }
      const latest = new Map<string, boolean>();
      for (const row of rows) {
        const key = `${row.protocol}/${row.capability}`;
        if (!latest.has(key)) latest.set(key, row.ok === true);
      }
      const failed = [...latest].filter(([, ok]) => !ok).map(([key]) => key);
      if (failed.length) {
        issues.push({ check: "probe", entity: "route", id: route.id, message: `latest probes failed: ${failed.join(", ")}` });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------- price vs. snapshot

let snapshotCache: { file: string; data: any } | null = null;

function latestBailianSnapshot(): any | null {
  const dir = process.env.NF_BAILIAN_SNAPSHOT_DIR || path.resolve(__dirname, "../../../docs/upstream-sync/snapshots");
  try {
    const files = fs.readdirSync(dir).filter((name) => /^bailian-\d{4}-\d{2}-\d{2}\.snapshot\.json$/.test(name)).sort();
    const file = files.length ? path.join(dir, files[files.length - 1]) : null;
    if (!file) return null;
    if (snapshotCache?.file !== file) snapshotCache = { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
    return snapshotCache.data;
  } catch {
    return null;
  }
}

/** Warns when a changed Bailian model's price is below or differs from the official price. */
export function priceIssues(before: ControlPlaneContent | null, after: ControlPlaneContent, snapshot = latestBailianSnapshot()): ValidationIssue[] {
  if (!snapshot) return [];
  const issues: ValidationIssue[] = [];
  const previous = new Map((before?.models || []).map((model) => [model.id, model]));
  for (const model of after.models) {
    const old = previous.get(model.id);
    if (old && canonicalJson(old.pricing) === canonicalJson(model.pricing)) continue;
    const route = after.routes.find((item) => item.model_id === model.id && item.account_id === "dashscope");
    const official = snapshot.models?.[route?.upstream_model_id || model.id]?.pricing?.tiers?.[0];
    if (!official || typeof official.input !== "number") continue;
    const ours = model.pricing as CpModel["pricing"] & { promptPrice?: number; completionPrice?: number };
    if (typeof ours.promptPrice === "number" && ours.promptPrice < official.input) {
      issues.push({ check: "price_snapshot", entity: "model", id: model.id, message: `input price ${ours.promptPrice} is below the official ${official.input} (${snapshot.fetchedAt})` });
    }
    if (typeof ours.completionPrice === "number" && typeof official.output === "number" && ours.completionPrice < official.output) {
      issues.push({ check: "price_snapshot", entity: "model", id: model.id, message: `output price ${ours.completionPrice} is below the official ${official.output} (${snapshot.fetchedAt})` });
    }
  }
  return issues;
}

// ------------------------------------------------------------- validation

export interface ChangeValidation {
  ok: boolean;
  baseVersion: number | null;
  contentSha: string | null;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  diff: EntityDiff[];
  validatedAt: string;
}

const issueKey = (issue: ValidationIssue) => `${issue.check}\0${issue.entity}\0${issue.id}\0${issue.message}`;

export async function validateChange(record: Pick<ChangeRequestRecord, "changes">): Promise<{ validation: ChangeValidation; content: ControlPlaneContent | null }> {
  const current = await getCurrentVersion();
  const base = current?.content || null;
  let content: ControlPlaneContent | null = null;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  try {
    content = applyOperations(base || EMPTY_CONTENT, record.changes);
  } catch (error) {
    errors.push({ check: "schema", entity: "content", id: "operations", message: error instanceof Error ? error.message : String(error) });
  }
  if (content) {
    const result = validateContent(content);
    const existing = new Set(base ? validateContent(base).errors.map(issueKey) : []);
    for (const issue of result.errors) (existing.has(issueKey(issue)) ? warnings : errors).push(
      existing.has(issueKey(issue)) ? { ...issue, message: `(already in version ${current?.version}) ${issue.message}` } : issue
    );
    warnings.push(...result.warnings);
    errors.push(...lifecycleIssues(base, content));
    errors.push(...(await probeIssues(base, content)));
    warnings.push(...priceIssues(base, content));
  }
  const validation: ChangeValidation = {
    ok: errors.length === 0,
    baseVersion: current?.version ?? null,
    contentSha: content ? (await import("./store")).contentSha256(content) : null,
    errors,
    warnings,
    diff: content ? diffContents(base, content) : [],
    validatedAt: new Date().toISOString(),
  };
  return { validation, content };
}

// ---------------------------------------------------------------- workflow

export async function openChangeRequest(params: {
  title: string;
  reason?: string | null;
  changes: ChangeOperation[];
  author: string;
  source?: string;
}): Promise<ChangeRequestRecord> {
  if (!params.title?.trim()) throw new ChangeRequestError("title_required", "a title is required");
  if (!Array.isArray(params.changes) || params.changes.length === 0) throw new ChangeRequestError("changes_required", "at least one change is required");
  for (const change of params.changes) {
    if (!change || !["upsert", "delete"].includes(change.op) || !(change.entity in ENTITY_COLLECTION) || typeof change.id !== "string" || !change.id) {
      throw new ChangeRequestError("invalid_operation", "each change needs op (upsert|delete), entity and id");
    }
  }
  const current = await getCurrentVersion();
  return createChangeRequest({
    title: params.title.trim(),
    reason: params.reason ?? null,
    changes: params.changes,
    baseVersion: current?.version ?? null,
    affected: affectedBy(params.changes),
    author: params.author,
    source: params.source,
  });
}

async function mustGet(id: string): Promise<ChangeRequestRecord> {
  const record = await getChangeRequest(id);
  if (!record) throw new ChangeRequestError("change_request_not_found", "change request not found", 404);
  return record;
}

export async function runValidation(id: string): Promise<ChangeRequestRecord> {
  const record = await mustGet(id);
  if (!["draft", "validated", "approved"].includes(record.status)) {
    throw new ChangeRequestError("invalid_state", `cannot validate a ${record.status} change request`, 409);
  }
  const { validation } = await validateChange(record);
  // A failed validation (or a re-validation after the base moved) returns it to draft.
  const to = validation.ok ? "validated" : "draft";
  await transitionChangeRequest(id, [record.status], to, { validation, baseVersion: validation.baseVersion });
  return mustGet(id);
}

export async function approve(id: string, approver: string): Promise<ChangeRequestRecord> {
  const record = await mustGet(id);
  if (record.status !== "validated") throw new ChangeRequestError("invalid_state", "only validated change requests can be approved", 409);
  if (requireSecondApprover() && record.author === approver) {
    throw new ChangeRequestError("second_approver_required", "NF_CP_REQUIRE_SECOND_APPROVER is on: another administrator must approve", 403);
  }
  if (!(await transitionChangeRequest(id, ["validated"], "approved", { approver }))) {
    throw new ChangeRequestError("invalid_state", "change request moved; reload", 409);
  }
  return mustGet(id);
}

export async function reject(id: string, actor: string, reason: string): Promise<ChangeRequestRecord> {
  const record = await mustGet(id);
  if (!["draft", "validated", "approved"].includes(record.status)) {
    throw new ChangeRequestError("invalid_state", `cannot reject a ${record.status} change request`, 409);
  }
  await transitionChangeRequest(id, [record.status], "rejected", { rejectedBy: actor, rejectReason: reason });
  return mustGet(id);
}

export async function publish(id: string, actor: string): Promise<{ record: ChangeRequestRecord; version: number }> {
  const record = await mustGet(id);
  if (record.status !== "approved") throw new ChangeRequestError("invalid_state", "only approved change requests can be published", 409);
  // Re-validate on top of the version that is current right now.
  const { validation, content } = await validateChange(record);
  if (!validation.ok || !content) {
    await transitionChangeRequest(id, ["approved"], "draft", { validation, baseVersion: validation.baseVersion });
    throw new ChangeRequestError("validation_failed", "validation failed against the current version; the change request returned to draft", 409);
  }
  const version = await insertVersion({
    content,
    expectedParent: validation.baseVersion,
    kind: "publish",
    publishedBy: actor,
    changeRequestId: id,
    note: record.title,
    onInserted: async (tx, number) => {
      const moved = await transitionChangeRequest(id, ["approved"], "published", { publishedVersion: number, validation }, tx);
      if (!moved) throw new ChangeRequestError("invalid_state", "change request moved during publish", 409);
    },
  });
  return { record: await mustGet(id), version: version.version };
}

export async function rollbackTo(targetVersion: number, actor: string, reason: string): Promise<number> {
  const target = await getVersion(targetVersion);
  if (!target) throw new ChangeRequestError("version_not_found", `version ${targetVersion} does not exist`, 404);
  const current = await getCurrentVersion();
  if (current && current.version === targetVersion) throw new ChangeRequestError("already_current", "that version is already current", 409);
  const version = await insertVersion({
    content: target.content,
    expectedParent: current?.version ?? null,
    kind: "rollback",
    publishedBy: actor,
    note: `rollback to v${targetVersion}: ${reason}`,
  });
  return version.version;
}

export async function diffVersions(from: number, to: number): Promise<EntityDiff[]> {
  const [a, b] = await Promise.all([getVersion(from), getVersion(to)]);
  if (!a || !b) throw new ChangeRequestError("version_not_found", "version not found", 404);
  return diffContents(a.content, b.content);
}
