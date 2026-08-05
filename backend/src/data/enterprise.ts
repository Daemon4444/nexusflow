import { randomUUID } from "node:crypto";
import { db } from "../db/client";

export type OrganizationRole = "owner" | "admin" | "billing" | "developer" | "viewer";
export type ProjectEnvironment = "production" | "sandbox" | "customer";
export type ProjectPrincipalType = "member" | "service_account";
export type ProjectPrincipalRole = "owner" | "manager" | "developer" | "viewer";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  status: string;
  plan: string;
  billingMode: string;
  resellerEnabled: boolean;
  brandName: string | null;
  customDomain: string | null;
  role: OrganizationRole;
  memberCount: number;
  offerCount: number;
  createdAt: string;
}

export interface OrganizationProject {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description: string;
  environment: ProjectEnvironment;
  status: string;
  monthlyBudget: number | null;
  modelScope: string[];
  region: string;
  slaTier: string;
  rpmLimit: number;
  tpmLimit: number;
  principalCount: number;
  createdAt: string;
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,47}$/;

function dateValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function validateOrganizationSlug(value: string): string | null {
  return SLUG_PATTERN.test(value) ? null : "企业标识须为 3-48 位小写字母、数字或连字符";
}

export async function listOrganizationsForUser(userId: string): Promise<OrganizationSummary[]> {
  const rows = await db.queryMany<any>(
    `SELECT o.*, m.role, COALESCE(mc.member_count, 0)::int AS member_count,
            COALESCE(oc.offer_count, 0)::int AS offer_count
       FROM organizations o
       JOIN organization_members m ON m.organization_id = o.id
       LEFT JOIN (
         SELECT organization_id, COUNT(*) AS member_count
           FROM organization_members WHERE status = 'active' GROUP BY organization_id
       ) mc ON mc.organization_id = o.id
       LEFT JOIN (
         SELECT organization_id, COUNT(*) AS offer_count
           FROM organization_offers WHERE status != 'archived' GROUP BY organization_id
       ) oc ON oc.organization_id = o.id
      WHERE m.user_id = ? AND m.status = 'active' AND o.status != 'closed'
      ORDER BY o.created_at ASC`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    legalName: row.legal_name || null,
    status: row.status,
    plan: row.plan,
    billingMode: row.billing_mode,
    resellerEnabled: !!row.reseller_enabled,
    brandName: row.brand_name || null,
    customDomain: row.custom_domain || null,
    role: row.role,
    memberCount: Number(row.member_count || 0),
    offerCount: Number(row.offer_count || 0),
    createdAt: dateValue(row.created_at),
  }));
}

export async function listAdminOrganizations() {
  const rows = await db.queryMany<any>(
    `SELECT o.*, u.nickname AS owner_nickname, u.email AS owner_email, u.phone AS owner_phone,
            COALESCE(mc.member_count, 0)::int AS member_count,
            COALESCE(oc.offer_count, 0)::int AS offer_count
       FROM organizations o
       JOIN users u ON u.id = o.owner_user_id
       LEFT JOIN (
         SELECT organization_id, COUNT(*) AS member_count
           FROM organization_members WHERE status = 'active' GROUP BY organization_id
       ) mc ON mc.organization_id = o.id
       LEFT JOIN (
         SELECT organization_id, COUNT(*) AS offer_count
           FROM organization_offers WHERE status != 'archived' GROUP BY organization_id
       ) oc ON oc.organization_id = o.id
      ORDER BY o.created_at DESC
      LIMIT 500`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    owner: row.owner_nickname || row.owner_email || row.owner_phone || row.owner_user_id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    plan: row.plan,
    billingMode: row.billing_mode,
    resellerEnabled: !!row.reseller_enabled,
    memberCount: Number(row.member_count || 0),
    offerCount: Number(row.offer_count || 0),
    createdAt: dateValue(row.created_at),
  }));
}

export async function createOrganization(params: {
  ownerUserId: string;
  name: string;
  slug?: string;
  legalName?: string | null;
}): Promise<{ organization: OrganizationSummary } | { error: string; status: number }> {
  const name = params.name.trim().slice(0, 80);
  if (name.length < 2) return { error: "企业名称至少 2 个字符", status: 400 };
  const slug = normalizeSlug(params.slug || name);
  const slugError = validateOrganizationSlug(slug);
  if (slugError) return { error: slugError, status: 400 };

  const now = new Date().toISOString();
  const id = randomUUID();
  try {
    await db.transaction(async (tx) => {
      const owner = await tx.queryOne<{ id: string; parent_user_id: string | null; status: string }>(
        "SELECT id, parent_user_id, status FROM users WHERE id = ? FOR SHARE",
        [params.ownerUserId]
      );
      if (!owner || owner.status !== "active") throw new Error("owner_unavailable");
      if (owner.parent_user_id) throw new Error("sub_account_forbidden");
      await tx.execute(
        `INSERT INTO organizations
          (id, owner_user_id, name, slug, legal_name, status, plan, billing_mode,
           reseller_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', 'team', 'shared_balance', FALSE, ?, ?)`,
        [id, params.ownerUserId, name, slug, params.legalName?.trim() || null, now, now]
      );
      await tx.execute(
        `INSERT INTO organization_members
          (organization_id, user_id, role, status, invited_by, joined_at, created_at, updated_at)
         VALUES (?, ?, 'owner', 'active', ?, ?, ?, ?)`,
        [id, params.ownerUserId, params.ownerUserId, now, now, now]
      );
    });
  } catch (error: any) {
    if (error?.code === "23505") return { error: "企业标识已被占用", status: 409 };
    if (error instanceof Error && error.message === "sub_account_forbidden") {
      return { error: "子账号不能创建企业", status: 403 };
    }
    if (error instanceof Error && error.message === "owner_unavailable") {
      return { error: "当前账号不可用", status: 403 };
    }
    throw error;
  }
  const organization = (await listOrganizationsForUser(params.ownerUserId)).find((item) => item.id === id)!;
  return { organization };
}

export async function getOrganizationAccess(organizationId: string, userId: string) {
  return db.queryOne<{ role: OrganizationRole; status: string }>(
    `SELECT role, status FROM organization_members
      WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
    [organizationId, userId]
  );
}

export async function listOrganizationMembers(organizationId: string) {
  const rows = await db.queryMany<any>(
    `SELECT m.user_id, m.role, m.status, m.joined_at, m.created_at,
            u.nickname, u.email, u.phone, u.username
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ?
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at ASC`,
    [organizationId]
  );
  return rows.map((row) => ({
    userId: row.user_id,
    role: row.role,
    status: row.status,
    nickname: row.nickname,
    email: row.email || null,
    phone: row.phone || null,
    username: row.username || null,
    joinedAt: row.joined_at ? dateValue(row.joined_at) : null,
    createdAt: dateValue(row.created_at),
  }));
}

export async function listOrganizationServiceAccounts(organizationId: string) {
  const rows = await db.queryMany<any>(
    `SELECT u.id, u.username, u.nickname, u.status, u.quota_limit, u.quota_used,
            u.quota_period, u.allowed_models, u.created_at,
            COALESCE(k.key_count, 0)::int AS key_count, k.last_active
       FROM organizations o
       JOIN users u ON u.parent_user_id = o.owner_user_id AND u.status != 'deleted'
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS key_count, MAX(last_used) AS last_active
           FROM api_keys GROUP BY user_id
       ) k ON k.user_id = u.id
      WHERE o.id = ?
      ORDER BY u.created_at ASC`,
    [organizationId]
  );
  return rows.map((row) => ({
    id: row.id,
    username: row.username || null,
    nickname: row.nickname,
    status: row.status,
    quotaLimit: row.quota_limit === null ? null : Number(row.quota_limit),
    quotaUsed: Number(row.quota_used || 0),
    quotaPeriod: row.quota_period || null,
    allowedModels: parseJsonArray(row.allowed_models),
    keyCount: Number(row.key_count || 0),
    lastActive: row.last_active ? dateValue(row.last_active) : null,
    createdAt: dateValue(row.created_at),
  }));
}

export async function addOrganizationMember(params: {
  organizationId: string;
  actorUserId: string;
  identity: string;
  role: Exclude<OrganizationRole, "owner">;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const identity = params.identity.trim().toLowerCase();
  const target = await db.queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM users
      WHERE LOWER(COALESCE(email, '')) = ? OR phone = ? OR LOWER(COALESCE(username, '')) = ?`,
    [identity, identity, identity]
  );
  if (!target || target.status !== "active") return { error: "未找到可加入的 NexusFlow 账号", status: 404 };
  const existingMembership = await db.queryOne<{ role: OrganizationRole }>(
    `SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?`,
    [params.organizationId, target.id]
  );
  if (existingMembership?.role === "owner") {
    return { error: "企业所有者角色不能通过成员入口修改", status: 409 };
  }
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO organization_members
      (organization_id, user_id, role, status, invited_by, joined_at, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
     ON CONFLICT (organization_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, status = 'active', invited_by = EXCLUDED.invited_by,
           joined_at = COALESCE(organization_members.joined_at, EXCLUDED.joined_at), updated_at = EXCLUDED.updated_at`,
    [params.organizationId, target.id, params.role, params.actorUserId, now, now, now]
  );
  return { ok: true };
}

export async function updateOrganizationMember(params: {
  organizationId: string;
  userId: string;
  role?: Exclude<OrganizationRole, "owner">;
  status?: "active" | "suspended";
}): Promise<{ ok: true } | { error: string; status: number }> {
  const existing = await db.queryOne<{ role: OrganizationRole }>(
    "SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?",
    [params.organizationId, params.userId]
  );
  if (!existing) return { error: "成员不存在", status: 404 };
  if (existing.role === "owner") return { error: "企业所有者不能被编辑或停用", status: 409 };
  const fields: string[] = [];
  const values: unknown[] = [];
  if (params.role !== undefined) { fields.push("role = ?"); values.push(params.role); }
  if (params.status !== undefined) { fields.push("status = ?"); values.push(params.status); }
  if (!fields.length) return { error: "没有需要更新的成员配置", status: 400 };
  fields.push("updated_at = ?");
  values.push(new Date().toISOString(), params.organizationId, params.userId);
  await db.execute(
    `UPDATE organization_members SET ${fields.join(", ")} WHERE organization_id = ? AND user_id = ?`,
    values
  );
  if (params.status === "suspended") {
    await db.execute(
      `DELETE FROM organization_project_principals
        WHERE user_id = ? AND project_id IN (
          SELECT id FROM organization_projects WHERE organization_id = ?
        )`,
      [params.userId, params.organizationId]
    );
  }
  return { ok: true };
}

export async function removeOrganizationMember(
  organizationId: string,
  userId: string
): Promise<{ ok: true } | { error: string; status: number }> {
  const existing = await db.queryOne<{ role: OrganizationRole }>(
    "SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?",
    [organizationId, userId]
  );
  if (!existing) return { error: "成员不存在", status: 404 };
  if (existing.role === "owner") return { error: "企业所有者不能被移除", status: 409 };
  await db.transaction(async (tx) => {
    await tx.execute(
      `DELETE FROM organization_project_principals
        WHERE user_id = ? AND project_id IN (
          SELECT id FROM organization_projects WHERE organization_id = ?
        )`,
      [userId, organizationId]
    );
    await tx.execute(
      "DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?",
      [organizationId, userId]
    );
  });
  return { ok: true };
}

export async function updateOrganization(organizationId: string, patch: {
  name?: string;
  legalName?: string | null;
  plan?: "team" | "business" | "enterprise";
  billingMode?: "shared_balance" | "invoiced";
  resellerEnabled?: boolean;
  brandName?: string | null;
  customDomain?: string | null;
}) {
  const fields: string[] = [];
  const values: unknown[] = [];
  const entries: Array<[keyof typeof patch, string]> = [
    ["name", "name"], ["legalName", "legal_name"], ["plan", "plan"],
    ["billingMode", "billing_mode"], ["resellerEnabled", "reseller_enabled"],
    ["brandName", "brand_name"], ["customDomain", "custom_domain"],
  ];
  for (const [key, column] of entries) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = ?`);
      const value = patch[key];
      values.push(typeof value === "string" ? value.trim() || null : value);
    }
  }
  if (!fields.length) return false;
  fields.push("updated_at = ?");
  values.push(new Date().toISOString(), organizationId);
  return (await db.execute(`UPDATE organizations SET ${fields.join(", ")} WHERE id = ?`, values)) > 0;
}

export async function listOrganizationOffers(organizationId: string) {
  const rows = await db.queryMany<any>(
    `SELECT * FROM organization_offers WHERE organization_id = ? ORDER BY created_at DESC`,
    [organizationId]
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    publicSlug: row.public_slug,
    description: row.description,
    pricingMode: row.pricing_mode,
    markupPercent: Number(row.markup_percent || 0),
    modelScope: Array.isArray(row.model_scope) ? row.model_scope : [],
    monthlyMinimum: Number(row.monthly_minimum || 0),
    status: row.status,
    createdAt: dateValue(row.created_at),
  }));
}

export async function createOrganizationOffer(params: {
  organizationId: string;
  actorUserId: string;
  name: string;
  publicSlug: string;
  description?: string;
  markupPercent?: number;
  modelScope?: string[];
}) {
  const name = params.name.trim().slice(0, 80);
  const publicSlug = normalizeSlug(params.publicSlug);
  const markup = Number(params.markupPercent || 0);
  if (name.length < 2) return { error: "方案名称至少 2 个字符", status: 400 } as const;
  if (validateOrganizationSlug(publicSlug)) return { error: "公开方案标识格式不正确", status: 400 } as const;
  if (!Number.isFinite(markup) || markup < 0 || markup > 1000) return { error: "加价比例须在 0-1000% 之间", status: 400 } as const;
  const now = new Date().toISOString();
  try {
    await db.execute(
      `INSERT INTO organization_offers
        (id, organization_id, name, public_slug, description, pricing_mode, markup_percent,
         model_scope, monthly_minimum, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'markup', ?, ?::jsonb, 0, 'draft', ?, ?, ?)`,
      [randomUUID(), params.organizationId, name, publicSlug, params.description?.trim() || "",
       markup, JSON.stringify(params.modelScope || []), params.actorUserId, now, now]
    );
  } catch (error: any) {
    if (error?.code === "23505") return { error: "公开方案标识已被占用", status: 409 } as const;
    throw error;
  }
  return { ok: true } as const;
}

function normalizeProjectCode(value: string): string {
  return normalizeSlug(value).slice(0, 40);
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function listOrganizationProjects(organizationId: string): Promise<OrganizationProject[]> {
  const rows = await db.queryMany<any>(
    `SELECT p.*, COALESCE(pc.principal_count, 0)::int AS principal_count
       FROM organization_projects p
       LEFT JOIN (
         SELECT project_id, COUNT(*) AS principal_count
           FROM organization_project_principals GROUP BY project_id
       ) pc ON pc.project_id = p.id
      WHERE p.organization_id = ? AND p.status != 'archived'
      ORDER BY p.created_at ASC`,
    [organizationId]
  );
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    code: row.code,
    description: row.description || "",
    environment: row.environment,
    status: row.status,
    monthlyBudget: row.monthly_budget === null ? null : Number(row.monthly_budget),
    modelScope: parseJsonArray(row.model_scope),
    region: row.region,
    slaTier: row.sla_tier,
    rpmLimit: Number(row.rpm_limit || 0),
    tpmLimit: Number(row.tpm_limit || 0),
    principalCount: Number(row.principal_count || 0),
    createdAt: dateValue(row.created_at),
  }));
}

export async function createOrganizationProject(params: {
  organizationId: string;
  actorUserId: string;
  name: string;
  code?: string;
  description?: string;
  environment?: ProjectEnvironment;
  monthlyBudget?: number | null;
  modelScope?: string[];
  region?: string;
  slaTier?: "standard" | "business" | "premium";
  rpmLimit?: number;
  tpmLimit?: number;
}): Promise<{ project: OrganizationProject } | { error: string; status: number }> {
  const name = params.name.trim().slice(0, 80);
  const code = normalizeProjectCode(params.code || name);
  if (name.length < 2) return { error: "项目名称至少 2 个字符", status: 400 };
  if (validateOrganizationSlug(code)) return { error: "项目标识格式不正确", status: 400 };
  const budget = params.monthlyBudget === null || params.monthlyBudget === undefined
    ? null
    : Number(params.monthlyBudget);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
    return { error: "月度预算不能小于 0", status: 400 };
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO organization_projects
          (id, organization_id, name, code, description, environment, status,
           monthly_budget, model_scope, region, sla_tier, rpm_limit, tpm_limit,
           created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)`,
        [id, params.organizationId, name, code, params.description?.trim() || "",
         params.environment || "production", budget, JSON.stringify(params.modelScope || []),
         params.region?.trim() || "cn-beijing", params.slaTier || "standard",
         params.rpmLimit || 0, params.tpmLimit || 0, params.actorUserId, now, now]
      );
      await tx.execute(
        `INSERT INTO organization_project_principals
          (project_id, user_id, principal_type, role, created_by, created_at)
         VALUES (?, ?, 'member', 'owner', ?, ?)`,
        [id, params.actorUserId, params.actorUserId, now]
      );
    });
  } catch (error: any) {
    if (error?.code === "23505") return { error: "项目标识已被占用", status: 409 };
    throw error;
  }
  const project = (await listOrganizationProjects(params.organizationId)).find((item) => item.id === id)!;
  return { project };
}

export async function updateOrganizationProject(
  organizationId: string,
  projectId: string,
  patch: {
    name?: string;
    description?: string;
    environment?: ProjectEnvironment;
    monthlyBudget?: number | null;
    modelScope?: string[];
    region?: string;
    slaTier?: "standard" | "business" | "premium";
    rpmLimit?: number;
    tpmLimit?: number;
  }
): Promise<boolean> {
  const fields: string[] = [];
  const values: unknown[] = [];
  const columnByKey: Record<string, string> = {
    name: "name", description: "description", environment: "environment",
    monthlyBudget: "monthly_budget", region: "region", slaTier: "sla_tier",
    rpmLimit: "rpm_limit", tpmLimit: "tpm_limit",
  };
  for (const [key, column] of Object.entries(columnByKey)) {
    const value = patch[key as keyof typeof patch];
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      values.push(typeof value === "string" ? value.trim() : value);
    }
  }
  if (patch.modelScope !== undefined) {
    fields.push("model_scope = ?::jsonb");
    values.push(JSON.stringify(patch.modelScope));
  }
  if (!fields.length) return false;
  fields.push("updated_at = ?");
  values.push(new Date().toISOString(), projectId, organizationId);
  return (await db.execute(
    `UPDATE organization_projects SET ${fields.join(", ")} WHERE id = ? AND organization_id = ?`,
    values
  )) > 0;
}

export async function listProjectPrincipals(organizationId: string, projectId: string) {
  const rows = await db.queryMany<any>(
    `SELECT pp.user_id, pp.principal_type, pp.role, pp.created_at,
            u.nickname, u.email, u.phone, u.username, u.status, la.last_active,
            u.quota_limit, u.quota_used, u.allowed_models
       FROM organization_project_principals pp
       JOIN organization_projects p ON p.id = pp.project_id AND p.organization_id = ?
       JOIN users u ON u.id = pp.user_id
       LEFT JOIN (
         SELECT user_id, MAX(created_at) AS last_active FROM sessions GROUP BY user_id
       ) la ON la.user_id = u.id
      WHERE pp.project_id = ?
      ORDER BY CASE pp.principal_type WHEN 'member' THEN 0 ELSE 1 END, pp.created_at ASC`,
    [organizationId, projectId]
  );
  return rows.map((row) => ({
    userId: row.user_id,
    principalType: row.principal_type,
    role: row.role,
    nickname: row.nickname,
    email: row.email || null,
    phone: row.phone || null,
    username: row.username || null,
    status: row.status,
    lastActive: row.last_active ? dateValue(row.last_active) : null,
    quotaLimit: row.quota_limit === null ? null : Number(row.quota_limit),
    quotaUsed: Number(row.quota_used || 0),
    allowedModels: parseJsonArray(row.allowed_models),
    createdAt: dateValue(row.created_at),
  }));
}

export async function addProjectPrincipal(params: {
  organizationId: string;
  projectId: string;
  actorUserId: string;
  userId: string;
  principalType: ProjectPrincipalType;
  role: Exclude<ProjectPrincipalRole, "owner">;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const valid = params.principalType === "member"
    ? await db.queryOne(
        `SELECT 1 FROM organization_members
          WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
        [params.organizationId, params.userId]
      )
    : await db.queryOne(
        `SELECT 1 FROM users u JOIN organizations o ON o.owner_user_id = u.parent_user_id
          WHERE o.id = ? AND u.id = ? AND u.status = 'active'`,
        [params.organizationId, params.userId]
      );
  if (!valid) return { error: "该身份不属于当前工作区", status: 404 };
  const project = await db.queryOne(
    "SELECT 1 FROM organization_projects WHERE id = ? AND organization_id = ? AND status = 'active'",
    [params.projectId, params.organizationId]
  );
  if (!project) return { error: "项目不存在", status: 404 };
  await db.execute(
    `INSERT INTO organization_project_principals
      (project_id, user_id, principal_type, role, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (project_id, user_id) DO UPDATE SET
       principal_type = EXCLUDED.principal_type, role = EXCLUDED.role, created_by = EXCLUDED.created_by`,
    [params.projectId, params.userId, params.principalType, params.role,
     params.actorUserId, new Date().toISOString()]
  );
  return { ok: true };
}

export async function updateProjectPrincipal(params: {
  organizationId: string;
  projectId: string;
  userId: string;
  role: Exclude<ProjectPrincipalRole, "owner">;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const existing = await db.queryOne<{ role: ProjectPrincipalRole }>(
    `SELECT pp.role FROM organization_project_principals pp
      JOIN organization_projects p ON p.id = pp.project_id
      WHERE p.organization_id = ? AND pp.project_id = ? AND pp.user_id = ?`,
    [params.organizationId, params.projectId, params.userId]
  );
  if (!existing) return { error: "项目身份不存在", status: 404 };
  if (existing.role === "owner") return { error: "项目所有者角色不能修改", status: 409 };
  await db.execute(
    "UPDATE organization_project_principals SET role = ? WHERE project_id = ? AND user_id = ?",
    [params.role, params.projectId, params.userId]
  );
  return { ok: true };
}

export async function removeProjectPrincipal(params: {
  organizationId: string;
  projectId: string;
  userId: string;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const existing = await db.queryOne<{ role: ProjectPrincipalRole }>(
    `SELECT pp.role FROM organization_project_principals pp
      JOIN organization_projects p ON p.id = pp.project_id
      WHERE p.organization_id = ? AND pp.project_id = ? AND pp.user_id = ?`,
    [params.organizationId, params.projectId, params.userId]
  );
  if (!existing) return { error: "项目身份不存在", status: 404 };
  if (existing.role === "owner") return { error: "项目所有者不能移除", status: 409 };
  await db.execute(
    "DELETE FROM organization_project_principals WHERE project_id = ? AND user_id = ?",
    [params.projectId, params.userId]
  );
  return { ok: true };
}
