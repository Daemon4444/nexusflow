import assert from "node:assert/strict";
import { closeDb, db } from "../src/db/client";
import {
  assertHashOnlySessionTokenPosture,
  getSessionTokenSecurityState,
  hashSessionToken,
  transitionSessionTokenSecurity,
} from "../src/data/session-token-security";
import {
  getUserById,
  hashPassword,
  loginByPassword,
  validateSession,
  verifyPassword,
} from "../src/data/users";
import { resetSubAccountPassword } from "../src/data/sub-accounts";

const userId = "session-security-postgres-user";
const legacyToken = "sess-session-security-postgres-legacy";
const releaseA = "c".repeat(40);
const releaseB = "d".repeat(40);
const parentUserId = "session-security-postgres-parent";
const subUserId = "session-security-postgres-sub";

function assertSafeTarget(): void {
  if (process.env.SESSION_TOKEN_SECURITY_INTEGRATION !== "true") {
    throw new Error("SESSION_TOKEN_SECURITY_INTEGRATION=true is required");
  }
  const database = (process.env.PG_DATABASE || "").toLowerCase();
  if (!database.includes("test") && !database.includes("ci")) {
    throw new Error("session token integration test requires a test/ci database");
  }
}

async function main(): Promise<void> {
  assertSafeTarget();
  const now = new Date().toISOString();

  await db.execute("DELETE FROM sessions");
  await db.execute("DELETE FROM users WHERE id = ?", [userId]);
  await db.execute("DELETE FROM users WHERE id IN (?, ?)", [subUserId, parentUserId]);
  await db.execute("DELETE FROM session_token_security_events");
  await db.execute(
    `UPDATE session_token_security_state
        SET hash_only = FALSE, release_sha = NULL, updated_by = 'integration-test',
            updated_at = NOW()
      WHERE singleton = TRUE`
  );

  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, password_hash,
       status, created_at, updated_at
     ) VALUES (?, ?, ?, 0, 0, NULL, 'active', ?, ?)`,
    [parentUserId, "session-parent@nexusflow.test", "session-parent", now, now]
  );
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, password_hash,
       parent_user_id, username, status, created_at, updated_at
     ) VALUES (?, NULL, ?, 0, 0, ?, ?, ?, 'active', ?, ?)`,
    [
      subUserId,
      "session-sub",
      hashPassword("SubOldPassword#123"),
      parentUserId,
      "session-sub",
      now,
      now,
    ]
  );
  await db.execute(
    `INSERT INTO sessions (
       id, user_id, token, token_hash, created_at, expires_at
     ) VALUES (?, ?, ?, NULL, ?, ?)`,
    [
      "session-security-postgres-sub-session",
      subUserId,
      "sess-session-security-postgres-sub",
      now,
      new Date(Date.now() + 60_000).toISOString(),
    ]
  );
  await assert.rejects(
    resetSubAccountPassword(
      parentUserId,
      subUserId,
      "SubNewPassword#123",
      {
        afterPasswordUpdate: () => {
          throw new Error("injected sub-account reset failure");
        },
      }
    ),
    /injected sub-account reset failure/
  );
  const subAfterFailure = await getUserById(subUserId);
  assert(subAfterFailure?.password_hash);
  assert.equal(verifyPassword("SubOldPassword#123", subAfterFailure.password_hash), true);
  assert(await validateSession("sess-session-security-postgres-sub"));
  const successfulSubReset = await resetSubAccountPassword(
    parentUserId,
    subUserId,
    "SubNewPassword#123"
  );
  assert("ok" in successfulSubReset);
  assert.equal(await validateSession("sess-session-security-postgres-sub"), null);
  const subAfterSuccess = await getUserById(subUserId);
  assert(subAfterSuccess?.password_hash);
  assert.equal(verifyPassword("SubOldPassword#123", subAfterSuccess.password_hash), false);
  assert.equal(verifyPassword("SubNewPassword#123", subAfterSuccess.password_hash), true);
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, password_hash,
       status, created_at, updated_at
     ) VALUES (?, ?, ?, 0, 0, ?, 'active', ?, ?)`,
    [
      userId,
      "session-security-postgres@nexusflow.test",
      "session-security-postgres",
      hashPassword("SessionPostgres#123"),
      now,
      now,
    ]
  );
  await db.execute(
    `INSERT INTO sessions (
       id, user_id, token, token_hash, created_at, expires_at
     ) VALUES (?, ?, ?, NULL, ?, ?)`,
    [
      "session-security-postgres-legacy",
      userId,
      legacyToken,
      now,
      new Date(Date.now() + 60_000).toISOString(),
    ]
  );

  // Real PostgreSQL fault injection proves DELETE, state, and audit roll back
  // together. pg-mem intentionally cannot provide this guarantee.
  await assert.rejects(
    transitionSessionTokenSecurity({
      transition: "forward",
      releaseSha: releaseA,
      actor: "postgres-integration",
      reason: "fault injection",
      afterSessionsRevoked: () => {
        throw new Error("injected session cutover failure");
      },
    }),
    /injected session cutover failure/
  );
  assert.equal((await getSessionTokenSecurityState()).hash_only, false);
  assert(await validateSession(legacyToken));
  assert.equal(
    Number((await db.queryOne<{ cnt: string | number }>(
      "SELECT COUNT(*) AS cnt FROM session_token_security_events"
    ))?.cnt || 0),
    0
  );

  const forward = await transitionSessionTokenSecurity({
    transition: "forward",
    releaseSha: releaseA,
    actor: "postgres-integration",
    reason: "verified new nodes",
  });
  assert.equal(forward.sessionsRevoked, 1);
  await assert.rejects(
    db.execute(
      `INSERT INTO sessions (
         id, user_id, token, token_hash, created_at, expires_at
       ) VALUES (?, ?, ?, NULL, ?, ?)`,
      [
        "session-security-postgres-trigger-reject",
        userId,
        "sess-trigger-must-reject",
        now,
        new Date(Date.now() + 60_000).toISOString(),
      ]
    ),
    /plaintext session bearer storage is disabled/
  );

  const authenticated = await loginByPassword(
    "session-security-postgres@nexusflow.test",
    "SessionPostgres#123"
  );
  assert(authenticated);
  const stored = await db.queryOne<{ token: string; token_hash: string | null }>(
    "SELECT token, token_hash FROM sessions WHERE user_id = ?",
    [userId]
  );
  assert(stored);
  assert.notEqual(stored.token, authenticated.token);
  assert.match(stored.token, /^session-hash-v1:/);
  assert.equal(stored.token_hash, hashSessionToken(authenticated.token));
  assert.equal(
    await db.queryOne("SELECT id FROM sessions WHERE token = ?", [authenticated.token]),
    null
  );
  assert(await validateSession(authenticated.token));

  const rollback = await transitionSessionTokenSecurity({
    transition: "rollback",
    releaseSha: releaseB,
    actor: "postgres-integration",
    reason: "test legacy rollback compatibility",
  });
  assert.equal(rollback.sessionsRevoked, 1);
  assert.equal((await getSessionTokenSecurityState()).hash_only, false);
  await db.execute(
    `INSERT INTO sessions (
       id, user_id, token, token_hash, created_at, expires_at
     ) VALUES (?, ?, ?, NULL, ?, ?)`,
    [
      "session-security-postgres-after-rollback",
      userId,
      "sess-accepted-after-rollback",
      now,
      new Date(Date.now() + 60_000).toISOString(),
    ]
  );

  await transitionSessionTokenSecurity({
    transition: "forward",
    releaseSha: releaseA,
    actor: "postgres-integration",
    reason: "restore secure final posture",
  });
  const posture = await assertHashOnlySessionTokenPosture();
  assert.equal(posture.legacyBearerCount, 0);
  assert.equal(posture.missingHashCount, 0);
  const events = await db.queryMany<{ transition: string; actor: string }>(
    "SELECT transition, actor FROM session_token_security_events ORDER BY created_at"
  );
  assert.deepEqual(events.map((event) => event.transition), ["forward", "rollback", "forward"]);
  assert(events.every((event) => event.actor === "postgres-integration"));

  await db.execute("DELETE FROM users WHERE id = ?", [userId]);
  await db.execute("DELETE FROM users WHERE id IN (?, ?)", [subUserId, parentUserId]);
  console.log("PostgreSQL session token security integration checks passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
