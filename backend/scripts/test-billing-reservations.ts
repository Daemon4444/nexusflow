import assert from "node:assert/strict";
import { closeDb, db } from "../src/db/client";
import { adminAdjustCredit, reserveBalance, reserveBalanceWithReason, settleReservation } from "../src/data/billing";
import {
  normalizeDashScopeVideoResolution,
  normalizeDashScopeVideoSize,
  VideoParameterError,
} from "../src/utils/video-parameters";

async function main(): Promise<void> {
  // pg-mem does not implement PostgreSQL row-lock scheduling, so this test
  // verifies the availability calculation sequentially. The same code path is
  // exercised concurrently against real PostgreSQL in the deployment smoke.
  const attempts = [
    await reserveBalance("local-user-1", 20, "availability-a"),
    await reserveBalance("local-user-1", 20, "availability-b"),
  ];
  assert.equal(attempts.filter(Boolean).length, 1, "only one hold may fit");

  const reservation = attempts.find(Boolean)!;
  const before = await db.queryOne<{ balance: number }>(
    "SELECT balance FROM users WHERE id = ?",
    ["local-user-1"]
  );
  assert.equal(Number(before?.balance), 25.75, "a hold must not change displayed balance");

  const first = await settleReservation(reservation.id, 7.5, "integration settlement");
  assert.ok(first, "first settlement should create a transaction");
  const second = await settleReservation(reservation.id, 7.5, "integration settlement");
  assert.equal(second?.id, first.id, "repeat settlement must return the original transaction");

  const after = await db.queryOne<{ balance: number }>(
    "SELECT balance FROM users WHERE id = ?",
    ["local-user-1"]
  );
  assert.equal(Number(after?.balance), 18.25, "settlement should deduct exactly once");

  const txCount = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM transactions WHERE ref_id = ?",
    [`reservation:${reservation.id}`]
  );
  assert.equal(Number(txCount?.count), 1, "settlement must have one transaction");

  const active = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM billing_reservations WHERE status = 'active'"
  );
  assert.equal(Number(active?.count), 0, "no hold should remain active");

  await db.execute("UPDATE users SET balance = 2 WHERE id = ?", ["local-user-1"]);
  const creditAdjustment = await adminAdjustCredit({
    userId: "local-user-1",
    amountDelta: 10,
    description: "integration credit grant",
    actorId: "test-admin",
  });
  assert.ok(creditAdjustment, "admin should be able to grant credit");
  assert.equal(Number(creditAdjustment.credit_after), 10);

  const creditReservation = await reserveBalance("local-user-1", 8, "credit-availability");
  assert.ok(creditReservation, "cash plus credit should satisfy reservation");
  const creditSettlement = await settleReservation(creditReservation.id, 8, "credit settlement");
  assert.ok(creditSettlement);
  assert.equal(Number(creditSettlement.balance_after), 0, "cash must be consumed first");
  assert.equal(Number(creditSettlement.credit_amount), 6, "only the remainder should use credit");
  assert.equal(Number(creditSettlement.credit_after), 4, "credit balance should settle exactly once");

  const creditOwner = await db.queryOne<{ balance: number; credit_balance: number }>(
    "SELECT balance, credit_balance FROM users WHERE id = ?",
    ["local-user-1"]
  );
  assert.equal(Number(creditOwner?.balance), 0);
  assert.equal(Number(creditOwner?.credit_balance), 4);

  await db.execute(
    `INSERT INTO users
      (id, phone, email, nickname, balance, password_hash, parent_user_id, username, status,
       quota_limit, quota_used, quota_period, quota_reset_at, created_at, updated_at)
     VALUES (?, NULL, NULL, ?, 0, NULL, ?, ?, 'active', ?, 0, 'monthly', NOW(), NOW(), NOW())`,
    ["local-sub-quota", "额度测试子账号", "local-user-1", "local_sub_quota", 0.001]
  );
  const quotaFailure = await reserveBalanceWithReason(
    "local-sub-quota",
    0.01,
    "sub-quota-contract"
  );
  assert.equal(quotaFailure.reservation, null);
  assert.equal(quotaFailure.reason, "sub_account_quota_exceeded");

  await db.execute("UPDATE users SET status = 'suspended' WHERE id = ?", ["local-sub-quota"]);
  const suspendedFailure = await reserveBalanceWithReason(
    "local-sub-quota",
    0.0001,
    "sub-suspended-contract"
  );
  assert.equal(suspendedFailure.reservation, null);
  assert.equal(suspendedFailure.reason, "sub_account_suspended");

  assert.equal(normalizeDashScopeVideoSize({ size: "1280x720" }), "1280*720");
  assert.equal(
    normalizeDashScopeVideoSize({ resolution: "1080p", ratio: "9:16" }),
    "1080*1920"
  );
  assert.equal(normalizeDashScopeVideoResolution("1080p"), "1080P");
  assert.throws(
    () => normalizeDashScopeVideoSize({ resolution: "720P", ratio: "4:3" }),
    VideoParameterError
  );

  console.log("billing reservations, failure codes, and video parameter contracts: ok");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
