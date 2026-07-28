import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closeDb, db } from "../src/db/client";
import { createSubAccount } from "../src/data/sub-accounts";

if (process.env.USE_PG_MEM === "true") {
  throw new Error("this test requires real PostgreSQL");
}

async function main(): Promise<void> {
  process.env.SUB_ACCOUNT_LIMIT = "3";
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  const ownerId = `sub-limit-owner-${suffix}`;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, password_hash,
       status, created_at, updated_at
     ) VALUES (?, ?, ?, 0, 0, NULL, 'active', ?, ?)`,
    [ownerId, `${ownerId}@nexusflow.test`, ownerId, now, now]
  );

  try {
    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        createSubAccount({
          ownerId,
          username: `sub_${suffix}_${index}`,
          password: "ConcurrencySafe#123",
        })
      )
    );
    assert.equal(
      attempts.filter((result) => "user" in result).length,
      3,
      "the owner row lock must prevent concurrent limit bypass"
    );
    const row = await db.queryOne<{ cnt: string | number }>(
      "SELECT COUNT(*) AS cnt FROM users WHERE parent_user_id = ? AND status != 'deleted'",
      [ownerId]
    );
    assert.equal(Number(row?.cnt || 0), 3);
    console.log("PostgreSQL sub-account concurrency limit checks passed");
  } finally {
    await db.execute("DELETE FROM api_keys WHERE user_id IN (SELECT id FROM users WHERE parent_user_id = ?)", [ownerId]);
    await db.execute("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE parent_user_id = ?)", [ownerId]);
    await db.execute("DELETE FROM users WHERE parent_user_id = ?", [ownerId]);
    await db.execute("DELETE FROM users WHERE id = ?", [ownerId]);
  }
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
