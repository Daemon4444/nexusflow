import assert from "node:assert/strict";
import { db, closeDb } from "../src/db/client";
import {
  getSessionTokenSecurityPosture,
  getSessionTokenSecurityState,
  hashSessionToken,
  transitionSessionTokenSecurity,
} from "../src/data/session-token-security";
import {
  hashPassword,
  loginByPassword,
  logout,
  validateSession,
} from "../src/data/users";

const releaseA = "a".repeat(40);
const releaseB = "b".repeat(40);
const now = new Date().toISOString();

async function createFixtureUser(): Promise<void> {
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, password_hash,
       status, created_at, updated_at
     ) VALUES (?, ?, ?, 0, 0, ?, 'active', ?, ?)`,
    [
      "session-security-user",
      "session-security@nexusflow.test",
      "session-security-user",
      hashPassword("SessionSecurity#123"),
      now,
      now,
    ]
  );
}

async function main(): Promise<void> {
  await db.execute("DELETE FROM sessions");
  await db.execute("DELETE FROM session_token_security_events");
  await db.execute(
    `UPDATE session_token_security_state
        SET hash_only = FALSE, release_sha = NULL, updated_by = 'test',
            updated_at = NOW()
      WHERE singleton = TRUE`
  );
  await createFixtureUser();
  assert.equal((await getSessionTokenSecurityState()).hash_only, false);

  // During the rolling-compatible phase, a new binary still never writes the
  // bearer itself. hash_only=false means legacy-read compatibility only.
  const dual = await loginByPassword(
    "session-security@nexusflow.test",
    "SessionSecurity#123"
  );
  assert(dual);
  const dualRow = await db.queryOne<{ token: string; token_hash: string | null }>(
    "SELECT token, token_hash FROM sessions WHERE user_id = ?",
    ["session-security-user"]
  );
  assert.notEqual(dualRow?.token, dual.token);
  assert.match(dualRow?.token || "", /^session-hash-v1:/);
  assert.equal(dualRow?.token_hash, hashSessionToken(dual.token));
  assert(await validateSession(dual.token));
  await logout(dual.token);
  assert.equal(await validateSession(dual.token), null);

  const sessionOne = await loginByPassword(
    "session-security@nexusflow.test",
    "SessionSecurity#123"
  );
  const sessionTwo = await loginByPassword(
    "session-security@nexusflow.test",
    "SessionSecurity#123"
  );
  assert(sessionOne && sessionTwo);
  await db.execute(
    `INSERT INTO sessions (
       id, user_id, token, token_hash, created_at, expires_at
     ) VALUES (?, ?, ?, NULL, ?, ?)`,
    [
      "legacy-session-security",
      "session-security-user",
      "sess-legacy-security",
      now,
      new Date(Date.now() + 60_000).toISOString(),
    ]
  );

  const forward = await transitionSessionTokenSecurity({
    transition: "forward",
    releaseSha: releaseA,
    actor: "session-security-test",
    reason: "new nodes verified",
  });
  assert.equal(forward.changed, true);
  assert.equal(forward.sessionsRevoked, 3);
  assert.equal(await validateSession(sessionOne.token), null);
  assert.equal(await validateSession(sessionTwo.token), null);
  assert.equal(await validateSession("sess-legacy-security"), null);
  assert.deepEqual(await getSessionTokenSecurityPosture(), {
    hashOnly: true,
    sessionCount: 0,
    legacyBearerCount: 0,
    missingHashCount: 0,
  });

  // In final mode, the database never receives the bearer itself.
  const hashOnly = await loginByPassword(
    "session-security@nexusflow.test",
    "SessionSecurity#123"
  );
  assert(hashOnly);
  const hashOnlyRow = await db.queryOne<{ token: string; token_hash: string | null }>(
    "SELECT token, token_hash FROM sessions WHERE user_id = ?",
    ["session-security-user"]
  );
  assert(hashOnlyRow);
  assert.notEqual(hashOnlyRow.token, hashOnly.token);
  assert.match(hashOnlyRow.token, /^session-hash-v1:/);
  assert.equal(hashOnlyRow.token_hash, hashSessionToken(hashOnly.token));
  assert.equal(
    await db.queryOne("SELECT id FROM sessions WHERE token = ?", [hashOnly.token]),
    null
  );
  assert(await validateSession(hashOnly.token));
  await logout(hashOnly.token);
  assert.equal(await validateSession(hashOnly.token), null);

  // A repeated forward assertion is idempotent and does not revoke valid
  // hash-only sessions.
  const hashOnlyForRollback = await loginByPassword(
    "session-security@nexusflow.test",
    "SessionSecurity#123"
  );
  assert(hashOnlyForRollback);
  const repeatedForward = await transitionSessionTokenSecurity({
    transition: "forward",
    releaseSha: releaseA,
    actor: "session-security-test",
    reason: "idempotency check",
  });
  assert.equal(repeatedForward.changed, false);
  assert(await validateSession(hashOnlyForRollback.token));

  // Rollback compatibility is itself atomic, revokes all hash-only sessions,
  // flips the trigger state, and emits a durable security downgrade event.
  const rollback = await transitionSessionTokenSecurity({
    transition: "rollback",
    releaseSha: releaseB,
    actor: "session-security-test",
    reason: "legacy binary rollback",
  });
  assert.equal(rollback.changed, true);
  assert.equal(rollback.sessionsRevoked, 1);
  assert.equal((await getSessionTokenSecurityState()).hash_only, false);
  assert.equal(await validateSession(hashOnlyForRollback.token), null);

  const legacyAfterRollback = "sess-legacy-after-rollback";
  await db.execute(
    `INSERT INTO sessions (
       id, user_id, token, token_hash, created_at, expires_at
     ) VALUES (?, ?, ?, NULL, ?, ?)`,
    [
      "legacy-after-rollback",
      "session-security-user",
      legacyAfterRollback,
      now,
      new Date(Date.now() + 60_000).toISOString(),
    ]
  );
  assert(await validateSession(legacyAfterRollback));

  const finalForward = await transitionSessionTokenSecurity({
    transition: "forward",
    releaseSha: releaseA,
    actor: "session-security-test",
    reason: "restore final secure posture",
  });
  assert.equal(finalForward.sessionsRevoked, 1);
  assert.deepEqual(await getSessionTokenSecurityPosture(), {
    hashOnly: true,
    sessionCount: 0,
    legacyBearerCount: 0,
    missingHashCount: 0,
  });

  const events = await db.queryMany<{
    transition: string;
    from_hash_only: boolean;
    to_hash_only: boolean;
    actor: string;
  }>(
    `SELECT transition, from_hash_only, to_hash_only, actor
       FROM session_token_security_events
      ORDER BY created_at, id`
  );
  assert.equal(events.length, 3);
  assert(events.some((event) =>
    event.transition === "rollback"
    && event.from_hash_only === true
    && event.to_hash_only === false
    && event.actor === "session-security-test"
  ));

  console.log("session token security checks passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
