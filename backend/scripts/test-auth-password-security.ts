import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import authRouter from "../src/routes/auth";
import adminControlPlaneRouter from "../src/routes/admin-control-plane";
import {
  getUserById,
  hashPassword,
  setInitialPasswordAndRevokeSessions,
  validateSession,
  verifyPassword,
} from "../src/data/users";
import { closeDb, db } from "../src/db/client";
import { resetSubAccountPassword } from "../src/data/sub-accounts";

const now = new Date();
const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

async function createUser(id: string, email: string, password?: string): Promise<void> {
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, password_hash,
       status, created_at, updated_at
     ) VALUES (?, ?, ?, 0, 0, ?, 'active', ?, ?)`,
    [id, email, id, password ? hashPassword(password) : null, now.toISOString(), now.toISOString()]
  );
}

async function createSession(id: string, userId: string, token: string): Promise<void> {
  await db.execute(
    "INSERT INTO sessions (id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    [id, userId, token, now.toISOString(), expiresAt]
  );
}

async function main(): Promise<void> {
  process.env.ADMIN_EMAILS = "password-admin@nexusflow.test";

  await createUser("password-user", "password-user@nexusflow.test");
  await createSession("password-session-a", "password-user", "sess-password-a");
  await createSession("password-session-b", "password-user", "sess-password-b");

  // Two already-authenticated callers may race the first password setup. The
  // conditional UPDATE is the authority: exactly one wins and both sessions
  // are revoked in the winner's transaction.
  const firstSetResults = await Promise.all([
    setInitialPasswordAndRevokeSessions("password-user", "first-password"),
    setInitialPasswordAndRevokeSessions("password-user", "second-password"),
  ]);
  assert.equal(firstSetResults.filter((result) => result === "success").length, 1);
  assert.equal(firstSetResults.filter((result) => result === "already_set").length, 1);
  assert.equal(await validateSession("sess-password-a"), null);
  assert.equal(await validateSession("sess-password-b"), null);

  const winningPassword = firstSetResults[0] === "success"
    ? "first-password"
    : "second-password";
  const storedAfterFirstSet = await getUserById("password-user");
  assert(storedAfterFirstSet?.password_hash);
  assert.equal(verifyPassword(winningPassword, storedAfterFirstSet.password_hash), true);

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminControlPlaneRouter);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, message: error?.message || String(error) });
  });
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const call = async (
    path: string,
    token: string,
    body?: unknown
  ): Promise<{ status: number; body: any }> => {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    await createUser("password-policy-user", "password-policy-user@nexusflow.test");
    await createSession(
      "password-policy-session",
      "password-policy-user",
      "sess-password-policy"
    );
    const weakInitialPassword = await call(
      "/api/auth/set-password",
      "sess-password-policy",
      { password: "123456" }
    );
    assert.equal(weakInitialPassword.status, 400);
    assert(await validateSession("sess-password-policy"));
    const strongInitialPassword = await call(
      "/api/auth/set-password",
      "sess-password-policy",
      { password: "StrongPass#123" }
    );
    assert.equal(strongInitialPassword.status, 200);
    assert.equal(await validateSession("sess-password-policy"), null);

    await createSession("password-session-c", "password-user", "sess-password-c");

    // An account with a password can no longer be overwritten through the
    // first-set endpoint, even with a valid session.
    const overwrite = await call("/api/auth/set-password", "sess-password-c", {
      password: "attacker-password",
    });
    assert.equal(overwrite.status, 409);
    assert.equal(overwrite.body.code, "password_already_set");
    assert(await validateSession("sess-password-c"));
    const storedAfterOverwrite = await getUserById("password-user");
    assert(storedAfterOverwrite?.password_hash);
    assert.equal(verifyPassword(winningPassword, storedAfterOverwrite.password_hash), true);
    assert.equal(verifyPassword("attacker-password", storedAfterOverwrite.password_hash), false);

    const wrongOldPassword = await call("/api/auth/change-password", "sess-password-c", {
      oldPassword: "definitely-wrong",
      newPassword: "rotated-password",
    });
    assert.equal(wrongOldPassword.status, 400);
    assert(await validateSession("sess-password-c"));

    await createSession("password-session-d", "password-user", "sess-password-d");
    const changed = await call("/api/auth/change-password", "sess-password-c", {
      oldPassword: winningPassword,
      newPassword: "rotated-password",
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.data.reauthenticationRequired, true);
    assert.equal(await validateSession("sess-password-c"), null);
    assert.equal(await validateSession("sess-password-d"), null);
    const storedAfterChange = await getUserById("password-user");
    assert(storedAfterChange?.password_hash);
    assert.equal(verifyPassword(winningPassword, storedAfterChange.password_hash), false);
    assert.equal(verifyPassword("rotated-password", storedAfterChange.password_hash), true);
    const oldTokenAfterChange = await call("/api/auth/me", "sess-password-c");
    assert.equal(oldTokenAfterChange.status, 401);

    // Bootstrap-admin sessions use the same session table and receive no
    // exemption: credential rotation revokes the current and sibling admin
    // sessions before commit.
    await createUser(
      "password-admin",
      "password-admin@nexusflow.test",
      "admin-old-password"
    );
    await createSession("password-admin-session-a", "password-admin", "sess-password-admin-a");
    await createSession("password-admin-session-b", "password-admin", "sess-password-admin-b");
    const adminBefore = await call("/api/admin/session", "sess-password-admin-a");
    assert.equal(adminBefore.status, 200);
    assert.equal(adminBefore.body.data.role, "super_admin");
    const adminChanged = await call("/api/auth/change-password", "sess-password-admin-a", {
      oldPassword: "admin-old-password",
      newPassword: "admin-new-password",
    });
    assert.equal(adminChanged.status, 200);
    assert.equal(await validateSession("sess-password-admin-a"), null);
    assert.equal(await validateSession("sess-password-admin-b"), null);
    const adminAfter = await call("/api/admin/session", "sess-password-admin-a");
    assert.equal(adminAfter.status, 401);

    // Parent-initiated sub-account reset applies the same password policy and
    // revokes every child session in the credential transaction.
    await createUser("password-parent", "password-parent@nexusflow.test");
    await db.execute(
      `INSERT INTO users (
         id, email, nickname, balance, credit_balance, password_hash,
         parent_user_id, username, status, created_at, updated_at
       ) VALUES (?, NULL, ?, 0, 0, ?, ?, ?, 'active', ?, ?)`,
      [
        "password-sub-account",
        "password-sub-account",
        hashPassword("SubAccountOld#123"),
        "password-parent",
        "password-sub",
        now.toISOString(),
        now.toISOString(),
      ]
    );
    await createSession(
      "password-sub-session",
      "password-sub-account",
      "sess-password-sub"
    );
    const weakSubReset = await resetSubAccountPassword(
      "password-parent",
      "password-sub-account",
      "123456"
    );
    assert("error" in weakSubReset);
    assert(await validateSession("sess-password-sub"));
    const wrongOwnerReset = await resetSubAccountPassword(
      "password-user",
      "password-sub-account",
      "SubAccountNew#123"
    );
    assert("error" in wrongOwnerReset);
    assert.equal(wrongOwnerReset.status, 404);
    assert(await validateSession("sess-password-sub"));
    const successfulSubReset = await resetSubAccountPassword(
      "password-parent",
      "password-sub-account",
      "SubAccountNew#123"
    );
    assert("ok" in successfulSubReset);
    assert.equal(await validateSession("sess-password-sub"), null);
    const resetSub = await getUserById("password-sub-account");
    assert(resetSub?.password_hash);
    assert.equal(verifyPassword("SubAccountOld#123", resetSub.password_hash), false);
    assert.equal(verifyPassword("SubAccountNew#123", resetSub.password_hash), true);

    console.log("auth password security checks passed");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
