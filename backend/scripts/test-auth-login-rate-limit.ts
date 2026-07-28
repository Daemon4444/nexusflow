import assert from "node:assert/strict";
import crypto from "node:crypto";
import express, { type Request } from "express";
import type { Server } from "node:http";
import authRouter, { getAuthClientIp } from "../src/routes/auth";
import { getAdminClientIp } from "../src/middleware/admin-audit";
import { closeDb, db } from "../src/db/client";
import { hashPassword, verifyPasswordAsync } from "../src/data/users";
import { closeRedis } from "../src/services/redis";
import { getRedis } from "../src/services/redis";
import { reserveVerificationCode } from "../src/services/verification-code-store";

function verificationKeys(email: string, token: string, sourceIp: string) {
  const subjectHash = crypto
    .createHash("sha256")
    .update(`email:${email.trim().toLowerCase()}`)
    .digest("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const ipHash = crypto.createHash("sha256").update(sourceIp).digest("hex");
  const prefix = `nexusflow:verification:{${subjectHash}}`;
  return {
    prefix,
    source: `${prefix}:attempts:${tokenHash}:source:${ipHash}`,
    challenge: `${prefix}:attempts:${tokenHash}:challenge`,
    recipient: `${prefix}:attempts:recipient`,
    ip: `nexusflow:verification:verify-ip:${ipHash}`,
    global: "nexusflow:verification:verify-global",
  };
}

async function createLoginUser(id: string, email: string, password: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, password_hash,
       status, created_at, updated_at
     ) VALUES (?, ?, ?, 0, 0, ?, 'active', ?, ?)`,
    [id, email, id, hashPassword(password), now, now]
  );
}

async function main(): Promise<void> {
  assert(process.env.REDIS_HOST, "isolated Redis host is required");

  // Header spoofing is ignored from an untrusted direct peer, while a trusted
  // loopback ingress may pass nginx's normalized single X-Real-IP value.
  assert.equal(
    getAuthClientIp({
      headers: { "x-real-ip": "198.51.100.8" },
      socket: { remoteAddress: "203.0.113.77" },
    } as unknown as Request),
    "203.0.113.77"
  );
  assert.equal(
    getAuthClientIp({
      headers: { "x-real-ip": "198.51.100.8" },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Request),
    "198.51.100.8"
  );
  assert.equal(
    getAdminClientIp({
      headers: { "x-real-ip": "198.51.100.9" },
      socket: { remoteAddress: "203.0.113.78" },
    } as unknown as Request),
    "203.0.113.78"
  );
  assert.equal(
    getAdminClientIp({
      headers: { "x-real-ip": "198.51.100.9" },
      socket: { remoteAddress: "::1" },
    } as unknown as Request),
    "198.51.100.9"
  );

  // A legacy six-character credential remains login-compatible; the stronger
  // policy applies only when creating a new password.
  await createLoginUser("rate-user", "rate-user@nexusflow.test", "old123");
  await createLoginUser("rotation-user", "rotation-user@nexusflow.test", "old456");

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const login = async (
    email: string,
    password: string,
    sourceIp: string
  ): Promise<{ status: number; body: any }> => {
    const response = await fetch(`${base}/api/auth/login-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Real-IP": sourceIp,
      },
      body: JSON.stringify({ email, password }),
    });
    return { status: response.status, body: await response.json() };
  };

  const sendCode = async (email: string, sourceIp: string): Promise<number> => {
    const response = await fetch(`${base}/api/auth/send-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Real-IP": sourceIp,
      },
      body: JSON.stringify({ email }),
    });
    return response.status;
  };

  const codeLogin = async (
    email: string,
    code: string,
    sourceIp: string,
    challengeToken?: string
  ): Promise<number> => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Real-IP": sourceIp,
      },
      body: JSON.stringify({ email, code, challengeToken }),
    });
    return response.status;
  };

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal(
        (await login("rate-user@nexusflow.test", "wrong-password", "198.51.100.1")).status,
        401
      );
    }
    assert.equal(
      (await login("rate-user@nexusflow.test", "wrong-password", "198.51.100.1")).status,
      429
    );

    // A source-specific lock does not let one anonymous source deny every
    // legitimate origin. The successful attempt only clears its fine-grained
    // bucket; prior account failures remain subject to the broader threshold.
    assert.equal(
      (await login("rate-user@nexusflow.test", "old123", "198.51.100.2")).status,
      200
    );

    // Rotating source IPs no longer grants unlimited guesses: the identity-only
    // budget locks after 25 admitted attempts across distinct source buckets.
    for (let attempt = 1; attempt <= 25; attempt++) {
      const result = await login(
        "rotation-user@nexusflow.test",
        "wrong-password",
        `203.0.113.${attempt}`
      );
      assert.equal(result.status, 401, `rotation attempt ${attempt} unexpectedly blocked early`);
    }
    const globallyLocked = await login(
      "rotation-user@nexusflow.test",
      "old456",
      "203.0.113.100"
    );
    assert.equal(globallyLocked.status, 429);

    // Rotating identities from one source is bounded independently of each
    // account/source pair.
    for (let attempt = 0; attempt < 40; attempt++) {
      assert.equal(
        (await login(
          `spray-${attempt}@nexusflow.test`,
          "wrong-password",
          "198.51.100.40"
        )).status,
        401
      );
    }
    assert.equal(
      (await login(
        "spray-blocked@nexusflow.test",
        "wrong-password",
        "198.51.100.40"
      )).status,
      429
    );

    // The scrypt worker pool makes the per-IP concurrency lease observable:
    // only two simultaneous guesses from this source are admitted.
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        login(
          `parallel-${index}@nexusflow.test`,
          "wrong-password",
          "198.51.100.41"
        )
      )
    );
    assert(concurrent.some((result) => result.status === 429));
    assert(concurrent.filter((result) => result.status === 401).length <= 2);

    // Five distinct recipients per minute is the provider-cost/IP budget;
    // recipient rotation cannot turn the endpoint into an SMTP relay.
    for (let index = 0; index < 5; index++) {
      assert.equal(
        await sendCode(`code-budget-${index}@nexusflow.test`, "198.51.100.50"),
        200
      );
    }
    assert.equal(
      await sendCode("code-budget-blocked@nexusflow.test", "198.51.100.50"),
      429
    );

    // A verification challenge is a second high-entropy bearer value. Merely
    // knowing the victim's email—or inventing another token—cannot increment
    // or delete the victim's real challenge.
    const victimEmail = "challenge-victim@nexusflow.test";
    const victimChallenge = await reserveVerificationCode(
      "email",
      victimEmail,
      "123456",
      { sourceIp: "198.51.100.60" }
    );
    assert(victimChallenge.reserved);
    if (!victimChallenge.reserved) throw new Error("victim challenge not reserved");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal(
        await codeLogin(victimEmail, "000000", "198.51.100.61"),
        400,
        "an old client without challengeToken must not touch a challenge"
      );
      assert.equal(
        await codeLogin(
          victimEmail,
          "000000",
          "198.51.100.61",
          "a".repeat(48)
        ),
        401,
        "a random challengeToken must not touch the victim challenge"
      );
    }

    // Even a source that somehow obtained the challenge token cannot use its
    // three wrong attempts to delete the shared code. That source is blocked,
    // while the legitimate origin can still consume the correct code.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal(
        await codeLogin(
          victimEmail,
          "000000",
          "198.51.100.62",
          victimChallenge.reservation.token
        ),
        401
      );
    }
    assert.equal(
      await codeLogin(
        victimEmail,
        "000000",
        "198.51.100.62",
        victimChallenge.reservation.token
      ),
      429
    );
    assert.equal(
      await codeLogin(
        victimEmail,
        "123456",
        "198.51.100.60",
        victimChallenge.reservation.token
      ),
      200
    );
    assert.equal(
      await codeLogin(
        victimEmail,
        "123456",
        "198.51.100.60",
        victimChallenge.reservation.token
      ),
      401,
      "a successful challenge must remain single-use"
    );

    // Anonymous-error budgets must never lock out a holder of the delivered
    // code. A rate-limited wrong attempt leaves the challenge intact, and the
    // correct code atomically consumes it even when every counter is full.
    const exhaustedEmail = "challenge-exhausted@nexusflow.test";
    const exhaustedIp = "198.51.100.70";
    const exhaustedChallenge = await reserveVerificationCode(
      "email",
      exhaustedEmail,
      "654321"
    );
    assert(exhaustedChallenge.reserved);
    if (!exhaustedChallenge.reserved) throw new Error("exhausted challenge not reserved");
    const exhaustedKeys = verificationKeys(
      exhaustedEmail,
      exhaustedChallenge.reservation.token,
      exhaustedIp
    );
    const redis = getRedis();
    await Promise.all([
      redis.set(exhaustedKeys.source, "3", "EX", 300),
      redis.set(exhaustedKeys.challenge, "10", "EX", 300),
      redis.set(exhaustedKeys.recipient, "4", "EX", 300),
      redis.set(exhaustedKeys.ip, "20", "EX", 300),
      redis.set(exhaustedKeys.global, "1000", "EX", 300),
    ]);
    assert.equal(
      await codeLogin(
        exhaustedEmail,
        "000000",
        exhaustedIp,
        exhaustedChallenge.reservation.token
      ),
      429
    );
    assert.equal(
      await codeLogin(
        exhaustedEmail,
        "654321",
        exhaustedIp,
        exhaustedChallenge.reservation.token
      ),
      200,
      "correct challenge must bypass exhausted anonymous-error budgets"
    );
    await redis.del(
      exhaustedKeys.source,
      exhaustedKeys.challenge,
      exhaustedKeys.recipient,
      exhaustedKeys.ip,
      exhaustedKeys.global
    );

    // Requesting a fresh challenge cannot reset the recipient's rolling
    // guessing budget. The next wrong guess is blocked across challenge
    // tokens, while the actually delivered code remains usable.
    const rollingEmail = "challenge-rolling@nexusflow.test";
    const firstRolling = await reserveVerificationCode(
      "email",
      rollingEmail,
      "111111"
    );
    assert(firstRolling.reserved);
    if (!firstRolling.reserved) throw new Error("first rolling challenge not reserved");
    for (const sourceIp of ["198.51.100.81", "198.51.100.82"]) {
      assert.equal(
        await codeLogin(
          rollingEmail,
          "000000",
          sourceIp,
          firstRolling.reservation.token
        ),
        401
      );
    }
    const rollingKeys = verificationKeys(
      rollingEmail,
      firstRolling.reservation.token,
      "198.51.100.81"
    );
    await redis.del(`${rollingKeys.prefix}:send-lock`);
    const secondRolling = await reserveVerificationCode(
      "email",
      rollingEmail,
      "222222"
    );
    assert(secondRolling.reserved);
    if (!secondRolling.reserved) throw new Error("second rolling challenge not reserved");
    for (const sourceIp of ["198.51.100.83", "198.51.100.84"]) {
      assert.equal(
        await codeLogin(
          rollingEmail,
          "000000",
          sourceIp,
          secondRolling.reservation.token
        ),
        401
      );
    }
    await redis.del(`${rollingKeys.prefix}:send-lock`);
    const thirdRolling = await reserveVerificationCode(
      "email",
      rollingEmail,
      "333333"
    );
    assert(thirdRolling.reserved);
    if (!thirdRolling.reserved) throw new Error("third rolling challenge not reserved");
    assert.equal(
      await codeLogin(
        rollingEmail,
        "000000",
        "198.51.100.85",
        thirdRolling.reservation.token
      ),
      429,
      "fresh challenges must not reset the recipient guess budget"
    );
    assert.equal(
      await codeLogin(
        rollingEmail,
        "333333",
        "198.51.100.85",
        thirdRolling.reservation.token
      ),
      200
    );

    let eventLoopTicked = false;
    setImmediate(() => { eventLoopTicked = true; });
    await Promise.all(
      Array.from({ length: 4 }, () =>
        verifyPasswordAsync("wrong-password", hashPassword("known-password"))
      )
    );
    assert.equal(
      eventLoopTicked,
      true,
      "password verification must yield to the event loop"
    );

    console.log("auth login rate-limit checks passed");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await closeRedis();
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
