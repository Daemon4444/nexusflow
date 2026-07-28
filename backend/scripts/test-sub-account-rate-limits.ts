import assert from "node:assert/strict";
import { closeDb, db } from "../src/db/client";
import { setUserRateLimit } from "../src/data/ratelimits";
import {
  reserveAccountQpm,
  reserveAccountTpm,
} from "../src/services/account-rate-limiter";

if (process.env.USE_PG_MEM !== "true") {
  throw new Error("test requires USE_PG_MEM=true");
}

async function main(): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, status, created_at, updated_at
     ) VALUES (?, ?, ?, 0, 0, 'active', ?, ?)`,
    ["aggregate-owner", "aggregate-owner@nexusflow.test", "owner", now, now]
  );
  for (const id of ["aggregate-child-a", "aggregate-child-b"]) {
    await db.execute(
      `INSERT INTO users (
         id, nickname, balance, credit_balance, parent_user_id, username,
         status, created_at, updated_at
       ) VALUES (?, ?, 0, 0, ?, ?, 'active', ?, ?)`,
      [id, id, "aggregate-owner", id, now, now]
    );
  }

  await setUserRateLimit("aggregate-owner", "aggregate-test-model", 1, 10);
  await setUserRateLimit("aggregate-child-a", "aggregate-test-model", 10, 100);
  await setUserRateLimit("aggregate-child-b", "aggregate-test-model", 10, 100);

  assert.equal(
    (await reserveAccountQpm({
      userId: "aggregate-child-a",
      parentUserId: "aggregate-owner",
      modelId: "aggregate-test-model",
    })).allowed,
    true
  );
  const secondChildQpm = await reserveAccountQpm({
    userId: "aggregate-child-b",
    parentUserId: "aggregate-owner",
    modelId: "aggregate-test-model",
  });
  assert.equal(secondChildQpm.allowed, false);
  if (!secondChildQpm.allowed) assert.equal(secondChildQpm.kind, "owner");

  assert.deepEqual(
    await reserveAccountTpm({
      userId: "aggregate-child-a",
      parentUserId: "aggregate-owner",
      modelId: "aggregate-test-model",
      estimatedTokens: 6,
    }),
    { allowed: true }
  );
  const overOwnerTpm = await reserveAccountTpm({
    userId: "aggregate-child-b",
    parentUserId: "aggregate-owner",
    modelId: "aggregate-test-model",
    estimatedTokens: 6,
  });
  assert.equal(overOwnerTpm.allowed, false);
  if (!overOwnerTpm.allowed) assert.equal(overOwnerTpm.kind, "owner");

  // The rejected child's individual reservation was reconciled, so a smaller
  // request can consume the exact four tokens remaining in the owner bucket.
  assert.deepEqual(
    await reserveAccountTpm({
      userId: "aggregate-child-b",
      parentUserId: "aggregate-owner",
      modelId: "aggregate-test-model",
      estimatedTokens: 4,
    }),
    { allowed: true }
  );

  console.log("sub-account aggregate QPM/TPM checks passed");
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
