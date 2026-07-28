import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { parseEnvList } from "../utils/env-list";
import { writeAdminAuditEvent } from "./admin-audit";

export type StoredAdminRole = "viewer" | "support" | "finance" | "operator" | "admin";
export type AdminRole = "super_admin" | StoredAdminRole;

export type AdminPermission =
  | "control_plane.read"
  | "customers.read"
  | "customers.manage"
  | "billing.read"
  | "billing.manage"
  | "finance.read"
  | "finance.adjust"
  | "catalog.read"
  | "catalog.manage"
  | "providers.read"
  | "providers.manage"
  | "traffic.read"
  | "support.read"
  | "support.manage"
  | "audit.read"
  | "releases.read"
  | "releases.manage"
  | "incidents.manage"
  | "access.read"
  | "access.manage"
  | "security.read"
  | "security.manage"
  | "legacy.admin";

export interface AdminRoleAssignment {
  id: string;
  user_id: string;
  role: StoredAdminRole;
  is_active: boolean;
  granted_by: string | null;
  revoked_by: string | null;
  reason: string;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  email?: string | null;
  nickname?: string;
}

export interface AdminAccess {
  bootstrap: boolean;
  role: AdminRole;
  roles: AdminRole[];
  permissions: AdminPermission[];
}

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [
  "control_plane.read",
  "customers.read",
  "customers.manage",
  "billing.read",
  "billing.manage",
  "finance.read",
  "finance.adjust",
  "catalog.read",
  "catalog.manage",
  "providers.read",
  "providers.manage",
  "traffic.read",
  "support.read",
  "support.manage",
  "audit.read",
  "releases.read",
  "releases.manage",
  "incidents.manage",
  "access.read",
  "access.manage",
  "security.read",
  "security.manage",
  "legacy.admin",
];

export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  viewer: [
    "control_plane.read",
    "customers.read",
    "billing.read",
    "finance.read",
    "catalog.read",
    "providers.read",
    "traffic.read",
    "support.read",
    "releases.read",
  ],
  support: [
    "control_plane.read",
    "customers.read",
    "traffic.read",
    "support.read",
    "support.manage",
    "releases.read",
  ],
  finance: [
    "control_plane.read",
    "customers.read",
    "billing.read",
    "billing.manage",
    "finance.read",
    "finance.adjust",
    "traffic.read",
    "audit.read",
    "releases.read",
  ],
  operator: [
    "control_plane.read",
    "customers.read",
    "billing.read",
    "finance.read",
    "catalog.read",
    "catalog.manage",
    "providers.read",
    "providers.manage",
    "traffic.read",
    "audit.read",
    "releases.read",
    "releases.manage",
    "incidents.manage",
  ],
  admin: ALL_ADMIN_PERMISSIONS,
  super_admin: ALL_ADMIN_PERMISSIONS,
};

const ROLE_ORDER: AdminRole[] = ["super_admin", "admin", "operator", "finance", "support", "viewer"];
const STORED_ROLES = new Set<StoredAdminRole>(["viewer", "support", "finance", "operator", "admin"]);

export function isStoredAdminRole(value: unknown): value is StoredAdminRole {
  return typeof value === "string" && STORED_ROLES.has(value as StoredAdminRole);
}

export function isBootstrapAdmin(user: { id: string; email: string | null }): boolean {
  const adminIds = parseEnvList(process.env.ADMIN_USER_IDS);
  const adminEmails = parseEnvList(process.env.ADMIN_EMAILS);
  const email = (user.email || "").toLowerCase();
  return adminIds.includes(user.id.toLowerCase()) || (!!email && adminEmails.includes(email));
}

export function isDemoAdminPrincipal(user: { email: string | null }): boolean {
  const email = (user.email || "").trim().toLowerCase();
  return !!email && parseEnvList(process.env.DEMO_ADMIN_EMAILS).includes(email);
}

export async function getAdminAccessForUser(
  user: { id: string; email: string | null }
): Promise<AdminAccess | null> {
  // Demo access and real administration are mutually exclusive server-side.
  // Removing the principal from DEMO_ADMIN_EMAILS is an explicit promotion
  // prerequisite; ADMIN_EMAILS or a stale DB role can never override it.
  if (isDemoAdminPrincipal(user)) return null;

  if (isBootstrapAdmin(user)) {
    return {
      bootstrap: true,
      role: "super_admin",
      roles: ["super_admin"],
      permissions: [...ALL_ADMIN_PERMISSIONS],
    };
  }

  let assignments: Array<{ role: StoredAdminRole }> = [];
  try {
    assignments = await db.queryMany<{ role: StoredAdminRole }>(
      `SELECT role
         FROM admin_role_assignments
        WHERE user_id = ? AND is_active = TRUE AND revoked_at IS NULL
        ORDER BY created_at`,
      [user.id]
    );
  } catch (error) {
    // A deployment that has not installed migration 014 must fail closed for
    // database-backed administrators. Bootstrap admins remain available for
    // recovery and migration.
    console.error("[AdminAccess] role lookup failed:", error instanceof Error ? error.message : String(error));
    return null;
  }

  const roles = [...new Set(assignments.map((row) => row.role).filter(isStoredAdminRole))];
  if (roles.length === 0) return null;
  roles.sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  const permissionSet = new Set<AdminPermission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) permissionSet.add(permission);
  }
  return {
    bootstrap: false,
    role: roles[0],
    roles,
    permissions: ALL_ADMIN_PERMISSIONS.filter((permission) => permissionSet.has(permission)),
  };
}

export async function listAdminRoleAssignments(): Promise<AdminRoleAssignment[]> {
  const rows = await db.queryMany<AdminRoleAssignment>(
    `SELECT ara.*, u.email, u.nickname
       FROM admin_role_assignments ara
       JOIN users u ON u.id = ara.user_id
      ORDER BY ara.is_active DESC, ara.created_at DESC`
  );
  return rows.map((row) => ({ ...row, is_active: !!row.is_active }));
}

export interface AdminRoleMutationAudit {
  actorUserId: string;
  actorRole: AdminRole;
  actorEmail: string | null;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  method: "POST" | "DELETE";
  path: string;
}

export type AssignAdminRoleResult =
  | { ok: true; assignment: AdminRoleAssignment }
  | { ok: false; reason: "user_not_found" | "demo_principal" };

/**
 * Role mutation and its successful security audit are one commit boundary.
 * If the audit insert fails, PostgreSQL rolls the role change back.
 */
export async function assignAdminRoleWithAudit(params: {
  userId: string;
  role: StoredAdminRole;
  grantedBy: string | null;
  reason: string;
  audit: AdminRoleMutationAudit;
}): Promise<AssignAdminRoleResult> {
  return db.transaction(async (tx) => {
    const user = await tx.queryOne<{ id: string; email: string | null }>(
      "SELECT id, email FROM users WHERE id = ? FOR UPDATE",
      [params.userId]
    );
    if (!user) return { ok: false, reason: "user_not_found" };
    if (isDemoAdminPrincipal(user)) return { ok: false, reason: "demo_principal" };

    const before = await tx.queryOne<AdminRoleAssignment>(
      `SELECT *
         FROM admin_role_assignments
        WHERE user_id = ? AND role = ?
        FOR UPDATE`,
      [params.userId, params.role]
    );
    const now = new Date().toISOString();
    const assignmentId = before?.id || uuidv4();
    const auditedAfter: AdminRoleAssignment = {
      ...(before || {
        id: assignmentId,
        user_id: params.userId,
        role: params.role,
        created_at: now,
      }),
      id: assignmentId,
      user_id: params.userId,
      role: params.role,
      is_active: true,
      granted_by: params.grantedBy,
      revoked_by: null,
      reason: params.reason,
      updated_at: now,
      revoked_at: null,
    };

    // Fail the operation before touching the role row if the durable audit
    // cannot be written. Both statements still share this transaction, so a
    // later role-write failure also rolls the audit insert back.
    await writeAdminAuditEvent({
      actorUserId: params.audit.actorUserId,
      actorRole: params.audit.actorRole,
      actorEmail: params.audit.actorEmail,
      requestId: params.audit.requestId,
      action: "access.role.assign",
      resourceType: "admin_role_assignment",
      resourceId: assignmentId,
      outcome: "success",
      reason: params.reason,
      ipAddress: params.audit.ipAddress,
      userAgent: params.audit.userAgent,
      beforeData: before,
      afterData: auditedAfter,
      metadata: {
        method: params.audit.method,
        path: params.audit.path,
        statusCode: 200,
      },
    }, tx);

    const assignment = await tx.queryOne<AdminRoleAssignment>(
      `INSERT INTO admin_role_assignments
        (id, user_id, role, is_active, granted_by, revoked_by, reason, created_at, updated_at, revoked_at)
       VALUES (?, ?, ?, TRUE, ?, NULL, ?, ?, ?, NULL)
       ON CONFLICT(user_id, role) DO UPDATE SET
         is_active = TRUE,
         granted_by = excluded.granted_by,
         revoked_by = NULL,
         reason = excluded.reason,
         updated_at = excluded.updated_at,
         revoked_at = NULL
       RETURNING *`,
      [assignmentId, params.userId, params.role, params.grantedBy, params.reason, now, now]
    );
    if (!assignment) throw new Error("admin role assignment write returned no row");
    return { ok: true, assignment };
  });
}

export type RevokeAdminRoleResult =
  | { ok: true; assignment: AdminRoleAssignment }
  | { ok: false; reason: "assignment_not_found" };

export async function revokeAdminRoleWithAudit(params: {
  assignmentId: string;
  revokedBy: string | null;
  reason: string;
  audit: AdminRoleMutationAudit;
}): Promise<RevokeAdminRoleResult> {
  return db.transaction(async (tx) => {
    const before = await tx.queryOne<AdminRoleAssignment>(
      `SELECT *
         FROM admin_role_assignments
        WHERE id = ? AND is_active = TRUE
        FOR UPDATE`,
      [params.assignmentId]
    );
    if (!before) return { ok: false, reason: "assignment_not_found" };

    const now = new Date().toISOString();
    const auditedAfter: AdminRoleAssignment = {
      ...before,
      is_active: false,
      revoked_by: params.revokedBy,
      reason: params.reason,
      revoked_at: now,
      updated_at: now,
    };
    await writeAdminAuditEvent({
      actorUserId: params.audit.actorUserId,
      actorRole: params.audit.actorRole,
      actorEmail: params.audit.actorEmail,
      requestId: params.audit.requestId,
      action: "access.role.revoke",
      resourceType: "admin_role_assignment",
      resourceId: before.id,
      outcome: "success",
      reason: params.reason,
      ipAddress: params.audit.ipAddress,
      userAgent: params.audit.userAgent,
      beforeData: before,
      afterData: auditedAfter,
      metadata: {
        method: params.audit.method,
        path: params.audit.path,
        statusCode: 200,
      },
    }, tx);

    const assignment = await tx.queryOne<AdminRoleAssignment>(
      `UPDATE admin_role_assignments
          SET is_active = FALSE,
              revoked_by = ?,
              reason = ?,
              revoked_at = ?,
              updated_at = ?
        WHERE id = ? AND is_active = TRUE
        RETURNING *`,
      [params.revokedBy, params.reason, now, now, params.assignmentId]
    );
    if (!assignment) throw new Error("admin role revocation write returned no row");
    return { ok: true, assignment };
  });
}
