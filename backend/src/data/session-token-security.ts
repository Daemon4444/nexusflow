import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";

export interface SessionSecurityClient {
  queryOne: <T = any>(sql: string, params?: any[]) => Promise<T | null>;
  execute: (sql: string, params?: any[]) => Promise<number>;
}

export interface SessionTokenSecurityState {
  hash_only: boolean;
  release_sha: string | null;
  updated_by: string;
  updated_at: string;
}

export interface SessionTokenSecurityPosture {
  hashOnly: boolean;
  sessionCount: number;
  legacyBearerCount: number;
  missingHashCount: number;
}

export type SessionTokenSecurityTransition = "forward" | "rollback";

const SESSION_HASH_DOMAIN = "nexusflow/session-token/v1\0";
const SESSION_STORAGE_MARKER_PREFIX = "session-hash-v1:";

export function hashSessionToken(token: string): string {
  return crypto
    .createHash("sha256")
    .update(SESSION_HASH_DOMAIN)
    .update(token)
    .digest("hex");
}

export function sessionStorageMarker(sessionId: string): string {
  return `${SESSION_STORAGE_MARKER_PREFIX}${sessionId}`;
}

export async function getSessionTokenSecurityState(
  client: Pick<SessionSecurityClient, "queryOne"> = db,
  lock: false | "share" | "update" = false
): Promise<SessionTokenSecurityState> {
  const lockClause = lock === "share"
    ? " FOR SHARE"
    : lock === "update"
      ? " FOR UPDATE"
      : "";
  const state = await client.queryOne<SessionTokenSecurityState>(
    `SELECT hash_only, release_sha, updated_by, updated_at
       FROM session_token_security_state
      WHERE singleton = TRUE${lockClause}`
  );
  if (!state) {
    throw new Error("session token security state is missing; migration 017 is required");
  }
  return state;
}

export async function getSessionTokenSecurityPosture(
  client: Pick<SessionSecurityClient, "queryOne"> = db
): Promise<SessionTokenSecurityPosture> {
  const [state, counts] = await Promise.all([
    getSessionTokenSecurityState(client),
    client.queryOne<{
      session_count: string | number;
      legacy_bearer_count: string | number;
      missing_hash_count: string | number;
    }>(
      `SELECT COUNT(*) AS session_count,
              COUNT(*) FILTER (WHERE token NOT LIKE 'session-hash-v1:%') AS legacy_bearer_count,
              COUNT(*) FILTER (WHERE token_hash IS NULL) AS missing_hash_count
         FROM sessions`
    ),
  ]);
  return {
    hashOnly: !!state.hash_only,
    sessionCount: Number(counts?.session_count || 0),
    legacyBearerCount: Number(counts?.legacy_bearer_count || 0),
    missingHashCount: Number(counts?.missing_hash_count || 0),
  };
}

export async function assertHashOnlySessionTokenPosture(): Promise<SessionTokenSecurityPosture> {
  const posture = await getSessionTokenSecurityPosture();
  if (
    !posture.hashOnly
    || posture.legacyBearerCount !== 0
    || posture.missingHashCount !== 0
  ) {
    throw new Error(
      `session token posture is unsafe: hashOnly=${posture.hashOnly} `
      + `legacy=${posture.legacyBearerCount} missingHash=${posture.missingHashCount}`
    );
  }
  return posture;
}

export async function transitionSessionTokenSecurity(params: {
  transition: SessionTokenSecurityTransition;
  releaseSha: string;
  actor: string;
  reason: string;
  afterSessionsRevoked?: () => Promise<void> | void;
}): Promise<{
  changed: boolean;
  fromHashOnly: boolean;
  toHashOnly: boolean;
  sessionsRevoked: number;
}> {
  const releaseSha = params.releaseSha.trim();
  const actor = params.actor.trim();
  const reason = params.reason.trim();
  if (!releaseSha || !actor || !reason) {
    throw new Error("releaseSha, actor, and reason are required for session security transitions");
  }
  const targetHashOnly = params.transition === "forward";

  return db.transaction(async (tx) => {
    const state = await getSessionTokenSecurityState(tx, "update");
    const fromHashOnly = !!state.hash_only;
    if (fromHashOnly === targetHashOnly) {
      return {
        changed: false,
        fromHashOnly,
        toHashOnly: targetHashOnly,
        sessionsRevoked: 0,
      };
    }

    const sessionsRevoked = await tx.execute("DELETE FROM sessions");
    if (params.afterSessionsRevoked) {
      await params.afterSessionsRevoked();
    }
    await tx.execute(
      `UPDATE session_token_security_state
          SET hash_only = ?, release_sha = ?, updated_by = ?, updated_at = NOW()
        WHERE singleton = TRUE`,
      [targetHashOnly, releaseSha, actor]
    );
    await tx.execute(
      `INSERT INTO session_token_security_events (
         id, transition, from_hash_only, to_hash_only, sessions_revoked,
         release_sha, actor, reason, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        uuidv4(),
        params.transition,
        fromHashOnly,
        targetHashOnly,
        sessionsRevoked,
        releaseSha,
        actor,
        reason,
      ]
    );
    return {
      changed: true,
      fromHashOnly,
      toHashOnly: targetHashOnly,
      sessionsRevoked,
    };
  });
}
